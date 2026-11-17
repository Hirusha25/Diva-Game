import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT, LANE_SWITCH_SPEED, JUMP } from './config.js';
import { Sparkles, glowTexture, additive } from './fx.js';

const MODEL_HEIGHT = (typeof window !== 'undefined' && window.__DIVA_RUNNER_H) || 3.2;   // metres, feet to top of hair (larger than life so he reads well on a phone)
const RUNNER_SCALE = MODEL_HEIGHT / 2;     // the rigged model is 2 units tall, feet at y = -1
const SIZE = MODEL_HEIGHT / 1.55;          // relative to the original size (shadow etc.)

// Run-cycle keyframes for one leg, [phase, angle in radians].
// 2.4 foot lands ahead · 3.45 foot under the body · 4.55 toe-off ·
// ~5.9 heel kicked up behind · 1.4 knee driven up in front.
// Thigh: < 0 forward. Knee: > 0 bent. Foot (swing): > 0 toes down.
const THIGH = [[2.4, -0.6], [3.45, 0.0], [4.4, 0.62], [5.1, 0.45], [5.9, 0.0], [0.6, -0.75], [1.4, -1.15], [2.0, -0.95]];
const KNEE = [[2.4, 0.22], [3.45, 0.45], [4.4, 0.3], [5.1, 1.3], [5.9, 2.15], [0.6, 1.9], [1.4, 1.2], [2.0, 0.5]];
const FOOT_WORLD = [[2.4, -0.25], [3.45, 0.0], [4.2, 0.2], [4.55, 0.6]];          // sole angle on the road (stance)
const FOOT_SWING = [[5.2, 0.35], [5.9, 0.4], [0.6, 0.25], [1.4, 0.0], [2.0, -0.1]];
const TAU = Math.PI * 2;
/** Smooth periodic (Catmull-Rom style) interpolation through [phase, value] keys. */
for (const k of [THIGH, KNEE, FOOT_WORLD, FOOT_SWING]) k.sort((a, b) => a[0] - b[0]);
function loopSpline(keys, ph) {
  ph = ((ph % TAU) + TAU) % TAU;
  if (ph < keys[0][0]) ph += TAU;          // before the first key: it lies after the last one
  const n = keys.length; let i = n - 1; for (let k = 0; k < n; k++) if (keys[k][0] <= ph) i = k;
  const key = (j) => { const w = Math.floor(j / n); const kk = keys[((j % n) + n) % n]; return [kk[0] + w * TAU, kk[1]]; };
  const p0 = key(i - 1), p1 = key(i), p2 = key(i + 1), p3 = key(i + 2);
  const h = p2[0] - p1[0], t = (ph - p1[0]) / h;
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
/** 1 while the foot is on the road (landing → toe-off), easing in/out. */
function stanceWeight(ph) {
  ph = ((ph % TAU) + TAU) % TAU;
  const e = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return e(2.25, 2.45, ph) * (1 - e(4.3, 4.6, ph));   // shorter ground contact: a sprint
}

/**
 * The runner: the rigged Diva boy (scripts/rig-runner.mjs) animated
 * procedurally so the stride keeps pace with the run speed. Falls back to a
 * simple placeholder if no model is given.
 *
 * Bone axes are the model's axes (it faces +z, its left is +x):
 *  rotation.x < 0 swings a hanging limb forward, > 0 backward;
 *  on a forearm/shin, it bends the elbow forward / the knee backward.
 */
export class Player {
  constructor(scene, model = null, cleanMap = null) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.lane = 1;                       // 0..LANE_COUNT-1, 1 = centre
    this.x = 0;
    this.jumpT = -1;                     // -1 = on the ground
    this.height = 0;
    this.runTime = 0;
    this.hitT = -1;                      // flinch timer after hitting a stain
    this.vx = 0;                         // sideways velocity (smooth lane changes)
    this.lean = 0;
    this.strideRate = 8;

    // shirt dirt: 1 = muddy (as modelled), 0 = clean. Diva packs wash it,
    // stains bring it back (see clean() / stain()).
    this.dirt = 1; this.dirtShown = 1; this.shine = 0; this.twinkleT = 0;
    this.shirtU = { uDirt: { value: 1 }, uShine: { value: 0 }, uDull: { value: 0 }, uCleanMap: { value: cleanMap } };
    this.dull = 0;
    this.body = model ? this._rigged(model) : this._placeholderBody();
    this.group.add(this.body);
    this.sparkles = new Sparkles(this.group, 36);
    this.mud = new Sparkles(this.group, 24, true); this.mud.keepColor = true;
    this.aura = new THREE.Sprite(additive(glowTexture(), 0xbfefff, 0));
    this.aura.position.set(0, RUNNER_SCALE * 1.15, 0); this.aura.scale.setScalar(RUNNER_SCALE * 2.6);
    this.group.add(this.aura);

    // Soft blob shadow (no shadow maps on mobile).
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4 * SIZE, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.position.y = 0.02;
    this.shadow = shadow;
    this.group.add(shadow);
  }

  _rigged(model) {
    const holder = new THREE.Group();          // lean / bob applied here
    const turn = new THREE.Group();            // faces the run direction (-z): we see his back
    turn.rotation.y = Math.PI;
    model.scale.setScalar(RUNNER_SCALE);
    model.position.y = RUNNER_SCALE;           // feet on the ground
    model.traverse((o) => {
      if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.side = THREE.FrontSide; if (this.shirtU.uCleanMap.value) this._washable(o.material); } }
    });
    turn.add(model); holder.add(turn);
    const b = (n) => model.getObjectByName(n);
    this.bones = {};
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head',
      'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L',
      'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R']) this.bones[n] = b(n);
    this.hipsRestY = this.bones.hips.position.y;
    // pelvis: tilt, roll, then yaw; thighs: undo yaw, undo roll, then swing
    this.bones.hips.rotation.order = 'XZY';
    this.bones.thigh_L.rotation.order = 'YZX'; this.bones.thigh_R.rotation.order = 'YZX';
    this.bones.upperarm_L.rotation.order = 'YXZ'; this.bones.upperarm_R.rotation.order = 'YXZ';   // outward angle first, then the swing
    // heel and toe of each foot, in the foot bone's space (model units)
    const pts = () => [new THREE.Vector3(0, -0.12, -0.05), new THREE.Vector3(0, -0.12, 0.2)];
    this.footPts = [[this.bones.foot_L, pts()], [this.bones.foot_R, pts()]];
    this._v = new THREE.Vector3();
    // leg geometry for the stance IK (model units; sole of the foot at y = -0.99)
    this.thighV = this.bones.shin_L.position.clone();     // thigh bone vector
    this.shinV = this.bones.foot_L.position.clone();      // shin bone vector
    this.thighX = Math.abs(this.bones.thigh_L.position.x); // hip joint half-width
    this.hipH = this.hipsRestY + this.bones.thigh_L.position.y + 1;   // thigh joint above the road
    return holder;
  }

  /** blend the texture towards the clean-shirt map as dirt goes down; shine adds a white glow */
  _washable(mat) {
    const U = this.shirtU;
    U.uCleanMap.value.flipY = false;          // glTF texture convention
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = 'uniform sampler2D uCleanMap; uniform float uDirt; uniform float uShine; uniform float uDull;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 cleanTx = texture2D(uCleanMap, vMapUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, cleanTx.rgb, cleanTx.a * (1.0 - uDirt));
          // bus dust: a soft, sandy-grey film over everything (colour drained, a little darker)
          float dl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dl) * vec3(0.92, 0.86, 0.76) * 0.86 + vec3(0.05, 0.045, 0.04), uDull * 0.75);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * uShine;`);
    };
    mat.customProgramCacheKey = () => 'washable';
    mat.needsUpdate = true;
  }

  /** a Diva pack: wash part of the dirt away, flash and sparkle */
  clean(amount = 0.25) {
    this.dirt = Math.max(0, this.dirt - amount); this.dull = Math.max(0, this.dull - 0.6);
    this.shine = 1;
    const chest = new THREE.Vector3(0, RUNNER_SCALE * 1.25, 0.2);
    this.sparkles.burst(chest, 8, 0xffffff, 1.6, 0.45);
    if (this.dirt === 0) this.sparkles.burst(chest, 16, 0xffe680, 2.6, 0.7);
  }

  /** hit a stain: the mud comes back */
  stain() {
    // all the original mud comes straight back (the model's own stains)
    this.dirt = 1; this.shine = 0; this.dirtShown = Math.max(this.dirtShown, 0.85);
    this.mud.burst(new THREE.Vector3(0, RUNNER_SCALE * 0.9, 0.3), 16, 0x5a3212, 2.4, 0.5);   // mud splashes up onto him
  }

  /** ran through bus smoke: he goes dusty and dull (fades as he runs on, or with a pack) */
  dust(amount = 0.3) {
    this.dirt = Math.min(1, this.dirt + amount); this.shine = 0; this.dull = 1; this.dustT = 0;
    this.dust3 = this.dust3 || new Sparkles(this.group, 18, true);
    this.dust3.keepColor = true; for (const it of this.dust3.items) it.s.material.color.set(0x8a7d6c);
    this.dust3.burst(new THREE.Vector3(0, RUNNER_SCALE * 1.2, 0.3), 14, 0x8a7d6c, 1.4, 0.6);
  }

  /** 0 = muddy … 1 = spotless, as shown on screen (for the shirt meter) */
  get cleanliness() { return 1 - this.dirtShown; }

  _updateShirt(dt) {
    // dust film fades over ~6 s; dust keeps drifting off him while it lasts
    if (this.dull > 0) {
      this.dull = Math.max(0, this.dull - dt / 6);
      this.dustT = (this.dustT || 0) - dt;
      if (this.dustT <= 0 && this.dust3) { this.dustT = 0.12;
        this.dust3.twinkle(new THREE.Vector3((Math.random() - 0.5) * RUNNER_SCALE * 0.7, RUNNER_SCALE * (0.5 + Math.random() * 1.0), 0.3), 0.35 + 0.35 * this.dull); }
    }
    this.shirtU.uDull.value = this.dull;
    this.dirtShown += (this.dirt - this.dirtShown) * Math.min(1, dt * (this.dirt > this.dirtShown ? 14 : 5));
    this.shine = Math.max(0, this.shine - dt * 2.2);
    const spotless = this.dirtShown < 0.05;
    // fully clean: a soft white aura and a twinkle on the shirt now and then
    const auraT = spotless ? 0.28 + 0.08 * Math.sin(this.runTime * 0.9) : 0;
    this.aura.material.opacity += (auraT + this.shine * 0.45 - this.aura.material.opacity) * Math.min(1, dt * 8);
    if (spotless) { this.twinkleT -= dt; if (this.twinkleT <= 0) { this.twinkleT = 0.18 + Math.random() * 0.25;
      this.sparkles.twinkle(new THREE.Vector3((Math.random() - 0.5) * RUNNER_SCALE * 0.6, RUNNER_SCALE * (0.95 + Math.random() * 0.55), 0.25), 0.32 + Math.random() * 0.2); } }
    this.sparkles.update(dt); this.mud.update(dt); if (this.dust3) this.dust3.update(dt);
    this.shirtU.uDirt.value = this.dirtShown;
    this.shirtU.uShine.value = this.shine * 0.55 + (spotless ? 0.08 : 0);
  }

  _placeholderBody() {
    const body = new THREE.Group();
    const blue = new THREE.MeshStandardMaterial({ color: 0x0a4fb5, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), white);
    torso.position.y = 0.95;
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.35, 12), blue);
    shorts.position.y = 0.55;
    body.add(torso, shorts);
    return body;
  }

  get laneX() { return (this.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH; }
  get isAirborne() { return this.jumpT >= 0; }

  moveLane(dir) { this.lane = THREE.MathUtils.clamp(this.lane + dir, 0, LANE_COUNT - 1); }
  jump() { if (this.jumpT < 0) this.jumpT = 0; }
  flinch() { this.hitT = 0; }

  reset() {
    this.lane = 1; this.x = 0; this.vx = 0; this.lean = 0; this.jumpT = -1; this.height = 0; this.hitT = -1;
    this.dirt = this.dirtShown = 1; this.shine = 0; this.dull = 0;
    this.group.position.set(0, 0, 0);
  }

  /**
   * Pose the skeleton. phase: stride phase; air: 0..1 jump tuck; hit: 0..1 flinch.
   * A sprint cycle: each leg drives the knee up in front, plants, pushes back,
   * then kicks the heel up behind as it recovers. Every curve is smooth in the
   * phase. Afterwards the body is lowered/raised so the lower foot meets the
   * road, which gives the natural bounce of running (down on each landing, up
   * through push-off).
   */
  _pose(phase, air, hit) {
    const B = this.bones; if (!B) return;
    const run = 1 - air;
    // Body height over the stride (model units): lowest as a foot passes under
    // the body, highest in the flight between steps.
    const bodyY = run * (-0.02 - 0.025 * Math.cos(2 * (phase - 3.45)));
    const tilt = 0.05 * run;                // pelvis tilt (hips rotation.x below)
    const roll = 0.04 * Math.cos(phase) * run;   // pelvis roll (hips rotation.z below)
    const leg = (ph, side) => {           // ph: this leg's phase; side: +1 left, -1 right
      const thigh = loopSpline(THIGH, ph);
      const kneeKey = loopSpline(KNEE, ph);
      const st = stanceWeight(ph);
      let knee = kneeKey, footWorld = 0;
      if (st > 0) {
        // stance: solve the knee so the sole sits exactly on the road (2-bone IK)
        footWorld = loopSpline(FOOT_WORLD, ph);
        const cw = Math.cos(footWorld), sw = Math.sin(footWorld);
        const ankleH = -Math.min(-0.12 * cw - 0.2 * sw, -0.12 * cw + 0.05 * sw);   // lowest of toe / heel
        const tw = thigh + tilt;                                                   // thigh angle in the body
        const T = this.thighV, Sv = this.shinV;
        const thighDrop = -(T.y * Math.cos(tw) - T.z * Math.sin(tw));
        const need = this.hipH + side * this.thighX * Math.sin(roll) + bodyY - ankleH - thighDrop;   // drop the shin must make
        // shin drop = -(Sv.y cos ψ - Sv.z sin ψ) = R cos(ψ + δ)
        const R = Math.hypot(Sv.y, Sv.z), dl = Math.atan2(-Sv.z, -Sv.y);
        const c = THREE.MathUtils.clamp(need / R, -1, 1);
        const sgn = thigh + kneeKey >= 0 ? 1 : -1;
        const psi = sgn * Math.acos(c) - dl;
        const kneeIK = Math.max(0.02, psi - tw);
        knee = st * kneeIK + (1 - st) * kneeKey;
      }
      const foot = st * (footWorld - tilt - thigh - knee) + (1 - st) * loopSpline(FOOT_SWING, ph);
      return [thigh, knee, foot];
    };
    this._bodyY = bodyY;
    const [tL, kL, fL] = leg(phase, 1), [tR, kR, fR] = leg(phase + Math.PI, -1);
    const s = Math.sin(phase), c = Math.cos(phase);

    // pelvis twists with the legs; shoulders counter-twist (very visible from behind)
    B.hips.position.y = this.hipsRestY;
    const yaw = 0.13 * s * run;                       // hips swing with the legs
    B.hips.rotation.set(tilt, yaw, roll);
    // shoulders counter-twist against the hips and the torso rocks with each step
    const spYaw = -0.12 * s * run, spRoll = -0.045 * c * run, chYaw = -0.16 * s * run, chRoll = -0.045 * c * run;
    const pulse = 0.05 * Math.cos(2 * (phase - 3.45)) * run;   // dips forward as each foot lands
    B.spine.rotation.set(0.26 * run + pulse + 0.1 * air - 0.25 * hit, spYaw, spRoll);   // leaning into the run
    B.chest.rotation.set(0.1 * run, chYaw, chRoll);
    B.neck.rotation.set(-0.15 * run - pulse * 0.6, 0.16 * s * run, 0.03 * c * run);   // head stays facing ahead
    B.head.rotation.set(-0.18 * run - pulse * 0.4 + 0.2 * hit, 0.14 * s * run, 0.04 * c * run);

    // thighs undo the pelvis yaw and roll, so each leg swings straight
    // forward and back (no sideways swing of the feet)
    B.thigh_L.rotation.set(run * tL + air * -1.0, -yaw, -roll);
    B.thigh_R.rotation.set(run * tR + air * -0.55, -yaw, -roll);
    B.shin_L.rotation.set(run * kL + air * 1.5, 0, 0);
    B.shin_R.rotation.set(run * kR + air * 0.9, 0, 0);
    B.foot_L.rotation.set(run * fL + air * 0.3, 0, 0);
    B.foot_R.rotation.set(run * fR + air * 0.3, 0, 0);

    // arms: a sprinter's pump, exactly opposite the legs (left arm forward as
    // the right knee drives up). Shaped sine: quick through the middle, a
    // brief hold at each end, so the arms punch rather than float. Front:
    // glove up by the chin, elbow tight; back: glove past the hip, elbow open.
    // The upper arms undo the shoulder twist/roll so they never cross the body.
    const raw = Math.sin(phase - 3.0);                                  // +1: left arm forward
    const aw = Math.sign(raw) * Math.abs(raw) ** 0.6;
    const shYaw = yaw + spYaw + chYaw, shRoll = roll + spRoll + chRoll;
    const swingL = 0.2 - 0.85 * aw, swingR = 0.2 + 0.85 * aw;          // -0.65 forward … +1.05 back
    const elbow = (f) => -1.3 - 0.12 * Math.max(0, f) + 0.35 * Math.max(0, -f);   // ~85° in front (glove at chest, not the face), opens behind
    const out = (f) => 0.1 * Math.max(0, -f);                                       // back swing passes beside the hip, not behind it
    // the arms go with a quarter of the shoulder turn (they hang from the shoulders) but never swing across the body
    B.upperarm_L.rotation.set(run * swingL + air * -1.1 + hit * 0.4, -0.75 * shYaw * run, 0.2 + out(aw) - 0.75 * shRoll + air * 0.3);
    B.upperarm_R.rotation.set(run * swingR + air * -1.1 + hit * 0.4, -0.75 * shYaw * run, -0.2 - out(-aw) - 0.75 * shRoll - air * 0.3);
    B.forearm_L.rotation.set(run * elbow(aw) + air * -1.3, 0, -0.08);
    B.forearm_R.rotation.set(run * elbow(-aw) + air * -1.3, 0, 0.08);
    B.hand_L.rotation.set(-0.1, 0, 0);
    B.hand_R.rotation.set(-0.1, 0, 0);

    this._ground(run);
  }

  /** Place the body at the stride height; lift it if a foot would sink into the road. */
  _ground(run) {
    if (!this.footPts) return;
    this.body.position.y = 0;
    this.group.updateMatrixWorld(true);
    let min = Infinity;
    for (const [bone, pts] of this.footPts) for (const p of pts) { this._v.copy(p).applyMatrix4(bone.matrixWorld); min = Math.min(min, this._v.y); }
    const sink = -(min - this.group.position.y);              // > 0: a foot is below the road
    this.body.position.y = Math.max(this._bodyY * RUNNER_SCALE, sink * run);
  }

  update(dt, speed) {
    // Lane change: a critically damped glide (eases out and in) instead of a
    // constant-speed slide; capped so it never lags behind the old feel.
    const target = this.laneX;
    const w = 13;                                            // stiffness
    this.vx += ((target - this.x) * w * w - 2 * w * this.vx) * dt;
    this.vx = THREE.MathUtils.clamp(this.vx, -LANE_SWITCH_SPEED * 1.6, LANE_SWITCH_SPEED * 1.6);
    this.x += this.vx * dt;
    if (Math.abs(target - this.x) < 0.002 && Math.abs(this.vx) < 0.02) { this.x = target; this.vx = 0; }

    // Jump arc
    let air = 0;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const t = this.jumpT / JUMP.duration;
      if (t >= 1) { this.jumpT = -1; this.height = 0; }
      else { this.height = JUMP.height * 4 * t * (1 - t); air = Math.sin(Math.PI * t); }
    }
    let hit = 0;
    if (this.hitT >= 0) { this.hitT += dt; hit = Math.max(0, 1 - this.hitT / 0.35); if (this.hitT > 0.35) this.hitT = -1; }

    // Stride rate follows speed (eased, so speed-ups never make the legs jump),
    // capped so the legs never blur.
    const rate = THREE.MathUtils.clamp(9.5 + speed * 0.3, 14, 18);   // ~4.6 steps/s at the start speed, up to ~5.7 at top speed (a sprint)
    this.strideRate += (rate - this.strideRate) * Math.min(1, dt * 3);
    this.runTime += dt * this.strideRate;

    if (this.bones) {
      this._pose(this.runTime, air, hit);
      // lean into lane changes, from the sideways velocity, eased
      const leanT = THREE.MathUtils.clamp(-this.vx * 0.022, -0.2, 0.2);
      this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
      this.body.rotation.z = this.lean;
      this.body.rotation.x = 0;
    } else {
      this.body.position.y = this.isAirborne ? 0 : Math.abs(Math.sin(this.runTime)) * 0.08;
      this.body.rotation.z = THREE.MathUtils.clamp(-this.vx * 0.03, -0.3, 0.3);
    }

    this.group.position.set(this.x, this.height, 0);
    this._updateShirt(dt);
    this.shadow.position.y = -this.height + 0.02;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - this.height * 0.25));
  }
}
