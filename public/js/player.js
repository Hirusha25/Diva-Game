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
    // heel and toe of each foot, in the foot bone's space (model units)
    const pts = () => [new THREE.Vector3(0, -0.12, -0.05), new THREE.Vector3(0, -0.12, 0.2)];
    this.footPts = [[this.bones.foot_L, pts()], [this.bones.foot_R, pts()]];
    this._v = new THREE.Vector3();
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
   * A sprint cycle: each leg drives the knee up in front, plants, pushes back,
   * then kicks the heel up behind as it recovers. Every curve is smooth in the
   * phase. Afterwards the body is lowered/raised so the lower foot meets the
   * road, which gives the natural bounce of running (down on each landing, up
   * through push-off).
   */
  _pose(phase, air, hit) {
    const B = this.bones; if (!B) return;
    const run = 1 - air;
    const leg = (ph) => {                 // ph: this leg's phase
      const sn = Math.sin(ph);
      const thigh = -0.3 - 0.85 * sn;                                  // -1.15 knee up … +0.55 pushed back
      const kick = ((1 + Math.cos(ph + 0.35)) / 2) ** 2.2;             // heel kick during recovery
      const shin = 0.22 + 2.05 * kick;
      const foot = 0.25 * Math.cos(ph) - 0.35 * kick + 0.12;           // toe-off, then foot tucks
      return [thigh, shin, foot];
    };
    const [tL, kL, fL] = leg(phase), [tR, kR, fR] = leg(phase + Math.PI);
    const s = Math.sin(phase), c = Math.cos(phase);

    // pelvis twists with the legs; shoulders counter-twist (very visible from behind)
    B.hips.position.y = this.hipsRestY;
    B.hips.rotation.set(0.05 * run, 0.2 * s * run, 0.05 * c * run);
    B.spine.rotation.set(0.2 * run + 0.1 * air - 0.25 * hit, -0.14 * s * run, -0.03 * c * run);
    B.chest.rotation.set(0.1 * run, -0.2 * s * run, -0.03 * c * run);
    B.neck.rotation.set(-0.12 * run, 0.12 * s * run, 0);
    B.head.rotation.set(-0.16 * run + 0.2 * hit, 0.1 * s * run, 0.03 * c * run);

    B.thigh_L.rotation.set(run * tL + air * -1.0, 0, 0.04);
    B.thigh_R.rotation.set(run * tR + air * -0.55, 0, -0.04);
    B.shin_L.rotation.set(run * kL + air * 1.5, 0, 0);
    B.shin_R.rotation.set(run * kR + air * 0.9, 0, 0);
    B.foot_L.rotation.set(run * fL + air * 0.3, 0, 0);
    B.foot_R.rotation.set(run * fR + air * 0.3, 0, 0);

    // arms: boxer's guard pumping hard, opposite to the legs, slight follow-through
    const sa = Math.sin(phase - 0.2);
    B.upperarm_L.rotation.set(-0.5 + run * 0.62 * sa + air * -0.9 + hit * 0.4, 0, 0.2 + air * 0.25);
    B.upperarm_R.rotation.set(-0.5 - run * 0.62 * sa + air * -0.9 + hit * 0.4, 0, -0.2 - air * 0.25);
    B.forearm_L.rotation.set(-1.65 - run * 0.3 * Math.max(-0.4, sa) - air * 0.2, 0, -0.12);
    B.forearm_R.rotation.set(-1.65 - run * 0.3 * Math.max(-0.4, -sa) - air * 0.2, 0, 0.12);
    B.hand_L.rotation.set(-0.15, 0, 0);
    B.hand_R.rotation.set(-0.15, 0, 0);

    this._ground(run);
  }

  /** Raise/lower the body so the lowest heel or toe touches the road (on the ground only). */
  _ground(run) {
    if (!this.footPts) return;
    this.body.position.y = 0;
    this.group.updateMatrixWorld(true);
    let min = Infinity;
    for (const [bone, pts] of this.footPts) for (const p of pts) { this._v.copy(p).applyMatrix4(bone.matrixWorld); min = Math.min(min, this._v.y); }
    const off = -(min - this.group.position.y);
    this.body.position.y = off * run;
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
