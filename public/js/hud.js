/** DOM heads-up display and overlay screens. */
export class Hud {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$('hud');
    this.score = this.$('hud-score');
    this.distance = this.$('hud-distance');
    this.lives = this.$('hud-lives');
    this.toast = this.$('hud-toast');
    this.screens = { loading: this.$('screen-loading'), cover: this.$('screen-cover'), register: this.$('screen-register'), otp: this.$('screen-otp'), over: this.$('screen-over') };
    this.loadBar = this.$('load-bar');
    this.loadText = this.$('load-text');
    this._toastTimer = 0;
  }

  setProgress(p, text) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.loadText.textContent = text;
  }

  show(name) {
    // Register / OTP are sheets that sit on top of the cover.
    const sheet = name === 'register' || name === 'otp';
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', !(k === name || (sheet && k === 'cover')));
    this.hud.classList.toggle('hidden', name !== null);
  }

  /** Position the poster layers from cover.json (fractions of the poster frame). */
  layoutCover(meta, images) {
    this.$('stage').style.backgroundImage = `url("${images.bg}")`;
    this.screens.cover.style.backgroundImage = `url("${images.bg}")`;   // blurred fill behind the letterbox
    for (const el of this.screens.cover.querySelectorAll('[data-layer]')) {
      const key = el.dataset.layer; const m = meta[key]; if (!m) continue;
      el.style.left = `${m.x * 100}%`; el.style.top = `${m.y * 100}%`;
      el.style.width = `${m.w * 100}%`; el.style.height = `${m.h * 100}%`;
      if (el.tagName === 'IMG') el.src = images[key];
      else el.style.backgroundImage = `url("${images[key]}")`;
    }
  }

  update({ score, distance, lives }) {
    this.score.textContent = Math.floor(score);
    this.distance.textContent = `${Math.floor(distance)} m`;
    if (this.lives.childElementCount !== lives) {
      this.lives.textContent = '';
      for (let i = 0; i < lives; i++) {
        const s = document.createElement('span');
        s.textContent = '❤';
        this.lives.appendChild(s);
      }
    }
  }

  flash(text, ms = 700) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  gameOver(score, distance) {
    this.$('final-score').textContent = Math.floor(score);
    this.$('final-distance').textContent = `${Math.floor(distance)} m`;
    this.$('final-best').textContent = '…';
    this.$('final-rank').textContent = 'Saving your run…';
    this.$('board').textContent = '';
    this.show('over');
  }

  /** Fill the game-over card with the server's answer (or the offline fallback). */
  result({ best, rank, gift, top = [], myName = '' }) {
    this.$('final-best').textContent = best;
    this.$('final-rank').textContent = rank ? `You are #${rank} on the leaderboard${gift ? ' · Prize: ' + gift : ''}` : '';
    const ol = this.$('board');
    ol.textContent = '';
    for (const row of top) {
      const li = document.createElement('li');
      if (row.name === myName && row.score === best) li.className = 'me';
      li.innerHTML = `<span class="rank">${row.rank}</span><span class="name"></span><span class="pts">${row.score}</span>`;
      li.querySelector('.name').textContent = row.name;
      ol.appendChild(li);
    }
  }

  error(id, msg) { this.$(id).textContent = msg || ''; }
  busy(id, on, label) { const b = this.$(id); b.disabled = on; if (label) b.textContent = label; }
}
