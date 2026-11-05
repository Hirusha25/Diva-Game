(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const body = document.body;
  let csrf = body.dataset.csrf || '';
  let pollTimer = 0;

  async function api(action, opts = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF': csrf };
    const res = await fetch(`api.php?action=${action}${opts.query || ''}`, { method: opts.body ? 'POST' : 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && action !== 'login') { showLogin(); throw new Error('Signed out'); }
    if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (iso) => iso ? iso.replace('T', ' ').slice(0, 16) : '–';

  // ---------------- auth
  function showLogin() { clearInterval(pollTimer); $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#nav').classList.add('hidden'); }
  function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#nav').classList.remove('hidden'); boot(); }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#login-error').textContent = '';
    try {
      const r = await api('login', { body: { username: f.get('username'), password: f.get('password') } });
      csrf = r.csrf; showApp();
    } catch (err) { $('#login-error').textContent = err.message; }
  });
  $('#btn-logout').addEventListener('click', async () => { await api('logout').catch(() => {}); showLogin(); });

  // ---------------- live board + stats
  async function refreshLive() {
    try {
      const [{ top, updated_at }, { stats }] = await Promise.all([api('top'), api('stats')]);
      const tb = $('#top-table tbody');
      tb.innerHTML = top.length ? top.map((t) => `<tr class="r${t.rank}"><td>${t.rank}</td><td>${esc(t.name)}</td><td>${esc(t.phone)}</td><td class="num">${t.score}</td><td class="num">${t.runs}</td><td>${fmt(t.last_run)}</td><td class="gift">${esc(t.gift || '')}</td></tr>`).join('')
        : '<tr><td colspan="7" class="muted">No runs yet.</td></tr>';
      for (const [k, v] of Object.entries(stats)) {
        document.querySelectorAll(`[data-k="${k}"]`).forEach((el) => { el.textContent = el.tagName === 'SMALL' ? `+${v} today` : v; });
      }
      $('#clock').textContent = updated_at.slice(11, 19) + ' UTC';
      $('#pulse').classList.add('tick'); setTimeout(() => $('#pulse').classList.remove('tick'), 250);
    } catch (err) { console.warn(err); }
  }

  // ---------------- gifts
  function giftRow(g = { from: '', to: '', gift: '' }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="w-sm" name="from" type="number" min="1" value="${esc(g.from)}" required></td>
      <td><input class="w-sm" name="to" type="number" min="1" value="${esc(g.to)}" required></td>
      <td><input name="gift" value="${esc(g.gift)}" maxlength="120" required></td>
      <td><button type="button" class="btn ghost small remove">Remove</button></td>`;
    tr.querySelector('.remove').addEventListener('click', () => tr.remove());
    return tr;
  }
  async function loadGifts() {
    const { gifts, campaign } = await api('gifts');
    const tb = $('#gift-table tbody'); tb.innerHTML = '';
    gifts.forEach((g) => tb.appendChild(giftRow(g)));
    const f = $('#form-gifts');
    f.title.value = campaign.title || ''; f.ends_at.value = campaign.ends_at || ''; f.note.value = campaign.note || '';
  }
  $('#btn-add-gift').addEventListener('click', () => $('#gift-table tbody').appendChild(giftRow()));
  $('#form-gifts').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const gifts = [...$('#gift-table tbody').children].map((tr) => ({ from: +tr.querySelector('[name=from]').value, to: +tr.querySelector('[name=to]').value, gift: tr.querySelector('[name=gift]').value.trim() }));
    const status = $('#gift-status');
    status.textContent = 'Saving…';
    try {
      await api('save_gifts', { body: { gifts, campaign: { title: f.title.value, ends_at: f.ends_at.value, note: f.note.value } } });
      status.textContent = 'Saved'; await loadGifts(); refreshLive();
    } catch (err) { status.textContent = err.message; }
    setTimeout(() => { status.textContent = ''; }, 3000);
  });

  // ---------------- players
  let searchTimer = 0;
  async function loadPlayers() {
    const q = $('#player-search').value.trim();
    const { players } = await api('players', { query: q ? `&q=${encodeURIComponent(q)}` : '' });
    $('#player-table tbody').innerHTML = players.length ? players.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td class="num">${p.best ?? 0}</td><td class="num">${p.runs}</td><td>${fmt(p.created_at)}</td><td>${fmt(p.last_seen_at)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">No players found.</td></tr>';
    $('#player-count').textContent = `${players.length} shown`;
  }
  $('#player-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadPlayers, 300); });

  // ---------------- nav highlight
  document.querySelectorAll('nav a[href^="#"]').forEach((a) => a.addEventListener('click', () => {
    document.querySelectorAll('nav a').forEach((x) => x.classList.remove('active')); a.classList.add('active');
  }));

  function boot() {
    refreshLive(); loadGifts().catch(console.warn); loadPlayers().catch(console.warn);
    clearInterval(pollTimer); pollTimer = setInterval(refreshLive, 5000);
  }
  if (body.dataset.signedIn === '1') boot();
})();
