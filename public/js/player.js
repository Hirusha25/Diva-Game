import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT, LANE_SWITCH_SPEED, JUMP } from './config.js';

const MODEL_HEIGHT = (typeof window !== 'undefined' && window.__DIVA_RUNNER_H) || 2.55;   // metres, feet to top of hair (larger than life so he reads well on a phone)
const RUNNER_SCALE = MODEL_HEIGHT / 2;     // the rigged model is 2 units tall, feet at y = -1
const SIZE = MODEL_HEIGHT / 1.55;          // relative to the original size (shadow etc.)

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
  constructor(scene, model = null) {
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

    this.body = model ? this._rigged(model) : this._placeholderBody();
    this.group.add(this.body);

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
      if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.side = THREE.FrontSide; } }
    });
    turn.add(model); holder.add(turn);
    const b = (n) => model.getObjectByName(n);
    this.bones = {};
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head',
      'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L',
      'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R']) this.bones[n] = b(n);
    this.hipsRestY = this.bones.hips.position.y;
    return holder;
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
    this.group.position.set(0, 0, 0);
  }

  /**
   * Pose the skeleton. phase: stride phase; air: 0..1 jump tuck; hit: 0..1 flinch.
   * Every curve is a smooth function of the phase (no |x| or max(0, x) kinks),
   * so the cycle flows without snaps at any frame rate.
   */
  _pose(phase, air, hit) {
    const B = this.bones; if (!B) return;
    const s = Math.sin(phase), c = Math.cos(phase);
    const run = 1 - air;
    // knee bend peaks as each leg swings through, eases to nearly straight at push-off
    const flexL = ((1 + Math.cos(phase - 0.5)) / 2) ** 2, flexR = ((1 - Math.cos(phase - 0.5)) / 2) ** 2;

    // pelvis: two soft bobs per cycle (one per step), gentle twist
    B.hips.position.y = this.hipsRestY + run * (0.028 * c * c - 0.01) - air * 0.02;
    B.hips.rotation.set(0, 0.12 * s * run, 0.03 * c * run);
    // torso leans into the run, counter-twists the hips, head stays steady
    B.spine.rotation.set(0.1 * run + 0.1 * air - 0.25 * hit + 0.02 * Math.cos(2 * phase) * run, -0.07 * s * run, 0);
    B.chest.rotation.set(0.06 * run, -0.08 * s * run, -0.02 * c * run);
    B.neck.rotation.set(-0.06, 0.06 * s * run, 0);
    B.head.rotation.set(-0.12 * run + 0.2 * hit - 0.02 * Math.cos(2 * phase) * run, 0.07 * s * run, 0.02 * c * run);

    // legs: thigh swing, knee folds through the swing, foot follows
    B.thigh_L.rotation.set(run * -0.68 * s + air * -1.0, 0, 0.03);
    B.thigh_R.rotation.set(run * 0.68 * s + air * -0.55, 0, -0.03);
    B.shin_L.rotation.set(run * (0.18 + 1.15 * flexL) + air * 1.5, 0, 0);
    B.shin_R.rotation.set(run * (0.18 + 1.15 * flexR) + air * 0.9, 0, 0);
    B.foot_L.rotation.set(run * (-0.18 * s - 0.2 * flexL + 0.1) + air * 0.3, 0, 0);
    B.foot_R.rotation.set(run * (0.18 * s - 0.2 * flexR + 0.1) + air * 0.3, 0, 0);

    // arms: boxer's guard swinging opposite the legs, slightly behind the legs'
    // timing (follow-through); gloves (rigid) stay up in front
    const guard = -0.55, swing = 0.36, sa = Math.sin(phase - 0.25);
    B.upperarm_L.rotation.set(guard + run * swing * sa + air * -0.9 + hit * 0.4, 0, 0.16 + air * 0.25);
    B.upperarm_R.rotation.set(guard - run * swing * sa + air * -0.9 + hit * 0.4, 0, -0.16 - air * 0.25);
    B.forearm_L.rotation.set(-1.72 + run * 0.12 * sa - air * 0.2, 0, -0.1);
    B.forearm_R.rotation.set(-1.72 - run * 0.12 * sa - air * 0.2, 0, 0.1);
    B.hand_L.rotation.set(-0.15 + 0.05 * Math.cos(2 * phase) * run, 0, 0);
    B.hand_R.rotation.set(-0.15 + 0.05 * Math.cos(2 * phase) * run, 0, 0);
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
    const rate = THREE.MathUtils.clamp(6.2 + speed * 0.2, 8, 12);
    this.strideRate += (rate - this.strideRate) * Math.min(1, dt * 3);
    this.runTime += dt * this.strideRate;

    if (this.bones) {
      this._pose(this.runTime, air, hit);
      this.body.position.y = 0;
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
    this.shadow.position.y = -this.height + 0.02;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - this.height * 0.25));
  }
}
