import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANE_WIDTH, LANE_COUNT, ROAD_HALF, KERB, PAVEMENT, WALL, SHELTER_OFFSET_X,
  CHUNK_LENGTH, CHUNK_COUNT, COLORS,
} from './config.js';
import { pavingTexture, grassTexture, wallGridTexture, soilTexture } from './textures.js';

const TREES_PER_CHUNK = 40;   // 20 per side: 12 in a near row + 8 in a far row filling the gaps
const BUSHES_FRONT_PER_CHUNK = 20;  // 10 per side, every ~6 m along the wall base
const BUSHES_BACK_PER_CHUNK = 16;   // 8 per side: flowering hedge rising above the wall, between the trees
const BUSH_LEAF_CARDS = 70;         // leaf patches per bush (3x for the big hedge clumps)
const BUSH_FLOWER_CARDS = 14;

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
      side: b.side,
    }));
    // Which art goes on which wall (art drawn receding to the right suits the
    // left wall; the others are mirrored where needed so the perspective reads).
    this.bushSets = {
      left: this.bushMaterials.map((k, i) => ({ kind: k, i, mirror: k.side === 'right' })),
      right: this.bushMaterials.map((k, i) => ({ kind: k, i, mirror: k.side === 'left' })),
    };
    this.busStandMaterial = new THREE.MeshBasicMaterial({ map: assets.busStand.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, toneMapped: false });
    this.busStandAspect = assets.busStand.aspect;
    // Foliage cards for the volumetric bushes (lit, double-sided, alpha-cut).
    const card = (map) => new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, emissive: 0x2b4a12, emissiveIntensity: 0.55, emissiveMap: map });
    this.cardMaterials = {
      leaf: [card(assets.cards.leaf1), card(assets.cards.leaf2), card(assets.cards.leaf3)],
      white: card(assets.cards.white),
      pink: card(assets.cards.pink),
    };
    this.cardGeometry = new THREE.PlaneGeometry(1, 1);
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
          let yaw = Math.atan2(dx, dz);                 // cylindrical billboard
          const cl = tree.userData.clamp;                // bushes: pinned at the wall, swing outward only
          if (cl) yaw = cl.centre + THREE.MathUtils.clamp(yaw - cl.centre, cl.min, cl.max);
          tree.rotation.y = yaw;
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
    // Smooth plaster, sampled from the reference: pale yellow at the coping,
    // richer orange-yellow toward the base. No grid.
    const wallTex = wallGridTexture('#fddf62', '#d9992a', { midHex: '#f6b434', grid: false });
    const soil = soilTexture();
    soil.repeat.set(1, CHUNK_LENGTH / 4);   // 0.75 m wide strip, one tile per 4 m
    const bedGrass = grassTexture();
    bedGrass.repeat.set(1, CHUNK_LENGTH / 2);
    // Planter-bed style: 'none' | 'plinth' | 'soil' | 'grass'  (see docs/reference)
    this.bedStyle = globalThis.__DIVA_BED || 'brown3';   // approved: option D3, deeper brown soft-textured strip
    // Subtle brown variants of the turf-strip shape (D): soft texture, mid tones.
    const brownHex = { brown1: '#c9a46c', brown2: '#b0864f', brown3: '#92683f' }[this.bedStyle];
    const brown = brownHex ? soilTexture(brownHex, 0.55) : null;
    if (brown) brown.repeat.set(1, CHUNK_LENGTH / 2);
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
      bed: ({
        none: null,
        plinth: new THREE.MeshStandardMaterial({ color: 0xd4cec6, roughness: 0.95 }),        // pale concrete plinth
        soil: new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }),                    // textured garden soil
        grass: new THREE.MeshStandardMaterial({ map: bedGrass, roughness: 1 }),               // turf strip
        brown1: brown && new THREE.MeshStandardMaterial({ map: brown, roughness: 1 }),
        brown2: brown && new THREE.MeshStandardMaterial({ map: brown, roughness: 1 }),
        brown3: brown && new THREE.MeshStandardMaterial({ map: brown, roughness: 1 }),
      })[this.bedStyle],
      bedEdge: ({
        none: null,
        plinth: new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 1 }),
        soil: new THREE.MeshStandardMaterial({ color: 0x9e7a4a, roughness: 1 }),
        grass: new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 1 }),
        brown1: new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 1 }),
        brown2: new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 1 }),
        brown3: new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 1 }),
      })[this.bedStyle],
      dapple: new THREE.MeshBasicMaterial({ map: shadows, transparent: true, depthWrite: false, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
      wallShade: new THREE.MeshBasicMaterial({ map: shadows, transparent: true, depthWrite: false, opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }),
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
    const bed = mirrored((s) => {
      const g = box(s * (WALL.inner - 0.75), s * WALL.inner, PAVEMENT.height - 0.02, PAVEMENT.height + 0.03, -L / 2, L / 2);
      // Top face UVs run along the road so the soil texture does not stretch.
      const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        if (nrm.getY(i) > 0.5) uv.setXY(i, (Math.abs(pos.getX(i)) - (WALL.inner - 0.75)) / 0.75, (pos.getZ(i) + L / 2) / L);
      }
      return g;
    });
    // Coping stone: a thick slab overhanging both faces, with a lighter top.
    const CAP_T = 0.22, CAP_O = 0.14;
    const bedEdge = mirrored((s) => box(s * (WALL.inner - 0.75), s * (WALL.inner - 0.63), PAVEMENT.height, PAVEMENT.height + 0.07, -L / 2, L / 2));
    const wallCap = mirrored((s) => box(s * (WALL.inner - CAP_O), s * (WALL.outer + CAP_O), WALL.height, WALL.height + CAP_T, -L / 2, L / 2));
    const wallCapTop = mirrored((s) => box(s * (WALL.inner - CAP_O), s * (WALL.outer + CAP_O), WALL.height + CAP_T, WALL.height + CAP_T + 0.01, -L / 2, L / 2));
    // Faint tree-shadow overlay on the road-facing wall faces.
    const wallShade = mergeGeometries([1, -1].map((s) => {
      const g = new THREE.PlaneGeometry(L, WALL.height);
      g.rotateY(s < 0 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(s * (WALL.inner - 0.004), WALL.height / 2, 0);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getZ(i) + L / 2) / 30 + (s > 0 ? 0.37 : 0), pos.getY(i) / 9);
      uv.needsUpdate = true;
      return g;
    }));
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

    return { road, laneLines, kerbWhite, kerbBlack, pavement, wall, wallCap, wallCapTop, ground, dirt, dapple, bed, bedEdge, wallShade };
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
    if (m.bed) add(g.bed, m.bed);
    if (m.bedEdge) add(g.bedEdge, m.bedEdge);
    add(g.dapple, m.dapple);
    add(g.wallShade, m.wallShade);

    // Dynamic dressing: one shelter per side (toggled), bushes and trees.
    chunk.userData.shelters = {
      left: this._makeShelter(-1),
      right: this._makeShelter(1),
    };
    chunk.add(chunk.userData.shelters.left, chunk.userData.shelters.right);

    // Volumetric bushes: one instanced mesh per card material per chunk.
    const CARDS = BUSH_LEAF_CARDS * (BUSHES_FRONT_PER_CHUNK + BUSHES_BACK_PER_CHUNK * 3);
    const FLOWERS = BUSH_FLOWER_CARDS * (BUSHES_FRONT_PER_CHUNK + BUSHES_BACK_PER_CHUNK * 3);
    chunk.userData.foliage = {
      leaf: this.cardMaterials.leaf.map((m) => new THREE.InstancedMesh(this.cardGeometry, m, Math.ceil(CARDS / 3) + 8)),
      white: new THREE.InstancedMesh(this.cardGeometry, this.cardMaterials.white, FLOWERS),
      pink: new THREE.InstancedMesh(this.cardGeometry, this.cardMaterials.pink, FLOWERS),
    };
    for (const im of [...chunk.userData.foliage.leaf, chunk.userData.foliage.white, chunk.userData.foliage.pink]) { im.frustumCulled = false; chunk.add(im); }
    // Solid dark-green core so the wall never shows through the leaf cards.
    if (!this._coreGeo) { this._coreGeo = new THREE.SphereGeometry(1, 12, 9); this._coreMat = new THREE.MeshLambertMaterial({ color: 0x3f8a2a }); }
    chunk.userData.bushCores = new THREE.InstancedMesh(this._coreGeo, this._coreMat, BUSHES_FRONT_PER_CHUNK + BUSHES_BACK_PER_CHUNK);
    chunk.add(chunk.userData.bushCores);
    chunk.userData.bushShadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
      BUSHES_FRONT_PER_CHUNK,
    );
    chunk.add(chunk.userData.bushShadows);
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
    chunk.userData.billboards = [...chunk.userData.trees, ...chunk.userData.bushes];
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
    // Two crossed planes of the same bush image (centre pivot, base at y = 0).
    if (!this._bushGeo) this._bushGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // pivot at the x = 0 edge
    const group = new THREE.Group();
    const along = new THREE.Mesh(this._bushGeo, material);
    const across = new THREE.Mesh(this._bushGeo, material);
    group.add(along, across);
    if (!this._bushShadowGeo) {
      this._bushShadowGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
      this._bushShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    }
    const shadow = new THREE.Mesh(this._bushShadowGeo, this._bushShadowMat);
    group.add(shadow);
    group.userData = { front: along, planes: [along, across], shadow };
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
    // ---- Bushes: the user's four bush images, whole. Each one is a crossed
    // pair of planes (the image along the wall + the same image across it) so
    // the clump has thickness from every angle while staying their artwork.
    // Hide the leaf-card system (kept in the build for later).
    {
      const F = chunk.userData.foliage;
      const M0 = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const im of [...F.leaf, F.white, F.pink, chunk.userData.bushCores]) { for (let k = 0; k < im.count; k++) im.setMatrixAt(k, M0); im.instanceMatrix.needsUpdate = true; }
    }
    const { bushes } = chunk.userData;
    const perSide = BUSHES_FRONT_PER_CHUNK / 2, backPerSide = BUSHES_BACK_PER_CHUNK / 2;
    let lastKind = { [-1]: -1, [1]: -1 };
    let shadowIdx = 0;
    const SM = new THREE.Matrix4(), SP = new THREE.Vector3(), SQ = new THREE.Quaternion(), SS = new THREE.Vector3();
    const pickKind = (s) => {
      const set = s < 0 ? this.bushSets.left : this.bushSets.right;
      let pick = set[Math.floor(rng() * set.length)];
      if (pick.i === lastKind[s]) pick = set[(set.indexOf(pick) + 1) % set.length];
      lastKind[s] = pick.i;
      return pick;
    };
    bushes.forEach((bush, i) => {
      const s = i % 2 === 0 ? -1 : 1;
      const pick = pickKind(s);
      const kind = pick.kind;
      const isRow = kind.aspect > 2.2;
      const [along, across] = bush.userData.planes;
      for (const pl of bush.userData.planes) pl.material = kind.material;
      if (i < BUSHES_FRONT_PER_CHUNK) {
        if (isRow) { bush.visible = false; return; }
        const slot = Math.floor(i / 2);
        const z = -CHUNK_LENGTH / 2 + (slot + 0.25 + rng() * 0.5) * (CHUNK_LENGTH / perSide);
        const blocked = s === shelterSide && Math.abs(z - shelterZ) < 7.5;
        const h = 1.05 + rng() * 0.25;
        const w = h * kind.aspect;
        // Pivot at the clump's centre; 'along' lies parallel to the wall, 'across'
        // is the same image turned 90° (narrowed) to give it depth.
        for (const pl of bush.userData.planes) { pl.position.set(0, 0, 0); }
        // One copy of the image that turns to face the camera (see update()),
        // so it always shows its full painted face. Its centre is kept a full
        // half-width off the wall, so even turned side-on it never cuts into it.
        // The image is pinned to the wall at the end nearest the player and
        // turns toward the camera around that end, so the far end swings out
        // toward the road by at most ~35°. It can never cut into the wall.
        across.visible = false;
        along.rotation.y = 0;
        // span: left wall [0,w] (pivot = near end), right wall [-w,0]
        const flip = pick.mirror ? -1 : 1;
        along.scale.set(w * flip, h, 1);
        along.position.x = s < 0 ? (flip < 0 ? w : 0) : (flip < 0 ? 0 : -w);
        bush.userData.billboard = true;
        bush.userData.clamp = s < 0 ? { centre: Math.PI / 2, min: -0.45, max: 0 } : { centre: -Math.PI / 2, min: 0, max: 0.45 };
        bush.position.set(s * (WALL.inner - 0.04), PAVEMENT.height + 0.03, z + w / 2);
        SP.set(s * (WALL.inner - 0.38), PAVEMENT.height + 0.035, z); SQ.identity(); SS.set(0.8, 1, w * 0.9); SM.compose(SP, SQ, SS);
        chunk.userData.bushShadows.setMatrixAt(shadowIdx++, SM);
        bush.userData.shadow.visible = false;
        bush.visible = !blocked && rng() < 0.85;
      } else {
        const j = i - BUSHES_FRONT_PER_CHUNK;
        const slot = Math.floor(j / 2);
        const z = -CHUNK_LENGTH / 2 + (slot + 0.2 + rng() * 0.6) * (CHUNK_LENGTH / backPerSide);
        const h = isRow ? 2.1 + rng() * 0.3 : 2.7 + rng() * 0.4;
        const w = h * kind.aspect;
        for (const pl of bush.userData.planes) { pl.position.set(0, 0, 0); }
        across.visible = false;
        along.rotation.y = 0;
        const flip = pick.mirror ? -1 : 1;
        along.scale.set(w * flip, h, 1);
        along.position.x = s < 0 ? (flip < 0 ? w : 0) : (flip < 0 ? 0 : -w);
        bush.userData.billboard = true;
        bush.userData.clamp = s < 0 ? { centre: Math.PI / 2, min: -0.5, max: 0 } : { centre: -Math.PI / 2, min: 0, max: 0.5 };
        bush.userData.shadow.visible = false;
        bush.position.set(s * (WALL.outer + 0.1), 0, z + w / 2);
        bush.visible = rng() < 0.8;
      }
    });
    SS.setScalar(0); SP.set(0, -10, 0); SQ.identity(); SM.compose(SP, SQ, SS);
    for (let k = shadowIdx; k < chunk.userData.bushShadows.count; k++) chunk.userData.bushShadows.setMatrixAt(k, SM);
    chunk.userData.bushShadows.instanceMatrix.needsUpdate = true;
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
