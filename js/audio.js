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
// Music generated on the fly, in a mood that follows the temple's theme, plus whatever the
// temple you've built would sound like: running water (koi pond, waterfall), wind
// (bamboo, mountain mist) and now and then the bronze bell. Nothing to download.
//
// Moods: 'temple' (guqin, xiao flute, a singing-bowl drone and the wooden fish monks keep
// time with), 'spring' (brighter zither and birdsong), 'summer' (cicadas, wind chimes, a
// sunnier scale), 'spooky' (autumn: a tritone drone, eerie glides, owls) and 'winter'
// (Christmas: a music-box Jingle Bells with sleigh bells, between snowfall twinkles).

const NOTE = n => 440 * 2 ** ((n - 69) / 12);  // MIDI note number → Hz
const SCALES = {
  temple: [62, 64, 66, 69, 71, 74, 76],        // D gong mode (D E F# A B)
  spring: [69, 71, 73, 76, 78, 81, 83],        // A gong mode, higher
  summer: [67, 69, 72, 74, 76, 79, 81],        // G zhi mode, bright
  spooky: [62, 63, 65, 68, 69, 72, 74],        // D with a flat 2nd and flat 5th
};
let ambient = null;  // { master, timers, nodes }

function env(g, at, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

// A guqin-like pluck: a warm tone that slides up into its note.
function qin(at, freq, out, { decay = 3.4, vol = 0.08, slide = 0.97 } = {}) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.setValueAtTime(freq * slide, at); o.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
  o2.frequency.setValueAtTime(freq * 2 * slide, at); o2.frequency.exponentialRampToValueAtTime(freq * 2, at + 0.08);
  f.type = 'lowpass'; f.frequency.value = 1400;
  env(g, at, vol, 0.01, decay);
  o.connect(f); o2.connect(f); f.connect(g).connect(out);
  for (const x of [o, o2]) { x.start(at); x.stop(at + decay + 0.2); }
}

// A breathy bamboo flute (xiao) note with a gentle vibrato.
function flute(at, freq, dur, out, vol = 0.045) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  lfo.frequency.value = 5; depth.gain.value = freq * 0.004;
  lfo.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.3);
  g.gain.setValueAtTime(vol, at + dur - 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  const breath = noiseSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
  bf.type = 'bandpass'; bf.frequency.value = freq * 2; bf.Q.value = 4;
  bg.gain.setValueAtTime(0.0001, at); bg.gain.exponentialRampToValueAtTime(vol * 0.25, at + 0.2); bg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  breath.connect(bf).connect(bg).connect(out);
  for (const x of [o, lfo, breath]) { x.start(at); x.stop(at + dur + 0.1); }
}

// A short bell-like tone: music box, chimes, snow twinkles.
function chime(at, freq, out, vol = 0.05, decay = 1.6) {
  for (const [r, v] of [[1, 1], [3, 0.3], [4.2, 0.12]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq * r;
    env(g, at, vol * v, 0.005, decay / r ** 0.5);
    o.connect(g).connect(out); o.start(at); o.stop(at + decay + 0.1);
  }
}

// The wooden fish: a hollow knock.
function woodfish(at, out) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(820, at); o.frequency.exponentialRampToValueAtTime(560, at + 0.06);
  env(g, at, 0.07, 0.002, 0.09);
  o.connect(g).connect(out); o.start(at); o.stop(at + 0.15);
}

function bell(at, out) {
  for (const [ratio, vol] of [[1, 0.06], [2.76, 0.025], [5.4, 0.012]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 196 * ratio;
    env(g, at, vol, 0.02, 7);
    o.connect(g).connect(out); o.start(at); o.stop(at + 7.2);
  }
}

function chirp(at, out) {
  for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
    const t = at + i * 0.13, o = ctx.createOscillator(), g = ctx.createGain(), f0 = 2600 + Math.random() * 900;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t + 0.08);
    env(g, t, 0.025, 0.005, 0.09);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.12);
  }
}

function owl(at, out) {
  for (const [dt, len] of [[0, 0.35], [0.55, 0.25], [0.85, 0.5]]) {
    const t = at + dt, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(390, t); o.frequency.exponentialRampToValueAtTime(340, t + len);
    env(g, t, 0.04, 0.06, len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.1);
  }
}

// An eerie glide, like a theremin.
function glide(at, out) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  const f0 = NOTE(57 + Math.floor(Math.random() * 6));
  o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.5 : 0.75), at + 3);
  lfo.frequency.value = 6; depth.gain.value = f0 * 0.012;
  lfo.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.035, at + 1); g.gain.exponentialRampToValueAtTime(0.0001, at + 3.4);
  o.connect(g).connect(out);
  for (const x of [o, lfo]) { x.start(at); x.stop(at + 3.5); }
}

function sleighBells(at, beats, out) {
  for (let i = 0; i < beats * 2; i++) {
    const t = at + i * 0.17, src = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 6500;
    env(g, t, i % 2 ? 0.02 : 0.035, 0.002, 0.12);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.15);
  }
}

let noiseBuffer = null;
function noiseSource() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer; src.loop = true;
  return src;
}

// A loop of soft noise through a filter, its level slowly swelling and fading.
function noiseBed(out, type, freq, level, sway, { q = 0.6, tremolo = 0 } = {}) {
  const src = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.value = level;
  lfo.frequency.value = tremolo || sway; depth.gain.value = level * (tremolo ? 0.9 : 0.6);
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(out);
  src.start(); lfo.start();
  return [src, lfo];
}

// A low singing-bowl drone: two soft tones, slowly beating.
function drone(out, notes, vol = 0.022) {
  return notes.flatMap(n => {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = NOTE(n); o2.frequency.value = NOTE(n) * 1.003;
    g.gain.value = vol;
    o.connect(g); o2.connect(g); g.connect(out);
    o.start(); o2.start();
    return [o, o2];
  });
}

// Jingle Bells (traditional, public domain): the chorus, as [MIDI note, beats].
const JINGLE = [[76, 1], [76, 1], [76, 2], [76, 1], [76, 1], [76, 2], [76, 1], [79, 1], [72, 1.5], [74, 0.5], [76, 4],
  [77, 1], [77, 1], [77, 1.5], [77, 0.5], [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5], [76, 1], [74, 1], [74, 1], [76, 1], [74, 2], [79, 2]];

export function startAmbient({ water = false, wind = false, bell: hasBell = false, mood = 'temple' } = {}) {
  stopAmbient();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);  // fade in
  master.connect(ctx.destination);
  const nodes = [], timers = [];
  const every = (fn, min, max, first = min) => {
    const run = () => { fn(ctx.currentTime); timers.push(setTimeout(run, (min + Math.random() * (max - min)) * 1000)); };
    timers.push(setTimeout(run, first * 1000));
  };
  if (water) nodes.push(...noiseBed(master, 'bandpass', 900, 0.016, 0.13));
  if (wind || mood === 'winter') nodes.push(...noiseBed(master, 'lowpass', 380, 0.026, 0.07));
  if (hasBell) every(now => bell(now, master), 35, 60, 6);

  const scale = SCALES[mood] ?? SCALES.temple;
  let step = 3;
  const walk = () => { step = Math.max(0, Math.min(scale.length - 1, step + Math.round(Math.random() * 4 - 2))); return NOTE(scale[step]); };

  if (mood === 'winter') {
    // Snowfall twinkles, and now and then the carol on a music box with sleigh bells.
    nodes.push(...drone(master, [50, 57], 0.012));
    every(now => chime(now, NOTE(84 + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]), master, 0.025, 2.2), 0.8, 2.6, 1);
    every(now => {
      let t = now + 0.3;
      const beat = 0.34;
      sleighBells(t, JINGLE.reduce((n, [, b]) => n + b, 0), master);
      for (const [n, b] of JINGLE) { chime(t, NOTE(n), master, 0.06, 1.2); t += b * beat; }
    }, 40, 55, 4);
  } else if (mood === 'spooky') {
    nodes.push(...drone(master, [38, 44], 0.026));  // D and A flat: a tritone
    every(now => { for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) qin(now + i * 1.1, walk() / 2, master, { decay: 4.5, vol: 0.07, slide: 0.94 }); }, 5, 9, 1);
    every(now => glide(now, master), 9, 16, 4);
    every(now => owl(now, master), 18, 30, 10);
    every(now => chime(now, NOTE(81) * 1.03, master, 0.02, 3), 12, 20, 7);  // a detuned chime
  } else {
    nodes.push(...drone(master, mood === 'summer' ? [43, 50] : [38, 45], mood === 'temple' ? 0.022 : 0.014));
    // Zither phrases, a slow flute line, and the season's own sounds.
    const gap = mood === 'temple' ? [4.5, 8] : [3, 5.5];
    every(now => {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) qin(now + i * (0.5 + Math.random() * 0.4), walk(), master, { vol: mood === 'temple' ? 0.08 : 0.06 });
    }, gap[0], gap[1], 0.8);
    every(now => {
      let t = now;
      // The flute sits an octave below the brighter seasons' zither.
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) { const d = 1.4 + Math.random() * 1.6; flute(t, mood === 'temple' ? walk() : walk() / 2, d, master); t += d * 0.9; }
    }, 12, 22, 5);
    if (mood === 'temple') every(now => { for (let i = 0; i < 3; i++) woodfish(now + i * 0.62, master); }, 16, 28, 9);
    if (mood === 'spring') every(now => chirp(now, master), 2.5, 7, 1.5);
    if (mood === 'summer') {
      nodes.push(...noiseBed(master, 'bandpass', 5200, 0.012, 0, { q: 6, tremolo: 32 }));  // cicadas
      every(now => { for (let i = 0; i < 3; i++) chime(now + i * 0.18, NOTE(88 + Math.floor(Math.random() * 8)), master, 0.018, 1.4); }, 6, 12, 3);
    }
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
