/**
 * Asset pipeline: raw Meshy / Sketchfab exports  ->  small runtime GLBs.
 *
 *   node scripts/optimize-assets.mjs
 *
 * Bus shelter:
 *   - removes every advert / text texture (ad screens become plain panels)
 *   - removes the model's own road + kerb (the game builds a continuous road)
 *   - removes the two 1M-vertex trees (the game uses the stylised tree art instead)
 *   - dedups, joins meshes by material, welds, quantizes, meshopt-compresses
 *   - converts textures to WebP and shrinks them
 * Road:
 *   - exports the asphalt texture as WebP (the game tiles it on a plane)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, join, weld, quantize, textureCompress, meshopt, resample, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RAW = 'assets/raw';
const OUT_MODELS = 'public/assets/models';
const OUT_TEX = 'public/assets/textures';
await mkdir(OUT_MODELS, { recursive: true });
await mkdir(OUT_TEX, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';

// ---------------------------------------------------------------- bus shelter
{
  const src = `${RAW}/chennai-bus-shelter/source/Chennai_Bus_Shelter.glb`;
  const doc = await io.read(src);
  const root = doc.getRoot();

  // 1. Strip advert + text textures. The screen quads stay so a Diva creative
  //    can be mapped onto them later; for now they are flat painted panels.
  const PANEL_COLOUR = [0.93, 0.95, 0.97, 1]; // off-white
  for (const mat of root.listMaterials()) {
    const name = mat.getName();
    if (['Material.002', 'Material.003', 'Material.005'].includes(name)) {
      mat.setBaseColorTexture(null);
      mat.setBaseColorFactor(PANEL_COLOUR);
      mat.setMetallicFactor(0).setRoughnessFactor(0.6);
    }
  }

  // 2. Drop nodes the game rebuilds itself or bakes separately.
  const DROP = /^(Tree|Tree\.001|road_base|kerb)$/;
  for (const node of root.listNodes()) {
    if (DROP.test(node.getName())) node.dispose();
  }

  // 3. Generic optimisation.
  await doc.transform(
    dedup(),
    prune(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    resample(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      quality: 82,
      resize: [512, 512],
    }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  const out = `${OUT_MODELS}/bus-shelter.glb`;
  await io.write(out, doc);
  console.log('bus shelter:', await kb(src), '->', await kb(out));
}

// ---------------------------------------------------------------- road
{
  const src = `${RAW}/road/source/road.gltf`;
  const doc = await io.read(src);
  const tex = doc.getRoot().listTextures()[0];
  const png = tex.getImage();
  const out = `${OUT_TEX}/asphalt.webp`;
  // The source texture has a dashed centre line; crop the plain asphalt on the
  // left so the game can tile it and paint its own three-lane markings.
  const meta = await sharp(Buffer.from(png)).metadata();
  await sharp(Buffer.from(png))
    .extract({ left: 0, top: 0, width: 360, height: meta.height })
    .resize(384, 1024)
    .webp({ quality: 80 })
    .toFile(out);
  console.log('asphalt texture:', meta.width + 'x' + meta.height, '-> cropped tile', await kb(out));

  // Also keep an optimised slab in case a level wants the original mesh.
  await doc.transform(
    unpartition(), dedup(), prune(), weld(), quantize(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  const slab = `${OUT_MODELS}/road-slab.glb`;
  await io.write(slab, doc);
  console.log('road slab:', await kb(src), '->', await kb(slab));
}

// ---------------------------------------------------------------- leaf sprite
{
  // Standalone autumn-leaf sprite for ground litter / particles.
  const src = `${RAW}/chennai-bus-shelter/textures/vecteezy_dry-autumn-leaf-on-transparent-background_45161010_.png`;
  const out = `${OUT_TEX}/leaf.webp`;
  await sharp(src).resize(256, 256).webp({ quality: 80 }).toFile(out);
  console.log('leaf sprite ->', await kb(out));
}

// ---------------------------------------------------------------- clouds
{
  // Cartoon cloud sprites (transparent PNGs) -> trimmed WebP, max 1024 px wide.
  const meta = {};
  for (const n of [1, 2, 3, 4]) {
    const src = `${RAW}/clouds/cloud-${n}.png`;
    const out = `${OUT_TEX}/cloud-${n}.webp`;
    const img = sharp(src).trim();
    const info = await img.clone().toBuffer({ resolveWithObject: true });
    const w = Math.min(1024, info.info.width);
    await sharp(src).trim().resize({ width: w }).webp({ quality: 82, alphaQuality: 85 }).toFile(out);
    const final = await sharp(out).metadata();
    meta[`cloud-${n}`] = { aspect: final.width / final.height };
    console.log(`cloud-${n}:`, info.info.width + 'x' + info.info.height, '->', await kb(out));
  }
  await writeFile(`${OUT_TEX}/clouds.json`, JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------- trees
{
  // Stylised tree art (transparent PNGs) -> trimmed WebP billboards, 768 px wide.
  const meta = {};
  for (const n of [1, 2, 3, 4]) {
    const src = `${RAW}/trees/tree-${n}.png`;
    const out = `${OUT_TEX}/tree-${n}.webp`;
    await sharp(src).trim().resize({ width: 768 }).webp({ quality: 84, alphaQuality: 90 }).toFile(out);
    const final = await sharp(out).metadata();
    meta[`tree-${n}`] = { aspect: final.width / final.height };
    console.log(`tree-${n}: ->`, await kb(out));
  }
  await writeFile(`${OUT_TEX}/trees.json`, JSON.stringify(meta, null, 2));
}
