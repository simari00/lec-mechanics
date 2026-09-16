<?php

declare(strict_types=1);

/**
 * Initialize (or reset) the SQLite database for LEC Mechanics.
 *
 * Usage:  php backend/init_sqlite.php
 * The database file is backend/lec_mechanics.sqlite — open it with
 * DB Browser for SQLite to inspect the data.
 */

$schemaFile = __DIR__ . '/database.sqlite.sql';
$dbFile = getenv('DB_PATH') ?: __DIR__ . '/lec_mechanics.sqlite';

if (!is_file($schemaFile)) {
    fwrite(STDERR, "Schema file not found: {$schemaFile}" . PHP_EOL);
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbFile, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec(file_get_contents($schemaFile));

$tables = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
$views = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);

printf(
    "Database ready: %s%s  Tables: %s%s  Views: %s%s",
    $dbFile,
    PHP_EOL,
    implode(', ', $tables),
    PHP_EOL,
    implode(', ', $views),
    PHP_EOL
);
