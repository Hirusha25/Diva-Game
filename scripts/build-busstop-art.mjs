/**
 * Artwork for the 3D bus stop (public/js/busstop.js), cut from the Diva bus
 * stop illustration (assets/raw/props/bus-stand.png):
 *   poster.webp  the side panel's Diva Fresh poster (bottom redrawn in code)
 *   sign.webp    the hanging Diva Fresh sign face
 *   roof.webp    the Diva Fresh lettering from the roof, edges feathered so
 *                it blends into the roof colour
 *   npm run busstop-art     (node scripts/build-busstop-art.mjs)
 */
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';

const SRC = 'assets/raw/props/bus-stand.png', OUT = 'public/assets/textures/busstop';
await mkdir(OUT, { recursive: true });
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';
const crop = (left, top, width, height) => sharp(SRC).extract({ left, top, width, height });

await crop(90, 428, 200, 500).resize(256, 640).webp({ quality: 88 }).toFile(`${OUT}/poster.webp`);
await crop(838, 590, 208, 158).resize(384, 292).webp({ quality: 88 }).toFile(`${OUT}/sign.webp`);
{ // roof lettering with a feathered elliptical alpha mask
  const w = 300, h = 150;
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
    <stop offset="70%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></radialGradient></defs>
    <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#g)"/></svg>`);
  const alpha = await sharp(mask).extractChannel(0).toBuffer();
  await crop(505, 198, w, h).removeAlpha().joinChannel(alpha).resize(512, 256).webp({ quality: 88, alphaQuality: 90 }).toFile(`${OUT}/roof.webp`);
}
for (const f of ['poster', 'sign', 'roof']) console.log(f.padEnd(7), await kb(`${OUT}/${f}.webp`));
// roof colour next to the lettering, for the painted roof
const { data } = await sharp(SRC).extract({ left: 440, top: 230, width: 30, height: 20 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let r = 0, g = 0, b = 0; for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
const n = data.length / 3; console.log('roof pink', '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join(''));
