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
      horizon: { value: new THREE.Color(COLORS.skyHorizon) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; varying float vY;
      void main() {
        float t = smoothstep(-0.05, 0.45, vY);
        gl_FragColor = vec4(mix(horizon, top, t), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  return sky;
}

/** A handful of soft cloud sprites drifting far away. */
export function createClouds() {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(mat);
    const x = (Math.random() - 0.5) * 360;
    const z = -120 - Math.random() * 200;
    s.position.set(x, 40 + Math.random() * 30, z);
    const w = 40 + Math.random() * 60;
    s.scale.set(w, w * (0.35 + Math.random() * 0.25), 1);
    group.add(s);
  }
  return group;
}
