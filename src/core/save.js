// Saved progress and settings, in localStorage. One key, versioned; anything unreadable is treated as "no save".
const KEY = 'intruder.next.v1';
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const defaults = () => ({
  settings: { gfx: isTouch() ? 'retro' : 'real', sens: 1, volume: 0.8, invertY: false },
  introSeen: false,
  run: null, // { chapter, seed, checkpoint, hp, maxHp, absorbed, cleared:[], hasKey }
});
let data = defaults();
export const save = {
  load() {
    try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.settings) data = { ...defaults(), ...raw, settings: { ...defaults().settings, ...raw.settings } }; } catch { data = defaults(); }
    return data;
  },
  get data() { return data; },
  write() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: play on without saving */ } },
  setRun(run) { data.run = run; this.write(); },
  clearRun() { data.run = null; this.write(); },
};
