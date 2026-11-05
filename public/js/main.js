import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { createSky, CloudField } from './sky.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { Spawner } from './spawner.js';
import { SPEED, LIVES, SCORE_PICKUP, SCORE_PER_METRE, INVULNERABLE_TIME, COLORS } from './config.js';

const canvas = document.getElementById('game');
const hud = new Hud();

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
  camera.fov = h > w ? 68 : 55;       // portrait phones need a wider view
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --------------------------------------------------------------------- state
const state = {
  mode: 'loading',          // loading | lobby | running | over
  speed: SPEED.lobby,
  distance: 0,
  score: 0,
  lives: LIVES,
  invulnerable: 0,
};
let world, player, spawner, cloudField;

const controls = new Controls(canvas, (action) => {
  if (state.mode !== 'running') return;
  if (action === 'left') player.moveLane(-1);
  else if (action === 'right') player.moveLane(1);
  else if (action === 'up') player.jump();
});

function startRun() {
  state.mode = 'running';
  state.speed = SPEED.start;
  state.distance = 0;
  state.score = 0;
  state.lives = LIVES;
  state.invulnerable = 0;
  player.reset();
  spawner.reset();
  player.group.visible = true;
  hud.show(null);
  hud.update(state);
}

function endRun() {
  state.mode = 'over';
  hud.gameOver(state.score, state.distance);
}

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-retry').addEventListener('click', startRun);

// ---------------------------------------------------------------------- boot
try {
  hud.setProgress(0.05, 'Loading world…');
  const assets = await loadAssets((p) => hud.setProgress(0.05 + p * 0.9));
  cloudField = new CloudField(assets.clouds);
  scene.add(cloudField.group);
  world = new World(scene, assets);
  player = new Player(scene);
  spawner = new Spawner(scene);
  hud.setProgress(1, 'Ready');
  state.mode = 'lobby';
  hud.show('lobby');
  window.__gameReady = true;       // hook for automated screenshots
  window.__game = { state, startRun, player };
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
    if (ev.pickups) { state.score += ev.pickups * SCORE_PICKUP; hud.flash(`+${ev.pickups * SCORE_PICKUP}`); }
    if (state.invulnerable > 0) state.invulnerable -= dt;
    else if (ev.hits) {
      state.lives -= 1;
      state.invulnerable = INVULNERABLE_TIME;
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
