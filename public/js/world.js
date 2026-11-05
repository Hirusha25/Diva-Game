import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANE_WIDTH, LANE_COUNT, ROAD_HALF, KERB, PAVEMENT, WALL, SHELTER_OFFSET_X,
  CHUNK_LENGTH, CHUNK_COUNT, COLORS,
} from './config.js';

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
    this.treeMaterials = assets.trees.map((t) => ({
      front: new THREE.MeshBasicMaterial({ map: t.front, alphaTest: 0.45, side: THREE.DoubleSide, fog: true }),
      side: new THREE.MeshBasicMaterial({ map: t.side, alphaTest: 0.45, side: THREE.DoubleSide, fog: true }),
      width: t.width, height: t.height,
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

  /** Advance the world by `distance` metres (towards the player). */
  update(distance) {
    for (const chunk of this.chunks) {
      chunk.position.z += distance;
      // Chunk fully behind the camera → move it to the far end and re-dress.
      if (chunk.position.z - CHUNK_LENGTH / 2 > 12) {
        chunk.position.z -= CHUNK_LENGTH * CHUNK_COUNT;
        this._dressChunk(chunk, this.chunkSerial++);
      }
    }
  }

  // ---------------------------------------------------------------- materials
  _materials() {
    const asphalt = this.assets.asphalt;
    asphalt.repeat.set(LANE_COUNT, CHUNK_LENGTH / 6.67);
    return {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, color: COLORS.asphaltTint, roughness: 0.95, metalness: 0 }),
      laneLine: new THREE.MeshStandardMaterial({ color: COLORS.laneLine, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
      kerbWhite: new THREE.MeshStandardMaterial({ color: COLORS.kerbWhite, roughness: 0.85 }),
      kerbBlack: new THREE.MeshStandardMaterial({ color: COLORS.kerbBlack, roughness: 0.85 }),
      pavement: new THREE.MeshStandardMaterial({ color: COLORS.pavement, roughness: 0.9 }),
      wall: new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 1 }),
      wallCap: new THREE.MeshStandardMaterial({ color: COLORS.wallCap, roughness: 0.9 }),
      ground: new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
      dirt: new THREE.MeshStandardMaterial({ color: COLORS.dirt, roughness: 1 }),
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
      for (let z = -L / 2; z < L / 2; z += 4) {
        marks.push(new THREE.PlaneGeometry(0.15, 2).rotateX(-Math.PI / 2).translate(x, 0.012, z + 1));
      }
    }
    for (const s of [1, -1]) {
      marks.push(new THREE.PlaneGeometry(0.12, L).rotateX(-Math.PI / 2).translate(s * (ROAD_HALF - 0.2), 0.012, 0));
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
    const wallCap = mirrored((s) => box(s * (WALL.inner - 0.04), s * (WALL.outer + 0.04), WALL.height, WALL.height + 0.08, -L / 2, L / 2));
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

    return { road, laneLines, kerbWhite, kerbBlack, pavement, wall, wallCap, ground, dirt };
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

    // Dynamic dressing: one shelter per side (toggled), a pool of trees.
    chunk.userData.shelters = {
      left: this._makeShelter(-1),
      right: this._makeShelter(1),
    };
    chunk.add(chunk.userData.shelters.left, chunk.userData.shelters.right);

    chunk.userData.trees = [];
    for (let i = 0; i < 10; i++) {
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
    const group = new THREE.Group();
    const front = new THREE.Mesh(this.treeGeometry, this.treeMaterials[0].front);
    const side = new THREE.Mesh(this.treeGeometry, this.treeMaterials[0].side);
    side.rotation.y = Math.PI / 2;
    group.add(front, side);
    group.userData = { front, side };
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
    for (const tree of trees) {
      const kind = this.treeMaterials[Math.floor(rng() * this.treeMaterials.length)];
      const s = rng() < 0.5 ? -1 : 1;
      const scale = 0.75 + rng() * 0.45;
      tree.userData.front.material = kind.front;
      tree.userData.side.material = kind.side;
      tree.scale.set(kind.width * scale, kind.height * scale, 1);
      tree.position.set(
        s * (WALL.outer + 3 + rng() * 9),
        -0.05,
        -CHUNK_LENGTH / 2 + rng() * CHUNK_LENGTH,
      );
      tree.rotation.y = (rng() - 0.5) * 0.6;
      tree.visible = rng() < 0.8;
    }
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
