// Procedural machine models: three security androids and two drones, built from scaled boxes so they are cheap,
// share one look, and can be posed joint by joint. Model front is -Z. Each returns { root, parts, mats }.
import * as THREE from 'three';
import { makeMat } from '../core/engine.js';

let BOX = null, ICO = null, OCT = null, CYL = null;
const STYLE = {
  trooper: { s: 1, bulk: 1, body: 0xc9ced3, dark: 0x3a4047, trim: 0xe2832a, eye: 0xff5a2a },
  scout: { s: 0.9, bulk: 0.72, body: 0x35506e, dark: 0x1c232b, trim: 0x57e06a, eye: 0x6aff5a },
  heavy: { s: 1.2, bulk: 1.5, body: 0x565d66, dark: 0x24282d, trim: 0xb02a2a, eye: 0xff2a2a },
  drone: { body: 0xb9bec4, dark: 0x30353b, trim: 0xe2c02a, eye: 0xffe14a },
  armored: { body: 0x6b7178, dark: 0x25292e, trim: 0xe2832a, eye: 0xff8a1e },
};
export function buildModel(type) {
  BOX = BOX || new THREE.BoxGeometry(1, 1, 1); ICO = ICO || new THREE.IcosahedronGeometry(1, 0); OCT = OCT || new THREE.OctahedronGeometry(1, 0); CYL = CYL || new THREE.CylinderGeometry(1, 1, 1, 8);
  const st = STYLE[type];
  const mats = { body: makeMat({ color: st.body, flat: true, rough: 0.5, metal: 0.6 }), dark: makeMat({ color: st.dark, flat: true, rough: 0.6, metal: 0.5 }), trim: makeMat({ color: st.trim, flat: true, rough: 0.5, metal: 0.3 }), eye: new THREE.MeshBasicMaterial({ color: st.eye }) };
  const root = new THREE.Group(), parts = { eyeColor: st.eye };
  const box = (parent, mat, sx, sy, sz, x = 0, y = 0, z = 0, geo = BOX) => { const m = new THREE.Mesh(geo, mats[mat]); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  if (type === 'drone' || type === 'armored') {
    const A = type === 'armored', hull = parts.hull = grp(root, 0, 0, 0);
    if (!A) {
      box(hull, 'body', 0.36, 0.3, 0.36, 0, 0, 0, ICO); box(hull, 'dark', 0.5, 0.08, 0.5, 0, 0.02, 0, CYL); box(hull, 'eye', 0.13, 0.13, 0.08, 0, -0.02, -0.33, ICO);
      parts.gun = box(hull, 'dark', 0.07, 0.07, 0.42, 0, -0.24, -0.2); parts.rotors = [];
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5, arm = grp(hull, Math.sin(a) * 0.55, 0.08, Math.cos(a) * 0.55); box(hull, 'dark', 0.05, 0.04, 0.5, Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.3).rotation.y = a; box(arm, 'trim', 0.24, 0.02, 0.05); box(arm, 'trim', 0.05, 0.02, 0.24); parts.rotors.push(arm); }
    } else {
      box(hull, 'body', 0.55, 0.42, 0.55, 0, 0, 0, OCT); box(hull, 'dark', 0.42, 0.5, 0.42, 0, 0, 0, CYL); box(hull, 'eye', 0.34, 0.06, 0.06, 0, 0.05, -0.43);
      parts.plates = []; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, hinge = grp(hull, Math.sin(a) * 0.42, 0.34, Math.cos(a) * 0.42); hinge.rotation.y = a; box(hinge, 'body', 0.5, 0.62, 0.07, 0, -0.3, 0.06); box(hinge, 'trim', 0.5, 0.06, 0.08, 0, -0.56, 0.06); parts.plates.push(hinge); }
      parts.gun = box(hull, 'dark', 0.5, 0.14, 0.3, 0, -0.42, -0.1); box(hull, 'trim', 0.1, 0.1, 0.06, -0.15, -0.42, -0.27); box(hull, 'trim', 0.1, 0.1, 0.06, 0.15, -0.42, -0.27);
      parts.rotors = []; for (const sx of [-1, 1]) { const arm = grp(hull, sx * 0.75, 0.3, 0); box(hull, 'dark', 0.5, 0.06, 0.1, sx * 0.5, 0.26, 0); box(arm, 'trim', 0.4, 0.02, 0.06); box(arm, 'trim', 0.06, 0.02, 0.4); parts.rotors.push(arm); }
    }
    return { root, parts, mats };
  }
  // Android: hips -> legs, torso -> head and arms. Sizes in metres at scale 1 (about 1.9 m tall).
  const s = st.s, b = st.bulk, leg = 0.9 * s;
  const hips = parts.hips = grp(root, 0, leg, 0); parts.legLen = leg;
  box(hips, 'dark', 0.36 * b, 0.18 * s, 0.24 * b);
  parts.legs = []; parts.knees = [];
  for (const sx of [-1, 1]) {
    const hip = grp(hips, sx * 0.13 * b, -0.05, 0); box(hip, 'body', 0.15 * b, 0.42 * s, 0.17 * b, 0, -0.21 * s, 0);
    const knee = grp(hip, 0, -0.43 * s, 0); box(knee, 'dark', 0.12 * b, 0.42 * s, 0.14 * b, 0, -0.21 * s, 0); box(knee, 'body', 0.16 * b, 0.08 * s, 0.3 * b, 0, -0.43 * s, -0.05); box(knee, 'trim', 0.13 * b, 0.1 * s, 0.03, 0, -0.08 * s, -0.08 * b);
    parts.legs.push(hip); parts.knees.push(knee);
  }
  const torso = parts.torso = grp(hips, 0, 0.08 * s, 0);
  box(torso, 'body', 0.48 * b, 0.5 * s, 0.3 * b, 0, 0.3 * s, 0); box(torso, 'dark', 0.34 * b, 0.16 * s, 0.24 * b, 0, 0.04 * s, 0); box(torso, 'trim', 0.2 * b, 0.12 * s, 0.03, 0, 0.36 * s, -0.16 * b); box(torso, 'dark', 0.3 * b, 0.34 * s, 0.14 * b, 0, 0.32 * s, 0.2 * b);
  const head = parts.head = grp(torso, 0, 0.6 * s, 0);
  box(head, 'body', 0.22 * s, 0.24 * s, 0.24 * s, 0, 0.12 * s, 0); parts.visor = box(head, 'eye', 0.2 * s, 0.06 * s, 0.03, 0, 0.14 * s, -0.125 * s); if (type === 'scout') box(head, 'dark', 0.03, 0.2 * s, 0.03, 0.09 * s, 0.32 * s, 0.05);
  if (type === 'heavy') box(head, 'dark', 0.3 * s, 0.1 * s, 0.3 * s, 0, 0.27 * s, 0);
  parts.arms = []; parts.elbows = [];
  for (const sx of [-1, 1]) {
    const sh = grp(torso, sx * 0.31 * b, 0.48 * s, 0); box(sh, 'trim', 0.17 * b, 0.15 * s, 0.2 * b); box(sh, 'body', 0.12 * b, 0.34 * s, 0.13 * b, 0, -0.2 * s, 0);
    const el = grp(sh, 0, -0.38 * s, 0); box(el, 'dark', 0.1 * b, 0.32 * s, 0.11 * b, 0, -0.16 * s, 0);
    parts.arms.push(sh); parts.elbows.push(el);
  }
  // Weapon: troopers and scouts carry it in the right hand; the heavy has a cannon on its right shoulder.
  if (type === 'heavy') { const c = parts.cannon = grp(torso, 0.34 * b, 0.72 * s, 0); box(c, 'dark', 0.26, 0.26, 0.9, 0, 0, -0.15); parts.gun = box(c, 'eye', 0.14, 0.14, 0.06, 0, 0, -0.62); box(c, 'trim', 0.3, 0.06, 0.3, 0, 0.16, 0.1); }
  else { const len = type === 'scout' ? 0.42 : 0.6, gun = grp(parts.elbows[1], 0, -0.3 * s, -0.03); box(gun, 'dark', 0.08, len, 0.13, 0, -len / 2 + 0.12, 0); parts.gun = box(gun, 'eye', 0.045, 0.05, 0.045, 0, -len + 0.1, 0); }
  return { root, parts, mats };
}
