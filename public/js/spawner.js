import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT } from './config.js';

const SPAWN_Z = -140;
const DESPAWN_Z = 12;

/**
 * Spawns pickups (Diva packs) and obstacles (stains) ahead of the player
 * and scrolls them with the world. Meshes here are PLACEHOLDERS until the
 * real pack / stain assets arrive.
 */
export class Spawner {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.nextSpawnIn = 20;
    this.packGeo = this._packGeometry();
    this.packMat = [
      new THREE.MeshStandardMaterial({ color: 0xe6007e, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    ];
    this.stainGeo = new THREE.CircleGeometry(0.75, 18).rotateX(-Math.PI / 2).scale(1.35, 1, 1);
    this.stainMat = new THREE.MeshStandardMaterial({ color: 0x5a3b16, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.time = 0;
  }

  _packGeometry() {
    const g = new THREE.BoxGeometry(0.6, 0.8, 0.14);
    g.clearGroups();
    // faces: +x -x +y -y +z -z → pink everywhere, white "band" via second group on front/back
    g.addGroup(0, 36, 0);
    return g;
  }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
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
      mesh = new THREE.Mesh(this.packGeo, this.packMat[0]);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.16), this.packMat[1]);
      band.position.y = 0.05;
      mesh.add(band);
      mesh.position.y = 0.9;
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
        it.mesh.rotation.y = this.time * 2.5;
        it.mesh.position.y = 0.9 + Math.sin(this.time * 4 + it.mesh.position.x) * 0.08;
      }
      if (it.hit) continue;
      const dz = Math.abs(it.mesh.position.z);
      const dx = Math.abs(it.mesh.position.x - player.x);
      if (dz < 0.9 && dx < LANE_WIDTH * 0.5) {
        if (it.kind === 'pack') {
          it.hit = true; it.mesh.visible = false; events.pickups++;
        } else if (!player.isAirborne) {
          it.hit = true; events.hits++;
        }
      }
    }
    // Despawn behind the camera
    this.items = this.items.filter((it) => {
      if (it.mesh.position.z > DESPAWN_Z) { this.group.remove(it.mesh); return false; }
      return true;
    });
    return events;
  }
}
