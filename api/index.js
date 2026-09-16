/**
 * LEC Mechanics — serverless API (Vercel Functions + Supabase Postgres)
 * Full port of backend/api/index.php (sessions → JWT cookies, SQLite → Postgres).
 *
 * Client contract is unchanged:
 *   /api?resource=<name>            GET/POST/PATCH/DELETE (admin CRUD)
 *   /api?resource=auth&action=...   setup / login / logout / me / create-admin / ...
 *   /api?resource=track&code=...    public tracking lookup
 *   /api?resource=gallery_images    GET public; POST multipart or JSON (base64)
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   DATABASE_URL   — Supabase connection string (Transaction pooler, URI form)
 *   JWT_SECRET     — long random string used to sign session cookies
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const MAX_ADMINS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const GALLERY_MAX_BYTES = 5 * 1024 * 1024;
const COOKIE_NAME = 'lec_session';

let pool = null;
function db() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

/* ---------------------------- helpers ---------------------------- */

function json(res, data, status = 200) {
  res.statusCode = status;
  setHeader(res, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(res, 'Access-Control-Allow-Origin', reqOrigin(res));
  setHeader(res, 'Access-Control-Allow-Credentials', 'true');
  setHeader(res, 'Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function reqOrigin(res) {
  const origin = res.req && res.req.headers && res.req.headers.origin;
  return origin || '*';
}

function setHeader(res, name, value) {
  if (typeof res.setHeader === 'function') res.setHeader(name, value);
}

function fail(res, error, status = 400) {
  json(res, { error }, status);
}

function resourceDefinitions() {
  return {
    customers: {
      table: 'customers',
      fields: ['first_name', 'last_name', 'phone', 'email', 'national_id', 'customer_type', 'address', 'is_active'],
      required: ['first_name', 'last_name', 'phone'],
    },
    vehicles: {
      table: 'vehicles',
      fields: ['customer_id', 'registration_number', 'make', 'model', 'vehicle_year', 'colour', 'vin', 'current_mileage', 'engine_type', 'transmission', 'notes', 'is_active'],
      required: ['customer_id', 'registration_number', 'make', 'model'],
    },
    mechanics: {
      table: 'mechanics',
      fields: ['first_name', 'last_name', 'phone', 'email', 'staff_id', 'specialization', 'years_experience', 'status'],
      required: ['first_name', 'last_name', 'phone', 'staff_id', 'specialization'],
    },
    job_cards: {
      table: 'job_cards',
      fields: ['job_number', 'customer_id', 'vehicle_id', 'mechanic_id', 'job_date', 'estimated_completion_date', 'priority', 'mileage', 'complaint', 'diagnosis', 'work_required', 'work_completed', 'status', 'estimated_cost', 'notes', 'created_by'],
      required: ['job_number', 'customer_id', 'vehicle_id', 'job_date', 'complaint'],
    },
    spare_parts: {
      table: 'spare_parts',
      fields: ['part_name', 'part_number', 'category', 'supplier', 'quantity_in_stock', 'minimum_stock_level', 'buying_price', 'selling_price', 'storage_location', 'description', 'is_active'],
      required: ['part_name', 'part_number', 'category'],
    },
    invoices: {
      table: 'invoices',
      fields: ['invoice_number', 'customer_id', 'vehicle_id', 'job_card_id', 'invoice_date', 'due_date', 'service_charges', 'parts_charges', 'discount', 'tax', 'status', 'notes'],
      required: ['invoice_number', 'customer_id', 'invoice_date'],
    },
    payments: {
      table: 'payments',
      fields: ['invoice_id', 'payment_date', 'amount', 'payment_method', 'reference_number', 'notes'],
      required: ['invoice_id', 'payment_date', 'amount', 'payment_method'],
    },
    service_requests: {
      table: 'service_requests',
      fields: ['request_type', 'full_name', 'phone', 'email', 'registration_number', 'service_name', 'preferred_date', 'message', 'status', 'tracking_code'],
      required: ['full_name', 'phone', 'message'],
    },
  };
}

function cleanData(body, allowed) {
  const clean = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const value = body[field];
      clean[field] = value === '' ? null : value;
    }
  }
  return clean;
}

/** Issue a unique public tracking code (e.g. LEC-4F7A2B). */
async function generateTrackingCode(client) {
  for (;;) {
    const code = 'LEC-' + Array.from({ length: 6 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
    const check = await client.query('SELECT 1 FROM service_requests WHERE tracking_code = $1', [code]);
    if (check.rowCount === 0) return code;
  }
}

async function logActivity(client, action, resource, recordId, summary, user) {
  try {
    await client.query(
      'INSERT INTO activity_log (user_id, user_name, action, resource, record_id, summary) VALUES ($1, $2, $3, $4, $5, $6)',
      [user ? user.id : null, user ? user.full_name : 'Guest', action, resource, recordId, summary]
    );
  } catch {
    /* logging must never break the operation */
  }
}

function describeRecord(body) {
  const parts = [
    body.job_number || body.invoice_number,
    body.first_name && body.last_name ? `${body.first_name} ${body.last_name}`.trim() : null,
    body.registration_number,
    body.part_name || body.part_number,
    body.staff_id,
    body.full_name,
    body.payment_method,
  ].filter((v) => v !== undefined && v !== null && v !== '');
  return parts.length ? parts.slice(0, 2).join(' — ') : null;
}

/* ---------------------------- auth ---------------------------- */

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email, name: user.full_name, role: user.role },
    process.env.JWT_SECRET, { expiresIn: '7d' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function setSessionCookie(res, token) {
  setHeader(res, 'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
}

function clearSessionCookie(res) {
  setHeader(res, 'Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

async function currentUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db().query('SELECT id, full_name, email, role FROM users WHERE id = $1 AND is_active', [payload.sub]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res) {
  const user = await currentUser(req);
  if (!user) {
    fail(res, 'Authentication required.', 401);
    return null;
  }
  return user;
}

function passwordRule(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (password !== password.trim()) return 'Password cannot start or end with spaces.';
  return null;
}

function normalizeAnswer(answer) {
  return String(answer || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function loginAttemptRow(email) {
  const existing = await db().query('SELECT * FROM login_attempts WHERE email = $1', [email]);
  if (existing.rows.length) return existing.rows[0];
  await db().query('INSERT INTO login_attempts (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
  return { email, failed_attempts: 0, last_failed_at: null, locked_until: null };
}

function lockoutSecondsRemaining(row) {
  if (!row.locked_until) return 0;
  return Math.max(0, Math.floor((new Date(row.locked_until).getTime() - Date.now()) / 1000));
}

async function registerFailedLogin(email) {
  const row = await loginAttemptRow(email);
  let attempts = Number(row.failed_attempts) + 1;
  let lockedUntil = row.locked_until;
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    attempts = 0;
  }
  await db().query('UPDATE login_attempts SET failed_attempts = $1, last_failed_at = now(), locked_until = $2 WHERE email = $3',
    [attempts, lockedUntil, email]);
  return { failed_attempts: attempts, locked_until: lockedUntil };
}

/* ---------------------------- gallery ---------------------------- */

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

const GALLERY_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** GET /api?resource=gallery_image&id=N — streams one image's bytes back. */
async function serveGalleryImage(res, id) {
  const result = await db().query('SELECT mime_type, data FROM gallery_images WHERE id = $1', [id]);
  if (!result.rows.length || !result.rows[0].data) { res.statusCode = 404; return res.end('Not found'); }
  const buffer = Buffer.from(result.rows[0].data, 'base64');
  setHeader(res, 'Content-Type', result.rows[0].mime_type || 'image/jpeg');
  setHeader(res, 'Cache-Control', 'public, max-age=86400');
  res.statusCode = 200;
  res.end(buffer);
}

async function handleGallery(req, res, method, id, user, url) {
  const client = db();

  // Public image streaming (no auth): /api?resource=gallery_image&id=N
  if (method === 'GET' && id) {
    return serveGalleryImage(res, id);
  }

  if (method === 'POST' && !id) {
    if (!user) return fail(res, 'Authentication required.', 401);
    const saved = [];
    const errors = [];
    const body = req.body || {};

    const files = [];
    if (body.images) {
      const list = Array.isArray(body.images) ? body.images : [body.images];
      for (const dataUrl of list) {
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) { errors.push('One attachment is not a supported image (JPEG, PNG, WebP, GIF).'); continue; }
        files.push(parsed);
      }
    }

    if (!files.length) return fail(res, 'No file uploaded. Attach image files in the "images" field.', 422);

    for (const file of files) {
      if (file.buffer.length > GALLERY_MAX_BYTES) { errors.push('One image is larger than 5 MB.'); continue; }
      const ext = GALLERY_EXT[file.mime];
      const filename = 'img_' + require('crypto').randomBytes(6).toString('hex') + '.' + ext;
      await client.query(
        'INSERT INTO gallery_images (filename, title, caption, uploaded_by, mime_type, data) VALUES ($1, $2, $3, $4, $5, $6)',
        [filename, (body.title || 'Photo').slice(0, 120), (body.caption || '').slice(0, 300), user.full_name,
         file.mime, file.buffer.toString('base64')]);
      await logActivity(client, 'create', 'gallery_images', null, body.title, user);
      saved.push({ filename, title: body.title });
    }

    return json(res, { success: true, saved, errors }, saved.length ? 201 : 422);
  }

  if (method === 'PATCH' && id) {
    if (!user) return fail(res, 'Authentication required.', 401);
    const body = req.body || {};
    await client.query('UPDATE gallery_images SET title = $1, caption = $2 WHERE id = $3',
      [(body.title || '').slice(0, 120), (body.caption || '').slice(0, 300), id]);
    await logActivity(client, 'update', 'gallery_images', id, body.title || `#${id}`, user);
    return json(res, { success: true });
  }

  if (method === 'DELETE' && id) {
    if (!user) return fail(res, 'Authentication required.', 401);
    await client.query('DELETE FROM gallery_images WHERE id = $1', [id]);
    await logActivity(client, 'delete', 'gallery_images', id, null, user);
    return json(res, { success: true, deleted: 1 });
  }

  const result = await client.query('SELECT * FROM gallery_images ORDER BY id DESC');
  return json(res, { data: result.rows });
}

/* ---------------------------- main handler ---------------------------- */

module.exports = async (req, res) => {
  setHeader(res, 'Access-Control-Allow-Origin', req.headers.origin || '*');
  setHeader(res, 'Access-Control-Allow-Credentials', 'true');
  setHeader(res, 'Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  setHeader(res, 'Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const resource = (url.searchParams.get('resource') || '').toLowerCase();
  const action = (url.searchParams.get('action') || '').toLowerCase();
  const id = Number(url.searchParams.get('id')) > 0 ? Number(url.searchParams.get('id')) : null;
  const method = req.method;

  try {
    /* ---------- auth ---------- */
    if (resource === 'auth') {
      const body = req.body || {};

      if (action === 'setup' && method === 'POST') {
        const passwordError = passwordRule(body.password);
        const count = await db().query('SELECT COUNT(*)::int AS n FROM users');
        if (count.rows[0].n > 0) return fail(res, 'Initial setup has already been completed.', 409);
        if (!body.email || passwordError || !body.full_name) return fail(res, passwordError || 'full_name and a valid email are required.', 422);
        if (!body.security_question || !body.security_answer) return fail(res, 'A security question and answer are required.', 422);
        await db().query(
          'INSERT INTO users (full_name, email, password_hash, role, security_question, security_answer_hash) VALUES ($1, $2, $3, $4, $5, $6)',
          [body.full_name.trim(), body.email.toLowerCase().trim(), await bcrypt.hash(body.password, 10), 'admin',
           body.security_question, await bcrypt.hash(normalizeAnswer(body.security_answer), 10)]);
        return json(res, { success: true, message: 'Admin account created.' }, 201);
      }

      if (action === 'create-admin' && method === 'POST') {
        const user = await requireAuth(req, res); if (!user) return;
        const passwordError = passwordRule(body.password);
        if (!body.email || passwordError || !body.full_name) return fail(res, passwordError || 'full_name and a valid email are required.', 422);
        if (!body.security_question || !body.security_answer) return fail(res, 'A security question and answer are required.', 422);
        const count = await db().query('SELECT COUNT(*)::int AS n FROM users');
        if (count.rows[0].n >= MAX_ADMINS) return fail(res, `The maximum of ${MAX_ADMINS} admin accounts already exists.`, 409);
        const dupe = await db().query('SELECT 1 FROM users WHERE email = $1', [body.email.toLowerCase().trim()]);
        if (dupe.rows.length) return fail(res, 'An account with this email already exists.', 409);
        await db().query(
          'INSERT INTO users (full_name, email, password_hash, role, security_question, security_answer_hash) VALUES ($1, $2, $3, $4, $5, $6)',
          [body.full_name.trim(), body.email.toLowerCase().trim(), await bcrypt.hash(body.password, 10), 'admin',
           body.security_question, await bcrypt.hash(normalizeAnswer(body.security_answer), 10)]);
        return json(res, { success: true, message: 'Admin account created.' }, 201);
      }

      if (action === 'set-security-question' && method === 'POST') {
        const user = await requireAuth(req, res); if (!user) return;
        if (!body.security_question || !body.security_answer) return fail(res, 'A security question and answer are required.', 422);
        await db().query('UPDATE users SET security_question = $1, security_answer_hash = $2 WHERE id = $3',
          [body.security_question, await bcrypt.hash(normalizeAnswer(body.security_answer), 10), user.id]);
        return json(res, { success: true, message: 'Security question updated.' });
      }

      if (action === 'forgot-question' && method === 'POST') {
        const result = await db().query('SELECT security_question FROM users WHERE email = $1', [(body.email || '').toLowerCase().trim()]);
        if (!result.rows.length) return fail(res, 'No admin account uses that email address.', 404);
        if (!result.rows[0].security_question) return fail(res, 'This account has no security question set. Another admin must update your password.', 409);
        return json(res, { success: true, security_question: result.rows[0].security_question });
      }

      if (action === 'forgot-reset' && method === 'POST') {
        const result = await db().query('SELECT * FROM users WHERE email = $1', [(body.email || '').toLowerCase().trim()]);
        if (!result.rows.length || !result.rows[0].security_answer_hash) return fail(res, 'Password reset is not available for this account.', 404);
        const ok = await bcrypt.compare(normalizeAnswer(body.security_answer), result.rows[0].security_answer_hash);
        if (!ok) return fail(res, 'Incorrect answer to the security question.', 401);
        const passwordError = passwordRule(body.new_password);
        if (passwordError) return fail(res, passwordError, 422);
        await db().query('UPDATE users SET password_hash = $1 WHERE id = $2',
          [await bcrypt.hash(body.new_password, 10), result.rows[0].id]);
        return json(res, { success: true, message: 'Password has been reset. You can now sign in.' });
      }

      if (action === 'change-password' && method === 'POST') {
        const user = await requireAuth(req, res); if (!user) return;
        const row = await db().query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
        const ok = await bcrypt.compare(body.current_password || '', row.rows[0].password_hash);
        if (!ok) return fail(res, 'Current password is incorrect.', 401);
        const passwordError = passwordRule(body.new_password);
        if (passwordError) return fail(res, passwordError, 422);
        await db().query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(body.new_password, 10), user.id]);
        return json(res, { success: true, message: 'Password changed.' });
      }

      if (action === 'login' && method === 'POST') {
        const email = (body.email || '').toLowerCase().trim();
        const attemptRow = await loginAttemptRow(email);
        const remaining = lockoutSecondsRemaining(attemptRow);
        if (remaining > 0) {
          return json(res, {
            error: `Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
            locked: true, retry_after_seconds: remaining,
          }, 429);
        }
        const result = await db().query('SELECT * FROM users WHERE email = $1 AND is_active LIMIT 1', [email]);
        const userRow = result.rows[0];
        if (!userRow || !(await bcrypt.compare(body.password || '', userRow.password_hash))) {
          const failed = await registerFailedLogin(email);
          if (failed.locked_until && failed.failed_attempts === 0) {
            return json(res, { error: `Too many failed attempts. The account is locked for ${LOCKOUT_MINUTES} minutes.` }, 429);
          }
          const left = MAX_LOGIN_ATTEMPTS - failed.failed_attempts;
          return json(res, { error: `Invalid email or password. ${left} attempt(s) remaining.` }, 401);
        }
        await db().query('DELETE FROM login_attempts WHERE email = $1', [email]);
        const safeUser = { id: userRow.id, full_name: userRow.full_name, email: userRow.email, role: userRow.role };
        setSessionCookie(res, signToken(safeUser));
        return json(res, { success: true, user: safeUser, csrf_token: 'not-used' });
      }

      if (action === 'logout' && method === 'POST') {
        clearSessionCookie(res);
        return json(res, { success: true });
      }

      if (action === 'list-users' && method === 'GET') {
        const user = await requireAuth(req, res); if (!user) return;
        const rows = await db().query(
          'SELECT id, full_name, email, role, (security_question IS NOT NULL) AS has_security_question, is_active, created_at FROM users ORDER BY id ASC');
        return json(res, { data: rows.rows, max_admins: MAX_ADMINS, current_user_id: user.id });
      }

      if (action === 'me' && method === 'GET') {
        const user = await currentUser(req);
        let question = null;
        if (user) {
          const q = await db().query('SELECT security_question FROM users WHERE id = $1', [user.id]);
          question = (q.rows[0] && q.rows[0].security_question) || null;
        }
        const count = await db().query('SELECT COUNT(*)::int AS n FROM users');
        return json(res, {
          authenticated: Boolean(user),
          user,
          security_question: question,
          user_count: count.rows[0].n,
          max_admins: MAX_ADMINS,
          csrf_token: user ? 'not-used' : null,
        });
      }

      return fail(res, 'Unknown auth action.', 404);
    }

    /* ---------- dashboard ---------- */
    if (resource === 'dashboard' && method === 'GET') {
      const user = await requireAuth(req, res); if (!user) return;
      const summary = await db().query('SELECT * FROM dashboard_summary');
      const lowStock = await db().query('SELECT * FROM low_stock_parts ORDER BY quantity_in_stock ASC');
      const recentJobs = await db().query(
        `SELECT j.id, j.job_number, j.status, j.job_date, c.first_name || ' ' || c.last_name AS customer_name, v.registration_number
         FROM job_cards j JOIN customers c ON c.id = j.customer_id JOIN vehicles v ON v.id = j.vehicle_id
         ORDER BY j.created_at DESC LIMIT 10`);
      const activity = await db().query(
        'SELECT action, resource, record_id, user_name, summary, created_at FROM activity_log ORDER BY id DESC LIMIT 12');
      return json(res, { summary: summary.rows[0] || {}, low_stock_parts: lowStock.rows, recent_jobs: recentJobs.rows, activity: activity.rows });
    }

    /* ---------- reports ---------- */
    if (resource === 'reports' && method === 'GET') {
      const user = await requireAuth(req, res); if (!user) return;
      const revenue = await db().query('SELECT COALESCE(SUM(amount), 0) AS total FROM payments');
      const monthly = await db().query(
        `SELECT to_char(invoice_date, 'YYYY-MM') AS month, COALESCE(SUM(total_amount), 0)::float AS total
         FROM invoices WHERE status <> 'Void' AND invoice_date >= (date_trunc('month', now()) - interval '11 months')
         GROUP BY month ORDER BY month ASC`);
      const jobStatus = await db().query('SELECT status, COUNT(*)::int AS n FROM job_cards GROUP BY status');
      const invoiceStats = await db().query(
        `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(total_amount), 0)::float AS total FROM invoices WHERE status <> 'Void' GROUP BY status`);
      const inventory = await db().query(
        `SELECT COUNT(*)::int AS total_parts, COALESCE(SUM(quantity_in_stock), 0)::int AS stock_qty,
                COALESCE(SUM(CASE WHEN quantity_in_stock <= minimum_stock_level THEN 1 ELSE 0 END), 0)::int AS low_stock,
                COALESCE(SUM(quantity_in_stock * buying_price), 0)::float AS stock_value
         FROM spare_parts`);
      const vehicles = await db().query('SELECT COUNT(*)::int AS n FROM vehicles');
      const jobsCompleted = await db().query(`SELECT COUNT(*)::int AS n FROM job_cards WHERE status = 'Completed'`);
      const methods = await db().query(
        'SELECT payment_method, COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float AS total FROM payments GROUP BY payment_method ORDER BY total DESC');
      const jobStatusMap = {};
      jobStatus.rows.forEach((r) => { jobStatusMap[r.status] = r.n; });
      let unpaidInvoices = 0;
      let invoicedTotal = 0;
      invoiceStats.rows.forEach((r) => { invoicedTotal += r.total; if (r.status !== 'Paid' && r.status !== 'Partially Paid') unpaidInvoices += r.n; });
      return json(res, {
        summary: {
          revenue: Number(revenue.rows[0].total),
          invoices: invoiceStats.rows.reduce((a, r) => a + r.n, 0),
          vehicles: vehicles.rows[0].n,
          jobs_completed: jobsCompleted.rows[0].n,
        },
        monthly_revenue: monthly.rows,
        job_status: jobStatusMap,
        payments: {
          paid_invoices: invoiceStats.rows.find((r) => r.status === 'Paid')?.n || 0,
          partially_paid: invoiceStats.rows.find((r) => r.status === 'Partially Paid')?.n || 0,
          unpaid_invoices: unpaidInvoices,
          invoiced_total: Math.round(invoicedTotal * 100) / 100,
          paid_total: 0,
          outstanding: Math.round(invoicedTotal * 100) / 100,
          methods: methods.rows,
        },
        inventory: {
          total_parts: inventory.rows[0].total_parts,
          stock_qty: inventory.rows[0].stock_qty,
          low_stock: inventory.rows[0].low_stock,
          stock_value: Math.round(inventory.rows[0].stock_value * 100) / 100,
        },
      });
    }

    /* ---------- activity log ---------- */
    if (resource === 'activity_log' && method === 'GET') {
      const user = await requireAuth(req, res); if (!user) return;
      const rows = await db().query('SELECT * FROM activity_log ORDER BY id DESC LIMIT 200');
      return json(res, { data: rows.rows });
    }

    /* ---------- gallery ---------- */
    if (resource === 'gallery_images' || resource === 'gallery_image') {
      const user = await currentUser(req);
      return handleGallery(req, res, method, id, user, url);
    }

    /* ---------- public tracking ---------- */
    if (resource === 'track' && method === 'GET') {
      const code = (url.searchParams.get('code') || '').trim().toUpperCase();
      if (!code) return fail(res, 'Enter your tracking code.', 422);
      const result = await db().query(
        `SELECT id, request_type, full_name, service_name, registration_number, preferred_date, status, tracking_code, created_at, updated_at
         FROM service_requests WHERE UPPER(tracking_code) = $1 LIMIT 1`, [code]);
      if (!result.rows.length) return fail(res, 'No request found for that tracking code. Check the code and try again.', 404);
      return json(res, { found: true, request: result.rows[0] });
    }

    /* ---------- generic CRUD ---------- */
    const definitions = resourceDefinitions();
    const definition = definitions[resource];
    if (!definition) return fail(res, 'Unknown resource.', 404);

    const isPublicRequest = resource === 'service_requests' && method === 'POST' && !id;
    let user = null;
    if (!isPublicRequest) {
      user = await requireAuth(req, res);
      if (!user) return;
    }

    const body = req.body || {};
    const client = db();

    if (method === 'GET') {
      if (id) {
        const row = await client.query(`SELECT * FROM ${definition.table} WHERE id = $1`, [id]);
        return json(res, row.rows[0] || { error: 'Record not found.' }, row.rows.length ? 200 : 404);
      }
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      const rows = await client.query(`SELECT * FROM ${definition.table} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`);
      return json(res, { data: rows.rows, limit, offset });
    }

    if (method === 'POST' || method === 'PATCH') {
      let data = cleanData(body, definition.fields);

      if (resource === 'service_requests') {
        const aliases = { 'Service Booking': 'Service', 'Towing Request': 'Towing' };
        if (data.request_type) data.request_type = aliases[data.request_type] || data.request_type;
        if (isPublicRequest) {
          delete data.status;
          data.tracking_code = await generateTrackingCode(client);
        }
      }

      if (method === 'POST') {
        for (const field of definition.required) {
          if (data[field] === undefined || data[field] === null || data[field] === '') {
            return fail(res, `Field '${field}' is required.`, 422);
          }
        }
        const columns = Object.keys(data);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const insert = await client.query(
          `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          Object.values(data));
        const newId = insert.rows[0].id;
        await logActivity(client, 'create', resource, newId, describeRecord(data), user);
        const response = { success: true, id: newId };
        if (data.tracking_code) response.tracking_code = data.tracking_code;
        return json(res, response, 201);
      }

      if (!id || Object.keys(data).length === 0) return fail(res, 'An id and at least one field are required.', 422);
      const assignments = Object.keys(data).map((field, i) => `${field} = $${i + 1}`).join(', ');
      const values = Object.values(data);
      await client.query(`UPDATE ${definition.table} SET ${assignments} WHERE id = $${values.length + 1}`, [...values, id]);
      await logActivity(client, 'update', resource, id, describeRecord(data) || `#${id}`, user);
      return json(res, { success: true });
    }

    if (method === 'DELETE') {
      if (!id) return fail(res, 'An id is required.', 422);
      try {
        const del = await client.query(`DELETE FROM ${definition.table} WHERE id = $1`, [id]);
        await logActivity(client, 'delete', resource, id, describeRecord(body), user);
        return json(res, { success: true, deleted: del.rowCount });
      } catch (error) {
        if (String(error.code) === '23503') {
          return fail(res, 'This record cannot be deleted because other records depend on it (e.g. payments or job cards). Delete those first.', 409);
        }
        throw error;
      }
    }

    return fail(res, 'Method not allowed.', 405);
  } catch (error) {
    console.error('API error:', error);
    return fail(res, 'A database error occurred.', 500);
  }
};
