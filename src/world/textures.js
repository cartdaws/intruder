// Procedural surface textures for the ship: drawn once on small canvases, so the game downloads no images
// and every room shares one industrial look. Retro shows them with hard pixels, realistic filters them.
import * as THREE from 'three';
import { regTex, makeMat } from '../core/engine.js';
import { rng } from '../core/util.js';

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size, rng(size * 7 + draw.length));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return regTex(t);
}
const grime = (g, s, r, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; const w = 1 + r() * 6; g.fillRect(r() * s, r() * s, w, 1 + r() * 10); } };
const speck = (g, s, r, n, col) => { g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect((r() * s) | 0, (r() * s) | 0, 1, 1); };
const D = {
  wall(g, s, r) { g.fillStyle = '#8b939b'; g.fillRect(0, 0, s, s); speck(g, s, r, 500, 'rgba(255,255,255,.06)'); grime(g, s, r, 60, 0.18);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(0, s / 2, s, 1);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 2, s, 1); g.fillRect(2, 0, 1, s);
    g.fillStyle = '#5f666d'; for (const [x, y] of [[5, 6], [s - 7, 6], [5, s - 6], [s - 7, s - 6]]) g.fillRect(x, y, 2, 2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(s * 0.6, s * 0.62, s * 0.28, s * 0.2); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(s * 0.62, s * 0.64, s * 0.24, 1); },
  floor(g, s, r) { g.fillStyle = '#6d747b'; g.fillRect(0, 0, s, s); speck(g, s, r, 700, 'rgba(0,0,0,.12)'); grime(g, s, r, 40, 0.15);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
    g.fillStyle = 'rgba(255,255,255,.1)'; for (let y = 8; y < s; y += 8) for (let x = 8 + ((y / 8) % 2) * 4; x < s; x += 8) g.fillRect(x, y, 3, 1); },
  ceil(g, s, r) { g.fillStyle = '#565c63'; g.fillRect(0, 0, s, s); grime(g, s, r, 30, 0.2); g.fillStyle = 'rgba(0,0,0,.5)'; for (let x = 0; x < s; x += s / 4) g.fillRect(x, 0, 2, s); g.fillRect(0, 0, s, 3); },
  hazard(g, s) { g.fillStyle = '#d9a514'; g.fillRect(0, 0, s, s); g.fillStyle = '#16181b'; for (let i = -s; i < s * 2; i += s / 2) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s / 4, s); g.lineTo(i + s / 4 + s, 0); g.lineTo(i + s, 0); g.fill(); } },
  crate(g, s, r) { g.fillStyle = '#7d6a4a'; g.fillRect(0, 0, s, s); grime(g, s, r, 50, 0.2); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(2, 2, s - 4, s - 4); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.strokeRect(5, 5, s - 10, s - 10);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(s * 0.2, s * 0.42, s * 0.6, s * 0.16); g.fillStyle = '#d9a514'; g.fillRect(s * 0.25, s * 0.47, s * 0.2, s * 0.06); },
  tech(g, s, r) { g.fillStyle = '#3d444c'; g.fillRect(0, 0, s, s); grime(g, s, r, 30, 0.25); g.fillStyle = '#20252b'; g.fillRect(4, 6, s - 8, s * 0.4);
    for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? '#35e0c8' : r() < 0.5 ? '#e06a2a' : '#8fa0b0'; g.fillRect(6 + ((r() * (s - 14)) | 0), 8 + ((r() * s * 0.34) | 0), 1 + ((r() * 5) | 0), 1); }
    g.fillStyle = 'rgba(0,0,0,.5)'; for (let y = s * 0.56; y < s - 4; y += 4) g.fillRect(6, y, s - 12, 2); },
  door(g, s, r) { g.fillStyle = '#7b848d'; g.fillRect(0, 0, s, s); grime(g, s, r, 30, 0.15); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(s / 2 - 1, 0, 2, s); g.fillRect(0, 0, s, 2); g.fillRect(0, s - 2, s, 2);
    g.fillStyle = '#d9a514'; g.fillRect(0, s * 0.42, s, s * 0.08); g.fillStyle = '#16181b'; for (let x = 0; x < s; x += 8) g.fillRect(x, s * 0.42, 4, s * 0.08); },
  metal(g, s, r) { g.fillStyle = '#9aa2aa'; g.fillRect(0, 0, s, s); speck(g, s, r, 400, 'rgba(0,0,0,.1)'); grime(g, s, r, 25, 0.12); },
};
let lib = null;
// One shared material per surface kind. vertexColors lets the level builder tint and shade each box.
export function shipMats() {
  if (lib) return lib;
  const T = {}; for (const k in D) T[k] = canvasTex(64, D[k]);
  const m = (k, o = {}) => makeMat({ map: T[k], vertexColors: true, rough: 0.75, metal: 0.35, ...o });
  lib = { tex: T, wall: m('wall'), floor: m('floor', { rough: 0.6 }), ceil: m('ceil'), hazard: m('hazard'), crate: m('crate', { metal: 0.05 }), tech: m('tech'), door: m('door', { vertexColors: false }), metal: m('metal', { metal: 0.6, rough: 0.45 }) };
  return lib;
}
