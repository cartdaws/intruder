// Turns generated level data into meshes and collision boxes. One merged mesh per material per room,
// so a room costs a handful of draw calls, and only rooms near the player are drawn at all.
import * as THREE from 'three';
import { Batch } from './batch.js';
import { shipMats } from './textures.js';
import { makeMat } from '../core/engine.js';

const WT = 0.5, DOOR_W = 3, DOOR_H = 3;
const SIDES = ['E', 'W', 'S', 'N'];
export const LIGHT_CALM = 0xbfeee6, LIGHT_ALERT = 0xff4a30, LIGHT_CLEAR = 0x9fe8ff;

export function buildLevel(level, world, scene) {
  const M = shipMats(), out = { rooms: new Map(), doors: [], lifts: [] };
  for (const room of level.rooms) {
    const b = new Batch(), g = new THREE.Group(), { x0, z0, x1, z1, h } = room, hall = room.kind === 'hall';
    const lightMat = new THREE.MeshBasicMaterial({ color: LIGHT_CALM }), lb = new Batch();
    const tint = hall ? 0x8d959c : room.kind === 'quiet' || room.kind === 'start' ? 0xa9c2c0 : room.kind === 'finale' ? 0xb0a6a6 : 0xb4bcc4;
    b.box(M.floor, x0, -0.5, z0, x1, 0, z1, { skip: 'XxyZz', color: hall ? 0x9aa0a6 : 0xffffff });
    b.box(M.ceil, x0, h, z0, x1, h + 0.5, z1, { skip: 'XxYZz', uv: 4 });
    // A hall's slab only widens sideways, so it never pokes into the rooms at its ends.
    const hx = hall && level.doors[room.doors[0]].axis === 'x', ex = hx ? 0 : WT, ez = hall && !hx ? 0 : WT;
    world.add(x0 - ex, -1, z0 - ez, x1 + ex, 0, z1 + ez, 'floor'); world.add(x0 - ex, h, z0 - ez, x1 + ex, h + 1, z1 + ez, 'ceil');
    // Walls, with a gap wherever a door of this room sits on that side. Halls only have their two long walls.
    for (const side of SIDES) {
      const alongX = side === 'N' || side === 'S';
      if (hall && (hx ? !alongX : alongX)) continue;
      const lo = (alongX ? x0 : z0) - (hall ? 0 : WT), hi = (alongX ? x1 : z1) + (hall ? 0 : WT);
      const gaps = hall ? [] : room.doors.map((i) => level.doors[i]).filter((d) => d.out === side).map((d) => (alongX ? d.x : d.z)).sort((a, c) => a - c);
      let from = lo; const segs = [];
      for (const c of gaps) { segs.push([from, c - DOOR_W / 2, 0, h]); segs.push([c - DOOR_W / 2, c + DOOR_W / 2, DOOR_H, h]); from = c + DOOR_W / 2; }
      segs.push([from, hi, 0, h]);
      for (const [a, c, y0, y1] of segs) {
        if (c - a < 0.01 || y1 - y0 < 0.01) continue;
        const bx = side === 'E' ? [x1, a, x1 + WT, c] : side === 'W' ? [x0 - WT, a, x0, c] : side === 'S' ? [a, z1, c, z1 + WT] : [a, z0 - WT, c, z0];
        b.box(M.wall, bx[0], y0, bx[1], bx[2], y1, bx[3], { color: tint, shade: y0 === 0 });
        world.add(bx[0], y0, bx[1], bx[2], y1, bx[3], 'wall');
      }
      // Trim: a dark skirting band with a hazard stripe, ribs every few metres, and a glowing strip under the ceiling.
      const inner = side === 'E' ? x1 : side === 'W' ? x0 : side === 'S' ? z1 : z0, sg = side === 'E' || side === 'S' ? -1 : 1;
      const strip = (a, c, y0, y1, depth, mat, batch, o) => { const p0 = inner, p1 = inner + sg * depth, mn = Math.min(p0, p1), mx = Math.max(p0, p1); if (alongX) batch.box(mat, a, y0, mn, c, y1, mx, o); else batch.box(mat, mn, y0, a, mx, y1, c, o); };
      let s = alongX ? x0 : z0; const e = alongX ? x1 : z1;
      for (const c of [...gaps, 1e9]) {
        const a = s, cEnd = Math.min(e, c - DOOR_W / 2 - 0.3);
        if (cEnd - a > 0.2) { strip(a, cEnd, 0, 0.5, 0.08, M.metal, b, { color: 0x4a5058 }); if (!hall) strip(a, cEnd, 0.5, 0.62, 0.09, M.hazard, b, { uv: 0.6 }); strip(a, cEnd, h - 0.55, h - 0.4, 0.06, lightMat, lb, {}); }
        s = c + DOOR_W / 2 + 0.3;
      }
      if (!hall) for (let p = (alongX ? x0 : z0) + 2; p < e - 1; p += 4) { if (gaps.some((c) => Math.abs(c - p) < DOOR_W / 2 + 0.8)) continue; strip(p - 0.2, p + 0.2, 0, h, 0.22, M.metal, b, { color: 0x6c747c, shade: true }); }
    }
    // Ceiling light panels.
    const stepL = hall ? 5 : 6;
    for (let x = x0 + stepL / 2; x < x1; x += stepL) for (let z = z0 + stepL / 2; z < z1; z += stepL) { lb.box(lightMat, x - 0.9, h - 0.08, z - 0.3, x + 0.9, h, z + 0.3, {}); b.box(M.metal, x - 1.1, h - 0.05, z - 0.5, x + 1.1, h, z + 0.5, { color: 0x30353b }); }
    // Props: each has a collision box that matches what is drawn.
    for (const p of room.props) {
      world.add(p.x0, 0, p.z0, p.x1, p.h, p.z1, p.type);
      if (p.type === 'crate') { for (let y = 0; y < p.h - 0.1; y += 1.4) b.box(M.crate, p.x0, y, p.z0, p.x1, y + 1.4, p.z1, { uv: 1.4, color: y ? 0xd8d0c0 : 0xffffff, skip: 'y' }); }
      else if (p.type === 'pillar') { b.box(M.metal, p.x0, 0, p.z0, p.x1, p.h, p.z1, { color: 0x7d858d, shade: true, skip: 'Yy' }); b.box(M.hazard, p.x0 - 0.06, 0, p.z0 - 0.06, p.x1 + 0.06, 0.7, p.z1 + 0.06, { uv: 0.7, skip: 'y' }); lb.box(lightMat, p.x0 - 0.04, 2.2, p.z0 - 0.04, p.x1 + 0.04, 2.32, p.z1 + 0.04, {}); }
      else if (p.type === 'barrier') { b.box(M.metal, p.x0, 0, p.z0, p.x1, p.h - 0.12, p.z1, { color: 0x596169, shade: true, skip: 'y' }); b.box(M.hazard, p.x0 - 0.04, p.h - 0.12, p.z0 - 0.04, p.x1 + 0.04, p.h, p.z1 + 0.04, { uv: 0.6 }); }
      else { b.box(M.tech, p.x0, 0, p.z0, p.x1, p.h, p.z1, { uv: 2, skip: 'y' }); b.box(M.metal, p.x0 - 0.05, p.h, p.z0 - 0.05, p.x1 + 0.05, p.h + 0.06, p.z1 + 0.05, { color: 0x2c3138 }); }
    }
    if (room.lift) out.lifts.push(buildLift(room, b, world));
    g.add(b.build(), lb.build()); g.visible = false; scene.add(g);
    out.rooms.set(room.id, { group: g, lightMat, room });
  }
  for (const d of level.doors) out.doors.push(buildDoor(d, level, world, scene, M, out));
  return out;
}

function buildDoor(d, level, world, scene, M, out) {
  const alongX = d.out === 'N' || d.out === 'S', sg = d.out === 'E' || d.out === 'S' ? 1 : -1;
  const cx = alongX ? d.x : d.x + sg * WT / 2, cz = alongX ? d.z + sg * WT / 2 : d.z;
  const geo = new THREE.BoxGeometry(alongX ? DOOR_W : 0.3, DOOR_H, alongX ? 0.3 : DOOR_W);
  const mesh = new THREE.Mesh(geo, M.door); mesh.position.set(cx, DOOR_H / 2, cz);
  const light = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.2 : 0.62, 0.14, alongX ? 0.62 : 1.2), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); light.position.set(cx, DOOR_H + 0.25, cz);
  const g = new THREE.Group(); g.add(mesh, light);
  // The door belongs visually to its room, so it shows and hides with it.
  out.rooms.get(d.room).group.add(g);
  const box = alongX ? world.addDynamic(cx - DOOR_W / 2, 0, cz - 0.2, cx + DOOR_W / 2, DOOR_H, cz + 0.2, 'door') : world.addDynamic(cx - 0.2, 0, cz - DOOR_W / 2, cx + 0.2, DOOR_H, cz + DOOR_W / 2, 'door');
  return { def: d, mesh, light, box, open: 0, x: cx, z: cz, state: d.lock === 'key' ? 'key' : 'auto' };
}

function buildLift(room, b, world) {
  const M = shipMats(), L = room.lift, alongX = L.out === 'N' || L.out === 'S', sg = L.out === 'E' || L.out === 'S' ? 1 : -1;
  const mat = new THREE.MeshBasicMaterial({ color: 0x302020 });
  // A raised pad against the far wall with a frame around it; the pad glows once the deck is clear.
  b.box(M.metal, L.x - 2, 0, L.z - 2, L.x + 2, 0.12, L.z + 2, { color: 0x3a4048 });
  b.box(M.hazard, L.x - 2.1, 0, L.z - 2.1, L.x + 2.1, 0.06, L.z + 2.1, { uv: 0.8 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 3.2), mat); pad.position.set(L.x, 0.15, L.z);
  for (const s of [-1, 1]) { const px = alongX ? L.x + s * 2 : L.x + sg * 1.6, pz = alongX ? L.z + sg * 1.6 : L.z + s * 2; b.box(M.metal, px - 0.25, 0, pz - 0.25, px + 0.25, 4.2, pz + 0.25, { color: 0x7d858d, shade: true }); world.add(px - 0.25, 0, pz - 0.25, px + 0.25, 4.2, pz + 0.25, 'lift'); }
  const bx = alongX ? [L.x - 2.25, L.z + sg * 1.6 - 0.25, L.x + 2.25, L.z + sg * 1.6 + 0.25] : [L.x + sg * 1.6 - 0.25, L.z - 2.25, L.x + sg * 1.6 + 0.25, L.z + 2.25];
  b.box(M.hazard, bx[0], 3.7, bx[1], bx[2], 4.2, bx[3], { uv: 0.8 });
  return { room: room.id, x: L.x, z: L.z, pad, mat, active: false };
}
