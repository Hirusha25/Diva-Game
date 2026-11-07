/**
 * Cover-page layers: trims each poster layer in assets/raw/new, exports WebP
 * with alpha, and records where it sits in the poster frame (fractions), so
 * the lobby can rebuild the poster at any screen size.
 *   node scripts/build-cover.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';

const OUT = 'public/assets/ui';
await mkdir(OUT, { recursive: true });
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';

const LAYERS = [
  // key        file  export width  role
  ['logo',     3, 1100, 'Diva Fresh Run logo'],
  ['hcb',      4,  520, 'hcb logo'],
  ['glow',     5, 1100, 'sun glow'],
  ['heroes',   6, 1100, 'boy + girl with stain badges'],
  ['tagline',  7, 1100, 'Sinhala tagline'],
  ['ribbon',   8, 1600, 'bottom red/blue ribbon'],
  ['start',    9, 1000, 'START button'],
];

const meta = {};
for (const [key, n, width, role] of LAYERS) {
  const src = `assets/raw/new/${n}.png`;
  const frame = await sharp(src).metadata();
  const trimmed = await sharp(src).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
  const { info } = trimmed;
  const left = -info.trimOffsetLeft, top = -info.trimOffsetTop;
  const out = `${OUT}/${key}.webp`;
  await sharp(trimmed.data).resize({ width: Math.min(width, info.width) }).webp({ quality: 86, alphaQuality: 92 }).toFile(out);
  meta[key] = {
    role,
    x: left / frame.width, y: top / frame.height,
    w: info.width / frame.width, h: info.height / frame.height,
  };
  console.log(key.padEnd(8), role.padEnd(32), `${(meta[key].x * 100).toFixed(1)}%,${(meta[key].y * 100).toFixed(1)}%  ${(meta[key].w * 100).toFixed(1)}x${(meta[key].h * 100).toFixed(1)}%`, await kb(out));
}
meta.frame = { aspect: 2048 / 3126 };
await writeFile(`${OUT}/cover.json`, JSON.stringify(meta, null, 2));
