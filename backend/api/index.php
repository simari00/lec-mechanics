<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

// Strict session cookie settings (set before the session starts).
ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', // http://127.0.0.1 local dev stays working
    'httponly' => true, // session cookie is invisible to JavaScript
    'samesite' => 'Strict', // browser never sends it on cross-site requests
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return $_POST;
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(['error' => 'Request body must be valid JSON.'], 400);
    }

    return $data;
}

function requireLogin(): void
{
    if (!isset($_SESSION['user'])) {
        respond(['error' => 'Authentication required.'], 401);
    }
}

/**
 * Ensure a CSRF token exists for this session and return it.
 * The token is delivered to the client via auth&action=me and the login
 * response; the client must echo it back in the X-CSRF-Token header.
 */
function csrfToken(): string
{
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** Rotate the token (used after login / session id regeneration). */
function rotateCsrfToken(): string
{
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf_token'];
}

/**
 * CSRF guard for state-changing requests made with an authenticated session.
 * Unauthenticated endpoints (login, setup, forgot-password, public service
 * requests) are exempt here — they have no session to forge and are protected
 * by other means (lockout, one-time setup, security question).
 */
function verifyCsrf(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        return;
    }
    if (empty($_SESSION['user'])) {
        return;
    }
    // The public enquiry form is anonymous — never tied to the admin
    // session — so an admin browsing the site can still use it.
    if (($_GET['resource'] ?? '') === 'service_requests' && ($_SERVER['REQUEST_METHOD'] === 'POST') && empty($_GET['id'])) {
        return;
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || $token === '' || !hash_equals(csrfToken(), $token)) {
        respond(['error' => 'Invalid or missing CSRF token. Refresh the page and try again.'], 403);
    }
}

verifyCsrf();

const MAX_USERS = 2;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Issue a unique public tracking code (e.g. LEC-4F7A2B) for a service request.
 * Customers use it on the Track page to see the admin's approval status.
 */
function generateTrackingCode(PDO $database): string
{
    do {
        $code = 'LEC-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $check = $database->prepare('SELECT COUNT(*) FROM service_requests WHERE tracking_code = ?');
        $check->execute([$code]);
    } while ((int) $check->fetchColumn() > 0);
    return $code;
}

/**
 * Configurable admin-account cap. Read from (in order of precedence):
 *   1. The MAX_ADMINS environment variable
 *   2. backend/config/app.ini  ->  [app] max_admins = 3
 * Defaults to 2. Accepted range: 1-10.
 */
function maxAdmins(): int
{
    $raw = getenv('MAX_ADMINS');
    if ($raw === false || $raw === '') {
        $iniPath = __DIR__ . '/../config/app.ini';
        if (is_file($iniPath)) {
            $ini = parse_ini_file($iniPath, false, INI_SCANNER_RAW);
            if (is_array($ini) && isset($ini['max_admins'])) {
                $raw = (string) $ini['max_admins'];
            }
        }
    }
    $value = filter_var($raw !== false && $raw !== '' ? $raw : MAX_USERS, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]);
    return $value === false ? MAX_USERS : $value;
}

/**
 * Enforce password sensitivity rules.
 * At least 8 characters with upper case, lower case, a digit, and no leading/trailing spaces.
 */
function validatePassword(string $password): ?string
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters long.';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least one uppercase letter.';
    }
    if (!preg_match('/[a-z]/', $password)) {
        return 'Password must contain at least one lowercase letter.';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must contain at least one number.';
    }
    if (trim($password) !== $password) {
        return 'Password cannot start or end with spaces.';
    }
    return null;
}

function normalizeAnswer(string $answer): string
{
    return strtolower(preg_replace('/\s+/', ' ', trim($answer)));
}

function fetchUserByEmail(PDO $database, string $email): ?array
{
    $statement = $database->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $statement->execute([strtolower(trim($email))]);
    return $statement->fetch() ?: null;
}

/**
 * Return the lockout record for an email, creating a blank one when missing.
 */
function loginAttemptRow(PDO $database, string $email): array
{
    $statement = $database->prepare('SELECT * FROM login_attempts WHERE email = ?');
    $statement->execute([$email]);
    $row = $statement->fetch();
    if ($row === false) {
        $database->prepare('INSERT INTO login_attempts (email) VALUES (?)')->execute([$email]);
        return ['email' => $email, 'failed_attempts' => 0, 'last_failed_at' => null, 'locked_until' => null];
    }
    return $row;
}

/**
 * Seconds remaining on an active lockout, or 0 when not locked.
 */
function lockoutSecondsRemaining(array $row): int
{
    if ($row['locked_until'] === null) {
        return 0;
    }
    return max(0, strtotime($row['locked_until'] . ' UTC') - time());
}

/**
 * Record a failed login for the email. Locks the account when the
 * attempt limit is reached. Unknown emails are also counted so the
 * endpoint cannot be used to probe which accounts exist.
 */
function registerFailedLogin(PDO $database, string $email): array
{
    $row = loginAttemptRow($database, $email);
    $attempts = (int) $row['failed_attempts'] + 1;
    $lockedUntil = $row['locked_until'];
    if ($attempts >= MAX_LOGIN_ATTEMPTS) {
        $lockedUntil = gmdate('Y-m-d H:i:s', time() + LOCKOUT_MINUTES * 60);
        $attempts = 0; // counter restarts after the lockout expires
    }
    $database->prepare('UPDATE login_attempts SET failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE email = ?')
        ->execute([$attempts, gmdate('Y-m-d H:i:s'), $lockedUntil, $email]);
    return ['failed_attempts' => $attempts, 'locked_until' => $lockedUntil];
}

/**
 * Record who created, edited, or deleted a record.
 */
function logActivity(PDO $database, string $action, string $resource, ?int $recordId, ?string $summary): void
{
    try {
        $user = $_SESSION['user'] ?? null;
        $statement = $database->prepare(
            'INSERT INTO activity_log (user_id, user_name, action, resource, record_id, summary) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user['id'] ?? null,
            $user['full_name'] ?? 'Guest',
            $action,
            $resource,
            $recordId,
            $summary,
        ]);
    } catch (Throwable) {
        // Logging must never break the actual operation.
    }
}

/**
 * Build a short human-readable label for a record so the log is meaningful.
 * Falls back to the database row when the request body lacks identifying fields.
 */
function describeRecord(string $resource, array $body, ?PDO $database = null, ?int $recordId = null): ?string
{
    $parts = array_values(array_filter([
        $body['job_number'] ?? $body['invoice_number'] ?? null,
        isset($body['first_name'], $body['last_name']) ? trim($body['first_name'] . ' ' . $body['last_name']) : null,
        $body['registration_number'] ?? null,
        $body['part_name'] ?? null,
        $body['part_number'] ?? null,
        $body['staff_id'] ?? null,
        $body['full_name'] ?? null,
        $body['payment_method'] ?? null,
    ], static fn ($v) => $v !== null && $v !== ''));

    if ($parts !== []) {
        return implode(' — ', array_slice($parts, 0, 2));
    }

    if ($database !== null && $recordId !== null) {
        try {
            $statement = $database->prepare('SELECT * FROM ' . resourceDefinitions()[$resource]['table'] . ' WHERE id = ?');
            $statement->execute([$recordId]);
            $record = $statement->fetch() ?: [];
            $parts = array_values(array_filter([
                $record['job_number'] ?? $record['invoice_number'] ?? null,
                isset($record['first_name'], $record['last_name']) ? trim($record['first_name'] . ' ' . $record['last_name']) : null,
                $record['registration_number'] ?? null,
                $record['part_name'] ?? null,
                $record['staff_id'] ?? null,
            ], static fn ($v) => $v !== null && $v !== ''));
            if ($parts !== []) {
                return implode(' — ', array_slice($parts, 0, 2));
            }
        } catch (Throwable) {
            // fall through
        }
    }

    return null;
}

function cleanData(array $data, array $allowed): array
{
    $clean = [];
    foreach ($allowed as $field) {
        if (array_key_exists($field, $data)) {
            $clean[$field] = $data[$field] === '' ? null : $data[$field];
        }
    }
    return $clean;
}

function resourceDefinitions(): array
{
    return [
        'customers' => [
            'table' => 'customers',
            'fields' => ['first_name', 'last_name', 'phone', 'email', 'national_id', 'customer_type', 'address', 'is_active'],
            'required' => ['first_name', 'last_name', 'phone'],
        ],
        'vehicles' => [
            'table' => 'vehicles',
            'fields' => ['customer_id', 'registration_number', 'make', 'model', 'vehicle_year', 'colour', 'vin', 'current_mileage', 'engine_type', 'transmission', 'notes', 'is_active'],
            'required' => ['customer_id', 'registration_number', 'make', 'model'],
        ],
        'mechanics' => [
            'table' => 'mechanics',
            'fields' => ['first_name', 'last_name', 'phone', 'email', 'staff_id', 'specialization', 'years_experience', 'status'],
            'required' => ['first_name', 'last_name', 'phone', 'staff_id', 'specialization'],
        ],
        'job_cards' => [
            'table' => 'job_cards',
            'fields' => ['job_number', 'customer_id', 'vehicle_id', 'mechanic_id', 'job_date', 'estimated_completion_date', 'priority', 'mileage', 'complaint', 'diagnosis', 'work_required', 'work_completed', 'status', 'estimated_cost', 'notes', 'created_by'],
            'required' => ['job_number', 'customer_id', 'vehicle_id', 'job_date', 'complaint'],
        ],
        'spare_parts' => [
            'table' => 'spare_parts',
            'fields' => ['part_name', 'part_number', 'category', 'supplier', 'quantity_in_stock', 'minimum_stock_level', 'buying_price', 'selling_price', 'storage_location', 'description', 'is_active'],
            'required' => ['part_name', 'part_number', 'category'],
        ],
        'invoices' => [
            'table' => 'invoices',
            'fields' => ['invoice_number', 'customer_id', 'vehicle_id', 'job_card_id', 'invoice_date', 'due_date', 'service_charges', 'parts_charges', 'discount', 'tax', 'status', 'notes'],
            'required' => ['invoice_number', 'customer_id', 'invoice_date'],
        ],
        'payments' => [
            'table' => 'payments',
            'fields' => ['invoice_id', 'payment_date', 'amount', 'payment_method', 'reference_number', 'notes'],
            'required' => ['invoice_id', 'payment_date', 'amount', 'payment_method'],
        ],
        'service_requests' => [
            'table' => 'service_requests',
            'fields' => ['request_type', 'full_name', 'phone', 'email', 'registration_number', 'service_name', 'preferred_date', 'message', 'status'],
            'required' => ['full_name', 'phone', 'message'],
        ],
    ];
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $resource = strtolower((string) ($_GET['resource'] ?? ''));
    $action = strtolower((string) ($_GET['action'] ?? ''));
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: null;

    if ($resource === 'auth') {

        // ---------- First admin (setup): only while zero users exist ----------
        if ($action === 'setup' && $method === 'POST') {
            $body = requestBody();
            $passwordError = validatePassword((string) ($body['password'] ?? ''));
            if (!filter_var($body['email'] ?? null, FILTER_VALIDATE_EMAIL) || $passwordError !== null || trim((string) ($body['full_name'] ?? '')) === '') {
                respond(['error' => $passwordError ?? 'full_name and a valid email are required.'], 422);
            }
            $securityQuestion = trim((string) ($body['security_question'] ?? ''));
            $securityAnswer = (string) ($body['security_answer'] ?? '');
            if ($securityQuestion === '' || trim($securityAnswer) === '') {
                respond(['error' => 'A security question and answer are required.'], 422);
            }
            $database = db();
            if ((int) $database->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
                respond(['error' => 'Initial setup has already been completed.'], 409);
            }
            $statement = $database->prepare('INSERT INTO users (full_name, email, password_hash, role, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?, ?)');
            $statement->execute([
                trim($body['full_name']),
                strtolower(trim($body['email'])),
                password_hash($body['password'], PASSWORD_DEFAULT),
                'admin',
                $securityQuestion,
                password_hash(normalizeAnswer($securityAnswer), PASSWORD_DEFAULT),
            ]);
            respond(['success' => true, 'message' => 'Admin account created.'], 201);
        }

        // ---------- Create the second (and final) admin; requires an active session ----------
        if ($action === 'create-admin' && $method === 'POST') {
            requireLogin();
            $body = requestBody();
            $passwordError = validatePassword((string) ($body['password'] ?? ''));
            if (!filter_var($body['email'] ?? null, FILTER_VALIDATE_EMAIL) || $passwordError !== null || trim((string) ($body['full_name'] ?? '')) === '') {
                respond(['error' => $passwordError ?? 'full_name and a valid email are required.'], 422);
            }
            $securityQuestion = trim((string) ($body['security_question'] ?? ''));
            $securityAnswer = (string) ($body['security_answer'] ?? '');
            if ($securityQuestion === '' || trim($securityAnswer) === '') {
                respond(['error' => 'A security question and answer are required.'], 422);
            }
            $database = db();
            if ((int) $database->query('SELECT COUNT(*) FROM users')->fetchColumn() >= maxAdmins()) {
                respond(['error' => 'The maximum of ' . maxAdmins() . ' admin accounts already exists.'], 409);
            }
            if (fetchUserByEmail($database, (string) $body['email']) !== null) {
                respond(['error' => 'An account with this email already exists.'], 409);
            }
            $statement = $database->prepare('INSERT INTO users (full_name, email, password_hash, role, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?, ?)');
            $statement->execute([
                trim($body['full_name']),
                strtolower(trim($body['email'])),
                password_hash($body['password'], PASSWORD_DEFAULT),
                'admin',
                $securityQuestion,
                password_hash(normalizeAnswer($securityAnswer), PASSWORD_DEFAULT),
            ]);
            respond(['success' => true, 'message' => 'Admin account created.'], 201);
        }

        // ---------- Set or replace your own security question (requires session) ----------
        if ($action === 'set-security-question' && $method === 'POST') {
            requireLogin();
            $body = requestBody();
            $securityQuestion = trim((string) ($body['security_question'] ?? ''));
            $securityAnswer = (string) ($body['security_answer'] ?? '');
            if ($securityQuestion === '' || trim($securityAnswer) === '') {
                respond(['error' => 'A security question and answer are required.'], 422);
            }
            $database = db();
            $statement = $database->prepare('UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?');
            $statement->execute([
                $securityQuestion,
                password_hash(normalizeAnswer($securityAnswer), PASSWORD_DEFAULT),
                $_SESSION['user']['id'],
            ]);
            respond(['success' => true, 'message' => 'Security question updated.']);
        }

        // ---------- Forgot password: step 1, look up the question ----------
        if ($action === 'forgot-question' && $method === 'POST') {
            $body = requestBody();
            $database = db();
            $user = fetchUserByEmail($database, (string) ($body['email'] ?? ''));
            if ($user === null) {
                respond(['error' => 'No admin account uses that email address.'], 404);
            }
            if ($user['security_question'] === null) {
                respond(['error' => 'This account has no security question set. Another admin must update your password.'], 409);
            }
            respond(['success' => true, 'security_question' => $user['security_question']]);
        }

        // ---------- Forgot password: step 2, verify answer and reset password ----------
        if ($action === 'forgot-reset' && $method === 'POST') {
            $body = requestBody();
            $database = db();
            $user = fetchUserByEmail($database, (string) ($body['email'] ?? ''));
            if ($user === null || $user['security_answer_hash'] === null) {
                respond(['error' => 'Password reset is not available for this account.'], 404);
            }
            if (!password_verify(normalizeAnswer((string) ($body['security_answer'] ?? '')), $user['security_answer_hash'])) {
                usleep(500_000);
                respond(['error' => 'Incorrect answer to the security question.'], 401);
            }
            $passwordError = validatePassword((string) ($body['new_password'] ?? ''));
            if ($passwordError !== null) {
                respond(['error' => $passwordError], 422);
            }
            $statement = $database->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
            $statement->execute([password_hash((string) $body['new_password'], PASSWORD_DEFAULT), $user['id']]);
            respond(['success' => true, 'message' => 'Password has been reset. You can now sign in.']);
        }

        // ---------- Change your own password (requires session) ----------
        if ($action === 'change-password' && $method === 'POST') {
            requireLogin();
            $body = requestBody();
            $database = db();
            $statement = $database->prepare('SELECT password_hash FROM users WHERE id = ?');
            $statement->execute([$_SESSION['user']['id']]);
            $row = $statement->fetch();
            if (!$row || !password_verify((string) ($body['current_password'] ?? ''), $row['password_hash'])) {
                respond(['error' => 'Current password is incorrect.'], 401);
            }
            $passwordError = validatePassword((string) ($body['new_password'] ?? ''));
            if ($passwordError !== null) {
                respond(['error' => $passwordError], 422);
            }
            $statement = $database->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
            $statement->execute([password_hash((string) $body['new_password'], PASSWORD_DEFAULT), $_SESSION['user']['id']]);
            respond(['success' => true, 'message' => 'Password changed.']);
        }

        if ($action === 'login' && $method === 'POST') {
            $body = requestBody();
            $database = db();
            $email = strtolower(trim((string) ($body['email'] ?? '')));

            // Lockout check: block sign-in while the cooldown is active.
            $attemptRow = loginAttemptRow($database, $email);
            $remaining = lockoutSecondsRemaining($attemptRow);
            if ($remaining > 0) {
                respond([
                    'error' => sprintf('Too many failed attempts. Try again in %d minute(s).', (int) ceil($remaining / 60)),
                    'locked' => true,
                    'retry_after_seconds' => $remaining,
                ], 429);
            }

            $statement = $database->prepare('SELECT id, full_name, email, password_hash, role FROM users WHERE email = ? AND is_active = TRUE LIMIT 1');
            $statement->execute([$email]);
            $user = $statement->fetch();
            if (!$user || !password_verify((string) ($body['password'] ?? ''), $user['password_hash'])) {
                $result = registerFailedLogin($database, $email);
                if ($result['locked_until'] !== null && $result['failed_attempts'] === 0) {
                    respond(['error' => 'Too many failed attempts. The account is locked for ' . LOCKOUT_MINUTES . ' minutes.'], 429);
                }
                $attemptsLeft = MAX_LOGIN_ATTEMPTS - (int) $result['failed_attempts'];
                respond(['error' => 'Invalid email or password. ' . $attemptsLeft . ' attempt(s) remaining.'], 401);
            }

            // Successful login clears the failure counter.
            $database->prepare('DELETE FROM login_attempts WHERE email = ?')->execute([$email]);
            unset($user['password_hash']);
            session_regenerate_id(true);
            $_SESSION['user'] = $user;
            respond(['success' => true, 'user' => $user, 'csrf_token' => rotateCsrfToken()]);
        }

        if ($action === 'logout' && $method === 'POST') {
            $_SESSION = [];
            session_destroy();
            respond(['success' => true]);
        }

        // ---------- List admin accounts (no secrets) for the settings panel ----------
        if ($action === 'list-users' && $method === 'GET') {
            requireLogin();
            $database = db();
            $rows = $database->query(
                'SELECT id, full_name, email, role, security_question IS NOT NULL AS has_security_question, is_active, created_at FROM users ORDER BY id ASC'
            )->fetchAll();
            respond([
                'data' => $rows,
                'max_admins' => maxAdmins(),
                'current_user_id' => (int) $_SESSION['user']['id'],
            ]);
        }

        if ($action === 'me' && $method === 'GET') {
            $database = isset($_SESSION['user']) ? db() : null;
            $securityQuestion = null;
            if ($database !== null) {
                $statement = $database->prepare('SELECT security_question FROM users WHERE id = ?');
                $statement->execute([$_SESSION['user']['id']]);
                $securityQuestion = $statement->fetchColumn() ?: null;
            }
            respond([
                'authenticated' => isset($_SESSION['user']),
                'user' => $_SESSION['user'] ?? null,
                'security_question' => $securityQuestion,
                'user_count' => $database ? (int) $database->query('SELECT COUNT(*) FROM users')->fetchColumn() : 0,
                'max_admins' => maxAdmins(),
                'csrf_token' => isset($_SESSION['user']) ? csrfToken() : null,
            ]);
        }

        respond(['error' => 'Unknown auth action.'], 404);
    }

    if ($resource === 'dashboard' && $method === 'GET') {
        requireLogin();
        $database = db();
        $summary = $database->query('SELECT * FROM dashboard_summary')->fetch() ?: [];
        $lowStock = $database->query('SELECT * FROM low_stock_parts ORDER BY quantity_in_stock ASC')->fetchAll();
        $recentJobs = $database->query("SELECT j.id, j.job_number, j.status, j.job_date, c.first_name || ' ' || c.last_name AS customer_name, v.registration_number FROM job_cards j JOIN customers c ON c.id = j.customer_id JOIN vehicles v ON v.id = j.vehicle_id ORDER BY j.created_at DESC LIMIT 10")->fetchAll();
        $activity = $database->query('SELECT action, resource, record_id, user_name, summary, created_at FROM activity_log ORDER BY id DESC LIMIT 12')->fetchAll();
        respond(['summary' => $summary, 'low_stock_parts' => $lowStock, 'recent_jobs' => $recentJobs, 'activity' => $activity]);
    }

    if ($resource === 'activity_log' && $method === 'GET') {
        requireLogin();
        $database = db();
        $limit = min(max((int) ($_GET['limit'] ?? 100), 1), 500);
        $statement = $database->prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?');
        $statement->execute([$limit]);
        respond(['data' => $statement->fetchAll()]);
    }

    if ($resource === 'reports' && $method === 'GET') {
        requireLogin();
        $database = db();

        // Optional date window (inclusive), applied to dated business records.
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;
        $validFrom = is_string($from) && preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $from) ? $from : null;
        $validTo = is_string($to) && preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $to) ? $to . ' 23:59:59' : null;

        $revenueWhere = '';
        $revenueParams = [];
        if ($validFrom !== null) {
            $revenueWhere .= ' AND p.payment_date >= ?';
            $revenueParams[] = $validFrom;
        }
        if ($validTo !== null) {
            $revenueWhere .= ' AND p.payment_date <= ?';
            $revenueParams[] = $validTo;
        }

        // Revenue = actual payments received in the window.
        $revenueStatement = $database->prepare('SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE 1=1' . $revenueWhere);
        $revenueStatement->execute($revenueParams);
        $revenue = (float) $revenueStatement->fetchColumn();

        // Monthly revenue for the last 12 months (invoice-based accrual).
        $monthly = $database->query("
            SELECT strftime('%Y-%m', i.invoice_date) AS month,
                   COALESCE(SUM(i.total_amount), 0) AS total
            FROM invoices i
            WHERE i.status != 'Void' AND i.invoice_date >= date('now', '-11 months', 'start of month')
            GROUP BY month ORDER BY month ASC
        ")->fetchAll();

        // Job status distribution.
        $jobStatus = [];
        foreach ($database->query('SELECT status, COUNT(*) AS n FROM job_cards GROUP BY status') as $row) {
            $jobStatus[$row['status']] = (int) $row['n'];
        }

        // Invoice/payment summary (payments joined for paid amounts per invoice).
        $invoiceStats = $database->query("
            SELECT i.status,
                   COUNT(*) AS n,
                   COALESCE(SUM(i.total_amount), 0) AS total,
                   COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id IN (SELECT id FROM invoices i2 WHERE i2.status = i.status)), 0) AS paid
            FROM invoices i WHERE i.status != 'Void' GROUP BY i.status
        ")->fetchAll();

        $paidInvoices = 0;
        $partialInvoices = 0;
        $unpaidInvoices = 0;
        $invoicedTotal = 0.0;
        $paidTotal = 0.0;
        foreach ($invoiceStats as $stat) {
            $invoicedTotal += (float) $stat['total'];
            if ($stat['status'] === 'Paid') {
                $paidInvoices = (int) $stat['n'];
                $paidTotal += (float) $stat['paid'];
            } elseif ($stat['status'] === 'Partially Paid') {
                $partialInvoices = (int) $stat['n'];
            } else {
                $unpaidInvoices += (int) $stat['n'];
            }
        }
        $outstanding = max($invoicedTotal - array_sum(array_map(static fn ($s) => (float) $s['paid'], $invoiceStats)), 0);

        // Inventory summary.
        $inventory = $database->query("
            SELECT COUNT(*) AS total_parts,
                   COALESCE(SUM(quantity_in_stock), 0) AS stock_qty,
                   COALESCE(SUM(CASE WHEN quantity_in_stock <= minimum_stock_level THEN 1 ELSE 0 END), 0) AS low_stock,
                   COALESCE(SUM(quantity_in_stock * buying_price), 0) AS stock_value
            FROM spare_parts
        ")->fetch();

        // Headline counts.
        $vehicles = (int) $database->query('SELECT COUNT(*) FROM vehicles')->fetchColumn();
        $jobsCompleted = (int) $database->query("SELECT COUNT(*) FROM job_cards WHERE status = 'Completed'")->fetchColumn();

        // Payment method breakdown.
        $paymentMethods = $database->query(
            'SELECT payment_method, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments GROUP BY payment_method ORDER BY total DESC'
        )->fetchAll();

        respond([
            'summary' => [
                'revenue' => $revenue,
                'invoices' => (int) $database->query("SELECT COUNT(*) FROM invoices WHERE status != 'Void'")->fetchColumn(),
                'vehicles' => $vehicles,
                'jobs_completed' => $jobsCompleted,
            ],
            'monthly_revenue' => $monthly,
            'job_status' => $jobStatus,
            'payments' => [
                'paid_invoices' => $paidInvoices,
                'partially_paid' => $partialInvoices,
                'unpaid_invoices' => $unpaidInvoices,
                'invoiced_total' => round($invoicedTotal, 2),
                'paid_total' => round(array_sum(array_map(static fn ($s) => (float) $s['paid'], $invoiceStats)), 2),
                'outstanding' => round($outstanding, 2),
                'methods' => $paymentMethods,
            ],
            'inventory' => [
                'total_parts' => (int) $inventory['total_parts'],
                'stock_qty' => (int) $inventory['stock_qty'],
                'low_stock' => (int) $inventory['low_stock'],
                'stock_value' => round((float) $inventory['stock_value'], 2),
            ],
        ]);
    }

    /* ===================== gallery images (file uploads) ===================== */

    if ($resource === 'gallery_images') {
        // Anyone may view the gallery (the public website shows it);
        // uploading, editing and deleting require an admin session.
        if ($method !== 'GET') {
            requireLogin();
        }
        $database = db();
        $uploadDir = __DIR__ . '/../../images/gallery/uploaded';

        // Upload: multipart/form-data POST with one or more "images" files.
        if ($method === 'POST' && $id === null) {
            if (empty($_FILES['images'])) {
                respond(['error' => 'No file uploaded. Attach image files in the "images" field.'], 422);
            }
            if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true)) {
                respond(['error' => 'Could not create the upload directory.'], 500);
            }

            $allowedMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
            $maxBytes = 5 * 1024 * 1024; // 5 MB per image
            $files = $_FILES['images'];
            $count = is_array($files['name']) ? count($files['name']) : 1;
            $saved = [];
            $errors = [];

            for ($i = 0; $i < $count; $i++) {
                $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
                $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
                $err = is_array($files['error']) ? $files['error'][$i] : $files['error'];
                $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];

                if ($err !== UPLOAD_ERR_OK) {
                    $errors[] = $name . ': upload error ' . $err;
                    continue;
                }
                if ($size > $maxBytes) {
                    $errors[] = $name . ': larger than 5 MB';
                    continue;
                }
                // Trust the real file content, not the client-supplied name/type.
                $info = @getimagesize($tmp);
                if ($info === false || !isset($allowedMime[$info['mime']])) {
                    $errors[] = $name . ': not a JPEG, PNG, WebP or GIF image';
                    continue;
                }

                $ext = $allowedMime[$info['mime']];
                do {
                    $stored = 'img_' . bin2hex(random_bytes(6)) . '.' . $ext;
                } while (file_exists($uploadDir . '/' . $stored));
                if (!move_uploaded_file($tmp, $uploadDir . '/' . $stored)) {
                    $errors[] = $name . ': could not be saved';
                    continue;
                }

                $title = trim((string) ($_POST['title'] ?? '')) ?: preg_replace('/\.[^.]+$/', '', pathinfo($name, PATHINFO_FILENAME));
                $insert = $database->prepare(
                    'INSERT INTO gallery_images (filename, title, caption, uploaded_by) VALUES (?, ?, ?, ?)'
                );
                $insert->execute([
                    $stored,
                    substr($title, 0, 120),
                    substr(trim((string) ($_POST['caption'] ?? '')), 0, 300),
                    $_SESSION['user']['full_name'] ?? 'admin',
                ]);
                logActivity($database, 'create', 'gallery_images', (int) $database->lastInsertId(), $title);
                $saved[] = ['id' => (int) $database->lastInsertId(), 'filename' => $stored, 'title' => $title];
            }

            respond(['success' => true, 'saved' => $saved, 'errors' => $errors], $saved ? 201 : 422);
        }

        // Update title/caption.
        if ($method === 'PATCH' && $id) {
            $body = requestBody();
            $update = $database->prepare('UPDATE gallery_images SET title = ?, caption = ? WHERE id = ?');
            $update->execute([
                substr(trim((string) ($body['title'] ?? '')), 0, 120),
                substr(trim((string) ($body['caption'] ?? '')), 0, 300),
                $id,
            ]);
            logActivity($database, 'update', 'gallery_images', (int) $id, (string) ($body['title'] ?? ('#' . $id)));
            respond(['success' => true, 'updated' => $update->rowCount()]);
        }

        // Delete: remove the DB row AND the file from disk.
        if ($method === 'DELETE' && $id) {
            $statement = $database->prepare('SELECT * FROM gallery_images WHERE id = ?');
            $statement->execute([$id]);
            $image = $statement->fetch();
            if (!$image) {
                respond(['error' => 'Image not found.'], 404);
            }
            $path = $uploadDir . '/' . basename($image['filename']);
            if (is_file($path)) {
                @unlink($path);
            }
            $database->prepare('DELETE FROM gallery_images WHERE id = ?')->execute([$id]);
            logActivity($database, 'delete', 'gallery_images', (int) $id, (string) $image['title']);
            respond(['success' => true, 'deleted' => 1]);
        }

        // List.
        $statement = $database->prepare('SELECT * FROM gallery_images ORDER BY id DESC');
        $statement->execute();
        respond(['data' => $statement->fetchAll()]);
    }

    if ($resource === 'track' && $method === 'GET') {
        // Public endpoint: customers check their request status with a tracking code.
        $database = db();
        $code = strtoupper(trim((string) ($_GET['code'] ?? '')));
        if ($code === '') {
            respond(['error' => 'Enter your tracking code.'], 422);
        }
        $statement = $database->prepare(
            'SELECT id, request_type, full_name, service_name, registration_number, preferred_date, status, tracking_code, created_at, updated_at
             FROM service_requests WHERE UPPER(tracking_code) = ? LIMIT 1'
        );
        $statement->execute([$code]);
        $request = $statement->fetch();
        if ($request === false) {
            usleep(400_000); // blunt code-guessing throttle
            respond(['error' => 'No request found for that tracking code. Check the code and try again.'], 404);
        }
        // Only expose the fields a customer needs — never phone/email/message.
        respond(['found' => true, 'request' => $request]);
    }

    $definitions = resourceDefinitions();
    if (!isset($definitions[$resource])) {
        respond(['error' => 'Unknown resource.'], 404);
    }

    $definition = $definitions[$resource];
    $isPublicRequest = $resource === 'service_requests' && $method === 'POST';
    if (!$isPublicRequest) {
        requireLogin();
    }

    $database = db();
    $table = $definition['table'];

    if ($method === 'GET') {
        if ($id) {
            $statement = $database->prepare("SELECT * FROM {$table} WHERE id = ?");
            $statement->execute([$id]);
            $record = $statement->fetch();
            respond($record ?: ['error' => 'Record not found.'], $record ? 200 : 404);
        }
        $limit = min(max((int) ($_GET['limit'] ?? 100), 1), 500);
        $offset = max((int) ($_GET['offset'] ?? 0), 0);
        $statement = $database->prepare("SELECT * FROM {$table} ORDER BY id DESC LIMIT {$limit} OFFSET {$offset}");
        $statement->execute();
        respond(['data' => $statement->fetchAll(), 'limit' => $limit, 'offset' => $offset]);
    }

    if ($method === 'POST' || $method === 'PATCH') {
        $body = cleanData(requestBody(), $definition['fields']);

        // Map user-friendly enquiry labels onto the schema's allowed values.
        // Public submissions always start as 'New' — the status is staff-controlled.
        if ($resource === 'service_requests') {
            $aliases = [
                'Service Booking' => 'Service',
                'Towing Request' => 'Towing',
            ];
            if (isset($body['request_type']) && $body['request_type'] !== null) {
                $body['request_type'] = $aliases[$body['request_type']] ?? $body['request_type'];
            }
            if ($isPublicRequest) {
                unset($body['status']);
                // Every public submission gets a tracking code for the Track page.
                $body['tracking_code'] = generateTrackingCode($database);
            }
        }
        if ($method === 'POST') {
            foreach ($definition['required'] as $field) {
                if (!isset($body[$field]) || $body[$field] === null || $body[$field] === '') {
                    respond(['error' => "Field '{$field}' is required."], 422);
                }
            }
            $columns = array_keys($body);
            $placeholders = implode(', ', array_fill(0, count($columns), '?'));
            $statement = $database->prepare("INSERT INTO {$table} (" . implode(', ', $columns) . ") VALUES ({$placeholders})");
            $statement->execute(array_values($body));
            $newId = (int) $database->lastInsertId();
            logActivity($database, 'create', $resource, $newId, describeRecord($resource, $body));
            $response = ['success' => true, 'id' => $newId];
            if (isset($body['tracking_code'])) {
                $response['tracking_code'] = $body['tracking_code'];
            }
            respond($response, 201);
        }

        if (!$id || $body === []) {
            respond(['error' => 'An id and at least one field are required.'], 422);
        }
        $assignments = implode(', ', array_map(static fn (string $field): string => "{$field} = ?", array_keys($body)));
        $statement = $database->prepare("UPDATE {$table} SET {$assignments} WHERE id = ?");
        $values = array_values($body);
        $values[] = $id;
        $statement->execute($values);
        logActivity($database, 'update', $resource, $id, describeRecord($resource, $body, $database, $id));
        respond(['success' => true, 'updated' => $statement->rowCount()]);
    }

    if ($method === 'DELETE') {
        if (!$id) {
            respond(['error' => 'An id is required.'], 422);
        }
        $lookup = $database->prepare("SELECT * FROM {$table} WHERE id = ?");
        $lookup->execute([$id]);
        $record = $lookup->fetch() ?: [];
        try {
            $statement = $database->prepare("DELETE FROM {$table} WHERE id = ?");
            $statement->execute([$id]);
        } catch (PDOException $exception) {
            // FK RESTRICT: child records (e.g. payments on an invoice) block deletion.
            if ((int) $exception->getCode() === 23000) {
                respond(['error' => 'This record cannot be deleted because other records depend on it (e.g. payments or job cards). Delete those first.'], 409);
            }
            throw $exception;
        }
        logActivity($database, 'delete', $resource, $id, describeRecord($resource, $record));
        respond(['success' => true, 'deleted' => $statement->rowCount()]);
    }

    respond(['error' => 'Method not allowed.'], 405);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    respond(['error' => 'A database error occurred.'], 500);
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    respond(['error' => 'An unexpected server error occurred.'], 500);
}