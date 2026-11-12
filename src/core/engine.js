// Renderer, graphics modes, materials and the game clock. Everything shares the one context object G.
import * as THREE from 'three';
import { Bus } from './util.js';
import { save } from './save.js';

export const G = {
  renderer: null, camera: null, scene: null, canvas: null,
  mode: 'retro',            // 'retro' | 'real'
  bus: new Bus(),
  time: 0,                  // game time in seconds (pauses, scales and hit-stops with the game)
  timeScale: 1,             // debug: tests run the game faster than the software renderer can draw
  hitStop: 0,               // seconds of frozen gameplay left (kills feel heavy)
  paused: true,
  game: null, input: null, audio: null,
  touch: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  debug: typeof location !== 'undefined' && /[?&]debug/.test(location.search),
  fps: 60,
};
export const VIEW_LAYER = 1; // first-person body: drawn in a second pass over a cleared depth buffer so it never pokes through walls

const RETRO_H = 360;
const texs = new Set();

export function initEngine(canvas) {
  G.canvas = canvas;
  const r = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  r.autoClear = false;
  r.outputColorSpace = THREE.SRGBColorSpace;
  G.camera = new THREE.PerspectiveCamera(80, 1, 0.06, 400);
  G.camera.rotation.order = 'YXZ';
  G.mode = save.data.settings.gfx;
  applyMode();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.paused = true; });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  return r;
}

function resize() {
  const w = innerWidth, h = innerHeight, r = G.renderer;
  // Retro renders about 360 lines and lets the browser scale it up with hard pixels: far fewer pixels to fill, which is what phones are slow at.
  const pr = G.mode === 'retro' ? Math.min(1, RETRO_H / h) : Math.min(devicePixelRatio || 1, G.touch ? 1.5 : 2);
  r.setPixelRatio(pr);
  r.setSize(w, h, false);
  G.canvas.style.width = w + 'px'; G.canvas.style.height = h + 'px';
  G.canvas.style.imageRendering = G.mode === 'retro' ? 'pixelated' : 'auto';
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
}

function applyMode() {
  const real = G.mode === 'real', r = G.renderer;
  r.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  r.toneMappingExposure = 1.15;
  for (const t of texs) setFilter(t);
  resize();
}
function setFilter(t) {
  const real = G.mode === 'real';
  t.magFilter = real ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = real ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
  t.anisotropy = real ? 4 : 1;
  t.needsUpdate = true;
}
// Register a texture so its filtering follows the graphics mode (hard pixels in retro, smooth in realistic).
export function regTex(t) { texs.add(t); setFilter(t); return t; }

// Every surface material is made here, as a pair: a cheap Lambert for retro and a Standard for realistic.
// opts: color, map, emissive, emissiveIntensity, rough, metal, transparent, opacity, vertexColors, side, flat, depthWrite, fog
export function makeMat(o = {}) {
  const common = { color: o.color ?? 0xffffff, map: o.map || null, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, emissiveMap: o.emissiveMap || null,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true, fog: o.fog ?? true };
  const retro = new THREE.MeshLambertMaterial({ ...common, flatShading: o.flat ?? false });
  const real = new THREE.MeshStandardMaterial({ ...common, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0.1, flatShading: o.flat ?? false });
  retro.userData.alt = real; real.userData.alt = retro; retro.userData.mode = 'retro'; real.userData.mode = 'real';
  return G.mode === 'real' ? real : retro;
}
// Swap every paired material under root to the current mode. Shader and basic materials have no pair and are left alone.
export function syncMaterials(root) {
  root.traverse((o) => {
    if (!o.material) return;
    const fix = (m) => (m.userData.alt && m.userData.mode !== G.mode ? m.userData.alt : m);
    if (Array.isArray(o.material)) o.material = o.material.map(fix); else {
      const m = fix(o.material);
      if (m !== o.material) { m.color.copy(o.material.color); m.emissive.copy(o.material.emissive); m.emissiveIntensity = o.material.emissiveIntensity; m.opacity = o.material.opacity; o.material = m; }
    }
  });
}
export function setMode(mode) {
  if (mode === G.mode) return;
  G.mode = mode; save.data.settings.gfx = mode; save.write();
  applyMode();
  if (G.scene) syncMaterials(G.scene);
  G.bus.emit('mode', mode);
}

// Screen shake: systems add trauma, the camera offset is applied at render time only (never fed back into aim).
let trauma = 0;
export const shake = (amt) => { trauma = Math.min(1, trauma + amt); };

export function render(realDt) {
  const r = G.renderer, cam = G.camera;
  if (!G.scene) return;
  trauma = Math.max(0, trauma - realDt * 1.8);
  const s = trauma * trauma, t = performance.now() * 0.001;
  const ox = Math.sin(t * 61) * 0.022 * s, oy = Math.sin(t * 53 + 2) * 0.022 * s, oz = Math.sin(t * 47 + 4) * 0.03 * s;
  cam.rotation.x += ox; cam.rotation.y += oy; cam.rotation.z += oz;
  cam.updateMatrixWorld(true);
  // Chapters set scene.userData.bg, never scene.background: a background would wipe the first pass when the body is drawn.
  r.setClearColor(G.scene.userData.bg ?? 0x000000, 1); r.clear();
  cam.layers.set(0); r.render(G.scene, cam);
  r.clearDepth();
  cam.layers.set(VIEW_LAYER); r.render(G.scene, cam);
  cam.layers.set(0);
  cam.rotation.x -= ox; cam.rotation.y -= oy; cam.rotation.z -= oz;
}

// One fixed-ish simulation step. Hit-stop freezes gameplay but is measured in game time, so sped-up tests are not held back by it.
export function step(dt) {
  if (G.hitStop > 0) { G.hitStop -= dt; G.game.updateFrozen(dt); return; }
  G.time += dt;
  G.game.update(dt);
}
let last = 0;
export function startLoop() {
  const frame = (now) => {
    requestAnimationFrame(frame);
    const realDt = Math.min((now - last) / 1000, 0.1); last = now;
    G.fps += (1 / Math.max(realDt, 0.001) - G.fps) * 0.05;
    if (!G.paused) {
      let acc = realDt * G.timeScale, n = 0;
      while (acc > 1e-5 && n++ < 12) { const h = Math.min(acc, 1 / 30); step(h); acc -= h; }
    }
    G.game.frame(realDt);
    render(realDt);
  };
  requestAnimationFrame((t) => { last = t; frame(t); });
}
