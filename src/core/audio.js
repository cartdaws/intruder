// All sound is synthesised with WebAudio: nothing to download, and it starts on the first tap (browsers require a gesture).
import { G } from './engine.js';
import { save } from './save.js';

let ac = null, master = null, noiseBuf = null, amb = null;
function ctx() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ac = new AC(); master = ac.createGain(); master.gain.value = save.data.settings.volume; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
function env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, dur, vol, when = 0) {
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, dur, vol); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(freq, q, dur, vol, type = 'bandpass', when = 0, f1 = null) {
  const t = ac.currentTime + when, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  env(g, t, 0.004, dur, vol); s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// Each sound is a few layered tones and noise bursts. v scales the volume (distance falloff is done by the caller).
const S = {
  spine: (v) => { noise(900, 1.2, 0.09, 0.5 * v, 'bandpass', 0, 300); tone('sine', 190, 70, 0.12, 0.5 * v); tone('triangle', 520, 240, 0.05, 0.15 * v); },
  splat: (v) => { noise(500, 0.8, 0.12, 0.3 * v, 'lowpass', 0, 150); },
  hit: (v) => { noise(2600, 2, 0.05, 0.35 * v); tone('square', 320, 160, 0.05, 0.12 * v); },
  hurt: (v) => { tone('sawtooth', 160, 60, 0.25, 0.4 * v); noise(300, 0.7, 0.2, 0.4 * v, 'lowpass'); },
  bolt: (v) => { tone('sawtooth', 900, 240, 0.12, 0.16 * v); },
  dart: (v) => { tone('square', 1500, 700, 0.06, 0.09 * v); },
  plasma: (v) => { tone('sine', 120, 60, 0.5, 0.4 * v); tone('sawtooth', 240, 90, 0.4, 0.12 * v); },
  needle: (v) => { tone('triangle', 2000, 900, 0.07, 0.1 * v); },
  seeker: (v) => { noise(700, 3, 0.5, 0.25 * v, 'bandpass', 0, 2200); tone('sine', 300, 600, 0.4, 0.1 * v); },
  boom: (v) => { noise(180, 0.6, 0.6, 0.8 * v, 'lowpass', 0, 50); tone('sine', 90, 30, 0.5, 0.6 * v); },
  shutdown: (v) => { tone('sawtooth', 500, 40, 0.7, 0.3 * v); noise(4000, 4, 0.3, 0.2 * v); tone('square', 60, 40, 0.4, 0.2 * v, 0.3); },
  spark: (v) => { noise(5000, 6, 0.04, 0.2 * v); },
  absorb: (v) => { tone('sine', 140, 420, 0.9, 0.3 * v); noise(1200, 2, 0.9, 0.2 * v, 'bandpass', 0, 3000); },
  absorbDone: (v) => { tone('sine', 330, 660, 0.35, 0.3 * v); tone('sine', 495, 990, 0.45, 0.2 * v, 0.08); },
  tongue: (v) => { noise(600, 1.5, 0.3, 0.3 * v, 'bandpass', 0, 1800); },
  door: (v) => { noise(220, 1, 0.5, 0.3 * v, 'lowpass'); tone('sine', 80, 110, 0.4, 0.2 * v); },
  lock: (v) => { tone('square', 110, 70, 0.3, 0.3 * v); tone('square', 110, 70, 0.3, 0.3 * v, 0.35); },
  alarm: (v) => { for (let i = 0; i < 3; i++) tone('triangle', 420, 620, 0.5, 0.14 * v, i * 0.6); },
  clear: (v) => { tone('sine', 440, 440, 0.2, 0.2 * v); tone('sine', 660, 660, 0.3, 0.2 * v, 0.18); },
  pickup: (v) => { tone('sine', 520, 1040, 0.25, 0.25 * v); },
  key: (v) => { tone('square', 880, 880, 0.08, 0.15 * v); tone('square', 1320, 1320, 0.15, 0.15 * v, 0.1); },
  jump: (v) => { noise(300, 1, 0.12, 0.15 * v, 'lowpass'); },
  land: (v) => { noise(140, 0.8, 0.16, 0.4 * v, 'lowpass'); },
  step: (v) => { noise(260, 1.2, 0.07, 0.12 * v, 'lowpass'); },
  boot: (v) => { tone('square', 200, 800, 0.3, 0.12 * v); },
  death: (v) => { tone('sawtooth', 220, 30, 1.6, 0.5 * v); noise(200, 0.5, 1.5, 0.5 * v, 'lowpass', 0, 40); },
  ui: (v) => { tone('sine', 700, 900, 0.06, 0.15 * v); },
  chime: (v) => { tone('sine', 523, 523, 0.8, 0.12 * v); tone('sine', 784, 784, 1.0, 0.1 * v, 0.15); },
  rumble: (v) => { noise(70, 0.5, 2.2, 0.9 * v, 'lowpass'); },
  zap: (v) => { noise(3000, 5, 0.25, 0.3 * v); tone('sawtooth', 1200, 100, 0.25, 0.15 * v); },
};
export const audio = {
  unlock() { const c = ctx(); if (c && c.state === 'suspended') c.resume(); },
  setVolume(v) { save.data.settings.volume = v; save.write(); if (master) master.gain.value = v; },
  // name, volume 0..1, optional world position (quieter with distance from the camera)
  play(name, vol = 1, pos = null) {
    if (!ac || ac.state !== 'running' || !S[name]) return;
    if (G.timeScale > 2) return; // sped-up test runs stay silent
    if (pos) { const d = pos.distanceTo(G.camera.position); vol *= 1 / (1 + d * d * 0.012); if (vol < 0.02) return; }
    try { S[name](vol); } catch { /* a failed sound must never break the game */ }
  },
  // Looping background bed: 'ship' (low machine hum), 'home' (soft open chord), 'alarm' (tense pulse), or null for silence.
  ambience(kind) {
    if (!ctx()) return;
    if (amb) { const a = amb; a.g.gain.setTargetAtTime(0, ac.currentTime, 0.5); setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 2500); amb = null; }
    if (!kind) return;
    const g = ac.createGain(); g.gain.value = 0; g.connect(master); const nodes = [];
    const osc = (type, f, v, detune = 0) => { const o = ac.createOscillator(), og = ac.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune; og.gain.value = v; o.connect(og).connect(g); o.start(); nodes.push(o); return o; };
    if (kind === 'ship') { osc('sine', 55, 0.5); osc('sine', 82.5, 0.2, 6); osc('triangle', 110, 0.06, -8); }
    if (kind === 'alarm') { osc('sine', 49, 0.5); osc('sawtooth', 98, 0.05); const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 1.6; lg.gain.value = 0.25; l.connect(lg).connect(g.gain); l.start(); nodes.push(l); }
    if (kind === 'home') { [196, 247, 294, 370, 440].forEach((f, i) => osc('sine', f, 0.12 - i * 0.015, i * 5 - 8)); }
    if (kind === 'dread') { osc('sine', 41, 0.6); osc('sine', 43.5, 0.5); osc('sawtooth', 61, 0.03); }
    g.gain.setTargetAtTime(kind === 'home' ? 0.22 : 0.3, ac.currentTime, 1.2);
    amb = { g, nodes, kind };
  },
};
G.audio = audio;
