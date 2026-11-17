import * as THREE from 'three';

/**
 * The Diva bus stop, built from clean geometry after the Diva bus stop
 * illustration (assets/raw/props/bus-stand.png). The Diva artwork (poster,
 * sign, roof band) is cut from that illustration by
 * scripts/build-busstop-art.mjs, so it stays sharp.
 *
 * Local frame, metres: x along the road, +z = the open front (bench side),
 * y up. The side poster is at the -x end, the hanging sign at the +x end.
 * Returned group: footprint centred on the origin, base at y = 0.
 */
export function buildBusStop({ poster, sign, roof, flowers = [] }) {
  const g = new THREE.Group();
  g.name = 'diva-bus-stop';
  const L = 3.4, Z0 = -0.62, Z1 = 0.62;                 // base footprint (inside the kerb)
  const BASE = 0.12;

  // ---------------------------------------------------------------- materials
  // little metalness: the street has no reflections for shiny metal to pick up, it would render near-black
  const metal = new THREE.MeshStandardMaterial({ color: 0x5f6876, metalness: 0.15, roughness: 0.42 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x474d58, metalness: 0.15, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.25, roughness: 0.25 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xffffff, roughness: 0.55 });
  const tiles = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35, metalness: 0.05 });
  const kerb = new THREE.MeshStandardMaterial({ color: 0x9da2aa, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ map: glassTexture(), transparent: true, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const roofGlass = new THREE.MeshStandardMaterial({ color: 0x9fe2fa, emissive: 0x2a7da3, emissiveIntensity: 0.6, transparent: true, opacity: 0.9, roughness: 0.2, side: THREE.DoubleSide });
  const art = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.45, transparent: true, alphaTest: 0.05 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false });
  const dot = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, toneMapped: false });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  const tube = (pts, r, mat, closed = false) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(24, pts.length * 12), r, 10, closed), mat); g.add(m); return m; };
  /** rounded-rectangle slab: w (along u) × h (along v), thickness t; built in the xy plane */
  const roundSlab = (w, h, r, t, mat) => { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 }); geo.translate(0, 0, -t / 2);
    return new THREE.Mesh(geo, mat); };

  // ---------------------------------------------------------------- base + kerb
  { const slab = roundSlab(L + 0.2, Z1 - Z0 + 0.1, 0.12, BASE, tiles); slab.rotation.x = -Math.PI / 2; slab.position.set(0, BASE / 2, (Z0 + Z1) / 2); g.add(slab);
    // grey kerb blocks along the front and both ends (thin joints between blocks)
    const KW = 0.5, KH = BASE + 0.02, KD = 0.14;
    for (let x = -L / 2 - 0.1 + KW / 2; x < L / 2 + 0.1; x += KW) box(KW - 0.012, KH, KD, kerb, x, KH / 2, Z1 + 0.05 + KD / 2);
    for (const sx of [-1, 1]) for (let z = Z1 + 0.05 - KW / 2; z > Z0 - 0.05; z -= KW) box(KD, KH, KW - 0.012, kerb, sx * (L / 2 + 0.1 + KD / 2), KH / 2, z); }

  // ---------------------------------------------------------------- back wall
  const WALL_Z = Z0 + 0.1, TOP = 2.32, FLOOR = BASE;
  const postsX = [-1.35, 0.05, 1.45];
  for (const x of postsX) { box(0.1, TOP - FLOOR, 0.1, metal, x, (TOP + FLOOR) / 2, WALL_Z); box(0.2, 0.025, 0.2, metalDark, x, FLOOR + 0.012, WALL_Z); }
  box(postsX[2] - postsX[0] + 0.1, 0.08, 0.1, metal, (postsX[0] + postsX[2]) / 2, TOP - 0.04, WALL_Z);     // top rail
  box(postsX[2] - postsX[0] + 0.1, 0.06, 0.08, metal, (postsX[0] + postsX[2]) / 2, FLOOR + 0.2, WALL_Z);     // bottom rail
  { const w = postsX[2] - postsX[0], h = TOP - 0.08 - (FLOOR + 0.23);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); pane.position.set((postsX[0] + postsX[2]) / 2, FLOOR + 0.23 + h / 2, WALL_Z); g.add(pane); }

  // ---------------------------------------------------------------- side poster panel (-x end)
  { const PX = -L / 2 + 0.06, w = Z1 - Z0 - 0.06, h = 2.2, cy = BASE + 0.05 + h / 2;
    const frame = roundSlab(w, h, 0.12, 0.1, metal); frame.rotation.y = -Math.PI / 2; frame.position.set(PX, cy, (Z0 + Z1) / 2); g.add(frame);
    const pw = w - 0.12, ph = h - 0.14;
    for (const s of [-1, 1]) {          // the poster on both faces (outer face toward the oncoming runner)
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), art(poster)); p.rotation.y = s * Math.PI / 2;
      p.position.set(PX + s * 0.064, cy, (Z0 + Z1) / 2); g.add(p);
      for (const [dz, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), steel); b.position.set(PX + s * 0.07, cy + dy * (ph / 2 - 0.03), (Z0 + Z1) / 2 + dz * (pw / 2 - 0.03)); g.add(b); }
    }
    box(0.18, 0.025, 0.3, metalDark, PX, BASE + 0.012, Z0 + 0.2); box(0.18, 0.025, 0.3, metalDark, PX, BASE + 0.012, Z1 - 0.2); }

  // ---------------------------------------------------------------- roof
  { const RX = L / 2 + 0.22, RZ0 = Z0 - 0.12, RZ1 = Z1 + 0.32, Y = 2.52, ARCH = 0.2, T = 0.07;
    const yAt = (x) => Y + ARCH * Math.cos((Math.PI / 2) * (x / RX)) - ARCH * 0.15;
    const NX = 40, NZ = 6;
    const sheet = (dy, mat, uv) => { const pos = [], uvs = [], idx = [];
      for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) { const x = -RX + (2 * RX * i) / NX, z = RZ0 + ((RZ1 - RZ0) * j) / NZ;
        pos.push(x, yAt(x) + dy + 0.04 * (z - RZ0) / (RZ1 - RZ0), z); uvs.push(i / NX, 1 - j / NZ); }
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a = i * (NZ + 1) + j, b = a + NZ + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
    sheet(T, new THREE.MeshStandardMaterial({ map: roof, roughness: 0.4, side: THREE.DoubleSide }), true);   // printed top
    sheet(0, roofGlass, false);                                                                               // glass underneath
    const edge = (z, dy) => { const pts = []; for (let i = 0; i <= 16; i++) { const x = -RX + (2 * RX * i) / 16; pts.push([x, yAt(x) + dy + 0.04 * (z - RZ0) / (RZ1 - RZ0), z]); } return pts; };
    tube(edge(RZ1, T / 2), 0.07, metal);                 // big rounded front beam
    tube(edge(RZ0, T / 2), 0.045, metal);                // back edge
    for (const sx of [-1, 1]) { const x = sx * RX; tube([[x, yAt(x) + T / 2, RZ0], [x, yAt(x) + T / 2 + 0.02, (RZ0 + RZ1) / 2], [x, yAt(x) + T / 2 + 0.04, RZ1]], 0.045, metal);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), metal); cap.position.set(x, yAt(x) + T / 2 + 0.04, RZ1); g.add(cap); }
    // ribs under the glass, with the little light-blue lamps
    for (const x of [-1.05, 0, 1.05]) { const y = yAt(x) - 0.05; const rib = box(0.12, 0.1, RZ1 - RZ0, metal, x, y + 0.03, (RZ0 + RZ1) / 2);
      for (const k of [-1, 0, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), dot); d.position.set(x + k * 0.035, y + 0.03, RZ1 + 0.005); g.add(d); } void rib; }
    // posts from the wall up to the roof
    for (const x of postsX) box(0.1, yAt(x) - TOP, 0.1, metal, x, (TOP + yAt(x)) / 2, WALL_Z);
  }

  // ---------------------------------------------------------------- hanging sign (+x end)
  { const SX = L / 2 - 0.05, cz = 0.05, cy = 1.72, w = 0.86, h = 0.56;
    box(0.12, 0.09, w + 0.25, metal, SX, 2.18, cz);                       // arm
    const strip = box(0.13, 0.025, w - 0.05, glow, SX, 2.13, cz); void strip;
    for (const dz of [-0.28, 0.28]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), steel); rod.position.set(SX, 2.02, cz + dz); g.add(rod); }
    const frame = roundSlab(w, h, 0.07, 0.06, metal); frame.rotation.y = Math.PI / 2; frame.position.set(SX, cy, cz); g.add(frame);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), art(sign)); p.rotation.y = s * Math.PI / 2; p.position.set(SX + s * 0.044, cy, cz); g.add(p); } }

  // ---------------------------------------------------------------- bench
  { const BX = -0.25, BZ = WALL_Z + 0.42, BW = 1.55, SEAT = BASE + 0.46;
    for (let k = 0; k < 3; k++) box(BW, 0.04, 0.11, wood, BX, SEAT, BZ - 0.13 + k * 0.125);
    for (let k = 0; k < 3; k++) { const s = box(BW, 0.1, 0.035, wood, BX, SEAT + 0.17 + k * 0.125, BZ - 0.25 - k * 0.02); s.rotation.x = -0.12; }
    for (const sx of [-1, 1]) { const x = BX + sx * (BW / 2 + 0.04);
      tube([[x, BASE, BZ + 0.12], [x, SEAT - 0.02, BZ + 0.12], [x, SEAT + 0.2, BZ + 0.16], [x, SEAT + 0.24, BZ - 0.05], [x, SEAT + 0.55, BZ - 0.3]], 0.03, metalDark);
      box(0.08, SEAT - BASE, 0.08, metalDark, x, (SEAT + BASE) / 2, BZ - 0.18);
      box(0.16, 0.025, 0.16, metalDark, x, BASE + 0.012, BZ - 0.18); box(0.16, 0.025, 0.16, metalDark, x, BASE + 0.012, BZ + 0.12); } }

  // ---------------------------------------------------------------- steel railing (front right)
  { const RXp = 1.05, z0 = WALL_Z + 0.25, z1 = Z1 - 0.05, top = BASE + 0.82;
    tube([[RXp, BASE, z0], [RXp, top - 0.08, z0], [RXp, top, z0 + 0.08], [RXp, top, z1 - 0.08], [RXp, top - 0.08, z1], [RXp, BASE, z1]], 0.035, steel);
    for (const y of [BASE + 0.32, BASE + 0.55]) tube([[RXp, y, z0], [RXp, y, z1]], 0.022, steel);
    for (const z of [z0, z1]) box(0.12, 0.02, 0.12, metalDark, RXp, BASE + 0.01, z); }

  // ---------------------------------------------------------------- flowers
  const plant = (kind, x, z, h, ry) => { if (!kind) return; const w = h * kind.aspect;
    for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), kind.material); m.position.set(x, BASE, z); m.rotation.y = ry + r; g.add(m); } };
  plant(flowers[0], -L / 2 + 0.05, Z1 - 0.12, 0.55, 0.3);
  plant(flowers[1], -L / 2 + 0.38, Z1 - 0.05, 0.45, -0.5);
  plant(flowers[2] || flowers[0], L / 2 - 0.22, WALL_Z + 0.05, 0.85, 0.2);
  plant(flowers[0], L / 2 - 0.05, Z1 - 0.25, 0.6, 1.0);

  // centre the footprint, base at 0
  const bb = new THREE.Box3().setFromObject(g); const c = bb.getCenter(new THREE.Vector3());
  for (const ch of g.children) { ch.position.x -= c.x; ch.position.z -= c.z; ch.position.y -= bb.min.y; }
  return g;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function tileTexture() {
  return canvasTex(512, 256, (c, w, h) => {
    const n = 8, m = 4, tw = w / n, th = h / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const v = 150 + ((i * 7 + j * 13) % 5) * 8;
      const gr = c.createLinearGradient(i * tw, j * th, (i + 1) * tw, (j + 1) * th); gr.addColorStop(0, `rgb(${v + 18},${v + 20},${v + 26})`); gr.addColorStop(1, `rgb(${v - 10},${v - 8},${v - 2})`);
      c.fillStyle = gr; c.fillRect(i * tw, j * th, tw, th); }
    c.strokeStyle = 'rgba(70,72,80,.8)'; c.lineWidth = 3;
    for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * tw, 0); c.lineTo(i * tw, h); c.stroke(); }
    for (let j = 0; j <= m; j++) { c.beginPath(); c.moveTo(0, j * th); c.lineTo(w, j * th); c.stroke(); }
  });
}
function woodTexture() {
  return canvasTex(256, 64, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a050'); gr.addColorStop(.5, '#e0873a'); gr.addColorStop(1, '#c46a26'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,60,20,.25)'; c.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) { c.beginPath(); const y = 6 + k * 6.5; c.moveTo(0, y); for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x / 30 + k) * 2); c.stroke(); }
  });
}
/** back glass: pale blue, reflections, and the pink / yellow / blue Diva swoosh across the lower half */
function glassTexture() {
  return canvasTex(1024, 512, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(150,215,245,.55)'); gr.addColorStop(1, 'rgba(120,200,240,.5)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.28)';
    for (const [x, ww] of [[120, 60], [220, 22], [610, 70], [720, 26]]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + ww, 0); c.lineTo(x + ww - 220, h); c.lineTo(x - 220, h); c.closePath(); c.fill(); }
    const band = (y0, y1, y2, y3, fill) => { c.beginPath(); c.moveTo(0, y0); c.bezierCurveTo(w * .35, y1, w * .6, y2, w, y3); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = fill; c.fill(); };
    band(h * .52, h * .48, h * .72, h * .66, '#ffd400');
    band(h * .56, h * .52, h * .76, h * .70, '#ec2a8f');
    band(h * .80, h * .72, h * .92, h * .86, '#3fb4ef');
    band(h * .86, h * .80, h * .98, h * .93, '#ec2a8f');
  });
}
