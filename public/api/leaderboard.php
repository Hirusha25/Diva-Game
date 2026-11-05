<?php
require __DIR__ . '/../../src/bootstrap.php';
cors(); require_method('GET');
json_out(['ok' => true, 'top' => Scores::top(10), 'gifts' => Settings::gifts(), 'updated_at' => now()]);
