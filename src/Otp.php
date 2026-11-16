<?php
declare(strict_types=1);

/** One-time passcodes: hashed at rest, limited attempts, cooldown and hourly cap per phone. */
final class Otp
{
    /** @return array{ok:bool, error?:string, resend_in?:int} */
    public static function issue(string $phone): array
    {
        $cooldown = (int) cfg('otp.resend_cooldown');
        $last = Db::row('SELECT created_at FROM otps WHERE phone = ? ORDER BY id DESC LIMIT 1', [$phone]);
        if ($last !== null) {
            $age = time() - strtotime($last['created_at'] . ' UTC');
            if ($age < $cooldown) return ['ok' => false, 'error' => 'Please wait before requesting another code', 'resend_in' => $cooldown - $age];
        }
        if (!RateLimit::hit('otp:' . $phone, (int) cfg('otp.max_per_hour'), 3600)) {
            return ['ok' => false, 'error' => 'Too many codes requested. Try again later.'];
        }
        $len = (int) cfg('otp.length');
        $code = str_pad((string) random_int(0, (10 ** $len) - 1), $len, '0', STR_PAD_LEFT);
        $expires = gmdate('Y-m-d H:i:s', time() + (int) cfg('otp.ttl_seconds'));
        Db::exec('UPDATE otps SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL', [now(), $phone]);
        Db::exec('INSERT INTO otps (phone, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
            [$phone, password_hash($code, PASSWORD_DEFAULT), $expires, now()]);
        \Sms\Sms::sendOtp($phone, $code);
        return ['ok' => true, 'resend_in' => $cooldown];
    }

    /** @return array{ok:bool, error?:string} */
    public static function verify(string $phone, string $code): array
    {
        $row = Db::row('SELECT * FROM otps WHERE phone = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1', [$phone]);
        if ($row === null) return ['ok' => false, 'error' => 'No code requested for this number'];
        if (strtotime($row['expires_at'] . ' UTC') < time()) return ['ok' => false, 'error' => 'Code expired. Request a new one.'];
        if ((int) $row['attempts'] >= (int) cfg('otp.max_attempts')) return ['ok' => false, 'error' => 'Too many attempts. Request a new code.'];
        Db::exec('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
        if (!password_verify($code, $row['code_hash'])) return ['ok' => false, 'error' => 'Incorrect code'];
        Db::exec('UPDATE otps SET consumed_at = ? WHERE id = ?', [now(), $row['id']]);
        return ['ok' => true];
    }
}
