// In-game overlay. Deliberately sparse: health, crosshair, one objective line, and short-lived messages.
// Story code uses: objective(text), caption(who, text, secs), toast(text), title(big, small, secs), flashText(text),
// prompt(text|null), fade(opacity, secs, color) -> Promise, setCombat(bool), letterbox(bool).
import { G } from '../core/engine.js';
import { el } from '../core/util.js';

export class Hud {
  constructor(ui) {
    const r = this.root = el('div', 'hud');
    r.innerHTML = `<div class="vig"></div><div class="hurt"></div><div class="lb top"></div><div class="lb bot"></div>
      <div class="cross"><i></i></div><div class="hp"><b></b><div class="bar"><i></i></div><span class="max"></span></div>
      <div class="obj"></div><div class="flash"></div><div class="title"><h2></h2><p></p></div><div class="toast"></div>
      <div class="cap"><b></b><span></span></div><div class="prompt"></div><div class="fps"></div><div class="fade"></div>`;
    ui.appendChild(r);
    const q = (s) => r.querySelector(s);
    this.e = { hurt: q('.hurt'), cross: q('.cross'), hp: q('.hp'), hpN: q('.hp b'), hpBar: q('.hp .bar i'), hpMax: q('.hp .max'), obj: q('.obj'), flash: q('.flash'), title: q('.title'), toast: q('.toast'), cap: q('.cap'), prompt: q('.prompt'), fps: q('.fps'), fade: q('.fade') };
    this.timers = {}; this.hurtA = 0; this.lastHp = -1; this.combat = true; this.showFps = false;
    G.bus.on('hurt', () => { this.hurtA = 1; });
    G.bus.on('hitmark', () => { this.e.cross.classList.remove('hit'); void this.e.cross.offsetWidth; this.e.cross.classList.add('hit'); });
    G.bus.on('enemyDown', () => { this.e.cross.classList.remove('kill'); void this.e.cross.offsetWidth; this.e.cross.classList.add('kill'); });
  }
  _show(name, node, secs) { node.classList.add('on'); clearTimeout(this.timers[name]); if (secs) this.timers[name] = setTimeout(() => node.classList.remove('on'), secs * 1000 / Math.max(1, G.timeScale)); }
  show(v) { this.root.style.display = v ? 'block' : 'none'; }
  setCombat(v) { this.combat = v; this.e.hp.style.display = v ? '' : 'none'; this.e.cross.style.display = v ? '' : 'none'; }
  letterbox(v) { this.root.classList.toggle('boxed', v); }
  objective(t) { if (this.e.obj.textContent === (t || '')) return; this.e.obj.textContent = t || ''; this.e.obj.classList.remove('pulse'); void this.e.obj.offsetWidth; if (t) this.e.obj.classList.add('pulse'); }
  caption(who, text, secs = 4) { this.e.cap.firstChild.textContent = who ? who + '  ' : ''; this.e.cap.lastChild.textContent = text; this._show('cap', this.e.cap, secs); this.lastCaption = text; }
  toast(t, secs = 2.2) { this.e.toast.textContent = t; this._show('toast', this.e.toast, secs); }
  flashText(t) { this.e.flash.textContent = t; this.e.flash.classList.remove('on'); void this.e.flash.offsetWidth; this._show('flash', this.e.flash, 1.6); }
  title(big, small = '', secs = 4) { this.e.title.firstChild.textContent = big; this.e.title.lastChild.textContent = small; this._show('title', this.e.title, secs); }
  prompt(t) { this.e.prompt.textContent = t || ''; this.e.prompt.classList.toggle('on', !!t); }
  fade(opacity, secs = 1, color = '#000') {
    const f = this.e.fade; f.style.transition = `opacity ${secs / Math.max(1, G.timeScale)}s linear`; f.style.background = color; f.style.opacity = opacity;
    return new Promise((res) => setTimeout(res, secs * 1000 / Math.max(1, G.timeScale)));
  }
  frame(realDt) {
    const pl = G.game.player, hp = Math.ceil(pl.hp);
    if (hp !== this.lastHp || pl.maxHp !== this.lastMax) { this.lastHp = hp; this.lastMax = pl.maxHp; this.e.hpN.textContent = hp; this.e.hpMax.textContent = '/ ' + pl.maxHp; this.e.hpBar.style.width = Math.max(0, hp / pl.maxHp * 100) + '%'; this.e.hp.classList.toggle('low', hp / pl.maxHp < 0.3); }
    this.hurtA = Math.max(0, this.hurtA - realDt * 1.6);
    const low = this.combat && !pl.dead && pl.hp / pl.maxHp < 0.3 ? 0.25 + 0.1 * Math.sin(performance.now() * 0.006) : 0;
    this.e.hurt.style.opacity = Math.max(this.hurtA * 0.8, low, pl.dead ? 0.9 : 0);
    if (this.showFps) this.e.fps.textContent = Math.round(G.fps) + ' fps';
  }
}
