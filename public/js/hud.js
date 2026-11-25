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
    this.$('shirt-meter').classList.toggle('danger', clean < 0.32);
    this.distance.textContent = `${Math.floor(distance)} m`;
    this.lives.textContent = `${Math.max(0, lives)}/${this.maxLives || lives}`;
  }

  /** writes text into el, with "Diva" (and "Fresh") set in the Diva logo's colours and slant */
  _branded(el, text) {
    const parts = String(text).split(/(Diva Fresh|Diva)/);
    parts.forEach((part, i) => {
      if (part === 'Diva' || part === 'Diva Fresh') {
        // a white logo badge: red "Diva" (+ blue "FRESH"), so the brand stands out from the rest of the line
        const badge = document.createElement('span'); badge.className = 'dwb';
        const w = document.createElement('span'); w.className = 'dw'; w.textContent = 'Diva'; badge.append(w);
        if (part === 'Diva Fresh') { const f = document.createElement('span'); f.className = 'dw-fresh'; f.textContent = 'FRESH'; badge.append(f); }
        if (/^[!?.,]/.test(parts[i + 1] || '')) badge.classList.add('before-punct');
        el.append(badge);
      } else if (part) el.append(part);
    });
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

  /** a ruined shirt drops away: big falling shirt + "2 Shirts Left!!" */
  shirtDrop(left) {
    const el = this.$('shirt-drop');
    el.querySelector('.sd-title').textContent = left <= 0 ? 'No Shirts Left!' : left === 1 ? 'Last Shirt!!' : `${left} Shirts Left!!`;
    el.querySelector('.sd-sub').textContent = left <= 0 ? 'Run over' : 'Shirt ruined! Grab Diva to keep it clean';
    el.classList.remove('hidden', 'go'); void el.offsetWidth; el.classList.add('go');
    const pill = this.lives.parentElement; pill.classList.remove('hurt'); void pill.offsetWidth; pill.classList.add('hurt');
    clearTimeout(this._dropT); this._dropT = setTimeout(() => el.classList.add('hidden'), 1900);
  }

  /** the shirt came back spotless: a bigger sparkling pop-up */
  celebrate(text) {
    this.flash(text, 1300, 'bonus', 'Diva Clean');
    const m = this.$('shirt-meter'); m.classList.remove('cheer'); void m.offsetWidth; m.classList.add('cheer');
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

  /** End of run: show the card straight away (score counts up), the verdict follows from the server. */
  gameOver(score, distance, packs = 0) {
    const sc = this.screens.over; sc.dataset.mood = 'pending';
    this.$('ov-title').textContent = 'Run Over!';
    this.$('ov-msg').textContent = 'Saving your run…';
    this.$('ov-packs').textContent = packs;
    this.$('final-best').textContent = '…';
    this.$('final-rank').textContent = '';
    this.$('board').textContent = ''; this.$('ov-confetti').textContent = '';
    const el = this.$('final-score'), end = Math.floor(score), t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1 && !sc.classList.contains('hidden')) requestAnimationFrame(tick); };
    el.textContent = '0'; this.show('over'); requestAnimationFrame(tick);
    void distance;
  }

  /**
   * The verdict: 'winner' (the rank is in a prize band), 'best' (a new personal
   * best) or 'thanks'. Every outcome thanks the player.
   */
  result({ best, rank, gift, gifts = [], top = [], myName = '', newBest = false }) {
    const sc = this.screens.over;
    const zone = gifts.reduce((m, g) => Math.max(m, +g.to || 0), 0) || 10;
    const mood = gift ? 'winner' : newBest ? 'best' : 'thanks';
    sc.dataset.mood = mood;
    this.$('final-best').textContent = best;
    const msg = this.$('ov-msg'), title = this.$('ov-title');
    const bold = (t) => { const b = document.createElement('b'); b.textContent = t; return b; };
    msg.textContent = '';
    if (mood === 'winner') {
      title.textContent = "You're a Winner!";
      this.$('ov-medal').textContent = `#${rank}`; this.$('ov-gift-name').textContent = gift;
      msg.append('Thank you for playing ', bold('Diva Fresh Run'), '! You are ', bold(`#${rank}`), ` and in the prize zone. Stay in the top ${zone} until the leaderboard closes!`);
    } else if (mood === 'best') {
      title.textContent = 'New Best Score!';
      msg.append('Thank you for playing! You beat your best score.', rank ? ` You are #${rank}: reach the top ${zone} to win a Diva prize.` : ' Run again to climb even higher!');
    } else {
      title.textContent = 'Thank You!';
      msg.append('Thank you for playing ', bold('Diva Fresh Run'), '!', rank ? ` You are #${rank}. Reach the top ${zone} to win a Diva prize. Run again!` : ' Grab more Diva packs and keep your shirts fresh to score higher.');
    }
    this.$('final-rank').textContent = '';   // the message already gives the rank; this line is kept for save errors
    requestAnimationFrame(() => this.fitText(title));
    // confetti for a winner (lots) or a new best (some)
    const cf = this.$('ov-confetti'); cf.textContent = '';
    const n = mood === 'winner' ? 36 : mood === 'best' ? 20 : 0, cols = ['#e3262e', '#ffd400', '#1d5fc4', '#2fb4ff', '#47d16b', '#ffffff', '#ff8a1e'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--d:${(1.8 + Math.random() * 1.6).toFixed(2)}s;--del:${(-Math.random() * 3).toFixed(2)}s;--r:${Math.round(360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)}deg;width:${6 + Math.random() * 5}px;height:${9 + Math.random() * 6}px`;
      cf.appendChild(c);
    }
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
