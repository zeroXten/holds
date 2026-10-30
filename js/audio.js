// Beeps (Web Audio) and spoken cues (speech synthesis). The phone is usually a
// couple of metres away, so sound does most of the coaching.

let ctx = null;
let settings = { voice: true, sounds: true };
let lastSpoke = 0;
const spokenAt = new Map();

export function configure(s) { settings = s; }

// Must be called from a tap so mobile browsers allow audio.
export function unlock() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio */ }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

function tone(freq, start, dur, type = 'sine', vol = 0.25) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start); o.stop(start + dur + 0.05);
}

const SOUNDS = {
  tick: [[880, 0, 0.12]],
  go: [[660, 0, 0.15], [990, 0.15, 0.3]],
  slip: [[300, 0, 0.18, 'triangle']],
  target: [[784, 0, 0.18], [988, 0.16, 0.18], [1175, 0.32, 0.18], [1568, 0.48, 0.45]],
  end: [[523, 0, 0.25], [392, 0.22, 0.45]],
  level: [[523, 0, 0.15], [659, 0.13, 0.15], [784, 0.26, 0.15], [1047, 0.39, 0.6]],
  point: [[1320, 0, 0.06, 'sine', 0.08]],
};

export function play(name) {
  if (!settings.sounds || !ctx) return;
  const now = ctx.currentTime;
  for (const [f, at, dur, type, vol] of SOUNDS[name]) tone(f, now + at, dur, type, vol);
}

// Speak a phrase. `minGap` stops the same phrase repeating too often;
// `priority` phrases interrupt whatever is being said.
export function say(text, { minGap = 0, priority = false, pitch = 1 } = {}) {
  if (!settings.voice || !('speechSynthesis' in window)) return false;
  const now = performance.now();
  if (minGap && now - (spokenAt.get(text) ?? -1e9) < minGap) return false;
  if (!priority && (speechSynthesis.speaking || now - lastSpoke < 2500)) return false;
  if (priority) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = pitch;
  speechSynthesis.speak(u);
  spokenAt.set(text, now);
  lastSpoke = now;
  return true;
}

export function hush() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }

// ---- Ambient sound for the full-screen temple ----
// A slow pentatonic pluck, like a guzheng, every few seconds, plus whatever the temple
// you've built would sound like: running water (koi pond, waterfall), wind (bamboo,
// mountain mist) and now and then the bronze bell. All generated here; nothing to load.

const PENTATONIC = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25];  // D major pentatonic, D4–E5
let ambient = null;  // { master, timers, nodes }

function pluck(at, freq, out) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = freq;
  o2.type = 'sine'; o2.frequency.value = freq * 2;
  f.type = 'lowpass'; f.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.09, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
  o.connect(f); o2.connect(f); f.connect(g).connect(out);
  for (const x of [o, o2]) { x.start(at); x.stop(at + 3); }
}

function bell(at, out) {
  for (const [ratio, vol] of [[1, 0.06], [2.76, 0.025], [5.4, 0.012]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 196 * ratio;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 7);
    o.connect(g).connect(out);
    o.start(at); o.stop(at + 7.2);
  }
}

// A loop of soft noise through a filter, its level slowly swelling and fading.
function noiseBed(out, type, freq, level, sway) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  src.buffer = buf; src.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = 0.6;
  g.gain.value = level;
  lfo.frequency.value = sway; depth.gain.value = level * 0.6;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(out);
  src.start(); lfo.start();
  return [src, lfo];
}

export function startAmbient({ water = false, wind = false, bell: hasBell = false } = {}) {
  stopAmbient();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);  // fade in
  master.connect(ctx.destination);
  const nodes = [], timers = [];
  if (water) nodes.push(...noiseBed(master, 'bandpass', 900, 0.018, 0.13));
  if (wind) nodes.push(...noiseBed(master, 'lowpass', 380, 0.03, 0.07));
  // A phrase of one to three notes every few seconds, wandering up and down the scale.
  let note = 3;
  const phrase = () => {
    const now = ctx.currentTime, count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      note = Math.max(0, Math.min(PENTATONIC.length - 1, note + Math.round(Math.random() * 4 - 2)));
      pluck(now + i * (0.45 + Math.random() * 0.35), PENTATONIC[note], master);
    }
    timers.push(setTimeout(phrase, 3500 + Math.random() * 4500));
  };
  timers.push(setTimeout(phrase, 800));
  if (hasBell) {
    const ring = () => { bell(ctx.currentTime, master); timers.push(setTimeout(ring, 35000 + Math.random() * 25000)); };
    timers.push(setTimeout(ring, 6000));
  }
  ambient = { master, nodes, timers };
}

export function stopAmbient() {
  if (!ambient) return;
  const { master, nodes, timers } = ambient;
  ambient = null;
  timers.forEach(clearTimeout);
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);  // fade out
  setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); master.disconnect(); }, 1000);
}
