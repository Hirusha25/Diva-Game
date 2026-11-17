import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT } from './config.js';
import { glowTexture, starTexture, additive, Sparkles } from './fx.js';

const SPAWN_Z = -140;
const DESPAWN_Z = 12;

/**
 * Spawns pickups (Diva packs) and obstacles (stains) ahead of the player
 * and scrolls them with the world. The packs are the five Diva Fresh
 * variants (scripts/build-packs.mjs) as puffy 3D pouches with a coloured
 * glow and twinkles; collecting one sends it flying into the runner with a
 * sparkle burst. (Stains are still placeholders.)
 */
const PACK_H = 1.25, PACK_Y = 1.45;
const PACK_GLOW = { 'pack-rose': 0xff3fa4, 'pack-gardenia': 0x3fd6f0, 'pack-lotus': 0xb35cf0, 'pack-sepalika': 0xff7a2a, 'pack-jasmine': 0x55e06a };
export class Spawner {
  constructor(scene, packs = []) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.nextSpawnIn = 20;
    this.packGeo = this._pillow();
    this.kinds = packs.map((p) => ({
      aspect: p.aspect,
      mat: new THREE.MeshStandardMaterial({ map: p.map, alphaTest: 0.5, roughness: 0.3, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: p.map, emissiveIntensity: 0.35 }),
      glow: additive(glowTexture(), PACK_GLOW[p.name] ?? 0xffffff, 0.75),
    }));
    this.starMat = additive(starTexture(), 0xffffff, 0.95);
    this.sparkles = new Sparkles(this.group, 60);
    this.stainGeo = new THREE.CircleGeometry(0.75, 18).rotateX(-Math.PI / 2).scale(1.35, 1, 1);
    this.stainMat = new THREE.MeshStandardMaterial({ color: 0x5a3b16, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.time = 0;
  }

  /** a pouch face: a unit plane puffed out in the middle, flat at the sealed edges */
  _pillow() {
    const g = new THREE.PlaneGeometry(1, 1, 12, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) * 2, v = p.getY(i) * 2;
      p.setZ(i, 0.075 * (1 - u ** 4) * (1 - v ** 6)); }
    g.computeVertexNormals();
    return g;
  }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
    for (const sp of this.sparkles.items) sp.s.visible = false;
    this.items = [];
    this.nextSpawnIn = 20;
  }

  _spawnPattern() {
    const z = SPAWN_Z;
    const r = Math.random();
    if (r < 0.45) {
      // A line of packs in one lane
      const lane = Math.floor(Math.random() * LANE_COUNT);
      for (let i = 0; i < 5; i++) this._spawn('pack', lane, z - i * 2.2);
    } else if (r < 0.75) {
      // Stain in one lane, packs in a neighbour
      const lane = Math.floor(Math.random() * LANE_COUNT);
      this._spawn('stain', lane, z);
      const other = (lane + 1 + Math.floor(Math.random() * 2)) % LANE_COUNT;
      for (let i = 0; i < 3; i++) this._spawn('pack', other, z - 1 - i * 2.2);
    } else {
      // Two stains leaving one lane free
      const free = Math.floor(Math.random() * LANE_COUNT);
      for (let lane = 0; lane < LANE_COUNT; lane++) if (lane !== free) this._spawn('stain', lane, z);
    }
  }

  _spawn(kind, lane, z) {
    let mesh;
    if (kind === 'pack') {
      const k = this.kinds[Math.floor(Math.random() * this.kinds.length)];
      mesh = new THREE.Group();
      const pouch = new THREE.Group();
      const front = new THREE.Mesh(this.packGeo, k.mat), back = new THREE.Mesh(this.packGeo, k.mat);
      back.rotation.y = Math.PI;
      pouch.add(front, back); pouch.scale.set(PACK_H * k.aspect, PACK_H, PACK_H);
      const glow = new THREE.Sprite(k.glow); glow.scale.setScalar(PACK_H * 2.2); glow.position.z = -0.05;
      const stars = [0, 1, 2].map(() => { const st = new THREE.Sprite(this.starMat); st.scale.setScalar(0.001); return st; });
      mesh.add(glow, pouch, ...stars);
      mesh.userData = { pouch, glow, stars, phase: Math.random() * 10, color: k.glow.color.getHex() };
      mesh.position.y = PACK_Y;
    } else {
      mesh = new THREE.Mesh(this.stainGeo, this.stainMat);
      mesh.position.y = 0.015;
    }
    mesh.position.x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
    mesh.position.z = z;
    this.group.add(mesh);
    this.items.push({ kind, lane, mesh, hit: false });
  }

  /**
   * @returns {{pickups:number, hits:number}} events this frame
   */
  update(dt, distance, player) {
    this.time += dt;
    this.nextSpawnIn -= distance;
    if (this.nextSpawnIn <= 0) {
      this._spawnPattern();
      this.nextSpawnIn = 16 + Math.random() * 14;
    }
    const events = { pickups: 0, hits: 0 };
    for (const it of this.items) {
      it.mesh.position.z += distance;
      if (it.kind === 'pack') {
        const u = it.mesh.userData, t = this.time + u.phase;
        if (it.collectT !== undefined) {
          // sucked into the runner's chest (just in front of him, so it never
          // covers him from the camera), shrinking to nothing
          it.collectT += dt; const k = Math.min(1, it.collectT / 0.18);
          it.mesh.position.x += (player.x - it.mesh.position.x) * Math.min(1, dt * 18);
          it.mesh.position.y += (2.0 + player.height - it.mesh.position.y) * Math.min(1, dt * 18);
          it.mesh.position.z = Math.min(it.mesh.position.z, -0.7);
          it.mesh.scale.setScalar(Math.max(0.01, (1 - k) ** 1.5));
          if (k >= 1) it.mesh.visible = false;
          continue;
        }
        u.pouch.rotation.y = t * 2.2;                                   // spin
        it.mesh.position.y = PACK_Y + Math.sin(t * 3.2) * 0.12;          // bob
        u.glow.material.opacity = 0.6 + 0.2 * Math.sin(t * 5);
        u.glow.scale.setScalar(PACK_H * (2.1 + 0.15 * Math.sin(t * 5)));
        u.stars.forEach((st, i) => {                                       // twinkles around the pack
          const a = t * 1.6 + i * 2.09, k = (Math.sin(t * 4 + i * 1.7) + 1) / 2;
          st.position.set(Math.cos(a) * 0.62, Math.sin(a * 1.3) * 0.62, 0.15);
          st.scale.setScalar(0.05 + 0.28 * k * k);
        });
      }
      if (it.hit) continue;
      const dz = Math.abs(it.mesh.position.z);
      const dx = Math.abs(it.mesh.position.x - player.x);
      if (dz < 0.9 && dx < LANE_WIDTH * 0.5) {
        if (it.kind === 'pack') {
          it.hit = true; it.collectT = 0; events.pickups++;
          this.sparkles.burst(it.mesh.position, 9, it.mesh.userData.color, 2.2, 0.4);
        } else if (!player.isAirborne) {
          it.hit = true; events.hits++;
        }
      }
    }
    this.sparkles.update(dt);
    // Despawn behind the camera
    this.items = this.items.filter((it) => {
      if (it.mesh.position.z > DESPAWN_Z) { this.group.remove(it.mesh); return false; }
      return true;
    });
    return events;
  }
}
