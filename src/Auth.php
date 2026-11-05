<?php
declare(strict_types=1);

/** Player bearer tokens (stored hashed) and the admin PHP session. */
final class Auth
{
    public static function issueToken(int $playerId): string
    {
        $token = bin2hex(random_bytes(24));
        $expires = gmdate('Y-m-d H:i:s', time() + 86400 * (int) cfg('session.ttl_days'));
        Db::exec('INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
            [hash('sha256', $token), $playerId, now(), $expires]);
        return $token;
    }

    /** @return array player row */
    public static function requirePlayer(): array
    {
        $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/^Bearer\s+([a-f0-9]{48})$/i', $hdr, $m)) json_fail('Not signed in', 401);
        $row = Db::row(
            'SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.expires_at > ?',
            [hash('sha256', $m[1]), now()]
        );
        if ($row === null) json_fail('Session expired. Please sign in again.', 401);
        Db::exec('UPDATE players SET last_seen_at = ? WHERE id = ?', [now(), $row['id']]);
        return $row;
    }

    // ---- admin (cookie session) ----
    public static function adminLogin(string $user, string $pass): bool
    {
        $ok = hash_equals((string) cfg('admin.username'), $user) && password_verify($pass, (string) cfg('admin.password_hash'));
        if ($ok) { session_regenerate_id(true); $_SESSION['admin'] = $user; $_SESSION['admin_at'] = time(); }
        return $ok;
    }

    public static function isAdmin(): bool
    {
        return !empty($_SESSION['admin']);
    }

    public static function requireAdmin(): void
    {
        if (!self::isAdmin()) json_fail('Admin login required', 401);
    }
}
