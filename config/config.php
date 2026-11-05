<?php
/**
 * Diva Fresh Run – server configuration.
 * Override anything here in config/local.php (git-ignored) or via env vars.
 */
$config = [
    'db' => [
        // MySQL in production. For local dev you may use 'sqlite:' . __DIR__ . '/../storage/dev.sqlite'
        'dsn'  => getenv('DIVA_DB_DSN')  ?: 'mysql:host=127.0.0.1;dbname=diva_game;charset=utf8mb4',
        'user' => getenv('DIVA_DB_USER') ?: 'diva',
        'pass' => getenv('DIVA_DB_PASS') ?: '',
    ],
    'sms' => [
        // log | http | twilio   (see src/Sms/*)
        'driver' => getenv('DIVA_SMS_DRIVER') ?: 'log',
        'sender' => getenv('DIVA_SMS_SENDER') ?: 'DivaFresh',
        'template' => 'Your Diva Fresh Run code is {code}. Valid for {minutes} minutes.',
        // Generic HTTP gateway (Dialog / Mobitel / Notify.lk style). {to} {message} {sender} are substituted.
        'http' => [
            'url'    => getenv('DIVA_SMS_URL') ?: 'https://app.notify.lk/api/v1/send',
            'method' => 'POST',
            'params' => [
                'user_id' => getenv('DIVA_SMS_USER') ?: '',
                'api_key' => getenv('DIVA_SMS_KEY') ?: '',
                'sender_id' => '{sender}',
                'to' => '{to}',
                'message' => '{message}',
            ],
            'headers' => [],
        ],
        'twilio' => [
            'sid'   => getenv('TWILIO_SID') ?: '',
            'token' => getenv('TWILIO_TOKEN') ?: '',
            'from'  => getenv('TWILIO_FROM') ?: '',
        ],
    ],
    'otp' => [
        'length'          => 4,
        'ttl_seconds'     => 300,
        'max_attempts'    => 5,
        'resend_cooldown' => 45,
        'max_per_hour'    => 6,     // per phone
    ],
    'session' => ['ttl_days' => 90],
    'app' => [
        'country_code'   => '94',   // Sri Lanka
        'allowed_origin' => getenv('DIVA_ALLOWED_ORIGIN') ?: '*',
        'score_per_metre' => 0.5,   // must match public/js/config.js
        'max_speed'       => 24,
    ],
    'admin' => [
        // Default login admin / diva2026 – CHANGE IN config/local.php
        'username'      => getenv('DIVA_ADMIN_USER') ?: 'admin',
        'password_hash' => getenv('DIVA_ADMIN_HASH') ?: '$2y$10$59eeZtrgUChojtXxNBWAAu8r4n1Kh/FnuxyKyX0jLcJXahI.IXTEy',
    ],
];
$local = __DIR__ . '/local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}
return $config;
