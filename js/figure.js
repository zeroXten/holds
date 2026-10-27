// Stick figures built from joint angles (simple forward kinematics), so every
// figure keeps consistent limb lengths. The same joints drive the SVG drawings,
// the demo mode's synthetic landmarks and the scoring tests.
//
// Angles are in degrees, measured from straight down, positive towards screen
// right: 0 = down, 90 = right, 180 = up, -90 = left.
// "L" is the person's left, which is screen right when they face the camera.
//
// Optional spec fields: `head` (angle of the neck→head line, default follows
// the torso), `lift` (height of the feet above the ground, e.g. resting on a
// chair), `compact` (lying down: no standing-height padding, and the hips turn
// with the torso so they stack when lying on one side), `ground` (a joint that
// rests on the floor instead of the feet, with `groundGap` above it), `props`
// (chairs/benches drawn under joints: { under, w, gap }), `feet` (side view: how far
// each heel is raised, in degrees of foot tilt; 0 is flat) and `hands` (the angle each
// hand points from the wrist to the fingertips). Without `feet` or `hands`, the heel,
// toe and fingertip points sit on the ankle and wrist.

export const SEG = { torso: 30, neck: 3, headR: 6, upper: 14, fore: 13, thigh: 22, shin: 22, foot: 8.7, heel: 3.8, hand: 4 };
const RAD = Math.PI / 180;
const dir = a => [Math.sin(a * RAD), Math.cos(a * RAD)];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];

export function buildJoints(spec) {
  const front = spec.view === 'front';
  const shoulderHalf = front ? 9 : 1.5;
  const hipHalf = front ? 6 : 1;
  const t = dir(spec.torso ?? 180);
  const perp = [-t[1], t[0]];
  const pelvis = [0, 0];
  const neck = add(pelvis, t, SEG.torso);
  const j = { neck, pelvis };
  j.head = add(neck, spec.head === undefined ? t : dir(spec.head), SEG.neck + SEG.headR);
  j.lShoulder = add(neck, perp, shoulderHalf);
  j.rShoulder = add(neck, perp, -shoulderHalf);
  const hipDir = spec.compact ? perp : [1, 0];
  j.lHip = add(pelvis, hipDir, hipHalf);
  j.rHip = add(pelvis, hipDir, -hipHalf);
  for (const s of ['l', 'r']) {
    const S = s.toUpperCase();
    const [thigh, shin] = spec.legs[S];
    j[s + 'Knee'] = add(j[s + 'Hip'], dir(thigh), SEG.thigh);
    j[s + 'Ankle'] = add(j[s + 'Knee'], dir(shin), SEG.shin);
    const [upper, fore] = spec.arms[S];
    j[s + 'Elbow'] = add(j[s + 'Shoulder'], dir(upper), SEG.upper);
    j[s + 'Wrist'] = add(j[s + 'Elbow'], dir(fore), SEG.fore);
    // A flat foot (facing right): toe ~8.7 forward and down from the ankle, heel just behind.
    // Raising the heel tilts the foot about the ankle.
    const tilt = spec.feet?.[S];
    j[s + 'Toe'] = tilt === undefined ? j[s + 'Ankle'] : add(j[s + 'Ankle'], dir(66 - tilt), SEG.foot);
    j[s + 'Heel'] = tilt === undefined ? j[s + 'Ankle'] : add(j[s + 'Ankle'], dir(-23 - tilt), SEG.heel);
    const hand = spec.hands?.[S];
    j[s + 'Tip'] = hand === undefined ? j[s + 'Wrist'] : add(j[s + 'Wrist'], dir(hand), SEG.hand);
  }
  // Stand the figure on the ground (y = 0) and centre it between the feet.
  const ground = spec.ground
    ? j[spec.ground][1] + (spec.groundGap ?? 0)
    : Math.max(j.lAnkle[1], j.rAnkle[1], j.lToe[1], j.rToe[1], j.lHeel[1], j.rHeel[1]) + (spec.lift ?? 0);
  const cx = (j.lAnkle[0] + j.rAnkle[0] + j.pelvis[0] * 2) / 4;
  for (const k in j) j[k] = [j[k][0] - cx, j[k][1] - ground];
  return j;
}

// Thigh angle that puts the foot on the ground when the hip is `height` above it
// and the knee is bent by `bend` degrees (shin angle = thigh - bend).
export function legReaching(height, bend, sign = 1) {
  let lo = 0, hi = 150;
  const h = a => SEG.thigh * Math.cos(a * RAD) + SEG.shin * Math.cos((a - bend) * RAD);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (h(mid) > height) lo = mid; else hi = mid;
  }
  const a = (lo + hi) / 2;
  return [a * sign, (a - bend) * sign];
}

export function lerpSpec(a, b, t) {
  const l = (x, y) => x + (y - x) * t;
  // Feet and hands are optional: blend from flat feet / plain wrists when only one has them.
  const optional = (p, q) => (p || q ? { L: l(p?.L ?? 0, q?.L ?? 0), R: l(p?.R ?? 0, q?.R ?? 0) } : undefined);
  const pair = (p, q) => [l(p[0], q[0]), l(p[1], q[1])];
  return {
    view: b.view,
    torso: l(a.torso ?? 180, b.torso ?? 180),
    head: b.head, lift: l(a.lift ?? 0, b.lift ?? 0), props: b.props,
    compact: b.compact, ground: t > 0.5 ? b.ground : a.ground, groundGap: b.groundGap,
    legs: { L: pair(a.legs.L, b.legs.L), R: pair(a.legs.R, b.legs.R) },
    arms: { L: pair(a.arms.L, b.arms.L), R: pair(a.arms.R, b.arms.R) },
    feet: optional(a.feet, b.feet), hands: optional(a.hands, b.hands),
  };
}

export const standing = view => ({
  view, torso: 180,
  legs: { L: [view === 'front' ? 3 : 0, 0], R: [view === 'front' ? -3 : 0, 0] },
  arms: { L: [view === 'front' ? 8 : 4, view === 'front' ? 4 : 2], R: [view === 'front' ? -8 : -4, view === 'front' ? -4 : -2] },
});

const BONES = [
  ['neck', 'pelvis'], ['lShoulder', 'rShoulder'], ['lHip', 'rHip'],
  ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'], ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
  ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
  ['lAnkle', 'lToe'], ['rAnkle', 'rToe'], ['lWrist', 'lTip'], ['rWrist', 'rTip'],  // only when drawn (see buildJoints)
];

export function figureSVG(spec, { className = 'figure' } = {}) {
  const j = buildJoints(spec);
  const pts = Object.values(j);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = SEG.headR + 4;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = 4;
  // Keep a consistent scale: always at least as tall as a standing figure.
  // `compact` (lying-down figures) drops that minimum so they aren't tiny.
  const h = Math.max(maxY - minY, spec.compact ? 50 : 92), w = Math.max(maxX - minX, 60);
  const vx = (minX + maxX) / 2 - w / 2, vy = maxY - h;
  const f = n => n.toFixed(1);
  const bones = BONES.filter(([a, b]) => j[a] !== j[b]).map(([a, b]) =>
    `<line x1="${f(j[a][0])}" y1="${f(j[a][1])}" x2="${f(j[b][0])}" y2="${f(j[b][1])}"/>`).join('');
  const props = (spec.props ?? []).map(({ under, w: pw, gap = 2 }) => {
    const top = j[under][1] + gap;
    return `<rect class="prop" x="${f(j[under][0] - pw / 2)}" y="${f(top)}" width="${f(pw)}" height="${f(-top)}" rx="2"/>`;
  }).join('');
  return `<svg class="${className}" viewBox="${f(vx)} ${f(vy)} ${f(w)} ${f(h)}" aria-hidden="true">
    ${props}
    <line class="ground" x1="${f(vx + 4)}" y1="1.5" x2="${f(vx + w - 4)}" y2="1.5"/>
    <g class="bones">${bones}</g>
    <circle class="head" cx="${f(j.head[0])}" cy="${f(j.head[1])}" r="${SEG.headR}"/>
  </svg>`;
}

// MediaPipe pose landmark indices for each figure joint.
const LANDMARK_OF = {
  head: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  lShoulder: [11], rShoulder: [12], lElbow: [13], rElbow: [14],
  lWrist: [15], rWrist: [16], lTip: [17, 19, 21], rTip: [18, 20, 22],
  lHip: [23], rHip: [24], lKnee: [25], rKnee: [26],
  lAnkle: [27], rAnkle: [28], lHeel: [29], rHeel: [30], lToe: [31], rToe: [32],
};

// Fake MediaPipe output for a figure, for demo mode and tests.
// Returns normalised landmarks for an image of `width` x `height`.
export function syntheticLandmarks(spec, { width = 720, height = 1280, noise = 0 } = {}) {
  const j = buildJoints(spec);
  const xs = Object.values(j).map(p => p[0]);
  const minX = Math.min(...xs) - SEG.headR, maxX = Math.max(...xs) + SEG.headR;
  const scale = Math.min((height * 0.6) / 100, (width * 0.85) / (maxX - minX));
  const cx = (minX + maxX) / 2;
  const out = new Array(33);
  for (const [joint, idxs] of Object.entries(LANDMARK_OF)) {
    for (const i of idxs) {
      const n = () => (Math.random() - 0.5) * 2 * noise;
      // The figure's L is screen right, which is image right in the raw (unmirrored) frame.
      out[i] = {
        x: (width / 2 + (j[joint][0] - cx) * scale) / width + n(),
        y: (height * 0.8 + j[joint][1] * scale) / height + n(),
        z: 0, visibility: 0.95,
      };
    }
  }
  return out;
}
