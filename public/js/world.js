import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANE_WIDTH, LANE_COUNT, ROAD_HALF, KERB, PAVEMENT, WALL, SHELTER_OFFSET_X,
  CHUNK_LENGTH, CHUNK_COUNT, COLORS,
} from './config.js';
import { pavingTexture, grassTexture, wallGridTexture } from './textures.js';

const TREES_PER_CHUNK = 40;   // 20 per side: 12 in a near row + 8 in a far row filling the gaps
const BUSHES_FRONT_PER_CHUNK = 20;  // 10 per side, every ~6 m along the wall base
const BUSHES_BACK_PER_CHUNK = 0;    // nothing peeks over the wall (reference shows canopy only)

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
    this.bushMaterials = assets.bushes.map((b) => ({
      material: new THREE.MeshBasicMaterial({ map: b.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, toneMapped: false }),
      aspect: b.aspect,
    }));
    this.busStandMaterial = new THREE.MeshBasicMaterial({ map: assets.busStand.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, toneMapped: false });
    this.busStandAspect = assets.busStand.aspect;
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
        for (const tree of chunk.userData.billboards) {
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
    const tile = 0.8;  // metres per paving slab
    paving.repeat.set((PAVEMENT.outer - PAVEMENT.inner) / tile, CHUNK_LENGTH / tile);
    // Baked leafy tree shadows: one texture spans the full street width and
    // 30 m of road; mirrored wrapping keeps it continuous across chunks.
    // Wall texture: one tile = 2 panels wide (3 m) x 2 panels tall (= wall height).
    const wallTex = wallGridTexture('#fee87d', '#fdd759');   // sampled from the reference
    const grass = grassTexture();
    grass.repeat.set(26, CHUNK_LENGTH / 3);
    const shadows = this.assets.shadows;
    shadows.repeat.set(1, CHUNK_LENGTH / 30);
    return {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, color: COLORS.asphaltTint, roughness: 0.95, metalness: 0 }),
      laneLine: new THREE.MeshBasicMaterial({ color: COLORS.laneLine, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      kerbWhite: new THREE.MeshStandardMaterial({ color: COLORS.kerbWhite, roughness: 0.85 }),
      kerbBlack: new THREE.MeshStandardMaterial({ color: COLORS.kerbBlack, roughness: 0.85 }),
      pavement: new THREE.MeshStandardMaterial({ map: paving, color: 0xffe9cc, roughness: 0.9 }),   // cream slabs
      wall: new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }),
      wallCap: new THREE.MeshBasicMaterial({ color: COLORS.wallCap, toneMapped: false }),
      wallCapTop: new THREE.MeshBasicMaterial({ color: COLORS.wallCapTop, toneMapped: false }),
      ground: new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
      dirt: new THREE.MeshStandardMaterial({ color: COLORS.dirt, roughness: 1 }),
      bed: new THREE.MeshBasicMaterial({ color: 0xf3b23e, toneMapped: false }),       // orange planter bed
      bedEdge: new THREE.MeshBasicMaterial({ color: 0x9a6a3a, toneMapped: false }),   // brown bed edging
      dapple: new THREE.MeshBasicMaterial({ map: shadows, transparent: true, depthWrite: false, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
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
    const wall = mirrored((s) => {
      const g = box(s * WALL.inner, s * WALL.outer, 0, WALL.height, -L / 2, L / 2);
      // Re-map UVs from world position so the panel grid is 3 m wide x wall-height tall
      // on the faces that run along the road (the +x/-x faces of the box).
      const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(nrm.getX(i)) > 0.5) uv.setXY(i, (pos.getZ(i) + L / 2) / 3, pos.getY(i) / WALL.height);
        else uv.setXY(i, 0.1, 0.1);
      }
      return g;
    });
    // Soil bed along the wall base that the bushes sit in (reference art).
    const bed = mirrored((s) => box(s * (WALL.inner - 0.75), s * WALL.inner, PAVEMENT.height, PAVEMENT.height + 0.03, -L / 2, L / 2));
    // Coping stone: a thick slab overhanging both faces, with a lighter top.
    const CAP_T = 0.22, CAP_O = 0.14;
    const bedEdge = mirrored((s) => box(s * (WALL.inner - 0.75), s * (WALL.inner - 0.63), PAVEMENT.height, PAVEMENT.height + 0.07, -L / 2, L / 2));
    const wallCap = mirrored((s) => box(s * (WALL.inner - CAP_O), s * (WALL.outer + CAP_O), WALL.height, WALL.height + CAP_T, -L / 2, L / 2));
    const wallCapTop = mirrored((s) => box(s * (WALL.inner - CAP_O), s * (WALL.outer + CAP_O), WALL.height + CAP_T, WALL.height + CAP_T + 0.01, -L / 2, L / 2));
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

    return { road, laneLines, kerbWhite, kerbBlack, pavement, wall, wallCap, wallCapTop, ground, dirt, dapple, bed, bedEdge };
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
    add(g.road, m.asphalt);
    add(g.laneLines, m.laneLine);
    add(g.kerbWhite, m.kerbWhite);
    add(g.kerbBlack, m.kerbBlack);
    add(g.pavement, m.pavement);
    add(g.wall, m.wall);
    add(g.wallCap, m.wallCap);
    add(g.wallCapTop, m.wallCapTop);
    add(g.bed, m.bed);
    add(g.bedEdge, m.bedEdge);
    add(g.dapple, m.dapple);

    // Dynamic dressing: one shelter per side (toggled), bushes and trees.
    chunk.userData.shelters = {
      left: this._makeShelter(-1),
      right: this._makeShelter(1),
    };
    chunk.add(chunk.userData.shelters.left, chunk.userData.shelters.right);

    chunk.userData.bushes = [];
    for (let i = 0; i < BUSHES_FRONT_PER_CHUNK + BUSHES_BACK_PER_CHUNK; i++) {
      const bush = this._makeBush(this.bushMaterials[0].material);
      chunk.userData.bushes.push(bush);
      chunk.add(bush);
    }

    chunk.userData.trees = [];
    for (let i = 0; i < TREES_PER_CHUNK; i++) {
      const tree = this._makeBillboard(this.treeMaterials[0].material);
      chunk.userData.trees.push(tree);
      chunk.add(tree);
    }
    chunk.userData.billboards = [...chunk.userData.trees];   // bushes stay flat against the wall
    return chunk;
  }

  _makeShelter(side) {
    // Illustrated bus stand on the pavement. It is NOT camera-facing: the art
    // is a 3/4 view, so it stays angled toward the road like a real stand.
    // Never mirrored (the Diva lettering would read backwards).
    const shelter = this._makeBillboard(this.busStandMaterial);
    const h = 3.6;
    shelter.scale.set(h * this.busStandAspect, h, 1);
    shelter.rotation.y = side < 0 ? 0.45 : -0.45;
    shelter.position.set(side * ((PAVEMENT.inner + PAVEMENT.outer) / 2 + 0.3), PAVEMENT.height, 0);
    return shelter;
  }

  _makeBush(material) {
    // A fan of three planes (−25°, 0°, +25°) so the bush has volume from any
    // angle, plus a soft blob shadow on the soil underneath.
    const group = new THREE.Group();
    const planes = [];
    for (const a of [-0.45, 0, 0.45]) {
      const m = new THREE.Mesh(this.treeGeometry, material);
      m.rotation.y = a;
      m.position.z = a === 0 ? 0.1 : -0.05;   // centre leaf forward, sides tucked behind
      m.scale.set(a === 0 ? 1 : 0.78, a === 0 ? 1 : 0.9, 1);
      group.add(m); planes.push(m);
    }
    if (!this._bushShadowGeo) {
      this._bushShadowGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
      this._bushShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    }
    const shadow = new THREE.Mesh(this._bushShadowGeo, this._bushShadowMat);
    shadow.scale.set(1.1, 1, 0.55);
    shadow.position.y = 0.075;
    group.add(shadow);
    group.userData = { front: planes[1], planes, shadow };
    return group;
  }

  _makeBillboard(material) {
    // One plane that is turned toward the camera every frame (see update()).
    const group = new THREE.Group();
    const front = new THREE.Mesh(this.treeGeometry, material);
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
    // Continuous tree line: a near row (canopies overlapping) plus a far row
    // staggered behind it so no sky shows through between trees. Trees are
    // set back behind the wall so trunks stay hidden.
    trees.forEach((tree, i) => {
      const kind = this.treeMaterials[Math.floor(rng() * this.treeMaterials.length)];
      const s = i % 2 === 0 ? -1 : 1;
      const j = Math.floor(i / 2);                        // 0..19
      const near = j < 12;
      const slots = near ? 12 : 8;
      const slot = near ? j : j - 12;
      const z = -CHUNK_LENGTH / 2 + (slot + (near ? 0.5 : 0.1) + (rng() - 0.5) * 0.3) * (CHUNK_LENGTH / slots);
      const height = near ? 10 + rng() * 2.5 : 10.5 + rng() * 2.5;
      const x = s * (WALL.outer + (near ? 3 + rng() * 1.5 : 6.5 + rng() * 2));
      tree.userData.front.material = kind.material;
      tree.scale.set(height * kind.aspect, height, 1);
      tree.position.set(x, -0.05, z);
      tree.visible = true;
    });

    // Bushes. Front row: on the pavement at the wall base (gap at the shelter).
    // Back row: a tall dense hedge behind the wall whose tops peek over the
    // cap and hide the open ground between wall and trees.
    const { bushes } = chunk.userData;
    bushes.forEach((bush, i) => {
      const kind = this.bushMaterials[Math.floor(rng() * this.bushMaterials.length)];
      for (const pl of bush.userData.planes) pl.material = kind.material;
      const s = i % 2 === 0 ? -1 : 1;
      if (i < BUSHES_FRONT_PER_CHUNK) {
        const slot = Math.floor(i / 2);
        const z = -CHUNK_LENGTH / 2 + (slot + 0.3 + rng() * 0.4) * (CHUNK_LENGTH / (BUSHES_FRONT_PER_CHUNK / 2));
        const blocked = s === shelterSide && Math.abs(z - shelterZ) < 7.5;
        const h = 0.85 + rng() * 0.25;                    // ~40% of the 2.2 m wall
        for (const pl of bush.userData.planes) pl.scale.x = h * kind.aspect * (pl === bush.userData.front ? 1 : 0.78);
        for (const pl of bush.userData.planes) pl.scale.y = h * (pl === bush.userData.front ? 1 : 0.9);
        bush.userData.shadow.scale.set(h * kind.aspect * 1.05, 1, h * 0.7);
        bush.userData.shadow.position.y = 0.075 - (PAVEMENT.height - 0.07);
        // Faces the road, sitting in the soil bed with room for the fan's depth.
        bush.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        bush.position.set(s * (WALL.inner - 0.38), PAVEMENT.height - 0.07, z);
        bush.visible = !blocked && rng() < 0.9;
      } else {
        const j = i - BUSHES_FRONT_PER_CHUNK;
        const slot = Math.floor(j / 2);
        const z = -CHUNK_LENGTH / 2 + (slot + rng() * 0.6) * (CHUNK_LENGTH / (BUSHES_BACK_PER_CHUNK / 2));
        const h = 2.4 + rng() * 0.4;                      // tops just peek over the 2.2 m wall
        for (const pl of bush.userData.planes) pl.scale.set(h * kind.aspect, h, 1);
        bush.position.set(s * (WALL.outer + 0.9 + rng() * 0.8), -0.02, z);
        bush.visible = rng() < 0.75;
      }
    });
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
