<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('POST');
$in = json_in();
$name = trim((string) ($in['name'] ?? ''));
$phone = Phone::normalise((string) ($in['phone'] ?? ''));
$gender = (string) ($in['gender'] ?? '');
$consentGame = ($in['consent_game'] ?? false) === true;
$consentMarketing = ($in['consent_marketing'] ?? false) === true;
if (mb_strlen($name) < 2 || mb_strlen($name) > 40) json_fail('Please enter your name (2–40 characters)');
if ($phone === null) json_fail('Enter a valid Sri Lankan mobile number (07XXXXXXXX)');
if (!in_array($gender, ['male', 'female'], true)) json_fail('Please select Male or Female');
if (!$consentGame) json_fail('Please accept the game management consent to play');
if (!RateLimit::hit('ip:' . client_ip(), 30, 3600)) json_fail('Too many requests from this network. Try later.', 429);

Db::upgrade();   // older databases: add the gender / consent columns
$player = Db::row('SELECT id FROM players WHERE phone = ?', [$phone]);
$fields = [$name, $gender, now(), $consentMarketing ? 1 : 0, $consentMarketing ? now() : null];
if ($player === null) {
    Db::exec('INSERT INTO players (name, gender, consent_game_at, consent_marketing, consent_marketing_at, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [...$fields, $phone, now()]);
} else {
    Db::exec('UPDATE players SET name = ?, gender = ?, consent_game_at = ?, consent_marketing = ?, consent_marketing_at = ? WHERE id = ?', [...$fields, $player['id']]);
}
$r = Otp::issue($phone);
if (!$r['ok']) json_fail($r['error'], 429, ['resend_in' => $r['resend_in'] ?? null]);
json_out(['ok' => true, 'phone' => $phone, 'resend_in' => $r['resend_in'], 'otp_length' => (int) cfg('otp.length')]);
