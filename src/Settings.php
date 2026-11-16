<?php
declare(strict_types=1);

/** Key/value settings (JSON-encoded). Gift tiers live under 'gifts'. */
final class Settings
{
    public static function get(string $key, $default = null)
    {
        $row = Db::row('SELECT setting_value FROM settings WHERE setting_key = ?', [$key]);
        if ($row === null || $row['setting_value'] === null) return $default;
        $v = json_decode($row['setting_value'], true);
        return $v === null && $row['setting_value'] !== 'null' ? $default : $v;
    }

    public static function set(string $key, $value): void
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);
        if (Db::row('SELECT 1 AS x FROM settings WHERE setting_key = ?', [$key])) {
            Db::exec('UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?', [$json, now(), $key]);
        } else {
            Db::exec('INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)', [$key, $json, now()]);
        }
    }

    /** @return array<int, array{from:int,to:int,gift:string}> ordered by rank */
    public static function gifts(): array
    {
        $gifts = self::get('gifts', [
            ['from' => 1, 'to' => 1, 'gift' => 'Diva Fresh Hamper + Rs. 10,000 voucher'],
            ['from' => 2, 'to' => 3, 'gift' => 'Diva Fresh Hamper'],
            ['from' => 4, 'to' => 10, 'gift' => 'Diva Fresh 1 kg pack'],
        ]);
        usort($gifts, fn($a, $b) => $a['from'] <=> $b['from']);
        return $gifts;
    }

    public static function giftForRank(int $rank): ?string
    {
        foreach (self::gifts() as $g) {
            if ($rank >= (int) $g['from'] && $rank <= (int) $g['to']) return (string) $g['gift'];
        }
        return null;
    }
}
