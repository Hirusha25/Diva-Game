import * as THREE from 'three';

/**
 * Procedural canvas textures so the stylised look needs no extra downloads:
 * paving tiles, dappled tree-shadow, cumulus clouds and a flower sprite.
 */

function canvasTexture(w, h, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Square paving slabs with grout lines and a little tonal variation. */
export function pavingTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const l = 196 + Math.floor(Math.random() * 18) - 9;
        ctx.fillStyle = `rgb(${l + 6},${l + 2},${l - 6})`;
        ctx.fillRect(x * s, y * s, s, s);
        // subtle speckle
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
          ctx.fillRect(x * s + Math.random() * s, y * s + Math.random() * s, 2, 2);
        }
      }
    }
    ctx.strokeStyle = 'rgba(90,85,75,0.75)';
    ctx.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke();
    }
  });
}

/** Soft dark blobs with alpha: laid over the road to fake tree shadows. */
export function dappleTexture() {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // A few large, soft, neutral-dark patches that read as tree shade.
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = 70 + Math.random() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  }, { srgb: false });
}
