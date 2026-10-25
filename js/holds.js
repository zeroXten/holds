// The holds. Each has four levels (a position and a target time), a stick figure
// per level, and the criteria the camera uses to judge form.
//
// Criteria: value(body, side) → number, judged against min and/or max with a
// `soft` margin over which the score falls from 1 to 0. For one-sided holds
// `side.main` is the working leg and `side.other` the second leg.

import { kneeDrop, lean, dist, mid } from './scoring.js';
import { legReaching } from './figure.js';

const HIPS_SHOULDERS = [11, 12, 23, 24];
export const LEVEL_MULT = [1, 1.5, 2.2, 3];

const upright = (max, cue = 'Chest up, back straight', soft = 15) => ({
  id: 'upright', label: 'Upright back', cue, value: b => b.torsoLean, max, soft, joints: HIPS_SHOULDERS,
});

const armsAtShoulders = cue => [
  {
    id: 'armHeight', label: 'Arms at shoulder height', cue,
    value: b => Math.max(Math.abs(b.arms.L.c.y - b.ls.y), Math.abs(b.arms.R.c.y - b.rs.y)) / b.torsoLen,
    max: 0.22, soft: 0.3, joints: [13, 14, 15, 16],
  },
  {
    id: 'armStraight', label: 'Straight arms', cue: 'Straighten your arms',
    value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 150, soft: 35, joints: [13, 14],
  },
];

// Signed distance of the hips from the straight line shoulders→`end`, as a
// fraction of that line's length. Positive = hips sagging below the line.
const hipSag = (b, end) => {
  const dx = end.x - b.sh.x, dy = end.y - b.sh.y, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  return ((b.hip.x - b.sh.x) * nx + (b.hip.y - b.sh.y) * ny) / len;
};
// Angle of the line a→b above or below horizontal, in degrees.
const tilt = (a, b) => Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180 / Math.PI;
const kneesMid = b => mid(b.legs.L.b, b.legs.R.b);
const anklesMid = b => mid(b.la, b.ra);
const DEG = Math.PI / 180;

const chambered = { L: [25, -10], R: [-25, 10] };
const by = (level, values) => values[level - 1];
const lerp4 = (level, a, b) => a + (b - a) * (level - 1) / 3;

export const HOLDS = [
  {
    id: 'horse', name: 'Horse Stance', native: 'Mǎ Bù', view: 'front', sides: false, camera: true,
    about: 'The foundation stance. Builds leg strength, a stable root and patience.',
    levels: [
      { name: 'High horse', target: 30, desc: 'Feet about twice shoulder width, toes forward, fists at your hips. Sink until your thighs slope about 45° down from level.' },
      { name: 'Mid horse', target: 45, desc: 'Sink lower: thighs about 30° from level. Knees pushed out over your toes.' },
      { name: 'Low horse', target: 60, desc: 'Thighs within about 15° of level. Back upright, chest open.' },
      { name: 'Full horse', target: 90, desc: 'Thighs level with the floor. Arms straight out to the sides at shoulder height.' },
    ],
    criteria: level => [
      {
        id: 'depth', label: 'Depth', cue: 'Sink lower', weight: 2, joints: [23, 24, 25, 26],
        value: b => Math.max(kneeDrop(b.legs.L), kneeDrop(b.legs.R)), max: by(level, [0.7, 0.5, 0.3, 0.15]), soft: 0.3,
      },
      {
        id: 'even', label: 'Even weight', cue: 'Even out your weight', joints: [23, 24, 25, 26],
        value: b => Math.abs(kneeDrop(b.legs.L) - kneeDrop(b.legs.R)), max: 0.18, soft: 0.25,
      },
      upright(12),
      {
        id: 'width', label: 'Wide stance', cue: 'Widen your stance', joints: [27, 28],
        value: b => dist(b.la, b.ra) / b.shoulderW, min: 1.8, soft: 0.7,
      },
      {
        id: 'knees', label: 'Knees out', cue: 'Push your knees out', joints: [25, 26],
        value: b => Math.abs(b.legs.L.b.x - b.legs.R.b.x) / (Math.abs(b.la.x - b.ra.x) || 1), min: 0.8, soft: 0.25,
      },
      ...(level === 4 ? armsAtShoulders({ low: 'Raise your arms to shoulder height', high: 'Lower your arms to shoulder height' }) : []),
    ],
    figure: level => {
      const thigh = lerp4(level, 50, 92), shin = lerp4(level, 8, 4);
      return {
        view: 'front', torso: 180,
        legs: { L: [thigh, shin], R: [-thigh, -shin] },
        arms: level === 4 ? { L: [90, 90], R: [-90, -90] } : chambered,
      };
    },
  },

  {
    id: 'bow', name: 'Bow Stance', native: 'Gōng Bù', view: 'side', sides: true, camera: true,
    about: 'A long forward stance: front leg bent like a bow, back leg straight like the arrow.',
    levels: [
      { name: 'Short bow', target: 30, desc: 'Long step forward. Bend the front knee, back leg straight, both heels down. Then switch legs.' },
      { name: 'Bow', target: 45, desc: 'Lower: front knee over the ankle, back leg locked straight.' },
      { name: 'Deep bow', target: 60, desc: 'Front thigh nearly level. Hips square, back upright.' },
      { name: 'Pushing bow', target: 90, desc: 'Front thigh level. Arms straight in front at shoulder height, palms pushing.' },
    ],
    criteria: level => [
      {
        id: 'front', label: 'Front knee bend', cue: 'Bend your front knee more', weight: 2,
        joints: s => s.main.idx, value: (b, s) => s.main.angle, max: by(level, [135, 120, 105, 95]), soft: 25,
      },
      {
        id: 'back', label: 'Straight back leg', cue: 'Straighten your back leg',
        joints: s => s.other.idx, value: (b, s) => s.other.angle, min: 160, soft: 25,
      },
      {
        id: 'shin', label: 'Knee over ankle', cue: 'Keep your front knee over the ankle',
        joints: s => s.main.idx.slice(1), value: (b, s) => lean(s.main.b, s.main.c), max: 15, soft: 15,
      },
      upright(15),
      {
        id: 'stride', label: 'Long stance', cue: 'Lengthen your stance', joints: [27, 28],
        value: (b, s) => Math.abs(s.main.c.x - s.other.c.x) / s.other.len, min: 0.75, soft: 0.35,
      },
      ...(level === 4 ? armsAtShoulders({ low: 'Push your palms forward at shoulder height', high: 'Lower your arms to shoulder height' }) : []),
    ],
    figure: level => {
      const thigh = by(level, [50, 65, 80, 90]);
      const h = 22 * Math.cos(thigh * Math.PI / 180) + 22;
      const back = -Math.acos(h / 44) * 180 / Math.PI;
      return {
        view: 'side', torso: 180,
        legs: { L: [thigh, 0], R: [back, back] },
        arms: level === 4 ? { L: [90, 90], R: [88, 88] } : { L: [-25, 80], R: [-22, 82] },
      };
    },
  },

  {
    id: 'cat', name: 'Empty Stance', native: 'Xū Bù', view: 'side', sides: true, camera: true,
    about: 'Also called cat stance. Nearly all your weight sits on the back leg; the front foot rests lightly.',
    levels: [
      { name: 'High cat', target: 30, desc: 'Weight on the back leg, knee bent. Front foot forward, just the toes touching. Then switch legs.' },
      { name: 'Cat', target: 45, desc: 'Sit lower on the back leg. Front foot light enough to lift at any moment.' },
      { name: 'Low cat', target: 60, desc: 'Back thigh sinking towards level. Hips over the back heel.' },
      { name: 'Deep cat', target: 75, desc: 'As low as you can while staying upright, front leg long and light.' },
    ],
    criteria: level => [
      {
        id: 'sit', label: 'Back knee bend', cue: 'Sit lower on your back leg', weight: 2,
        joints: s => s.main.idx, value: (b, s) => s.main.angle, max: by(level, [150, 135, 120, 110]), soft: 20,
      },
      {
        id: 'weight', label: 'Weight back', cue: 'Shift your weight onto the back leg', joints: s => [23, 24, s.main.idx[2]],
        value: (b, s) => Math.abs(b.hip.x - s.main.c.x) / s.main.len, max: 0.2, soft: 0.2,
      },
      {
        id: 'reach', label: 'Front foot out', cue: 'Reach your front foot further out', joints: [27, 28],
        value: (b, s) => Math.abs(s.other.c.x - s.main.c.x) / s.main.len, min: by(level, [0.2, 0.25, 0.3, 0.35]), soft: 0.2,
      },
      {
        id: 'long', label: 'Long front leg', cue: 'Keep the front leg long', joints: s => s.other.idx,
        value: (b, s) => s.other.angle, min: 130, soft: 30,
      },
      upright(15),
    ],
    figure: level => {
      const knee = by(level, [145, 130, 115, 105]);
      const t = (180 - knee) / 2;
      const h = 44 * Math.cos(t * Math.PI / 180);
      return {
        view: 'side', torso: 180,
        legs: { R: [t, -t], L: legReaching(h, by(level, [10, 20, 30, 40])) },
        arms: { L: [60, 120], R: [35, 150] },
      };
    },
  },

  {
    id: 'crane', name: 'Crane Stance', native: 'Dú Lì Bù', view: 'side', sides: true, camera: true,
    about: 'Standing on one leg with the other knee raised: balance, focus and hip strength.',
    levels: [
      { name: 'Knee lift', target: 30, desc: 'Stand on one leg, raise the other knee towards hip height. Then switch legs.' },
      { name: 'Crane', target: 45, desc: 'Raised thigh close to level, toes pointing down, standing leg straight.' },
      { name: 'High crane', target: 60, desc: 'Raised thigh level or higher. Hands together at the chest.' },
      { name: 'Golden rooster', target: 90, desc: 'Knee above the hip and one hand raised high overhead.' },
    ],
    criteria: level => [
      {
        id: 'lift', label: 'Knee height', cue: 'Lift your knee higher', weight: 2, joints: s => s.main.idx.slice(0, 2),
        value: (b, s) => (s.main.b.y - s.main.a.y) / s.other.lowerLen, max: by(level, [0.6, 0.4, 0.15, 0.05]), soft: 0.3,
      },
      {
        id: 'stand', label: 'Straight standing leg', cue: 'Straighten your standing leg', joints: s => s.other.idx,
        value: (b, s) => s.other.angle, min: 160, soft: 20,
      },
      upright(12, 'Stand tall'),
      ...(level === 4 ? [{
        id: 'reach', label: 'Hand overhead', cue: 'Raise one hand high overhead', joints: [15, 16],
        value: b => (b.nose.y - Math.min(b.arms.L.c.y, b.arms.R.c.y)) / b.torsoLen, min: 0.1, soft: 0.4,
      }] : []),
    ],
    figure: level => {
      const thigh = lerp4(level, 58, 98);
      return {
        view: 'side', torso: 180,
        legs: { L: [thigh, thigh - 95], R: [0, 0] },
        arms: level === 4 ? { L: [40, 150], R: [180, 180] } : level === 3 ? { L: [40, 150], R: [38, 152] } : { L: [6, 3], R: [-6, -3] },
      };
    },
  },

  {
    id: 'drop', name: 'Drop Stance', native: 'Pū Bù', view: 'front', sides: true, camera: true,
    about: 'One leg folded deep, the other stretched out along the floor. Strength and flexibility together.',
    levels: [
      { name: 'Side lunge', target: 20, desc: 'Wide stance, sink onto one bent leg, other leg straight out to the side. Then switch legs.' },
      { name: 'Drop', target: 30, desc: 'Sink lower, both feet flat, extended leg straight.' },
      { name: 'Low drop', target: 45, desc: 'Hips close to the heel of the bent leg. Chest lifted.' },
      { name: 'Full drop', target: 60, desc: 'Fully folded, hips just above the floor, extended leg straight and low.' },
    ],
    criteria: level => [
      {
        id: 'low', label: 'Hip height', cue: 'Sink lower', weight: 2, joints: s => [23, 24, s.main.idx[1]],
        value: (b, s) => (Math.max(b.la.y, b.ra.y) - b.hip.y) / s.other.len, max: by(level, [0.62, 0.48, 0.35, 0.22]), soft: 0.2,
      },
      {
        id: 'straight', label: 'Straight leg', cue: 'Straighten the extended leg', joints: s => s.other.idx,
        value: (b, s) => s.other.angle, min: 160, soft: 25,
      },
      {
        id: 'wide', label: 'Wide feet', cue: 'Slide your foot out wider', joints: [27, 28],
        value: (b, s) => Math.abs(b.la.x - b.ra.x) / s.other.len, min: 1.0, soft: 0.4,
      },
      upright(35, 'Lift your chest', 20),
    ],
    figure: level => {
      const thigh = lerp4(level, -80, -100), shin = lerp4(level, 15, 60);
      const h = 22 * Math.cos(thigh * Math.PI / 180) + 22 * Math.cos(shin * Math.PI / 180);
      const straight = Math.acos(h / 44) * 180 / Math.PI;
      return {
        view: 'front', torso: lerp4(level, 180, 172),
        legs: { R: [thigh, shin], L: [straight, straight] },
        arms: { L: [70, 75], R: [-25, -40] },
      };
    },
  },

  {
    id: 'post', name: 'Standing Post', native: 'Zhàn Zhuāng', view: 'front', sides: false, camera: true,
    about: '"Holding the ball". A quiet standing meditation that slowly builds deep endurance in the legs and shoulders.',
    levels: [
      { name: 'Wuji', target: 60, desc: 'Feet shoulder width, knees softly bent. Hands rounded in front of your belly.' },
      { name: 'Holding the ball', target: 120, desc: 'Raise the rounded arms to chest height, as if hugging a large ball. Elbows out.' },
      { name: 'Long post', target: 180, desc: 'Same posture, longer. Sink a little lower; relax the shoulders.' },
      { name: 'Deep post', target: 300, desc: 'Five minutes. Stay still, breathe slowly, keep the arms up.' },
    ],
    criteria: level => [
      {
        id: 'hands', label: 'Hand height', weight: 1.5, joints: [15, 16],
        cue: { low: 'Raise your hands', high: 'Lower your hands a little' },
        value: b => ((b.arms.L.c.y + b.arms.R.c.y) / 2 - b.sh.y) / b.torsoLen,
        ...(level === 1 ? { min: 0.35, max: 0.8 } : { min: -0.1, max: 0.45 }), soft: 0.2,
      },
      {
        id: 'round', label: 'Rounded arms', cue: 'Elbows out, hands in front of you', joints: [13, 14, 15, 16],
        value: b => Math.abs(b.arms.L.c.x - b.arms.R.c.x) / (Math.abs(b.arms.L.b.x - b.arms.R.b.x) || 1), max: 0.85, soft: 0.2,
      },
      {
        id: 'feet', label: 'Feet shoulder width', joints: [27, 28],
        cue: { low: 'Feet a little wider', high: 'Bring your feet in to shoulder width' },
        value: b => dist(b.la, b.ra) / b.shoulderW, min: 0.7, max: 1.8, soft: 0.4,
      },
      upright(8, 'Stand tall, crown up', 12),
      {
        id: 'level', label: 'Level shoulders', cue: 'Relax and level your shoulders', joints: [11, 12],
        value: b => Math.abs(b.ls.y - b.rs.y) / b.shoulderW, max: 0.1, soft: 0.15,
      },
    ],
    figure: level => ({
      view: 'front', torso: 180,
      legs: { L: [6, -2], R: [-6, 2] },
      arms: level === 1 ? { L: [25, -80], R: [-25, 80] } : { L: [45, -95], R: [-45, 95] },
    }),
  },

  {
    id: 'bridge', name: 'Iron Bridge', native: 'Tiě Bǎn Qiáo', view: 'side', sides: false, camera: true,
    hint: 'Turn the phone sideways (landscape), low to the ground, and lie side-on to it',
    about: 'The body held rigid as an iron plank. Built up from a floor bridge to the full bridge between two chairs.',
    levels: [
      { name: 'Shoulder bridge', target: 45, desc: 'On your back, knees bent, feet flat. Drive your hips up until shoulders, hips and knees make one straight line.' },
      { name: 'Reverse plank', target: 30, desc: 'Hands under your shoulders, fingers towards your feet, legs straight. Lift your hips into a straight board from shoulders to heels.' },
      { name: 'Bench bridge', target: 45, desc: 'Upper back on a sturdy bench or chair, heels on the floor, legs straight, arms folded. Hold shoulders, hips and heels in one line.' },
      { name: 'Iron bridge', target: 45, desc: 'Upper back on one chair, heels on another, nothing underneath, body level and rigid. Use solid chairs and have a spotter the first few times.' },
    ],
    criteria: level => {
      const end = level === 1 ? kneesMid : anklesMid;
      return [
        {
          id: 'line', label: 'Straight body', weight: 2, joints: [11, 12, 23, 24, 25, 26, 27, 28],
          cue: { high: 'Lift your hips', low: 'Lower your hips into a straight line' },
          value: b => hipSag(b, end(b)), min: -0.06, max: 0.04, soft: 0.06,
        },
        {
          id: 'lying', label: level === 4 ? 'Level body' : 'Lying back', weight: 2, joints: [11, 12, 27, 28],
          cue: level === 4 ? 'Keep your body level' : 'Lie back into the bridge',
          value: b => tilt(b.sh, end(b)), max: by(level, [45, 40, 35, 12]), soft: 20,
        },
        ...(level > 1 ? [{
          id: 'knees', label: 'Straight legs', cue: 'Lock your knees', joints: [25, 26],
          value: b => Math.min(b.legs.L.angle, b.legs.R.angle), min: 165, soft: 20,
        }] : []),
        ...(level === 2 ? [{
          id: 'arms', label: 'Straight arms', cue: 'Straighten your arms', joints: [13, 14],
          value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 155, soft: 30,
        }] : []),
      ];
    },
    figure: level => {
      // Lying face up, head to the left. Legs: 22+22, torso: 30, arm: 27.
      if (level === 1) {
        const shin = 15;
        const a = Math.asin((22 * Math.cos(shin * DEG) - 6) / 52) / DEG;  // shoulders resting on the floor
        return { view: 'side', compact: true, torso: -(90 - a), head: -90, legs: { L: [90 + a, shin], R: [90 + a, shin] }, arms: { L: [85, 90], R: [85, 90] } };
      }
      const rise = by(level, [0, 27, 25, 0]);  // shoulder height above the heels
      const a = Math.asin(rise / 74) / DEG;
      const folded = { L: [135, 45], R: [133, 47] };
      return {
        view: 'side', compact: true, torso: -(90 + a), legs: { L: [90 - a, 90 - a], R: [90 - a, 90 - a] },
        arms: level === 2 ? { L: [0, 0], R: [2, 2] } : folded,
        ...(level === 3 ? { props: [{ under: 'neck', w: 16, gap: 3 }] } : {}),
        ...(level === 4 ? { lift: 24, props: [{ under: 'neck', w: 16, gap: 3 }, { under: 'lAnkle', w: 12, gap: 2 }] } : {}),
      };
    },
  },

  {
    id: 'swallow', name: 'Swallow Balance', native: 'Yàn Shì Píng Héng', view: 'side', sides: true, camera: true,
    about: 'Balance on one leg with the body tipped forward and the other leg reaching back, like a swallow in flight.',
    levels: [
      { name: 'Leaning balance', target: 20, desc: 'Stand on one leg and tip forward, lifting the other leg behind you. Torso and back leg about 45° from upright. Then switch legs.' },
      { name: 'Half swallow', target: 30, desc: 'Tip further: torso and back leg about 30° from level. Both legs straight.' },
      { name: 'Swallow', target: 45, desc: 'Torso and back leg level with the floor, arms swept back like wings.' },
      { name: 'Flying swallow', target: 60, desc: 'Fully level, back leg as high as your head, arms reaching forward in line with your body.' },
    ],
    criteria: level => [
      {
        id: 'tip', label: 'Torso forward', cue: 'Tip your chest further forward', weight: 1.5, joints: HIPS_SHOULDERS,
        value: b => b.torsoLean, min: by(level, [40, 60, 75, 80]), soft: 20,
      },
      {
        id: 'leg', label: 'Back leg height', cue: 'Lift your back leg higher', weight: 1.5, joints: s => s.main.idx,
        value: (b, s) => lean(s.main.a, s.main.c), min: by(level, [40, 60, 75, 85]), soft: 20,
      },
      {
        id: 'raised', label: 'Straight back leg', cue: 'Straighten your back leg', joints: s => s.main.idx,
        value: (b, s) => s.main.angle, min: 155, soft: 25,
      },
      {
        id: 'stand', label: 'Straight standing leg', cue: 'Straighten your standing leg', joints: s => s.other.idx,
        value: (b, s) => s.other.angle, min: 160, soft: 20,
      },
      ...(level === 4 ? [{
        id: 'reach', label: 'Arms forward', cue: 'Reach your arms out in front', joints: [13, 14, 15, 16],
        value: b => (dist(b.hip, mid(b.arms.L.c, b.arms.R.c)) - dist(b.hip, b.sh)) / b.torsoLen, min: 0.6, soft: 0.4,
      }] : []),
    ],
    figure: level => {
      const tip = by(level, [45, 65, 80, 88]), leg = by(level, [45, 65, 80, 92]);
      const arms = level === 4 ? [180 - tip, 180 - tip] : [-(tip + 30), -(tip + 30)];
      return {
        view: 'side', torso: 180 - tip,
        legs: { L: [-leg, -leg], R: [0, 0] },
        arms: { L: arms, R: [arms[0] + 3, arms[1] + 3] },
      };
    },
  },

  {
    id: 'kick', name: 'Kick Hold', native: 'Dēng Tuǐ', view: 'side', sides: true, camera: true,
    about: 'Hold a front heel kick out in the air: hip strength, hamstring flexibility and balance.',
    levels: [
      { name: 'Low kick', target: 20, desc: 'Kick one leg forward and hold it there, straight, heel pushing out, foot about shin height. Fists up in guard. Then switch legs.' },
      { name: 'Knee kick', target: 25, desc: 'Foot at about knee height or higher. Both legs straight.' },
      { name: 'Waist kick', target: 30, desc: 'Kicking leg level with the floor, at waist height. Stay tall.' },
      { name: 'High kick', target: 30, desc: 'Foot above waist height, towards your chest. Both legs locked straight.' },
    ],
    criteria: level => [
      {
        id: 'height', label: 'Kick height', cue: 'Lift your kick higher', weight: 2, joints: s => s.main.idx,
        value: (b, s) => lean(s.main.a, s.main.c), min: by(level, [35, 60, 85, 110]), soft: 20,
      },
      {
        id: 'kickStraight', label: 'Straight kicking leg', cue: 'Straighten your kicking leg', weight: 1.5, joints: s => s.main.idx,
        value: (b, s) => s.main.angle, min: 160, soft: 25,
      },
      {
        id: 'stand', label: 'Straight standing leg', cue: 'Straighten your standing leg', joints: s => s.other.idx,
        value: (b, s) => s.other.angle, min: 160, soft: 25,
      },
      upright(by(level, [15, 20, 25, 30]), 'Stand tall, don’t lean back'),
    ],
    figure: level => {
      const kick = by(level, [40, 65, 90, 115]);
      return {
        view: 'side', torso: 180 + by(level, [3, 6, 10, 14]),
        legs: { L: [kick, kick], R: [0, 0] },
        arms: { L: [40, 150], R: [35, 155] },
      };
    },
  },

  {
    id: 'plank', name: 'Fist Plank', native: 'Quán Chēng', view: 'side', sides: false, camera: true,
    hint: 'Turn the phone sideways (landscape), low to the ground, side-on to you',
    about: 'The top of a knuckle push-up, held. Builds the core, wrists and shoulders that strikes come from.',
    levels: [
      { name: 'Kneeling plank', target: 30, desc: 'On your fists and knees, fists under your shoulders. Hold shoulders, hips and knees in one straight line.' },
      { name: 'Fist plank', target: 45, desc: 'On fists and toes, arms straight. One straight line from shoulders to heels.' },
      { name: 'One-leg plank', target: 45, desc: 'Fist plank with one foot lifted off the floor. Switch feet halfway.' },
      { name: 'Low plank', target: 30, desc: 'Lower halfway into a push-up, elbows bent to 90° and tucked in, body straight. Hold.' },
    ],
    criteria: level => {
      // Measure to the supporting foot, so a lifted foot (level 3) doesn't bend the line.
      const end = level === 1 ? kneesMid : b => (b.la.y > b.ra.y ? b.la : b.ra);
      return [
        {
          id: 'line', label: 'Straight body', weight: 2, joints: [11, 12, 23, 24, 25, 26, 27, 28],
          cue: { high: 'Tighten your stomach, lift your hips', low: 'Lower your hips into a straight line' },
          value: b => hipSag(b, end(b)), min: -0.06, max: 0.04, soft: 0.06,
        },
        {
          id: 'down', label: 'In the plank', cue: 'Get down into the plank', weight: 2, joints: [11, 12, 27, 28],
          value: b => tilt(b.sh, end(b)), max: by(level, [42, 32, 32, 22]), soft: 20,
        },
        level === 4 ? {
          id: 'arms', label: 'Elbows at 90°', joints: [13, 14],
          cue: { low: 'Push up a little', high: 'Lower until your elbows are at 90°' },
          value: b => (b.arms.L.angle + b.arms.R.angle) / 2, min: 70, max: 115, soft: 25,
        } : {
          id: 'arms', label: 'Straight arms', cue: 'Straighten your arms', joints: [13, 14],
          value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 155, soft: 30,
        },
        ...(level > 1 ? [{
          id: 'knees', label: 'Straight legs', cue: 'Lock your knees', joints: [25, 26],
          value: b => Math.min(b.legs.L.angle, b.legs.R.angle), min: 160, soft: 20,
        }] : []),
        ...(level === 3 ? [{
          id: 'foot', label: 'Foot lifted', cue: 'Lift one foot off the floor', joints: [27, 28],
          value: b => Math.abs(b.la.y - b.ra.y) / b.torsoLen, min: 0.2, soft: 0.15,
        }] : []),
      ];
    },
    figure: level => {
      // Face down, head to the left. Shoulder height is set by the arms.
      if (level === 1) {
        const a = Math.asin(27 / 52) / DEG;
        return { view: 'side', compact: true, torso: -(90 + a), legs: { L: [90 - a, 90], R: [90 - a, 90] }, arms: { L: [0, 0], R: [2, 2] } };
      }
      const arms = level === 4 ? { L: [35, -55], R: [37, -53] } : { L: [0, 0], R: [2, 2] };
      const rise = level === 4 ? 14 * Math.cos(35 * DEG) + 13 * Math.cos(55 * DEG) : 27;
      const a = Math.asin(rise / 74) / DEG;
      const leg = 90 - a;
      return {
        view: 'side', compact: true, torso: -(90 + a),
        legs: { L: [leg, leg], R: level === 3 ? [leg + 22, leg + 22] : [leg, leg] },
        arms,
      };
    },
  },

  {
    id: 'rest', name: 'Rest Stance', native: 'Xiē Bù', view: 'front', sides: true, camera: false,
    about: 'A low, twisted, cross-legged stance. The camera can’t judge it reliably, so this one is on your honour.',
    levels: [
      { name: 'High rest', target: 20, desc: 'Cross one leg behind the other and sink, rear knee behind the front calf. Then switch sides.' },
      { name: 'Rest', target: 30, desc: 'Sink lower, front foot flat and turned out, rear heel up.' },
      { name: 'Low rest', target: 45, desc: 'Sit almost onto the rear calf, torso upright and twisted.' },
      { name: 'Deep rest', target: 60, desc: 'Fully seated on the rear leg, steady and upright.' },
    ],
    criteria: () => [],
    figure: level => {
      const k = lerp4(level, 0, 1);
      return {
        view: 'front', torso: 180,
        legs: { L: [-30 - 40 * k, -5 - 5 * k], R: [35 + 25 * k, 60 + 40 * k] },
        arms: chambered,
      };
    },
  },
];

export const holdById = id => HOLDS.find(h => h.id === id);

// Landmarks that must be visible for the camera to judge a hold.
export const REQUIRED = [11, 12, 23, 24, 25, 26, 27, 28];
export const requiredFor = (hold, level) => {
  const set = new Set(REQUIRED);
  for (const c of hold.criteria(level)) if (Array.isArray(c.joints)) c.joints.forEach(j => set.add(j));
  return [...set];
};
