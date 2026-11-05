<?php
// Router for PHP's built-in server:  php -S 0.0.0.0:8080 -t public public/router.php
// Serves static files from /public and lets /api/*.php and /admin/* run as PHP.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = realpath(__DIR__ . $path);
if ($path !== '/' && $file && str_starts_with($file, __DIR__) && is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if ($ext === 'php') return false; // let PHP execute it
    $types = [
        'webp' => 'image/webp', 'glb' => 'model/gltf-binary', 'js' => 'text/javascript',
        'mjs' => 'text/javascript', 'json' => 'application/json', 'css' => 'text/css', 'html' => 'text/html',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'wasm' => 'application/wasm',
    ];
    if (isset($types[$ext])) {
        header('Content-Type: ' . $types[$ext]);
        header('Cache-Control: public, max-age=86400');
        readfile($file);
        return true;
    }
    return false;
}
if ($path === '/' || $path === '/index.html') {
    header('Content-Type: text/html');
    readfile(__DIR__ . '/index.html');
    return true;
}
http_response_code(404);
echo 'Not found';
