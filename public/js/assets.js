import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Loads every runtime asset with one progress callback.
 * Returns { busStand, asphalt, shadows, clouds, trees, bushes, leaf } (sprites are {map, aspect}).
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

  const coverMeta = await loadJson('assets/ui/cover.json');
  const coverImages = {
    bg: 'assets/ui/cover-bg.webp',
    glow: 'assets/ui/glow.webp', hcb: 'assets/ui/hcb.webp', logo: 'assets/ui/logo.webp',
    tagline: 'assets/ui/tagline.webp', heroes: 'assets/ui/heroes.webp', ribbon: 'assets/ui/ribbon.webp', start: 'assets/ui/start.webp',
  };
  const treeMeta = await loadJson('assets/textures/trees.json');
  const cloudMeta = await loadJson('assets/textures/clouds.json');
  const bushMeta = await loadJson('assets/textures/bushes.json');
  const propMeta = await loadJson('assets/textures/props.json');

  const [asphalt, shadows, leaf, busStandMap] = await Promise.all([
    loadTex('assets/textures/asphalt.webp', { repeat: true }),
    loadTex('assets/textures/tree-shadows.webp', { srgb: false, repeat: true }),
    loadTex('assets/textures/leaf.webp'),
    loadTex('assets/textures/bus-stand.webp'),
  ]);
  const busStand = { map: busStandMap, aspect: propMeta['bus-stand'].aspect };
  const treeFiles = [
    ['tree-1', 'assets/textures/tree-1.webp'],
    ['tree-2', 'assets/textures/tree-2.webp'],
    ['tree-3', 'assets/textures/tree-3.webp'],
    ['tree-4', 'assets/textures/tree-4.webp'],
  ];
  const trees = await Promise.all(treeFiles.map(async ([key, url]) => ({
    map: await loadTex(url),
    aspect: treeMeta[key].aspect,
  })));
  // Literal paths (not template strings) so the single-file build can inline them.
  const cloudFiles = [
    ['cloud-1', 'assets/textures/cloud-1.webp'],
    ['cloud-2', 'assets/textures/cloud-2.webp'],
    ['cloud-3', 'assets/textures/cloud-3.webp'],
    ['cloud-4', 'assets/textures/cloud-4.webp'],
  ];
  const bushFiles = [
    ['bush-1', 'assets/textures/bush-1.webp'],
    ['bush-2', 'assets/textures/bush-2.webp'],
  ];
  const bushes = await Promise.all(bushFiles.map(async ([key, url]) => ({
    map: await loadTex(url),
    aspect: bushMeta[key].aspect,
  })));
  const clouds = await Promise.all(cloudFiles.map(async ([key, url]) => ({
    map: await loadTex(url),
    aspect: cloudMeta[key].aspect,
  })));

  return {
    busStand,
    asphalt,
    shadows,
    leaf,
    clouds,
    trees,
    bushes,
    cover: { meta: coverMeta, images: coverImages },
  };
}
