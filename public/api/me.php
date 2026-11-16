<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('GET');
$p = Auth::requirePlayer();
$best = (int) (Db::row('SELECT MAX(score) AS b FROM scores WHERE player_id = ?', [$p['id']])['b'] ?? 0);
json_out(['ok' => true, 'player' => ['name' => $p['name'], 'phone' => Phone::mask($p['phone']), 'best' => $best]]);
