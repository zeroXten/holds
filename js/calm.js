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
  constructor(root, { reduceMotion = false } = {}) {
    this.root = root;
    this.reduceMotion = reduceMotion;
    root.innerHTML = `<svg viewBox="0 0 220 220" aria-hidden="true">
      <circle class="glow" cx="110" cy="110" r="70"/>
      <circle class="glow inner" cx="110" cy="110" r="50"/>
      <g class="enso" transform="rotate(-100 110 110)">
        <circle class="stroke" cx="110" cy="110" r="84" pathLength="100"/>
        <circle class="stroke thin" cx="110" cy="110" r="79" pathLength="100"/>
      </g>
    </svg>
    <div class="calm-word"></div>
    <div class="calm-time"></div>`;
    [this.glow, this.inner] = root.querySelectorAll('.glow');
    [this.stroke, this.thin] = root.querySelectorAll('.stroke');
    this.enso = root.querySelector('.enso');
    this.word = root.querySelector('.calm-word');
    this.time = root.querySelector('.calm-time');
    this.reset();
  }

  reset() {
    this.st = {};
    this.since = null;  // when the calm view last came on, for the breath words
    this.root.parentElement?.classList.remove('calm', 'calm-peek');
  }

  // A tap brings the full screen back; it fades again after you've been steady a while.
  wake() {
    this.st.on = false;
    this.st.steady = 0;
  }

  // `colour` tints the glow (the sash), `timeText` is the hold's clock.
  update(v, dt, now, { camera, thr, colour, timeText }) {
    const on = calmStep(this.st, v, dt, { camera, thr });
    const screen = this.root.parentElement;
    screen.classList.toggle('calm', on);
    screen.classList.toggle('calm-peek', on && this.st.peek);
    if (!on) { this.since = null; return; }
    this.since ??= now;
    const b = this.reduceMotion ? { inhale: true, k: 0.5 } : breathAt(now - this.since);
    this.root.style.setProperty('--calm', colour);
    this.glow.setAttribute('r', (56 + 28 * b.k).toFixed(1));
    this.inner.setAttribute('r', (38 + 24 * b.k).toFixed(1));
    this.glow.style.opacity = (0.1 + 0.14 * b.k).toFixed(3);
    const breaths = (now - this.since) / CALM.breath;
    const words = !this.reduceMotion && breaths < CALM.words;
    this.word.textContent = words ? (b.inhale ? 'breathe in' : 'breathe out') : '';
    this.word.style.opacity = (0.25 + 0.45 * b.k).toFixed(2);
    const p = Math.min(v.sideHeld / v.sideTarget, 1);
    this.stroke.style.strokeDashoffset = (100 - p * 96).toFixed(2);
    this.thin.style.strokeDashoffset = (100 - Math.max(p * 96 - 4, 0)).toFixed(2);
    this.root.classList.toggle('whole', p >= 1);
    this.time.textContent = timeText;
  }
}
