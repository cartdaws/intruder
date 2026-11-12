// Start menu, pause menu, options, death and deck-complete screens. Plain DOM over the canvas.
import { G, setMode } from '../core/engine.js';
import { save } from '../core/save.js';
import { el } from '../core/util.js';
import { openAdmin } from './admin.js';

export class Menu {
  constructor(ui, game) {
    this.game = game; this.root = el('div', 'menu'); ui.appendChild(this.root);
    G.bus.on('paused', () => this.pause()); G.bus.on('menu', () => this.main());
    G.bus.on('deathScreen', () => this.death()); G.bus.on('deckDone', () => this.deckDone());
    G.bus.on('resumed', () => this.hide()); G.bus.on('chapter', () => this.hide());
  }
  hide() { this.root.className = 'menu'; this.root.innerHTML = ''; }
  _screen(cls, html) { this.root.className = 'menu on ' + cls; this.root.innerHTML = html; this.root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { G.audio.unlock(); G.audio.play('ui', 0.6); this._act(b.dataset.a); })); }
  _act(a) {
    const g = this.game;
    if (a === 'continue') g.continueGame();
    else if (a === 'new') { if (save.data.introSeen) this.newChoice(); else g.newGame(false); }
    else if (a === 'newIntro') g.newGame(false);
    else if (a === 'newSkip') g.newGame(true);
    else if (a === 'options') this.options(this.root.classList.contains('pause') ? 'pause' : 'main');
    else if (a === 'admin') openAdmin(this.root, g, () => (g.state === 'menu' ? this.main() : this.pause()));
    else if (a === 'resume') g.resume();
    else if (a === 'retry') g.retry();
    else if (a === 'quit') g.toMenu();
    else if (a === 'main') this.main(); else if (a === 'pause') this.pause();
  }
  main() {
    const run = save.data.run;
    this._screen('main', `<div class="panel"><h1>INTRUDER</h1><p class="tag">THEY TOOK YOUR WORLD. TAKE IT BACK.</p>
      ${run ? '<button data-a="continue" class="big">CONTINUE</button>' : ''}
      <button data-a="new" class="${run ? '' : 'big'}">NEW GAME</button><button data-a="options">OPTIONS</button><button data-a="admin" class="dim">ADMIN</button></div>
      <div class="build">BUILD ${__BUILD__}</div>`);
  }
  newChoice() { this._screen('main', `<div class="panel"><h1>NEW GAME</h1><p class="tag">YOU HAVE SEEN THE OPENING</p><button data-a="newIntro" class="big">PLAY FROM THE BEGINNING</button><button data-a="newSkip">SKIP TO THE ESCAPE</button><button data-a="main" class="dim">BACK</button></div>`); }
  pause() { this._screen('pause', `<div class="panel"><h1>PAUSED</h1><button data-a="resume" class="big">RESUME</button><button data-a="options">OPTIONS</button><button data-a="retry">RESTART FROM CHECKPOINT</button><button data-a="admin" class="dim">ADMIN</button><button data-a="quit" class="dim">QUIT TO MENU</button></div><div class="build">BUILD ${__BUILD__}</div>`); }
  death() { this._screen('death', `<div class="panel"><h1>SPECIMEN LOST</h1><p class="tag">VIGIL: RETURN IT TO CONTAINMENT.</p><button data-a="retry" class="big">TRY AGAIN</button><button data-a="quit" class="dim">QUIT TO MENU</button></div>`); }
  deckDone() {
    const pl = this.game.player; G.input.showTouch(false); G.input.unlock(); G.paused = true; G.audio.ambience(null);
    this._screen('done', `<div class="panel"><h1>DECK 7 CLEARED</h1><p class="tag">THE LIFT CLIMBS. THE SHIP IS STILL BETWEEN YOU AND HOME.</p><p class="stat">MACHINES ABSORBED &nbsp; ${pl.absorbed || 0}<br>MAX HEALTH &nbsp; ${pl.maxHp}</p><p class="tag">TO BE CONTINUED</p><button data-a="quit" class="big">MAIN MENU</button></div>`);
  }
  options(back) {
    const s = save.data.settings;
    this._screen(back === 'pause' ? 'pause' : 'main', `<div class="panel"><h1>OPTIONS</h1>
      <div class="row"><span>GRAPHICS</span><div class="seg"><button data-g="retro" class="${s.gfx === 'retro' ? 'sel' : ''}">RETRO</button><button data-g="real" class="${s.gfx === 'real' ? 'sel' : ''}">REALISTIC</button></div></div>
      <div class="row"><span>LOOK SPEED</span><input type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}" data-s="sens"></div>
      <div class="row"><span>VOLUME</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></div>
      <div class="row"><span>INVERT LOOK</span><div class="seg"><button data-i="0" class="${s.invertY ? '' : 'sel'}">OFF</button><button data-i="1" class="${s.invertY ? 'sel' : ''}">ON</button></div></div>
      <button data-a="${back}" class="big">BACK</button></div>`);
    this.root.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.g); this.options(back); }));
    this.root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { s.invertY = b.dataset.i === '1'; save.write(); this.options(back); }));
    this.root.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('input', () => { const v = parseFloat(i.value); if (i.dataset.s === 'volume') G.audio.setVolume(v); else { s.sens = v; save.write(); } }));
  }
}
