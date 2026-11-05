<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('POST');
$p = Auth::requirePlayer();
$in = json_in();
$score = (int) ($in['score'] ?? -1);
$distance = (float) ($in['distance'] ?? -1);
$duration = (float) ($in['duration'] ?? -1);
if (!Scores::plausible($score, $distance, $duration)) json_fail('Score rejected', 422);
if (!RateLimit::hit('score:' . $p['id'], 60, 3600)) json_fail('Too many runs submitted. Try later.', 429);
$r = Scores::submit((int) $p['id'], $score, $distance, $duration);
json_out(['ok' => true, 'score' => $score, 'best' => $r['best'], 'rank' => $r['rank'], 'gift' => Settings::giftForRank($r['rank']), 'gifts' => Settings::gifts(), 'top' => Scores::top(10)]);
