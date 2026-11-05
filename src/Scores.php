<?php
declare(strict_types=1);

final class Scores
{
    /** Basic plausibility checks so a tampered client cannot post absurd scores. */
    public static function plausible(int $score, float $distance, float $duration): bool
    {
        if ($score < 0 || $distance < 0 || $duration < 0) return false;
        if ($duration > 3600 || $distance > 20000) return false;
        if ($distance > $duration * (float) cfg('app.max_speed') + 5) return false;
        $maxPickups = ($distance / 16) * 5 + 5;                    // spawner: ≤5 packs per ≥16 m pattern
        $maxScore = $distance * (float) cfg('app.score_per_metre') + $maxPickups * 10 + 20;
        return $score <= $maxScore;
    }

    public static function submit(int $playerId, int $score, float $distance, float $duration): array
    {
        Db::exec('INSERT INTO scores (player_id, score, distance_m, duration_s, created_at) VALUES (?, ?, ?, ?, ?)',
            [$playerId, $score, round($distance, 1), round($duration, 1), now()]);
        $best = (int) (Db::row('SELECT MAX(score) AS b FROM scores WHERE player_id = ?', [$playerId])['b'] ?? 0);
        // Integer literal rather than a bound parameter: SQLite would otherwise compare as text.
        $rank = (int) Db::row(
            'SELECT COUNT(*) + 1 AS r FROM (SELECT player_id, MAX(score) AS best FROM scores GROUP BY player_id) t WHERE t.best > ' . $best
        )['r'];
        return ['best' => $best, 'rank' => $rank];
    }

    /** Top N players by their best score (one row per player). */
    public static function top(int $n = 10, bool $full = false): array
    {
        $rows = Db::all(
            'SELECT p.id, p.name, p.phone, t.best, t.runs, t.last_run
               FROM (SELECT player_id, MAX(score) AS best, COUNT(*) AS runs, MAX(created_at) AS last_run FROM scores GROUP BY player_id) t
               JOIN players p ON p.id = t.player_id
              ORDER BY t.best DESC, t.last_run ASC
              LIMIT ' . (int) $n
        );
        $out = [];
        foreach ($rows as $i => $r) {
            $out[] = [
                'rank' => $i + 1,
                'name' => $r['name'],
                'phone' => $full ? $r['phone'] : Phone::mask($r['phone']),
                'score' => (int) $r['best'],
                'runs' => (int) $r['runs'],
                'last_run' => $r['last_run'],
            ] + ($full ? ['player_id' => (int) $r['id']] : []);
        }
        return $out;
    }
}
