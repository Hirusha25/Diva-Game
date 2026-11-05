/**
 * Backend client. Talks to the PHP API next to the page (public/api/*.php).
 * In offline preview builds (window.__DIVA_OFFLINE) every call resolves
 * locally so the game is playable without a server.
 */
const BASE = globalThis.__DIVA_API_BASE || 'api/';
const OFFLINE = !!globalThis.__DIVA_OFFLINE;
const TOKEN_KEY = 'diva.token';
const NAME_KEY = 'diva.name';
const BEST_KEY = 'diva.best';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = store.get(TOKEN_KEY);
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || data.ok === false) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data = {}) { super(message); this.status = status; this.data = data; }
}

export const api = {
  offline: OFFLINE,
  hasToken: () => !!store.get(TOKEN_KEY),
  signOut: () => { store.set(TOKEN_KEY, null); store.set(NAME_KEY, null); },

  async register(name, phone) {
    if (OFFLINE) { store.set(NAME_KEY, name); return { ok: true, resend_in: 0, otp_length: 4, offline: true }; }
    return call('register.php', { method: 'POST', body: { name, phone }, auth: false });
  },

  async verify(phone, code) {
    if (OFFLINE) return { ok: true, player: { name: store.get(NAME_KEY) || 'Player', best: +store.get(BEST_KEY) || 0 } };
    const r = await call('verify.php', { method: 'POST', body: { phone, code }, auth: false });
    store.set(TOKEN_KEY, r.token);
    store.set(NAME_KEY, r.player.name);
    return r;
  },

  /** Returns the signed-in player or null (token missing / expired). */
  async me() {
    if (OFFLINE) {
      const name = store.get(NAME_KEY);
      return name ? { name, best: +store.get(BEST_KEY) || 0 } : null;
    }
    if (!store.get(TOKEN_KEY)) return null;
    try {
      return (await call('me.php')).player;
    } catch (e) {
      if (e.status === 401) store.set(TOKEN_KEY, null);
      return null;
    }
  },

  async submitScore(score, distance, duration) {
    const best = Math.max(+store.get(BEST_KEY) || 0, score);
    store.set(BEST_KEY, String(best));
    if (OFFLINE) return { score, best, rank: null, top: [] };
    return call('score.php', { method: 'POST', body: { score, distance, duration } });
  },

  async leaderboard() {
    if (OFFLINE) return { top: [] };
    return call('leaderboard.php', { auth: false });
  },
};
