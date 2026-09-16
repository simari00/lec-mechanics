<?php

/**
 * Router for PHP's built-in dev server (php -S 127.0.0.1:8000 router.php).
 *
 * - /api  -> backend PHP API (mirrors the Vercel rewrite /api -> serverless handler)
 * - real files on disk -> served as-is
 * - anything else -> index.html
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if ($uri === '/api' || $uri === '/api/') {
    $_GET['resource'] = $_GET['resource'] ?? '';
    require __DIR__ . '/backend/api/index.php';
    return true;
}

if (is_file(__DIR__ . $uri)) {
    return false; // let the built-in server serve the real file
}

// SPA-ish fallback: unknown paths get the home page.
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');
return true;
