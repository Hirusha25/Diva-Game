<?php
declare(strict_types=1);

/** Tiny fixed-window rate limiter backed by the rate_limits table. */
final class RateLimit
{
    /** @return bool true if allowed */
    public static function hit(string $key, int $limit, int $windowSeconds): bool
    {
        $windowStart = gmdate('Y-m-d H:i:s', (int) (floor(time() / $windowSeconds) * $windowSeconds));
        $row = Db::row('SELECT count FROM rate_limits WHERE rl_key = ? AND window_start = ?', [$key, $windowStart]);
        if ($row === null) {
            Db::exec('DELETE FROM rate_limits WHERE rl_key = ?', [$key]);
            Db::exec('INSERT INTO rate_limits (rl_key, window_start, count) VALUES (?, ?, 1)', [$key, $windowStart]);
            return true;
        }
        if ((int) $row['count'] >= $limit) return false;
        Db::exec('UPDATE rate_limits SET count = count + 1 WHERE rl_key = ? AND window_start = ?', [$key, $windowStart]);
        return true;
    }
}
