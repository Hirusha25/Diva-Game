/**
 * All game audio, synthesised with the Web Audio API (no audio files).
 *  - music: cheerful C-major loop (I–V–vi–IV), tempo follows run speed
 *  - sfx: tap, start, pickup (rising streak), hit (stain splat), jump, lane, game over
 *  - ambience: occasional soft birdsong during the run
 * Browsers only allow sound after a user gesture, so unlock() is called on the
 * first tap. Every sound takes an optional start time so it can also be
 * rendered offline (OfflineAudioContext) for previews.
 */
const MUTE_KEY = 'diva.muted';
const store = {
  get: () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } },
  set: (v) => { try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* private mode */ } },
};
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// 4 bars × 8 eighths, MIDI notes (0 = rest). Chords: C, G, Am, F.
const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
const MELODY = [
  [76, 79, 84, 79, 76, 79, 81, 79],
  [74, 79, 83, 79, 74, 79, 81, 83],
  [84, 81, 76, 81, 84, 83, 81, 79],
  [81, 77, 84, 81, 77, 81, 79, 76],
];
const MELODY_B = [
  [79, 0, 79, 81, 84, 0, 81, 79],
  [83, 0, 81, 79, 74, 0, 79, 0],
  [81, 0, 84, 83, 81, 0, 76, 79],
  [77, 79, 81, 84, 83, 81, 79, 0],
];

export class Sound {
  constructor(ctx = null) {
    this.ctx = ctx;
    this.muted = ctx ? false : store.get();
    this.musicOn = false;
    this.bpm = 112;
    this.step = 0;
    this.nextNote = 0;
    this.streak = 0;
    this.lastPickup = -10;
    this.birdTimer = 0;
    if (ctx) this._graph();
  }

  // ------------------------------------------------------------ setup
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._graph();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend(); else if (!this.muted) this.ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended' && !this.muted) this.ctx.resume();
  }

  _graph() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.75; this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.22; this.ambBus.connect(this.master);
    // white-noise buffer shared by noisy sounds
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (!(this.ctx instanceof OfflineAudioContext)) store.set(m);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.05);
    if (!m && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return !!this.ctx && this.ctx.state !== 'closed'; }
  _t(at) { return at ?? this.ctx.currentTime + 0.01; }

  // ------------------------------------------------------------ building blocks
  _tone(freq, t, dur, { type = 'sine', gain = 0.3, to = null, attack = 0.005, dest = this.sfxBus, pan = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(t, dur, { gain = 0.3, type = 'lowpass', freq = 1200, to = null, q = 1, dest = this.sfxBus } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ sound effects
  tap(at) { if (!this.ready) return; const t = this._t(at); this._tone(880, t, 0.09, { type: 'sine', gain: 0.25, to: 1320 }); }

  start(at) {
    if (!this.ready) return; const t = this._t(at);
    [60, 64, 67, 72, 76].forEach((n, i) => this._tone(midi(n + 12), t + i * 0.07, 0.28, { type: 'triangle', gain: 0.28 }));
    this._noise(t, 0.5, { gain: 0.12, type: 'highpass', freq: 3000, to: 9000 });
  }

  /** Countdown 3-2-1: a round "ding" (a little higher each beat); GO: a bright rising chord with a sparkle. */
  countdown(n, at) {
    if (!this.ready) return; const t = this._t(at);
    const base = { 3: 67, 2: 69, 1: 71 }[n] ?? 67;
    this._tone(midi(base + 12), t, 0.32, { type: 'triangle', gain: 0.34 });
    this._tone(midi(base + 24), t, 0.18, { type: 'sine', gain: 0.1 });
    this._tone(midi(base), t, 0.2, { type: 'sine', gain: 0.18 });
  }
  go(at) {
    if (!this.ready) return; const t = this._t(at);
    [72, 76, 79, 84].forEach((n, i) => this._tone(midi(n + 12), t + i * 0.045, 0.55, { type: 'triangle', gain: 0.26 }));
    this._tone(midi(60), t, 0.5, { type: 'sine', gain: 0.3, to: midi(72) });
    this._noise(t + 0.05, 0.45, { gain: 0.1, type: 'highpass', freq: 4000, to: 10000 });
  }

  /** Diva pack picked up: a bright chime that climbs while you keep collecting. */
  pickup(at) {
    if (!this.ready) return; const t = this._t(at);
    this.streak = t - this.lastPickup < 1.6 ? Math.min(this.streak + 1, 7) : 0;
    this.lastPickup = t;
    const ladder = [0, 2, 4, 7, 9, 12, 14, 16];
    const base = 76 + ladder[this.streak];
    this._tone(midi(base), t, 0.16, { type: 'triangle', gain: 0.3 });
    this._tone(midi(base + 7), t + 0.06, 0.24, { type: 'sine', gain: 0.24 });
    this._tone(midi(base + 19), t + 0.06, 0.18, { type: 'sine', gain: 0.06 });
  }

  /** Ran into a stain: soft splat + thud, music ducks for a moment. */
  hit(at) {
    if (!this.ready) return; const t = this._t(at);
    this._noise(t, 0.32, { gain: 0.5, type: 'lowpass', freq: 1400, to: 180, q: 2 });
    this._tone(150, t, 0.3, { type: 'sine', gain: 0.55, to: 55 });
    this._tone(midi(55), t + 0.05, 0.25, { type: 'square', gain: 0.06, to: midi(50) });
    if (!(this.ctx instanceof OfflineAudioContext)) {
      const g = this.musicBus.gain; g.cancelScheduledValues(t);
      g.setValueAtTime(0.1, t); g.linearRampToValueAtTime(0.32, t + 0.9);
    }
  }

  jump(at) {
    if (!this.ready) return; const t = this._t(at);
    this._noise(t, 0.28, { gain: 0.22, type: 'bandpass', freq: 600, to: 3200, q: 3 });
    this._tone(330, t, 0.22, { type: 'sine', gain: 0.18, to: 660 });
  }

  lane(dir = 1, at) {
    if (!this.ready) return; const t = this._t(at);
    this._noise(t, 0.12, { gain: 0.16, type: 'bandpass', freq: dir > 0 ? 1800 : 1400, to: dir > 0 ? 3200 : 900, q: 4 });
  }

  gameOver(at) {
    if (!this.ready) return; const t = this._t(at);
    [79, 76, 72, 67].forEach((n, i) => this._tone(midi(n), t + i * 0.16, 0.35, { type: 'triangle', gain: 0.26 }));
    this._tone(midi(48), t + 0.64, 0.8, { type: 'sine', gain: 0.3 });
  }

  // ------------------------------------------------------------ music
  /** Schedules music steps (eighth notes) whose time falls before `until`. */
  scheduleMusic(until) {
    const eighth = () => 60 / this.bpm / 2;
    while (this.nextNote < until) {
      const t = this.nextNote, s = this.step;
      const bar = Math.floor(s / 8) % 4, beat = s % 8, section = Math.floor(s / 32) % 2;
      const chord = CHORDS[bar];
      const e = eighth();
      // bass on beats, octave hop on the 'and' of 4
      if (beat % 2 === 0) this._tone(midi(chord[0] - 12 + (beat === 6 ? 12 : 0)), t, e * 1.7, { type: 'triangle', gain: 0.42, dest: this.musicBus });
      // soft chord stabs on 2 and 4
      if (beat === 2 || beat === 6) chord.forEach((n) => this._tone(midi(n + 12), t, e * 1.4, { type: 'sine', gain: 0.07, dest: this.musicBus }));
      // melody
      const note = (section ? MELODY_B : MELODY)[bar][beat];
      if (note) this._tone(midi(note), t, e * 0.9, { type: 'triangle', gain: 0.16, dest: this.musicBus, pan: 0.15 });
      // light kick + hats
      if (beat === 0 || beat === 4) this._tone(110, t, 0.12, { type: 'sine', gain: 0.4, to: 45, dest: this.musicBus });
      if (beat % 2 === 1) this._noise(t, 0.04, { gain: 0.08, type: 'highpass', freq: 7000, dest: this.musicBus });
      this.nextNote += e;
      this.step++;
    }
  }

  startMusic() {
    if (!this.ready || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicBus.gain.setValueAtTime(0.32, this.ctx.currentTime);
    this._timer = setInterval(() => {
      this.scheduleMusic(this.ctx.currentTime + 0.15);
      this._birds();
    }, 25);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this._timer);
    if (!this.ready) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.4);
    setTimeout(() => { if (!this.musicOn && this.ready) g.setValueAtTime(0.32, this.ctx.currentTime); }, 500);
  }

  /** Tempo follows the runner: 0 = start speed, 1 = top speed. */
  setIntensity(x) { this.bpm = 112 + 20 * Math.max(0, Math.min(1, x)); }

  // ------------------------------------------------------------ ambience
  bird(at, pan = 0) {
    if (!this.ready) return; const t = this._t(at);
    const n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1200;
    for (let i = 0; i < n; i++) this._tone(base, t + i * 0.11, 0.08, { type: 'sine', gain: 0.5, to: base * (1.25 + Math.random() * 0.3), dest: this.ambBus, pan });
  }

  _birds() {
    const now = this.ctx.currentTime;
    if (now < this.birdTimer) return;
    if (this.birdTimer) this.bird(now + 0.05, Math.random() < 0.5 ? -0.7 : 0.7);
    this.birdTimer = now + 3 + Math.random() * 5;
  }
}
