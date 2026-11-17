import * as THREE from 'three';

/**
 * The parked bus (assets/raw/props2/bus.webp: rear three-quarter view) built
 * as two textured panels so it reads correctly as you run past it:
 *  - the rear, facing the runner, across the right lane;
 *  - the side facing the road, running forward from the rear. The picture
 *    shows the side in perspective, so its panel samples it through a
 *    homography (the trapezoid in the picture → a flat rectangle).
 * Exhaust smoke (smoke.webp) puffs out from under the side, near the rear,
 * and drifts back over the middle lane.
 *
 * Local frame: x across the road, the rear panel at z = 0, the bus extends
 * toward -z (ahead), y up from the road.
 */
export const BUS = { rearW: 3.0, rearH: 3.75, length: 12.8, laneX: 2.55 };
// picture coordinates (full 1536×1024 image) and its trimmed box
const IMG = { trimL: 145, trimT: 76, trimW: 1271, trimH: 884 };
const REAR = { x0: 724, x1: 1415, y0: 76, y1: 935 };
const SIDE = { near: [[724, 865], [724, 137]], far: [[190, 615], [192, 283]] };   // [bottom, top]
const uvOf = ([px, py]) => [(px - IMG.trimL) / IMG.trimW, 1 - (py - IMG.trimT) / IMG.trimH];

/** square-to-quad homography: (s,t) ∈ [0,1]² → picture point */
function quadMap(p00, p10, p11, p01) {
  const [x0, y0] = p00, [x1, y1] = p10, [x2, y2] = p11, [x3, y3] = p01;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (s, t) => { const w = g * s + h * t + 1; return [(a * s + b * t + c) / w, (d * s + e * t + f) / w]; };
}

export function buildBus(busMap, smokeMap) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: busMap, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const k = BUS.rearH / (REAR.y1 - REAR.y0);                 // metres per picture pixel at the rear
  const left = BUS.laneX - BUS.rearW / 2;

  // rear panel
  { const geo = new THREE.PlaneGeometry(BUS.rearW, BUS.rearH);
    const [u0, v1] = uvOf([REAR.x0, REAR.y0]), [u1, v0] = uvOf([REAR.x1, REAR.y1]);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    const m = new THREE.Mesh(geo, mat); m.position.set(BUS.laneX, BUS.rearH / 2, 0); g.add(m); }

  // side panel: x = left edge of the rear, from z = 0 back to -length
  { const yB = (REAR.y1 - SIDE.near[0][1]) * k, yT = (REAR.y1 - SIDE.near[1][1]) * k;
    const H = quadMap(SIDE.near[0], SIDE.far[0], SIDE.far[1], SIDE.near[1]);
    const NS = 24, NT = 6, pos = [], uvs = [], idx = [];
    for (let i = 0; i <= NS; i++) for (let j = 0; j <= NT; j++) { const s = i / NS, t = j / NT;
      pos.push(left, yB + (yT - yB) * t, -BUS.length * s); uvs.push(...uvOf(H(s, t))); }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx);
    g.add(new THREE.Mesh(geo, mat));
    // the wheels and the dark gap under the side
    const under = new THREE.Mesh(new THREE.PlaneGeometry(BUS.length, yB), new THREE.MeshBasicMaterial({ color: 0x1d1e22 }));
    under.rotation.y = -Math.PI / 2; under.position.set(left + 0.25, yB / 2, -BUS.length / 2); g.add(under);
    for (const z of [-1.9, -BUS.length + 2.6]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.8 }));
      w.rotation.z = Math.PI / 2; w.position.set(left + 0.15, 0.62, z); g.add(w);
      const hub = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.6, roughness: 0.3 }));
      hub.rotation.y = -Math.PI / 2; hub.position.set(left - 0.06, 0.62, z); g.add(hub);
    }
  }
  // soft shadow under the bus
  { const sh = new THREE.Mesh(new THREE.PlaneGeometry(BUS.rearW + 0.4, BUS.length + 0.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.position.set(BUS.laneX, 0.025, -BUS.length / 2); g.add(sh); }

  // exhaust smoke: two puffs cycling, flipped so the plume rises up and away from the pipe
  const smokeMat = () => new THREE.MeshBasicMaterial({ map: smokeMap, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, fog: true });
  const puffs = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(-0.5, 0.5, 0), smokeMat()); m.renderOrder = 2; m.userData.phase = i / 3; g.add(m); return m; });
  g.userData = { puffs, exhaust: new THREE.Vector3(left + 0.05, 0.35, -1.0), t: 0 };
  return g;
}

/** animate the smoke: each puff grows out of the pipe, drifts back and fades */
export function updateBus(bus, dt) {
  const u = bus.userData; u.t += dt;
  for (const p of u.puffs) {
    const k = ((u.t / 2.4) + p.userData.phase) % 1;
    const w = 2.2 + 4.2 * k, h = w * 0.45;
    p.scale.set(w, h, 1);
    p.position.set(u.exhaust.x + 0.3, u.exhaust.y - 0.15 + 0.6 * k, u.exhaust.z + 0.6 + 2.6 * k);
    p.material.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (k < 0.08 ? k / 0.08 : 1);
  }
}
