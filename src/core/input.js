// One input layer for keyboard+mouse and touch. Gameplay only ever reads actions from here:
//   input.move {x,y}   strafe / forward, -1..1
//   input.consumeLook() -> {dx,dy} radians since last call
//   input.held('fire'|'jump'), input.pressed('jump'|'use'|'pause')  (pressed = went down this step)
// 'use' is the single context button: absorb a shut-down machine, or interact.
import { G } from './engine.js';
import { save } from './save.js';
import { el, clamp } from './util.js';

const held = new Set(), pressed = new Set();
const move = { x: 0, y: 0 };
let lookX = 0, lookY = 0;
const keys = new Set();
const KEYMAP = { Space: 'jump', KeyE: 'use', KeyF: 'use', Escape: 'pause', KeyP: 'pause' };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const looks = new Map(); // touch id -> last position
let root = null, stickEl = null, knobEl = null;

function down(a) { if (!held.has(a)) pressed.add(a); held.add(a); }
function up(a) { held.delete(a); }

export const input = {
  move, enabled: true,
  held: (a) => input.enabled && held.has(a),
  pressed: (a) => input.enabled && pressed.has(a),
  consumeLook() { const o = { dx: lookX, dy: lookY }; lookX = lookY = 0; return input.enabled ? o : { dx: 0, dy: 0 }; },
  endStep() { pressed.clear(); },
  // Tests and the playtest bot drive the same actions the player does.
  inject: { down, up, look(dx, dy) { lookX += dx; lookY += dy; }, move(x, y) { inj.x = x; inj.y = y; inj.on = true; }, release() { inj.on = false; held.clear(); } },
  locked: () => document.pointerLockElement === G.canvas,
  lock() { if (!G.touch && G.canvas.requestPointerLock) { try { const p = G.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignored */ } } },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  showTouch(v) { if (root) root.style.display = v && G.touch ? 'block' : 'none'; },
  setUseLabel(label, hot) { if (!useBtn) return; useBtn.textContent = label; useBtn.classList.toggle('hot', !!hot); },
  update() {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (stick.id !== null) { x += stick.x; y += stick.y; }
    if (inj.on) { x = inj.x; y = inj.y; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    move.x = input.enabled ? x : 0; move.y = input.enabled ? y : 0;
  },
};
const inj = { on: false, x: 0, y: 0 };
let useBtn = null;

export function initInput(ui) {
  G.input = input;
  addEventListener('keydown', (e) => { if (e.repeat) return; if (e.target && e.target.tagName === 'INPUT') return; keys.add(e.code); const a = KEYMAP[e.code]; if (a) { down(a); if (e.code === 'Space') e.preventDefault(); } });
  addEventListener('keyup', (e) => { keys.delete(e.code); const a = KEYMAP[e.code]; if (a) up(a); });
  addEventListener('blur', () => { keys.clear(); held.clear(); });
  G.canvas.addEventListener('mousedown', (e) => { if (G.touch) return; if (!input.locked()) { if (!G.paused) input.lock(); } if (e.button === 0) down('fire'); if (e.button === 2) down('use'); });
  addEventListener('mouseup', (e) => { if (e.button === 0) up('fire'); if (e.button === 2) up('use'); });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!input.locked()) return;
    const s = 0.0022 * save.data.settings.sens;
    // Browsers occasionally report one huge bogus delta when the pointer lock starts; drop it.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    lookX += e.movementX * s; lookY += e.movementY * s * (save.data.settings.invertY ? -1 : 1);
  });
  document.addEventListener('pointerlockchange', () => { if (!input.locked() && !G.paused && !G.touch && !G.debug) G.bus.emit('lostLock'); });
  buildTouch(ui);
}

function buildTouch(ui) {
  root = el('div', 'touch');
  root.innerHTML = `<div class="stick"><i></i></div>
    <button class="tb fire" data-act="fire" aria-label="fire"></button>
    <button class="tb jump" data-act="jump">JUMP</button>
    <button class="tb use" data-act="use">ABSORB</button>
    <button class="tb pause" data-act="pause">II</button>`;
  ui.appendChild(root);
  stickEl = root.querySelector('.stick'); knobEl = stickEl.firstChild; useBtn = root.querySelector('.use');
  root.style.display = 'none';
  const R = 56;
  const roles = new Map(); // touch id -> { act, look }
  root.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const act = t.target.dataset && t.target.dataset.act;
      if (act) { down(act); roles.set(t.identifier, { act, look: act === 'fire' }); if (act === 'fire') looks.set(t.identifier, { x: t.clientX, y: t.clientY }); continue; }
      if (t.clientX < innerWidth * 0.42 && stick.id === null) {
        stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = stick.y = 0;
        stickEl.style.display = 'block'; stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; knobEl.style.transform = '';
        roles.set(t.identifier, { stick: true });
      } else { looks.set(t.identifier, { x: t.clientX, y: t.clientY }); roles.set(t.identifier, { look: true }); }
    }
  }, { passive: false });
  root.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = roles.get(t.identifier); if (!r) continue;
      if (r.stick) {
        let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        stick.x = dx / R; stick.y = -dy / R; knobEl.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (r.look) {
        const p = looks.get(t.identifier); const s = 0.0055 * save.data.settings.sens;
        lookX += (t.clientX - p.x) * s; lookY += (t.clientY - p.y) * s * (save.data.settings.invertY ? -1 : 1);
        p.x = t.clientX; p.y = t.clientY;
      }
    }
  }, { passive: false });
  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = roles.get(t.identifier); if (!r) continue; roles.delete(t.identifier); looks.delete(t.identifier);
      if (r.act) up(r.act);
      if (r.stick) { stick.id = null; stick.x = stick.y = 0; stickEl.style.display = 'none'; }
    }
  };
  root.addEventListener('touchend', end, { passive: false }); root.addEventListener('touchcancel', end, { passive: false });
}
export { clamp };
