import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Loads every runtime asset with one progress callback.
 * Returns { shelter, asphalt, shadows, clouds, trees: [{front, side, width, height}], leaf }.
 */
export async function loadAssets(onProgress = () => {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);

  const gltf = new GLTFLoader(manager);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const tex = new THREE.TextureLoader(manager);

  const loadTex = (url, { srgb = true, repeat = false } = {}) => new Promise((resolve, reject) => {
    tex.load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; }
      t.anisotropy = 4;
      resolve(t);
    }, undefined, reject);
  });
  // Hosted single-file builds (see scripts/build-artifact.mjs) embed the model
  // bytes and JSON on window.__DIVA_INLINE, because strict CSPs refuse fetch()
  // on data: URLs. Images still load fine from data: URIs via <img>.
  const inline = globalThis.__DIVA_INLINE || {};
  if (inline.models) {
    // GLTFLoader prefers ImageBitmapLoader (fetch + blob:) for embedded textures;
    // strict hosted CSPs refuse that, so make it fall back to <img>-based TextureLoader.
    globalThis.createImageBitmap = undefined;
  }
  const loadGltf = (url) => new Promise((resolve, reject) => {
    const b64 = inline.models?.[url];
    if (b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      gltf.parse(bytes.buffer, '', resolve, reject);
    } else {
      gltf.load(url, resolve, undefined, reject);
    }
  });
  const loadJson = (url) => inline.json?.[url]
    ? Promise.resolve(inline.json[url])
    : fetch(url).then((r) => r.json());

  const treeMeta = await loadJson('assets/textures/trees.json');
  const cloudMeta = await loadJson('assets/textures/clouds.json');

  const [shelterGltf, asphalt, shadows, leaf, aFront, aSide, bFront, bSide] = await Promise.all([
    loadGltf('assets/models/bus-shelter.glb'),
    loadTex('assets/textures/asphalt.webp', { repeat: true }),
    loadTex('assets/textures/tree-shadows.webp', { srgb: false, repeat: true }),
    loadTex('assets/textures/leaf.webp'),
    loadTex('assets/textures/tree-a-front.webp'),
    loadTex('assets/textures/tree-a-side.webp'),
    loadTex('assets/textures/tree-b-front.webp'),
    loadTex('assets/textures/tree-b-side.webp'),
  ]);
  const clouds = await Promise.all([1, 2, 3, 4].map(async (n) => ({
    map: await loadTex(`assets/textures/cloud-${n}.webp`),
    aspect: cloudMeta[`cloud-${n}`].aspect,
  })));

  const shelter = shelterGltf.scene;
  shelter.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = true;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  return {
    shelter,
    asphalt,
    shadows,
    leaf,
    clouds,
    trees: [
      { front: aFront, side: aSide, width: treeMeta.a.width, height: treeMeta.a.height },
      { front: bFront, side: bSide, width: treeMeta.b.width, height: treeMeta.b.height },
    ],
  };
}
