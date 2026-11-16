/**
 * Cuts small leaf / flower patches out of the bush artwork and gives each a
 * soft irregular edge, for the volumetric 3D bushes (world.js _makeBush3D).
 *   node scripts/make-foliage-cards.mjs
 * Output: public/assets/textures/card-leaf-{1,2,3}.webp, card-flower-{white,pink}.webp
 */
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
const OUT = 'public/assets/textures';
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';

async function raw(file) { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
const cls = (r, g, b, a) => {
  if (a < 200) return 'none';
  if (r > 200 && g > 200 && b > 200) return 'white';
  if (r > 170 && b > 90 && g < 140) return 'pink';
  if (g > r + 20 && g > b + 20) return 'leaf';
  return 'other';
};
/** Best WxW window maximising the share of `want` pixels (step 16). */
function best(img, W, want, minShare = 0.6) {
  let bestS = -1, bx = 0, by = 0;
  for (let y = 0; y + W <= img.h; y += 16) for (let x = 0; x + W <= img.w; x += 16) {
    let n = 0, m = 0;
    for (let yy = y; yy < y + W; yy += 4) for (let xx = x; xx < x + W; xx += 4) { const i = (yy * img.w + xx) * 4; const c = cls(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]); n++; if (c === want) m++; else if (c === 'none') m -= 2; }
    const sc = m / n; if (sc > bestS) { bestS = sc; bx = x; by = y; }
  }
  if (bestS < minShare) console.warn(`  (best ${want} window only ${(bestS * 100).toFixed(0)} %)`);
  return { x: bx, y: by, score: bestS };
}
/** Soft irregular blob mask (radial falloff with angular wobble). */
function blobMask(S, seed) {
  const buf = Buffer.alloc(S * S); let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const lobes = Array.from({ length: 7 }, () => ({ a: rnd() * Math.PI * 2, k: 0.75 + rnd() * 0.25 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2); const r = Math.hypot(dx, dy); const th = Math.atan2(dy, dx);
    let edge = 0.78; for (const l of lobes) edge += 0.12 * Math.cos(3 * (th - l.a)) * l.k / 7;
    const v = r < edge * 0.7 ? 1 : Math.max(0, 1 - (r - edge * 0.7) / (edge * 0.3));
    buf[y * S + x] = Math.round(255 * v);
  }
  return buf;
}
async function cut(file, want, W, out, seed) {
  const img = await raw(file); const { x, y } = best(img, W, want);
  const rgb = await sharp(file).extract({ left: x, top: y, width: W, height: W }).removeAlpha().resize(256, 256).raw().toBuffer();
  const mask = blobMask(256, seed);
  await sharp(rgb, { raw: { width: 256, height: 256, channels: 3 } }).joinChannel(mask, { raw: { width: 256, height: 256, channels: 1 } }).webp({ quality: 84, alphaQuality: 90 }).toFile(out);
  console.log(out.split('/').pop().padEnd(22), `${want} from ${file.split('/').pop()} @${x},${y}`, await kb(out));
}
await cut('assets/raw/bushes-v2/bush-1.png', 'leaf', 220, `${OUT}/card-leaf-1.webp`, 1);
await cut('assets/raw/bushes-v2/bush-4.png', 'leaf', 220, `${OUT}/card-leaf-2.webp`, 2);
await cut('assets/raw/bushes-v2/bush-2.png', 'leaf', 200, `${OUT}/card-leaf-3.webp`, 3);
await cut('assets/raw/bushes-v2/bush-1.png', 'white', 150, `${OUT}/card-flower-white.webp`, 4);
await cut('assets/raw/bushes-v2/bush-2.png', 'pink', 150, `${OUT}/card-flower-pink.webp`, 5);
