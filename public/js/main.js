import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { createSky, CloudField } from './sky.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { Spawner } from './spawner.js';
import { api } from './api.js';
import { Sound } from './audio.js';
import { SPEED, LIVES, SCORE_PICKUP, SCORE_PER_METRE, INVULNERABLE_TIME, COLORS, REQUIRE_REGISTRATION } from './config.js';

const canvas = document.getElementById('game');
const hud = new Hud();
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------- sound
const sound = new Sound();
const soundBtn = $('btn-sound');
const paintSound = () => { soundBtn.classList.toggle('muted', sound.muted); soundBtn.setAttribute('aria-pressed', String(sound.muted)); soundBtn.setAttribute('aria-label', sound.muted ? 'Turn sound on' : 'Mute sound'); };
paintSound();
// Browsers allow audio only after a user gesture: unlock on the first tap/key.
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
soundBtn.addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.setMuted(!sound.muted); paintSound(); if (!sound.muted) sound.tap(); });

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.fog, 80, 210);
scene.add(createSky());

// Sun high and slightly behind the camera so both sides of the street are lit;
// the hemisphere light fills the faces that look away from it.
const hemi = new THREE.HemisphereLight(0xf4f6f8, 0x9a8a60, 1.5); // near-neutral so the road stays grey
const sun = new THREE.DirectionalLight(0xfff1d9, 2.0);
sun.position.set(3, 18, 10);
scene.add(hemi, sun);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 420);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (h > w) {
    // Portrait: lock the HORIZONTAL view angle (approved framing was tuned on
    // a 390x844 frame = 68° vertical). Browser bars make the visible area
    // shorter and wider; keeping the horizontal angle constant keeps the road,
    // trees and player the same size regardless of the bar height.
    const halfH = Math.tan(THREE.MathUtils.degToRad(68 / 2)) * (390 / 844);
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(halfH / camera.aspect)), 45, 75);
  } else {
    camera.fov = 55;
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --------------------------------------------------------------------- state
const state = {
  mode: 'loading',          // loading | register | otp | lobby | running | over
  speed: SPEED.lobby,
  distance: 0,
  score: 0,
  lives: LIVES,
  invulnerable: 0,
  runStart: 0,
};
let world, player, spawner, cloudField;
let me = null;               // { name, best } once signed in
let pendingPhone = '';
let resendTimer = 0;

const controls = new Controls(canvas, (action) => {
  if (state.mode !== 'running') return;
  if (action === 'left') { const l = player.lane; player.moveLane(-1); if (player.lane !== l) sound.lane(-1); }
  else if (action === 'right') { const l = player.lane; player.moveLane(1); if (player.lane !== l) sound.lane(1); }
  else if (action === 'up') { if (!player.isAirborne) sound.jump(); player.jump(); }
});

// ----------------------------------------------------------------- screens
function showLobby() {
  state.mode = 'lobby';
  const g = $('lobby-greeting'); g.textContent = '';
  if (REQUIRE_REGISTRATION && me) {
    const first = String(me.name).trim().split(/\s+/)[0];
    g.append(`Hi ${first}!  ·  Best `);
    const b = document.createElement('b'); b.textContent = String(me.best); g.append(b);
  }
  $('btn-signout').classList.toggle('hidden', !REQUIRE_REGISTRATION || !me);
  hud.screens.cover.classList.remove('leaving', 'reg');
  hud.show('cover');
}

function pop(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
$('btn-logo').addEventListener('click', () => { pop($('btn-logo')); sound.tap(); });
$('btn-tagline').addEventListener('click', () => { pop($('btn-tagline')); sound.tap(); });
$('btn-back-cover').addEventListener('click', showLobby);
$('btn-home').addEventListener('click', () => { sound.tap(); sound.stopMusic(); showLobby(); });

// Registration is a mode of the cover poster (the form layers replace the
// heroes and START). Gender and the two consents are set by tapping.
function showRegister() {
  state.mode = 'register';
  hud.error('reg-error', '');
  hud.screens.cover.classList.remove('leaving');
  hud.screens.cover.classList.add('reg');
  hud.show('cover');
}
const regChoice = { gender: null };
for (const b of document.querySelectorAll('.reg .gender')) {
  b.addEventListener('click', () => {
    regChoice.gender = b.dataset.gender;
    for (const o of document.querySelectorAll('.reg .gender')) o.setAttribute('aria-checked', String(o === b));
    sound.tap(); hud.error('reg-error', '');
  });
}
for (const card of document.querySelectorAll('.reg .consent')) {
  const toggle = () => { card.setAttribute('aria-checked', String(card.getAttribute('aria-checked') !== 'true')); sound.tap(); hud.error('reg-error', ''); };
  card.addEventListener('click', (e) => { if (!e.target.closest('.consent-link')) toggle(); });
  card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
}
$('btn-read-consent').addEventListener('click', (e) => { e.stopPropagation(); sound.tap(); hud.show('consent'); });
$('btn-consent-close').addEventListener('click', () => { hud.show('cover'); });
const checked = (id) => $(id).getAttribute('aria-checked') === 'true';

function showOtp(phone, resendIn) {
  state.mode = 'otp';
  pendingPhone = phone;
  $('otp-phone').textContent = phone.startsWith('94') ? '0' + phone.slice(2) : phone;
  $('otp-code').value = '';
  hud.error('otp-error', '');
  hud.busy('btn-verify', false, 'VERIFY');
  startResendCountdown(resendIn);
  hud.show('otp');
  setTimeout(() => $('otp-code').focus(), 50);
}

function startResendCountdown(seconds) {
  clearInterval(resendTimer);
  const btn = $('btn-resend');
  let left = seconds;
  const tick = () => {
    if (left <= 0) { btn.disabled = false; btn.textContent = 'Resend code'; clearInterval(resendTimer); return; }
    btn.disabled = true; btn.textContent = `Resend in ${left}s`; left -= 1;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

$('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('reg-name').value.trim();
  const phone = $('reg-phone').value.trim();
  hud.error('reg-error', '');
  if (name.length < 2) { $('reg-name').focus(); return hud.error('reg-error', 'Please enter your full name'); }
  if (phone.replace(/\D/g, '').length < 9) { $('reg-phone').focus(); return hud.error('reg-error', 'Please enter your contact number'); }
  if (!regChoice.gender) return hud.error('reg-error', 'Please select Male or Female');
  if (!checked('consent-game')) return hud.error('reg-error', 'Please tick the required consent');
  const btn = $('btn-register'); btn.disabled = true; sound.tap();
  try {
    const r = await api.register(name, phone, { gender: regChoice.gender, consentGame: true, consentMarketing: checked('consent-marketing') });
    if (r.offline) { me = { name, best: 0 }; return startRun(); }
    showOtp(r.phone, r.resend_in);
  } catch (err) {
    hud.error('reg-error', err.message);
  } finally {
    btn.disabled = false;
  }
});

$('form-otp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('otp-code').value.trim();
  if (code.length < 4) return hud.error('otp-error', 'Enter the 4-digit code from the SMS');
  hud.busy('btn-verify', true, 'CHECKING…');
  try {
    const r = await api.verify(pendingPhone, code);
    me = r.player;
    startRun();
  } catch (err) {
    hud.error('otp-error', err.message);
    hud.busy('btn-verify', false, 'VERIFY');
  }
});

$('btn-resend').addEventListener('click', async () => {
  hud.error('otp-error', '');
  try {
    const r = await api.register($('reg-name').value.trim(), pendingPhone, { gender: regChoice.gender, consentGame: true, consentMarketing: checked('consent-marketing') });
    startResendCountdown(r.resend_in);
  } catch (err) {
    hud.error('otp-error', err.message);
    if (err.data?.resend_in) startResendCountdown(err.data.resend_in);
  }
});

$('btn-change').addEventListener('click', showRegister);
$('btn-signout').addEventListener('click', () => { api.signOut(); me = null; showRegister(); });
// START: signed in → run; otherwise register first, then run straight after the code.
$('btn-start').addEventListener('click', () => { if (!REQUIRE_REGISTRATION || me) startRun(); else showRegister(); });
$('btn-retry').addEventListener('click', startRun);

// ------------------------------------------------------------------- game
function startRun() {
  // Fade the poster out over the live 3D world.
  const cover = hud.screens.cover;
  if (!cover.classList.contains('hidden')) {
    cover.classList.add('leaving');
    setTimeout(() => { cover.classList.remove('leaving', 'reg'); cover.classList.add('hidden'); }, 320);
  }
  sound.unlock();
  sound.start();
  sound.startMusic();
  state.mode = 'running';
  state.speed = SPEED.start;
  state.distance = 0;
  state.score = 0;
  state.lives = LIVES;
  state.invulnerable = 0;
  state.runStart = performance.now();
  player.reset();
  spawner.reset();
  player.group.visible = true;
  for (const [k, el] of Object.entries(hud.screens)) if (k !== 'cover') el.classList.add('hidden');
  hud.hud.classList.remove('hidden');
  hud.update(state);
}

async function endRun() {
  state.mode = 'over';
  sound.stopMusic();
  sound.gameOver();
  const score = Math.floor(state.score);
  const distance = state.distance;
  const duration = (performance.now() - state.runStart) / 1000;
  hud.gameOver(score, distance);
  try {
    const r = await api.submitScore(score, distance, duration);
    if (me) me.best = Math.max(me.best || 0, r.best);
    hud.result({ best: r.best, rank: r.rank, gift: r.gift, top: r.top, myName: me?.name });
  } catch (err) {
    hud.result({ best: Math.max(me?.best || 0, score), rank: null, top: [] });
    $('final-rank').textContent = err.status === 401 ? 'Session expired. Sign in again to save scores.' : 'Could not save this run: ' + err.message;
  }
}

// ---------------------------------------------------------------------- boot
try {
  hud.setProgress(0.05, 'Loading world…');
  const assets = await loadAssets((p) => hud.setProgress(0.05 + p * 0.85));
  cloudField = new CloudField(assets.clouds);
  scene.add(cloudField.group);
  world = new World(scene, assets);
  player = new Player(scene, assets.runner);
  spawner = new Spawner(scene);
  hud.layoutCover(assets.cover.meta, assets.cover.images);
  hud.setProgress(0.95, REQUIRE_REGISTRATION ? 'Signing in…' : 'Ready');
  me = REQUIRE_REGISTRATION ? await api.me() : null;
  hud.setProgress(1, 'Ready');
  showLobby();
  window.__gameReady = true;       // hook for automated screenshots
  window.__game = { state, startRun, endRun, player, world, camera, showLobby, showRegister, api, sound };
} catch (err) {
  hud.setProgress(1, 'Failed to load: ' + err.message);
  console.error(err);
}

// ---------------------------------------------------------------------- loop
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 3.6, 7.0);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!world) return;
  if (state.mode === 'lobby' || state.mode === 'register' || state.mode === 'otp') return;   // static poster: no 3D work, saves battery

  if (state.mode === 'running') {
    state.speed = Math.min(SPEED.max, state.speed + SPEED.ramp * dt);
  } else {
    state.speed = SPEED.lobby;
  }
  const step = state.speed * dt;

  world.update(step, camera.position);
  cloudField.update(dt, step);
  player.update(dt, state.speed);
  player.group.visible = state.mode === 'running';

  if (state.mode === 'running') {
    state.distance += step;
    state.score += step * SCORE_PER_METRE;
    const ev = spawner.update(dt, step, player);
    if (ev.pickups) { state.score += ev.pickups * SCORE_PICKUP; hud.flash(`+${ev.pickups * SCORE_PICKUP}`); sound.pickup(); }
    sound.setIntensity((state.speed - SPEED.start) / (SPEED.max - SPEED.start));
    if (state.invulnerable > 0) state.invulnerable -= dt;
    else if (ev.hits) {
      state.lives -= 1;
      state.invulnerable = INVULNERABLE_TIME;
      sound.hit();
      player.flinch();
      hud.flash('Stained!', 600);
      if (state.lives <= 0) endRun();
    }
    player.body.visible = state.invulnerable <= 0 || Math.floor(state.invulnerable * 10) % 2 === 0;
    hud.update(state);
  }

  // Camera: chase from behind, easing toward the player's lane.
  const lead = state.mode === 'running' ? player.x * 0.55 : 0;
  camPos.x += (lead - camPos.x) * Math.min(1, dt * 6);
  camPos.y = 3.6 + player.height * 0.3;
  camera.position.copy(camPos);
  camTarget.set(lead * 0.6, 1.3, -9);
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
}
frame();
