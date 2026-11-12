// Collects many boxes into one mesh per material, so a whole room is a handful of draw calls.
import * as THREE from 'three';
const FACES = [ // normal, then the two in-plane axes used for the corners and the UVs
  { n: [1, 0, 0], u: 2, v: 1 }, { n: [-1, 0, 0], u: 2, v: 1 }, { n: [0, 1, 0], u: 0, v: 2 }, { n: [0, -1, 0], u: 0, v: 2 }, { n: [0, 0, 1], u: 0, v: 1 }, { n: [0, 0, -1], u: 0, v: 1 },
];
export class Batch {
  constructor() { this.m = new Map(); }
  _b(mat) { let b = this.m.get(mat); if (!b) { b = { p: [], n: [], uv: [], c: [], i: [] }; this.m.set(mat, b); } return b; }
  // o: { color: 0xrrggbb tint, uv: metres per texture tile (default 2), skip: 'xXyYzZ' faces to leave out (lower = min side), shade: true darkens the lower part of side faces }
  box(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const b = this._b(mat), col = new THREE.Color(o.color ?? 0xffffff), tile = o.uv ?? 2, skip = o.skip || '', mn = [x0, y0, z0], mx = [x1, y1, z1];
    FACES.forEach((f, fi) => {
      if (skip.includes('XxYyZz'[fi])) return;
      const a = f.n[0] ? 0 : f.n[1] ? 1 : 2, pos = f.n[a] > 0, base = b.p.length / 3;
      for (let k = 0; k < 4; k++) {
        const cu = k === 1 || k === 2, cv = k >= 2, p = [0, 0, 0];
        p[a] = pos ? mx[a] : mn[a]; p[f.u] = cu ? mx[f.u] : mn[f.u]; p[f.v] = cv ? mx[f.v] : mn[f.v];
        b.p.push(p[0], p[1], p[2]); b.n.push(f.n[0], f.n[1], f.n[2]); b.uv.push(p[f.u] / tile, p[f.v] / tile);
        const s = o.shade && a !== 1 ? (cv ? 1 : 0.62) : a === 1 && !pos ? 0.8 : 1;
        b.c.push(col.r * s, col.g * s, col.b * s);
      }
      // Winding depends on which side the face looks toward.
      const flip = (a === 0 && pos) || (a === 1 && pos) || (a === 2 && !pos);
      if (flip) b.i.push(base, base + 2, base + 1, base, base + 3, base + 2); else b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  build() {
    const g = new THREE.Group();
    for (const [mat, b] of this.m) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.setIndex(b.i);
      g.add(new THREE.Mesh(geo, mat));
    }
    return g;
  }
}
