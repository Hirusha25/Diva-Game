/**
 * Registration-screen layers (assets/raw/register, same 5200 × 7938 frame as
 * the cover poster): trims each layer, exports WebP and records its place in
 * the frame (fractions), so the screen rebuilds the design at any size.
 *   npm run register-ui      (node scripts/build-register.mjs)
 * - the two input fields lose their baked-in placeholder text (the real
 *   inputs show it, and it disappears as you type);
 * - the consent layer is split into one card background (empty box) and a
 *   ticked-box overlay, so each box can be toggled.
 */
import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';

const RAW = 'assets/raw/register', OUT = 'public/assets/ui/reg';
await mkdir(OUT, { recursive: true });
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';
const FW = 5200, FH = 7938;
const meta = { frame: { aspect: FW / FH } };
const place = (key, x, y, w, h) => { meta[key] = { x: x / FW, y: y / FH, w: w / FW, h: h / FH }; };

async function trimmed(n) {
  const r = await sharp(`${RAW}/${n}.png`).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
  return { data: r.data, x: -r.info.trimOffsetLeft, y: -r.info.trimOffsetTop, w: r.info.width, h: r.info.height };
}
async function save(key, input, width) {
  const out = `${OUT}/${key}.webp`;
  await sharp(input).resize({ width }).webp({ quality: 88, alphaQuality: 92 }).toFile(out);
  console.log(key.padEnd(10), await kb(out));
}

// plain layers
for (const [key, n, width] of [['panel', 5, 1000], ['header', 6, 800], ['divider', 9, 800], ['male', 10, 420], ['female', 11, 460], ['submit', 13, 720]]) {
  const t = await trimmed(n); place(key, t.x, t.y, t.w, t.h); await save(key, t.data, width);
}

// input fields: paint over the placeholder text with the field's own empty
// fill, blended across from the clean columns on either side of the text
for (const [key, n, textEnd] of [['fieldName', 8, 0.93], ['fieldPhone', 7, 0.93]]) {   // to the right end: also evens out the art's lighter band
  const t = await trimmed(n);
  const { data, info } = await sharp(t.data).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, C = info.channels, x0 = Math.round(W * 0.2) - 1, x1 = Math.round(W * textEnd) + 1;
  for (let y = 0; y < info.height; y++) for (let x = x0 + 1; x < x1; x++) {
    const t = (x - x0) / (x1 - x0);
    for (let c = 0; c < C; c++) data[(y * W + x) * C + c] = Math.round(data[(y * W + x0) * C + c] * (1 - t) + data[(y * W + x1) * C + c] * t);
  }
  place(key, t.x, t.y, t.w, t.h);
  await save(key, await sharp(data, { raw: { width: W, height: info.height, channels: C } }).png().toBuffer(), 1000);
}

// consent cards: layer 12 holds two cards (rows 1–801 and 881–1681 of its
// trimmed box); the first has a ticked box, the second an empty one.
{
  const t = await trimmed(12);
  const card = (top, h) => sharp(t.data).extract({ left: 0, top, width: t.w, height: h }).toBuffer();
  place('card1', t.x, t.y + 1, t.w, 800); place('card2', t.x, t.y + 881, t.w, 800);
  await save('card', await card(881, 800), 1000);                         // empty box
  const box = { left: 130 - 8, top: 111 - 8, width: 300 + 16, height: 293 + 16 };
  await save('tick', await sharp(t.data).extract(box).toBuffer(), 110);  // ticked box
  // ticked box placement inside each card (fractions of the card)
  meta.tick = { card1: { x: box.left / t.w, y: (box.top - 1) / 800 }, card2: { x: (128 - 8) / t.w, y: (1014 - 881 - 8) / 800 }, w: box.width / t.w, h: box.height / 800 };
}

// blank versions for the consent viewer: banner without "Register Now",
// card without the checkbox, button without "Submit" (text is drawn in HTML)
async function blank(src, out, x0f, x1f, y0f, y1f, fromRight = false, width = 1000) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = 4, x0 = Math.round(W * x0f), x1 = Math.round(W * x1f);
  const src0 = fromRight ? x1 : x0 - 1, src1 = fromRight ? Math.min(W - 1, x1 + 1) : x0 - 1;
  for (let y = Math.round(H * y0f); y < Math.round(H * y1f); y++) for (let x = x0; x < x1; x++) {
    const sx = fromRight ? x1 + 2 : (x0 - 2); for (let c = 0; c < C; c++) data[(y * W + x) * C + c] = data[(y * W + Math.max(0, Math.min(W - 1, sx))) * C + c]; }
  await sharp(data, { raw: { width: W, height: H, channels: C } }).resize({ width }).webp({ quality: 88, alphaQuality: 92 }).toFile(`${OUT}/${out}.webp`);
  console.log(out.padEnd(10), await kb(`${OUT}/${out}.webp`));
}
// Banner / button: rebuild the blue body under the text row by row, blending
// between clean blue on either side of the text; the flower, leaves and the
// yellow / red swoosh are kept exactly as drawn.
async function clearText(src, out, o) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = (x, y) => (y * W + x) * 4;
  // flower: light pixels joined to its yellow centre (so a letter touching a petal is not kept)
  const petal = new Uint8Array(W * H);
  { const light = (i) => Math.min(data[i], data[i + 1], data[i + 2]) > 140 || (data[i] > 190 && data[i + 1] > 140 && data[i + 2] < 140);
    const st = [];
    for (let y = 0; y < H; y++) for (let x = Math.round(o.flowerX * W); x < W; x++) { const i = px(x, y); if (data[i] > 200 && data[i + 1] > 150 && data[i + 2] < 110 && data[i + 3] > 200) st.push(y * W + x); }
    while (st.length) { const v = st.pop(); if (petal[v]) continue; const x = v % W, y = (v / W) | 0; if (!light(px(x, y))) continue; petal[v] = 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) st.push(yy * W + xx); } }
    // grow 2 px so the petal's soft edge stays
    for (let it = 0; it < 2; it++) { const nx = Uint8Array.from(petal); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const v = y * W + x; if (!petal[v] && (petal[v - 1] || petal[v + 1] || petal[v - W] || petal[v + W])) nx[v] = 1; } petal.set(nx); } }
  const keep = (x, y) => { const i = px(x, y), r = data[i], g = data[i + 1], b = data[i + 2];
    return petal[y * W + x] ||
           (x < o.flowerX * W && r > 170 && g > 130 && b < 120) ||   // yellow swoosh
           (r > 160 && g < 110 && b < 130) ||                        // red swoosh
           (g > r + 25 && g > b + 10);                               // leaves
  };
  const body = (x, y) => { const i = px(x, y), r = data[i], g = data[i + 1], b = data[i + 2]; return b > 140 && b > r + 60 && data[i + 3] > 200; };
  const sample = (y, xa, xb) => { let n = 0; const c = [0, 0, 0];
    for (let x = Math.round(xa * W); x < Math.round(xb * W); x++) if (body(x, y)) { const i = px(x, y); c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; n++; }
    return n ? c.map((v) => v / n) : null; };
  let lastL = null, lastR = null;
  for (let y = Math.round(o.y0 * H); y < Math.round(o.y1 * H); y++) {
    const L = sample(y, o.l0, o.l1) || lastL, R = sample(y, o.r0, o.r1) || L || lastR; lastL = L; lastR = R; if (!L) continue;
    const xa = Math.round(o.x0 * W), xb = Math.round(o.x1 * W);
    for (let x = xa; x < xb; x++) { if (keep(x, y)) continue;
      const t = (x - xa) / (xb - xa), i = px(x, y);
      const f = Math.min(1, Math.min(x - xa, xb - x) / (0.025 * W));   // feather the left/right edges into the original
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((L[c] * (1 - t) + R[c] * t) * f + data[i + c] * (1 - f)); data[i + 3] = 255; }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).blur(0.4).webp({ quality: 90, alphaQuality: 92 }).toFile(`${OUT}/${out}.webp`);
  console.log(out.padEnd(10), await kb(`${OUT}/${out}.webp`));
}
await clearText(`${OUT}/header.webp`, 'banner', { y0: 0.12, y1: 0.8, x0: 0.06, x1: 0.86, l0: 0.035, l1: 0.065, r0: 0.84, r1: 0.88, flowerX: 0.76 });
await clearText(`${OUT}/submit.webp`, 'button', { y0: 0.12, y1: 0.8, x0: 0.16, x1: 0.8, l0: 0.1, l1: 0.16, r0: 0.75, r1: 0.79, flowerX: 0.74 });
await blank(`${OUT}/card.webp`, 'cardPlain', 0.025, 0.17, 0.08, 0.66, true);
await writeFile(`${OUT}/register.json`, JSON.stringify(meta, null, 2));
console.log('wrote', `${OUT}/register.json`);
