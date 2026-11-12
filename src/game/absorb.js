// Absorb: one tap on a shut-down machine sends the tongues out; they dissolve it and carry it back.
// Each absorb heals and permanently adds +1 max health.
import * as THREE from 'three';
import { G, shake } from '../core/engine.js';
import { clamp, smooth } from '../core/util.js';

export const ABSORB = { RANGE: 14, TIME: 1.5, HEAL: 22 };
export class Absorb {
  constructor(game) { this.game = game; this.active = false; this.target = null; this.t = 0; this.candidate = null; this.scanT = 0; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3(); this.from = new THREE.Vector3(); }
  // Best shut-down machine in front of the player: in range, roughly where they are looking, and in sight.
  find() {
    const g = this.game, pl = g.player, eye = pl.eye(this._a), f = pl.forward(this._b); let best = null, bs = -1;
    for (const e of g.enemies.list) {
      if (e.state !== 'disabled' || e.absorbP >= 0) continue;
      const c = g.enemies.center(e, this._c), d = c.distanceTo(eye); if (d > ABSORB.RANGE) continue;
      const dot = c.clone().sub(eye).normalize().dot(f); if (dot < (d < 3 ? 0.2 : 0.72)) continue;
      const s = dot * 2 - d / ABSORB.RANGE; if (s > bs && g.world.los(eye, c)) { bs = s; best = e; }
    }
    return best;
  }
  update(dt) {
    const g = this.game, pl = g.player;
    if (!this.active) {
      this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 0.12; this.candidate = pl.can.absorb && !pl.dead ? this.find() : null; }
      if (this.candidate && this.candidate.state === 'disabled' && G.input.pressed('use')) {
        this.active = true; this.target = this.candidate; this.candidate = null; this.t = 0; this.target.absorbP = 0; this.from.copy(this.target.root.position);
        G.audio.play('tongue', 1); G.audio.play('absorb', 0.9); G.bus.emit('absorbStart', this.target);
      }
      return;
    }
    this.t += dt; const e = this.target, p = this.t / ABSORB.TIME, pull = clamp((p - 0.3) / 0.7, 0, 1);
    // The machine is hauled from where it fell to just in front of the player's chest.
    const chest = pl.eye(this._a).addScaledVector(pl.forward(this._b), 0.9); chest.y -= 0.45;
    e.absorbP = pull; e.root.position.lerpVectors(this.from, chest, smooth(pull) * 0.92); if (pull > 0) e.root.position.y += Math.sin(pull * Math.PI) * 0.5;
    const c = g.enemies.center(e, this._c);
    g.body.setTongues(Math.min(1, p / 0.3), c, pull);
    if (pull > 0 && Math.random() < dt * 60) g.fx.burst(c.x, c.y, c.z, 2, { color: 0x35ffe0, speed: 2.5, life: 0.5, size: 0.12, grav: -2, dir: { x: (chest.x - c.x) * 0.2, y: 0, z: (chest.z - c.z) * 0.2 } });
    if (p >= 1 || pl.dead) {
      g.body.setTongues(null); this.active = false; this.target = null;
      if (pl.dead) { e.absorbP = -1; e.root.scale.setScalar(1); return; }
      g.enemies.remove(e); pl.maxHp += 1; pl.heal(ABSORB.HEAL + 1); pl.absorbed = (pl.absorbed || 0) + 1;
      g.fx.burst(c.x, c.y, c.z, 30, { color: 0x35ffe0, speed: 5, life: 0.6, size: 0.14, grav: 2 }); G.audio.play('absorbDone', 1); shake(0.2);
      G.bus.emit('absorbed', e);
    }
  }
}
