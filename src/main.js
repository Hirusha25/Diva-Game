// Diva Fresh Run – roadside scene.
//
// The world is real 3D, measured in metres. Flat surfaces (road, kerb,
// pavement, wall) are long strips of geometry; trees, bushes, bus stops and
// clouds are the painted sprites, each stood upright at a real position
// (x = distance from the road centre, y = height of its base, z = distance
// ahead). The camera's perspective then does the layout work: things further
// away get smaller and move toward the vanishing point on their own.
import * as THREE from 'three';
import * as T from './textures.js';

// ---- layout, in metres (x measured from the centre of the road) ----------
const LANES = 3;
const ROAD_HALF = 3.3;           // road edge
const KERB_W = 0.4, KERB_H = 0.2;
const PAVE_W = 2.6;
const BED_W = 0.8;               // planting strip at the foot of the wall
const WALL_H = 1.5;
const CAP_H = 0.16, CAP_W = 0.55;

const X_KERB = ROAD_HALF + KERB_W;
const X_BED = X_KERB + PAVE_W;
const X_WALL = X_BED + BED_W;
const Y_PAVE = KERB_H;
const Y_WALL = Y_PAVE + WALL_H;
const Y_TOP = Y_WALL + CAP_H;    // ground level behind the wall

const PERIOD = 36;               // every ground pattern repeats within this
const NEAR_Z = 14, FAR_Z = -300; // ground strips span this range
const LOOP = 216;                // scenery repeats after this distance
const SPEED = 9;                 // metres per second

const FOG = 0xdcecf8;

// ---- renderer / scene / camera -------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = T.skyTexture();
scene.fog = new THREE.Fog(FOG, 70, 260);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 74 : 50;          // portrait phones get a taller view
  camera.position.set(0, 2.7, 0);
  camera.lookAt(0, 0.7, -30);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { resize(); if (still) requestAnimationFrame(frame); });
resize();

// ---- ground strips --------------------------------------------------------
// A strip runs the length of the road. Its cross-section is the straight
// line from (x0,y0) to (x1,y1). `across` is how many times the texture
// repeats across the strip, `period` how many metres one repeat covers along
// the road. With `turn`, the texture's u axis runs along the road instead.
function strip(x0, y0, x1, y1, material, { across = 1, period = 1, turn = false } = {}) {
  const v0 = NEAR_Z / period, v1 = FAR_Z / period;
  const uv = turn
    ? [v0, 0, v0, across, v1, 0, v1, across]
    : [0, v0, across, v0, 0, v1, across, v1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [x0, y0, NEAR_Z, x1, y1, NEAR_Z, x0, y0, FAR_Z, x1, y1, FAR_Z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return new THREE.Mesh(g, material);
}

const flat = (map, extra = {}) =>
  new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, ...extra });
const overlay = (map, opacity) =>
  flat(map, { transparent: true, opacity, depthWrite: false });

const mat = {
  road: flat(T.roadTexture(LANES)),
  kerb: flat(T.kerbTexture()),
  kerbSide: flat(T.kerbTexture(), { color: 0xc8c8c8 }),
  pave: flat(T.pavementTexture()),
  soil: flat(T.soilTexture()),
  wall: flat(T.wallTexture()),
  cap: flat(T.capTexture()),
  capFront: flat(T.capTexture(), { color: 0xb9b0a8 }),
  grass: flat(T.grassTexture()),
  shade: overlay(T.shadeTexture(29, 60), 0.5),
  shadeWall: overlay(T.shadeTexture(31, 50), 0.38),
};

const ground = new THREE.Group();
scene.add(ground);

ground.add(strip(-ROAD_HALF, 0, ROAD_HALF, 0, mat.road, { period: 9 }));
const roadShade = strip(-ROAD_HALF, 0.01, ROAD_HALF, 0.01, mat.shade, { across: 0.6, period: 18 });
roadShade.renderOrder = 1;
ground.add(roadShade);

for (const s of [-1, 1]) {
  const side = [
    strip(s * ROAD_HALF, 0, s * ROAD_HALF, KERB_H, mat.kerbSide, { period: 2.4 }),
    strip(s * ROAD_HALF, KERB_H, s * X_KERB, KERB_H, mat.kerb, { period: 2.4 }),
    strip(s * X_KERB, Y_PAVE, s * X_BED, Y_PAVE, mat.pave, { across: 4, period: PAVE_W / 4 }),
    strip(s * X_BED, Y_PAVE, s * X_WALL, Y_PAVE, mat.soil, { period: BED_W }),
    strip(s * X_WALL, Y_PAVE, s * X_WALL, Y_WALL, mat.wall, { period: 6, turn: true }),
    strip(s * (X_WALL - 0.06), Y_WALL, s * (X_WALL - 0.06), Y_TOP, mat.capFront, { period: 3, turn: true }),
    strip(s * (X_WALL - 0.06), Y_TOP, s * (X_WALL + CAP_W), Y_TOP, mat.cap, { period: 3, turn: true }),
    strip(s * (X_WALL + CAP_W), Y_TOP, s * 90, Y_TOP, mat.grass, { across: 40, period: 2 }),
  ];
  const shades = [
    strip(s * X_KERB, Y_PAVE + 0.01, s * X_WALL, Y_PAVE + 0.01, mat.shade, { across: 0.25, period: 18 }),
    strip(s * (X_WALL - 0.01), Y_PAVE, s * (X_WALL - 0.01), Y_WALL, mat.shadeWall, { across: 0.2, period: 12, turn: true }),
  ];
  for (const m of shades) m.renderOrder = 1;
  ground.add(...side, ...shades);
}

// ---- sprites --------------------------------------------------------------
const loader = new THREE.TextureLoader();
const NAMES = [
  'tree-1', 'tree-2', 'tree-3', 'tree-4',
  'bush-white-wide', 'bush-pink-wide', 'bush-white-tall', 'bush-mixed', 'bush-row', 'bush-white',
  'bus-stop', 'bus-stop-diva', 'cloud-1', 'cloud-2', 'cloud-3', 'cloud-4',
];
const tex = {};
await Promise.all(NAMES.map(async (n) => {
  const t = await loader.loadAsync(`./assets/sprites/${n}.webp`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  tex[n] = t;
}));

const unitPlane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // origin at bottom centre
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: T.blobTexture(), transparent: true, depthWrite: false });
const matCache = new Map();

function spriteMaterial(name, tint, fog) {
  const key = `${name}|${tint}|${fog}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshBasicMaterial({
      map: tex[name], color: tint, transparent: true, alphaTest: 0.03, depthWrite: false, fog,
    }));
  }
  return matCache.get(key);
}

const scenery = []; // things that scroll past: { obj, z }

// Stand a sprite upright with its bottom-centre at (x, y, z), `height` metres tall.
function place(name, x, y, z, height, { flip = false, tint = 0xffffff, shadow = 0, fog = true } = {}) {
  const img = tex[name].image;
  const width = height * (img.width / img.height);
  const m = new THREE.Mesh(unitPlane, spriteMaterial(name, tint, fog));
  m.scale.set(flip ? -width : width, height, 1);
  m.position.set(x, y, z);
  m.renderOrder = 2;
  if (flip) m.material = m.material.clone(), (m.material.side = THREE.DoubleSide);
  scene.add(m);
  scenery.push({ obj: m, z });
  if (shadow) {
    const b = new THREE.Mesh(blobGeo, blobMat);
    b.scale.set(width * shadow, 1, 0.9);
    b.position.set(x, y + 0.02, z);
    b.renderOrder = 1;
    scene.add(b);
    scenery.push({ obj: b, z });
  }
  return m;
}

const rand = T.rng(2026);
const pick = (a) => a[(rand() * a.length) | 0];
const between = (a, b) => a + rand() * (b - a);

const TREES = ['tree-1', 'tree-2', 'tree-3', 'tree-4'];
const BUSHES_TOP = ['bush-white-wide', 'bush-pink-wide', 'bush-row', 'bush-mixed', 'bush-white'];
const BUSHES_BASE = ['bush-white', 'bush-mixed', 'bush-white-tall', 'bush-pink-wide', 'bush-white-wide'];
const BUS_STOPS = { '-1': 54, '1': 162 }; // z-offset of the bus stop on each side

for (const s of [-1, 1]) {
  // Front row of trees, rooted just behind the wall so the wall hides the
  // foot of each trunk and the canopies hang out over the pavement.
  for (let z = s > 0 ? 0 : 4.5; z < LOOP; z += 9) {
    place(pick(TREES), s * (X_WALL + between(1.6, 2.8)), Y_TOP - 0.5, -z - between(0, 2), between(10, 13), { flip: rand() < 0.5 });
  }
  // Two deeper rows, darker and taller, to fill in the green behind.
  for (let z = 2; z < LOOP; z += 7.2) {
    place(pick(TREES), s * (X_WALL + between(7, 10)), Y_TOP - 0.5, -z - between(0, 3), between(12, 15), { flip: rand() < 0.5, tint: 0xc4dcc0 });
  }
  for (let z = 5; z < LOOP; z += 8) {
    place(pick(TREES), s * (X_WALL + between(15, 22)), Y_TOP - 0.5, -z - between(0, 4), between(14, 18), { flip: rand() < 0.5, tint: 0x9fc4a4 });
  }
  for (let z = 1; z < LOOP; z += 6) {
    place(pick(TREES), s * (X_WALL + between(28, 46)), Y_TOP - 1, -z - between(0, 4), between(16, 21), { flip: rand() < 0.5, tint: 0x86b294 });
  }
  // Bushes planted along the top of the wall, spilling over the cap.
  for (let z = 1.5; z < LOOP; z += 3) {
    if (rand() < 0.3) continue;
    place(pick(BUSHES_TOP), s * (X_WALL + 0.45), Y_TOP - 0.18, -z - between(0, 1.2), between(0.95, 1.4), { flip: rand() < 0.5 });
  }
  // Bushes in the planting strip at the foot of the wall.
  const stopZ = BUS_STOPS[s];
  for (let z = 3; z < LOOP; z += 6) {
    if (Math.abs(z - stopZ) < 6) continue;
    const zz = -z - between(0, 2.5);
    place(pick(BUSHES_BASE), s * (X_BED + 0.4), Y_PAVE - 0.05, zz, between(0.85, 1.15), { flip: rand() < 0.5, shadow: 1.1 });
  }
  // One bus stop per side per loop. The Diva one keeps its lettering readable
  // on the right; the plain one is mirrored for the left.
  place(s > 0 ? 'bus-stop-diva' : 'bus-stop', s * (X_KERB + 1.6), Y_PAVE - 0.05, -stopZ, s > 0 ? 3.4 : 3.0,
    { flip: s < 0, shadow: 0.9 });
}

// Clouds sit far away and don't scroll with the road.
const clouds = [
  ['cloud-4', 150, 150, 46], ['cloud-1', -130, 95, 26], ['cloud-2', 40, 62, 16],
  ['cloud-3', -45, 48, 11], ['cloud-1', 150, 70, 15], ['cloud-2', -210, 160, 40], ['cloud-3', 95, 38, 8],
].map(([n, x, y, h]) => {
  const m = new THREE.Mesh(unitPlane, spriteMaterial(n, 0xffffff, false));
  const img = tex[n].image;
  m.scale.set(h * img.width / img.height, h, 1);
  m.position.set(x, y, -420);
  m.renderOrder = 0;
  scene.add(m);
  return m;
});
camera.far = 900; camera.updateProjectionMatrix();

// ---- loop -----------------------------------------------------------------
// ?still freezes the scroll, ?d=<metres> starts at a given distance.
const params = new URLSearchParams(location.search);
let dist = Number(params.get('d')) || 0;
let last = performance.now();
const still = params.has('still');

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!still) dist += SPEED * dt;

  ground.position.z = dist % PERIOD;
  for (const it of scenery) {
    // wrap each item into the range [NEAR_Z - LOOP, NEAR_Z)
    let z = (it.z + dist) % LOOP;
    if (z >= NEAR_Z) z -= LOOP;
    it.obj.position.z = z;
  }
  for (const c of clouds) {
    c.position.x += dt * 0.6;
    if (c.position.x > 420) c.position.x = -420;
  }
  renderer.render(scene, camera);
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
