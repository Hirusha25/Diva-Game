/**
 * Diva pack collectibles: trims each pack photo (assets/raw/packs, white
 * background) to the pouch, keys the white background out (soft edge) and
 * writes public/assets/textures/packs/<name>.webp + packs.json (aspects).
 *   npm run packs      (node scripts/build-packs.mjs)
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';

const RAW = 'assets/raw/packs', OUT = 'public/assets/textures/packs';
await mkdir(OUT, { recursive: true });
const meta = {};
for (const f of (await readdir(RAW)).sort()) {
  const name = f.replace(/\.[^.]+$/, '');
  const { data, info } = await sharp(`${RAW}/${f}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  // pouch = not near-white; bounding box
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  const isBg = (i) => data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (!isBg((y * W + x) * 3)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // alpha: background flood-filled from the border (white inside the pouch stays)
  const bg = new Uint8Array(w * h); const st = [];
  const px = (x, y) => ((y + y0) * W + (x + x0)) * 3;
  for (let x = 0; x < w; x++) { st.push([x, 0], [x, h - 1]); } for (let y = 0; y < h; y++) { st.push([0, y], [w - 1, y]); }
  while (st.length) { const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= w || y >= h || bg[y * w + x]) continue; if (!isBg(px(x, y))) continue; bg[y * w + x] = 1; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = px(x, y), o = (y * w + x) * 4; rgba[o] = data[i]; rgba[o + 1] = data[i + 1]; rgba[o + 2] = data[i + 2]; rgba[o + 3] = bg[y * w + x] ? 0 : 255; }
  const out = `${OUT}/${name}.webp`;
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).blur(0.6).resize({ height: 512 }).webp({ quality: 86, alphaQuality: 90 }).toFile(out);
  meta[name] = { aspect: w / h };
  console.log(name.padEnd(14), `${w}×${h}`, ((await stat(out)).size / 1024).toFixed(0) + ' KB');
}
await writeFile(`${OUT}/packs.json`, JSON.stringify(meta, null, 2));
