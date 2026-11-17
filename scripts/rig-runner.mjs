/**
 * Rigs the Meshy runner model (single unrigged mesh) for the game.
 *   npm run rig        (node scripts/rig-runner.mjs)
 * 1. simplifies 1.2 M triangles to ~30 k and shrinks the 8 K textures (WebP)
 * 2. builds a 17-bone humanoid skeleton from measured joint positions
 * 3. labels the surface by bone (geodesic growth from bone seeds)
 * 4. separates the arms: in this mesh the arms hang fused to the torso and
 *    the gloves are fused to the shorts. The glove (with its cuff) becomes one
 *    rigid piece on the hand bone, the sleeve stays on the upper arm, the bare
 *    arm skin is rebuilt as two clean capsules (upper arm, forearm), and the
 *    fused contact strip is removed on both sides; every opening is closed
 *    with a minimum-area patch in the plain colour of its part.
 * 5. smooths weights across the other joints and writes
 *    public/assets/models/runner.glb (skinned, meshopt-compressed).
 * The running animation itself is driven in public/js/player.js.
 * Debug: DEBUG_COLORS=1 (colour by bone), DEBUG_PATCH=1 (patches magenta).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('assets/raw/models/runner.glb');
const root = doc.getRoot();

await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.env.RATIO || 0.03), error: 0.004, lockBorder: false }),
  dedup(), prune(),
);
const prim = root.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION'), IDX = prim.getIndices();
const nV = P.getCount(), nT = IDX.getCount() / 3;
console.log('after simplify:', nV, 'vertices', nT, 'triangles');

// ---------------------------------------------------------------- skeleton
// Model space: height 2 (feet y = -1, head top y = 1), faces +z, character's left = +x.
const J = {
  hips:   { p: [0, -0.15, 0],        parent: null },
  spine:  { p: [0, 0.02, 0],         parent: 'hips' },
  chest:  { p: [0, 0.22, 0],         parent: 'spine' },
  neck:   { p: [0, 0.42, -0.01],     parent: 'chest' },
  head:   { p: [0, 0.52, 0],         parent: 'neck', tail: [0, 0.95, 0] },
};
for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
  J[`upperarm_${n}`] = { p: [s * 0.19, 0.35, -0.01], parent: 'chest' };
  J[`forearm_${n}`]  = { p: [s * 0.245, 0.12, 0.0], parent: `upperarm_${n}` };
  J[`hand_${n}`]     = { p: [s * 0.265, -0.04, 0.04], parent: `forearm_${n}`, tail: [s * 0.28, -0.2, 0.08] };
  J[`thigh_${n}`]    = { p: [s * 0.09, -0.22, 0], parent: 'hips' };
  J[`shin_${n}`]     = { p: [s * 0.115, -0.53, 0.02], parent: `thigh_${n}` };
  J[`foot_${n}`]     = { p: [s * 0.13, -0.87, 0], parent: `shin_${n}`, tail: [s * 0.13, -0.97, 0.18] };
}
const names = Object.keys(J);
for (const n of names) { const kids = names.filter((k) => J[k].parent === n); if (!J[n].tail) J[n].tail = kids.length === 1 ? J[kids[0]].p : (n === 'hips' ? J.spine.p : J[n].p); }
if (n => 0) J.chest.tail = J.neck.p; J.hips.tail = J.spine.p;

// --------------------------------------------------------- surface graph
// UV seams split vertices, so connectivity is built on merged positions.
const pos = new Float32Array(nV * 3); for (let i = 0; i < nV; i++) { const v = P.getElement(i, []); pos.set(v, i * 3); }
const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
const uid = new Int32Array(nV); const map = new Map(); let nU = 0;
for (let i = 0; i < nV; i++) { const k = key(i); let u = map.get(k); if (u === undefined) { u = nU++; map.set(k, u); } uid[i] = u; }
const upos = new Float32Array(nU * 3); for (let i = 0; i < nV; i++) upos.set(pos.subarray(i * 3, i * 3 + 3), uid[i] * 3);
// averaged surface normal per merged position
const NA = prim.getAttribute('NORMAL'); const unrm = new Float32Array(nU * 3);
for (let i = 0; i < nV; i++) { const n = NA.getElement(i, []); const u = uid[i]; unrm[u * 3] += n[0]; unrm[u * 3 + 1] += n[1]; unrm[u * 3 + 2] += n[2]; }
for (let u = 0; u < nU; u++) { const l = Math.hypot(unrm[u * 3], unrm[u * 3 + 1], unrm[u * 3 + 2]) || 1; unrm[u * 3] /= l; unrm[u * 3 + 1] /= l; unrm[u * 3 + 2] /= l; }
const adj = Array.from({ length: nU }, () => new Map());
const ix = IDX.getArray();
const dist = (a, b) => Math.hypot(upos[a * 3] - upos[b * 3], upos[a * 3 + 1] - upos[b * 3 + 1], upos[a * 3 + 2] - upos[b * 3 + 2]);
for (let t = 0; t < nT; t++) { const a = uid[ix[t * 3]], b = uid[ix[t * 3 + 1]], c = uid[ix[t * 3 + 2]];
  for (const [x, y] of [[a, b], [b, c], [c, a]]) if (x !== y) { const d = dist(x, y); adj[x].set(y, d); adj[y].set(x, d); } }
// components
const comp = new Int32Array(nU).fill(-1); let nC = 0;
for (let s = 0; s < nU; s++) { if (comp[s] >= 0) continue; const st = [s]; comp[s] = nC; while (st.length) { const v = st.pop(); for (const w of adj[v].keys()) if (comp[w] < 0) { comp[w] = nC; st.push(w); } } nC++; }
console.log('unique positions:', nU, 'connected pieces:', nC);

// ------------------------------------------------------------- seeding
const segDist = (q, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9; const t = Math.max(0, Math.min(1, (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / L));
  return Math.hypot(aq[0] - ab[0] * t, aq[1] - ab[1] * t, aq[2] - ab[2] * t); };
// per-bone seed rule: radius around the bone segment + a spatial gate
const gate = {
  hips:  (q) => Math.abs(q[0]) < 0.17 && q[1] > -0.2 && q[1] < -0.05,
  spine: (q) => Math.abs(q[0]) < 0.14 && q[1] > -0.05 && q[1] < 0.2,
  chest: (q) => Math.abs(q[0]) < 0.14 && q[1] >= 0.2 && q[1] < 0.4,
  neck:  (q) => q[1] >= 0.42 && q[1] < 0.5,
  head:  (q) => q[1] >= 0.55,
};
const radius = { hips: 0.2, spine: 0.2, chest: 0.2, neck: 0.08, head: 0.6 };
for (const n of ['L', 'R']) { const s = n === 'L' ? 1 : -1;
  gate[`upperarm_${n}`] = (q) => s * q[0] > 0.2 && q[1] < 0.33 && q[1] > 0.14;   radius[`upperarm_${n}`] = 0.05;
  gate[`forearm_${n}`]  = (q) => s * q[0] > 0.215 && q[1] < 0.11 && q[1] > 0.0;   radius[`forearm_${n}`] = 0.045;
  gate[`hand_${n}`]     = (q) => Math.hypot(q[0] - s * 0.285, q[1] + 0.17, q[2] - 0.08) < 0.065; radius[`hand_${n}`] = 1;
  gate[`thigh_${n}`]    = (q) => s * q[0] > 0.02 && q[1] < -0.3 && q[1] > -0.48;   radius[`thigh_${n}`] = 0.1;
  gate[`shin_${n}`]     = (q) => s * q[0] > 0.02 && q[1] < -0.58 && q[1] > -0.8;   radius[`shin_${n}`] = 0.08;
  gate[`foot_${n}`]     = (q) => s * q[0] > 0.02 && q[1] < -0.9;                    radius[`foot_${n}`] = 0.3;
}
// Where the arm/glove touches the body in the rest pose the surfaces are fused.
// Decide by which way the surface faces: a point belongs to the arm/glove only
// if its normal points away from that limb more than away from the body axis.
const closest = (q, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9; const t = Math.max(0, Math.min(1, (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / L)); return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]; };
const ndot = (u, from) => { const q = [upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]]; const d = [q[0] - from[0], q[1] - from[1], q[2] - from[2]]; const l = Math.hypot(...d) || 1; return (unrm[u * 3] * d[0] + unrm[u * 3 + 1] * d[1] + unrm[u * 3 + 2] * d[2]) / l; };
const bodyAxis = (q) => [0, Math.max(-0.2, Math.min(0.42, q[1])), q[2] < 0 ? q[2] * 0.3 : 0];
const limbOf = names.map((n) => /^(upperarm|forearm|hand)_/.test(n) ? (n.endsWith('_L') ? 1 : -1) : 0);
const isBody = names.map((n) => ['hips', 'spine', 'chest'].includes(n));
const gloveC = { 1: [0.285, -0.17, 0.08], [-1]: [-0.285, -0.17, 0.08] };
const armScore = (u, s) => {   // >0: surface faces away from this arm/glove rather than from the body
  const q = [upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]];
  const segs = [[J[`upperarm_${s > 0 ? 'L' : 'R'}`].p, J[`forearm_${s > 0 ? 'L' : 'R'}`].p], [J[`forearm_${s > 0 ? 'L' : 'R'}`].p, J[`hand_${s > 0 ? 'L' : 'R'}`].p]];
  let best = Infinity, from = null; for (const [a, b] of segs) { const c = closest(q, a, b); const d = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]); if (d < best) { best = d; from = c; } }
  const dg = Math.hypot(q[0] - gloveC[s][0], q[1] - gloveC[s][1], q[2] - gloveC[s][2]);
  if (dg < best + 0.04) from = gloveC[s];
  return ndot(u, from) - ndot(u, bodyAxis(q));
};
const allowed = (b, u) => {
  const q = [upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]];
  const s = limbOf[b];
  if (s) {
    if (s * q[0] < 0.14) return false;
    if (names[b].startsWith('hand') && Math.hypot(q[0] - gloveC[s][0], q[1] - gloveC[s][1], q[2] - gloveC[s][2]) > 0.17) return false;
    return armScore(u, s) > -0.05;
  }
  if (isBody[b]) { const side = q[0] > 0 ? 1 : -1; if (Math.abs(q[0]) > 0.15 && q[1] > -0.33 && q[1] < 0.38 && armScore(u, side) > 0.25) return false; }
  return true;
};
const label = new Int32Array(nU).fill(-1), gd = new Float64Array(nU).fill(Infinity);
// binary heap
const heap = []; const push = (d, v, l) => { heap.push([d, v, l]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
const seedCount = {};
for (let u = 0; u < nU; u++) { const q = [upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]];
  let best = -1, bd = Infinity;
  names.forEach((n, b) => { if (!gate[n](q)) return; const d = segDist(q, J[n].p, J[n].tail); if (d < radius[n] && d < bd) { bd = d; best = b; } });
  if (best >= 0 && allowed(best, u)) { push(0, u, best); seedCount[names[best]] = (seedCount[names[best]] || 0) + 1; } }
console.log('seeds:', JSON.stringify(seedCount));
while (heap.length) { const [d, v, l] = pop(); if (d >= gd[v]) continue; gd[v] = d; label[v] = l; for (const [w, e] of adj[v]) if (d + e < gd[w] && allowed(l, w)) push(d + e, w, l); }
// vertices in pieces with no seed (loose bits): nearest bone in space
// Vertices no bone could reach (e.g. small patches inside a glove where the
// surfaces were fused) take the label of the surrounding surface: grow
// outward from labelled vertices with no restrictions.
let loose = 0; for (let u = 0; u < nU; u++) if (label[u] < 0) loose++;
{ const gd2 = new Float64Array(nU).fill(Infinity);
  for (let u = 0; u < nU; u++) if (label[u] >= 0) { gd2[u] = 0; for (const [w, e] of adj[u]) if (label[w] < 0) push(e, w, label[u]); }
  while (heap.length) { const [d, v, l] = pop(); if (label[v] >= 0 && gd2[v] === 0) continue; if (d >= gd2[v]) continue; gd2[v] = d; label[v] = l; for (const [w, e] of adj[v]) if (d + e < gd2[w]) push(d + e, w, l); } }
console.log('unreached vertices:', loose);

// The arms: the sleeve (white, above SLEEVE_Y) belongs to the upper arm, the
// glove including its cuff (below CUFF_Y) is one rigid piece on the hand.
// The bare skin in between is fused to the torso in this mesh, so it is
// removed and rebuilt as clean capsules further down.
const SLEEVE_Y = 0.24, CUFF_Y = 0.045;
const armSkin = new Uint8Array(nU);
for (let u = 0; u < nU; u++) { const s = limbOf[label[u]]; if (!s) continue; const y = upos[u * 3 + 1]; const side = s > 0 ? 'L' : 'R';
  if (y >= SLEEVE_Y) label[u] = names.indexOf(`upperarm_${side}`);
  else if (y <= CUFF_Y) label[u] = names.indexOf(`hand_${side}`);
  else armSkin[u] = 1; }

// --------------------------------------------- cut fused contact triangles
// Triangles that bridge an arm/glove and the body (other than the real
// shoulder joint) only exist because the surfaces touched in the rest pose;
// left in, they stretch into ribbons when the glove moves. Remove them.
const cutEdges = new Set(); const ekey = (a, b) => (a < b ? a * nU + b : b * nU + a);
// Contact zone: where an arm or glove pressed against the shirt/shorts the two
// surfaces are fused and the texture there is meaningless. Every vertex of an
// arm/glove lying within CONTACT of the body (and vice versa) is in the zone,
// except at the real shoulder joint.
const CONTACT = Number(process.env.CONTACT || 0.035);
const zone = new Uint8Array(nU);
{ const cell = CONTACT; const gk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grids = [new Map(), new Map()];   // [non-limb, limb]
  for (let u = 0; u < nU; u++) { const g = grids[limbOf[label[u]] !== 0 ? 1 : 0]; const k = gk(upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]); if (!g.has(k)) g.set(k, []); g.get(k).push(u); }
  const shoulder = (u) => upos[u * 3 + 1] > 0.27 && /^(upperarm|chest|neck)/.test(names[label[u]]);
  for (let u = 0; u < nU; u++) { if (shoulder(u)) continue; const other = grids[limbOf[label[u]] !== 0 ? 0 : 1];
    const x = upos[u * 3], y = upos[u * 3 + 1], z = upos[u * 3 + 2]; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    search: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const w of other.get(`${cx + a},${cy + b},${cz + c}`) || [])
      if (!shoulder(w) && Math.hypot(upos[w * 3] - x, upos[w * 3 + 1] - y, upos[w * 3 + 2] - z) < CONTACT) { zone[u] = 1; break search; } }
  let nz = 0; for (let u = 0; u < nU; u++) nz += zone[u]; console.log('contact zone vertices:', nz); }

// Remove the contact zone and every triangle that bridges an arm/glove and
// the body (other than the shoulder). Left in, they stretch into ribbons when
// the glove moves; the openings are closed further down.
{ const keep = []; let cut = 0;
  for (let t = 0; t < nT; t++) { const vs = [ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]]; const ls = vs.map((v) => label[uid[v]]);
    const limb = ls.some((l) => limbOf[l] !== 0), other = ls.some((l) => limbOf[l] === 0);
    let bridge = limb && other;
    if (bridge) { const shoulder = ls.every((l) => names[l].startsWith('upperarm') || names[l] === 'chest' || names[l] === 'neck') && vs.every((v) => pos[v * 3 + 1] > 0.27);
      if (shoulder) bridge = false; }
    if (!bridge && vs.some((v) => zone[uid[v]] || armSkin[uid[v]])) bridge = true;
    if (bridge) { cut++; for (let k = 0; k < 3; k++) cutEdges.add(ekey(uid[vs[k]], uid[vs[(k + 1) % 3]])); continue; } keep.push(...vs); }
  // peel ragged rims: triangles with two or three open edges are thin strips
  // or spikes left between removed areas
  for (let pass = 0; pass < 4; pass++) { const ec = new Map(); for (let t = 0; t < keep.length; t += 3) for (let k = 0; k < 3; k++) { const e = ekey(uid[keep[t + k]], uid[keep[t + (k + 1) % 3]]); ec.set(e, (ec.get(e) || 0) + 1); }
    const k2 = []; let peeled = 0;
    for (let t = 0; t < keep.length; t += 3) { let open = 0; for (let k = 0; k < 3; k++) { const e = ekey(uid[keep[t + k]], uid[keep[t + (k + 1) % 3]]); if (ec.get(e) === 1 && cutEdges.has(e)) open++; }
      if (open >= 2) { peeled++; for (let k = 0; k < 3; k++) cutEdges.add(ekey(uid[keep[t + k]], uid[keep[t + (k + 1) % 3]])); continue; } k2.push(keep[t], keep[t + 1], keep[t + 2]); }
    keep.length = 0; keep.push(...k2); if (!peeled) break; console.log('peeled', peeled); }
  // drop slivers left floating after the cut (tiny islands of a few triangles)
  { const par = new Int32Array(nU).map((_, i) => i); const f = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let t = 0; t < keep.length; t += 3) { const a = f(uid[keep[t]]), b = f(uid[keep[t + 1]]), c = f(uid[keep[t + 2]]); par[b] = a; par[f(c)] = a; }
    const cnt = new Map(); for (let t = 0; t < keep.length; t += 3) { const r = f(uid[keep[t]]); cnt.set(r, (cnt.get(r) || 0) + 1); }
    const k2 = []; let dropped = 0; for (let t = 0; t < keep.length; t += 3) { if (cnt.get(f(uid[keep[t]])) < 60) { dropped++; for (let k = 0; k < 3; k++) cutEdges.add(ekey(uid[keep[t + k]], uid[keep[t + (k + 1) % 3]])); continue; } k2.push(keep[t], keep[t + 1], keep[t + 2]); }
    keep.length = 0; keep.push(...k2); console.log('sliver triangles dropped:', dropped); }
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(root.listBuffers()[0]));
  console.log('contact triangles removed:', cut); }

// ------------------------------------------------------------- smoothing
const nB = names.length; let W = new Float32Array(nU * nB); for (let u = 0; u < nU; u++) W[u * nB + label[u]] = 1;
const rigid = new Set(['hand_L', 'hand_R', 'head'].map((n) => names.indexOf(n)));
const ITER = Number(process.env.SMOOTH || 12);
for (let it = 0; it < ITER; it++) { const N = new Float32Array(nU * nB);
  for (let u = 0; u < nU; u++) { const base = u * nB;
    if (rigid.has(label[u]) && [...adj[u].keys()].every((w) => label[w] === label[u])) { N[base + label[u]] = 1; continue; }   // glove/head interiors stay rigid
    let tot = 1; for (let b = 0; b < nB; b++) N[base + b] = W[base + b];
    for (const w of adj[u].keys()) { const lu = limbOf[label[u]], lw = limbOf[label[w]]; if ((lu !== 0) !== (lw !== 0) && !(names[label[u]].startsWith('upperarm') && names[label[w]] === 'chest') && !(names[label[w]].startsWith('upperarm') && names[label[u]] === 'chest')) continue; tot++; for (let b = 0; b < nB; b++) N[base + b] += W[w * nB + b]; }
    for (let b = 0; b < nB; b++) N[base + b] /= tot; }
  W = N; }

// ------------------------------------------------------------- body weight
// The model reads thin in the game, so the torso and legs are filled out:
// each vertex moves away from its bone's axis by the bone's factor (blended
// by the skin weights, so joints stay smooth). Head, gloves and shoes keep
// their shape; the rebuilt arms and sleeves are thickened to match below.
const BULK = Number(process.env.BULK || 1.7);
const bulkOf = { hips: 1.18, spine: 1.18, chest: 1.15, neck: 1.05, thigh_L: 1.2, thigh_R: 1.2, shin_L: 1.12, shin_R: 1.12 };
const ARM_BULK = 1 + 0.15 * BULK;
{ const disp = new Float32Array(nU * 3);
  for (let u = 0; u < nU; u++) { const q = [upos[u * 3], upos[u * 3 + 1], upos[u * 3 + 2]];
    for (let b = 0; b < nB; b++) { const w = W[u * nB + b]; const k = bulkOf[names[b]]; if (!w || !k) continue;
      const c = closest(q, J[names[b]].p, J[names[b]].tail); const f = (k - 1) * BULK * w;
      disp[u * 3] += (q[0] - c[0]) * f; disp[u * 3 + 2] += (q[2] - c[2]) * f;
    } }
  for (let u = 0; u < nU; u++) for (let a = 0; a < 3; a++) upos[u * 3 + a] += disp[u * 3 + a];
  for (let i = 0; i < nV; i++) { const u = uid[i]; for (let a = 0; a < 3; a++) pos[i * 3 + a] = upos[u * 3 + a]; P.setElement(i, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); }
  console.log('body filled out x', BULK); }

// ------------------------------------------------------------- write skin
const joints = new Uint16Array(nV * 4), weights = new Float32Array(nV * 4);
for (let i = 0; i < nV; i++) { const u = uid[i]; const arr = []; for (let b = 0; b < nB; b++) if (W[u * nB + b] > 0.01) arr.push([W[u * nB + b], b]);
  arr.sort((a, b) => b[0] - a[0]); const top = arr.slice(0, 4); const s = top.reduce((a, x) => a + x[0], 0);
  top.forEach(([w, b], k) => { joints[i * 4 + k] = b; weights[i * 4 + k] = w / s; }); }
const buffer = root.listBuffers()[0];

// ---------------------------------------------- close the cut openings
// Cutting the glove/arm free leaves an opening on both sides (the inner face
// of the glove, the side of the shorts/shirt). Close each one with a fan
// around its centre, coloured from the surrounding surface and skinned like
// its rim, so it moves with the part it belongs to.
let joints2 = joints, weights2 = weights;
const baseTex = prim.getMaterial().getBaseColorTexture(); const UV = prim.getAttribute('TEXCOORD_0');
const TW = 1024; const texRaw = await sharp(Buffer.from(baseTex.getImage())).resize(TW, TW, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const vertsOf = Array.from({ length: nU }, () => []); for (let i = 0; i < nV; i++) vertsOf[uid[i]].push(i);
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const texel = (t) => { const x = Math.min(TW - 1, Math.max(0, Math.floor((t[0] - Math.floor(t[0])) * TW))), y = Math.min(TW - 1, Math.max(0, Math.floor((t[1] - Math.floor(t[1])) * TW))); const o = (y * TW + x) * 3; return [texRaw[o], texRaw[o + 1], texRaw[o + 2]]; };
let uvWhite = null, whiteLin = [1, 1, 1];
{ let bw = -1; for (let i = 0; i < nV; i++) { const u = uid[i]; if (names[label[u]] !== 'chest' || zone[u]) continue; const t = UV.getElement(i, []); const c = texel(t); const m = Math.min(...c); if (m > bw) { bw = m; uvWhite = t; whiteLin = [lin(m), lin(m), lin(m)]; } } }
console.log('white texel', uvWhite, whiteLin[0].toFixed(3));
// plain colours of the parts (linear), as medians of their texels
const palette = {};
{ const med = (pred) => { const c = []; for (let i = 0; i < nV; i++) { const u = uid[i]; if (zone[u] || armSkin[u]) continue; const col = texel(UV.getElement(i, [])); if (pred(names[label[u]], col)) c.push(col); }
    return [0, 1, 2].map((ch) => { const a = c.map((x) => x[ch]).sort((p, q) => p - q); return lin(a[a.length >> 1]); }); };
  palette.shirt = med((n, c) => (n === 'chest' || n === 'spine') && Math.min(...c) > 150);
  palette.shorts = med((n, c) => n === 'hips' && c[2] > c[0] + 60);
  palette.glove = med((n, c) => /^hand/.test(n) && c[2] > c[0] + 60);
  console.log('palette (linear)', JSON.stringify(palette, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v))); }

{ const tri = Array.from(prim.getIndices().getArray()); const nk = tri.length / 3;
  const ecount = new Map(), edir = new Map();
  for (let t = 0; t < nk; t++) for (let k = 0; k < 3; k++) { const i = tri[t * 3 + k], j = tri[t * 3 + (k + 1) % 3]; const e = ekey(uid[i], uid[j]); ecount.set(e, (ecount.get(e) || 0) + 1); edir.set(e, [i, j]); }
  const bEdges = []; for (const [e, c] of ecount) if (c === 1 && cutEdges.has(e)) bEdges.push(edir.get(e));
  const par = new Map(); const f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const [i, j] of bEdges) par.set(f(uid[i]), f(uid[j]));
  const groups = new Map(); for (const ed of bEdges) { const r = f(uid[ed[0]]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(ed); }
  const NRM = prim.getAttribute('NORMAL');
  const nP = [], nN = [], nT2 = [], nJ = [], nW = [], nCol = [], newTri = [];
  let next = nV; let patched = 0;
  // walk each opening as an ordered loop and fill it with the minimum-area
  // triangulation, so the patch follows the rim instead of fanning out.
  const out = new Map(); for (const [i, j] of bEdges) { const a = uid[i]; if (!out.has(a)) out.set(a, []); out.get(a).push([i, j]); }
  const used = new Set(); const loops = [];
  for (const [i0, j0] of bEdges) { const e0 = ekey(uid[i0], uid[j0]); if (used.has(e0)) continue;
    const loop = [i0]; used.add(e0); let cur = j0; let ok = false;
    for (let guard = 0; guard < 4000; guard++) { if (uid[cur] === uid[i0]) { ok = true; break; } loop.push(cur);
      const nx = (out.get(uid[cur]) || []).find(([i, j]) => !used.has(ekey(uid[i], uid[j]))); if (!nx) break; used.add(ekey(uid[nx[0]], uid[nx[1]])); cur = nx[1]; }
    if (!ok || loop.length < 3) continue;
    // a loop running round both an arm and the torso (through the armpit) is
    // split into its arm part and its body part, each closed by a chord
    const side = (i) => (limbOf[label[uid[i]]] !== 0 ? 1 : 0);
    const k0 = loop.findIndex((i, k) => side(i) !== side(loop[(k + loop.length - 1) % loop.length]));
    if (k0 < 0) { loops.push(loop); continue; }
    const rot = loop.slice(k0).concat(loop.slice(0, k0)); let run = [rot[0]];
    for (let k = 1; k <= rot.length; k++) { const i = rot[k % rot.length]; if (k < rot.length && side(i) === side(run[0])) run.push(i); else { if (run.length >= 3) loops.push(run); run = [i]; } } }
  const area = (a, b, c) => { const ab = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]], ac = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
    return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2; };
  // a patch triangle whose corners follow different bones would stretch when
  // the joint bends, so such triangles cost far more than their area
  const triCost = (a, b, c) => { const k = new Set([joints[a * 4], joints[b * 4], joints[c * 4]]).size; return area(a, b, c) * (1 + 40 * (k - 1)) + (k - 1) * 0.002; };
  for (const loop of loops) {
    const m = loop.length; if (m > 400) continue;
    const lab = label[uid[loop[0]]];
    const n = [0, 0, 0], c = [0, 0, 0]; for (const i of loop) for (let a = 0; a < 3; a++) { n[a] += unrm[uid[i] * 3 + a]; c[a] += pos[i * 3 + a] / m; }
    const nl = Math.hypot(...n) || 1; n[0] /= nl; n[1] /= nl; n[2] /= nl;
    // colour: each patch vertex takes the texture colour around its rim
    // vertex (as a vertex colour over a plain white texel), so a patch that
    // spans shirt and shorts blends from white to blue like the fabric around it
    const rimCol = (i) => { const u = uid[i]; const acc = [0, 0, 0]; let n = 0;
      const take = (j) => { const c = texel(UV.getElement(j, [])); for (let k = 0; k < 3; k++) acc[k] += lin(c[k]); n++; };
      for (const j of vertsOf[u]) take(j); for (const w of adj[u].keys()) if (!zone[w] && limbOf[label[w]] === limbOf[lab]) for (const j of vertsOf[w]) take(j);
      const c = acc.map((x) => x / n);
      // snap to the nearest plain colour of the part (no stripe/logo smears)
      const pal = limbOf[lab] !== 0 ? (/^hand/.test(names[lab]) ? [palette.glove] : [palette.shirt]) : (['hips', 'thigh_L', 'thigh_R'].includes(names[label[u]]) ? [palette.shorts] : [palette.shirt]);
      let bc = pal[0], bd = Infinity; for (const q of pal) { const d = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]); if (d < bd) { bd = d; bc = q; } }
      return bc.map((x) => Math.min(1, x / whiteLin[0])); };
    const vid = loop.map((i) => { nP.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); nN.push(unrm[uid[i] * 3], unrm[uid[i] * 3 + 1], unrm[uid[i] * 3 + 2]); nT2.push(...uvWhite);
      nCol.push(...(process.env.DEBUG_PATCH ? [1, 0, 1] : rimCol(i))); nJ.push(...joints.slice(i * 4, i * 4 + 4)); nW.push(...weights.slice(i * 4, i * 4 + 4)); return next++; });
    // DP: cost[i][j] = min area triangulation of polygon loop[i..j]
    const cost = new Float64Array(m * m), arg = new Int32Array(m * m).fill(-1);
    for (let len = 2; len < m; len++) for (let i = 0; i + len < m; i++) { const j = i + len; let bc = Infinity, bk = -1;
      for (let k = i + 1; k < j; k++) { const v = cost[i * m + k] + cost[k * m + j] + triCost(loop[i], loop[k], loop[j]); if (v < bc) { bc = v; bk = k; } }
      cost[i * m + j] = bc; arg[i * m + j] = bk; }
    const st = [[0, m - 1]]; while (st.length) { const [i, j] = st.pop(); if (j - i < 2) continue; const k = arg[i * m + j]; newTri.push(vid[j], vid[k], vid[i]); st.push([i, k], [k, j]); }
    patched++;
  }
  // ---- arm capsules: upper arm and forearm, each rigid on its bone, with
  // round ends centred on the joints so the elbow stays closed at any angle
  { let skinUV = null; { const c = []; for (let i = 0; i < nV; i++) { const u = uid[i]; if (!armSkin[u] || zone[u]) continue; const t = UV.getElement(i, []); const col = texel(t); if (col[0] - col[2] > 50 && col[0] > 150) c.push([t, col]); }
      const med = [0, 1, 2].map((ch) => { const a = c.map((x) => x[1][ch]).sort((p, q) => p - q); return a[a.length >> 1]; });
      let bd = Infinity; for (const [t, col] of c) { const d = Math.hypot(col[0] - med[0], col[1] - med[1], col[2] - med[2]); if (d < bd) { bd = d; skinUV = t; } }
      console.log('arm skin colour', med); }
    const capsule = (a, b, ra, rb, bone, segs = 16, cap = 6, look = { uv: null, col: [1, 1, 1] }, hem = 0) => {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(...d); const ax = d.map((x) => x / L);
      const t0 = Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u1 = [ax[1] * t0[2] - ax[2] * t0[1], ax[2] * t0[0] - ax[0] * t0[2], ax[0] * t0[1] - ax[1] * t0[0]]; const ul = Math.hypot(...u1); for (let k = 0; k < 3; k++) u1[k] /= ul;
      const v1 = [ax[1] * u1[2] - ax[2] * u1[1], ax[2] * u1[0] - ax[0] * u1[2], ax[0] * u1[1] - ax[1] * u1[0]];
      const prof = [];   // [axial offset, radius, normal axial, normal radial]
      for (let k = 0; k <= cap; k++) { const ph = -Math.PI / 2 + (k / cap) * Math.PI / 2; prof.push([ra * Math.sin(ph), ra * Math.cos(ph), Math.sin(ph), Math.cos(ph)]); }
      if (hem) { prof.push([L, rb, 0, 1], [L + 0.004, rb * 0.97, 0.6, 0.8], [L + 0.006, hem, 1, 0]); }   // sleeve: rolled hem, then a flat lip in to the arm
      else for (let k = 0; k <= cap; k++) { const ph = (k / cap) * Math.PI / 2; prof.push([L + rb * Math.sin(ph), rb * Math.cos(ph), Math.sin(ph), Math.cos(ph)]); }
      const base = next;
      for (const [o, r, na, nr] of prof) for (let j = 0; j < segs; j++) { const th = (j / segs) * Math.PI * 2; const cs = Math.cos(th), sn = Math.sin(th);
        const rad = [u1[0] * cs + v1[0] * sn, u1[1] * cs + v1[1] * sn, u1[2] * cs + v1[2] * sn];
        nP.push(a[0] + ax[0] * o + rad[0] * r, a[1] + ax[1] * o + rad[1] * r, a[2] + ax[2] * o + rad[2] * r);
        const nn = [ax[0] * na + rad[0] * nr, ax[1] * na + rad[1] * nr, ax[2] * na + rad[2] * nr]; const nl = Math.hypot(...nn) || 1; nN.push(nn[0] / nl, nn[1] / nl, nn[2] / nl);
        nT2.push(...(look.uv || skinUV)); nCol.push(...look.col); nJ.push(bone, 0, 0, 0); nW.push(1, 0, 0, 0); next++; }
      for (let k = 0; k < prof.length - 1; k++) for (let j = 0; j < segs; j++) { const j2 = (j + 1) % segs;
        const p00 = base + k * segs + j, p01 = base + k * segs + j2, p10 = base + (k + 1) * segs + j, p11 = base + (k + 1) * segs + j2;
        newTri.push(p00, p01, p11, p00, p11, p10); } };
    for (const [sd, side] of [[1, 'L'], [-1, 'R']]) {
      const sh = [sd * 0.2, 0.3, 0.0], el = J[`forearm_${side}`].p, wr = [sd * 0.252, 0.0, 0.055];
      capsule(sh, el, 0.042 * ARM_BULK, 0.039 * ARM_BULK, names.indexOf(`upperarm_${side}`));
      // short sleeve over the shoulder: the mesh's own sleeve is fused to the
      // torso and comes out ragged once the arm is cut free, so the arm wears
      // a clean shirt-white sleeve that moves with it
      { const top = J[`upperarm_${side}`].p; const dir = [el[0] - top[0], el[1] - top[1], el[2] - top[2]]; const dl = Math.hypot(...dir);
        const hemP = [top[0] + dir[0] / dl * 0.135, top[1] + dir[1] / dl * 0.135, top[2] + dir[2] / dl * 0.135];
        capsule(top, hemP, 0.066 * ARM_BULK, 0.06 * ARM_BULK, names.indexOf(`upperarm_${side}`), 20, 6, { uv: uvWhite, col: palette.shirt.map((x) => Math.min(1, x / whiteLin[0])) }, 0.04 * ARM_BULK); }
      capsule(el, wr, 0.039 * ARM_BULK, 0.034 * ARM_BULK, names.indexOf(`forearm_${side}`));
    } }
  console.log('openings closed:', patched, 'patch triangles:', newTri.length / 3);
  const grow = (acc, extra, T) => { const a = acc.getArray(); const o = new T(a.length + extra.length); o.set(a); o.set(extra, a.length); acc.setArray(o); };
  grow(P, nP, Float32Array); grow(NRM, nN, Float32Array); grow(UV, nT2, Float32Array);
  for (const sem of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(sem)) { const acc = prim.getAttribute(sem); const sz = acc.getElementSize(); grow(acc, new Array((next - nV) * sz).fill(0), acc.getArray().constructor); }
  if (!process.env.DEBUG_COLORS) { const col = new Float32Array(next * 3).fill(1); col.set(nCol, nV * 3); prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buffer)); }
  joints2 = new Uint16Array(next * 4); joints2.set(joints); joints2.set(nJ, nV * 4);
  weights2 = new Float32Array(next * 4); weights2.set(weights); weights2.set(nW, nV * 4);
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array([...tri, ...newTri])).setBuffer(buffer));
}
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints2).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights2).setBuffer(buffer));
// debug: per-vertex dominant bone as COLOR for the weight preview (stripped later)
if (process.env.DEBUG_COLORS) { const named = { hand_L: [1, 0.1, 0.1], hand_R: [1, 0.1, 0.1], forearm_L: [1, 0.6, 0], forearm_R: [1, 0.6, 0], upperarm_L: [1, 1, 0], upperarm_R: [1, 1, 0], hips: [0.2, 0.4, 1], spine: [0.3, 0.8, 1], chest: [0.6, 0.9, 1] };
  const pal = names.map((n) => named[n] || [0.75, 0.75, 0.75]);
  const nAll = joints2.length / 4; const col = new Float32Array(nAll * 3); for (let i = 0; i < nAll; i++) col.set(pal[joints2[i * 4]], i * 3);
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buffer)); }

const scene = root.listScenes()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
// put the mesh node at the origin (bake its transform is identity for Meshy output)
const jn = {};
for (const n of names) { const node = doc.createNode(n); const par = J[n].parent; const pp = par ? J[par].p : [0, 0, 0];
  node.setTranslation([J[n].p[0] - pp[0], J[n].p[1] - pp[1], J[n].p[2] - pp[2]]); jn[n] = node; if (par) jn[par].addChild(node); }
const rig = doc.createNode('rig'); rig.addChild(jn.hips); scene.addChild(rig);
const ibm = new Float32Array(nB * 16); names.forEach((n, b) => { const p = J[n].p; ibm.set([1,0,0,0, 0,1,0,0, 0,0,1,0, -p[0],-p[1],-p[2],1], b * 16); });
const skin = doc.createSkin('runner').setSkeleton(jn.hips).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
for (const n of names) skin.addJoint(jn[n]);
meshNode.setSkin(skin).setName('runner_mesh');

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, resize: [Number(process.env.TEX || 2048), Number(process.env.TEX || 2048)] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const out = process.env.OUT || 'public/assets/models/runner.glb';
await io.write(out, doc);
const { statSync } = await import('node:fs');
console.log('wrote', out, (statSync(out).size / 1024).toFixed(0), 'KB; bones:', names.join(','));
