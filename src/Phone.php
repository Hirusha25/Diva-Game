<?php
declare(strict_types=1);

/** Normalises Sri Lankan mobile numbers to E.164 digits without '+', e.g. 947XXXXXXXX. */
final class Phone
{
    public static function normalise(string $raw): ?string
    {
        $cc = (string) cfg('app.country_code', '94');
        $d = preg_replace('/\D+/', '', $raw) ?? '';
        if (str_starts_with($d, '00')) $d = substr($d, 2);
        if (strlen($d) === 10 && $d[0] === '0') $d = $cc . substr($d, 1);           // 07XXXXXXXX
        elseif (strlen($d) === 9 && $d[0] === '7') $d = $cc . $d;                    // 7XXXXXXXX
        if (!preg_match('/^' . preg_quote($cc, '/') . '7\d{8}$/', $d)) return null;  // 947XXXXXXXX
        return $d;
    }

    /** 9477****123 for public leaderboards. */
    public static function mask(string $phone): string
    {
        return substr($phone, 0, 4) . str_repeat('*', max(0, strlen($phone) - 7)) . substr($phone, -3);
    }
}
