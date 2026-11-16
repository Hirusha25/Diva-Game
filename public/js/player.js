import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT, LANE_SWITCH_SPEED, JUMP } from './config.js';

/**
 * The runner. Currently a PLACEHOLDER capsule in Diva colours; swap the
 * `body` group for the real boy/girl character model when it arrives.
 */
export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.lane = 1;                       // 0..LANE_COUNT-1, 1 = centre
    this.x = 0;
    this.jumpT = -1;                     // -1 = on the ground
    this.height = 0;
    this.runTime = 0;

    this.body = this._placeholderBody();
    this.group.add(this.body);

    // Soft blob shadow (no shadow maps on mobile).
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.position.y = 0.02;
    this.shadow = shadow;
    this.group.add(shadow);
  }

  _placeholderBody() {
    const body = new THREE.Group();
    const blue = new THREE.MeshStandardMaterial({ color: 0x0a4fb5, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), white);
    torso.position.y = 0.95;
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.35, 12), blue);
    shorts.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skin);
    head.position.y = 1.62;
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), blue);
    const gloveR = gloveL.clone();
    gloveL.position.set(-0.42, 1.0, 0.1);
    gloveR.position.set(0.42, 1.0, 0.1);
    body.add(torso, shorts, head, gloveL, gloveR);
    this.gloves = [gloveL, gloveR];
    return body;
  }

  get laneX() { return (this.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH; }
  get isAirborne() { return this.jumpT >= 0; }

  moveLane(dir) {
    this.lane = THREE.MathUtils.clamp(this.lane + dir, 0, LANE_COUNT - 1);
  }

  jump() {
    if (this.jumpT < 0) this.jumpT = 0;
  }

  reset() {
    this.lane = 1; this.x = 0; this.jumpT = -1; this.height = 0;
    this.group.position.set(0, 0, 0);
  }

  update(dt, speed) {
    // Lane slide
    const target = this.laneX;
    const step = LANE_SWITCH_SPEED * dt;
    this.x += THREE.MathUtils.clamp(target - this.x, -step, step);

    // Jump arc
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const t = this.jumpT / JUMP.duration;
      if (t >= 1) { this.jumpT = -1; this.height = 0; }
      else this.height = JUMP.height * 4 * t * (1 - t);
    }

    // Run bob + lean into lane changes
    this.runTime += dt * speed * 0.9;
    const bob = this.isAirborne ? 0 : Math.abs(Math.sin(this.runTime)) * 0.08;
    this.body.position.y = bob;
    this.body.rotation.z = THREE.MathUtils.clamp((this.x - target) * 0.25, -0.3, 0.3);
    this.body.rotation.x = this.isAirborne ? -0.15 : 0.05;
    if (this.gloves) {
      this.gloves[0].position.z = 0.1 + Math.sin(this.runTime) * 0.25;
      this.gloves[1].position.z = 0.1 - Math.sin(this.runTime) * 0.25;
    }

    this.group.position.set(this.x, this.height, 0);
    this.shadow.position.y = -this.height + 0.02;
    this.shadow.scale.setScalar(1 - this.height * 0.25);
  }
}
