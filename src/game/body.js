// First-person body. PLACEHOLDER implementation of the Body interface (simple gel arms, no legs yet).
// The interface is what the rest of the game relies on:
//   new Body(game)                      adds itself to the camera and scene
//   update(dt, s)                       s = { speed, onGround, vy, pitch, absorbing }
//   onFire() onJump() onLand(impact) onHurt()
//   muzzle(out)                         world position of the weapon mouth
//   setArmed(bool)                      whether the bio-weapon is shown
//   setTongues(progress|null, target)   absorb tongues reaching to a world position (progress 0..1), null hides them
//   attach(scene) / dispose()
import * as THREE from 'three';
import { G, VIEW_LAYER } from '../core/engine.js';
import { gelMaterial } from './gel.js';
import { damp } from '../core/util.js';

export class Body {
  constructor(game) {
    this.game = game; this.root = new THREE.Group(); this.mat = gelMaterial();
    const arm = (side) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), this.mat); m.rotation.x = Math.PI / 2; m.position.z = -0.3; g.add(m); g.position.set(side * 0.28, -0.3, -0.25); this.root.add(g); return g; };
    this.right = arm(1); this.left = arm(-1);
    this.mouth = new THREE.Object3D(); this.mouth.position.set(0, 0, -0.62); this.right.add(this.mouth);
    this.tongues = []; for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1, 5), this.mat); t.visible = false; this.tongues.push(t); }
    this.recoil = 0; this.t = 0; this.armed = true;
    this.root.traverse((o) => o.layers.set(VIEW_LAYER));
  }
  attach(scene) { G.camera.add(this.root); for (const t of this.tongues) scene.add(t); }
  dispose() { G.camera.remove(this.root); for (const t of this.tongues) t.removeFromParent(); }
  setArmed(v) { this.armed = v; }
  onFire() { this.recoil = 1; } onJump() {} onLand() {} onHurt() {}
  muzzle(out) { return this.mouth.getWorldPosition(out); }
  setTongues(p, target) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.tongues.forEach((t, i) => {
      t.visible = p != null; if (p == null) return;
      (i % 2 ? this.left : this.right).getWorldPosition(a); b.copy(target).sub(a).multiplyScalar(Math.min(1, p * 2)).add(a);
      t.position.copy(a).add(b).multiplyScalar(0.5); t.scale.set(1, a.distanceTo(b), 1); t.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    });
  }
  update(dt, s) {
    this.t += dt; this.recoil = damp(this.recoil, 0, 12, dt);
    const sway = Math.sin(this.t * 1.4) * 0.006 + Math.sin(this.t * 9) * 0.01 * Math.min(1, s.speed / 7);
    this.right.position.set(0.28, -0.3 + sway, -0.25 + this.recoil * 0.12); this.left.position.set(-0.28, -0.32 - sway, -0.25);
    this.right.scale.set(1 + this.recoil * 0.25, 1 + this.recoil * 0.25, 1 - this.recoil * 0.3);
  }
}
