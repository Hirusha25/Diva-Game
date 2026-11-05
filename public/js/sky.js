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
 * Cartoon cloud sprites from the art pack, laid out around the road's vanishing
 * point: the big puffy one sits low and wide, the long banks float higher.
 * Everything is far away so clouds barely move as the player runs.
 */
export function createClouds(clouds) {
  const group = new THREE.Group();
  const mats = clouds.map((c) => new THREE.SpriteMaterial({ map: c.map, transparent: true, depthWrite: false, fog: false }));
  const add = (i, x, y, z, width) => {
    const s = new THREE.Sprite(mats[i]);
    s.position.set(x, y, z);
    s.scale.set(width, width / clouds[i].aspect, 1);
    group.add(s);
  };
  // Hand-placed composition (0-2: long banks, 3: big puff). Portrait phones
  // see roughly x = ±100 at this depth; the outer ones appear in landscape.
  add(3, 85, 58, -340, 70);
  add(3, -95, 100, -380, 60);
  add(0, -30, 138, -420, 150);
  add(1, 125, 122, -400, 130);
  add(2, -125, 66, -360, 120);
  add(2, 205, 85, -390, 140);
  add(0, -225, 90, -380, 140);
  add(3, 25, 168, -440, 45);
  return group;
}
