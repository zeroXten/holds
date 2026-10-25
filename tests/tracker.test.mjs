// The lock-on tracker: fixes left/right swaps and impossible jumps, but follows real
// movement. Run: node tests/tracker.test.mjs
import { HOLDS } from '../js/holds.js';
import { syntheticLandmarks, lerpSpec, standing } from '../js/figure.js';
import { LandmarkTracker } from '../js/tracker.js';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const W = 720, H = 1280, aspect = W / H, dt = 1 / 30;
const lm = spec => syntheticLandmarks(spec, { width: W, height: H });
const err = (a, b, i) => Math.hypot((a[i].x - b[i].x) * aspect, a[i].y - b[i].y);
const settle = (t, frame, n = 30) => { let out; for (let i = 0; i < n; i++) out = t.update(frame, dt, aspect); return out; };

const bow = HOLDS.find(h => h.id === 'bow').figure(3);
const truth = lm(bow);

// Locks on to a clear view.
{
  const t = new LandmarkTracker();
  settle(t, truth);
  check('locks on', t.locked);
}

// A one-frame left/right leg swap is undone.
{
  const t = new LandmarkTracker();
  settle(t, truth);
  const swapped = truth.map((p, i) => {
    const pair = { 25: 26, 26: 25, 27: 28, 28: 27, 29: 30, 30: 29, 31: 32, 32: 31 }[i];
    return pair !== undefined ? truth[pair] : p;
  });
  const out = t.update(swapped, dt, aspect);
  check('left/right swap undone', err(out, truth, 27) < 0.01 && err(out, truth, 28) < 0.01, `ankle error ${err(out, truth, 27).toFixed(3)}`);
}

// A wrist flung across the frame for a few frames is held at its last good place.
{
  const t = new LandmarkTracker();
  settle(t, truth);
  const glitch = truth.map((p, i) => (i === 15 ? { ...p, x: 0.95, y: 0.1 } : p));
  let out;
  for (let i = 0; i < 5; i++) out = t.update(glitch, dt, aspect);
  check('brief impossible jump held back', err(out, truth, 15) < 0.02, `wrist error ${err(out, truth, 15).toFixed(3)}`);
  // ...but if it stays there, it's believed.
  out = settle(t, glitch, 45);
  check('lasting move accepted', err(out, glitch, 15) < 0.02, `wrist error ${err(out, glitch, 15).toFixed(3)}`);
}

// Real, steady movement is followed closely (standing → folded over, over 3 seconds).
{
  const feet = HOLDS.find(h => h.id === 'feet');
  const t = new LandmarkTracker();
  const from = standing('side'), to = feet.figure(4);
  settle(t, lm(from));
  let worst = 0;
  for (let i = 1; i <= 90; i++) {
    const frame = lm(lerpSpec(from, to, i / 90));
    const out = t.update(frame, dt, aspect);
    worst = Math.max(worst, err(out, frame, 15), err(out, frame, 0));
  }
  check('follows a slow fold', worst < 0.05, `worst lag ${worst.toFixed(3)}`);
}

// Losing the body for a while drops the lock; a single empty frame doesn't.
{
  const t = new LandmarkTracker();
  settle(t, truth);
  t.update(null, dt, aspect);
  const keptLock = t.locked;
  for (let i = 0; i < 60; i++) t.update(null, dt, aspect);
  check('brief dropout keeps lock, long one drops it', keptLock && !t.locked);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
