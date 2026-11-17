import * as THREE from 'three';

/** Small canvas textures shared by the glow / sparkle effects. */
let _glow = null, _star = null;

/** Soft round glow (white; tint it with the material colour). */
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(0.6, 'rgba(255,255,255,.14)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

/** Four-point twinkle star. */
export function starTexture() {
  if (_star) return _star;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const core = g.createRadialGradient(64, 64, 0, 64, 64, 30); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  for (const rot of [0, Math.PI / 2]) {
    g.save(); g.translate(64, 64); g.rotate(rot);
    g.beginPath(); g.moveTo(0, -62); g.quadraticCurveTo(5, 0, 0, 62); g.quadraticCurveTo(-5, 0, 0, -62); g.fill(); g.restore();
  }
  _star = new THREE.CanvasTexture(c); _star.colorSpace = THREE.SRGBColorSpace;
  return _star;
}

export const additive = (map, color = 0xffffff, opacity = 1) => new THREE.SpriteMaterial({
  map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

/**
 * A pool of sparkles: burst() throws a ring of twinkling stars outward from a
 * point; twinkle() pops a single star that grows and fades in place.
 */
export class Sparkles {
  constructor(parent, count = 40) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(additive(starTexture(), 0xffffff, 0));
      s.visible = false; parent.add(s);
      this.items.push({ s, t: 1, life: 1, v: new THREE.Vector3(), size: 0.3 });
    }
    this.next = 0;
  }
  _take() { const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length; return it; }
  burst(pos, n = 14, color = 0xffffff, speed = 2.2, size = 0.42) {
    for (let i = 0; i < n; i++) {
      const it = this._take(); const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, up = Math.random() * 0.8 - 0.2;
      it.s.position.copy(pos); it.v.set(Math.cos(a) * speed, up * speed + 0.8, Math.sin(a) * speed * 0.6);
      it.t = 0; it.life = 0.55 + Math.random() * 0.35; it.size = size * (0.6 + Math.random() * 0.7);
      it.s.material.color.set(color); it.s.visible = true;
    }
  }
  twinkle(pos, size = 0.3, color = 0xffffff) {
    const it = this._take(); it.s.position.copy(pos); it.v.set(0, 0.25, 0);
    it.t = 0; it.life = 0.5 + Math.random() * 0.3; it.size = size; it.s.material.color.set(color); it.s.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.s.visible) continue;
      it.t += dt; const k = it.t / it.life;
      if (k >= 1) { it.s.visible = false; continue; }
      it.s.position.addScaledVector(it.v, dt); it.v.multiplyScalar(1 - dt * 2.5);
      const sz = it.size * Math.sin(Math.PI * Math.min(1, k * 1.2));
      it.s.scale.setScalar(Math.max(0.001, sz)); it.s.material.rotation = k * 2;
      it.s.material.opacity = 1 - k * k;
    }
  }
}
