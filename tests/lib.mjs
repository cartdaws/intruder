// Shared helpers for the headless playtests. Usage: node tests/<name>.mjs  (needs `npx vite --port 5199` running, or set URL).
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/opt/node-tools/node_modules/');
export const { chromium, devices } = require('playwright');
export const URL = process.env.URL || 'http://localhost:5199/?debug';
export const OUT = process.env.OUT || 'tests/out';
fs.mkdirSync(OUT, { recursive: true });

// Open the game. opts: { phone: true (iPhone landscape with touch), gfx: 'retro'|'real', save: object to preload }
export async function open(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(opts.phone ? { ...devices['iPhone 13 landscape'] } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(([gfx, sv]) => { if (sv) localStorage.setItem('intruder.next.v1', JSON.stringify(sv)); else if (gfx) localStorage.setItem('intruder.next.v1', JSON.stringify({ settings: { gfx, sens: 1, volume: 0.8, invertY: false }, introSeen: false, run: null })); }, [opts.gfx || null, opts.save || null]);
  await page.goto(URL); await page.waitForFunction(() => window.__dbg && window.__booted, null, { timeout: 60000 });
  return { browser, page, errors, shot: (name) => page.screenshot({ path: `${OUT}/${name}.png` }) };
}
// Start a chapter directly and stop the real-time loop, so the test alone moves time.
export async function start(page, chapter = 'facility', opts = { fresh: true }) {
  await page.evaluate(async ([c, o]) => { await __dbg.game.startChapter(c, o); __dbg.hold(true); }, [chapter, opts]);
}
export const step = (page, s) => page.evaluate((s) => __dbg.step(s), s);
export const state = (page) => page.evaluate(() => __dbg.state());
let fails = 0;
export function check(name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fails++; }
export async function done(h) { if (h.errors.length) { console.log('PAGE ERRORS:', h.errors.slice(0, 8)); fails++; } await h.browser.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
