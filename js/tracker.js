// Steadies the pose model's output using the fact that a body moves continuously.
// The model reads each frame almost on its own, so in awkward positions (a deep
// forward fold, side-on) it can briefly put a hand somewhere impossible or swap left
// and right. The tracker locks on once your whole body is seen clearly (the start of
// every session), then follows you:
//   - left/right swaps are switched back when the other labelling fits the last frame far better
//   - a point that jumps further than a body could move is held at its last good position,
//     unless it stays in the new place long enough to be real
//   - light smoothing takes out jitter
// Positions are normalised (0–1), as the pose model gives them.

// To lock on, one of each of these left/right pairs must be seen clearly (side-on, the far
// side is hidden): shoulders, hips, knees, ankles.
const CORE = [[11, 12], [23, 24], [25, 26], [27, 28]];
const GROUPS = {                                   // left/right groups that can swap together
  arms: [[13, 14], [15, 16], [17, 18], [19, 20], [21, 22]],
  legs: [[25, 26], [27, 28], [29, 30], [31, 32]],
};
const MAX_SPEED = 5;     // torso lengths per second: far faster than any hold, slower than a glitch
const ACCEPT_AFTER = 0.5; // seconds a "jump" must persist before it's believed
const LOST_AFTER = 1.5;   // seconds with no pose before the lock is dropped
const SMOOTH = 0.12;      // seconds of smoothing

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class LandmarkTracker {
  constructor() { this.reset(); }

  reset() {
    this.prev = null;    // last tracked landmarks
    this.pending = [];   // per point: seconds it has stayed somewhere implausible
    this.lostFor = 0;
  }

  get locked() { return !!this.prev; }

  // `raw`: the model's 33 landmarks for this frame (or null), `dt`: seconds since the last.
  update(raw, dt, aspect = 1) {
    if (!raw) {
      this.lostFor += dt;
      if (this.lostFor > LOST_AFTER) this.reset();
      return null;  // nobody seen this frame; keep the lock in case it's a brief dropout
    }
    this.lostFor = 0;
    // Measure in a space where x and y are the same scale.
    const pts = raw.map(p => ({ ...p, x: p.x * aspect }));
    if (!this.prev) {
      // Until there's a clear view to lock on to, pass the model's reading straight through.
      if (!CORE.every(pair => pair.some(i => (pts[i]?.visibility ?? 1) >= 0.6))) return raw;
      this.prev = pts;
      this.pending = pts.map(() => 0);
      return this.out(pts, aspect);
    }
    const prev = this.prev;
    const torso = Math.max(0.05, d2(mid(prev[11], prev[12]), mid(prev[23], prev[24])));

    // 1. Undo left/right swaps, group by group.
    for (const pairs of Object.values(GROUPS)) {
      let same = 0, swapped = 0;
      for (const [l, r] of pairs) {
        same += d2(pts[l], prev[l]) + d2(pts[r], prev[r]);
        swapped += d2(pts[l], prev[r]) + d2(pts[r], prev[l]);
      }
      if (swapped < same * 0.5) {
        for (const [l, r] of pairs) [pts[l], pts[r]] = [pts[r], pts[l]];
      }
    }

    // 2. Hold back impossible jumps; 3. smooth the rest.
    const reach = MAX_SPEED * torso * Math.max(dt, 1 / 60) + torso * 0.15;
    const k = 1 - Math.exp(-Math.max(dt, 1 / 60) / SMOOTH);
    const next = pts.map((p, i) => {
      const q = prev[i];
      if (!q) return p;
      if (d2(p, q) > reach) {
        this.pending[i] += dt;
        if (this.pending[i] < ACCEPT_AFTER) return { ...q, visibility: Math.min(q.visibility ?? 1, p.visibility ?? 1) };
        // It's stayed there: believe it, and jump straight to it.
        this.pending[i] = 0;
        return { ...p };
      }
      this.pending[i] = 0;
      return { ...p, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
    });
    this.prev = next;
    return this.out(next, aspect);
  }

  out(pts, aspect) { return pts.map(p => ({ ...p, x: p.x / aspect })); }
}

function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
