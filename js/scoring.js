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
export function makeBody(landmarks, width, height) {
  const P = landmarks.map(p => ({ x: p.x * width, y: p.y * height, v: p.visibility ?? 1 }));
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

export function visible(landmarks, indices, minVis = 0.5) {
  return indices.every(i => {
    const p = landmarks[i];
    return p && (p.visibility ?? 1) >= minVis && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
  });
}

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
    const score = Math.round(100 * (0.6 * mean + 0.4 * min));
    if (!best || score > best.score) best = { score, results, side: side.key };
  }
  return best;
}
