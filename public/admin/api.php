<?php
/** Admin JSON API (cookie session). Actions: login, logout, top, stats, gifts, save_gifts, players, export. */
require __DIR__ . '/../../src/bootstrap.php';
session_name('diva_admin');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($action === 'login') {
    require_method('POST');
    $in = json_in();
    if (!RateLimit::hit('admin-login:' . client_ip(), 10, 900)) json_fail('Too many login attempts. Try later.', 429);
    if (!Auth::adminLogin((string) ($in['username'] ?? ''), (string) ($in['password'] ?? ''))) json_fail('Wrong username or password', 401);
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    json_out(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}
if ($action === 'logout') { session_destroy(); json_out(['ok' => true]); }

Auth::requireAdmin();
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_CSRF'] ?? '')) json_fail('Invalid session token', 403);

switch ($action) {
    case 'top':
        $top = Scores::top(10, true);
        foreach ($top as &$t) $t['gift'] = Settings::giftForRank($t['rank']);
        json_out(['ok' => true, 'top' => $top, 'updated_at' => now()]);

    case 'stats':
        $today = gmdate('Y-m-d');
        json_out(['ok' => true, 'stats' => [
            'players' => (int) Db::row('SELECT COUNT(*) AS c FROM players')['c'],
            'runs' => (int) Db::row('SELECT COUNT(*) AS c FROM scores')['c'],
            'runs_today' => (int) Db::row("SELECT COUNT(*) AS c FROM scores WHERE created_at >= ?", [$today . ' 00:00:00'])['c'],
            'players_today' => (int) Db::row("SELECT COUNT(*) AS c FROM players WHERE created_at >= ?", [$today . ' 00:00:00'])['c'],
            'top_score' => (int) (Db::row('SELECT MAX(score) AS m FROM scores')['m'] ?? 0),
        ]]);

    case 'gifts':
        json_out(['ok' => true, 'gifts' => Settings::gifts(), 'campaign' => Settings::get('campaign', ['title' => 'Diva Fresh Stain Fighter Run', 'ends_at' => '', 'note' => ''])]);

    case 'save_gifts':
        require_method('POST');
        $in = json_in();
        $gifts = [];
        foreach ((array) ($in['gifts'] ?? []) as $g) {
            $from = (int) ($g['from'] ?? 0); $to = (int) ($g['to'] ?? 0); $gift = trim((string) ($g['gift'] ?? ''));
            if ($from < 1 || $to < $from || $gift === '') continue;
            $gifts[] = ['from' => $from, 'to' => $to, 'gift' => mb_substr($gift, 0, 120)];
        }
        Settings::set('gifts', $gifts);
        $c = (array) ($in['campaign'] ?? []);
        Settings::set('campaign', [
            'title' => mb_substr(trim((string) ($c['title'] ?? '')), 0, 80),
            'ends_at' => mb_substr(trim((string) ($c['ends_at'] ?? '')), 0, 20),
            'note' => mb_substr(trim((string) ($c['note'] ?? '')), 0, 300),
        ]);
        json_out(['ok' => true, 'gifts' => Settings::gifts()]);

    case 'players':
        $q = trim((string) ($_GET['q'] ?? ''));
        $sql = 'SELECT p.id, p.name, p.phone, p.created_at, p.last_seen_at,
                       (SELECT MAX(score) FROM scores s WHERE s.player_id = p.id) AS best,
                       (SELECT COUNT(*) FROM scores s WHERE s.player_id = p.id) AS runs
                  FROM players p';
        $params = [];
        if ($q !== '') { $sql .= ' WHERE p.name LIKE ? OR p.phone LIKE ?'; $params = ["%$q%", "%$q%"]; }
        $sql .= ' ORDER BY p.created_at DESC LIMIT 200';
        json_out(['ok' => true, 'players' => Db::all($sql, $params)]);

    case 'export':
        $players = Db::all(
            'SELECT p.id, p.name, p.phone, p.created_at, p.last_seen_at,
                    COALESCE(t.best, 0) AS best, COALESCE(t.runs, 0) AS runs, t.last_run
               FROM players p
               LEFT JOIN (SELECT player_id, MAX(score) AS best, COUNT(*) AS runs, MAX(created_at) AS last_run FROM scores GROUP BY player_id) t ON t.player_id = p.id
              ORDER BY best DESC, t.last_run ASC, p.created_at ASC'
        );
        $rows = [['Rank', 'Name', 'Phone', 'Best score', 'Runs', 'Gift', 'Registered (UTC)', 'Last run (UTC)']];
        $rank = 0;
        foreach ($players as $p) {
            $rank++;
            $hasRuns = (int) $p['runs'] > 0;
            $rows[] = [$hasRuns ? $rank : '', $p['name'], $p['phone'], (int) $p['best'], (int) $p['runs'],
                       $hasRuns ? (Settings::giftForRank($rank) ?? '') : '', $p['created_at'], $p['last_run'] ?? ''];
        }
        $runs = [['Run ID', 'Name', 'Phone', 'Score', 'Distance (m)', 'Duration (s)', 'Played at (UTC)']];
        foreach (Db::all('SELECT s.id, p.name, p.phone, s.score, s.distance_m, s.duration_s, s.created_at FROM scores s JOIN players p ON p.id = s.player_id ORDER BY s.id DESC LIMIT 50000') as $r) {
            $runs[] = [(int) $r['id'], $r['name'], $r['phone'], (int) $r['score'], (float) $r['distance_m'], (float) $r['duration_s'], $r['created_at']];
        }
        $gifts = [['Rank from', 'Rank to', 'Gift']];
        foreach (Settings::gifts() as $g) $gifts[] = [(int) $g['from'], (int) $g['to'], $g['gift']];
        $file = 'diva-fresh-run-' . gmdate('Y-m-d-Hi') . '.xlsx';
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $file . '"');
        header('Cache-Control: no-store');
        echo Xlsx::build(['Leaderboard' => $rows, 'All runs' => $runs, 'Gifts' => $gifts]);
        exit;

    default:
        json_fail('Unknown action', 404);
}
