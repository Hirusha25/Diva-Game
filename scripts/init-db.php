<?php
/** Creates the tables for the configured database.   php scripts/init-db.php */
require __DIR__ . '/../src/bootstrap.php';
Db::migrate();
echo 'Database ready (' . (Db::isSqlite() ? 'sqlite' : 'mysql') . ")\n";
