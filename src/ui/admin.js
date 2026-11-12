// Admin panel, behind the code 4310. Lets the owner bend the game while playing: god mode, noclip, movement tuning,
// spawning machines, skipping rooms and chapters. Once unlocked it stays unlocked for the session.
import { G } from '../core/engine.js';
import { el } from '../core/util.js';
import { ORDER } from '../scenes/index.js';

const CODE = '4310';
let unlocked = false;
export function openAdmin(root, game, back) {
  if (!unlocked) return keypad(root, game, back);
  const c = game.player.cheat, ch = game.chapter, inPlay = !!ch;
  root.className = 'menu on admin';
  const tog = (k, label) => `<button data-t="${k}" class="${c[k] ? 'sel' : ''}">${label}</button>`;
  const sl = (k, label, min, max, step) => `<div class="row"><span>${label} <em data-v="${k}">${c[k]}</em></span><input type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}" data-c="${k}"></div>`;
  root.innerHTML = `<div class="panel wide"><h1>ADMIN</h1>
    <div class="grid">${tog('god', 'GOD MODE')}${tog('noclip', 'NOCLIP')}${tog('oneHit', 'ONE-HIT SHUTDOWN')}<button data-x="fps" class="${game.hud.showFps ? 'sel' : ''}">SHOW FPS</button></div>
    ${sl('speed', 'SPEED', 0.5, 4, 0.1)}${sl('jump', 'JUMP', 0.5, 4, 0.1)}${sl('gravity', 'GRAVITY', 0.1, 2, 0.05)}${sl('fov', 'FOV', 50, 120, 1)}
    <div class="row"><span>TIME <em data-v="ts">${G.timeScale}</em></span><input type="range" min="0.1" max="3" step="0.1" value="${G.timeScale}" data-ts="1"></div>
    <h3>SPAWN</h3><div class="grid">${['trooper', 'scout', 'heavy', 'drone', 'armored'].map((t) => `<button data-sp="${t}">${t.toUpperCase()}</button>`).join('')}</div>
    <h3>WORLD</h3><div class="grid"><button data-x="heal">FULL HEALTH</button><button data-x="maxhp">+10 MAX HEALTH</button><button data-x="shutdown">SHUT DOWN ALL</button><button data-x="next">SKIP ROOM</button><button data-x="prev">BACK A ROOM</button><button data-x="key">GIVE KEYCARD</button><button data-x="die">KILL ME</button></div>
    <h3>CHAPTER</h3><div class="grid">${ORDER.map((id) => `<button data-ch="${id}">${id.toUpperCase()}</button>`).join('')}</div>
    <p class="note" data-note>${inPlay ? '' : 'Start a game to use spawn and world tools.'}</p>
    <button data-x="back" class="big">BACK</button></div>`;
  const note = (t) => { root.querySelector('[data-note]').textContent = t; };
  const on = (sel, f) => root.querySelectorAll(sel).forEach((b) => b.addEventListener(b.tagName === 'INPUT' ? 'input' : 'click', () => f(b)));
  on('[data-t]', (b) => { c[b.dataset.t] = !c[b.dataset.t]; b.classList.toggle('sel', c[b.dataset.t]); });
  on('[data-c]', (i) => { c[i.dataset.c] = parseFloat(i.value); root.querySelector(`[data-v="${i.dataset.c}"]`).textContent = i.value; });
  on('[data-ts]', (i) => { G.timeScale = parseFloat(i.value); root.querySelector('[data-v="ts"]').textContent = i.value; });
  on('[data-sp]', (b) => {
    if (!game.chapter || !game.chapter.level) return note('Spawning needs the ship deck.');
    const r = game.chapter.state.cur, pl = game.player, nav = r.nav; if (!nav) return note('No room for it in a hallway.');
    // Nearest free cell about 6 m in front of the player, inside the current room.
    const f = { x: -Math.sin(pl.yaw), z: -Math.cos(pl.yaw) }; let best = null, bd = 1e9;
    for (let j = 1; j < nav.d - 1; j++) for (let i = 1; i < nav.w - 1; i++) { if (nav.blocked[j * nav.w + i]) continue; const x = r.x0 + i + 0.5, z = r.z0 + j + 0.5, d = Math.hypot(x - (pl.pos.x + f.x * 6), z - (pl.pos.z + f.z * 6)); if (d < bd && Math.hypot(x - pl.pos.x, z - pl.pos.z) > 2.5) { bd = d; best = { x, z }; } }
    if (best) { game.enemies.spawn(b.dataset.sp, best.x, best.z, r, {}); note('Spawned ' + b.dataset.sp + '.'); }
  });
  on('[data-ch]', (b) => { game.startChapter(b.dataset.ch, { fresh: true }); });
  on('[data-x]', (b) => {
    const x = b.dataset.x, pl = game.player, fac = game.chapter && game.chapter.skipTo ? game.chapter : null;
    if (x === 'back') return back();
    if (x === 'fps') { game.hud.showFps = !game.hud.showFps; game.hud.e.fps.textContent = ''; b.classList.toggle('sel'); return; }
    if (!game.chapter) return note('Start a game first.');
    if (x === 'heal') { pl.hp = pl.maxHp; note('Health restored.'); }
    if (x === 'maxhp') { pl.maxHp += 10; pl.hp = pl.maxHp; note('Max health ' + pl.maxHp + '.'); }
    if (x === 'shutdown') { for (const e of game.enemies.list) if (e.state !== 'disabled') game.enemies.disable(e); note('All machines shut down.'); }
    if (x === 'die') { pl.cheat.god = false; pl.hurt(9999); back(); game.resume(); }
    if (x === 'key') { if (fac) { fac.giveKey(); note('Keycard given.'); } else note('No keycard here.'); }
    if (x === 'next' || x === 'prev') { if (!fac) return note('Room skipping needs the ship deck.'); const lv = fac.level; let i = lv.main.indexOf(fac.state.cur.id); if (i < 0) i = lv.main.findIndex((id) => lv.rooms[id].links.includes(fac.state.cur.id)); fac.skipTo(i + (x === 'next' ? 1 : -1)); note('Moved to room ' + (lv.main.indexOf(fac.state.cur.id) + 1) + ' of ' + lv.main.length + '.'); }
  });
}
function keypad(root, game, back) {
  root.className = 'menu on admin'; let code = '';
  root.innerHTML = `<div class="panel"><h1>ADMIN</h1><p class="tag">ENTER CODE</p><div class="code">----</div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div><button data-k="back" class="dim">BACK</button></div>`;
  const show = root.querySelector('.code');
  const press = (k) => {
    if (k === 'back') { removeEventListener('keydown', key); return back(); }
    if (k === 'C') code = ''; else if (k === '←') code = code.slice(0, -1); else if (code.length < 4) code += k;
    show.textContent = code.padEnd(4, '-'); show.classList.remove('bad');
    if (code.length === 4) { if (code === CODE) { unlocked = true; removeEventListener('keydown', key); G.audio.play('key', 0.8); openAdmin(root, game, back); } else { show.classList.add('bad'); code = ''; G.audio.play('lock', 0.6); } }
  };
  const key = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('←'); };
  addEventListener('keydown', key);
  root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
}
export const adminUnlock = () => { unlocked = true; };
