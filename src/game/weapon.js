// The bio-weapon: the arm fires barbed gel spines at whatever the crosshair is on.
import * as THREE from 'three';
import { G } from '../core/engine.js';

const RATE = 0.17; // seconds between spines
export class Weapon {
  constructor(game) { this.game = game; this.cool = 0; this._f = new THREE.Vector3(); this._o = new THREE.Vector3(); this._m = new THREE.Vector3(); this._t = new THREE.Vector3(); }
  update(dt) {
    const g = this.game, pl = g.player; this.cool -= dt;
    if (!pl.can.fire || pl.dead || g.absorb.active || !G.input.held('fire') || this.cool > 0) return;
    this.cool = RATE;
    // Aim: find what the crosshair is on, then fire from the arm's mouth toward that point, so shots land where you look.
    const f = pl.forward(this._f), o = pl.eye(this._o);
    let dist = 70; const wh = g.world.raycast(o, f, 70); if (wh) dist = wh.t;
    const eh = g.enemies.hitSegment(o, this._t.copy(o).addScaledVector(f, dist), 0.1); if (eh) dist *= eh.t;
    const m = g.body.muzzle(this._m), aim = this._t.copy(o).addScaledVector(f, Math.max(dist, 2.5)).sub(m).normalize();
    if (!g.world.los(o, m)) m.copy(o); // arm pushed into a wall: fire from the eye instead of through it
    g.projectiles.spawn('spine', m, aim, 'player');
    g.body.onFire(); pl.kick += 0.014; G.audio.play('spine', 0.8);
    g.fx.flash(m.x, m.y, m.z, 0x40ffe0, 2.2, 0.07);
    G.bus.emit('fired');
  }
}
