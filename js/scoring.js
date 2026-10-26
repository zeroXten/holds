// Turns pose landmarks into a 0–100 form score for a hold, plus per-criterion
// results used for coaching cues and colouring the skeleton.

const RAD = 180 / Math.PI;
export const LM = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Interior angle at b, in degrees.
export function angleAt(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * RAD;
}

// Angle of the line bottom→top away from vertical, in degrees.
export const lean = (top, bottom) => Math.abs(Math.atan2(top.x - bottom.x, bottom.y - top.y)) * RAD;

function limb(P, a, b, c) {
  return {
    a: P[a], b: P[b], c: P[c], idx: [a, b, c],
    angle: angleAt(P[a], P[b], P[c]),
    len: dist(P[a], P[b]) + dist(P[b], P[c]),
    upperLen: dist(P[a], P[b]), lowerLen: dist(P[b], P[c]),
  };
}

// Landmarks are normalised; convert to pixels so angles aren't skewed by aspect ratio.
// Left/right partners: shoulders, elbows, wrists, hands, hips, knees, ankles, heels, toes.
const PAIRS = [[11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const PARTNER = new Map(PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));
const SEEN = 0.5;  // visibility at which the camera is confident about a point

// `fillHidden`: for side-on holds where both sides do the same thing, a point hidden
// behind the body takes its visible partner's position instead of the camera's guess.
export function makeBody(landmarks, width, height, { fillHidden = false } = {}) {
  let P = landmarks.map(p => ({ x: p.x * width, y: p.y * height, v: p.visibility ?? 1 }));
  if (fillHidden) {
    P = P.map((p, i) => {
      const q = P[PARTNER.get(i)];
      return q && p.v < SEEN && q.v >= SEEN ? { ...q } : p;
    });
  }
  const b = {
    P,
    nose: P[LM.nose], ls: P[LM.lShoulder], rs: P[LM.rShoulder],
    lh: P[LM.lHip], rh: P[LM.rHip], la: P[LM.lAnkle], ra: P[LM.rAnkle],
    legs: { L: limb(P, LM.lHip, LM.lKnee, LM.lAnkle), R: limb(P, LM.rHip, LM.rKnee, LM.rAnkle) },
    arms: { L: limb(P, LM.lShoulder, LM.lElbow, LM.lWrist), R: limb(P, LM.rShoulder, LM.rElbow, LM.rWrist) },
  };
  b.sh = mid(b.ls, b.rs);
  b.hip = mid(b.lh, b.rh);
  b.torsoLen = dist(b.sh, b.hip) || 1;
  b.shoulderW = dist(b.ls, b.rs) || 1;
  b.torsoLean = lean(b.sh, b.hip);
  return b;
}

// How far the hip sits above the knee, relative to shin length: ~1 standing, ~0 thigh level.
// Robust in front view, where the thigh's true angle is hidden by foreshortening.
export const kneeDrop = leg => (leg.b.y - leg.a.y) / (leg.lowerLen || 1);

function criterionScore(c, v) {
  if (c.min !== undefined && v < c.min) return { s: Math.max(0, 1 - (c.min - v) / c.soft), dir: 'low' };
  if (c.max !== undefined && v > c.max) return { s: Math.max(0, 1 - (v - c.max) / c.soft), dir: 'high' };
  return { s: 1, dir: null };
}

const cueFor = (c, dir) => (typeof c.cue === 'string' ? c.cue : c.cue[dir]);

// Whether the camera can see the points a hold needs. `eitherSide`: side-on, the far arm
// and leg are hidden behind the body, so seeing one of each left/right pair is enough.
export function visible(landmarks, indices, { eitherSide = false } = {}) {
  const ok = i => {
    const p = landmarks[i];
    return p && (p.visibility ?? 1) >= SEEN && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
  };
  return indices.every(i => ok(i) || (eitherSide && PARTNER.has(i) && ok(PARTNER.get(i))));
}

// How a hold should read the camera: side-on holds only need the near side, and
// side-on holds where both sides match fill hidden points from the near side.
export const viewing = hold => ({
  eitherSide: hold.view === 'side',
  fillHidden: hold.view === 'side' && !hold.sides,
});

// Scores a body against a hold level. For one-sided holds every leg assignment
// is tried and the best wins, so either leg can lead.
export function scorePose(hold, level, body) {
  const criteria = hold.criteria(level);
  const sides = hold.sides ? [{ key: 'L', main: body.legs.L, other: body.legs.R }, { key: 'R', main: body.legs.R, other: body.legs.L }] : [{ key: null }];
  let best = null;
  for (const side of sides) {
    const results = criteria.map(c => {
      const value = c.value(body, side);
      const { s, dir } = criterionScore(c, value);
      const joints = typeof c.joints === 'function' ? c.joints(side) : c.joints;
      return { id: c.id, label: c.label, value, min: c.min, max: c.max, s, weight: c.weight ?? 1, cue: dir ? cueFor(c, dir) : null, joints };
    });
    const wsum = results.reduce((t, r) => t + r.weight, 0);
    const mean = results.reduce((t, r) => t + r.s * r.weight, 0) / wsum;
    const min = Math.min(...results.map(r => r.s));
    // Gate criteria (the position, in balance and stillness holds) scale the whole score:
    // stillness counts for nothing if you're not in the position.
    const gate = Math.min(1, ...results.filter((r, i) => criteria[i].gate).map(r => r.s));
    const score = Math.round(100 * (0.6 * mean + 0.4 * min) * gate);
    if (!best || score > best.score) best = { score, results, side: side.key };
  }
  return best;
}

// Sway: how much the body moves while holding still. Each part (the torso's centre,
// the head and each hand) is first smoothed over about a fifth of a second, which takes
// out most of the tracking's own frame-to-frame jitter but keeps real fidgets and sway.
// Then, over the last couple of seconds, it measures how far each part wanders from its
// average position (root mean square), in torso lengths. The sway is the part that
// moved most, so a fidgeting hand or a nodding head counts in full rather than being
// averaged away by the parts that stayed still.
const SWAY_PARTS = [b => mid(b.sh, b.hip), b => b.nose, b => b.arms.L.c, b => b.arms.R.c];
const SWAY_SMOOTH = 0.2;  // seconds

export class SwayMeter {
  constructor(window = 2.5) { this.window = window; this.reset(); }

  reset() { this.samples = []; this.t = 0; this.smooth = null; }

  update(body, dt) {
    this.t += dt;
    const raw = SWAY_PARTS.map(at => at(body));
    const k = 1 - Math.exp(-dt / SWAY_SMOOTH);
    this.smooth = this.smooth ? this.smooth.map((p, i) => ({ x: p.x + (raw[i].x - p.x) * k, y: p.y + (raw[i].y - p.y) * k })) : raw;
    this.samples.push({ t: this.t, pts: this.smooth, scale: body.torsoLen });
    while (this.t - this.samples[0].t > this.window) this.samples.shift();
    const n = this.samples.length;
    if (n < 5) return 0;
    const scale = this.samples.reduce((t, s) => t + s.scale, 0) / n;
    let worst = 0;
    SWAY_PARTS.forEach((_, i) => {
      const mx = this.samples.reduce((t, s) => t + s.pts[i].x, 0) / n, my = this.samples.reduce((t, s) => t + s.pts[i].y, 0) / n;
      const rms = Math.sqrt(this.samples.reduce((t, s) => t + (s.pts[i].x - mx) ** 2 + (s.pts[i].y - my) ** 2, 0) / n);
      worst = Math.max(worst, rms);
    });
    return worst / scale;
  }
}
