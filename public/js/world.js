import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANE_WIDTH, LANE_COUNT, ROAD_HALF, KERB, PAVEMENT, WALL, SHELTER_OFFSET_X,
  CHUNK_LENGTH, CHUNK_COUNT, COLORS,
} from './config.js';
import { pavingTexture } from './textures.js';

const SHRUBS_PER_CHUNK = 26;
const FLOWERS_PER_SHRUB = 5;
const TREES_PER_CHUNK = 16;   // 8 per side, one row set back behind the wall
const HEDGE_PER_CHUNK = 24;

/**
 * The running world: an endless street built from CHUNK_COUNT identical
 * 60 m chunks that are recycled from behind the player to the far end.
 * Each chunk owns a bus shelter (alternating sides) and a random set of
 * billboard trees. The world moves toward the player (+z); the player
 * stays near z = 0.
 */
export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.materials = this._materials();
    this.staticGeometry = this._buildStaticGeometry();
    // Stylised tree art as unlit billboards (the art carries its own shading).
    this.treeMaterials = assets.trees.map((t) => ({
      material: new THREE.MeshBasicMaterial({ map: t.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, toneMapped: false }),
      aspect: t.aspect,
    }));
    this.treeGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

    this.chunks = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = this._buildChunk(i);
      chunk.position.z = -i * CHUNK_LENGTH;
      this._dressChunk(chunk, i);
      this.group.add(chunk);
      this.chunks.push(chunk);
    }
    this.chunkSerial = CHUNK_COUNT;
  }

  /**
   * Advance the world by `distance` metres (towards the player) and turn the
   * tree billboards to face the camera so they keep their volume as they pass.
   */
  update(distance, cameraPos) {
    for (const chunk of this.chunks) {
      chunk.position.z += distance;
      // Chunk fully behind the camera → move it to the far end and re-dress.
      if (chunk.position.z - CHUNK_LENGTH / 2 > 12) {
        chunk.position.z -= CHUNK_LENGTH * CHUNK_COUNT;
        this._dressChunk(chunk, this.chunkSerial++);
      }
      if (cameraPos) {
        for (const tree of chunk.userData.trees) {
          if (!tree.visible) continue;
          const dz = cameraPos.z - (chunk.position.z + tree.position.z);
          const dx = cameraPos.x - tree.position.x;
          tree.rotation.y = Math.atan2(dx, dz);        // cylindrical billboard
        }
      }
    }
  }

  // ---------------------------------------------------------------- materials
  _materials() {
    const asphalt = this.assets.asphalt;
    asphalt.repeat.set(LANE_COUNT * 1.5, CHUNK_LENGTH / 1.67); // one tile ≈ 1.67 m of real asphalt
    const paving = pavingTexture();
    const tile = 0.55; // metres per paving slab
    paving.repeat.set((PAVEMENT.outer - PAVEMENT.inner) / tile, CHUNK_LENGTH / tile);
    // Baked leafy tree shadows: one texture spans the full street width and
    // 30 m of road; mirrored wrapping keeps it continuous across chunks.
    const shadows = this.assets.shadows;
    shadows.repeat.set(1, CHUNK_LENGTH / 30);
    return {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, color: COLORS.asphaltTint, roughness: 0.95, metalness: 0 }),
      laneLine: new THREE.MeshBasicMaterial({ color: COLORS.laneLine, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      kerbWhite: new THREE.MeshStandardMaterial({ color: COLORS.kerbWhite, roughness: 0.85 }),
      kerbBlack: new THREE.MeshStandardMaterial({ color: COLORS.kerbBlack, roughness: 0.85 }),
      pavement: new THREE.MeshStandardMaterial({ map: paving, color: COLORS.pavement, roughness: 0.9 }),
      wall: new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 1 }),
      wallCap: new THREE.MeshStandardMaterial({ color: COLORS.wallCap, roughness: 0.9 }),
      ground: new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
      dirt: new THREE.MeshStandardMaterial({ color: COLORS.dirt, roughness: 1 }),
      dapple: new THREE.MeshBasicMaterial({ map: shadows, transparent: true, depthWrite: false, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
      shrub: new THREE.MeshStandardMaterial({ color: COLORS.shrub, roughness: 0.9, flatShading: true }),
      shrubLight: new THREE.MeshStandardMaterial({ color: COLORS.shrubLight, roughness: 0.9, flatShading: true }),
      flowerPink: new THREE.MeshStandardMaterial({ color: COLORS.flowerPink, roughness: 0.7 }),
      flowerWhite: new THREE.MeshStandardMaterial({ color: COLORS.flowerWhite, roughness: 0.7 }),
    };
  }

  // ---------------------------------------------------------- static geometry
  /** Geometry shared by every chunk (built once, cloned by reference). */
  _buildStaticGeometry() {
    const L = CHUNK_LENGTH;
    // Axis-aligned box from two corners (order-independent so mirrored sides work).
    const box = (x0, x1, y0, y1, z0, z1) => {
      const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      return g;
    };
    const mirrored = (make) => mergeGeometries([make(1), make(-1)]);

    // Road surface
    const road = new THREE.PlaneGeometry(ROAD_HALF * 2, L).rotateX(-Math.PI / 2);

    // Lane markings: dashed dividers between lanes, solid edge lines.
    const marks = [];
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const x = -ROAD_HALF + lane * LANE_WIDTH;
      for (let z = -L / 2; z < L / 2; z += 7.5) {
        marks.push(new THREE.PlaneGeometry(0.25, 3).rotateX(-Math.PI / 2).translate(x, 0.012, z + 1.5));
      }
    }
    for (const s of [1, -1]) {
      marks.push(new THREE.PlaneGeometry(0.16, L).rotateX(-Math.PI / 2).translate(s * (ROAD_HALF - 0.22), 0.012, 0));
    }
    const laneLines = mergeGeometries(marks);

    // Kerb: continuous white block with black stripes every other metre.
    const kerbWhite = mirrored((s) => box(s * KERB.inner, s * KERB.outer, 0, KERB.height, -L / 2, L / 2));
    const stripes = [];
    for (const s of [1, -1]) {
      for (let z = -L / 2; z < L / 2; z += 2) {
        stripes.push(box(s * (KERB.inner - 0.004), s * (KERB.outer + 0.004), 0, KERB.height + 0.004, z, z + 1));
      }
    }
    const kerbBlack = mergeGeometries(stripes);

    // Pavement, boundary wall with a darker cap, and the ground beyond.
    const pavement = mirrored((s) => box(s * PAVEMENT.inner, s * PAVEMENT.outer, 0, PAVEMENT.height, -L / 2, L / 2));
    const wall = mirrored((s) => box(s * WALL.inner, s * WALL.outer, 0, WALL.height, -L / 2, L / 2));
    const wallCap = mirrored((s) => box(s * (WALL.inner - 0.08), s * (WALL.outer + 0.08), WALL.height, WALL.height + 0.14, -L / 2, L / 2));
    // Dappled shadow overlays for the road and both pavements.
    const dapple = mergeGeometries([
      new THREE.PlaneGeometry(ROAD_HALF * 2, L, 1, 1).rotateX(-Math.PI / 2).translate(0, 0.02, 0),
      ...[1, -1].map((s) => new THREE.PlaneGeometry(PAVEMENT.outer - PAVEMENT.inner, L).rotateX(-Math.PI / 2)
        .translate(s * (PAVEMENT.inner + PAVEMENT.outer) / 2, PAVEMENT.height + 0.005, 0)),
    ]);
    // Map UVs from world position so road and pavements share one continuous shadow image.
    {
      const pos = dapple.attributes.position, uv = dapple.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) + PAVEMENT.outer) / (PAVEMENT.outer * 2), (pos.getZ(i) + L / 2) / L);
      }
      uv.needsUpdate = true;
    }
    const ground = mirrored((s) => {
      const g = new THREE.PlaneGeometry(80, L).rotateX(-Math.PI / 2);
      g.translate(s * (WALL.outer + 40), -0.02, 0);
      return g;
    });
    const dirt = mirrored((s) => {
      const g = new THREE.PlaneGeometry(2.4, L).rotateX(-Math.PI / 2);
      g.translate(s * (WALL.outer + 1.2), -0.01, 0);
      return g;
    });

    return { road, laneLines, kerbWhite, kerbBlack, pavement, wall, wallCap, ground, dirt, dapple };
  }

  _buildChunk() {
    const chunk = new THREE.Group();
    const g = this.staticGeometry;
    const m = this.materials;
    const add = (geo, mat) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      chunk.add(mesh);
    };
    add(g.ground, m.ground);
    add(g.dirt, m.dirt);
    add(g.road, m.asphalt);
    add(g.laneLines, m.laneLine);
    add(g.kerbWhite, m.kerbWhite);
    add(g.kerbBlack, m.kerbBlack);
    add(g.pavement, m.pavement);
    add(g.wall, m.wall);
    add(g.wallCap, m.wallCap);
    add(g.dapple, m.dapple);

    // Flowering shrubs along the wall: instanced low-poly blobs + flower dots.
    const shrubGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const flowerGeo = new THREE.SphereGeometry(0.07, 6, 5);
    const shrubs = new THREE.InstancedMesh(shrubGeo, m.shrub, SHRUBS_PER_CHUNK * 3);
    const shrubsLight = new THREE.InstancedMesh(shrubGeo, m.shrubLight, SHRUBS_PER_CHUNK);
    const flowersPink = new THREE.InstancedMesh(flowerGeo, m.flowerPink, SHRUBS_PER_CHUNK * FLOWERS_PER_SHRUB);
    const flowersWhite = new THREE.InstancedMesh(flowerGeo, m.flowerWhite, SHRUBS_PER_CHUNK * FLOWERS_PER_SHRUB);
    chunk.add(shrubs, shrubsLight, flowersPink, flowersWhite);
    chunk.userData.shrubs = { shrubs, shrubsLight, flowersPink, flowersWhite };

    // A flowering hedge peeking over the wall from behind, for depth layering.
    const hedge = new THREE.InstancedMesh(shrubGeo, m.shrub, HEDGE_PER_CHUNK * 2);
    const hedgeLight = new THREE.InstancedMesh(shrubGeo, m.shrubLight, HEDGE_PER_CHUNK);
    const hedgePink = new THREE.InstancedMesh(flowerGeo, m.flowerPink, HEDGE_PER_CHUNK * 4);
    const hedgeWhite = new THREE.InstancedMesh(flowerGeo, m.flowerWhite, HEDGE_PER_CHUNK * 4);
    chunk.add(hedge, hedgeLight, hedgePink, hedgeWhite);
    chunk.userData.hedge = { hedge, hedgeLight, hedgePink, hedgeWhite };

    // Dynamic dressing: one shelter per side (toggled), a pool of trees.
    chunk.userData.shelters = {
      left: this._makeShelter(-1),
      right: this._makeShelter(1),
    };
    chunk.add(chunk.userData.shelters.left, chunk.userData.shelters.right);

    chunk.userData.trees = [];
    for (let i = 0; i < TREES_PER_CHUNK; i++) {
      const tree = this._makeTree();
      chunk.userData.trees.push(tree);
      chunk.add(tree);
    }
    return chunk;
  }

  _makeShelter(side) {
    const shelter = this.assets.shelter.clone();
    // Model: road along +x, front faces +z. Rotate so the front faces the road.
    shelter.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    shelter.position.x = side * SHELTER_OFFSET_X;
    return shelter;
  }

  _makeTree() {
    // One plane that is turned toward the camera every frame (see update()).
    const group = new THREE.Group();
    const front = new THREE.Mesh(this.treeGeometry, this.treeMaterials[0].material);
    group.add(front);
    group.userData = { front };
    return group;
  }

  /** Randomise a chunk's shelter side and tree placement. */
  _dressChunk(chunk, serial) {
    const { shelters, trees } = chunk.userData;
    const side = serial % 2 === 0 ? 'left' : 'right';
    shelters.left.visible = side === 'left';
    shelters.right.visible = side === 'right';
    shelters[side].position.z = (Math.random() - 0.5) * (CHUNK_LENGTH - 16);

    const rng = mulberry32(serial * 7919 + 17);
    const shelterZ = shelters[side].position.z;
    const shelterSide = side === 'left' ? -1 : 1;

    // Trees: a dense row just behind the wall on both sides, alternating left/right.
    // One row per side, set back 3–5 m behind the wall so the trunk is hidden
    // and only the canopy rises above it (as in the reference art). Spacing
    // roughly one canopy width, so neighbours just touch.
    trees.forEach((tree, i) => {
      const kind = this.treeMaterials[Math.floor(rng() * this.treeMaterials.length)];
      const s = i % 2 === 0 ? -1 : 1;
      const slot = Math.floor(i / 2);                     // 8 slots per side
      const z = -CHUNK_LENGTH / 2 + (slot + 0.25 + rng() * 0.5) * (CHUNK_LENGTH / 8);
      const height = 9 + rng() * 3;                       // 9–12 m
      const x = s * (WALL.outer + 3 + rng() * 2);
      tree.userData.front.material = kind.material;
      tree.scale.set(height * kind.aspect, height, 1);
      tree.position.set(x, -0.05, z);
      tree.visible = rng() < 0.9;
    });

    // Shrubs hug the wall; leave the shelter's platform clear.
    const { shrubs, shrubsLight, flowersPink, flowersWhite } = chunk.userData.shrubs;
    const mat = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    let si = 0, li = 0, pi = 0, wi = 0;
    for (let i = 0; i < SHRUBS_PER_CHUNK; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const z = -CHUNK_LENGTH / 2 + (Math.floor(i / 2) + rng()) * (CHUNK_LENGTH / (SHRUBS_PER_CHUNK / 2));
      const blocked = s === shelterSide && Math.abs(z - shelterZ) < 7.5;
      const x = s * (WALL.inner - 0.45);
      const size = blocked ? 0 : 0.42 + rng() * 0.3;
      // three overlapping blobs per shrub
      for (let b = 0; b < 3; b++) {
        pos.set(x + (rng() - 0.5) * 0.5, PAVEMENT.height + size * 0.55, z + (rng() - 0.5) * 0.9);
        quat.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0));
        scl.setScalar(size * (0.8 + rng() * 0.4));
        shrubs.setMatrixAt(si++, mat.compose(pos, quat, scl));
      }
      pos.set(x, PAVEMENT.height + size * 0.8, z);
      quat.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0));
      scl.setScalar(size * 0.75);
      shrubsLight.setMatrixAt(li++, mat.compose(pos, quat, scl));
      const pink = rng() < 0.55;
      for (let f = 0; f < FLOWERS_PER_SHRUB; f++) {
        pos.set(x + (rng() - 0.5) * size * 1.4, PAVEMENT.height + size * (0.8 + rng() * 0.6), z + (rng() - 0.5) * size * 1.6);
        scl.setScalar(blocked ? 0 : 0.8 + rng() * 0.6);
        const mtx = mat.compose(pos, quat.identity(), scl);
        if (pink) flowersPink.setMatrixAt(pi++, mtx); else flowersWhite.setMatrixAt(wi++, mtx);
      }
    }
    // Hide unused flower instances.
    scl.setScalar(0);
    for (; pi < flowersPink.count; pi++) flowersPink.setMatrixAt(pi, mat.compose(pos, quat, scl));
    for (; wi < flowersWhite.count; wi++) flowersWhite.setMatrixAt(wi, mat.compose(pos, quat, scl));
    for (const im of [shrubs, shrubsLight, flowersPink, flowersWhite]) im.instanceMatrix.needsUpdate = true;

    // Hedge behind the wall: bushy clumps whose tops show above the cap.
    const { hedge, hedgeLight, hedgePink, hedgeWhite } = chunk.userData.hedge;
    let hi = 0, hl = 0, hp = 0, hw = 0;
    for (let i = 0; i < HEDGE_PER_CHUNK; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const z = -CHUNK_LENGTH / 2 + (Math.floor(i / 2) + rng()) * (CHUNK_LENGTH / (HEDGE_PER_CHUNK / 2));
      const x = s * (WALL.outer + 0.55);
      const size = rng() < 0.7 ? 0.8 + rng() * 0.5 : 0;   // gaps in the hedge
      const top = WALL.height + size * 0.35;              // centre so ~half shows over the cap
      for (let b = 0; b < 2; b++) {
        pos.set(x + (rng() - 0.5) * 0.4, top - size * 0.3, z + (rng() - 0.5) * 1.2 + b * 0.5);
        quat.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0));
        scl.setScalar(size * (0.8 + rng() * 0.4));
        hedge.setMatrixAt(hi++, mat.compose(pos, quat, scl));
      }
      pos.set(x, top, z);
      scl.setScalar(size * 0.7);
      hedgeLight.setMatrixAt(hl++, mat.compose(pos, quat, scl));
      const pink = rng() < 0.5;
      for (let f = 0; f < 4; f++) {
        pos.set(x + (rng() - 0.5) * size, top + size * (0.1 + rng() * 0.5), z + (rng() - 0.5) * size * 1.5);
        scl.setScalar(size ? 0.9 + rng() * 0.7 : 0);
        const mtx = mat.compose(pos, quat.identity(), scl);
        if (pink) hedgePink.setMatrixAt(hp++, mtx); else hedgeWhite.setMatrixAt(hw++, mtx);
      }
    }
    scl.setScalar(0);
    for (; hp < hedgePink.count; hp++) hedgePink.setMatrixAt(hp, mat.compose(pos, quat, scl));
    for (; hw < hedgeWhite.count; hw++) hedgeWhite.setMatrixAt(hw, mat.compose(pos, quat, scl));
    for (const im of [hedge, hedgeLight, hedgePink, hedgeWhite]) im.instanceMatrix.needsUpdate = true;
  }
}

/** Small deterministic PRNG so chunk dressing is reproducible per serial. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
