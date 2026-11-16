/**
 * Road surface textures:
 *   - asphalt.webp      seamless coarse asphalt tile cut from the reference photo
 *   - tree-shadows.webp leafy shadow overlay built from the tree art canopies
 *
 *   node scripts/make-road-textures.mjs     (run after optimize-assets.mjs)
 */
import sharp from 'sharp';
import { stat } from 'node:fs/promises';

const OUT = 'public/assets/textures';
const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + ' KB';

// ------------------------------------------------------------ asphalt tile
{
  const src = 'assets/raw/road/textures/asphalt-reference.png';
  const meta = await sharp(src).metadata();
  // Plain, sunlit asphalt between the lower dashes (no markings, no shadow).
  const region = { left: 250, top: 230, width: 200, height: Math.min(180, meta.height - 230) };
  const base = await sharp(src).extract(region).resize(512, 512, { kernel: 'lanczos3' }).toBuffer();

  // Fine aggregate grain so the up-scaled patch keeps its gritty look.
  const grain = await sharp({
    create: { width: 512, height: 512, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 26 } },
  }).png().toBuffer();

  await sharp(base)
    .composite([{ input: grain, blend: 'overlay' }])
    .modulate({ brightness: 1.12, saturation: 0 })     // pure neutral grey, no blue cast
    .webp({ quality: 82 })
    .toFile(`${OUT}/asphalt.webp`);
  console.log('asphalt tile ->', await kb(`${OUT}/asphalt.webp`));
}

// ------------------------------------------------------- tree shadow overlay
{
  const W = 1024, H = 2048, PAD = 1100;
  // Leafy silhouettes: the baked tree sprites' alpha, slightly blurred.
  const silhouettes = [];
  for (const f of ['tree-1', 'tree-2', 'tree-3', 'tree-4']) {
    // Canopy only: drop the trunk (bottom ~30 %) so it doesn't print as a bar.
    const m = await sharp(`${OUT}/${f}.webp`).metadata();
    const alpha = await sharp(`${OUT}/${f}.webp`).ensureAlpha().extractChannel('alpha')
      .extract({ left: 0, top: 0, width: m.width, height: Math.round(m.height * 0.68) })
      .resize(1024, 1024, { fit: 'fill' })
      .blur(1.2).raw().toBuffer();
    silhouettes.push(alpha);
  }
  // Seeded placement so the texture is reproducible.
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const layers = [];
  for (let i = 0; i < 5; i++) {
    const sil = silhouettes[i % silhouettes.length];
    const size = Math.round(380 + rnd() * 240);
    const angle = Math.round(rnd() * 360);
    const opacity = 0.5 + rnd() * 0.15;
    // Scaled + rotated silhouette as a single-channel alpha mask.
    const mask = await sharp(sil, { raw: { width: 1024, height: 1024, channels: 1 } })
      .resize(size, size)
      .rotate(angle, { background: '#000' })
      .toColourspace('b-w')
      .linear(opacity, 0)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = mask.info;
    const alpha = mask.info.channels === 1 ? mask.data : Buffer.from(mask.data.filter((_, idx) => idx % mask.info.channels === 0));
    // Dark blue-black layer carrying that mask as its alpha.
    const black = await sharp({ create: { width, height, channels: 3, background: '#000000' } })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png().toBuffer();
    // Place on a padded canvas (offsets must stay positive), crop afterwards.
    const left = PAD + Math.round(rnd() * (W + size) - size);
    const top = PAD + Math.round((i / 5) * H + (rnd() - 0.5) * 200 - size / 2);
    if (process.env.DEBUG) console.log('layer', i, { size, angle, width, height, left, top });
    layers.push({ input: black, left, top });
  }
  // Two passes: sharp runs extract/blur before composite within one pipeline.
  const composed = await sharp({ create: { width: W + 2 * PAD, height: H + 2 * PAD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png().toBuffer();
  await sharp(composed)
    .extract({ left: PAD, top: PAD, width: W, height: H })
    .blur(1.6)
    .webp({ quality: 70, alphaQuality: 80 })
    .toFile(`${OUT}/tree-shadows.webp`);
  console.log('tree shadows ->', await kb(`${OUT}/tree-shadows.webp`));
}
