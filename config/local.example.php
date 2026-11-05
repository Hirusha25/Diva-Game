<?php
/** Copy to config/local.php and fill in. This file is git-ignored. */
return [
    'db' => [
        'dsn'  => 'mysql:host=127.0.0.1;dbname=diva_game;charset=utf8mb4',
        'user' => 'diva',
        'pass' => 'change-me',
    ],
    'sms' => [
        'driver' => 'http',     // log | http | twilio
        'sender' => 'DivaFresh',
        'http' => [
            'url' => 'https://app.notify.lk/api/v1/send',
            'method' => 'POST',
            'params' => ['user_id' => 'NOTIFY_USER_ID', 'api_key' => 'NOTIFY_API_KEY', 'sender_id' => '{sender}', 'to' => '{to}', 'message' => '{message}'],
        ],
    ],
    'admin' => [
        'username' => 'admin',
        // php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
        'password_hash' => '$2y$10$replace-me',
    ],
    'app' => ['allowed_origin' => 'https://game.example.lk'],
];
