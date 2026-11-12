// The player: movement, health and the camera. No visuals here (see body.js) and no weapon logic (see weapon.js).
import * as THREE from 'three';
import { G, shake } from '../core/engine.js';
import { clamp, damp } from '../core/util.js';

export const P = { R: 0.42, H: 1.78, EYE: 1.62, SPEED: 7.6, ACCEL: 75, AIR_ACCEL: 22, FRICTION: 11, JUMP: 7.4, GRAVITY: 21 };

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100; this.dead = false;
    this.onGround = true; this.coyote = 0; this.jumpBuf = 0; this.airTime = 0;
    this.eyeY = P.EYE; this.bob = 0; this.bobPhase = 0; this.landDip = 0; this.kick = 0; this.roll = 0;
    this.can = { move: true, look: true, jump: true, fire: true, absorb: true }; // chapters switch abilities on and off for story beats
    this.cheat = { god: false, noclip: false, speed: 1, jump: 1, gravity: 1, fov: 80, oneHit: false };
    this.stepAcc = 0;
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 1.0, this.pos.z); }
  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeY, this.pos.z); }
  forward(out) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  teleport(x, y, z, yaw = this.yaw) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; }

  update(dt, world) {
    const inp = G.input, c = this.cheat;
    if (this.can.look && !this.dead) { const l = inp.consumeLook(); this.yaw -= l.dx; this.pitch = clamp(this.pitch - l.dy, -1.45, 1.45); } else inp.consumeLook();
    const mx = this.can.move && !this.dead ? inp.move.x : 0, my = this.can.move && !this.dead ? inp.move.y : 0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = mx * cos - my * sin, wz = -mx * sin - my * cos, max = P.SPEED * c.speed;
    if (c.noclip) {
      const f = this.forward(new THREE.Vector3()); const up = inp.held('jump') ? 1 : 0;
      this.pos.x += (f.x * my + cos * mx) * max * 1.5 * dt; this.pos.y += (f.y * my + up) * max * 1.5 * dt; this.pos.z += (f.z * my - sin * mx) * max * 1.5 * dt;
      this.vel.set(0, 0, 0); this.onGround = false; this.syncCamera(dt); return;
    }
    // Ground: accelerate hard toward the wanted velocity and brake when there is no input. Air: weaker steering, no friction.
    const v = this.vel;
    if (this.onGround) {
      const tx = wx * max, tz = wz * max, k = (mx || my) ? P.ACCEL : P.FRICTION * max;
      const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz), s = Math.min(d, k * dt);
      if (d > 1e-5) { v.x += dx / d * s; v.z += dz / d * s; }
    } else {
      v.x += wx * P.AIR_ACCEL * dt; v.z += wz * P.AIR_ACCEL * dt;
      const sp = Math.hypot(v.x, v.z); if (sp > max) { v.x *= max / sp; v.z *= max / sp; }
    }
    this.jumpBuf = inp.pressed('jump') ? 0.12 : this.jumpBuf - dt;
    this.coyote = this.onGround ? 0.1 : this.coyote - dt;
    if (this.jumpBuf > 0 && this.coyote > 0 && this.can.jump && !this.dead) { v.y = P.JUMP * c.jump; this.jumpBuf = 0; this.coyote = 0; this.onGround = false; G.bus.emit('jump'); G.audio.play('jump', 0.6); }
    v.y -= P.GRAVITY * c.gravity * dt;
    const fallV = v.y, was = this.onGround;
    const res = world.move(this.pos, v, P.R, P.H, dt);
    this.onGround = res.onGround;
    if (this.onGround && !was && fallV < -3) { const imp = clamp(-fallV / 14, 0.15, 1); this.landDip = imp * 0.22; G.bus.emit('land', imp); G.audio.play('land', imp); }
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    // Footsteps and head bob follow distance actually covered, so they never run ahead of the feet.
    const sp = Math.hypot(v.x, v.z);
    if (this.onGround && sp > 1) { this.bobPhase += sp * dt * 1.25; this.stepAcc += sp * dt; if (this.stepAcc > 2.6) { this.stepAcc = 0; G.audio.play('step', 0.5); } }
    this.bob = damp(this.bob, this.onGround ? Math.min(1, sp / P.SPEED) : 0, 10, dt);
    this.syncCamera(dt);
  }

  syncCamera(dt) {
    const cam = G.camera;
    this.landDip = damp(this.landDip, 0, 9, dt); this.kick = damp(this.kick, 0, 14, dt);
    const targetEye = this.dead ? 0.35 : P.EYE;
    this.eyeY = damp(this.eyeY, targetEye, this.dead ? 3.5 : 12, dt);
    this.roll = damp(this.roll, this.dead ? 0.9 : -G.input.move.x * 0.012 * this.bob, this.dead ? 2.5 : 8, dt);
    const by = Math.sin(this.bobPhase * 2) * 0.035 * this.bob, bx = Math.cos(this.bobPhase) * 0.02 * this.bob;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * bx, this.pos.y + this.eyeY + by - this.landDip, this.pos.z - Math.sin(this.yaw) * bx);
    cam.rotation.set(this.pitch + this.kick, this.yaw, this.roll);
    if (Math.abs(cam.fov - this.cheat.fov) > 0.01) { cam.fov = this.cheat.fov; cam.updateProjectionMatrix(); }
  }

  // dmg in health points; from is the world position the hit came from (for the direction marker).
  hurt(dmg, from) {
    if (this.dead || this.cheat.god) return;
    this.hp = Math.max(0, this.hp - dmg);
    shake(0.25 + dmg * 0.02); G.audio.play('hurt', 0.8);
    G.bus.emit('hurt', { dmg, from });
    if (this.hp <= 0) { this.dead = true; G.bus.emit('dead'); }
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
}
