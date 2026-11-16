/** Copies the handful of Three.js module files the game imports into public/vendor/three. */
import { cp, mkdir } from 'node:fs/promises';
const files = [
  'build/three.module.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/libs/meshopt_decoder.module.js',
];
for (const f of files) {
  const dest = `public/vendor/three/${f}`;
  await mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
  await cp(`node_modules/three/${f}`, dest);
  console.log('vendored', f);
}
