// Ship security: androids (trooper, scout, heavy) and drones (standard, armored).
// Androids fight from positions, not in a straight line at you: each one keeps picking a spot in its room that has a
// line of fire, sits near cover, suits its preferred range and is away from its squad mates. Scouts favour your flanks.
// At 20% health a machine shuts down: it turns blue, sparks, plays its own power-down animation and can be absorbed.
import * as THREE from 'three';
import { G } from '../core/engine.js';
import { buildModel } from './enemymodels.js';
import { findPath } from '../world/levelgen.js';
import { segCylinder } from './projectiles.js';
import { angDiff, clamp, damp, lerp, smooth } from '../core/util.js';

export const ENEMY = {
  trooper: { hp: 70, speed: 3.7, pref: 11, r: 0.5, h: 1.9, shot: 'bolt', burst: 3, gap: 0.17, cool: [1.4, 2.4], aim: 0.5, spread: 0.035 },
  scout: { hp: 42, speed: 6, pref: 7, r: 0.42, h: 1.7, shot: 'dart', burst: 4, gap: 0.11, cool: [1.1, 1.9], aim: 0.32, spread: 0.06, runGun: true },
  heavy: { hp: 170, speed: 2.2, pref: 13, r: 0.72, h: 2.3, shot: 'plasma', burst: 1, gap: 0, cool: [2.8, 3.8], aim: 0.85, spread: 0.01 },
  drone: { hp: 34, speed: 5.2, pref: 8.5, r: 0.5, h: 0.7, fly: true, shot: 'needle', burst: 2, gap: 0.15, cool: [1.5, 2.6], aim: 0.4, spread: 0.045 },
  armored: { hp: 95, speed: 3, pref: 11, r: 0.72, h: 1.1, fly: true, shot: 'seeker', burst: 1, gap: 0, cool: [3.4, 4.6], aim: 0.75, spread: 0 },
};
const BLUE = 0x2a6cff, SHUTDOWN_AT = 0.2;
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

export class Enemies {
  constructor(game, scene) { this.game = game; this.scene = scene; this.list = []; }
  // room: the level room the machine fights in (it never leaves it). opts.dormant: stands powered down until woken.
  spawn(type, x, z, room, opts = {}) {
    const def = ENEMY[type], m = buildModel(type);
    const e = { type, def, root: m.root, parts: m.parts, mats: m.mats, room, hp: def.hp, maxHp: def.hp, state: opts.dormant ? 'dormant' : 'boot', t: 0, yaw: opts.yaw ?? Math.random() * 6.28,
      path: null, pathI: 0, goal: { x, z }, cool: 0.6 + Math.random() * 1.4, aim: 0, burst: 0, burstT: 0, shots: 0, flinch: 0, dmgSince: 0, los: false, losT: Math.random() * 0.2, noLos: 0, hold: 0, phase: Math.random() * 6, moving: 0,
      vel: new THREE.Vector3(), orbit: Math.random() * 6.28, orbitDir: Math.random() < 0.5 ? 1 : -1, hover: def.fly ? (type === 'armored' ? 2.7 : 2.3) + Math.random() * 0.5 : 0, disT: 0, sparkT: 0, absorbP: -1, spin: 0, rise: opts.rise ? 1 : 0, seed: Math.random() * 100 };
    e.root.position.set(x, def.fly ? e.hover : 0, z); e.root.rotation.y = e.yaw;
    if (e.rise) e.root.position.y -= def.fly ? 0 : 2.4;
    this.scene.add(e.root); this.list.push(e); this.pose(e, 0); return e;
  }
  wake(room) { for (const e of this.list) if (e.room === room && e.state === 'dormant') { e.state = 'boot'; e.t = -Math.random() * 0.5; } }
  activeIn(room) { let n = 0; for (const e of this.list) if (e.room === room && e.state !== 'disabled') n++; return n; }
  remove(e) { e.root.removeFromParent(); const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1); for (const k in e.mats) { e.mats[k].dispose(); if (e.mats[k].userData.alt) e.mats[k].userData.alt.dispose(); } }
  clear() { for (const e of this.list.slice()) this.remove(e); }
  center(e, out) { return out.set(e.root.position.x, e.root.position.y + (e.def.fly ? 0 : e.def.h * 0.55), e.root.position.z); }

  // First machine touched by segment a->b (r = shot radius). Returns { enemy, t } or null.
  hitSegment(a, b, r) {
    let best = null;
    for (const e of this.list) {
      if (e.absorbP >= 0) continue;
      const p = e.root.position, y0 = e.def.fly ? p.y - e.def.h / 2 : p.y, t = segCylinder(a, b, p.x, p.z, y0, y0 + (e.state === 'disabled' && !e.def.fly ? e.def.h * 0.6 : e.def.h), e.def.r + r);
      if (t >= 0 && (!best || t < best.t)) best = { enemy: e, t };
    }
    return best;
  }
  damage(e, dmg, dir, at) {
    if (e.state === 'disabled') { this.game.fx.burst(at.x, at.y, at.z, 3, { color: 0x9fc8ff, speed: 3, life: 0.2, size: 0.08 }); return; }
    if (e.state === 'dormant') { e.state = 'boot'; e.t = 0.5; }
    e.hp -= dmg; e.flinch = 1; e.dmgSince += dmg; e.aim = Math.min(e.def.aim, e.aim + 0.12);
    if (dir) e.flinchYaw = Math.atan2(-dir.x, -dir.z);
    this.game.fx.burst(at.x, at.y, at.z, 4, { color: 0xffc860, speed: 4, life: 0.25, size: 0.07 });
    if (e.hp <= e.maxHp * SHUTDOWN_AT) this.disable(e);
  }
  disable(e) {
    if (e.state === 'disabled') return;
    e.state = 'disabled'; e.disT = 0; e.path = null; e.burst = 0; e.hp = Math.min(e.hp, e.maxHp * SHUTDOWN_AT); e.spin = (Math.random() < 0.5 ? -1 : 1) * 9; e.fallV = 0;
    // Blue, at once: the whole machine reads as "safe to absorb" from across the room.
    for (const k of ['body', 'dark', 'trim']) { const m = e.mats[k]; m.color.set(k === 'dark' ? 0x10244a : BLUE); m.emissive.set(0x0a2a90); m.emissiveIntensity = 0.7; }
    e.mats.eye.color.set(0x8fc0ff);
    const c = this.center(e, V); this.game.fx.burst(c.x, c.y, c.z, 26, { color: 0x8fc0ff, speed: 6, life: 0.6, size: 0.1 }); this.game.fx.flash(c.x, c.y, c.z, 0x4a8cff, 8, 0.3);
    G.audio.play('shutdown', 1, c); G.bus.emit('enemyDown', e);
  }

  update(dt) {
    const g = this.game, pl = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]; e.t += dt; e.flinch = damp(e.flinch, 0, 7, dt);
      if (e.rise > 0) { e.rise = Math.max(0, e.rise - dt / 1.1); if (!e.def.fly) e.root.position.y = -2.4 * e.rise; }
      if (e.absorbP >= 0) { this.poseAbsorb(e); continue; }
      if (e.state === 'boot') { if (e.t > 0.9 && e.rise <= 0) { e.state = 'fight'; G.audio.play('boot', 0.5, e.root.position); } }
      else if (e.state === 'fight') { if (e.def.fly) this.thinkDrone(e, dt, pl); else this.thinkAndroid(e, dt, pl); }
      else if (e.state === 'disabled') this.updateDisabled(e, dt);
      this.pose(e, dt);
    }
  }

  // ---- shared senses and shooting ----
  sense(e, dt, pl) {
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.18; const from = this.center(e, V); from.y = e.root.position.y + (e.def.fly ? 0 : e.def.h * 0.8); e.los = !pl.dead && this.game.world.los(from, pl.center(V2)); }
    e.noLos = e.los ? 0 : e.noLos + dt;
  }
  shoot(e, dt, pl, canFire) {
    const d = e.def;
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { this.fire(e, pl); e.burst--; e.burstT = d.gap; if (e.burst === 0) { e.cool = lerp(d.cool[0], d.cool[1], Math.random()); e.shots++; } } return true; }
    if (e.aim > 0) { if (!e.los) { e.aim = 0; return false; } e.aim -= dt; if (e.aim <= 0) { e.burst = d.burst; e.burstT = 0; } return true; }
    e.cool -= dt;
    if (e.cool <= 0 && e.los && canFire && !pl.dead) { e.aim = d.aim; if (d.shot === 'plasma' || d.shot === 'seeker') G.audio.play('boot', 0.5, e.root.position); return true; }
    return false;
  }
  fire(e, pl) {
    const d = e.def, from = e.parts.gun.getWorldPosition(V), to = pl.center(V2);
    if (d.shot === 'plasma') to.y = pl.pos.y + 0.3; // lobbed at the feet so the splash matters
    const dir = V3.copy(to).sub(from).normalize();
    dir.x += (Math.random() - 0.5) * 2 * d.spread; dir.y += (Math.random() - 0.5) * d.spread; dir.z += (Math.random() - 0.5) * 2 * d.spread;
    if (d.shot === 'seeker') { dir.y += 0.25; dir.x += (Math.random() - 0.5) * 0.5; dir.z += (Math.random() - 0.5) * 0.5; } // launched off-line, then it bends in
    this.game.projectiles.spawn(d.shot, from, dir, e);
    this.game.fx.burst(from.x, from.y, from.z, 3, { color: e.parts.eyeColor, speed: 2, life: 0.15, size: 0.12, grav: 0 });
    G.audio.play(d.shot, 0.8, from); e.recoil = 1;
  }

  // ---- androids ----
  thinkAndroid(e, dt, pl) {
    const d = e.def, p = e.root.position; this.sense(e, dt, pl);
    const busy = this.shoot(e, dt, pl, !e.path || d.runGun);
    e.moving = 0;
    if (e.path && !(busy && !d.runGun)) {
      const wp = e.path[e.pathI], dx = wp.x - p.x, dz = wp.z - p.z, dist = Math.hypot(dx, dz), stepL = d.speed * dt;
      if (dist <= stepL) { p.x = wp.x; p.z = wp.z; if (++e.pathI >= e.path.length) { e.path = null; e.hold = e.cover ? 0.9 + Math.random() * 0.8 : 0; e.cover = false; } }
      else { p.x += dx / dist * stepL; p.z += dz / dist * stepL; e.moveYaw = Math.atan2(-dx, -dz); }
      e.moving = 1; e.phase += stepL * 2.6;
    }
    // Face the player when there is a line of fire (or when shooting), otherwise face where it is going.
    const want = e.los || busy || !e.path ? Math.atan2(-(pl.pos.x - p.x), -(pl.pos.z - p.z)) : e.moveYaw ?? e.yaw;
    e.yaw += clamp(angDiff(e.yaw, want), -6 * dt, 6 * dt);
    if (busy) return;
    if (e.hold > 0) { e.hold -= dt; return; }
    // Decide where to stand next.
    if (e.dmgSince > e.maxHp * 0.3 && !e.path) { e.dmgSince = 0; if (this.pickSpot(e, pl, true)) return; }
    if (!e.path && (e.shots >= e.shotLimit || e.noLos > 1.2 || e.shotLimit == null)) { e.shots = 0; e.shotLimit = 1 + ((Math.random() * 2) | 0); this.pickSpot(e, pl, false); }
  }
  // Score a handful of free cells in the room and walk to the best one. cover=true looks for a spot out of sight.
  pickSpot(e, pl, cover) {
    const room = e.room, nav = room.nav, p = e.root.position, d = e.def, world = this.game.world;
    const fwd = pl.forward(V3); let best = null, bs = -1e9;
    for (let k = 0; k < 26; k++) {
      const i = 1 + ((Math.random() * (nav.w - 2)) | 0), j = 1 + ((Math.random() * (nav.d - 2)) | 0); if (nav.blocked[j * nav.w + i]) continue;
      const x = room.x0 + i + 0.5, z = room.z0 + j + 0.5, dp = Math.hypot(x - pl.pos.x, z - pl.pos.z);
      const sees = world.los(V.set(x, d.h * 0.8, z), pl.center(V2));
      let s = cover ? (sees ? -6 : 6) : (sees ? 10 : -4);
      s -= Math.abs(dp - d.pref) * 0.55; if (dp < 4) s -= 9;
      let near = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = (j + b) * nav.w + (i + a); if (nav.blocked[q]) near = 1; }
      s += near * 2.2;
      for (const o of this.list) if (o !== e && o.room === room && o.state === 'fight') { const od = Math.hypot(o.goal.x - x, o.goal.z - z); if (od < 4) s -= (4 - od) * 1.6; }
      s -= Math.hypot(x - p.x, z - p.z) * (cover ? 0.5 : 0.14);
      // Scouts want to be off to your side or behind you; everyone gets a little credit for widening the angle.
      const dot = ((x - pl.pos.x) * fwd.x + (z - pl.pos.z) * fwd.z) / Math.max(dp, 0.1);
      s += (1 - dot) * (e.type === 'scout' ? 3.2 : 0.8);
      if (s > bs) { bs = s; best = { x, z }; }
    }
    if (!best) return false;
    const path = findPath(room, p.x, p.z, best.x, best.z); if (!path) return false;
    e.path = path; e.pathI = 0; e.goal = best; e.cover = cover; return true;
  }

  // ---- drones ----
  thinkDrone(e, dt, pl) {
    const d = e.def, p = e.root.position, room = e.room, nav = room.nav; this.sense(e, dt, pl);
    this.shoot(e, dt, pl, true);
    if (e.noLos > 1.5) { e.orbitDir *= -1; e.noLos = 0.5; }
    e.orbit += e.orbitDir * dt * (e.type === 'armored' ? 0.25 : 0.5);
    const tx = clamp(pl.pos.x + Math.cos(e.orbit) * d.pref, room.x0 + 1.3, room.x1 - 1.3), tz = clamp(pl.pos.z + Math.sin(e.orbit) * d.pref, room.z0 + 1.3, room.z1 - 1.3);
    const ty = Math.min(room.h - 0.9, e.hover + Math.sin(e.t * 1.3 + e.seed) * 0.3);
    V.set(tx - p.x, 0, tz - p.z); const dist = V.length(); if (dist > 0.01) V.multiplyScalar(Math.min(d.speed, dist * 2) / dist);
    // Keep apart from the other machines in the air.
    for (const o of this.list) if (o !== e && o.def.fly && o.state === 'fight') { const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z, od = Math.hypot(ox, oz); if (od < 2.2 && od > 0.01) { V.x += ox / od * 3; V.z += oz / od * 3; } }
    e.vel.x = damp(e.vel.x, V.x, 3, dt); e.vel.z = damp(e.vel.z, V.z, 3, dt);
    const tall = (x, z) => { const i = Math.floor(x - room.x0), j = Math.floor(z - room.z0); return i < 0 || j < 0 || i >= nav.w || j >= nav.d || nav.tall[j * nav.w + i]; };
    const nx = p.x + e.vel.x * dt, nz = p.z + e.vel.z * dt;
    if (!tall(nx, nz)) { p.x = nx; p.z = nz; } else if (!tall(nx, p.z)) { p.x = nx; e.vel.z *= -0.3; } else if (!tall(p.x, nz)) { p.z = nz; e.vel.x *= -0.3; } else { e.vel.x *= -0.5; e.vel.z *= -0.5; e.orbitDir *= -1; }
    p.y = damp(p.y, ty, 2.5, dt);
    e.yaw += clamp(angDiff(e.yaw, Math.atan2(-(pl.pos.x - p.x), -(pl.pos.z - p.z))), -5 * dt, 5 * dt);
  }

  // ---- shut down: sparks, crackle, and (for drones) the fall ----
  updateDisabled(e, dt) {
    e.disT += dt; e.sparkT -= dt; const p = e.root.position;
    if (e.sparkT <= 0) {
      e.sparkT = 0.2 + Math.random() * 0.7; const c = this.center(e, V);
      this.game.fx.burst(c.x + (Math.random() - 0.5) * 0.5, c.y + (Math.random() - 0.5) * 0.8, c.z + (Math.random() - 0.5) * 0.5, 5, { color: Math.random() < 0.5 ? 0xffffff : 0x7fb4ff, speed: 3.5, life: 0.3, size: 0.07 });
      if (Math.random() < 0.6) G.audio.play('spark', 0.5, c);
      e.flicker = 1;
    }
    e.flicker = damp(e.flicker || 0, 0, 9, dt);
    for (const k of ['body', 'trim']) e.mats[k].emissiveIntensity = 0.55 + e.flicker * 1.6 + Math.sin(e.t * 9) * 0.1;
    if (e.def.fly) { // fall to whatever is underneath
      const rest = (this.game.world.raycast(V.set(p.x, p.y + 0.2, p.z), V2.set(0, -1, 0), 30)?.t ?? p.y) - 0.2;
      const floorY = p.y - rest + e.def.h * 0.45;
      if (p.y > floorY + 0.01 || e.fallV > 0) { e.fallV -= 16 * dt; p.y += e.fallV * dt; if (p.y <= floorY) { p.y = floorY; if (e.fallV < -3) { e.fallV = e.type === 'armored' ? 0 : -e.fallV * 0.3; G.audio.play('land', 0.8, p); this.game.fx.burst(p.x, p.y, p.z, 8, { color: 0xffc860, speed: 4, life: 0.3, size: 0.08 }); } else e.fallV = 0; e.landed = true; } }
    }
  }

  // ---- animation: everything a machine's joints do, from its state ----
  pose(e, dt) {
    const P = e.parts, r = e.root, d = e.def, dis = e.state === 'disabled', k = dis ? smooth(e.disT / 1.1) : 0;
    r.rotation.y = e.yaw;
    const glow = e.state === 'dormant' ? 0.12 : e.state === 'boot' ? (Math.sin(e.t * 40) > 0 ? 1 : 0.2) : 1;
    if (!dis) { const c = e.mats.eye.color.set(P.eyeColor); const tele = e.aim > 0 ? 1 + (1 - e.aim / d.aim) * 1.5 : 1; c.multiplyScalar(glow * tele); }
    else e.mats.eye.color.set(0x8fc0ff).multiplyScalar(0.3 + (e.flicker || 0));
    e.recoil = damp(e.recoil || 0, 0, 10, dt);
    if (d.fly) {
      const live = e.state === 'fight' || e.state === 'boot';
      for (const rot of P.rotors) rot.rotation.y += dt * (live ? 40 : Math.max(0, 40 * (1 - e.disT * 1.5)));
      if (!dis) { P.hull.rotation.set(e.vel.z * 0.04 - e.flinch * 0.4 - e.recoil * 0.2, 0, -e.vel.x * 0.04 + Math.sin(e.t * 2 + e.seed) * 0.04); P.hull.position.y = e.state === 'dormant' ? -0.2 : 0; }
      else if (e.type === 'drone') { // rotors stutter, it wobbles out of the air and rolls to rest on its side
        if (!e.landed) { e.yaw += e.spin * dt; e.spin *= 1 - dt; P.hull.rotation.z = Math.sin(e.disT * 14) * 0.5; P.hull.rotation.x = Math.sin(e.disT * 11) * 0.4; }
        else { P.hull.rotation.z = damp(P.hull.rotation.z, 1.25, 5, dt); P.hull.rotation.x = damp(P.hull.rotation.x, 0.2, 5, dt); }
      } else { // armored: plates blow open, then it drops like a stone and sits upright, rocking
        for (const pl of P.plates) pl.rotation.x = -k * 1.25;
        P.hull.rotation.z = e.landed ? Math.sin(e.disT * 6) * 0.12 * Math.exp(-e.disT * 0.8) : 0; P.hull.rotation.x = 0;
      }
      return;
    }
    const w = Math.sin(e.phase) * e.moving, L = P.legLen, twitch = dis ? (e.flicker || 0) : 0;
    let hipY = L - Math.abs(Math.cos(e.phase)) * 0.05 * e.moving, tx = -0.06 - e.moving * 0.12 + e.flinch * 0.3, ty = 0, hx = 0, legA = w * 0.75, legB = -w * 0.75, knA = -Math.max(0, -w) * 1.1, knB = -Math.max(0, w) * 1.1;
    let aR = 0.25 + w * 0.4, eR = 0.5, aL = 0.15 - w * 0.5, eL = 0.35, rz = 0;
    if (e.state === 'dormant' || e.state === 'boot') { const u = e.state === 'boot' ? smooth(e.t / 0.9) : 0; tx = -0.4 * (1 - u); hx = -0.5 * (1 - u); aR = aL = 0.05; eR = eL = 0.1; }
    else if (!dis) { // aim: straight arm at the player, pitch from the height difference
      const pl = this.game.player, dy = pl.pos.y + 1 - (r.position.y + L + 0.5), dd = Math.hypot(pl.pos.x - r.position.x, pl.pos.z - r.position.z), pitch = Math.atan2(dy, dd);
      const up = e.los || e.aim > 0 || e.burst > 0 ? 1 : 0; e.armUp = damp(e.armUp || 0, up, 9, dt);
      if (e.type === 'heavy') { P.cannon.rotation.x = pitch * e.armUp + e.recoil * 0.25; aR = 0.2; aL = 0.2; }
      else { aR = lerp(aR, Math.PI / 2 + pitch + e.recoil * 0.2, e.armUp); eR = lerp(eR, 0.05, e.armUp); if (e.type === 'trooper') { aL = lerp(aL, 1.1 + pitch, e.armUp); eL = lerp(eL, 0.6, e.armUp); } }
    }
    if (dis) {
      if (e.type === 'trooper') { // drops to its knees and slumps forward
        hipY = lerp(L, L * 0.5, k); legA = legB = lerp(0, 0.35, k); knA = knB = lerp(0, -1.9, k); tx = lerp(tx, -0.95, k); hx = lerp(0, -0.5, k); aR = aL = lerp(aR, 0.3, k); eR = eL = lerp(0.5, 0.1, k);
      } else if (e.type === 'scout') { // spins on the spot, then keels over sideways, limbs twitching
        e.yaw += e.spin * dt; e.spin *= 1 - 2.2 * dt; const f = smooth((e.disT - 0.35) / 0.6); rz = f * 1.5; hipY = lerp(L, 0.22, f);
        legA = 0.5 * f + twitch * 0.5; legB = -0.3 * f - twitch * 0.4; knA = -0.9 * f; knB = -0.4 * f; aR = 1.2 * f + twitch; aL = -0.4 * f; tx = -0.2 * f;
      } else { // heavy: hydraulics give out in jerks; it sinks, head bowed, cannon drooping
        const st = Math.min(1, Math.floor(e.disT / 0.28) / 4), j = lerp(e.sink || 0, st, 1 - Math.exp(-14 * dt)); e.sink = j;
        hipY = L * (1 - 0.2 * j); legA = legB = 0.5 * j; knA = knB = -1.0 * j; tx = -0.4 * j + twitch * 0.05; hx = -0.65 * j; P.cannon.rotation.x = -0.75 * j; aR = aL = 0.1;
      }
    }
    P.hips.position.y = hipY; r.rotation.z = rz; if (rz) r.rotation.order = 'YZX';
    P.torso.rotation.set(tx, ty + (e.flinch * 0.25), 0); P.head.rotation.x = hx;
    P.legs[0].rotation.x = legA; P.legs[1].rotation.x = legB; P.knees[0].rotation.x = knA; P.knees[1].rotation.x = knB;
    P.arms[0].rotation.x = aL; P.arms[1].rotation.x = aR; P.elbows[0].rotation.x = eL; P.elbows[1].rotation.x = eR;
  }
  // Being absorbed: hauled off the floor toward the player, crumpling and shrinking as the tongues take it apart.
  poseAbsorb(e) {
    const k = smooth(e.absorbP), s = 1 - k * 0.88; e.root.scale.setScalar(s);
    e.root.rotation.x = k * 0.9; e.root.rotation.z = Math.sin(e.t * 30) * 0.08 * k;
    for (const m of ['body', 'trim', 'dark']) { e.mats[m].emissive.set(0x18e0c8); e.mats[m].emissiveIntensity = 0.6 + k * 2; }
  }
}
