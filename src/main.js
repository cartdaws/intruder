import './style.css';
import { G, initEngine, startLoop } from './core/engine.js';
import { initInput } from './core/input.js';
import { audio } from './core/audio.js';
import { save } from './core/save.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Game } from './game/game.js';

save.load();
const ui = document.getElementById('ui');
initEngine(document.getElementById('view'));
initInput(ui);
const hud = new Hud(ui), game = new Game(hud), menu = new Menu(ui, game);
// Sound can only start from a gesture; the first tap anywhere unlocks it.
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => audio.unlock(), { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play' && !G.paused) game.pause(); });
if (G.debug) { const { installDebug } = await import('./debug/debug.js'); installDebug(game, menu); }
menu.main();
startLoop();
window.__bootDone();
