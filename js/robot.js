// Robo Monk: an easter egg (tap the version in Settings 5 times). A pixel-art Shaolin
// robot monk stands in your temple and copies you, mirror-style, using the same pose
// detection as the holds. It reacts to a few big, easy movements with sounds and speech.

import { Pix, rgb } from './pixel.js';
import { renderTemple } from './temple.js';
import { makeBody, kneeDrop } from './scoring.js';
import { AutoFrame } from './framing.js';
import { syntheticLandmarks, standing, lerpSpec } from './figure.js';
import * as audio from './audio.js';

const ART = 3;  // CSS pixels per art pixel: chunky enough to look pixel-art

const C = {
  outline: rgb('#1d1a24'), metal: rgb('#b8c4cc'), metalLight: rgb('#e8f0f4'), metalDark: rgb('#6c7a86'),
  robe: rgb('#e8891e'), robeLight: rgb('#f6a84e'), robeDark: rgb('#b85a12'), drape: rgb('#a8321e'), drapeLight: rgb('#c8482c'),
  wrap: rgb('#f2ead8'), wrapLine: rgb('#cbbd9e'), shoe: rgb('#2a2622'),
  gold: rgb('#f0c040'), bead: rgb('#6a3418'), beadLight: rgb('#9a5a30'),
  eye: rgb('#6ff3ff'), eyeGlow: rgb('#6ff3ff', 90), cheek: rgb('#ff8fa8', 160),
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

// Robo Monk is mostly monk: saffron robes and sleeves, a red kasaya over one shoulder,
// big prayer beads, white leg wraps and black cloth shoes, a bald head with the six
// head dots. The robot shows in the silver skin, glowing eyes and metal hands.
// J: body points in art pixels. mood: 'normal' | 'happy'. t: seconds, for blinking.
export function drawRobot(p, J, t, mood = 'normal') {
  const sh = mid(J.ls, J.rs), hip = mid(J.lh, J.rh);
  const T = Math.max(8, len(sh, hip));            // torso length sets the scale
  const r = Math.max(1.5, T * 0.1);              // limb thickness
  const R = Math.max(4, T * 0.34);               // head radius

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

  // Robe, worked out across the shoulders and hips. Turned side-on (shoulders close
  // together) it keeps a sensible width across the body instead of shrinking to a sliver.
  let ux, uy, ls = J.ls, rs = J.rs, lh = J.lh, rh = J.rh;
  if (len(J.ls, J.rs) > T * 0.35) {
    const w = len(J.ls, J.rs); ux = (J.rs.x - J.ls.x) / w; uy = (J.rs.y - J.ls.y) / w;
  } else {
    ux = (hip.y - sh.y) / T; uy = -(hip.x - sh.x) / T;  // across the torso
    const half = T * 0.28;
    ls = { x: sh.x - ux * half, y: sh.y - uy * half }; rs = { x: sh.x + ux * half, y: sh.y + uy * half };
    lh = { x: hip.x - ux * half * 0.8, y: hip.y - uy * half * 0.8 }; rh = { x: hip.x + ux * half * 0.8, y: hip.y + uy * half * 0.8 };
  }
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

  // Arms: wide saffron sleeves down to the wrist, metal hands.
  for (const s of ['l', 'r']) {
    const S = J[s + 's'], E = J[s + 'e'], W = J[s + 'w'];
    tube(p, S, E, r * 1.45, C.robe, C.robeLight);
    tube(p, E, W, r * 1.25, C.robe, C.robeLight);
    p.disc(W.x, W.y, r * 1.3 + 1, C.outline);
    p.disc(W.x, W.y, r * 1.3, C.robeDark);  // cuff
    const hand = { x: W.x + (W.x - E.x) / (len(E, W) || 1) * r * 0.9, y: W.y + (W.y - E.y) / (len(E, W) || 1) * r * 0.9 };
    p.disc(hand.x, hand.y, r * 1.15 + 1, C.outline);
    p.disc(hand.x, hand.y, r * 1.15, C.metal);
    p.set(hand.x - r * 0.4, hand.y - r * 0.4, C.metalLight);
  }

  // Head: bald, silver, the six monk's dots, round ears, glowing eyes.
  const head = J.head ?? { x: sh.x, y: sh.y - T * 0.5 };
  tube(p, sh, head, r * 0.7, C.metalDark);
  for (const sx of [-1, 1]) {
    p.disc(head.x + sx * R * 0.95, head.y + R * 0.1, R * 0.22 + 1, C.outline);
    p.disc(head.x + sx * R * 0.95, head.y + R * 0.1, R * 0.22, C.metal);
  }
  p.disc(head.x, head.y, R + 1, C.outline);
  p.disc(head.x, head.y, R, C.metal);
  p.disc(head.x - R * 0.35, head.y - R * 0.45, R * 0.3, C.metalLight);
  for (const [dx, dy] of [[-0.3, -0.62], [0, -0.68], [0.3, -0.62], [-0.15, -0.48], [0.15, -0.48]]) p.set(head.x + dx * R, head.y + dy * R, C.gold);
  const blink = (t % 4) < 0.15;
  for (const sx of [-1, 1]) {
    const ex = head.x + sx * R * 0.35, ey = head.y + R * 0.08;
    if (mood === 'happy') {
      p.line(ex - R * 0.16, ey + R * 0.06, ex, ey - R * 0.1, C.eye);
      p.line(ex, ey - R * 0.1, ex + R * 0.16, ey + R * 0.06, C.eye);
    } else if (blink) {
      p.hline(ex - R * 0.14, ex + R * 0.14, ey, C.eye);
    } else {
      p.disc(ex, ey, R * 0.19, C.eyeGlow);
      p.disc(ex, ey, R * 0.11, C.eye);
    }
    p.disc(head.x + sx * R * 0.58, head.y + R * 0.38, R * 0.1, C.cheek);
  }
  for (let i = -2; i <= 2; i++) p.set(head.x + i * R * 0.07, head.y + R * 0.45 - Math.abs(i) * R * 0.04, C.outline);

  // Big prayer beads (mala) hanging round the neck, drawn last so they sit on the robe.
  const neckL = { x: sh.x - ux * R * 0.55, y: sh.y - uy * R * 0.55 + r }, neckR = { x: sh.x + ux * R * 0.55, y: sh.y + uy * R * 0.55 + r };
  const low = { x: sh.x + down.x * T * 0.5, y: sh.y + down.y * T * 0.5 };
  const beads = Math.max(7, Math.round(T / 5));
  for (let i = 0; i <= beads; i++) {
    const u = i / beads, a = u < 0.5 ? neckL : low, b = u < 0.5 ? low : neckR, k = u < 0.5 ? u * 2 : (u - 0.5) * 2;
    const sag = Math.sin(u * Math.PI) * r * 0.6;
    const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k + sag * 0.2;
    const big = i === Math.round(beads / 2);
    p.disc(x, y, Math.max(1, r * (big ? 0.6 : 0.32)) + 0.5, C.outline);
    p.disc(x, y, Math.max(1, r * (big ? 0.6 : 0.32)), big ? C.gold : C.bead);
    if (!big && r >= 2) p.set(x - r * 0.15, y - r * 0.15, C.beadLight);
  }
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

// Pose landmarks (normalised) → robot points in art pixels, through the auto-framing view.
function toJoints(lm, view, mirrored) {
  const at = i => ({ x: (view.tx + view.s * (mirrored ? 1 - lm[i].x : lm[i].x) * view.vw) / ART, y: (view.ty + view.s * lm[i].y * view.vh) / ART });
  const ears = mid(at(7), at(8)), nose = at(0);
  return {
    ls: at(11), rs: at(12), le: at(13), re: at(14), lw: at(15), rw: at(16),
    lh: at(23), rh: at(24), lk: at(25), rk: at(26), la: at(27), ra: at(28), lt: at(31), rt: at(32),
    head: { x: (ears.x + nose.x) / 2, y: (ears.y + nose.y) / 2 - len(at(11), at(12)) * 0.08 },
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

    const p = new Pix(W, H);
    renderTemple(p, { owned: this.state.temple.owned, theme: this.state.temple.theme, t: now });

    // Her pose, or (when nobody's there) the robot waving on its own.
    const frame = this.source.next();
    let lm = frame?.landmarks, fw = frame?.width, fh = frame?.height, mirrored = this.source.mirrored;
    const present = !!lm && [11, 12, 23, 24].every(i => (lm[i]?.visibility ?? 1) > 0.5);
    if (present) { this.seenFor += dt; this.lostFor = 0; } else { this.lostFor += dt; this.seenFor = 0; }
    if (!present) {
      const wave = standing('front');
      wave.arms.R = [-150 + Math.sin(now * 5) * 25, -175 + Math.sin(now * 5) * 15];
      lm = syntheticLandmarks(wave, { width: 720, height: 1280 });
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

    drawRobot(p, toJoints(lm, view, mirrored), now, this.mood);

    // Particles
    this.particles = this.particles.filter(q => (q.life -= dt) > 0);
    for (const q of this.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.kind === 'feather' ? 8 : 40) * dt;
      p.set(q.x, q.y, q.c);
      if (q.life > 0.6) { p.set(q.x + 1, q.y, q.c); p.set(q.x, q.y + 1, q.c); }
    }

    const ctx = this.canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    new Uint32Array(img.data.buffer).set(p.data);
    ctx.putImageData(img, 0, 0);
  }
}
