// Every shot in the game: the player's gel spines and the five machine projectiles. Each kind looks different on
// purpose, so the player can read a fight at a glance: red bolts, green darts, a slow purple plasma ball that splashes,
// yellow needles, and an orange seeker that bends toward you (it can only turn about 35 degrees in total).
import * as THREE from 'three';
import { G, shake } from '../core/engine.js';
import { P } from './player.js';
import { gelMaterial } from './gel.js';

export const SHOTS = {
  spine: { speed: 64, dmg: 14, life: 1.5, r: 0.06, color: 0x35ffe0 },
  bolt: { speed: 24, dmg: 8, life: 3, r: 0.1, color: 0xff3828 },
  dart: { speed: 32, dmg: 4, life: 2.5, r: 0.07, color: 0x5cff4a },
  plasma: { speed: 10.5, dmg: 20, life: 6, r: 0.3, color: 0xb04cff, splash: 3.4, splashDmg: 13 },
  needle: { speed: 28, dmg: 5, life: 2.5, r: 0.06, color: 0xffe14a },
  seeker: { speed: 12.5, dmg: 15, life: 6, r: 0.16, color: 0xff8a1e, turn: 35 * Math.PI / 180, turnRate: 1.1, splash: 1.8, splashDmg: 6 },
};
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
let geos = null;
function make(kind) {
  geos = geos || { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.IcosahedronGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 6) };
  const g = new THREE.Group(), add = (geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); return m; };
  const c = SHOTS[kind].color;
  if (kind === 'spine') { // a barbed gel spine: long cone with three swept-back barbs
    const mat = gelMaterial({ color: 0x18d8c0, glow: 0.6, opacity: 0.92 });
    const s = add(geos.cone, mat, 0.045, 0.75, 0.045); s.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const b = add(geos.cone, mat, 0.022, 0.2, 0.022, Math.cos(i * 2.094) * 0.05, Math.sin(i * 2.094) * 0.05, -0.12); b.rotation.set(Math.PI / 2 - Math.sin(i * 2.094) * 0.6, Math.cos(i * 2.094) * 0.6, 0); }
  } else if (kind === 'bolt') { add(geos.box, basic(c), 0.07, 0.07, 1.1); add(geos.box, basic(0xffd0c0), 0.03, 0.03, 1.15); }
  else if (kind === 'dart') { add(geos.box, basic(c), 0.04, 0.04, 0.5, -0.09); add(geos.box, basic(c), 0.04, 0.04, 0.5, 0.09); }
  else if (kind === 'plasma') { add(geos.ball, basic(c), 0.3, 0.3, 0.3); add(geos.ball, new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.45 }), 0.44, 0.44, 0.44); }
  else if (kind === 'needle') { add(geos.box, basic(c), 0.03, 0.03, 0.8); }
  else if (kind === 'seeker') { const m = add(geos.cone, basic(0xd8dde2), 0.11, 0.5, 0.11); m.rotation.x = Math.PI / 2; add(geos.ball, basic(c), 0.13, 0.13, 0.13, 0, 0, -0.3); add(geos.box, basic(0x50565c), 0.34, 0.03, 0.14, 0, 0, -0.2); add(geos.box, basic(0x50565c), 0.03, 0.34, 0.14, 0, 0, -0.2); }
  return g;
}
// Segment a->b against a vertical cylinder. Returns the fraction along the segment of the first touch, or -1.
export function segCylinder(a, b, cx, cz, y0, y1, r) {
  const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - cx, fz = a.z - cz, A = dx * dx + dz * dz, C = fx * fx + fz * fz - r * r;
  let t = 0;
  if (C > 0) { if (A < 1e-9) return -1; const B = fx * dx + fz * dz, disc = B * B - A * C; if (disc < 0) return -1; t = (-B - Math.sqrt(disc)) / A; if (t < 0 || t > 1) return -1; }
  const y = a.y + (b.y - a.y) * t;
  return y >= y0 - r && y <= y1 + r ? t : -1;
}

export class Projectiles {
  constructor(game, scene) { this.game = game; this.scene = scene; this.live = []; this.pool = {}; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); }
  // owner: 'player' or the enemy that fired (machine shots never hurt machines)
  spawn(kind, pos, dir, owner) {
    const pool = this.pool[kind] || (this.pool[kind] = []);
    const mesh = pool.pop() || make(kind); if (!mesh.parent) this.scene.add(mesh);
    mesh.visible = true; mesh.position.copy(pos);
    const s = { kind, def: SHOTS[kind], mesh, dir: dir.clone().normalize(), owner, life: SHOTS[kind].life, turned: 0, t: 0 };
    mesh.lookAt(this._a.copy(pos).add(s.dir)); this.live.push(s); return s;
  }
  clear() { for (const s of this.live) { s.mesh.visible = false; this.pool[s.kind].push(s.mesh); } this.live.length = 0; }
  update(dt) {
    const game = this.game, world = game.world, pl = game.player, fx = game.fx, a = this._a, b = this._b;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], d = s.def; s.life -= dt; s.t += dt;
      if (d.turn && s.turned < d.turn && !pl.dead) { // seeker: bend toward the player, within its total turn budget
        const want = pl.center(this._d).sub(s.mesh.position).normalize(), ang = Math.acos(Math.max(-1, Math.min(1, want.dot(s.dir))));
        const stepA = Math.min(ang, d.turnRate * dt, d.turn - s.turned);
        if (ang > 1e-4 && stepA > 0) { s.dir.lerp(want, stepA / ang).normalize(); s.turned += stepA; }
      }
      a.copy(s.mesh.position); b.copy(a).addScaledVector(s.dir, d.speed * dt);
      let hitT = 2, hit = null;
      const wh = world.raycast(a, s.dir, d.speed * dt); if (wh) { hitT = wh.t / (d.speed * dt); hit = { wall: wh }; }
      if (s.owner === 'player') { const eh = game.enemies.hitSegment(a, b, d.r); if (eh && eh.t < hitT) { hitT = eh.t; hit = { enemy: eh.enemy }; } }
      else if (!pl.dead) { const t = segCylinder(a, b, pl.pos.x, pl.pos.z, pl.pos.y, pl.pos.y + P.H, P.R + d.r); if (t >= 0 && t < hitT) { hitT = t; hit = { player: true }; } }
      if (hit || s.life <= 0) {
        const p = hit ? a.lerp(b, Math.min(1, hitT)) : b; this.impact(s, p, hit);
        s.mesh.visible = false; this.pool[s.kind].push(s.mesh); this.live.splice(i, 1); continue;
      }
      s.mesh.position.copy(b); s.mesh.lookAt(a.copy(b).add(s.dir));
      if (s.kind === 'plasma') { s.mesh.rotation.z = s.t * 5; if (Math.random() < dt * 25) fx.burst(b.x, b.y, b.z, 1, { color: 0xb04cff, speed: 0.6, life: 0.4, size: 0.2, grav: 0 }); }
      if (s.kind === 'seeker' && Math.random() < dt * 40) fx.burst(b.x, b.y, b.z, 1, { color: 0x9a9a9a, speed: 0.4, life: 0.5, size: 0.16, grav: -1 });
    }
  }
  impact(s, p, hit) {
    const game = this.game, fx = game.fx, d = s.def, pl = game.player;
    if (s.owner === 'player') {
      if (hit && hit.enemy) { game.enemies.damage(hit.enemy, d.dmg * (pl.cheat.oneHit ? 100 : 1), s.dir, p); fx.burst(p.x, p.y, p.z, 7, { color: 0x35ffe0, speed: 3.5, life: 0.35, size: 0.11 }); G.audio.play('hit', 0.7, p); G.bus.emit('hitmark'); }
      else if (hit && hit.wall) { const w = hit.wall; fx.decal(p.x, p.y, p.z, w.nx, w.ny, w.nz, 0.22 + Math.random() * 0.16); fx.burst(p.x, p.y, p.z, 5, { color: 0x22e6c8, speed: 2.5, life: 0.4, size: 0.1, dir: { x: w.nx * 0.4, y: w.ny * 0.4, z: w.nz * 0.4 } }); G.audio.play('splat', 0.5, p); }
      return;
    }
    if (hit && hit.player) pl.hurt(d.dmg, s.mesh.position);
    if (d.splash) { // area damage falls off with distance; a direct hit already did its own damage
      const dist = pl.center(this._d).distanceTo(p);
      if (dist < d.splash && !(hit && hit.player)) pl.hurt(Math.round(d.splashDmg * (1 - dist / d.splash * 0.6)), p);
      fx.burst(p.x, p.y, p.z, s.kind === 'plasma' ? 34 : 16, { color: d.color, speed: s.kind === 'plasma' ? 7 : 5, life: 0.7, size: 0.22, up: 2 });
      fx.burst(p.x, p.y, p.z, 10, { color: 0xffc070, speed: 3, life: 0.4, size: 0.3, grav: 0 });
      fx.flash(p.x, p.y + 0.3, p.z, d.color, 9, 0.25); G.audio.play('boom', s.kind === 'plasma' ? 1 : 0.6, p); if (dist < 9) shake(0.35 * (1 - dist / 9));
      if (hit && hit.wall) fx.decal(p.x, p.y, p.z, hit.wall.nx, hit.wall.ny, hit.wall.nz, s.kind === 'plasma' ? 1.3 : 0.6, 0x7a30c0);
    } else fx.burst(p.x, p.y, p.z, 4, { color: d.color, speed: 2.5, life: 0.25, size: 0.09 });
  }
}
