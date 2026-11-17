/**
 * Optimises the Meshy bus stop model for the game.
 *   npm run busstop     (node scripts/optimize-busstop.mjs)
 * assets/raw/models/bus-stop.glb (3.8 M triangles) → public/assets/models/bus-stop.glb:
 * simplified to ~40 k triangles, textures WebP ≤ 2048, meshopt-compressed.
 * The model is re-centred so its footprint is centred on the origin and its
 * base sits at y = 0 (the game scales and places it).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, flatten, textureCompress, meshopt, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('assets/raw/models/bus-stop.glb');
const root = doc.getRoot();
const scene = root.listScenes()[0];

await doc.transform(
  flatten(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.env.RATIO || 0.007), error: Number(process.env.ERR || 0.02) }),
  dedup(), prune(),
);
// bake node transforms into the vertices, then centre the footprint, base at y = 0
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'); const N = prim.getAttribute('NORMAL');
    for (let i = 0; i < P.getCount(); i++) { const [x, y, z] = P.getElement(i, []);
      P.setElement(i, [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]); }
    if (N) for (let i = 0; i < N.getCount(); i++) { const [x, y, z] = N.getElement(i, []);
      const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; const l = Math.hypot(...v) || 1; N.setElement(i, v.map((c) => c / l)); }
  }
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
const b = getBounds(scene);
const off = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2];
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const P = prim.getAttribute('POSITION'); for (let i = 0; i < P.getCount(); i++) { const v = P.getElement(i, []); P.setElement(i, [v[0] + off[0], v[1] + off[1], v[2] + off[2]]); } }
let tris = 0; for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) tris += prim.getIndices().getCount() / 3;
console.log('triangles', tris);

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [2048, 2048] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const out = 'public/assets/models/bus-stop.glb';
await io.write(out, doc);
const { statSync } = await import('node:fs');
console.log('wrote', out, (statSync(out).size / 1024).toFixed(0), 'KB');
