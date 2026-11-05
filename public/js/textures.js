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
        const l = 212 + Math.floor(Math.random() * 16) - 8;
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

/** Natural grass: layered green noise with blade-like speckle and darker patches. */
export function grassTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5a9a2e';
    ctx.fillRect(0, 0, w, h);
    // soft tonal patches
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.5;
      g.addColorStop(0, dark ? 'rgba(52,110,30,0.45)' : 'rgba(130,190,70,0.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // blade speckle
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const l = 2 + Math.random() * 4;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(160,215,90,0.55)' : 'rgba(40,95,25,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 2, y - l); ctx.stroke();
    }
  });
}

/** Yellow wall with a panel grid: wide rectangular blocks and thin darker joints. */
export function wallGridTexture(topHex, bottomHex = topHex) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    // Warm vertical gradient: bright at the coping, deeper orange-yellow at the base.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topHex);
    grad.addColorStop(1, bottomHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // faint plaster variation
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    // grid: 2 rows per texture, 2 columns, running bond (offset every row)
    ctx.strokeStyle = 'rgba(120,80,10,0.45)';
    ctx.lineWidth = 3;
    const rows = 2, cols = 2;
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(w, r * rh); ctx.stroke(); }
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * cw / 2;
      for (let c = 0; c <= cols; c++) {
        const x = (c * cw + off) % w;
        ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke();
      }
    }
    // light bevel on top edge of each block
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let r = 0; r < rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rh + 3); ctx.lineTo(w, r * rh + 3); ctx.stroke(); }
  });
}
