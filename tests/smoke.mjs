// Smoke test: menu renders, a new game starts, the first fight triggers, shooting shuts a machine down, absorb works.
import { open, start, step, state, check, done } from './lib.mjs';
const gfx = process.argv[2] || 'retro';
const h = await open({ gfx }), { page } = h;
await h.shot(`smoke-${gfx}-menu`);
check('menu shows NEW GAME and build label', await page.evaluate(() => /NEW GAME/.test(document.body.innerText) && /BUILD R/.test(document.body.innerText)));
await start(page);
let s = await step(page, 0.5); await h.shot(`smoke-${gfx}-start`);
check('facility started', s.state === 'play' && s.chapter === 'facility', JSON.stringify(s.pos));
check('machines stand dormant', s.enemies.length > 10 && s.enemies.every((e) => e.state === 'dormant'), `${s.enemies.length} machines`);
// Jump into the first combat room and trigger the lockdown.
await page.evaluate(() => { __dbg.game.chapter.skipTo(1); __dbg.game.player.cheat.god = true; });
await page.evaluate(() => { const g = __dbg.game, r = g.chapter.state.cur; g.player.teleport((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2); });
s = await step(page, 1.5); await h.shot(`smoke-${gfx}-lockdown`);
check('lockdown started', s.objective === 'CLEAR THE ROOM', s.objective + ' / ' + s.caption);
const mine = () => page.evaluate(() => { const g = __dbg.game; return g.enemies.list.filter((e) => e.room === g.chapter.state.cur).map((e) => e.state); });
check('room machines woke', (await mine()).every((x) => x === 'fight' || x === 'boot'), (await mine()).join(','));
// Aim at each machine and hold fire until it shuts down.
for (let i = 0; i < 60; i++) {
  const left = await page.evaluate(() => { const g = __dbg.game, e = g.enemies.list.find((e) => e.room === g.chapter.state.cur && e.state !== 'disabled'); if (!e) return 0; const c = g.enemies.center(e, new (g.player.pos.constructor)()); __dbg.lookAt(c.x, c.y, c.z); g.constructor; __dbg.G.input.inject.down('fire'); return 1; });
  if (!left) break; await step(page, 0.25);
  if (i === 6) await h.shot(`smoke-${gfx}-fight`);
}
await page.evaluate(() => __dbg.G.input.inject.up('fire'));
s = await step(page, 1.2); await h.shot(`smoke-${gfx}-down`);
const st = await mine();
check('all room machines shut down', st.length > 0 && st.every((x) => x === 'disabled'), st.join(','));
check('room cleared', s.objective !== 'CLEAR THE ROOM', s.objective);
// Absorb one.
const before = s.maxHp;
await page.evaluate(() => { const g = __dbg.game, e = g.enemies.list.find((e) => e.room === g.chapter.state.cur); const p = e.root.position; g.player.teleport(p.x + 3, 0, p.z); const c = g.enemies.center(e, new (g.player.pos.constructor)()); __dbg.lookAt(c.x, c.y, c.z); });
await step(page, 0.3); await page.evaluate(() => __dbg.G.input.inject.down('use')); await step(page, 0.1); await page.evaluate(() => __dbg.G.input.inject.up('use'));
await step(page, 0.7); await h.shot(`smoke-${gfx}-absorb`);
s = await step(page, 1.5);
check('absorb gave +1 max health', s.maxHp === before + 1 && s.absorbed === 1, `${before} -> ${s.maxHp}`);
await done(h);
