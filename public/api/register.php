<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('POST');
$in = json_in();
$name = trim((string) ($in['name'] ?? ''));
$phone = Phone::normalise((string) ($in['phone'] ?? ''));
if (mb_strlen($name) < 2 || mb_strlen($name) > 40) json_fail('Please enter your name (2–40 characters)');
if ($phone === null) json_fail('Enter a valid Sri Lankan mobile number (07XXXXXXXX)');
if (!RateLimit::hit('ip:' . client_ip(), 30, 3600)) json_fail('Too many requests from this network. Try later.', 429);

$player = Db::row('SELECT id FROM players WHERE phone = ?', [$phone]);
if ($player === null) {
    Db::exec('INSERT INTO players (phone, name, created_at) VALUES (?, ?, ?)', [$phone, $name, now()]);
} else {
    Db::exec('UPDATE players SET name = ? WHERE id = ?', [$name, $player['id']]);
}
$r = Otp::issue($phone);
if (!$r['ok']) json_fail($r['error'], 429, ['resend_in' => $r['resend_in'] ?? null]);
json_out(['ok' => true, 'phone' => $phone, 'resend_in' => $r['resend_in'], 'otp_length' => (int) cfg('otp.length')]);
