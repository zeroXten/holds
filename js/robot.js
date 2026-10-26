// Robo Monk: an easter egg (tap the version in Settings 5 times). A pixel-art Shaolin
// robot monk stands in a plain training hall and copies you, mirror-style, using the same pose
// detection as the holds. It reacts to a few big, easy movements with sounds and speech.

import { Pix, rgb, mix, bayer } from './pixel.js';
import { makeBody, kneeDrop } from './scoring.js';
import { AutoFrame } from './framing.js';
import { syntheticLandmarks, standing, lerpSpec } from './figure.js';
import * as audio from './audio.js';

const ART = 3;  // CSS pixels per art pixel: chunky enough to look pixel-art

const C = {
  outline: rgb('#1d1a24'), metal: rgb('#b8c4cc'), metalLight: rgb('#e8f0f4'), metalDark: rgb('#6c7a86'),
  robe: rgb('#e8891e'), robeLight: rgb('#f6a84e'), robeDark: rgb('#b85a12'), drape: rgb('#a8321e'), drapeLight: rgb('#c8482c'),
  wrap: rgb('#f2ead8'), wrapLine: rgb('#cbbd9e'), shoe: rgb('#2a2622'),
  gold: rgb('#f0c040'), bead: rgb('#6a3418'), beadBig: rgb('#4e2612'), beadLight: rgb('#a86a3a'),
  eye: rgb('#6ff3ff'), eyeGlow: rgb('#6ff3ff', 90), eyeHot: rgb('#e8ffff'), visor: rgb('#1f2a33'), led: rgb('#ffb02e'),
};

// ---- Drawing ----

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A cloth (or metal) tube: outline, fill, and a soft highlight along the top-left.
function tube(p, a, b, r, fill, light) {
  p.capsule(a.x, a.y, b.x, b.y, r + 1, C.outline);
  p.capsule(a.x, a.y, b.x, b.y, r, fill);
  if (light && r >= 2) p.capsule(a.x - r * 0.35, a.y - r * 0.35, b.x - r * 0.35, b.y - r * 0.35, Math.max(1, r * 0.3), light);
}

// Robo Monk: the Shaolin uniform (saffron robes and sleeves, a red kasaya over one
// shoulder, prayer beads, white leg wraps, black cloth shoes) on a deadpan, neutral
// robot: an angular metal head with a visor and a speaker grille, the six monk's dots
// as amber LEDs on the crown, blocky metal hands. Not cute, not menacing.
// J: body points in art pixels (plus `tilt`, the head's angle). mood: 'normal' | 'happy'
// (the visor flares). t: seconds, for the visor's scan and flicker.
export function drawRobot(p, J, t, mood = 'normal') {
  const sh = mid(J.ls, J.rs), hip = mid(J.lh, J.rh);
  const T = Math.max(8, len(sh, hip));            // torso length sets the scale
  const r = Math.max(1.5, T * 0.1);              // limb thickness
  const R = Math.max(4, T * 0.3);                // head radius

  // Legs: loose robe trousers to the knee, white wraps on the shin, black cloth shoes.
  for (const s of ['l', 'r']) {
    const h = J[s + 'h'], k = J[s + 'k'], a = J[s + 'a'], toe = J[s + 't'] ?? { x: a.x, y: a.y + r };
    tube(p, k, a, r * 0.95, C.wrap);
    const n = Math.max(2, Math.round(len(k, a) / Math.max(2, r * 0.9)));
    for (let i = 1; i < n; i++) {
      const c = { x: k.x + (a.x - k.x) * (i / n), y: k.y + (a.y - k.y) * (i / n) };
      p.line(c.x - r * 0.8, c.y - r * 0.3, c.x + r * 0.8, c.y + r * 0.3, C.wrapLine);
    }
    tube(p, h, k, r * 1.55, C.robeDark, C.robe);
    const tip = { x: a.x + (toe.x - a.x) * 1.1, y: Math.max(a.y, toe.y) + r * 0.2 };
    tube(p, { x: a.x, y: a.y + r * 0.3 }, tip, r * 1.05, C.shoe);
  }

  // Robe: as wide as her shoulders and hips look, so it narrows to a profile when she
  // turns side-on, with a minimum for the depth of a body. "Across" runs along the
  // shoulders, or across the torso when they line up.
  const sw = len(J.ls, J.rs);
  let ux, uy;
  if (sw > T * 0.15) { ux = (J.rs.x - J.ls.x) / sw; uy = (J.rs.y - J.ls.y) / sw; } else { ux = (hip.y - sh.y) / T; uy = -(hip.x - sh.x) / T; }
  const shHalf = Math.max(sw / 2, T * 0.17), hipHalf = Math.max(len(J.lh, J.rh) / 2, T * 0.15);
  const ls = { x: sh.x - ux * shHalf, y: sh.y - uy * shHalf }, rs = { x: sh.x + ux * shHalf, y: sh.y + uy * shHalf };
  const lh = { x: hip.x - ux * hipHalf, y: hip.y - uy * hipHalf }, rh = { x: hip.x + ux * hipHalf, y: hip.y + uy * hipHalf };
  // Which way she's facing: 0 front-on, ±1 in profile (to screen right / left).
  const turn = Math.max(-1, Math.min(1, J.turn ?? 0)), side = Math.abs(turn);
  const widen = (pt, k) => [pt.x + ux * k, pt.y + uy * k];
  const down = { x: (hip.x - sh.x) / T, y: (hip.y - sh.y) / T };
  const hem = (pt, k) => [pt[0] + down.x * T * k, pt[1] + down.y * T * k];
  const hw = len(lh, rh) / 2 || r;
  const robe = [widen(ls, -r * 1.3), widen(rs, r * 1.3), hem(widen(rh, r * 1.8 + hw * 0.35), 0.18), hem(widen(lh, -r * 1.8 - hw * 0.35), 0.18)];
  const c0 = mid(sh, hip);
  p.poly(robe.map(([x, y]) => [x + Math.sign(x - c0.x), y + Math.sign(y - c0.y)]), C.outline);
  p.poly(robe, C.robe);
  // A lighter fold down the middle
  p.capsule(sh.x + ux * r, sh.y + uy * r, hip.x + ux * r, hip.y + uy * r, Math.max(1, r * 0.35), C.robeLight);
  // The red kasaya: a broad drape from one shoulder across to the other hip.
  const drape = [widen(ls, -r * 1.3), widen(ls, r * 1.6), widen(rh, r * 1.8 + hw * 0.35), hem(widen(rh, r * 1.8 + hw * 0.35), 0.18), hem(widen(rh, -r * 1.2), 0.18)];
  p.poly(drape, C.drape);
  p.capsule(ls.x + ux * r * 0.2, ls.y + uy * r * 0.2, rh.x - ux * r * 0.6, rh.y - uy * r * 0.6, Math.max(1, r * 0.3), C.drapeLight);
  // Sash belt across the hips
  p.capsule(lh.x - ux * r * 1.5, lh.y - uy * r * 1.5, rh.x + ux * r * 1.5, rh.y + uy * r * 1.5, Math.max(1, r * 0.4), C.robeDark);

  // Arms go in front of the beads and head (drawn at the end), unless the camera
  // says a hand is clearly behind the body.
  const behind = arm => (J[arm + 'w'].z ?? 0) > (J.headZ ?? 0) + 0.15;
  // Sleeves hang from the outer edge of the robe, not from inside it.
  const armOut = arm => { const k = (arm === 'l' ? -1 : 1) * r * 1.3; return { x: ux * k + down.x * r * 0.3, y: uy * k + down.y * r * 0.3 }; };
  for (const arm of ['l', 'r']) if (behind(arm)) drawArm(p, J, arm, r, armOut(arm));

  // Prayer beads (mala): two rounded loops hanging from behind the neck, on top of the
  // robe but under the head. A longer one with bigger beads, a shorter one inside it.
  const neck = { x: sh.x + down.x * r * 0.6 + turn * R * 0.35, y: sh.y + down.y * r * 0.6 };
  const loop = (halfWidth, depth, beadR, wood, light) => {
    // The lower half of an ellipse from one side of the neck round to the other.
    const steps = 160, pts = [];
    for (let i = 0; i <= steps; i++) {
      // Skip the very ends, where the string runs up behind the neck.
      const a = (0.12 + 0.76 * (i / steps)) * Math.PI, cx = Math.cos(a), sy = Math.sin(a);
      pts.push({ x: neck.x - ux * halfWidth * cx + down.x * depth * sy, y: neck.y - uy * halfWidth * cx + down.y * depth * sy });
    }
    // Space the beads evenly along the curve.
    let run = 0, next = 0;
    const gap = beadR * 2.7;
    for (let i = 0; i < pts.length; i++) {
      if (i) run += len(pts[i], pts[i - 1]);
      if (run < next) continue;
      next += gap;
      const b = pts[i];
      p.disc(b.x, b.y, beadR + 0.6, C.outline);
      p.disc(b.x, b.y, beadR, wood);
      if (beadR >= 1.5) p.set(b.x - beadR * 0.35, b.y - beadR * 0.35, light);
    }
  };
  const open = 1 - side * 0.65;  // loops narrow as she turns
  loop(R * 0.85 * open, T * 0.8, Math.max(1.2, r * 0.52), C.beadBig, C.beadLight);
  loop(R * 0.42 * open, T * 0.4, Math.max(1, r * 0.36), C.bead, C.beadLight);

  // Head: angular metal, tilted to match hers. Drawn from points in head units (R).
  // A little higher than the camera's head point, so there's a neck and no shrug.
  const head0 = J.head ?? { x: sh.x, y: sh.y - T * 0.5 };
  const head = { x: head0.x - down.x * r * 0.9, y: head0.y - down.y * r * 0.9 };
  const tilt = Math.max(-0.45, Math.min(0.45, J.tilt ?? 0)), ct = Math.cos(tilt), st = Math.sin(tilt);
  const at = (dx, dy) => [head.x + (dx * ct - dy * st) * R, head.y + (dx * st + dy * ct) * R];
  const shape = pts => pts.map(([x, y]) => at(x, y));
  // Turned, the skull narrows a little and the face features slide round towards the front.
  const sk = 1 - side * 0.12;
  const fx = x => turn * 0.42 + x * (1 - side * 0.55);
  const face = pts => shape(pts.map(([x, y]) => [fx(x), y]));
  const faceAt = (x, y) => at(fx(x), y);
  // Segmented neck
  for (const k of [0.25, 0.55, 0.85]) {
    const n = { x: sh.x + (head.x - sh.x) * k * 0.6, y: sh.y + (head.y - sh.y) * k * 0.6 };
    p.ellipse(n.x, n.y, r * 1.05 + 1, r * 0.45 + 1, C.outline);
    p.ellipse(n.x, n.y, r * 1.05, r * 0.45, C.metalDark);
  }
  // Side panels (the one on the side she's facing is hidden behind the face when turned)
  for (const sx of [-1, 1]) {
    if (side > 0.35 && Math.sign(turn) === sx) continue;
    const panel = shape([[sx * 0.88 * sk, -0.35], [sx * 1.08 * sk, -0.3], [sx * 1.08 * sk, 0.3], [sx * 0.88 * sk, 0.35]]);
    p.poly(panel.map(([x, y]) => [x + sx, y]), C.outline);
    p.poly(panel, C.metalDark);
  }
  // Skull: chamfered box with a slightly domed crown
  const skull = [[-0.62, -1.02], [0.62, -1.02], [0.9, -0.72], [0.92, 0.3], [0.68, 0.98], [-0.68, 0.98], [-0.92, 0.3], [-0.9, -0.72]];
  p.poly(shape(skull.map(([x, y]) => [x * 1.08 * sk, y * 1.06])), C.outline);
  p.poly(shape(skull.map(([x, y]) => [x * sk, y])), C.metal);
  p.poly(shape([[0.5, -1.02], [0.62, -1.02], [0.9, -0.72], [0.92, 0.3], [0.68, 0.98], [0.5, 0.98]].map(([x, y]) => [x * sk, y])), C.metalDark);   // shaded side
  p.poly(shape([[-0.55, -0.95], [-0.2, -0.95], [-0.42, -0.62], [-0.72, -0.62]].map(([x, y]) => [x * sk, y])), C.metalLight);                     // glint
  // The six monk's dots, as amber LEDs on the crown
  for (const [dx, dy] of [[-0.3, -0.82], [0, -0.86], [0.3, -0.82], [-0.15, -0.68], [0.15, -0.68], [0, -0.74]]) {
    const [x, y] = at(dx * (1 - side * 0.4) + turn * 0.15, dy);
    p.set(x, y, C.led);
  }
  // Visor: a dark band with a glowing bar and a slowly scanning "pupil"
  p.poly(face([[-0.82, -0.32], [0.82, -0.32], [0.78, 0.08], [-0.78, 0.08]]), C.visor);
  const flare = mood === 'happy', dim = !flare && (t % 5) < 0.12;
  if (!dim) {
    const [ax, ay] = faceAt(-0.7, -0.12), [bx, by] = faceAt(0.7, -0.12);
    p.line(ax, ay, bx, by, flare ? C.eyeHot : C.eye);
    if (flare) { const [cx2, cy2] = faceAt(-0.7, -0.2), [dx2, dy2] = faceAt(0.7, -0.2); p.line(cx2, cy2, dx2, dy2, C.eye); }
    const scan = Math.sin(t * 0.8) * 0.45;
    const [px, py] = faceAt(scan, -0.12);
    p.disc(px, py, Math.max(1, R * 0.12), C.eyeGlow);
    p.capsule(px - R * 0.12, py, px + R * 0.12, py, Math.max(0.8, R * 0.06), C.eyeHot);
  }
  // Jaw seam and speaker grille
  const [j1x, j1y] = faceAt(-0.86, 0.38), [j2x, j2y] = faceAt(0.86, 0.38);
  p.line(j1x, j1y, j2x, j2y, C.metalDark);
  p.poly(face([[-0.32, 0.5], [0.32, 0.5], [0.3, 0.82], [-0.3, 0.82]]), C.visor);
  for (const gx of [-0.18, 0, 0.18]) {
    const [g1x, g1y] = faceAt(gx, 0.56), [g2x, g2y] = faceAt(gx, 0.76);
    p.line(g1x, g1y, g2x, g2y, C.metalDark);
  }

  for (const arm of ['l', 'r']) if (!behind(arm)) drawArm(p, J, arm, r, armOut(arm));
}

// One arm: a wide saffron sleeve down to the wrist, a cuff, and a blocky metal hand.
// `out`: how far to move the shoulder outwards; the elbow moves about half as far and
// the hand barely at all, so hands that meet in the middle still meet.
function drawArm(p, J, side, r, out = { x: 0, y: 0 }) {
  const shift = (pt, k) => ({ ...pt, x: pt.x + out.x * k, y: pt.y + out.y * k });
  const S = shift(J[side + 's'], 1), E = shift(J[side + 'e'], 0.55), W = shift(J[side + 'w'], 0.15);
  tube(p, S, E, r * 1.45, C.robe, C.robeLight);
  tube(p, E, W, r * 1.25, C.robe, C.robeLight);
  p.disc(W.x, W.y, r * 1.3 + 1, C.outline);
  p.disc(W.x, W.y, r * 1.3, C.robeDark);  // cuff
  // The hand runs along the line of the forearm, with a knuckle seam.
  const fx = (W.x - E.x) / (len(E, W) || 1), fy = (W.y - E.y) / (len(E, W) || 1);
  const tip = { x: W.x + fx * r * 1.9, y: W.y + fy * r * 1.9 };
  const hand = (k, c) => p.poly([
    [W.x - fy * r * k, W.y + fx * r * k], [W.x + fy * r * k, W.y - fx * r * k],
    [tip.x + fy * r * k * 0.85, tip.y - fx * r * k * 0.85], [tip.x - fy * r * k * 0.85, tip.y + fx * r * k * 0.85]], c);
  hand(1.05 + 1 / r, C.outline);
  hand(1.05, C.metal);
  const kn = { x: W.x + fx * r * 1.15, y: W.y + fy * r * 1.15 };
  p.line(kn.x - fy * r * 0.9, kn.y + fx * r * 0.9, kn.x + fy * r * 0.9, kn.y - fx * r * 0.9, C.metalDark);
}

// ---- Gestures ----

// The movement she's making, if it's one the robot reacts to.
export function gesture(b) {
  const handsUp = b.arms.L.c.y < b.nose.y && b.arms.R.c.y < b.nose.y;
  if (handsUp) return 'handsUp';
  const level = s => Math.abs(b.arms[s].c.y - (s === 'L' ? b.ls : b.rs).y) < 0.35 * b.torsoLen;
  if (level('L') && level('R') && Math.abs(b.arms.L.c.x - b.arms.R.c.x) > 2.4 * b.shoulderW) return 'armsWide';
  if (Math.abs(b.legs.L.b.y - b.legs.R.b.y) > 0.35 * b.torsoLen) return 'legUp';
  if (Math.max(kneeDrop(b.legs.L), kneeDrop(b.legs.R)) < 0.45) return 'squat';
  return null;
}

const REACTIONS = {
  handsUp: { text: 'Hooray! 🙌', say: 'Hooray!', fx: 'sparkle', mood: 'happy' },
  armsWide: { text: 'I’m flying! ✈️', say: 'Wheee! I’m flying!', fx: 'wind', mood: 'happy' },
  legUp: { text: 'Crane stance! 🦩', say: 'Crane stance!', fx: 'feather', mood: 'happy' },
  squat: { text: 'Hi-ya! 🥋', say: 'Horse stance! Hi-ya!', fx: 'stars', mood: 'happy' },
};

// ---- Demo mode: a front-on routine through every move the robot reacts to ----

export class RobotDemoSource {
  constructor() {
    const stand = standing('front');
    const pose = (arms, legs = stand.legs) => ({ ...stand, arms, legs });
    this.poses = [
      stand,
      pose({ L: [175, 178], R: [-175, -178] }),                              // hands up
      stand,
      pose({ L: [90, 90], R: [-90, -90] }),                                  // arms wide
      stand,
      pose({ L: [20, -70], R: [-20, 70] }, { L: [95, -5], R: [-3, 0] }),     // a leg up
      stand,
      pose({ L: [25, -10], R: [-25, 10] }, { L: [80, 6], R: [-80, -6] }),   // squat, fists at the hips
    ];
    this.t0 = performance.now() / 1000;
    this.mirrored = true;
  }

  next() {
    const t = performance.now() / 1000 - this.t0, step = 2.2, i = Math.floor(t / step) % this.poses.length;
    const k = Math.min(1, (t % step) / 0.6);
    const spec = lerpSpec(this.poses[i], this.poses[(i + 1) % this.poses.length], k * k * (3 - 2 * k));
    return { landmarks: syntheticLandmarks(spec, { width: 720, height: 1280, noise: 0.002 }), width: 720, height: 1280 };
  }

  stop() {}
}

// ---- The scene ----

// A plain training hall: a warm wall with a soft light behind the robot, a beam, and a
// plank floor. Drawn once per screen size and copied into every frame.
export function hallBackground(W, H) {
  const p = new Pix(W, H), floor = Math.round(H * 0.8);
  const wallTop = '#2a1d16', wallLow = '#4a3326', glow = '#6e4c36';
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < W; x++) {
      // Vertical gradient, lifted by an elliptical glow behind where the robot stands.
      const dx = (x - W / 2) / (W * 0.55), dy = (y - floor * 0.55) / (floor * 0.6);
      const light = Math.max(0, 1 - Math.hypot(dx, dy));
      const base = mix(wallTop, wallLow, y / floor);
      p.set(x, y, rgb(light > bayer(x, y) * 0.9 + 0.05 ? mix(base, glow, light * 0.7) : base));
    }
  }
  const beam = Math.round(H * 0.16);
  p.rect(0, beam, W, 3, rgb('#1a120d'));
  p.hline(0, W, beam, rgb('#5a3d2c'));
  for (let y = floor; y < H; y++) {
    const k = (y - floor) / (H - floor);
    for (let x = 0; x < W; x++) {
      const plank = Math.floor((x - W / 2) / (6 + k * 10) + 100) % 2;
      p.set(x, y, rgb(mix(plank ? '#7a5234' : '#6c4830', '#3e2a1e', 1 - k * 0.6)));
    }
  }
  p.hline(0, W, floor, rgb('#1a120d'));
  return p.data.slice();
}

// Pose landmarks (normalised) → robot points in art pixels, through the auto-framing view.
function toJoints(lm, view, mirrored) {
  const at = i => ({ x: (view.tx + view.s * (mirrored ? 1 - lm[i].x : lm[i].x) * view.vw) / ART, y: (view.ty + view.s * lm[i].y * view.vh) / ART, z: lm[i].z ?? 0 });
  const ears = mid(at(7), at(8)), nose = at(0);
  return {
    headZ: lm[0].z ?? 0,  // the camera's depth estimate: smaller is nearer
    ls: at(11), rs: at(12), le: at(13), re: at(14), lw: at(15), rw: at(16),
    lh: at(23), rh: at(24), lk: at(25), rk: at(26), la: at(27), ra: at(28), lt: at(31), rt: at(32),
    head: { x: (ears.x + nose.x) / 2, y: (ears.y + nose.y) / 2 - len(at(11), at(12)) * 0.08 },
    // Facing: how far the nose sits to one side of the ears, in head widths (0 = front-on).
    turn: (nose.x - ears.x) / (len(mid(at(11), at(12)), mid(at(23), at(24))) * 0.34 * 0.6),
    // Head tilt from the line between the ears, only when they're clearly apart
    // (side-on they line up and the angle would be noise).
    tilt: (() => {
      const [a, b] = at(7).x < at(8).x ? [at(7), at(8)] : [at(8), at(7)];
      return len(a, b) > len(at(11), at(12)) * 0.35 ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    })(),
  };
}

export class RobotScene {
  // source: a CameraSource or DemoSource; state: app progress (for the temple background).
  constructor({ canvas, bubble, source, state }) {
    Object.assign(this, { canvas, bubble, source, state });
    this.framer = new AutoFrame();
    this.particles = [];
    this.mood = 'normal';
    this.moodUntil = 0;
    this.seenFor = 0;
    this.lostFor = 0;
    this.greeted = false;
    this.current = null;
    this.heldFor = 0;
    this.cooldown = {};
    this.last = performance.now() / 1000;
  }

  say(text, phrase, ms = 2500) {
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => { this.bubble.hidden = true; }, ms);
    if (phrase) audio.say(phrase, { priority: true, pitch: 1.6 });
  }

  burst(kind, at) {
    const colors = { sparkle: [C.gold, C.metalLight, C.eye], wind: [C.metalLight, C.eye], feather: [C.metalLight, C.robe], stars: [C.gold, C.drape, C.robe] }[kind];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 30;
      const p = at[i % at.length];
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'feather' ? 0 : 15), life: 1.2, c: colors[i % colors.length], kind });
    }
  }

  frame() {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - this.last);
    this.last = now;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    const W = Math.max(40, Math.round(cw / ART)), H = Math.max(60, Math.round(ch / ART));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }

    // Reuse one buffer and start each frame from the pre-drawn background.
    if (!this.pix || this.pix.w !== W || this.pix.h !== H) {
      this.pix = new Pix(W, H);
      this.bg = hallBackground(W, H);
      this.img = this.canvas.getContext('2d').createImageData(W, H);
    }
    const p = this.pix;
    p.data.set(this.bg);

    // Copy her only once her whole body has been clearly in view for a moment; until
    // then (or if she steps out) stand in a neutral pose rather than follow guesses.
    const frame = this.source.next();
    let lm = frame?.landmarks, fw = frame?.width, fh = frame?.height, mirrored = this.source.mirrored;
    const clear = i => { const q = lm?.[i]; return q && (q.visibility ?? 1) > 0.6 && q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1; };
    // Shoulders, hips, knees, ankles: one of each pair is enough (side-on, the far side hides).
    const whole = !!lm && [[11, 12], [23, 24], [25, 26], [27, 28]].every(([a, b]) => clear(a) || clear(b));
    if (whole) { this.seenFor += dt; this.lostFor = 0; } else { this.lostFor += dt; this.seenFor = 0; }
    const present = whole && this.seenFor > 0.5;
    if (present !== this.wasPresent) { this.wasPresent = present; this.blendUntil = now + 0.7; }  // ease between poses
    if (!present) {
      lm = syntheticLandmarks(standing('front'), { width: 720, height: 1280 });
      fw = 720; fh = 1280; mirrored = false;
    }
    const view = this.framer.update(dt, { landmarks: lm, width: fw, height: fh }, cw, ch, mirrored, { top: 60, bottom: 20 });

    if (present) {
      if (!this.greeted && this.seenFor > 1) {
        this.greeted = true;
        this.cooldown.any = now + 2.5;  // let the hello land before any reactions
        this.say('Hello! 👋', 'Hello! I’m Robo Monk. I copy you!', 3500);
      }
      const g = gesture(makeBody(lm, fw, fh));
      this.heldFor = g && g === this.current ? this.heldFor + dt : 0;
      this.current = g;
      if (this.greeted && g && this.heldFor > 0.35 && now > (this.cooldown[g] ?? 0) && now > (this.cooldown.any ?? 0)) {
        const r = REACTIONS[g];
        this.cooldown[g] = now + 4;
        this.cooldown.any = now + 1.5;
        this.say(r.text, r.say);
        audio.play('robot');
        this.mood = r.mood;
        this.moodUntil = now + 1.8;
        const J = toJoints(lm, view, mirrored);
        this.burst(r.fx, g === 'handsUp' ? [J.lw, J.rw] : g === 'legUp' ? [J.lk, J.rk] : [J.lw, J.rw, J.head]);
      }
    } else if (this.greeted && this.lostFor > 2 && this.lostFor - dt <= 2) {
      this.say('Where are you? 👀', 'Where are you?');
    }
    if (now > this.moodUntil) this.mood = 'normal';

    // Ease the drawn pose towards the target: quickly while copying her, slowly when
    // switching between her and the neutral pose so it doesn't jump.
    const target = toJoints(lm, view, mirrored);
    const k = Math.min(1, dt / (now < (this.blendUntil ?? 0) ? 0.25 : 0.04));
    const J = this.shown ? Object.fromEntries(Object.entries(target).map(([key, v]) => {
      const was = this.shown[key];
      if (typeof v === 'number') return [key, was + (v - was) * k];
      return [key, { ...v, x: was.x + (v.x - was.x) * k, y: was.y + (v.y - was.y) * k }];
    })) : target;
    this.shown = J;
    this.tilt = (this.tilt ?? 0) + (J.tilt - (this.tilt ?? 0)) * Math.min(1, dt * 6);  // smooth the head's movement
    J.tilt = this.tilt;
    const turn = Math.max(-1, Math.min(1, J.turn || 0));
    this.turn = (this.turn ?? 0) + (turn - (this.turn ?? 0)) * Math.min(1, dt * 5);
    J.turn = this.turn;
    drawRobot(p, J, now, this.mood);

    // Particles
    this.particles = this.particles.filter(q => (q.life -= dt) > 0);
    for (const q of this.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.kind === 'feather' ? 8 : 40) * dt;
      p.set(q.x, q.y, q.c);
      if (q.life > 0.6) { p.set(q.x + 1, q.y, q.c); p.set(q.x, q.y + 1, q.c); }
    }

    const ctx = this.canvas.getContext('2d');
    new Uint32Array(this.img.data.buffer).set(p.data);
    ctx.putImageData(this.img, 0, 0);
  }
}
