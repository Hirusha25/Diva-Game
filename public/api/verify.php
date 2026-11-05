<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('POST');
$in = json_in();
$phone = Phone::normalise((string) ($in['phone'] ?? ''));
$code = preg_replace('/\D+/', '', (string) ($in['code'] ?? ''));
if ($phone === null || $code === '') json_fail('Phone and code are required');
if (!RateLimit::hit('verify:' . $phone, 20, 600)) json_fail('Too many attempts. Try later.', 429);
$r = Otp::verify($phone, $code);
if (!$r['ok']) json_fail($r['error'], 400);
$player = Db::row('SELECT * FROM players WHERE phone = ?', [$phone]);
if ($player === null) json_fail('Player not found', 404);
Db::exec('UPDATE players SET last_seen_at = ? WHERE id = ?', [now(), $player['id']]);
$token = Auth::issueToken((int) $player['id']);
$best = (int) (Db::row('SELECT MAX(score) AS b FROM scores WHERE player_id = ?', [$player['id']])['b'] ?? 0);
json_out(['ok' => true, 'token' => $token, 'player' => ['name' => $player['name'], 'phone' => Phone::mask($phone), 'best' => $best]]);
