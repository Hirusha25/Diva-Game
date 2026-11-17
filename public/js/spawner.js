import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT } from './config.js';
import { glowTexture, starTexture, additive, Sparkles } from './fx.js';
import { buildBus, updateBus, BUS } from './bus.js';

const SPAWN_Z = -140;
const DESPAWN_Z = 12;

/**
 * Spawns pickups (Diva packs) and obstacles (stains) ahead of the player
 * and scrolls them with the world. The packs are the five Diva Fresh
 * variants (scripts/build-packs.mjs) as puffy 3D pouches with a coloured
 * glow and twinkles; collecting one sends it flying into the runner with a
 * sparkle burst. Stains are the mud / sand puddle pictures.
 */
const PACK_H = 1.25, PACK_Y = 1.45;
const PACK_GLOW = { 'pack-rose': 0xff3fa4, 'pack-gardenia': 0x3fd6f0, 'pack-lotus': 0xb35cf0, 'pack-sepalika': 0xff7a2a, 'pack-jasmine': 0x55e06a };
export class Spawner {
  constructor(scene, packs = [], stains = [], props = {}, world = null) {
    this.world = world; this.props = props; this.buses = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.nextSpawnIn = 20;
    this.packGeo = this._pillow();
    this.kinds = packs.map((p) => ({
      aspect: p.aspect,
      mat: new THREE.MeshStandardMaterial({ map: p.map, alphaTest: 0.5, roughness: 0.3, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: p.map, emissiveIntensity: 0.12 }),
      glow: additive(glowTexture(), PACK_GLOW[p.name] ?? 0xffffff, 0.5),
    }));
    this.starMat = additive(starTexture(), 0xffffff, 0.95);
    if (props.bonus) { this.bonusMap = props.bonus;
      this.bonusMat = new THREE.SpriteMaterial({ map: props.bonus, transparent: true, depthWrite: false, toneMapped: false });
      this.bonusGlow = additive(glowTexture(), 0x7fe0ff, 0.55); }
    this.sparkles = new Sparkles(this.group, 60);
    // stains: the mud / sand puddle pictures (scripts/build-stains.mjs) laid
    // flat on the road. The pictures were shot from a low angle (squashed top
    // to bottom), so each is stretched back to the puddle's real length.
    this.stainGeo2 = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.stainKinds = stains.map((st) => ({ width: st.width, length: st.length,
      mat: new THREE.MeshBasicMaterial({ map: st.map, transparent: true, alphaTest: 0.08, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }) }));
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
    for (const b of this.buses) this.group.remove(b.mesh);
    this.buses = [];
    if (this.world) for (const c of this.world.chunks) c.userData.busDone = true;   // stops already in view keep no bus
    for (const it of this.items) this.group.remove(it.mesh);
    for (const sp of this.sparkles.items) sp.s.visible = false;
    this.items = [];
    this.nextSpawnIn = 20;
  }

  _spawnPattern() {
    const z = SPAWN_Z;
    const r = Math.random();
    // rare bonus: the flower bubble, floating a little higher over a lane
    if (this.bonusMap && Math.random() < 0.09) this._spawn('bonus', Math.floor(Math.random() * LANE_COUNT), z - 12);
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

  /** in a bus zone (from just behind the rear to its front): no stains, and nothing in the bus's lane */
  _spawnBus(z) {
    const mesh = buildBus(this.props.bus, this.props.smoke);
    mesh.position.z = z;
    this.group.add(mesh);
    this.buses.push({ mesh, hit: false, dusted: false });
    // clear what was already spawned in its zone
    this.items = this.items.filter((it) => { if (this._blockedByBus(it.kind, it.lane, it.mesh.position.z)) { this.group.remove(it.mesh); return false; } return true; });
  }

  _blockedByBus(kind, lane, z) {
    for (const b of this.buses) { const rear = b.mesh.position.z;
      if (z < rear + 6 && z > rear - BUS.length - 4 && (kind === 'stain' || lane === 2)) return true; }
    if (kind === 'bonus') return false;
    return false;
  }

  _spawn(kind, lane, z) {
    if (this._blockedByBus(kind, lane, z)) return;
    let mesh;
    if (kind === 'pack') {
      const k = this.kinds[Math.floor(Math.random() * this.kinds.length)];
      mesh = new THREE.Group();
      const pouch = new THREE.Group();
      const front = new THREE.Mesh(this.packGeo, k.mat), back = new THREE.Mesh(this.packGeo, k.mat);
      back.rotation.y = Math.PI;
      pouch.add(front, back); pouch.scale.set(PACK_H * k.aspect, PACK_H, PACK_H);
      const glow = new THREE.Sprite(k.glow); glow.scale.setScalar(PACK_H * 1.9); glow.position.z = -0.7;   // well behind the pack: a halo round it, the pack itself stays clear
      const stars = [0, 1, 2].map(() => { const st = new THREE.Sprite(this.starMat); st.scale.setScalar(0.001); return st; });
      mesh.add(glow, pouch, ...stars);
      mesh.userData = { pouch, glow, stars, phase: Math.random() * 10, color: k.glow.color.getHex() };
      mesh.position.y = PACK_Y;
    } else if (kind === 'bonus') {
      mesh = new THREE.Group();
      const icon = new THREE.Sprite(this.bonusMat); icon.scale.setScalar(1.15);
      const glow = new THREE.Sprite(this.bonusGlow); glow.scale.setScalar(2.4); glow.position.z = -0.5;
      const stars = [0, 1, 2, 3].map(() => { const st = new THREE.Sprite(this.starMat); st.scale.setScalar(0.001); return st; });
      mesh.add(glow, icon, ...stars);
      mesh.userData = { icon, glow, stars, phase: Math.random() * 10, color: 0x7fe0ff, bonus: true };
      mesh.position.y = PACK_Y + 0.5;
    } else if (this.stainKinds.length) {
      const k = this.stainKinds[Math.floor(Math.random() * this.stainKinds.length)];
      mesh = new THREE.Mesh(this.stainGeo2, k.mat);   // flat on the road, picture's near edge toward the runner
      mesh.scale.set(k.width * (Math.random() < 0.5 ? 1 : -1), 1, k.length);
      mesh.position.y = 0.02; mesh.renderOrder = 1;
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
    const events = { pickups: 0, hits: 0, dust: 0, bus: 0 };
    // a bus parks at each bus stop on the right as it comes into range
    if (this.world && this.props.bus) for (const c of this.world.chunks) {
      const sh = c.userData.shelters; if (!sh || !sh.right.visible || c.userData.busDone) continue;
      const z = c.position.z + sh.right.position.z;
      if (z < -95 && z > -170) {
        c.userData.busDone = true;
        // buses are rare: about one right-side stop in three, never two in a row
        this.stopsSinceBus = (this.stopsSinceBus ?? 1) + 1;
        if (this.stopsSinceBus >= 2 && Math.random() < 0.35) { this.stopsSinceBus = 0; this._spawnBus(z + 2.8); }
      }
    }
    for (const b of this.buses) {
      b.mesh.position.z += distance; updateBus(b.mesh, dt);
      const rear = b.mesh.position.z;
      // running into the bus (its lane, along its length)
      if (!b.hit && player.x > BUS.laneX - BUS.rearW / 2 - 0.35 && rear > -0.3 && rear - BUS.length < 0.3) { b.hit = true; events.bus++; }
      // through the smoke over the middle lane, just behind the rear
      if (!b.dusted && !player.isAirborne && Math.abs(player.x) < 1.6 && rear > -2.5 && rear < 3.5) { b.dusted = true; events.dust++; }
    }
    this.buses = this.buses.filter((b) => { if (b.mesh.position.z - BUS.length > DESPAWN_Z) { this.group.remove(b.mesh); return false; } return true; });
    for (const it of this.items) {
      it.mesh.position.z += distance;
      if (it.kind === 'bonus' && it.collectT === undefined) {
        const u = it.mesh.userData, t = this.time + u.phase;
        it.mesh.position.y = PACK_Y + 0.5 + Math.sin(t * 2.6) * 0.18;
        u.icon.material.rotation = Math.sin(t * 1.7) * 0.18;
        u.icon.scale.setScalar(1.15 * (1 + 0.06 * Math.sin(t * 5)));
        u.glow.material.opacity = 0.45 + 0.15 * Math.sin(t * 4);
        u.stars.forEach((st, i) => { const a = t * 1.3 + i * 1.57, k = (Math.sin(t * 4.5 + i * 1.9) + 1) / 2;
          st.position.set(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0.2); st.scale.setScalar(0.05 + 0.3 * k * k); });
      }
      if (it.kind === 'pack' || (it.kind === 'bonus' && it.collectT !== undefined)) {
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
        if (!u.pouch) continue;
        u.pouch.rotation.y = t * 2.2;                                   // spin
        it.mesh.position.y = PACK_Y + Math.sin(t * 3.2) * 0.12;          // bob
        u.glow.material.opacity = 0.42 + 0.12 * Math.sin(t * 5);
        u.glow.scale.setScalar(PACK_H * (1.85 + 0.12 * Math.sin(t * 5)));
        u.stars.forEach((st, i) => {                                       // twinkles around the pack
          const a = t * 1.6 + i * 2.09, k = (Math.sin(t * 4 + i * 1.7) + 1) / 2;
          st.position.set(Math.cos(a) * 0.68, Math.sin(a * 1.3) * 0.72, 0.15);
          st.scale.setScalar(0.05 + 0.28 * k * k);
        });
      }
      if (it.hit) continue;
      const dz = Math.abs(it.mesh.position.z);
      const dx = Math.abs(it.mesh.position.x - player.x);
      if (dz < (it.kind === 'stain' ? 1.3 : 0.9) && dx < LANE_WIDTH * 0.5) {   // puddles are longer than a pack
        if (it.kind === 'bonus') {
          it.hit = true; it.collectT = 0; events.bonus = (events.bonus || 0) + 1;
          this.sparkles.burst(it.mesh.position, 18, 0x7fe0ff, 3, 0.6);
        } else if (it.kind === 'pack') {
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
