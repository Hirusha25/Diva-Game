/**
 * Stain obstacles: the mud / sand puddle pictures (assets/raw/stains,
 * transparent background) trimmed, resized and written to
 * public/assets/textures/stains/<name>.webp + stains.json (aspects).
 *   npm run stains      (node scripts/build-stains.mjs)
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';

const RAW = 'assets/raw/stains', OUT = 'public/assets/textures/stains';
await mkdir(OUT, { recursive: true });
const meta = {};
for (const f of (await readdir(RAW)).sort()) {
  const name = f.replace(/\.[^.]+$/, '');
  const t = await sharp(`${RAW}/${f}`).ensureAlpha().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });   // pictures come with a transparent background
  const out = `${OUT}/${name}.webp`;
  await sharp(t.data).resize({ width: 768 }).webp({ quality: 86, alphaQuality: 90 }).toFile(out);
  meta[name] = { aspect: t.info.width / t.info.height };
  console.log(name.padEnd(8), `${t.info.width}×${t.info.height}`, ((await stat(out)).size / 1024).toFixed(0) + ' KB');
}
await writeFile(`${OUT}/stains.json`, JSON.stringify(meta, null, 2));
