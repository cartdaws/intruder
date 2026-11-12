// Collision world: axis-aligned boxes in a coarse grid, plus an optional terrain height function.
// Everything solid in the game is a box here; the drawn meshes are separate and only have to agree with it.
const CELL = 6;
export class World {
  constructor() { this.boxes = []; this.dyn = []; this.grid = new Map(); this.ground = () => -1e9; this.stamp = 0; this._out = []; }
  // Static box. Returns it so callers can keep a reference (box.on = false disables it).
  add(x0, y0, z0, x1, y1, z1, tag = null) {
    const b = { x0, y0, z0, x1, y1, z1, on: true, tag, s: 0 };
    this.boxes.push(b);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = cx + ',' + cz; (this.grid.get(k) || this.grid.set(k, []).get(k)).push(b);
    }
    return b;
  }
  // Dynamic box (doors): few of them, always tested, may be moved or switched off freely.
  addDynamic(x0, y0, z0, x1, y1, z1, tag = null) { const b = { x0, y0, z0, x1, y1, z1, on: true, tag, s: 0 }; this.dyn.push(b); return b; }
  query(x0, z0, x1, z1) {
    const out = this._out; out.length = 0; const st = ++this.stamp;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const a = this.grid.get(cx + ',' + cz); if (!a) continue;
      for (const b of a) if (b.s !== st && b.on) { b.s = st; out.push(b); }
    }
    for (const b of this.dyn) if (b.on && b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) out.push(b);
    return out;
  }
  // Move a vertical cylinder (feet at pos.y). Mutates pos and vel. Returns { onGround, hitWall }.
  move(pos, vel, r, h, dt, stepH = 0.45) {
    const res = { onGround: false, hitWall: false };
    const dist = Math.hypot(vel.x, vel.z) * dt, n = Math.max(1, Math.ceil(dist / (r * 0.5)));
    for (let i = 0; i < n; i++) {
      pos.x += vel.x * dt / n; pos.z += vel.z * dt / n;
      for (const b of this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
        if (b.y1 <= pos.y + stepH || b.y0 >= pos.y + h) continue;
        const cx = pos.x < b.x0 ? b.x0 : pos.x > b.x1 ? b.x1 : pos.x, cz = pos.z < b.z0 ? b.z0 : pos.z > b.z1 ? b.z1 : pos.z;
        let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        res.hitWall = true;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; pos.x += dx * p; pos.z += dz * p; }
        else { // centre is inside the box: leave by the nearest face
          const l = pos.x - b.x0, rr = b.x1 - pos.x, f = pos.z - b.z0, k = b.z1 - pos.z, m = Math.min(l, rr, f, k);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === f) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        }
      }
    }
    const oldY = pos.y; pos.y += vel.y * dt;
    let g = this.ground(pos.x, pos.z); const rs = r * 0.7;
    for (const b of this.query(pos.x - rs, pos.z - rs, pos.x + rs, pos.z + rs)) {
      if (b.x1 < pos.x - rs || b.x0 > pos.x + rs || b.z1 < pos.z - rs || b.z0 > pos.z + rs) continue;
      if (b.y1 <= oldY + stepH + 0.01 && b.y1 > g) g = b.y1;
      else if (vel.y > 0 && b.y0 >= oldY + h - 0.01 && pos.y + h > b.y0) { pos.y = b.y0 - h; vel.y = 0; }
    }
    if (pos.y <= g + 1e-4) { pos.y = g; if (vel.y < 0) vel.y = 0; res.onGround = true; }
    return res;
  }
  // Ray against the boxes (and terrain, coarsely). o, d: {x,y,z}, d normalised. Returns { t, box, nx, ny, nz } or null.
  raycast(o, d, maxT, ignoreTag = null) {
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT; let best = null, bt = maxT;
    for (const b of this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez))) {
      if (ignoreTag && b.tag === ignoreTag) continue;
      let t0 = 0, t1 = bt, ax = -1, sg = 0;
      for (let a = 0; a < 3; a++) {
        const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z, lo = a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0, hi = a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1;
        if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) { t0 = 1; t1 = 0; break; } continue; }
        let ta = (lo - oa) / da, tb = (hi - oa) / da, s = -1; if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
        if (ta > t0) { t0 = ta; ax = a; sg = s; } if (tb < t1) t1 = tb; if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < bt && ax >= 0) { bt = t0; best = { t: t0, box: b, nx: ax === 0 ? sg : 0, ny: ax === 1 ? sg : 0, nz: ax === 2 ? sg : 0 }; }
    }
    // Terrain: march in 1 m steps (only worlds that set a ground function pay for this).
    if (this.hasTerrain) for (let t = 0.5; t < bt; t += 1) { const y = o.y + d.y * t; if (y < this.ground(o.x + d.x * t, o.z + d.z * t)) { bt = t; best = { t, box: null, nx: 0, ny: 1, nz: 0 }; break; } }
    return best;
  }
  // Clear line between two points?
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz); if (l < 1e-4) return true;
    return !this.raycast(a, { x: dx / l, y: dy / l, z: dz / l }, l);
  }
}
