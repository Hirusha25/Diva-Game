import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Loads every runtime asset with one progress callback.
 * Returns { shelter, asphalt, trees: [{front, side, width, height}], leaf }.
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
  const loadGltf = (url) => new Promise((resolve, reject) => gltf.load(url, resolve, undefined, reject));

  const treeMeta = await fetch('assets/textures/trees.json').then((r) => r.json());

  const [shelterGltf, asphalt, leaf, aFront, aSide, bFront, bSide] = await Promise.all([
    loadGltf('assets/models/bus-shelter.glb'),
    loadTex('assets/textures/asphalt.webp', { repeat: true }),
    loadTex('assets/textures/leaf.webp'),
    loadTex('assets/textures/tree-a-front.webp'),
    loadTex('assets/textures/tree-a-side.webp'),
    loadTex('assets/textures/tree-b-front.webp'),
    loadTex('assets/textures/tree-b-side.webp'),
  ]);

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
    leaf,
    trees: [
      { front: aFront, side: aSide, width: treeMeta.a.width, height: treeMeta.a.height },
      { front: bFront, side: bSide, width: treeMeta.b.width, height: treeMeta.b.height },
    ],
  };
}
