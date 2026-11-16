/**
 * Prepares the front-view hedge art (assets/raw/bushes-v3) for the wall top.
 *   node scripts/make-hedge.mjs
 * Output (public/assets/textures):
 *   hedge-strip.webp  the mixed hedge, cropped top/bottom and made to repeat
 *                     seamlessly left-to-right, laid along the wall like a fence
 *   bush-5.webp       the white hedge clump, cropped tight (stands facing the runner)
 *   hedges.json       aspect ratios
 */
import sharp from 'sharp';
import { stat, writeFile } from 'node:fs/promises';
const RAW = 'assets/raw/bushes-v3';
const OUT = 'public/assets/textures';
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';

// ---- strip: crop rows to the visible hedge, then cross-fade the last BLEND
// columns into the first so the right edge runs straight into the left edge.
{
  const { data, info } = await sharp(`${RAW}/hedge-mixed-strip.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const rowVisible = (y) => { let n = 0; for (let x = 0; x < W; x += 4) if (data[(y * W + x) * 4 + 3] > 128) n++; return n; };
  let top = 0; while (top < H && rowVisible(top) === 0) top++;
  let bottom = H - 1; while (bottom > top && rowVisible(bottom) < W / 8) bottom--;   // last solid row = the flat base
  const h = bottom - top + 1, BLEND = Math.round(W * 0.1), w = W - BLEND;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = ((y + top) * W + x) * 4, o = (y * w + x) * 4;
    if (x < BLEND) {
      const b = ((y + top) * W + (w + x)) * 4, t = x / BLEND;       // t=0: all tail, t=1: all head
      const aa = data[a + 3] * t, ab = data[b + 3] * (1 - t), sum = aa + ab || 1;
      for (let c = 0; c < 3; c++) out[o + c] = (data[a + c] * aa + data[b + c] * ab) / sum;
      out[o + 3] = Math.min(255, aa + ab);
    } else data.copy(out, o, a, a + 4);
  }
  const file = `${OUT}/hedge-strip.webp`;
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).resize({ width: 1024 }).webp({ quality: 86, alphaQuality: 92 }).toFile(file);
  const m = await sharp(file).metadata();
  var strip = { aspect: m.width / m.height };
  console.log('hedge-strip:', m.width + 'x' + m.height, await kb(file));
}
// ---- white clump
{
  const file = `${OUT}/bush-5.webp`;
  await sharp(`${RAW}/hedge-white.webp`).trim({ threshold: 40 }).resize({ width: 768 }).webp({ quality: 84, alphaQuality: 90 }).toFile(file);
  const m = await sharp(file).metadata();
  var white = { aspect: m.width / m.height };
  console.log('bush-5:', m.width + 'x' + m.height, await kb(file));
}
await writeFile(`${OUT}/hedges.json`, JSON.stringify({ strip, 'bush-5': white }, null, 2));
