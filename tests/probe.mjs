// Scratch probe: run a snippet in the page after starting a chapter. node tests/probe.mjs "<js returning value>" [shotname] [gfx]
import { open, start, step } from './lib.mjs';
const h = await open({ gfx: process.argv[4] || 'retro', phone: process.env.PHONE === '1' }), { page } = h;
await start(page, process.env.CHAPTER || 'facility'); await step(page, 0.3);
const r = await page.evaluate(`(async()=>{ ${process.argv[2]} })()`); console.log(JSON.stringify(r));
await step(page, parseFloat(process.env.STEP || '0.1')); if (process.argv[3]) await h.shot(process.argv[3]);
if (h.errors.length) console.log('ERRORS', h.errors.slice(0, 5)); await h.browser.close();
