import * as THREE from 'three';
import { COLORS } from './config.js';

/** Cheap vertical-gradient sky dome. */
export function createSky() {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(COLORS.skyTop) },
      mid: { value: new THREE.Color(COLORS.skyMid) },
      low: { value: new THREE.Color(COLORS.skyLow) },
      horizon: { value: new THREE.Color(COLORS.skyHorizon) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 horizon; varying float vY;
      void main() {
        // white haze at the horizon -> light blue -> vivid blue -> saturated zenith
        vec3 c = mix(horizon, low, smoothstep(0.0, 0.07, vY));
        c = mix(c, mid, smoothstep(0.07, 0.22, vY));
        c = mix(c, top, smoothstep(0.22, 0.6, vY));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  return sky;
}

/**
 * A 3D cloud field. Clouds live at different depths and heights, drift with
 * the wind, bob gently, and roll past the player as the world scrolls, so
 * near clouds move faster than far ones (motion parallax). Clouds that pass
 * behind the camera respawn far ahead.
 */
export class CloudField {
  constructor(clouds, count = 11) {
    this.group = new THREE.Group();
    this.clouds = clouds;
    this.items = [];
    this.time = 0;
    for (let i = 0; i < count; i++) {
      const kind = i % 4 === 3 ? 3 : i % 3;            // mix of banks and puffs
      const c = clouds[kind];
      // toneMapped:false keeps the artwork's pure white fill instead of a tone-mapped grey.
      const mat = new THREE.SpriteMaterial({ map: c.map, transparent: true, depthWrite: false, fog: false, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      const item = { sprite, aspect: c.aspect, phase: Math.random() * Math.PI * 2 };
      this._spawn(item, -140 - (i / count) * 420);       // stagger along the depth, none too close at start
      this.group.add(sprite);
      this.items.push(item);
    }
  }

  _spawn(item, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const depth = THREE.MathUtils.clamp((-z) / 500, 0, 1); // 0 near .. 1 far
    item.z = z;
    // Keep the lane ahead clear: clouds sit off to the sides, higher ones may sit over the road.
    // Portrait phones only see about ±0.3 × depth sideways, so keep the field
    // tight; high clouds may float straight over the road.
    const high = Math.random() < 0.25;
    item.x = high ? (Math.random() - 0.5) * 60 : side * (18 + Math.random() * 70) * (0.7 + depth * 0.5);
    item.baseY = (high ? 70 : 34) + Math.random() * 50 + depth * 30;
    item.width = 40 + Math.random() * 55;
    item.wind = (0.8 + Math.random() * 1.4) * side;      // drifts outward
    item.parallax = 0.18 + (1 - depth) * 0.22;           // near clouds scroll faster
    item.sprite.scale.set(item.width, item.width / item.aspect, 1);
  }

  /** @param dt seconds, @param step metres the world scrolled this frame */
  update(dt, step) {
    this.time += dt;
    for (const it of this.items) {
      it.z += step * it.parallax;
      it.x += it.wind * dt;
      if (it.z > 40) this._spawn(it, -520 - Math.random() * 60);
      const depth = THREE.MathUtils.clamp((-it.z) / 500, 0, 1);
      const y = it.baseY + Math.sin(this.time * 0.35 + it.phase) * 1.8;
      it.sprite.position.set(it.x, y, it.z);
      // Only the farthest clouds soften slightly into the haze.
      it.sprite.material.opacity = 1 - depth * 0.12;
    }
  }
}
