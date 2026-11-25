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
  packs: 0,
  boostT: 0,       // flower-bubble speed boost (s left)
  slipT: 0,        // banana slip slow-down (s left)
  maxLives: LIVES,
  clean: 0,
  paused: false,
  runStart: 0,
};
let world, player, spawner, cloudField;
let me = null;               // { name, best } once signed in
let pendingPhone = '';
let resendTimer = 0;

const controls = new Controls(canvas, (action) => {
  if (state.mode !== 'running') return;
  if (action === 'left' || action === 'right' || action === 'up') hideHint();
  if (action === 'left') { const l = player.lane; player.moveLane(-1); if (player.lane !== l) sound.lane(-1); }
  else if (action === 'right') { const l = player.lane; player.moveLane(1); if (player.lane !== l) sound.lane(1); }
  else if (action === 'up') { if (!player.isAirborne) sound.jump(); player.jump(); }
});

// ------------------------------------------------------- swipe hint (run start)
let hintTimer = 0;
function showHint() {
  const h = $('swipe-hint'); h.classList.remove('hidden', 'out');
  $('hint-keys').hidden = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, 6000);
}
function hideHint() {
  const h = $('swipe-hint'); if (h.classList.contains('hidden') || h.classList.contains('out')) return;
  h.classList.add('out'); clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.add('hidden'), 350);
}

// ---------------------------------------------- a ruined shirt drops away
function loseShirt() {
  state.lives -= 1;
  sound.hit();
  hud.update(state);
  hud.shirtDrop(state.lives);
  if (state.lives <= 0) { setTimeout(() => { if (state.mode === 'running') endRun(); }, 1100); state.invulnerable = 99; return; }
  state.invulnerable = 1.8;
  setTimeout(() => { if (state.mode === 'running') player.freshShirt(); }, 650);   // a fresh white shirt for the next stretch
}

// ------------------------------------------------------------ pop-up lines
const LINES = {
  pack: ["It's a Diva!", 'Diva Fresh!', 'So Fresh!', 'Stain Gone!', 'Sparkling!', 'Fresh Catch!', 'Nice One!', 'Diva Power!'],
  spotless: ['Spotless!', 'Brilliant White!', 'Diva Clean!'],
  stain: ['Stained!', 'Oops, Mud!', 'Muddy!', 'Splat!'],
  slip: ['Slipped!', 'Whoops!', 'Banana Slip!'],
  dust: ['Dusty!', 'Cough, Cough!', 'Bus Dust!'],
};
const line = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];

// ----------------------------------------------------------------- screens
function showLobby() {
  state.mode = 'lobby';
  const signedIn = !!(REQUIRE_REGISTRATION && me);
  if (signedIn) {
    const first = String(me.name).trim().split(/\s+/)[0];
    $('pc-name').textContent = first;
    $('pc-initial').textContent = first.charAt(0).toUpperCase();
    $('pc-best').textContent = $('pc-badge').textContent = String(me.best ?? 0);
  }
  $('pc-avatar').classList.toggle('hidden', !signedIn);
  showPlayerCard(false);
  hud.screens.cover.classList.remove('leaving', 'reg', 'cv-open');
  hud.show('cover');
}

// player card: opens from the round player button, closes on any tap elsewhere
function showPlayerCard(open) {
  $('player-card').classList.toggle('hidden', !open);
  $('pc-avatar').setAttribute('aria-expanded', String(open));
}
$('pc-avatar').addEventListener('click', (e) => { e.stopPropagation(); sound.tap(); showPlayerCard($('player-card').classList.contains('hidden')); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#player-card, #pc-avatar')) showPlayerCard(false); });

// pause during a run
function setPaused(p) {
  if (state.mode !== 'running') return;
  state.paused = p; hud.screens.pause.classList.toggle('hidden', !p);
  if (p) { for (const k of ['packs', 'score', 'lives']) $(`ps-${k}`).textContent = $(`hud-${k}`).textContent; }   // this run so far
  if (p) sound.stopMusic(); else { sound.startMusic(); clock.getDelta(); }
}
$('btn-pause').addEventListener('click', () => { sound.tap(); setPaused(true); });
$('btn-resume').addEventListener('click', () => { sound.tap(); setPaused(false); });
$('btn-pause-home').addEventListener('click', () => { sound.tap(); state.paused = false; hud.screens.pause.classList.add('hidden'); sound.stopMusic(); showLobby(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'running') setPaused(true); });

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
// Full consent text, shown on the registration poster in the same panel / banner / card boxes.
// Game consent: Hemas' wording. Marketing consent: DRAFT, to be replaced with approved text.
const CONSENT_TEXT = {
  game: { title: 'Game Consent', sections: [   // Hemas' approved wording
    ['My consent', 'I hereby consent to Hemas Manufacturing (Private) Limited collecting and processing my personal data for this game, in accordance with the Personal Data Protection Act No. 9 of 2022.'],
    ['How it is used', 'I understand that this data will be stored and processed for managing my participation in the game, including game administration, communication and related purposes.'],
    ['Sharing', 'It may be shared with authorized third parties, strictly in compliance with the PDPA.'],
    ['Withdrawing consent', "I also acknowledge the right to withdraw this consent at any time by contacting the Company's Data Protection Officer at dpo.hhl@hemas.com."],
  ] },
  marketing: { title: 'Marketing Consent', sections: [
    ['Optional', 'You can play and win without ticking this box.'],
    ['What we use', 'Your name, contact number, gender and game activity.'],
    ['Why we use it', 'To send you personalised offers and news about Diva and other Hemas products by SMS or phone.'],
    ['Change your mind', 'You can stop these messages at any time by replying STOP or contacting Hemas Manufacturing (Private) Limited.'],
  ] },
};
function showConsent(kind) {
  const c = CONSENT_TEXT[kind]; if (!c) return;
  $('cv-title').textContent = c.title;
  const body = $('cv-body'); body.textContent = '';
  c.sections.forEach(([h, t], i) => {
    const card = document.createElement('section'); card.className = 'cv-card'; card.style.animationDelay = `${0.05 + i * 0.06}s`;
    const h3 = document.createElement('h3'); h3.textContent = h; const p = document.createElement('p'); p.textContent = t;
    card.append(h3, p); body.append(card);
  });
  body.scrollTop = 0;
  hud.screens.cover.classList.add('cv-open');
  requestAnimationFrame(() => hud.fitText($('cv-title')));
}
for (const link of document.querySelectorAll('.consent-link')) {
  link.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); sound.tap(); showConsent(link.dataset.read); });
}
$('btn-consent-close').addEventListener('click', () => { sound.tap(); hud.screens.cover.classList.remove('cv-open'); });
const checked = (id) => $(id).getAttribute('aria-checked') === 'true';

function showOtp(phone, resendIn) {
  state.mode = 'otp';
  pendingPhone = phone;
  $('otp-phone').textContent = phone.startsWith('94') ? '0' + phone.slice(2) : phone;
  $('otp-code').value = '';
  hud.error('otp-error', '');
  hud.busy('btn-verify', false, 'Verify');
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

// contact number: digits only, at most 10 (07XXXXXXXX); typing, pasting and autofill are all cleaned
$('reg-phone').addEventListener('input', (e) => {
  const el = e.target; let d = el.value.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('94')) d = '0' + d.slice(2);   // +94 7X… pasted or autofilled
  d = d.slice(0, 10); if (el.value !== d) el.value = d;
});
$('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('reg-name').value.trim();
  const phone = $('reg-phone').value.trim();
  hud.error('reg-error', '');
  if (name.length < 2) { $('reg-name').focus(); return hud.error('reg-error', 'Please enter your full name'); }
  if (!/^0\d{9}$/.test(phone)) { $('reg-phone').focus(); return hud.error('reg-error', 'Please enter a 10-digit mobile number, e.g. 0771234567'); }
  if (!regChoice.gender) return hud.error('reg-error', 'Please select Male or Female');
  if (!checked('consent-game')) return hud.error('reg-error', 'Please tick the required consent');
  const btn = $('btn-register'); btn.disabled = true; sound.tap();
  try {
    const r = await api.register(name, phone, { gender: regChoice.gender, consentGame: true, consentMarketing: checked('consent-marketing') });
    if (r.offline) { me = { name, best: 0 }; return beginRun(); }
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
  hud.busy('btn-verify', true, 'Checking…');
  try {
    const r = await api.verify(pendingPhone, code);
    me = r.player;
    beginRun();
  } catch (err) {
    hud.error('otp-error', err.message);
    hud.busy('btn-verify', false, 'Verify');
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
$('btn-start').addEventListener('click', () => { if (!REQUIRE_REGISTRATION || me) beginRun(); else showRegister(); });
$('btn-retry').addEventListener('click', startRun);

// ------------------------------------------------------------------- game
// ------------------------------------------------- How to play (trilingual)
// Sinhala and Tamil: please have them checked by a native speaker before launch.
const HOWTO = {
  en: { title: 'How to Play', next: 'Next', go: "Let's Run!", ok: 'Got it', skip: 'Skip', left: '2 Shirts Left!!',
    tags: { mud: 'Dirtier', banana: 'Slower', smoke: 'Dusty', bus: 'Game over' },
    steps: [
      ['Swipe or tap to <em>move</em>', 'Swipe left or right, or tap the left or right side, to change lanes. Swipe up or tap the middle to jump.'],
      ['Grab <em>Diva</em> packs', '+10 points, and every pack washes your shirt cleaner. Flower bubble = +50!'],
      ['Dodge the <em>mess</em>', 'Mud, sand and bus smoke dirty your shirt. Banana peels slow you down. Never hit the bus!'],
      ['3 shirts, <em>1 goal</em>', 'A fully dirty shirt drops. Lose all 3 and the run ends. Score is what matters!'],
    ] },
  si: { title: 'ක්‍රීඩා කරන ආකාරය', next: 'ඊළඟ', go: 'දුවමු!', ok: 'හරි', skip: 'මඟ හරින්න', left: 'ෂර්ට් 2ක් ඉතිරියි!!',
    tags: { mud: 'අපිරිසිදුයි', banana: 'වේගය අඩුයි', smoke: 'දූවිලි', bus: 'ක්‍රීඩාව අවසන්' },
    steps: [
      ['ස්වයිප් කර <em>චලනය</em> වන්න', 'මංතීරු මාරු කිරීමට වමට හෝ දකුණට ස්වයිප් කරන්න, නැතහොත් තිරයේ වම් හෝ දකුණු පැත්ත තට්ටු කරන්න. පැනීමට ඉහළට ස්වයිප් කරන්න හෝ මැද තට්ටු කරන්න.'],
      ['<em>Diva</em> පැකට් එකතු කරන්න', 'ලකුණු +10ක් සහ සෑම පැකට්ටුවකින්ම ෂර්ට් එක තවත් පිරිසිදු වේ. මල් බුබුල = +50!'],
      ['<em>මඩ</em> මගහරින්න', 'මඩ, වැලි සහ බස් දුම ෂර්ට් එක අපිරිසිදු කරයි. කෙසෙල් ලෙලි වේගය අඩු කරයි. බසයේ හැප්පෙන්න එපා!'],
      ['ෂර්ට් 3ක්, <em>එක් ඉලක්කයක්</em>', 'සම්පූර්ණයෙන් අපිරිසිදු වූ ෂර්ට් එක අහිමි වේ. ෂර්ට් 3ම අහිමි වූ විට ධාවනය අවසන්. වැදගත් වන්නේ ලකුණුයි!'],
    ] },
  ta: { title: 'விளையாடும் முறை', next: 'அடுத்து', go: 'ஓடுவோம்!', ok: 'சரி', skip: 'தவிர்', left: '2 சட்டைகள் மீதம்!!',
    tags: { mud: 'அழுக்கு', banana: 'மெதுவாக', smoke: 'தூசி', bus: 'ஆட்டம் முடிந்தது' },
    steps: [
      ['ஸ்வைப் செய்து <em>நகருங்கள்</em>', 'பாதையை மாற்ற இடது அல்லது வலது பக்கம் ஸ்வைப் செய்யுங்கள், அல்லது திரையின் இடது அல்லது வலது பக்கத்தைத் தட்டுங்கள். குதிக்க மேலே ஸ்வைப் செய்யுங்கள் அல்லது நடுவில் தட்டுங்கள்.'],
      ['<em>Diva</em> பொதிகளை சேகரியுங்கள்', '+10 புள்ளிகள், ஒவ்வொரு பொதியும் சட்டையை மேலும் சுத்தமாக்கும். பூ குமிழி = +50!'],
      ['<em>சேறு</em> தவிருங்கள்', 'சேறு, மணல், பஸ் புகை சட்டையை அழுக்காக்கும். வாழைப்பழத் தோல் வேகத்தை குறைக்கும். பஸ்ஸில் மோதாதீர்கள்!'],
      ['3 சட்டைகள், <em>1 இலக்கு</em>', 'முழுவதும் அழுக்கான சட்டை இழக்கப்படும். 3 சட்டைகளையும் இழந்தால் ஓட்டம் முடியும். புள்ளிகளே முக்கியம்!'],
    ] },
};
// Sinhala and Tamil: please have them checked by a native speaker before launch.
const HT_LANGS = ['en', 'si', 'ta'], HT_DUR = 6000;
let howtoLang = 'en';
let howtoThen = null;   // 'run' | 'cover' | 'pause': what happens when it closes
let htI = 0, htAuto = true, htTimer = 0;
const htSlides = [...document.querySelectorAll('#ht-deck .ht-slide')], htBars = [...document.querySelectorAll('#ht-bars i')];
function htT() { return HOWTO[howtoLang] || HOWTO.en; }
/** lay the cards out in 3D around the current one, restart the current scene and its story bar */
function htLayout() {
  const t = htT();
  for (const el of htSlides) {
    const off = +el.dataset.i - htI, a = Math.abs(off);
    el.style.transform = `translateX(${off * 84}%) translateZ(${-a * 90}px) rotateY(${off * -38}deg) scale(${1 - Math.min(a, 2) * 0.1})`;
    el.style.opacity = a > 1.5 ? '0' : String(1 - a * 0.25); el.style.zIndex = String(10 - a);
    el.style.filter = a ? `brightness(${1 - a * 0.18}) saturate(.8)` : ''; el.style.pointerEvents = a ? 'none' : '';
    el.setAttribute('aria-hidden', String(a > 0));
    el.classList.remove('on'); if (!a) { void el.offsetWidth; el.classList.add('on'); }
  }
  htBars.forEach((b, i) => { b.className = i < htI ? 'done' : ''; if (i === htI) { void b.offsetWidth; b.className = 'now'; } });
  $('ht-bars').classList.toggle('manual', !htAuto);
  $('ht-bars').style.setProperty('--dur', `${HT_DUR}ms`);
  const cap = document.querySelector('#screen-howto .ht-cap'); cap.lang = howtoLang;
  $('ht-h').innerHTML = t.steps[htI][0]; $('ht-p').textContent = t.steps[htI][1];
  cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
  const last = htI === htSlides.length - 1;
  const cta = HOWTO.en;   // the buttons stay in English in every language
  $('btn-howto-go').textContent = last ? (howtoThen === 'run' ? cta.go : cta.ok) : cta.next;
  document.querySelector('#screen-howto .ht-foot').classList.toggle('last', last);
  $('ht-prev').disabled = htI === 0; $('ht-next').disabled = last;
  clearTimeout(htTimer);
  if (htAuto && !last) htTimer = setTimeout(() => htGo(htI + 1), HT_DUR);
}
function htGo(i) { htI = Math.max(0, Math.min(htSlides.length - 1, i)); htLayout(); }
function renderHowto() {
  const t = htT();
  $('ht-title').textContent = HOWTO.en.title;   // title and buttons stay in English; only the instructions change language $('btn-howto-skip').textContent = HOWTO.en.skip; $('ht-left').textContent = t.left; $('ht-left').lang = howtoLang;
  for (const el of document.querySelectorAll('#ht-deck [data-k]')) el.textContent = t.tags[el.dataset.k];
  const lang = document.querySelector('#screen-howto .ht-lang'); lang.style.setProperty('--i', String(HT_LANGS.indexOf(howtoLang)));
  for (const b of lang.querySelectorAll('[data-lang]')) b.setAttribute('aria-selected', String(b.dataset.lang === howtoLang));
  $('ht-h').innerHTML = t.steps[htI][0]; $('ht-p').textContent = t.steps[htI][1];
  const last = htI === htSlides.length - 1; $('btn-howto-go').textContent = last ? (howtoThen === 'run' ? HOWTO.en.go : HOWTO.en.ok) : HOWTO.en.next;
  document.querySelector('#screen-howto .ht-cap').lang = howtoLang;
  requestAnimationFrame(() => hud.fitText($('ht-title')));
}
function showHowto(then) {
  howtoThen = then; htI = 0; htAuto = true; howtoLang = 'en'; renderHowto();   // always opens in English
  $('screen-howto').classList.remove('hidden'); htLayout();
}
function closeHowto() {
  clearTimeout(htTimer); $('screen-howto').classList.add('hidden');
  for (const el of htSlides) el.classList.remove('on');
  try { sessionStorage.setItem('diva.howto', '1'); } catch { /* private mode */ }
  if (howtoThen === 'run') startRun();
  else if (howtoThen === 'pause') hud.screens.pause.classList.remove('hidden');
}
for (const b of document.querySelectorAll('#screen-howto .ht-lang [data-lang]')) b.addEventListener('click', () => {
  howtoLang = b.dataset.lang;
  sound.tap(); renderHowto();
});
$('btn-howto-go').addEventListener('click', () => {
  sound.tap();
  if (htI < htSlides.length - 1) { htAuto = false; htGo(htI + 1); } else closeHowto();
});
$('btn-howto-skip').addEventListener('click', () => { sound.tap(); closeHowto(); });
$('ht-prev').addEventListener('click', () => { sound.tap(); htAuto = false; htGo(htI - 1); });
$('ht-next').addEventListener('click', () => { sound.tap(); htAuto = false; htGo(htI + 1); });
// clip each shirt's stains to the shirt's own outline (works with inlined images too)
for (const d of document.querySelectorAll('#screen-howto .ht-dirt')) {
  const src = d.parentElement.querySelector('img').src; d.style.webkitMaskImage = d.style.maskImage = `url("${src}")`;
}
// swipe the cards (the game's own swipe input is not running behind this screen)
{ const deck = $('ht-deck'); let sx = null, sy = 0;
  deck.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  deck.addEventListener('pointerup', (e) => {
    if (sx === null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { htAuto = false; sound.tap(); htGo(htI + (dx < 0 ? 1 : -1)); }
  });
  deck.addEventListener('pointercancel', () => { sx = null; });
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup']) $('screen-howto').addEventListener(ev, (e) => e.stopPropagation()); }
$('btn-help').addEventListener('click', () => { sound.tap(); showHowto('cover'); });
$('btn-pause-howto').addEventListener('click', () => { sound.tap(); hud.screens.pause.classList.add('hidden'); showHowto('pause'); });
/** START: show How to play once each time the game is opened */
function beginRun() {
  let seen = false; try { seen = sessionStorage.getItem('diva.howto') === '1'; } catch { /* private mode */ }
  if (seen) startRun(); else showHowto('run');
}

function startRun() {
  // Fade the poster out over the live 3D world.
  const cover = hud.screens.cover;
  if (!cover.classList.contains('hidden')) {
    cover.classList.add('leaving');
    setTimeout(() => { cover.classList.remove('leaving', 'reg'); cover.classList.add('hidden'); }, 320);
  }
  sound.unlock();
  state.mode = 'countdown';   // 3, 2, 1, GO! then the run starts (see runCountdown)
  state.speed = SPEED.start;
  state.distance = 0;
  state.score = 0;
  state.lives = LIVES;
  state.packs = 0; state.paused = false; state.boostT = 0; state.slipT = 0;
  state.invulnerable = 0;
  player.reset();
  spawner.reset();
  spawner.start();
  player.group.visible = true;
  for (const [k, el] of Object.entries(hud.screens)) if (k !== 'cover') el.classList.add('hidden');
  hud.hud.classList.remove('hidden');
  hud.update(state);
  runCountdown();
}

/** 3, 2, 1, GO! over the live road (the runner jogs on the spot), each with a beat. */
let cdTimers = [];
function runCountdown() {
  cdTimers.forEach(clearTimeout); cdTimers = [];
  const box = $('countdown'), num = $('cd-num');
  const show = (txt, go) => {
    num.textContent = txt; box.classList.toggle('go', go);
    box.classList.remove('hidden', 'beat'); void box.offsetWidth; box.classList.add('beat');
  };
  [3, 2, 1].forEach((n, i) => cdTimers.push(setTimeout(() => { if (state.mode !== 'countdown') return; show(String(n), false); sound.countdown(n); }, i * 800)));
  cdTimers.push(setTimeout(() => {
    if (state.mode !== 'countdown') return;
    show('GO!', true); sound.go();
    state.mode = 'running'; state.runStart = performance.now(); clock.getDelta();
    sound.startMusic(); showHint();
  }, 2400));
  cdTimers.push(setTimeout(() => box.classList.add('hidden'), 3150));
}

async function endRun() {
  state.mode = 'over';
  hideHint();
  sound.stopMusic();
  sound.gameOver();
  const score = Math.floor(state.score);
  const distance = state.distance;
  const duration = (performance.now() - state.runStart) / 1000;
  hud.gameOver(score, distance, state.packs);
  let prevBest = me?.best || 0; try { prevBest = Math.max(prevBest, +localStorage.getItem('diva.best') || 0); } catch { /* private mode */ }
  const newBest = score > 0 && score > prevBest;
  // review hook: #result=winner | best | thanks shows that outcome with sample data
  const preview = (location.hash.match(/result=(winner|best|thanks)/) || [])[1];
  if (preview) {
    const gifts = [{ from: 1, to: 1 }, { from: 2, to: 3 }, { from: 4, to: 10 }];
    hud.result(preview === 'winner' ? { best: Math.max(score, prevBest), rank: 2, gift: 'Diva Fresh Hamper', gifts, newBest }
      : { best: Math.max(score, prevBest), rank: preview === 'best' ? 14 : 27, gifts, newBest: preview === 'best' });
    return;
  }
  try {
    const r = await api.submitScore(score, distance, duration);
    if (me) me.best = Math.max(me.best || 0, r.best);
    hud.result({ best: r.best, rank: r.rank, gift: r.gift, gifts: r.gifts || [], top: r.top, myName: me?.name, newBest });
  } catch (err) {
    hud.result({ best: Math.max(prevBest, score), rank: null, top: [], newBest });
    $('final-rank').textContent = err.status === 401 ? 'Session expired. Sign in again to save scores.' : 'Could not save this run: ' + err.message;
  }
}

/**
 * Prepare every shader and texture on the GPU while the loading screen is up,
 * so the first seconds of a run do not stutter: spawn a road's worth of items,
 * show everything (pools included) for one off-screen render, then put it back.
 */
async function warmUp() {
  try {
    spawner.start(); player.group.visible = true;
    const shown = []; scene.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
    renderer.render(scene, camera);
    for (const o of shown) o.visible = false;
    spawner.reset(); player.group.visible = false;
  } catch (err) { console.warn('warm-up skipped', err); }
}

// ---------------------------------------------------------------------- boot
try {
  hud.setProgress(0.05, 'Loading world…');
  const assets = await loadAssets((p) => hud.setProgress(0.05 + p * 0.85));
  cloudField = new CloudField(assets.clouds);
  scene.add(cloudField.group);
  world = new World(scene, assets);
  player = new Player(scene, assets.runner, assets.runnerClean, assets.runnerOutfit);
  spawner = new Spawner(scene, assets.packs, assets.stains, assets.roadProps, world);
  hud.layoutCover(assets.cover.meta, assets.cover.images);
  hud.setProgress(0.95, REQUIRE_REGISTRATION ? 'Signing in…' : 'Ready');
  hud.setProgress(0.93, 'Getting the road ready…');
  await warmUp();
  me = REQUIRE_REGISTRATION ? await api.me() : null;
  hud.setProgress(1, 'Ready');
  showLobby();
  window.__gameReady = true;       // hook for automated screenshots
  window.__game = { flash: (...a) => hud.flash(...a), state, startRun, endRun, player, spawner, world, camera, showLobby, showRegister, api, sound };
} catch (err) {
  hud.setProgress(1, 'Failed to load: ' + err.message);
  console.error(err);
}

// ---------------------------------------------------------------------- loop
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 3.6, 7.0);

// Frame pacing: phones deliver frames unevenly; a frame time that jumps
// between 16 and 33 ms makes the run stutter. The time step is smoothed, and
// the render resolution adapts so the game holds a steady frame rate.
let dtSmooth = 1 / 60, perfT = 0, perfN = 0, pixelRatio = Math.min(window.devicePixelRatio, 2);
function adaptResolution(rawDt) {
  if (performance.now() - state.runStart < 4000) { perfT = 0; perfN = 0; return; }   // ignore the first seconds of a run (warm-up)
  perfT += rawDt; perfN++;
  if (perfT < 2) return;
  const avg = perfT / perfN; perfT = 0; perfN = 0;
  const maxPR = Math.min(window.devicePixelRatio, 2.5), minPR = Math.min(maxPR, 1.5);   // phones that keep up go sharper than 2x   // never drops below 1.5 (1 looked pixelated)
  let next = pixelRatio;
  if (avg > 1 / 38 && pixelRatio > minPR) next = Math.max(minPR, pixelRatio - 0.25);          // clearly too slow: draw fewer pixels
  else if (avg < 1 / 52 && pixelRatio < maxPR) next = Math.min(maxPR, pixelRatio + 0.25);   // headroom (a 60 Hz screen counts): sharpen again
  if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
}

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  dtSmooth += (raw - dtSmooth) * 0.2;                 // even out frame-time jitter
  const dt = Math.abs(raw - dtSmooth) > 0.03 ? raw : dtSmooth;   // a real pause (tab switch) is not smoothed away
  if (state.mode === 'running') adaptResolution(raw);
  if (!world) return;
  if (state.mode === 'lobby' || state.mode === 'register' || state.mode === 'otp') return;   // static poster: no 3D work, saves battery
  if (state.paused) return;

  if (state.mode === 'running') {
    state.speed = Math.min(SPEED.max, state.speed + SPEED.ramp * dt);
  } else {
    state.speed = SPEED.lobby;
  }
  // flower-bubble boost speeds the run up for a few seconds; a banana slip slows it
  state.boostT = Math.max(0, state.boostT - dt); state.slipT = Math.max(0, state.slipT - dt);
  const speedMul = state.mode === 'running' ? (state.boostT > 0 ? 1.45 : 1) * (state.slipT > 0 ? 0.55 : 1) : 1;
  state.speedMul = (state.speedMul ?? 1) + (speedMul - (state.speedMul ?? 1)) * Math.min(1, dt * 4);
  const step = state.speed * state.speedMul * dt;

  world.update(step, camera.position);
  cloudField.update(dt, step);
  if (state.mode !== 'running' && spawner) spawner.drift(dt, step);   // puddles, packs and buses stay put on the road
  player.update(dt, state.speed * (state.speedMul ?? 1));
  player.group.visible = state.mode === 'running' || state.mode === 'countdown';

  if (state.mode === 'running') {
    state.distance += step;
    state.score += step * SCORE_PER_METRE;
    const ev = spawner.update(dt, step, player);
    if (ev.pickups) {
      state.score += ev.pickups * SCORE_PICKUP; sound.pickup();
      const wasDirty = player.grime > 0 || player.dull > 0;
      player.clean(0.1 * ev.pickups); state.packs += ev.pickups;
      const spotless = wasDirty && player.grime <= 0 && player.dull <= 0;
      if (spotless) hud.celebrate(line('spotless'));
      else hud.flash(line('pack'), 750, 'pack', `+${ev.pickups * SCORE_PICKUP}`);
    }
    if (ev.bonus) { state.score += 50 * ev.bonus; player.freshShirt(); state.boostT = 4; state.slipT = 0; hud.flash('Speed Up!', 1100, 'bonus', '+50  Diva Clean'); sound.pickup(); sound.pickup(); }
    if (ev.slip) { state.slipT = 2.5; state.boostT = 0; player.flinch(); hud.flash(line('slip'), 900, 'slip', 'Slowing down'); sound.hit(); }
    if (ev.dust) { sound.lane(1); if (player.dust()) { loseShirt(); return; } hud.flash(line('dust'), 900, 'dust', 'Grab Diva to clean up'); }
    if (ev.bus) {   // running into the bus ends the run
      sound.hit(); player.flinch(); player.stain(); hud.flash('Bus!', 1400, 'bus', 'Run over');
      state.lives = 0; hud.update(state); endRun(); return;
    }
    sound.setIntensity((state.speed - SPEED.start) / (SPEED.max - SPEED.start));
    if (state.invulnerable > 0) state.invulnerable -= dt;
    else if (ev.hits) {
      // obstacles make the shirt dirtier; a fully dirty shirt is lost
      state.invulnerable = 0.6;   // one puddle counts once (no blinking)
      sound.hit(); player.flinch();
      if (player.stain()) { loseShirt(); return; }
      const g = player.grime;
      if (g >= 0.7) hud.flash('Almost Ruined!', 1100, 'stain', 'Grab Diva now!');
      else hud.flash(line('stain'), 900, 'stain', g >= 0.45 ? 'Shirt getting dirtier' : 'Grab Diva to clean up');
    }
    player.body.visible = true;   // no blinking
    state.clean = player.cleanliness;
    hud.update(state);
  }

  // Camera: chase from behind, easing toward the player's lane.
  const lead = state.mode === 'running' ? player.x * 0.55 : 0;
  camPos.x += (lead - camPos.x) * Math.min(1, dt * 6);
  // the camera rides the runner's bounce a little: the run reads as moving forward
  camPos.y = 3.6 + player.height * 0.3;   // steady camera: no bob with his steps
  camera.position.copy(camPos);
  camTarget.set(lead * 0.6, 1.3, -9);
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
}
frame();
