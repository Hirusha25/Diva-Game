// Procedural textures for the flat surfaces (road, kerb, pavement, wall).
// Everything that is a "thing" (trees, bushes, bus stops, clouds) is artwork
// from assets/sprites instead.
import * as THREE from '../vendor/three.module.min.js';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, colours, r, seed) {
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[(rand() * colours.length) | 0];
    const s = r * (0.5 + rand());
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

// Whole road width x one dash period. u: 0..1 across, v: along.
export function roadTexture(lanes) {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#3d4046'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, ['#33363b', '#484b52', '#52555c', '#2c2e33'], 3, 7);
    g.fillStyle = '#f4f4f0';
    const edge = w * 0.018, line = w * 0.016;
    g.fillRect(edge, 0, line, h);
    g.fillRect(w - edge - line, 0, line, h);
    for (let i = 1; i < lanes; i++) {
      g.fillRect((w * i) / lanes - line / 2, h * 0.1, line, h * 0.36);
    }
  });
}

// Two stripes (black, white) along v.
export function kerbTexture() {
  return canvasTexture(32, 256, (g, w, h) => {
    g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#eeeeea'; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h / 2 - 2, w, 4); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, w, 2);
  });
}

// One square paving slab.
export function pavementTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c3b8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#d3cdc3', '#bfb9ae', '#c4beb2'], 4, 11);
    g.strokeStyle = '#8d877d'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
  });
}

export function soilTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b0623a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1200, ['#9a5330', '#c07048', '#8a4a2c'], 5, 13);
  });
}

// Wall face: u along the wall (one panel), v bottom->top.
export function wallTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f6c23f');
    grad.addColorStop(0.75, '#f2b632');
    grad.addColorStop(1, '#d99a2a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, ['rgba(255,235,150,.05)', 'rgba(190,120,20,.04)'], 14, 17);
  });
}

export function capTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#8f7460'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 600, ['#9c8170', '#806654', '#a08a78'], 6, 19);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 3, h);
  });
}

export function grassTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#4f9a2e'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, ['#458a28', '#5aa935', '#3f8024'], 5, 23);
  });
}

// Soft dappled tree shade, tileable in both directions.
export function shadeTexture(seed = 29, density = 70) {
  const t = canvasTexture(512, 512, (g, w, h) => {
    const rand = rng(seed);
    g.filter = 'blur(7px)';
    g.fillStyle = '#10203a';
    for (let i = 0; i < density; i++) {
      const x = rand() * w, y = rand() * h, rx = 20 + rand() * 60, ry = 14 + rand() * 40, rot = rand() * 3;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, rot, 0, 7); g.fill();
      }
    }
  });
  return t;
}

// Round soft blob used as a contact shadow under sprites.
export function blobTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(20,25,45,.55)');
    grad.addColorStop(0.6, 'rgba(20,25,45,.25)');
    grad.addColorStop(1, 'rgba(20,25,45,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}

export function skyTexture() {
  const t = canvasTexture(8, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f5fe6');
    grad.addColorStop(0.26, '#2f8df2');
    grad.addColorStop(0.42, '#bfe3fb');
    grad.addColorStop(0.47, '#e6f4fd');
    grad.addColorStop(1, '#e6f4fd');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export { rng };
