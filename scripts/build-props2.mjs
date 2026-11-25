/**
 * Parked bus, exhaust smoke, the flower-bubble icon and the shirt-meter tees
 * (assets/raw/props2, transparent backgrounds): trimmed and resized.
 *   npm run props2      (node scripts/build-props2.mjs)
 * The shirt meter and HUD row pictures in that folder are design references.
 */
import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';

const RAW = 'assets/raw/props2';
await mkdir('public/assets/textures/props2', { recursive: true });
const meta = {};
for (const [name, out, width] of [
  ['bus', 'public/assets/textures/props2/bus.webp', 1024],
  ['smoke', 'public/assets/textures/props2/smoke.webp', 768],
  ['flower-bubble', 'public/assets/ui/flower-bubble.webp', 240],   // shown up to ~60 px on 3x screens
  ['shirt-clean', 'public/assets/ui/shirt-clean.webp', 480],   // shown up to ~200 px (shirt drop, How to Play): sharp on retina
  ['shirt-dirty', 'public/assets/ui/shirt-dirty.webp', 480],
  ['banana', 'public/assets/textures/props2/banana.webp', 512],
]) {
  const t = await sharp(`${RAW}/${name}.webp`).ensureAlpha().trim({ threshold: 2 }).toBuffer({ resolveWithObject: true });
  await sharp(t.data).resize({ width }).webp({ quality: 88, alphaQuality: 90 }).toFile(out);
  meta[name] = { aspect: t.info.width / t.info.height, w: t.info.width, h: t.info.height };
  console.log(name.padEnd(14), `${t.info.width}×${t.info.height}`, ((await stat(out)).size / 1024).toFixed(0) + ' KB');
}
await writeFile('public/assets/textures/props2/props2.json', JSON.stringify(meta, null, 2));
