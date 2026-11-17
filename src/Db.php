<?php
declare(strict_types=1);

/** PDO singleton. Works with MySQL (production) and SQLite (local dev). */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = cfg('db.dsn');
            self::$pdo = new PDO($dsn, cfg('db.user'), cfg('db.pass'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            if (self::isSqlite()) self::$pdo->exec('PRAGMA foreign_keys = ON');
        }
        return self::$pdo;
    }

    public static function isSqlite(): bool
    {
        return str_starts_with((string) cfg('db.dsn'), 'sqlite:');
    }

    public static function row(string $sql, array $params = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function all(string $sql, array $params = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    public static function exec(string $sql, array $params = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    public static function lastId(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    /** Runs the schema file matching the configured driver. */
    public static function migrate(): void
    {
        $file = DIVA_ROOT . '/database/' . (self::isSqlite() ? 'schema.sqlite.sql' : 'schema.mysql.sql');
        foreach (array_filter(array_map('trim', explode(';', file_get_contents($file)))) as $stmt) {
            self::pdo()->exec($stmt);
        }
        self::upgrade();
    }

    /**
     * Adds columns introduced after a database was first created (CREATE TABLE
     * IF NOT EXISTS leaves existing tables as they were). Safe to run often.
     */
    public static function upgrade(): void
    {
        $sqlite = self::isSqlite();
        $have = $sqlite
            ? array_column(self::all('PRAGMA table_info(players)'), 'name')
            : array_column(self::all('SHOW COLUMNS FROM players'), 'Field');
        $add = $sqlite
            ? ['gender' => 'TEXT', 'consent_game_at' => 'TEXT', 'consent_marketing' => 'INTEGER NOT NULL DEFAULT 0', 'consent_marketing_at' => 'TEXT']
            : ['gender' => 'VARCHAR(6) NULL', 'consent_game_at' => 'DATETIME NULL', 'consent_marketing' => 'TINYINT(1) NOT NULL DEFAULT 0', 'consent_marketing_at' => 'DATETIME NULL'];
        foreach ($add as $col => $type) {
            if (!in_array($col, $have, true)) self::pdo()->exec("ALTER TABLE players ADD COLUMN $col $type");
        }
    }
}
