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

// centred: the layer is moved so its visible artwork is centred on the poster
// (phones crop the poster's sides, which makes off-centre art obvious)
const CENTRED = new Set(['logo', 'hcb', 'tagline', 'start']);
const LAYERS = [
  // key        file  export width  role
  ['logo',     'logo-2026.webp', 1100, 'Diva Fresh Run logo (2026)'],
  ['hcb',      4,  520, 'hcb logo'],
  ['glow',     5, 1100, 'sun glow'],
  ['heroes',   6, 1100, 'boy + girl with stain badges'],
  ['tagline',  7, 1100, 'Sinhala tagline'],
  ['ribbon',   8, 1600, 'bottom red/blue ribbon'],
  ['start',    9, 1000, 'START button'],
];

const meta = {};
for (const [key, n, width, role] of LAYERS) {
  const src = typeof n === 'string' ? `assets/raw/new/${n}` : `assets/raw/new/${n}.png`;
  const frame = await sharp(src).metadata();
  const trimmed = await sharp(src).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
  const { info } = trimmed;
  const left = -info.trimOffsetLeft, top = -info.trimOffsetTop;
  const out = `${OUT}/${key}.webp`;
  if (info.width < width) {   // small source (e.g. the 2026 logo): upscale 2x with Lanczos + light sharpening, high quality
    await sharp(trimmed.data).resize({ width: Math.min(width, info.width * 2), kernel: 'lanczos3' }).sharpen({ sigma: 0.8, m1: 0.6, m2: 1.2 })
      .webp({ quality: 95, alphaQuality: 95, smartSubsample: true }).toFile(out);
  } else await sharp(trimmed.data).resize({ width: Math.min(width, info.width) }).webp({ quality: 86, alphaQuality: 92 }).toFile(out);
  let cx = left / frame.width;
  if (CENTRED.has(key)) {   // alpha-weighted centre of the artwork → 50 %
    const { data, info: ti } = await sharp(trimmed.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sx = 0, sw = 0; for (let y = 0; y < ti.height; y += 2) for (let x = 0; x < ti.width; x += 2) { const a = data[(y * ti.width + x) * 4 + 3]; if (a > 40) { sx += x * a; sw += a; } }
    cx = 0.5 - (sx / sw) / frame.width;
  }
  meta[key] = {
    role,
    x: cx, y: top / frame.height,
    w: info.width / frame.width, h: info.height / frame.height,
  };
  console.log(key.padEnd(8), role.padEnd(32), `${(meta[key].x * 100).toFixed(1)}%,${(meta[key].y * 100).toFixed(1)}%  ${(meta[key].w * 100).toFixed(1)}x${(meta[key].h * 100).toFixed(1)}%`, await kb(out));
}
// Poster background (road scene) — the cover's static backdrop.
await sharp('assets/raw/new/1.png').resize({ width: 1242 }).webp({ quality: 80 }).toFile(`${OUT}/cover-bg.webp`);
console.log('bg       poster background'.padEnd(42), await kb(`${OUT}/cover-bg.webp`));
meta.frame = { aspect: 2048 / 3126 };
// logo and tagline placed exactly as in the client's mock, measured against
// the hcb logo (all in units of the hcb width): logo 2.41 wide, its box
// centre 0.18 left of hcb's centre, its top 0.19 below hcb's top; tagline
// 2.91 wide, centre 0.143 left of hcb's centre, top 2.443 below hcb's top
{ const L = meta.logo, Hc = meta.hcb, T = meta.tagline, PW = 2048, PH = 3126;
  const u = Hc.w * PW, hcx = (Hc.x + Hc.w / 2) * PW, top = Hc.y * PH;
  const kL = (2.41 * u) / (L.w * PW); L.w *= kL; L.h *= kL;
  L.x = (hcx - 0.18 * u) / PW - L.w / 2; L.y = (top + 0.189 * u) / PH;
  const kT = (2.91 * u) / (T.w * PW); T.w *= kT; T.h *= kT;
  T.x = (hcx - 0.143 * u) / PW - T.w / 2; T.y = (top + 2.443 * u) / PH; }
await writeFile(`${OUT}/cover.json`, JSON.stringify(meta, null, 2));
