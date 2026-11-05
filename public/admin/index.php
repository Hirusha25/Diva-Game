<?php
require __DIR__ . '/../../src/bootstrap.php';
session_name('diva_admin');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
$signedIn = Auth::isAdmin();
$csrf = $_SESSION['csrf'] ?? '';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diva Fresh Run · Admin</title>
<link rel="stylesheet" href="admin.css">
</head>
<body data-signed-in="<?= $signedIn ? '1' : '0' ?>" data-csrf="<?= htmlspecialchars($csrf) ?>">
<header class="top">
  <div class="brand"><span class="dot"></span> Diva Fresh Run <small>admin</small></div>
  <nav id="nav" class="<?= $signedIn ? '' : 'hidden' ?>">
    <a href="#live" class="active">Live top 10</a>
    <a href="#gifts">Gifts</a>
    <a href="#players">Players</a>
    <a href="api.php?action=export" class="btn small" id="btn-export">Download Excel</a>
    <button class="link" id="btn-logout">Sign out</button>
  </nav>
</header>

<main>
  <section id="login" class="card narrow <?= $signedIn ? 'hidden' : '' ?>">
    <h1>Sign in</h1>
    <form id="form-login">
      <label>Username <input name="username" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <p class="error" id="login-error"></p>
      <button class="btn" type="submit">Sign in</button>
    </form>
  </section>

  <div id="app" class="<?= $signedIn ? '' : 'hidden' ?>">
    <section class="stats" id="stats">
      <div class="stat"><span class="label">Players</span><strong data-k="players">–</strong><small data-k="players_today"></small></div>
      <div class="stat"><span class="label">Runs</span><strong data-k="runs">–</strong><small data-k="runs_today"></small></div>
      <div class="stat"><span class="label">Top score</span><strong data-k="top_score">–</strong></div>
      <div class="stat live"><span class="label">Live</span><strong id="clock">–</strong><small>refreshes every 5 s</small></div>
    </section>

    <section id="live" class="card">
      <h2>Live top 10 <span class="pulse" id="pulse"></span></h2>
      <table class="table" id="top-table">
        <thead><tr><th>#</th><th>Name</th><th>Phone</th><th class="num">Best</th><th class="num">Runs</th><th>Last run</th><th>Gift</th></tr></thead>
        <tbody><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
      </table>
    </section>

    <section id="gifts" class="card">
      <h2>Gift settings</h2>
      <p class="muted">Prizes by leaderboard rank. These appear on the game-over screen and in the Excel export.</p>
      <form id="form-gifts">
        <div class="grid3">
          <label>Campaign title <input name="title" maxlength="80"></label>
          <label>Ends on <input name="ends_at" type="date"></label>
          <label>Note for players <input name="note" maxlength="300" placeholder="e.g. Winners will be contacted by SMS"></label>
        </div>
        <table class="table" id="gift-table">
          <thead><tr><th>Rank from</th><th>Rank to</th><th>Gift</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="row">
          <button type="button" class="btn ghost" id="btn-add-gift">+ Add tier</button>
          <button type="submit" class="btn">Save gifts</button>
          <span class="muted" id="gift-status"></span>
        </div>
      </form>
    </section>

    <section id="players" class="card">
      <h2>Players</h2>
      <div class="row"><input id="player-search" placeholder="Search name or phone" autocomplete="off"><span class="muted" id="player-count"></span></div>
      <table class="table" id="player-table">
        <thead><tr><th>Name</th><th>Phone</th><th class="num">Best</th><th class="num">Runs</th><th>Registered</th><th>Last seen</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>
  </div>
</main>
<script src="admin.js"></script>
</body>
</html>
