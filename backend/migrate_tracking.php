<?php

declare(strict_types=1);

/**
 * One-off migration (safe to re-run):
 *  1. Adds a unique tracking_code column to service_requests and backfills
 *     existing rows with codes.
 *  2. Expands the status CHECK to include 'Approved' and 'Declined'
 *     (SQLite requires recreating the table for CHECK changes).
 *
 * Run:  php backend/migrate_tracking.php
 */

require_once __DIR__ . '/config/database.php';

$database = db();
$path = getenv('DB_PATH') ?: __DIR__ . '/lec_mechanics.sqlite';
echo "Migrating: {$path}\n";

$columns = $database->query('PRAGMA table_info(service_requests)')->fetchAll();
if (!$columns) {
    fwrite(STDERR, "service_requests table not found — run backend/init_sqlite.php first.\n");
    exit(1);
}

$hasTracking = false;
foreach ($columns as $column) {
    if ($column['name'] === 'tracking_code') {
        $hasTracking = true;
    }
}

/** Generate a code that is unique in $table (used during the rebuild). */
function generateCode(PDO $database, string $table = 'service_requests'): string
{
    do {
        $code = 'LEC-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $check = $database->prepare("SELECT COUNT(*) FROM {$table} WHERE tracking_code = ?");
        $check->execute([$code]);
    } while ((int) $check->fetchColumn() > 0);
    return $code;
}

if ($hasTracking) {
    echo "• tracking_code column already exists — skipping table rebuild.\n";
} else {
    echo "• Rebuilding service_requests (adds tracking_code, expands status CHECK)…\n";

    // Nothing else references service_requests, so a plain rebuild is safe.
    $database->exec('DROP TABLE IF EXISTS service_requests_new;');
    $database->exec('
        CREATE TABLE service_requests_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_type TEXT NOT NULL DEFAULT \'Service\' CHECK (request_type IN (\'Service\', \'Towing\', \'Roadside Assistance\', \'Apprenticeship\', \'General Enquiry\')),
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NULL,
            registration_number TEXT NULL,
            service_name TEXT NULL,
            preferred_date TEXT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT \'New\' CHECK (status IN (\'New\', \'Contacted\', \'Approved\', \'Scheduled\', \'Declined\', \'Completed\', \'Closed\')),
            tracking_code TEXT UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))
        );
    ');

    $rows = $database->query('SELECT * FROM service_requests ORDER BY id ASC')->fetchAll();
    $insert = $database->prepare(
        'INSERT INTO service_requests_new
            (id, request_type, full_name, phone, email, registration_number, service_name, preferred_date, message, status, tracking_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($rows as $row) {
        // Preserve any previously migrated code, otherwise issue a new one.
        $code = $row['tracking_code'] ?? null;
        if (empty($code)) {
            $code = generateCode($database, 'service_requests_new');
        }
        $insert->execute([
            $row['id'],
            $row['request_type'],
            $row['full_name'],
            $row['phone'],
            $row['email'],
            $row['registration_number'],
            $row['service_name'],
            $row['preferred_date'],
            $row['message'],
            $row['status'],
            $code,
            $row['created_at'],
            $row['updated_at'],
        ]);
    }

    $database->exec('DROP TABLE service_requests;');
    $database->exec('ALTER TABLE service_requests_new RENAME TO service_requests;');
    echo '  ↳ rebuilt with ' . count($rows) . " existing request(s), codes backfilled.\n";
}

// Index for the public tracker lookup.
$database->exec('CREATE INDEX IF NOT EXISTS idx_requests_tracking ON service_requests (tracking_code);');
echo "• idx_requests_tracking index ensured.\n";

// Report remaining NULL codes (should be none).
$nulls = (int) $database->query('SELECT COUNT(*) FROM service_requests WHERE tracking_code IS NULL OR tracking_code = \'\'')->fetchColumn();
if ($nulls > 0) {
    $database->exec('UPDATE service_requests SET tracking_code = NULL;'); // clear empties before backfill
    $rows = $database->query('SELECT id FROM service_requests WHERE tracking_code IS NULL')->fetchAll();
    $update = $database->prepare('UPDATE service_requests SET tracking_code = ? WHERE id = ?');
    foreach ($rows as $row) {
        $update->execute([generateCode($database), $row['id']]);
    }
    echo "  ↳ backfilled {$nulls} missing code(s).\n";
}

echo "Done.\n";
