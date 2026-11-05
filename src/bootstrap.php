<?php
declare(strict_types=1);

/** Shared bootstrap for API and admin endpoints: config, autoload, JSON helpers, CORS. */

define('DIVA_ROOT', dirname(__DIR__));
$GLOBALS['diva_config'] = require DIVA_ROOT . '/config/config.php';

spl_autoload_register(function (string $class): void {
    $file = DIVA_ROOT . '/src/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($file)) require $file;
});

function cfg(string $path, $default = null)
{
    $node = $GLOBALS['diva_config'];
    foreach (explode('.', $path) as $k) {
        if (!is_array($node) || !array_key_exists($k, $node)) return $default;
        $node = $node[$k];
    }
    return $node;
}

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_fail(string $message, int $status = 400, array $extra = []): never
{
    json_out(['ok' => false, 'error' => $message] + $extra, $status);
}

function json_in(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = $_POST;
    return $data;
}

function cors(): void
{
    $origin = cfg('app.allowed_origin', '*');
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) json_fail('Method not allowed', 405);
}

function client_ip(): string
{
    return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

set_exception_handler(function (Throwable $e): void {
    error_log('[diva] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_fail('Server error', 500);
});
