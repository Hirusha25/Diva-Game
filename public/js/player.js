import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT, LANE_SWITCH_SPEED, JUMP } from './config.js';
import { Sparkles, glowTexture, additive } from './fx.js';

const MODEL_HEIGHT = (typeof window !== 'undefined' && window.__DIVA_RUNNER_H) || 2.95;   // metres, feet to top of hair (larger than life so he reads well on a phone)
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
  constructor(scene, model = null, cleanMap = null, outfitMap = null) {
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
    this.grime = 0.25; this.dirt = 0.83; this.dirtShown = 0.83; this.grimeShown = 0.25; this.extra = 0; this.tint = 0; this.shine = 0; this.twinkleT = 0;
    this.shirtU = { uDirt: { value: 1 }, uShine: { value: 0 }, uDull: { value: 0 }, uExtra: { value: 0 }, uTint: { value: 0 }, uCleanMap: { value: cleanMap }, uOutfitMap: { value: outfitMap } };
    if (outfitMap) { outfitMap.flipY = false; outfitMap.colorSpace = THREE.NoColorSpace; }
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
      if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.side = THREE.FrontSide; if (this.shirtU.uCleanMap.value && this.shirtU.uOutfitMap.value) this._washable(o.material); } }
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
      sh.fragmentShader = 'uniform sampler2D uCleanMap; uniform sampler2D uOutfitMap; uniform float uDirt; uniform float uShine; uniform float uDull; uniform float uExtra; uniform float uTint;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 cleanTx = texture2D(uCleanMap, vMapUv);
          // progressive wash: each patch of the shirt has its own turn, so stains vanish
          // splash by splash as packs are collected (not all fading together)
          // smooth value noise (two octaves) gives each area its turn, with soft organic edges
          vec2 q = vMapUv * 14.0; vec2 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
          #define H2(p) fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743)
          float n1 = mix(mix(H2(qi), H2(qi + vec2(1, 0)), qf.x), mix(H2(qi + vec2(0, 1)), H2(qi + vec2(1, 1)), qf.x), qf.y);
          vec2 r = vMapUv * 37.0; vec2 ri = floor(r), rf = fract(r); rf = rf * rf * (3.0 - 2.0 * rf);
          float n2 = mix(mix(H2(ri), H2(ri + vec2(1, 0)), rf.x), mix(H2(ri + vec2(0, 1)), H2(ri + vec2(1, 1)), rf.x), rf.y);
          float turn = clamp((n1 * 0.75 + n2 * 0.25 - 0.2) / 0.6, 0.0, 1.0) * 0.9 + 0.05;
          float washed = smoothstep(turn - 0.1, turn + 0.1, 1.0 - uDirt);
          diffuseColor.rgb = mix(diffuseColor.rgb, cleanTx.rgb, cleanTx.a * washed);
          // bus dust: a sandy-grey film over the whole runner, heaviest on the
          // t-shirt and shorts, with a grainy speckle so it reads as dust
          float dl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float outfitK = texture2D(uOutfitMap, vMapUv).r;
          float grain = fract(sin(dot(floor(vMapUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 dustCol = vec3(dl) * vec3(0.9, 0.82, 0.7) * 0.72 + vec3(0.1, 0.08, 0.06) - grain * 0.09;
          diffuseColor.rgb = mix(diffuseColor.rgb, dustCol, uDull * mix(0.5, 0.9, outfitK));
          // extra mud from repeated stains: splatters (big blobs + small specks) on the outfit, more as uExtra grows
          if (uExtra > 0.001) {
            float splat = 0.0;
            for (int L = 0; L < 2; L++) {
              float sc = L == 0 ? 14.0 : 38.0;
              vec2 g = vMapUv * sc; vec2 cell = floor(g);
              for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
                vec2 c = cell + vec2(float(i), float(j));
                float h1 = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
                float h2 = fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453);
                float h3 = fract(sin(dot(c, vec2(419.2, 371.9))) * 43758.5453);
                if (h3 > uExtra * (L == 0 ? 0.75 : 0.9)) continue;          // more blobs switch on as the mud builds up
                vec2 ctr = c + vec2(h1, h2);
                float r = (L == 0 ? 0.32 : 0.22) * (0.55 + 0.6 * h1);
                vec2 d = g - ctr; d.x *= 0.8 + 0.5 * h2;
                float an = atan(d.y, d.x); float wob = 1.0 + 0.1 * sin(an * 3.0 + h3 * 20.0) + 0.06 * sin(an * 7.0 + h1 * 9.0);
                splat = max(splat, smoothstep(r * wob, r * wob * 0.7, length(d)));
              }
            }
            float m = splat * outfitK;
            vec3 mud = vec3(0.21, 0.075, 0.018) * (0.75 + 0.4 * grain);   // the model's own mud brown (linear)
            diffuseColor.rgb = mix(diffuseColor.rgb, mud, m * 0.92);
          }
          // the last stage: the whole white shirt (and shorts) turns a grimy brown
          if (uTint > 0.001) {
            vec3 grimy = diffuseColor.rgb * vec3(0.62, 0.48, 0.33) * (0.85 + 0.25 * grain);
            diffuseColor.rgb = mix(diffuseColor.rgb, grimy, uTint * outfitK);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * uShine;`);
    };
    mat.customProgramCacheKey = () => 'washable';
    mat.needsUpdate = true;
  }

  /**
   * Shirt grime, 0 (spotless) … 1 (ruined). It drives three stages on the
   * outfit: the stains (0–0.3), extra mud splatters (0.3–0.7) and a grimy
   * brown tint over the whole shirt (0.6–1). Obstacles add grime, Diva packs
   * wash it off; at 1 the shirt is ruined (main.js drops a shirt).
   */
  _applyGrime() {
    const g = this.grime;
    this.dirt = Math.min(1, g / 0.3);
    this.extra = Math.max(0, Math.min(1, (g - 0.3) / 0.4));
    this.tint = Math.max(0, Math.min(1, (g - 0.6) / 0.4));
  }

  /** a Diva pack: wash a stage of grime away, flash and sparkle */
  clean(amount = 0.12) {
    this.grime = Math.max(0, this.grime - amount); this._applyGrime();
    this.dull = Math.max(0, this.dull - 0.34);
    this.shine = 1;
    const chest = new THREE.Vector3(0, RUNNER_SCALE * 1.25, 0.2);
    this.sparkles.burst(chest, 8, 0xffffff, 1.6, 0.45);
    if (this.grime === 0) this.sparkles.burst(chest, 16, 0xffe680, 2.6, 0.7);
  }

  /** an obstacle: more grime. Returns true when the shirt is ruined. */
  stain(amount = 0.28) {
    this.grime = Math.min(1, this.grime + amount); this._applyGrime(); this.shine = 0;
    this.mud.burst(new THREE.Vector3(0, RUNNER_SCALE * 0.9, 0.3), 16, 0x5a3212, 2.4, 0.5);   // mud splashes up onto him
    return this.grime >= 1;
  }

  /** a fresh white shirt (after one is ruined, or the flower bonus) */
  freshShirt() {
    this.grime = 0; this._applyGrime(); this.dull = 0; this.shine = 1;
    this.dirtShown = this.extraShown = this.tintShown = 0;
    this.sparkles.burst(new THREE.Vector3(0, RUNNER_SCALE * 1.25, 0.2), 18, 0xffffff, 2.6, 0.6);
  }

  /** ran through bus smoke: dusty all over (until Diva packs wash it off), and some grime */
  dust(amount = 0.18) {
    this.grime = Math.min(1, this.grime + amount); this._applyGrime(); this.shine = 0; this.dull = 1; this.dustT = 0;
    this.dust3 = this.dust3 || new Sparkles(this.group, 18, true);
    this.dust3.keepColor = true; for (const it of this.dust3.items) it.s.material.color.set(0x8a7d6c);
    this.dust3.burst(new THREE.Vector3(0, RUNNER_SCALE * 1.2, 0.3), 14, 0x8a7d6c, 1.4, 0.6);
    return this.grime >= 1;
  }

  /** 0 = muddy … 1 = spotless, as shown on screen (for the shirt meter) */
  get cleanliness() { return 1 - Math.max(this.grimeShown ?? this.grime, (this.dullShown || 0) * 0.3); }

  _updateShirt(dt) {
    // the dust stays until packs wash it off (shown easing in/out); dust keeps drifting off him meanwhile
    this.dullShown = (this.dullShown || 0) + (this.dull - (this.dullShown || 0)) * Math.min(1, dt * 4);
    if (this.dull > 0) {
      this.dustT = (this.dustT || 0) - dt;
      if (this.dustT <= 0 && this.dust3) { this.dustT = 0.1 + 0.15 * (1 - this.dull);
        this.dust3.twinkle(new THREE.Vector3((Math.random() - 0.5) * RUNNER_SCALE * 0.7, RUNNER_SCALE * (0.5 + Math.random() * 1.0), 0.3), 0.35 + 0.35 * this.dull); }
    }
    this.shirtU.uDull.value = this.dullShown;
    this.extraShown = (this.extraShown || 0) + ((this.extra || 0) - (this.extraShown || 0)) * Math.min(1, dt * 6);
    this.shirtU.uExtra.value = this.extraShown;
    this.tintShown = (this.tintShown || 0) + ((this.tint || 0) - (this.tintShown || 0)) * Math.min(1, dt * 5);
    this.shirtU.uTint.value = this.tintShown;
    this.grimeShown = (this.grimeShown ?? this.grime) + (this.grime - (this.grimeShown ?? this.grime)) * Math.min(1, dt * 6);
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
    this._spr = null;
    this.lane = 1; this.x = 0; this.vx = 0; this.lean = 0; this.jumpT = -1; this.height = 0; this.hitT = -1;
    this.grime = 0.25; this._applyGrime(); this.dirtShown = this.dirt; this.grimeShown = this.grime; this.shine = 0; this.dull = this.dullShown = 0; this.extraShown = this.tintShown = 0;   // starts with a few stains to wash
    this.group.position.set(0, 0, 0);
  }

  /**
   * Smooth leg curves: the approved keyframed run (with its stance leg-solve)
   * sampled once and reduced to its first five harmonics. A truncated Fourier
   * series is smooth everywhere, so no joint can snap or stall.
   */
  _buildGait() {
    const N = 256, H = 5, bodyY = -0.008, tilt = 0.05;
    const samples = [[], [], []];
    for (let i = 0; i < N; i++) { const ph = (i / N) * Math.PI * 2; const v = this._legRaw(ph, 1, bodyY - 0.007 * Math.cos(2 * (ph - 3.45)), tilt, 0.04 * Math.cos(ph));
      for (let k = 0; k < 3; k++) samples[k].push(v[k]); }
    this.gait = samples.map((arr) => { const c = { a0: arr.reduce((x, y) => x + y, 0) / N, a: [], b: [] };
      for (let h = 1; h <= H; h++) { let sa = 0, sb = 0; arr.forEach((v, i) => { const t = (i / N) * Math.PI * 2 * h; sa += v * Math.cos(t); sb += v * Math.sin(t); }); c.a.push(2 * sa / N); c.b.push(2 * sb / N); }
      return c; });
  }

  _gaitAt(k, ph) { const c = this.gait[k]; let v = c.a0; for (let h = 0; h < c.a.length; h++) v += c.a[h] * Math.cos((h + 1) * ph) + c.b[h] * Math.sin((h + 1) * ph); return v; }

  /** the original keyframed leg (with stance IK), only sampled once to build the smooth curves */
  _legRaw(ph, side, bodyY, tilt, roll) {
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
    }

  /**
   * Pose the skeleton. phase: stride phase; air: 0..1 jump tuck; hit: 0..1 flinch.
   * Every joint follows a smooth periodic curve of the phase; the body height
   * then comes from the planted foot (a soft minimum over both feet), which
   * gives an even, natural bounce with no pops.
   */
  _pose(phase, air, hit) {
    const B = this.bones; if (!B) return;
    if (!this.gait) this._buildGait();
    this._phase = phase;
    const run = 1 - air;
    const tilt = 0.05 * run;
    // the pelvis drops on the swinging side and the hips swing with the legs
    const roll = 0.035 * Math.cos(phase) * run;   // small, as in the approved legs (more makes one leg look long)
    const s = Math.sin(phase), c = Math.cos(phase);
    const legL = [0, 1, 2].map((k) => this._gaitAt(k, phase)), legR = [0, 1, 2].map((k) => this._gaitAt(k, phase + Math.PI));

    B.hips.position.y = this.hipsRestY;
    const yaw = 0.17 * s * run;
    B.hips.rotation.set(tilt, yaw, roll);
    this._sway = 0.022 * RUNNER_SCALE * Math.cos(phase) * run;   // weight shifts over the foot on the ground
    // shoulders turn clearly against the hips and the torso sways with each step (reference style)
    const spYaw = -0.13 * s * run, spRoll = -0.06 * c * run, chYaw = -0.18 * s * run, chRoll = -0.02 * c * run;
    B.spine.rotation.set(0.16 * run + 0.1 * air - 0.25 * hit, spYaw, spRoll);
    B.chest.rotation.set(0.08 * run, chYaw, chRoll);
    B.neck.rotation.set(-0.13 * run, 0.12 * s * run, 0.02 * c * run);
    B.head.rotation.set(-0.15 * run + 0.2 * hit, 0.1 * s * run, 0.02 * c * run);

    B.thigh_L.rotation.set(run * legL[0] + air * -1.0, -yaw, -roll);
    B.thigh_R.rotation.set(run * legR[0] + air * -0.55, -yaw, -roll);
    B.shin_L.rotation.set(run * legL[1] + air * 1.5, 0, 0);
    B.shin_R.rotation.set(run * legR[1] + air * 0.9, 0, 0);
    B.foot_L.rotation.set(run * legL[2] + air * 0.3, 0, 0);
    B.foot_R.rotation.set(run * legR[2] + air * 0.3, 0, 0);

    // arms: a natural running swing with follow-through. Opposite the legs;
    // the forward drive is a little quicker than the return (second harmonic);
    // the forearm trails the upper arm and the wrist trails the forearm, so
    // the elbow folds as the arm comes forward and opens as it drives back;
    // the hands come slightly in towards the chest in front and pass beside
    // the hip behind; the shoulders lift a touch with each forward swing.
    // Everything is a smooth function of the phase.
    const shYaw = yaw + spYaw + chYaw, shRoll = roll + spRoll + chRoll;
    const arm = (a, side) => {   // a: this arm's phase; side +1 left, -1 right
      const f = Math.sin(a);                                           // +1 forward … −1 back (even, pendulum-like)
      const lag = Math.sin(a - 0.6);                                   // forearm follow-through
      const wrist = Math.sin(a - 0.9);                                 // wrist follows the forearm, gently
      const fwd = (1 + Math.sin(a)) / 2;                               // 1 at the front of the swing
      return {
        swing: 0.2 - 0.66 * f,
        across: side * (-0.06 * fwd),                                  // in towards the chest in front
        lift: 0.04 * fwd,                                              // shoulder rises a little in front
        out: 0.03 + 0.02 * (1 - fwd),                                  // arms tucked close to the body (elbows by the ribs)
        elbow: -1.42 - 0.28 * lag,                                     // about a right angle, folding a little as it comes forward
        hand: -0.12 + 0.07 * wrist,
        handRoll: side * 0.03 * Math.sin(a - 0.9),
      };
    };
    const aL = arm(phase - 2.55, 1), aR = arm(phase - 2.55 + Math.PI, -1);   // a touch ahead: the loose-arm spring brings it back in time with the legs
    B.upperarm_L.rotation.set(run * aL.swing + air * -1.1 + hit * 0.4, (-0.75 * shYaw + aL.across) * run, 0.2 - 0.08 * run + (aL.out + aL.lift) * run - 0.75 * shRoll + air * 0.3);
    B.upperarm_R.rotation.set(run * aR.swing + air * -1.1 + hit * 0.4, (-0.75 * shYaw + aR.across) * run, -0.2 + 0.08 * run - (aR.out + aR.lift) * run - 0.75 * shRoll - air * 0.3);
    B.forearm_L.rotation.set(run * aL.elbow + air * -1.3, 0, -0.08 - 0.22 * run);   // hands in towards the body
    B.forearm_R.rotation.set(run * aR.elbow + air * -1.3, 0, 0.08 + 0.22 * run);
    B.hand_L.rotation.set(run * aL.hand - 0.1 * air, 0, run * aL.handRoll);
    B.hand_R.rotation.set(run * aR.hand - 0.1 * air, 0, run * aR.handRoll);

    this._ground(run);
  }

  /**
   * Loose arms: each arm joint follows its posed angle through a soft,
   * slightly bouncy spring (shoulder stiffest, wrist loosest), so the arms
   * lag a touch, carry their weight and settle at each end of the swing
   * instead of tracking the curve rigidly.
   */
  _looseArms(dt) {
    const B = this.bones; if (!B || dt <= 0) return;
    const spec = { upperarm: [31, 0.62], forearm: [24, 0.5], hand: [18, 0.45] };   // [natural freq (rad/s), damping]: well above the arm swing, so it only adds a loose lag and settle
    this._spr = this._spr || {};
    const h = Math.min(dt, 1 / 30), steps = Math.max(1, Math.ceil(h / (1 / 120))), sub = h / steps;
    for (const side of ['L', 'R']) for (const part of ['upperarm', 'forearm', 'hand']) {
      const bone = B[`${part}_${side}`]; const [w, z] = spec[part];
      for (const ax of ['x', 'y', 'z']) {
        const key = `${part}${side}${ax}`, target = bone.rotation[ax];
        let st = this._spr[key]; if (!st) st = this._spr[key] = { v: target, d: 0 };
        for (let i = 0; i < steps; i++) { const acc = w * w * (target - st.v) - 2 * z * w * st.d; st.d += acc * sub; st.v += st.d * sub; }
        bone.rotation[ax] = st.v;
      }
    }
  }

  /** body height: a light even bounce, softly lifted whenever a foot would dip below the road */
  _ground(run) {
    if (!this.footPts) return;
    this.body.position.y = 0;
    this.group.updateMatrixWorld(true);
    const low = this.footPts.map(([bone, pts]) => Math.min(...pts.map((p) => this._v.copy(p).applyMatrix4(bone.matrixWorld).y)) - this.group.position.y);
    const sink = -Math.min(low[0], low[1]);                            // > 0: a foot would be below the road
    const ph = this._phase ?? 0;
    const bob = RUNNER_SCALE * (-0.0135 - 0.006 * Math.cos(2 * (ph - 3.45)));   // light, even bounce, lowest as each foot is under him
    const k = 0.012;                                                   // smooth maximum: lift only as much as needed, softly
    const lift = k * Math.log(Math.exp(bob / k) + Math.exp(sink / k));
    this.body.position.y = lift * run;
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
    const rate = THREE.MathUtils.clamp(8.6 + speed * 0.27, 12.9, 15.8);   // a steady run: ~4.1 steps/s at the start, ~5 at top speed, matched to the road speed
    this.strideRate += (rate - this.strideRate) * Math.min(1, dt * 3);
    this.runTime += dt * this.strideRate;

    if (this.bones) {
      this._pose(this.runTime, air, hit);
      this._looseArms(dt);
      // lean into lane changes, from the sideways velocity, eased
      const leanT = THREE.MathUtils.clamp(-this.vx * 0.022, -0.2, 0.2);
      this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
      this.body.rotation.z = this.lean;
      this.body.position.x = this._sway || 0;   // side-to-side weight shift
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
