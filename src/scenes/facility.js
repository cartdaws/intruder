// The research ship's security deck: the generated facility, its lockdown fights, keycard, checkpoints and the lift out.
import * as THREE from 'three';
import { G, makeMat } from '../core/engine.js';
import { World } from '../world/collision.js';
import { generate } from '../world/levelgen.js';
import { buildLevel, LIGHT_CALM, LIGHT_ALERT, LIGHT_CLEAR } from '../world/levelbuild.js';
import { save } from '../core/save.js';
import { damp } from '../core/util.js';

const AI = 'VIGIL'; // the ship's AI
const LINES = {
  first: 'Specimen is out of containment. Sealing the deck. Security units: wake.',
  lock: ['Room sealed.', 'Contain it. Do not destroy it.', 'It learns. Do not let it touch you.', 'Sealing. All units engage.'],
  clear: ['Units lost. Recalculating.', 'It is taking them apart.', 'Seal released. That was not my choice.', 'Interesting. It is getting stronger.'],
  key: 'That door needs a crew keycard. You have no crew.',
  gotKey: 'A keycard has left its owner. Noted.',
  finale: 'This is the last door between you and the lift. Everything I have left is in this room.',
  wave2: 'Reserve units. All of them.',
  done: 'The lift is open. Go on, then. There are more decks than you have teeth.',
};

export function create(game, opts = {}) {
  const run = opts.run || {}, seed = run.seed ?? ((Math.random() * 1e9) | 0);
  const scene = new THREE.Scene(), world = new World(), level = generate(seed);
  scene.userData.bg = 0x05070a; scene.fog = new THREE.Fog(0x05070a, 18, 70);
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x4a4640, 2.0); scene.add(hemi);
  const lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(LIGHT_CALM, 0, 26, 1.2); scene.add(l); return l; });
  game.useScene(scene);
  const built = buildLevel(level, world, scene);
  const rs = new Map(); // room id -> { state:'idle'|'active'|'cleared', wave, timer }
  const cleared = new Set(run.cleared || []);
  for (const r of level.rooms) rs.set(r.id, { state: cleared.has(r.id) || !r.waves.length ? 'cleared' : 'idle', wave: 0, timer: 0, color: new THREE.Color(LIGHT_CALM) });
  const st = { hasKey: !!run.hasKey, cur: null, said: new Set(), checkpoint: run.checkpoint ?? level.main[0], done: false, t: 0 };
  const pl = game.player, hud = game.hud;

  // Pickups: health canisters in quiet rooms, the keycard in the key room once it is clear.
  const pickups = [];
  const pgeo = new THREE.BoxGeometry(0.34, 0.5, 0.34), kgeo = new THREE.BoxGeometry(0.5, 0.32, 0.04);
  for (const r of level.rooms) for (const p of r.pickups) {
    if (p.type === 'keycard' && st.hasKey) continue;
    const g = new THREE.Group(), m = new THREE.Mesh(p.type === 'health' ? pgeo : kgeo, new THREE.MeshBasicMaterial({ color: p.type === 'health' ? 0x4affb0 : 0xffb020 }));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 8), makeMat({ color: 0x30363c })); base.position.y = -0.55; g.add(m, base);
    g.position.set(p.x, 0.62, p.z); g.visible = !p.afterClear || rs.get(r.id).state === 'cleared'; built.rooms.get(r.id).group.add(g);
    pickups.push({ ...p, room: r, g, m, taken: false });
  }
  // First wave stands powered down in each room, so you see what is waiting before the doors shut.
  for (const r of level.rooms) if (rs.get(r.id).state === 'idle') for (const s of r.waves[0]) game.enemies.spawn(s.type, s.x, s.z, r, { dormant: true });

  const roomAt = (x, z, pad = 0) => level.rooms.find((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  const mainIndex = (r) => level.main.indexOf(r.id);
  const say = (key, text) => { if (key && st.said.has(key)) return; if (key) st.said.add(key); hud.caption(AI, text, 4.5); };
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const setDoors = (room, state) => { for (const i of room.doors) { const d = built.doors[i]; if (state === 'auto' && d.def.lock === 'key' && !st.hasKey) d.state = 'key'; else d.state = state; } };
  const objective = () => {
    const r = st.cur; if (!r) return;
    if (rs.get(r.id).state === 'active') return hud.objective('CLEAR THE ROOM');
    if (st.needKey && !st.hasKey) return hud.objective('FIND THE KEYCARD');
    hud.objective(built.lifts[0].active ? 'TAKE THE LIFT' : 'REACH THE LIFT');
  };
  const checkpoint = (room) => {
    st.checkpoint = room.id;
    save.setRun({ chapter: 'facility', seed, checkpoint: room.id, hp: Math.max(pl.hp, 40), maxHp: pl.maxHp, absorbed: pl.absorbed || 0, cleared: [...rs].filter(([, v]) => v.state === 'cleared').map(([k]) => k), hasKey: st.hasKey });
  };

  function enterRoom(r) {
    st.cur = r; const s = rs.get(r.id);
    // Draw only this room and what can be seen from it through its doors.
    const vis = new Set([r.id]); for (const a of r.links) { vis.add(a); for (const b of level.rooms[a].links) vis.add(b); }
    for (const [id, o] of built.rooms) o.group.visible = vis.has(id);
    for (const e of game.enemies.list) e.root.visible = vis.has(e.room.id);
    if (r.checkpoint && st.checkpoint !== r.id && mainIndex(r) > mainIndex(level.rooms[st.checkpoint])) { checkpoint(r); hud.toast('CHECKPOINT'); G.audio.play('chime', 0.7); }
    objective();
  }
  function lockdown(r) {
    const s = rs.get(r.id); s.state = 'active'; s.wave = 0; setDoors(r, 'locked'); game.enemies.wake(r);
    G.audio.play('lock', 1); G.audio.play('alarm', 0.8); G.audio.ambience('alarm');
    if (r.kind === 'finale') say('finale', LINES.finale); else if (!st.said.has('first')) say('first', LINES.first); else say(null, pick(LINES.lock));
    hud.flashText('LOCKDOWN'); objective(); G.bus.emit('lockdown', r);
  }
  function clearRoom(r) {
    const s = rs.get(r.id); s.state = 'cleared'; setDoors(r, 'auto'); G.audio.play('clear', 1); G.audio.ambience('ship');
    for (const p of pickups) if (p.room === r && p.afterClear) p.g.visible = true;
    if (r.kind === 'finale') { built.lifts[0].active = true; built.lifts[0].mat.color.set(0x40ffb0); say('done', LINES.done); } else say(null, pick(LINES.clear));
    hud.flashText('CLEAR'); objective(); G.bus.emit('roomClear', r);
  }

  const chapter = {
    id: 'facility', scene, world, level, built, state: st, rooms: rs, combat: true,
    spawn: (() => { const r = level.rooms[st.checkpoint]; return r.id === level.main[0] ? { x: level.spawn.x, y: 0, z: level.spawn.z, yaw: level.spawn.yaw } : { x: (r.x0 + r.x1) / 2, y: 0, z: (r.z0 + r.z1) / 2, yaw: 0 }; })(),
    start() {
      if (run.maxHp) { pl.maxHp = run.maxHp; pl.hp = Math.min(run.maxHp, Math.max(run.hp ?? run.maxHp, 40)); pl.absorbed = run.absorbed || 0; }
      G.audio.ambience('ship'); enterRoom(roomAt(pl.pos.x, pl.pos.z) || level.rooms[st.checkpoint]);
      if (!run.checkpoint) { checkpoint(level.rooms[level.main[0]]); hud.title('DECK 7', 'SECURITY AND ROBOTICS', 3.5); }
    },
    update(dt) {
      st.t += dt;
      const r = roomAt(pl.pos.x, pl.pos.z, 0.3); if (r && r !== st.cur) enterRoom(r);
      const cur = st.cur, s = rs.get(cur.id);
      // Lockdown starts once you are properly inside a room that still has machines in it.
      if (s.state === 'idle' && pl.pos.x > cur.x0 + 2.2 && pl.pos.x < cur.x1 - 2.2 && pl.pos.z > cur.z0 + 2.2 && pl.pos.z < cur.z1 - 2.2) lockdown(cur);
      if (s.state === 'active' && game.enemies.activeIn(cur) === 0) {
        s.timer += dt;
        if (s.wave + 1 < cur.waves.length) { if (s.timer > 1.6) { s.wave++; s.timer = 0; for (const e of cur.waves[s.wave]) game.enemies.spawn(e.type, e.x, e.z, cur, { rise: true }); say('wave2', LINES.wave2); G.audio.play('alarm', 0.8); hud.flashText('SECOND WAVE'); } }
        else if (s.timer > 0.7) clearRoom(cur);
      } else s.timer = 0;
      // Doors: open for you unless sealed; a keycard door explains itself when you walk up to it.
      for (const d of built.doors) {
        const near = Math.hypot(d.x - pl.pos.x, d.z - pl.pos.z) < 4.2, want = d.state === 'auto' && near ? 1 : 0;
        if (d.state === 'key' && near) { if (st.hasKey) { d.state = 'auto'; G.audio.play('key', 1); } else if (!st.needKey) { st.needKey = true; say('key', LINES.key); hud.flashText('KEYCARD REQUIRED'); objective(); } }
        if (d.open !== want) { const o = d.open; d.open = want > o ? Math.min(1, o + dt * 2.6) : Math.max(0, o - dt * 2.6); if ((o === 0 || o === 1) && near) G.audio.play('door', 0.7); d.mesh.position.y = 1.5 + d.open * 2.9; d.box.on = d.open < 0.75; }
        d.light.material.color.set(d.state === 'auto' ? 0x40ff90 : d.state === 'key' ? 0xffb020 : 0xff3020);
      }
      // Room lighting follows its state: calm, red while sealed, cool once cleared.
      for (const [id, o] of built.rooms) { if (!o.group.visible) continue; const v = rs.get(id); v.color.lerp(new THREE.Color(v.state === 'active' ? LIGHT_ALERT : v.state === 'cleared' && o.room.waves.length ? LIGHT_CLEAR : LIGHT_CALM), 1 - Math.exp(-4 * dt)); o.lightMat.color.copy(v.color); if (v.state === 'active') o.lightMat.color.multiplyScalar(0.75 + 0.25 * Math.sin(st.t * 5)); }
      const col = s.color; hemi.color.set(0xdcecff).lerp(col, 0.35);
      lamps[0].position.set(pl.pos.x, Math.min(cur.h - 0.6, 3.4), pl.pos.z); lamps[0].color.copy(col); lamps[0].intensity = 14;
      const cx = (cur.x0 + cur.x1) / 2, cz = (cur.z0 + cur.z1) / 2, q = Math.max(cur.x1 - cur.x0, cur.z1 - cur.z0) / 4;
      lamps[1].position.set(cx - q, cur.h - 0.8, cz - q); lamps[2].position.set(cx + q, cur.h - 0.8, cz + q); lamps[1].color.copy(col); lamps[2].color.copy(col); lamps[1].intensity = lamps[2].intensity = damp(lamps[1].intensity, cur.kind === 'hall' ? 0 : 22, 4, dt);
      // Pickups.
      for (const p of pickups) {
        if (p.taken || !p.g.visible) continue; p.m.rotation.y += dt * 2; p.m.position.y = Math.sin(st.t * 2 + p.x) * 0.06;
        if (Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) > 1.1 || pl.pos.y > 1.5) continue;
        if (p.type === 'health') { if (pl.hp >= pl.maxHp) continue; pl.heal(40); hud.toast('+40 HEALTH'); G.audio.play('pickup', 1); }
        else { st.hasKey = true; hud.toast('KEYCARD'); G.audio.play('key', 1); say('gotKey', LINES.gotKey); for (const d of built.doors) if (d.state === 'key') d.state = 'auto'; objective(); }
        p.taken = true; p.g.visible = false;
      }
      // The lift ends the deck.
      const lift = built.lifts[0];
      if (lift.active && !st.done && Math.hypot(lift.x - pl.pos.x, lift.z - pl.pos.z) < 1.7) { st.done = true; game.finishDeck(); }
    },
    // Admin and tests: jump to a room on the main path, marking everything before it cleared.
    skipTo(mainIdx) {
      const id = level.main[Math.max(0, Math.min(level.main.length - 1, mainIdx))], r = level.rooms[id], en = r.entry != null ? level.doors[r.entry] : null;
      for (let i = 0; i < mainIdx; i++) { const q = level.rooms[level.main[i]], v = rs.get(q.id); if (v.state !== 'cleared') { v.state = 'cleared'; setDoors(q, 'auto'); for (const e of game.enemies.list.slice()) if (e.room === q) game.enemies.remove(e); } }
      const x = en ? en.x + (en.out === 'E' ? -1.2 : en.out === 'W' ? 1.2 : 0) : (r.x0 + r.x1) / 2, z = en ? en.z + (en.out === 'S' ? -1.2 : en.out === 'N' ? 1.2 : 0) : (r.z0 + r.z1) / 2;
      pl.teleport(x, 0, z, Math.atan2(-((r.x0 + r.x1) / 2 - x), -((r.z0 + r.z1) / 2 - z))); enterRoom(r);
    },
    giveKey() { st.hasKey = true; for (const d of built.doors) if (d.state === 'key') d.state = 'auto'; objective(); },
    dispose() { G.audio.ambience(null); },
  };
  return chapter;
}
