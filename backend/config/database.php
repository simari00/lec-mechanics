<?php

declare(strict_types=1);

/**
 * Create a shared PDO connection for the LEC Mechanics API.
 *
 * Uses a local SQLite database file (open it with DB Browser for SQLite).
 * Override the file location with the DB_PATH environment variable if needed.
 */
function db(): PDO
{
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    $path = getenv('DB_PATH') ?: dirname(__DIR__) . '/lec_mechanics.sqlite';

    $connection = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $connection->exec('PRAGMA foreign_keys = ON');

    return $connection;
}