/**
 * Sharp artwork for the 3D bus stop (public/js/busstop.js), cut from the Diva bus stop
 * illustration (assets/raw/props/bus-stand.png) and laid out flat at each
 * panel's real proportions (the illustration shows them at an angle):
 *   poster.webp  side poster (Diva Fresh logo + pack, water and swoosh)
 *   sign.webp    hanging sign face
 *   roof.webp    roof band with the Diva Fresh lettering
 * public/js/busstop.js puts them on the bus stop it builds.
 *   npm run busstop-art     (node scripts/build-busstop-art.mjs)
 */
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';

const SRC = 'assets/raw/props/bus-stand.png', OUT = 'public/assets/textures/busstop';
await mkdir(OUT, { recursive: true });
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';
const crop = (left, top, width, height) => sharp(SRC).extract({ left, top, width, height }).removeAlpha();
const svg = (s) => Buffer.from(s);
/** soft-edged rectangle alpha, so a cut-out blends into what is behind it */
async function feather(img, w, h, edge = 14) {
  const m = await sharp(svg(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/><rect x="${edge}" y="${edge}" width="${w - 2 * edge}" height="${h - 2 * edge}" rx="${edge}" fill="#fff"/></svg>`))
    .blur(edge * 0.6).extractChannel(0).toBuffer();
  return sharp(await img.resize(w, h).toBuffer()).joinChannel(m).png().toBuffer();
}
async function rounded(buf, w, h, r) {
  const m = await sharp(svg(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`)).extractChannel(0).toBuffer();
  return sharp(await sharp(buf).resize(w, h).removeAlpha().toBuffer()).joinChannel(m).png().toBuffer();
}

// ---- side poster: 0.53 × 0.70 panel → 600 × 792
{
  const W = 600, H = 792;
  const bg = svg(`<svg width="${W}" height="${H}"><defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9e0fb"/><stop offset=".55" stop-color="#eef8ff"/><stop offset="1" stop-color="#d6efff"/></linearGradient>
      <linearGradient id="pink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0388f"/><stop offset="1" stop-color="#e2187c"/></linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0f6"/><stop offset="1" stop-color="#2fa6e8"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <path d="M0 600 C 120 560, 260 650, 380 610 S 560 560, 600 590 L600 ${H} L0 ${H} Z" fill="url(#water)"/>
    <g fill="#fff" opacity=".7"><circle cx="90" cy="640" r="9"/><circle cx="130" cy="672" r="6"/><circle cx="470" cy="628" r="8"/><circle cx="520" cy="660" r="5"/><circle cx="300" cy="650" r="6"/></g>
    <path d="M0 735 C 150 690, 380 720, 600 640 L600 680 C 400 750, 170 735, 0 770 Z" fill="#ffd400"/>
    <path d="M0 770 C 170 735, 400 750, 600 680 L600 ${H} L0 ${H} Z" fill="url(#pink)"/></svg>`);
  const logo = await feather(crop(110, 470, 166, 110), 380, 252, 16);
  const packW = 290, packH = Math.round(packW * 282 / 186);
  const pack = await sharp(await crop(96, 592, 186, 282).resize(packW, packH).toBuffer()).png().toBuffer();
  const shadow = await sharp(svg(`<svg width="${packW + 40}" height="${packH + 40}"><rect x="20" y="26" width="${packW}" height="${packH}" rx="10" fill="#0a3a7a" opacity=".35"/></svg>`)).blur(9).png().toBuffer();
  const poster = await sharp(bg).composite([
    { input: logo, left: Math.round((W - 380) / 2), top: 18 },
    { input: shadow, left: Math.round((W - packW) / 2) - 20, top: 236 - 20 },
    { input: pack, left: Math.round((W - packW) / 2), top: 236 },
  ]).png().toBuffer();
  await sharp(await rounded(poster, W, H, 26)).webp({ quality: 90, alphaQuality: 90 }).toFile(`${OUT}/poster.webp`);
}

// ---- hanging sign face: 0.44 × 0.28 → 512 × 326
await sharp(await rounded(await crop(842, 594, 200, 150).toBuffer(), 512, 326, 26)).webp({ quality: 90, alphaQuality: 90 }).toFile(`${OUT}/sign.webp`);

// ---- roof top: 3.84 × 1.68 m → 1024 × 448
{
  const W = 1024, H = 448;
  const band = svg(`<svg width="${W}" height="${H}"><defs>
      <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ab8"/><stop offset="1" stop-color="#ea2a8c"/></linearGradient>
      <radialGradient id="glint" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#p)"/>
    <path d="M0 0 L${W} 0 L${W} 46 C 760 96, 520 30, 260 70 S 60 80, 0 60 Z" fill="#5cc8f5"/>
    <path d="M0 60 C 60 80, 160 74, 260 70 S 760 96, ${W} 46 L${W} 66 C 760 118, 520 52, 260 92 S 60 102, 0 84 Z" fill="#ffd400"/>
    <path d="M0 ${H} L${W} ${H} L${W} ${H - 40} C 700 ${H - 90}, 340 ${H - 20}, 0 ${H - 56} Z" fill="#5cc8f5"/>
    <ellipse cx="190" cy="150" rx="60" ry="60" fill="url(#glint)"/></svg>`);
  // lift the letters off the roof: the red "Diva" and blue "FRESH" pixels,
  // grown by a few pixels to keep their white outline, softly edged
  const { data, info } = await crop(508, 196, 290, 152).resize(560, 294).raw().toBuffer({ resolveWithObject: true });
  const W2 = info.width, H2 = info.height, n = W2 * H2;
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if ((r > 170 && g < 80 && b < 90) || (b > 120 && r < 70 && g < 110)) core[i] = 1; }
  // the roof rail's edge crosses above the "a" in the illustration: not lettering
  for (let y = 0; y < H2 * 0.21; y++) for (let x = Math.round(W2 * 0.55); x < W2; x++) core[y * W2 + x] = 0;
  // drop specks (the rail's dark-blue edge): keep only sizeable letter pieces
  { const lab = new Int32Array(n).fill(-1); const sizes = [];
    for (let i = 0; i < n; i++) { if (!core[i] || lab[i] >= 0) continue; const id = sizes.length; let cnt = 0; const st = [i]; lab[i] = id;
      let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
      while (st.length) { const v = st.pop(); cnt++; const x = v % W2, y = (v / W2) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W2 || yy >= H2) continue; const w = yy * W2 + xx; if (core[w] && lab[w] < 0) { lab[w] = id; st.push(w); } } }
      sizes.push(Math.min(y1 - y0, x1 - x0) < 14 ? 0 : cnt); }   // thin lines count as specks
    for (let i = 0; i < n; i++) if (core[i] && sizes[lab[i]] < 250) core[i] = 0; }
  // distance (in px) to the nearest letter pixel, two-pass chamfer
  const dist = new Float32Array(n).fill(1e9); for (let i = 0; i < n; i++) if (core[i]) dist[i] = 0;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = y * W2 + x; if (x) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y) dist[i] = Math.min(dist[i], dist[i - W2] + 1); if (x && y) dist[i] = Math.min(dist[i], dist[i - W2 - 1] + 1.41); if (y && x < W2 - 1) dist[i] = Math.min(dist[i], dist[i - W2 + 1] + 1.41); }
  for (let y = H2 - 1; y >= 0; y--) for (let x = W2 - 1; x >= 0; x--) { const i = y * W2 + x; if (x < W2 - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H2 - 1) dist[i] = Math.min(dist[i], dist[i + W2] + 1); if (x < W2 - 1 && y < H2 - 1) dist[i] = Math.min(dist[i], dist[i + W2 + 1] + 1.41); if (y < H2 - 1 && x) dist[i] = Math.min(dist[i], dist[i + W2 - 1] + 1.41); }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { const d = dist[i]; const a = d <= 5 ? 1 : d >= 8 ? 0 : (8 - d) / 3;
    // outline zone: pure white so no pink glow or grey rail shows through
    const white = d > 0.5 ? Math.min(1, d / 2) : 0;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(data[i * 3 + c] * (1 - white) + 255 * white);
    out[i * 4 + 3] = Math.round(a * 255); }
  const lettering = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await sharp(band).composite([{ input: lettering, left: Math.round((W - 560) / 2), top: Math.round((H - 294) / 2) + 14 }])
    .webp({ quality: 88 }).toFile(`${OUT}/roof.webp`);
}
for (const f of ['poster', 'sign', 'roof']) console.log(f.padEnd(7), await kb(`${OUT}/${f}.webp`));
