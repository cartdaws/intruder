// The game: owns the player and the combat systems, runs the current chapter, and handles pause, death and chapter flow.
// A chapter is a module with create(game, opts) -> { id, scene, world, spawn:{x,y,z,yaw}, combat, start(), update(dt), dispose() }.
import * as THREE from 'three';
import { G, syncMaterials } from '../core/engine.js';
import { save } from '../core/save.js';
import { Player } from './player.js';
import { Body } from './body.js';
import { Weapon } from './weapon.js';
import { Projectiles } from './projectiles.js';
import { Enemies } from './enemies.js';
import { Absorb } from './absorb.js';
import { Fx } from './fx.js';
import { gelTime } from './gel.js';
import { CHAPTERS, ORDER } from '../scenes/index.js';

export class Game {
  constructor(hud) {
    G.game = this; this.hud = hud;
    this.player = new Player(this); this.weapon = new Weapon(this); this.absorb = new Absorb(this); this.body = new Body(this);
    this.chapter = null; this.world = null; this.state = 'menu'; // 'menu' | 'play' | 'dead' | 'loading'
    this.deadT = 0;
    G.bus.on('dead', () => this.onDead());
    G.bus.on('jump', () => this.body.onJump()); G.bus.on('land', (i) => this.body.onLand(i)); G.bus.on('hurt', () => this.body.onHurt());
    G.bus.on('enemyDown', () => { G.hitStop = Math.max(G.hitStop, 0.09); });
    G.bus.on('absorbed', () => { this.hud.toast('+1 MAX HEALTH'); });
    G.bus.on('lostLock', () => { if (this.state === 'play') this.pause(); });
  }
  // Load a chapter by id. opts.run restores a saved run (facility checkpoint).
  async startChapter(id, opts = {}) {
    this.state = 'loading'; G.paused = true;
    await this.hud.fade(1, 0.01);
    this.unload();
    const pl = this.player; pl.dead = false; pl.can = { move: true, look: true, jump: true, fire: true, absorb: true }; pl.vel.set(0, 0, 0); pl.eyeY = 1.62; pl.roll = 0;
    if (!opts.run || !opts.run.maxHp) { if (opts.fresh) { pl.maxHp = 100; pl.hp = 100; pl.absorbed = 0; } }
    // Combat systems are per chapter because their meshes live in the chapter's scene.
    // A chapter that spawns machines while it builds must call game.useScene(scene) first; otherwise it is done here.
    const mod = await CHAPTERS[id]();
    this.enemies = new Enemies(this, null); this.projectiles = new Projectiles(this, null); this.fx = null;
    const ch = await mod.create(this, opts);
    if (!this.fx) this.useScene(ch.scene);
    this.chapter = ch; this.world = ch.world; G.scene = ch.scene;
    ch.scene.add(G.camera); this.body.attach(ch.scene);
    pl.teleport(ch.spawn.x, ch.spawn.y ?? 0, ch.spawn.z, ch.spawn.yaw ?? 0);
    this.hud.setCombat(ch.combat !== false); this.hud.objective(''); this.hud.prompt(null); this.hud.letterbox(false);
    this.body.setArmed(ch.combat !== false);
    ch.start();
    syncMaterials(ch.scene);
    pl.hp = Math.min(pl.hp, pl.maxHp); pl.syncCamera(0.016);
    G.renderer.compile(ch.scene, G.camera);
    this.state = 'play'; G.paused = false; this.hud.show(true); G.input.showTouch(true); G.input.lock();
    this.hud.fade(0, 0.8);
    G.bus.emit('chapter', id);
  }
  useScene(scene) { this.fx = new Fx(scene); this.enemies.scene = scene; this.projectiles.scene = scene; }
  unload() {
    if (!this.chapter) return;
    this.absorb.active = false; this.absorb.target = null; this.absorb.candidate = null; this.body.setTongues(null);
    this.enemies.clear(); this.projectiles.clear(); this.body.dispose();
    if (this.chapter.dispose) this.chapter.dispose();
    this.chapter.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.chapter = null; G.scene = null;
  }
  // Next chapter in story order (or back to the menu after the last one).
  nextChapter(opts = {}) { const i = ORDER.indexOf(this.chapter.id); if (i >= 0 && i + 1 < ORDER.length) return this.startChapter(ORDER[i + 1], { fresh: ORDER[i + 1] === 'facility', ...opts }); return this.toMenu(); }
  newGame(skipIntro) { save.clearRun(); return this.startChapter(skipIntro ? 'facility' : ORDER[0], { fresh: true }); }
  continueGame() { const run = save.data.run; if (!run) return this.newGame(false); return this.startChapter(run.chapter, { run }); }

  update(dt) {
    if (this.state !== 'play' && this.state !== 'dead') return;
    if (this.state === 'dead') { dt *= 0.35; this.deadT += dt / 0.35; if (this.deadT > 2.4 && !this.deadShown) { this.deadShown = true; G.input.showTouch(false); G.input.unlock(); G.bus.emit('deathScreen'); } }
    const pl = this.player; G.input.update();
    pl.update(dt, this.world);
    this.weapon.update(dt); this.absorb.update(dt);
    this.enemies.update(dt); this.projectiles.update(dt); this.fx.update(dt);
    this.chapter.update(dt);
    this.body.update(dt, { speed: Math.hypot(pl.vel.x, pl.vel.z), onGround: pl.onGround, vy: pl.vel.y, pitch: pl.pitch, absorbing: this.absorb.active, dead: pl.dead, moveX: G.input.move.x, moveY: G.input.move.y });
    // The context button: absorb when a shut-down machine is in reach, otherwise whatever the chapter offers.
    const cand = this.absorb.candidate, label = cand ? 'ABSORB' : this.chapter.useLabel || 'ABSORB';
    G.input.setUseLabel(label, !!cand || !!this.chapter.useLabel);
    if (this.chapter.combat !== false) this.hud.prompt(cand && !this.absorb.active ? (G.touch ? 'ABSORB' : 'E  ABSORB') : null);
    if (G.input.pressed('pause')) this.pause();
    G.input.endStep();
  }
  updateFrozen(dt) { this.fx.update(dt * 0.15); }
  frame(realDt) { gelTime.value += realDt; if (this.state === 'play' || this.state === 'dead') this.hud.frame(realDt); }

  pause() { if (this.state !== 'play') return; G.paused = true; G.input.showTouch(false); G.input.unlock(); G.bus.emit('paused'); }
  resume() { G.paused = false; G.input.showTouch(true); G.input.lock(); G.bus.emit('resumed'); }
  onDead() { this.state = 'dead'; this.deadT = 0; this.deadShown = false; G.audio.play('death', 1); G.audio.ambience('dread'); this.hud.prompt(null); this.body.setTongues(null); }
  retry() { const run = save.data.run; return run && run.chapter === this.chapter.id ? this.startChapter(run.chapter, { run }) : this.startChapter(this.chapter.id, { fresh: true }); }
  finishDeck() { this.state = 'loading'; save.data.run = null; save.data.deckDone = true; save.write(); G.bus.emit('deckDone'); }
  async toMenu() { await this.hud.fade(1, 0.4); this.unload(); this.state = 'menu'; G.paused = true; this.hud.show(false); G.input.showTouch(false); G.input.unlock(); G.audio.ambience(null); G.bus.emit('menu'); this.hud.fade(0, 0.01); }
}
