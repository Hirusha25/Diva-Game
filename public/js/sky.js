import * as THREE from 'three';
import { COLORS } from './config.js';
import { cloudTexture } from './textures.js';

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

/** Cumulus cloud sprites drifting far away on both sides of the road. */
export function createClouds() {
  const group = new THREE.Group();
  const mats = [cloudTexture(), cloudTexture(), cloudTexture()].map(
    (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }),
  );
  // Spread across the view above the road's vanishing point so several
  // clouds sit inside a portrait phone frame.
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(mats[i % mats.length]);
    const x = (Math.random() - 0.5) * 340;
    const z = -260 - Math.random() * 120;
    const y = 45 + Math.random() * 110;
    s.position.set(x, y, z);
    const w = 38 + Math.random() * 42;
    s.scale.set(w, w * 0.5, 1);
    group.add(s);
  }
  return group;
}
