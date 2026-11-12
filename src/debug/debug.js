// Debug hooks for automated playtests (only loaded with ?debug in the URL). The test machine draws 2-3 frames a
// second, so tests advance the simulation directly in game time with step() instead of waiting for frames.
import { G, step, render, setMode } from '../core/engine.js';
import { adminUnlock } from '../ui/admin.js';
import { save } from '../core/save.js';

export function installDebug(game, menu) {
  adminUnlock();
  const dbg = window.__dbg = {
    G, game, menu, save, setMode,
    // Advance the game by `seconds` of game time in fixed steps (no drawing), then draw one frame.
    step(seconds, h = 1 / 30) { const was = G.paused; G.paused = true; for (let t = 0; t < seconds - 1e-6; t += h) { if (game.state !== 'play' && game.state !== 'dead') break; step(h); } G.paused = was; render(0.016); return dbg.state(); },
    hold(v = true) { G.paused = v; }, // stop the real-time loop so only step() moves time
    state() {
      const pl = game.player, ch = game.chapter;
      return { state: game.state, chapter: ch && ch.id, time: +G.time.toFixed(2), hp: pl.hp, maxHp: pl.maxHp, dead: pl.dead, absorbed: pl.absorbed || 0, pos: [+pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)], yaw: +pl.yaw.toFixed(3), pitch: +pl.pitch.toFixed(3),
        enemies: game.enemies ? game.enemies.list.map((e) => ({ type: e.type, state: e.state, hp: Math.round(e.hp), room: e.room.id, x: +e.root.position.x.toFixed(1), y: +e.root.position.y.toFixed(1), z: +e.root.position.z.toFixed(1) })) : [],
        shots: game.projectiles ? game.projectiles.live.length : 0, room: ch && ch.state && ch.state.cur ? ch.state.cur.id : null, objective: game.hud.e.obj.textContent, caption: game.hud.lastCaption || '', errors: window.__errors || [] };
    },
    look(yaw, pitch = 0) { game.player.yaw = yaw; game.player.pitch = pitch; },
    lookAt(x, y, z) { const p = game.player, dx = x - p.pos.x, dz = z - p.pos.z, dy = y - (p.pos.y + p.eyeY); p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
    tp(x, y, z) { game.player.teleport(x, y, z); },
  };
  return dbg;
}
