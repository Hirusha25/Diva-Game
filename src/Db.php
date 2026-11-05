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
    }
}
