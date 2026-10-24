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
export function say(text, { minGap = 0, priority = false } = {}) {
  if (!settings.voice || !('speechSynthesis' in window)) return false;
  const now = performance.now();
  if (minGap && now - (spokenAt.get(text) ?? -1e9) < minGap) return false;
  if (!priority && (speechSynthesis.speaking || now - lastSpoke < 2500)) return false;
  if (priority) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
  spokenAt.set(text, now);
  lastSpoke = now;
  return true;
}

export function hush() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
