// The calm view for still holds: once you've been steady for a few seconds, the busy
// session screen fades back and an ensō draws itself over the hold while a soft glow
// breathes at about six breaths a minute. Anything that needs your attention (form
// slipping, switching sides, a pause) brings the full screen straight back, and the
// time shows briefly at halfway and in the last ten seconds.

export const CALM = {
  settle: 5,       // seconds steady before the calm view fades in
  slip: 0.8,       // seconds of so-so form (between the hold and start thresholds) before it fades out
  breath: 10,      // seconds per breath: 4 in, 6 out
  inhale: 0.4,     // share of the breath breathing in
  words: 3,        // breaths that show "breathe in / out" each time the calm view returns
  peek: 4,         // seconds the time shows at halfway
  lastSeconds: 10, // the time shows for the final stretch to the target
};

// Whether the calm view should show this frame. `st` carries timers between frames.
// Steady means holding with good form (or holding at all, without the camera).
// Leaving the hold, or form dropping below the hold threshold, ends it at once;
// form that's only so-so ends it if it lasts.
export function calmStep(st, v, dt, { camera, thr }) {
  const holding = v.state === 'holding' && !(v.sideReached && v.canSwitch);
  const good = holding && (!camera || v.score >= thr.start);
  const poor = !holding || (camera && v.score < thr.hold);
  st.steady = good ? (st.steady ?? 0) + dt : 0;
  st.slip = good ? 0 : (st.slip ?? 0) + dt;
  if (poor || st.slip > CALM.slip) st.on = false;
  else if (st.steady >= CALM.settle) st.on = true;
  // The time peeks out at halfway and for the last stretch.
  const t = v.sideHeld, T = v.sideTarget;
  st.peek = st.on && ((t >= T / 2 && t < T / 2 + CALM.peek) || (T - t > 0 && T - t <= CALM.lastSeconds));
  return st.on;
}

// Breath phase at time `t` seconds: 0 → 1 breathing in, 1 → 0 breathing out (eased).
export function breathAt(t) {
  const p = (t % CALM.breath) / CALM.breath, i = CALM.inhale;
  return p < i
    ? { inhale: true, k: (1 - Math.cos(Math.PI * p / i)) / 2 }
    : { inhale: false, k: (1 + Math.cos(Math.PI * (p - i) / (1 - i))) / 2 };
}

export class CalmView {
  // `onBreath(inhale)` is called as each in-breath and out-breath begins (for the tones).
  constructor(root, { reduceMotion = false, onBreath = () => {} } = {}) {
    this.root = root;
    this.reduceMotion = reduceMotion;
    this.onBreath = onBreath;
    // The breath is the main thing: an orb that swells to fill a brush-stroke ensō
    // (in your sash colour) as you breathe in and shrinks as you breathe out, with rings
    // rippling outwards on the out-breath. The orb turns cool for the in-breath and warm
    // for the out-breath, switching quickly so the turn is easy to see. Nothing here
    // counts time.
    root.innerHTML = `<svg viewBox="0 0 220 220" aria-hidden="true">
      <defs><radialGradient id="calm-orb">
        <stop offset="0" class="orb-a"/><stop offset=".55" class="orb-b"/><stop offset="1" class="orb-c"/>
      </radialGradient></defs>
      <circle class="ripple" cx="110" cy="110" r="90"/>
      <circle class="ripple" cx="110" cy="110" r="90"/>
      <circle class="orb" cx="110" cy="110" r="40" fill="url(#calm-orb)"/>
      <circle class="core" cx="110" cy="110" r="10"/>
      <circle class="enso" cx="110" cy="110" r="96" pathLength="100" transform="rotate(-100 110 110)"/>
    </svg>
    <div class="calm-word"></div>
    <div class="calm-time"></div>`;
    this.orb = root.querySelector('.orb');
    this.core = root.querySelector('.core');
    this.ripples = [...root.querySelectorAll('.ripple')];
    this.word = root.querySelector('.calm-word');
    this.time = root.querySelector('.calm-time');
    this.reset();
  }

  reset() {
    this.st = {};
    this.since = null;  // when the calm view last came on, for the breath words
    this.inhale = null; // the breath we're on, to spot the turn
    this.root.parentElement?.classList.remove('calm', 'calm-peek');
  }

  // A tap brings the full screen back; it fades again after you've been steady a while.
  wake() {
    this.st.on = false;
    this.st.steady = 0;
  }

  // `colour` tints the ensō (the sash), `timeText` is the hold's clock.
  update(v, dt, now, { camera, thr, colour, timeText }) {
    const on = calmStep(this.st, v, dt, { camera, thr });
    const screen = this.root.parentElement;
    screen.classList.toggle('calm', on);
    screen.classList.toggle('calm-peek', on && this.st.peek);
    if (!on) { this.since = null; this.inhale = null; return; }
    this.since ??= now;
    // With reduced motion the orb keeps still, but the colours and tones still pace the breath.
    const phase = breathAt(now - this.since);
    const b = this.reduceMotion ? { inhale: phase.inhale, k: 0.5 } : phase;
    if (b.inhale !== this.inhale) {
      this.inhale = b.inhale;
      this.root.classList.toggle('out', !b.inhale);
      this.onBreath(b.inhale);
    }
    this.root.style.setProperty('--calm', colour);
    // The orb fills the ensō at the top of the in-breath.
    this.orb.setAttribute('r', (34 + 58 * b.k).toFixed(1));
    this.orb.style.opacity = (0.55 + 0.45 * b.k).toFixed(3);
    this.core.setAttribute('r', (6 + 10 * b.k).toFixed(1));
    // On the out-breath two rings drift outwards and fade, one after the other.
    const out = b.inhale ? 0 : 1 - b.k;
    this.ripples.forEach((r, i) => {
      const e = Math.max(0, Math.min(1, out * 1.4 - i * 0.4));
      r.setAttribute('r', (92 + 34 * e).toFixed(1));
      r.style.opacity = this.reduceMotion || b.inhale ? 0 : (0.85 * (1 - e) * Math.min(1, e * 6)).toFixed(3);
    });
    const breaths = (now - this.since) / CALM.breath;
    const words = breaths < CALM.words;
    this.word.textContent = words ? (b.inhale ? 'breathe in' : 'breathe out') : '';
    this.word.style.opacity = (0.45 + 0.5 * b.k).toFixed(2);
    this.time.textContent = timeText;
  }
}
