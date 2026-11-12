// Facility generator: pure data, no rendering. The same seed always gives the same deck, which is what lets a
// checkpoint reload rebuild the level instead of saving it.
//
// level = { seed, rooms[], doors[], spawn:{x,z,yaw} }
// room  = { id, kind:'start'|'combat'|'quiet'|'key'|'finale'|'hall', main (index on the main path or -1), x0,z0,x1,z1 (interior), h,
//           doors[ids], links[room ids], props[{type,x0,z0,x1,z1,h}], waves[[{type,x,z}]], pickups[{type,x,z}], checkpoint, nav, lift }
// door  = { id, x, z, axis:'x'|'z' (the axis you walk along to pass through), room, hall, lock:null|'key' }
import { rng } from '../core/util.js';

const PLAN = ['start', 'combat', 'combat', 'quiet', 'combat', 'combat', 'quiet', 'combat', 'combat', 'quiet', 'finale'];
const KEY_FROM = 5;      // the keycard room branches off this main-path room
const LOCKED_EXIT = 6;   // the exit of this room needs the keycard
const SIZE = { start: [10, 12], quiet: [10, 13], combat: [16, 22], key: [14, 17], finale: [26, 28] };
const DIRS = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }, OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
// Threat cost of each machine, used to fill a room's budget.
export const COST = { scout: 1, drone: 1, trooper: 1.5, armored: 2.5, heavy: 3.5 };

const overlap = (a, b, pad) => a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.z0 - pad < b.z1 && a.z1 + pad > b.z0;

export function generate(seed) {
  for (let attempt = 0; attempt < 50; attempt++) { const lv = tryGenerate((seed + attempt * 7919) >>> 0); if (lv) { lv.seed = seed; return lv; } }
  throw new Error('level generation failed');
}

function tryGenerate(seed) {
  const r = rng(seed), rooms = [], doors = [];
  const mk = (kind, main) => { const [a, b] = SIZE[kind]; return { id: rooms.length, kind, main, w: r.int(a, b), d: r.int(a, b), h: kind === 'finale' ? 7 : kind === 'combat' || kind === 'key' ? r.pick([5, 5, 6]) : 4, doors: [], links: [], props: [], waves: [], pickups: [], checkpoint: false }; };
  const fits = (rect, pad, skip) => rooms.every((o) => o === skip || !overlap(rect, o, pad));
  // Put room B next to room A in direction dir, joined by a hallway. Returns false if it would overlap anything.
  const attach = (A, B, dir) => {
    const [dx, dz] = DIRS[dir], L = r.int(6, 9), hall = { id: 0, kind: 'hall', main: -1, h: 3.4, doors: [], links: [], props: [], waves: [], pickups: [] };
    if (dx) {
      const zc = r.int(A.z0 + 3, A.z1 - 3); B.z0 = zc - r.int(3, B.d - 3); B.z1 = B.z0 + B.d;
      if (dx > 0) { B.x0 = A.x1 + L; B.x1 = B.x0 + B.w; hall.x0 = A.x1; hall.x1 = B.x0; } else { B.x1 = A.x0 - L; B.x0 = B.x1 - B.w; hall.x0 = B.x1; hall.x1 = A.x0; }
      hall.z0 = zc - 2; hall.z1 = zc + 2;
    } else {
      const xc = r.int(A.x0 + 3, A.x1 - 3); B.x0 = xc - r.int(3, B.w - 3); B.x1 = B.x0 + B.w;
      if (dz > 0) { B.z0 = A.z1 + L; B.z1 = B.z0 + B.d; hall.z0 = A.z1; hall.z1 = B.z0; } else { B.z1 = A.z0 - L; B.z0 = B.z1 - B.d; hall.z0 = B.z1; hall.z1 = A.z0; }
      hall.x0 = xc - 2; hall.x1 = xc + 2;
    }
    if (!fits(B, 3, null) || !fits(hall, 1.5, A)) return false;
    B.id = rooms.length; rooms.push(B); hall.id = rooms.length; rooms.push(hall);
    const cx = (hall.x0 + hall.x1) / 2, cz = (hall.z0 + hall.z1) / 2, axis = dx ? 'x' : 'z';
    const dA = { id: doors.length, axis, room: A.id, hall: hall.id, lock: null, x: dx ? (dx > 0 ? A.x1 : A.x0) : cx, z: dz ? (dz > 0 ? A.z1 : A.z0) : cz, out: dir }; doors.push(dA);
    const dB = { id: doors.length, axis, room: B.id, hall: hall.id, lock: null, x: dx ? (dx > 0 ? B.x0 : B.x1) : cx, z: dz ? (dz > 0 ? B.z0 : B.z1) : cz, out: OPP[dir] }; doors.push(dB);
    A.doors.push(dA.id); B.doors.push(dB.id); hall.doors.push(dA.id, dB.id);
    A.links.push(hall.id); B.links.push(hall.id); hall.links.push(A.id, B.id);
    B.entry = dB.id; A.exitDoor = dA.id; // for B: the door you first come in by; for A: (last attached) the way onward
    return true;
  };

  const first = mk('start', 0); first.x0 = 0; first.z0 = 0; first.x1 = first.w; first.z1 = first.d; rooms.push(first);
  const main = [first]; let prevDir = 'E';
  for (let i = 1; i < PLAN.length; i++) {
    const A = main[i - 1]; let ok = false;
    for (let t = 0; t < 24 && !ok; t++) {
      const dir = t > 16 ? 'E' : r.pick(['E', 'E', 'N', 'S'].filter((d) => d !== OPP[prevDir]));
      const B = mk(PLAN[i], i); if (attach(A, B, dir)) { ok = true; prevDir = dir; main.push(B); A.next = A.exitDoor; }
    }
    if (!ok) return null;
  }
  // Keycard room: a dead-end branch. The locked door is further along, so finding it locked sends you back here.
  { const A = main[KEY_FROM]; let ok = false; const used = A.doors.map((d) => doors[d].out);
    for (let t = 0; t < 24 && !ok; t++) { const dir = r.pick(['N', 'S', 'E', 'W'].filter((d) => !used.includes(d))); const B = mk('key', -1); const keep = A.exitDoor; if (attach(A, B, dir)) { ok = true; A.exitDoor = keep; B.exitDoor = null; A.keyDoor = doors.length - 2; } }
    if (!ok) return null; }
  doors[main[LOCKED_EXIT].next].lock = 'key';
  main.forEach((m) => { if (m.kind === 'quiet') m.checkpoint = true; });

  for (const room of rooms) { if (room.kind !== 'hall') furnish(room, rooms, doors, r); }
  const s = main[0];
  const lv = { rooms, doors, main: main.map((m) => m.id), keyRoom: rooms.find((x) => x.kind === 'key').id, spawn: { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, yaw: 0 } };
  const d0 = doors[s.next]; lv.spawn.yaw = Math.atan2(-(d0.x - lv.spawn.x), -(d0.z - lv.spawn.z));
  return lv;
}

// ---- furnishing: cover, navigation grid, enemies and pickups for one room ----
function furnish(room, rooms, doors, r) {
  const W = room.x1 - room.x0, Dp = room.z1 - room.z0, rd = room.doors.map((i) => doors[i]);
  const nearDoor = (x, z, m) => rd.some((d) => Math.hypot(d.x - x, d.z - z) < m);
  for (let attempt = 0; attempt < 12; attempt++) {
    room.props = [];
    const put = (type, cx, cz, sx, sz, h) => {
      const p = { type, x0: cx - sx / 2, z0: cz - sz / 2, x1: cx + sx / 2, z1: cz + sz / 2, h };
      if (p.x0 < room.x0 + 1.6 || p.x1 > room.x1 - 1.6 || p.z0 < room.z0 + 1.6 || p.z1 > room.z1 - 1.6) return false;
      if (nearDoor(cx, cz, 4.2) || room.props.some((o) => overlap(p, o, 1.5))) return false;
      room.props.push(p); return true;
    };
    if (room.kind === 'combat' || room.kind === 'key' || room.kind === 'finale') {
      const fx = W / 3.2, fz = Dp / 3.2, mx = (room.x0 + room.x1) / 2, mz = (room.z0 + room.z1) / 2;
      if (room.kind === 'finale' || r.chance(0.6)) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('pillar', Math.round(mx + sx * fx), Math.round(mz + sz * fz), 1.4, 1.4, room.h);
      const n = Math.round((W * Dp) / 42) + (room.kind === 'finale' ? 3 : 0);
      for (let i = 0, t = 0; i < n && t < 80; t++) {
        const x = Math.round(r.range(room.x0 + 2.5, room.x1 - 2.5)), z = Math.round(r.range(room.z0 + 2.5, room.z1 - 2.5)), k = r();
        const ok = k < 0.4 ? put('crate', x, z, 1.4, 1.4, r.chance(0.45) ? 2.8 : 1.4) : k < 0.75 ? (r.chance(0.5) ? put('barrier', x, z, 3.2, 0.6, 1.15) : put('barrier', x, z, 0.6, 3.2, 1.15)) : put('console', x, z, 2, 1, 1.5);
        if (ok) i++;
      }
    } else if (room.kind === 'quiet' || room.kind === 'start') {
      for (let i = 0, t = 0; i < 3 && t < 40; t++) { const x = Math.round(r.range(room.x0 + 2.5, room.x1 - 2.5)), z = Math.round(r.range(room.z0 + 2.5, room.z1 - 2.5)); if (put(r.chance(0.5) ? 'console' : 'crate', x, z, r.chance(0.5) ? 2 : 1.4, 1.4, 1.4)) i++; }
    }
    room.nav = buildNav(room);
    if (connected(room, rd)) break;
    room.props = []; room.nav = buildNav(room);
  }
  const free = () => { for (let t = 0; t < 200; t++) { const i = r.int(1, room.nav.w - 2), j = r.int(1, room.nav.d - 2); if (!room.nav.blocked[j * room.nav.w + i]) return { x: room.x0 + i + 0.5, z: room.z0 + j + 0.5 }; } return { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 }; };
  const entry = room.entry != null ? doors[room.entry] : null;
  const spawnSet = (budget, kinds) => {
    const out = [];
    for (let t = 0; budget > 0.9 && t < 60; t++) {
      const type = r.pick(kinds.filter((k) => COST[k] <= budget + 0.01)); if (!type) break;
      for (let q = 0; q < 40; q++) { const p = free(); if (entry && Math.hypot(p.x - entry.x, p.z - entry.z) < Math.min(9, Math.max(W, Dp) * 0.5)) continue; if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 2.5)) continue; out.push({ type, x: p.x, z: p.z }); budget -= COST[type]; break; }
    }
    return out;
  };
  const i = room.main;
  if (room.kind === 'combat') {
    // The first fight is the gentlest; each later room adds threat and unlocks tougher machines.
    const kinds = i <= 1 ? ['trooper', 'drone'] : i <= 2 ? ['trooper', 'scout', 'drone'] : i <= 5 ? ['trooper', 'scout', 'drone', 'heavy'] : ['trooper', 'scout', 'drone', 'heavy', 'armored'];
    room.waves = [spawnSet(i <= 1 ? 3 : 3 + i * 0.75, kinds)];
  } else if (room.kind === 'key') room.waves = [spawnSet(6.5, ['trooper', 'scout', 'drone', 'heavy'])];
  else if (room.kind === 'finale') room.waves = [spawnSet(9, ['trooper', 'scout', 'drone', 'heavy']), spawnSet(11.5, ['trooper', 'scout', 'heavy', 'armored', 'armored'])];
  if (room.kind === 'quiet') { room.pickups.push({ type: 'health', ...free() }, { type: 'health', ...free() }); }
  if (room.kind === 'key') room.pickups.push({ type: 'keycard', x: (room.x0 + room.x1) / 2 + 0.5, z: (room.z0 + room.z1) / 2 + 0.5, afterClear: true });
  if (room.kind === 'finale') {
    // The lift sits against the wall opposite the way in.
    const o = OPP[entry.out], mx = Math.round((room.x0 + room.x1) / 2), mz = Math.round((room.z0 + room.z1) / 2);
    room.lift = o === 'E' ? { x: room.x1 - 2, z: mz, out: 'E' } : o === 'W' ? { x: room.x0 + 2, z: mz, out: 'W' } : o === 'S' ? { x: mx, z: room.z1 - 2, out: 'S' } : { x: mx, z: room.z0 + 2, out: 'N' };
    room.props = room.props.filter((p) => Math.hypot((p.x0 + p.x1) / 2 - room.lift.x, (p.z0 + p.z1) / 2 - room.lift.z) > 5); room.nav = buildNav(room);
  }
}

// 1 m grid over the room interior. blocked: a machine cannot stand there. tall: sight is blocked there (full cover).
export function buildNav(room) {
  const w = Math.round(room.x1 - room.x0), d = Math.round(room.z1 - room.z0), blocked = new Uint8Array(w * d), tall = new Uint8Array(w * d);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const x = room.x0 + i + 0.5, z = room.z0 + j + 0.5;
    for (const p of room.props) { if (x > p.x0 - 0.55 && x < p.x1 + 0.55 && z > p.z0 - 0.55 && z < p.z1 + 0.55) { blocked[j * w + i] = 1; if (p.h > 1.8) tall[j * w + i] = 1; } }
  }
  return { w, d, blocked, tall };
}
function connected(room, rd) {
  const { w, d, blocked } = room.nav, seen = new Uint8Array(w * d);
  const cell = (x, z) => [Math.min(w - 1, Math.max(0, Math.floor(x - room.x0))), Math.min(d - 1, Math.max(0, Math.floor(z - room.z0)))];
  let start = -1; for (let k = 0; k < w * d; k++) if (!blocked[k]) { start = k; break; } if (start < 0) return false;
  const q = [start]; seen[start] = 1;
  while (q.length) { const k = q.pop(), i = k % w, j = (k / w) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, z = j + b; if (x < 0 || z < 0 || x >= w || z >= d) continue; const n = z * w + x; if (!blocked[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  for (let k = 0; k < w * d; k++) if (!blocked[k] && !seen[k]) return false;
  return rd.every((dr) => { const [i, j] = cell(dr.x, dr.z); return !blocked[j * w + i]; });
}

// Shortest path on a room's grid (A*, 8 directions, no corner cutting). Returns world points or null.
export function findPath(room, sx, sz, tx, tz) {
  const { w, d, blocked } = room.nav, ci = (x) => Math.min(w - 1, Math.max(0, Math.floor(x - room.x0))), cj = (z) => Math.min(d - 1, Math.max(0, Math.floor(z - room.z0)));
  const s = cj(sz) * w + ci(sx), t = cj(tz) * w + ci(tx); if (blocked[t]) return null; if (s === t) return [{ x: tx, z: tz }];
  const g = new Float32Array(w * d).fill(1e9), from = new Int32Array(w * d).fill(-1), open = [s], closed = new Uint8Array(w * d); g[s] = 0;
  const hh = (k) => Math.hypot((k % w) - (t % w), ((k / w) | 0) - ((t / w) | 0));
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (g[open[q]] + hh(open[q]) < g[open[bi]] + hh(open[bi])) bi = q;
    const k = open.splice(bi, 1)[0]; if (k === t) break; if (closed[k]) continue; closed[k] = 1; const i = k % w, j = (k / w) | 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue; const x = i + a, z = j + b; if (x < 0 || z < 0 || x >= w || z >= d) continue; const n = z * w + x; if (blocked[n] || closed[n]) continue;
      if (a && b && (blocked[j * w + x] || blocked[z * w + i])) continue;
      const c = g[k] + (a && b ? 1.414 : 1); if (c < g[n]) { g[n] = c; from[n] = k; open.push(n); }
    }
  }
  if (from[t] < 0) return null;
  const path = []; for (let k = t; k !== s && k >= 0; k = from[k]) path.push({ x: room.x0 + (k % w) + 0.5, z: room.z0 + ((k / w) | 0) + 0.5 });
  path.reverse(); path[path.length - 1] = { x: tx, z: tz }; return path;
}
