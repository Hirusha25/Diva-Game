/**
 * Clean-shirt map for the runner (public/assets/textures/runner-clean.webp).
 * Finds the mud in the runner's texture and paints it out with the
 * surrounding fabric colour. Only texture painted on the body and limbs is
 * searched (the model's triangles are mapped into the texture by their
 * bone), so the brown hair and the face are never touched.
 *   RGB = the clean colour, A = how much stain there is (0..1).
 * The game blends towards it as Diva packs are collected (player.js).
 *   npm run runner-clean     (after npm run rig)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('public/assets/models/runner.glb');
const img = Buffer.from(doc.getRoot().listMaterials()[0].getBaseColorTexture().getImage());
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const jointNames = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
const N = 1024;
const { data } = await sharp(img).resize(N, N).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const n = N * N;
const at = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
// texture area painted on the body and limbs (not the head: hair and face)
const body = new Uint8Array(n);
{ const UV = prim.getAttribute('TEXCOORD_0'), JT = prim.getAttribute('JOINTS_0'), ix = prim.getIndices().getArray();
  const skip = new Set(['head']);   // hair and face; the neck bone also carries the shirt's upper back
  const t = [0, 0], q = [0, 0, 0, 0];
  for (let k = 0; k < ix.length; k += 3) {
    const vs = [ix[k], ix[k + 1], ix[k + 2]];
    if (vs.some((v) => skip.has(jointNames[JT.getElement(v, q)[0]]))) continue;
    const P = vs.map((v) => { UV.getElement(v, t); return [t[0] * N, t[1] * N]; });
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); if (Math.abs(area) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      if (w0 >= -0.02 && w1 >= -0.02 && 1 - w0 - w1 >= -0.02) body[y * N + x] = 1; } } }
// the head's texture can sit right next to the body's: keep a 2 px margin from it
{ const head = new Uint8Array(n); const UV = prim.getAttribute('TEXCOORD_0'), JT = prim.getAttribute('JOINTS_0'), ix = prim.getIndices().getArray(); const t = [0, 0], q = [0, 0, 0, 0];
  for (let k = 0; k < ix.length; k += 3) { const vs = [ix[k], ix[k + 1], ix[k + 2]]; if (!vs.every((v) => jointNames[JT.getElement(v, q)[0]] === 'head')) continue;
    for (const v of vs) { UV.getElement(v, t); const x = Math.min(N - 1, Math.floor(t[0] * N)), y = Math.min(N - 1, Math.floor(t[1] * N)); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) head[yy * N + xx] = 1; } } }
  for (let i = 0; i < n; i++) if (head[i]) body[i] = 0; }
const keep = new Uint8Array(n);
let kept = 0;
for (let i = 0; i < n; i++) { if (!body[i]) continue; const [r, g, b] = at(i); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), mean = (r + g + b) / 3;
  const skin = r > 225 && g > 125 && b > 70;
  // mud browns: g between ~0.38 and 0.9 of r (the shorts' red stripe is below, its yellow and the skin are brighter)
  if (!skin && r < 228 && g >= 0.38 * r && g <= 0.93 * r && r - b > 18 && mean < 215) { keep[i] = 1; kept++; } }
// grow by 2 px to take the soft halo of each splash
let mask = Float32Array.from(keep);
for (let it = 0; it < 4; it++) { const m2 = Float32Array.from(mask); for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = y * N + x; if (mask[i]) continue;
  if ((mask[i - 1] || mask[i + 1] || mask[i - N] || mask[i + N]) ) m2[i] = 0.9; else if (mask[i - 1] || mask[i + 1] || mask[i - N] || mask[i + N]) m2[i] = 0.5; } mask = m2; }
// clean colour: normalised blur of the unstained pixels around each splash
const prem = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) { const w = 1 - Math.min(1, mask[i]); const [r, g, b] = at(i); prem[i * 4] = r * w; prem[i * 4 + 1] = g * w; prem[i * 4 + 2] = b * w; prem[i * 4 + 3] = 255 * w; }
const bl = await sharp(prem, { raw: { width: N, height: N, channels: 4 } }).blur(9).raw().toBuffer();
// The clean state: every piece of white fabric on the body (shirt, socks,
// shoes) is washed to clean white with its shading kept but its tint
// removed, and the mud is replaced; blue shorts/gloves, the red/yellow
// stripes and skin are left exactly as they are.
const keepAsIs = (r, g, b) =>
  (b > r + 30 && b > g) ||                                   // blue shorts, gloves, socks' stripes
  (r > 170 && g < 95 && b < 95) ||                           // red stripe
  (r > 170 && g > 140 && b < 110 && r - b > 90) ||          // yellow stripe
  (r > 200 && g > 115 && g < 205 && b > 65 && b < 175 && r - g > 30 && r - b > 55 && !keep[0]);   // skin
const out = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) { const w = bl[i * 4 + 3] / 255; const [r, g, b] = at(i);
  const mud = mask[i] > 0.01;
  let c = mud && w > 0.02 ? [bl[i * 4] / w, bl[i * 4 + 1] / w, bl[i * 4 + 2] / w] : [r, g, b];
  let a = Math.min(1, mask[i]);
  if (body[i] && (mud || !keepAsIs(r, g, b))) {
    // fabric: neutral, bright white keeping a little of its shading
    const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    const v = Math.min(250, 236 + (lum - 225) * 0.35);
    c = [v, v, Math.min(255, v + 4)];
    a = 1;
  }
  for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.min(255, Math.max(0, Math.round(c[k])));
  out[i * 4 + 3] = Math.max(1, Math.round(a * 255)); }   // never 0: keeps the encoder from dropping the colour
const file = 'public/assets/textures/runner-clean.webp';
await sharp(out, { raw: { width: N, height: N, channels: 4 } }).webp({ quality: 85, alphaQuality: 80 }).toFile(file);
console.log('mud pixels found:', kept, '→', file, ((await stat(file)).size / 1024).toFixed(0) + ' KB');
