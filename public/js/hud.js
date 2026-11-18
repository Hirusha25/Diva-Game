/** DOM heads-up display and overlay screens. */
export class Hud {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$('hud');
    this.score = this.$('hud-score');
    this.distance = this.$('hud-distance');
    this.lives = this.$('hud-lives');
    this.toast = this.$('hud-toast');
    this.screens = { loading: this.$('screen-loading'), cover: this.$('screen-cover'), otp: this.$('screen-otp'), over: this.$('screen-over'), pause: this.$('screen-pause') };
    this.loadBar = this.$('load-bar');
    this.loadText = this.$('load-text');
    this._toastTimer = 0;
  }

  setProgress(p, text) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.loadText.textContent = text;
  }

  show(name) {
    requestAnimationFrame(() => { for (const t of document.querySelectorAll('.screen:not(.hidden) .card > .subtitle')) this.fitText(t); });
    // Consent / OTP are sheets that sit on top of the cover (registration
    // itself is a mode of the cover poster: see main.js showRegister).
    const sheet = name === 'otp';
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
      const img = images[el.dataset.img || key];
      if (el.tagName === 'IMG') el.src = img;
      else el.style.backgroundImage = `url("${img}")`;
      // CSS custom properties resolve URLs against the stylesheet, so pass an absolute URL.
      if (key === 'start' || key === 'submit') el.style.setProperty('--start-img', `url("${new URL(images[key], document.baseURI).href}")`);   // the shine is masked to the button's own shape
    }
    // card box behind each section of the full consent text
    // shared UI art for every panel screen (pause, game over, code entry, consent)
    const abs = (u) => `url("${new URL(u, document.baseURI).href}")`;
    for (const [v, k] of [['--card-plain', 'cardPlain'], ['--ui-banner', 'banner'], ['--ui-button', 'button']]) if (images[k]) document.documentElement.style.setProperty(v, abs(images[k]));
    // ticked-box overlays inside the consent cards (fractions of the card)
    for (const el of this.screens.cover.querySelectorAll('[data-tick]')) {
      const t = meta.tick, p = t[el.dataset.tick];
      el.style.left = `${p.x * 100}%`; el.style.top = `${p.y * 100}%`;
      el.style.width = `${t.w * 100}%`; el.style.height = `${t.h * 100}%`;
      el.style.backgroundImage = `url("${images.tick}")`;
    }
  }

  update({ score, distance, lives, maxLives, packs = 0, clean = 0 }) {
    this.maxLives = maxLives;
    this.score.textContent = Math.floor(score);
    const pk = this.$('hud-packs');
    if (pk.textContent !== String(packs)) { pk.textContent = packs; const pill = pk.parentElement; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    this.$('sm-fill').style.height = `${Math.round(clean * 100)}%`;
    this.$('shirt-meter').classList.toggle('full', clean > 0.97);
    this.distance.textContent = `${Math.floor(distance)} m`;
    this.lives.textContent = `${Math.max(0, lives)}/${this.maxLives || lives}`;
  }

  /** writes text into el, with "Diva" (and "Fresh") set in the Diva logo's colours and slant */
  _branded(el, text) {
    for (const part of String(text).split(/(Diva Fresh|Diva)/)) {
      if (part === 'Diva' || part === 'Diva Fresh') {
        const w = document.createElement('span'); w.className = 'dw'; w.textContent = 'Diva'; el.append(w);
        if (part === 'Diva Fresh') { const f = document.createElement('span'); f.className = 'dw dw-fresh'; f.textContent = 'FRESH'; el.append(f); }
      } else if (part) el.append(part);
    }
  }

  /** shrink a title until its text fits the space it sits in (long titles on the banner) */
  fitText(el) {
    el.style.fontSize = '';
    // the space: the element's own content box if it is a block, else its parent's
    const box = getComputedStyle(el).display === 'flex' ? el : el.parentElement;
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const r = document.createRange(); r.selectNodeContents(el);
    let size = parseFloat(getComputedStyle(el).fontSize); const floor = size * 0.6;
    for (let i = 0; i < 14 && r.getBoundingClientRect().width > avail && size > floor; i++) { size *= 0.95; el.style.fontSize = `${size}px`; }
  }

  /** kind: pack | bonus | stain | dust | bus (colour of the pop-up) */
  flash(text, ms = 700, kind = 'pack', sub = '') {
    this.toast.textContent = '';
    this._branded(this.toast, text);
    if (sub) { const s = document.createElement('small'); this._branded(s, sub); this.toast.append(s); }
    this.toast.className = `toast t-${kind}`;
    void this.toast.offsetWidth;
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
