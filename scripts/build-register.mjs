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
await blank(`${OUT}/header.webp`, 'banner', 0.07, 0.845, 0.1, 0.64);
await blank(`${OUT}/banner.webp`, 'banner', 0.22, 0.31, 0.6, 0.72);   // the descender of the 'g'
await blank(`${OUT}/card.webp`, 'cardPlain', 0.025, 0.17, 0.08, 0.66, true);
await blank(`${OUT}/submit.webp`, 'button', 0.12, 0.745, 0.12, 0.62);
await writeFile(`${OUT}/register.json`, JSON.stringify(meta, null, 2));
console.log('wrote', `${OUT}/register.json`);
