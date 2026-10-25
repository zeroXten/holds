// The holds. Each has four levels (a position and a target time), a stick figure
// per level, and the criteria the camera uses to judge form.
//
// `areas` says what a hold works, as weights that add up to 1 (used to spot when one
// part of you has done a lot lately). `style` is 'hard' (external strength) or 'soft'
// (internal: qigong-style standing work).
// `video` is a YouTube search for demonstrations of the stance. `landscape` marks wide
// or lying-down holds that fit the camera far better with the phone turned sideways.
//
// Criteria: value(body, side) → number, judged against min and/or max with a
// `soft` margin over which the score falls from 1 to 0. For one-sided holds
// `side.main` is the working leg and `side.other` the second leg.

import { kneeDrop, lean, dist, mid } from './scoring.js';
import { legReaching } from './figure.js';

const HIPS_SHOULDERS = [11, 12, 23, 24];

const upright = (max, cue = 'Chest up, back straight', soft = 15) => ({
  id: 'upright', label: 'Upright back', cue, value: b => b.torsoLean, max, soft, joints: HIPS_SHOULDERS,
});

const armsAtShoulders = cue => [
  {
    id: 'armHeight', label: 'Arms at shoulder height', cue,
    value: b => Math.max(Math.abs(b.arms.L.c.y - b.ls.y), Math.abs(b.arms.R.c.y - b.rs.y)) / b.torsoLen,
    max: 0.22, soft: 0.3, joints: [11, 12, 13, 14, 15, 16],
  },
  {
    id: 'armStraight', label: 'Straight arms', cue: 'Straighten your arms',
    value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 150, soft: 35, joints: [11, 12, 13, 14, 15, 16],
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

// How far the hand furthest from the middle of the body is from it, in shoulder widths.
// "Hands together in front of you" for the camera: about 0.1–0.35 with fingers linked
// or palms pressed, about 0.65 or more with the arms hanging at your sides.
const handsOffCentre = b => Math.max(Math.abs(b.arms.L.c.x - b.sh.x), Math.abs(b.arms.R.c.x - b.sh.x)) / b.shoulderW;

const chambered = { L: [25, -10], R: [-25, 10] };
const by = (level, values) => values[level - 1];
const lerp4 = (level, a, b) => a + (b - a) * (level - 1) / 3;

export const HOLDS = [
  {
    id: 'horse', name: 'Horse Stance', native: 'Mǎ Bù', view: 'front', sides: false, camera: true,
    areas: { legs: 1 }, style: 'hard',
    video: 'ma bu horse stance kung fu tutorial',
    about: 'The foundation stance. Builds leg strength, a stable root and patience.',
    levels: [
      { name: 'High horse', target: 30, desc: 'Feet about twice shoulder width, toes forward or turned out slightly, knees pointing the same way as your toes. Fists at your hips. Sink until your thighs slope about 45° down from level.' },
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
    areas: { legs: 1 }, style: 'hard',
    hint: 'Turn the phone sideways (landscape) and stand side-on to it',
    landscape: true,
    video: 'gong bu bow stance kung fu tutorial',
    about: 'A long forward stance: front leg bent like a bow, back leg straight like the arrow.',
    levels: [
      { name: 'Short bow', target: 30, desc: 'Long step forward, front toes pointing ahead, back foot turned out about 45°. Bend the front knee, keep the back leg straight and both heels down. Then switch legs.' },
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
    areas: { legs: 0.7, balance: 0.3 }, style: 'hard',
    video: 'xu bu empty stance cat stance kung fu tutorial',
    about: 'Also called cat stance. Nearly all your weight sits on the back leg; the front foot rests lightly.',
    levels: [
      { name: 'High cat', target: 30, desc: 'Almost all your weight on the back leg: knee bent, foot flat and turned out about 45°. Front foot forward with just the toes resting lightly, knee slightly bent. Hips square. Then switch legs.' },
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
    areas: { balance: 0.6, legs: 0.4 }, style: 'hard',
    video: 'du li bu crane stance kung fu',
    about: 'Standing on one leg with the other knee raised: balance, focus and hip strength.',
    levels: [
      { name: 'Knee lift', target: 30, desc: 'Stand on one leg, knee soft rather than locked, and raise the other knee towards hip height. Then switch legs.' },
      { name: 'Crane', target: 45, desc: 'Raised thigh level with the floor, lower leg tucked in under the knee, toes pointing down. Standing leg straight but not locked.' },
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
    areas: { legs: 0.7, mobility: 0.3 }, style: 'hard',
    hint: 'Turn the phone sideways (landscape) and face it',
    landscape: true,
    video: 'pu bu drop stance kung fu tutorial',
    about: 'One leg folded deep, the other stretched out along the floor. Strength and flexibility together.',
    levels: [
      { name: 'Side lunge', target: 20, desc: 'Very wide stance, feet parallel and flat. Sink onto one bent leg with the other straight out to the side. Fists at your hips. Then switch legs.' },
      { name: 'Drop', target: 30, desc: 'Sink lower. Keep both feet flat and parallel (toes forward), and the extended leg straight.' },
      { name: 'Low drop', target: 45, desc: 'Hips close to the heel of the bent leg. Chest up, looking along the straight leg.' },
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
        arms: chambered,
      };
    },
  },

  {
    id: 'post', name: 'Standing Post', native: 'Zhàn Zhuāng', view: 'front', sides: false, camera: true,
    areas: { legs: 0.4, upper: 0.6 }, style: 'soft',
    video: 'zhan zhuang standing post holding the ball',
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
    id: 'weituo', name: 'Wei Tuo Presents the Pestle', native: 'Wéi Tuó Xiàn Chǔ', view: 'front', sides: false, camera: true,
    areas: { upper: 0.8, balance: 0.2 }, style: 'soft',
    video: 'yi jin jing wei tuo presents the pestle',
    about: 'The first three postures of the Yi Jin Jing, the Shaolin “muscle-tendon changing” classic. Gentle on the legs; the work is in the arms, shoulders and slow breathing.',
    levels: [
      { name: 'Frontways', target: 60, desc: 'Stand tall, feet about a fist apart, knees soft. Palms together (or one hand cupped in the other) in front of your chest. Breathe slowly through the nose.' },
      { name: 'Sideways', target: 45, desc: 'Weight onto the balls of your feet. Arms straight out to the sides at shoulder height, palms up.' },
      { name: 'Upwards', target: 45, desc: 'Arms straight overhead, palms up as if holding up the sky, fingertips about a fist apart. Look up at your hands.' },
      { name: 'Upwards on tiptoe', target: 60, desc: 'Palms up overhead and rise onto your toes, knees straight. Hold steady and keep breathing slowly.' },
    ],
    criteria: level => [
      ...(level === 1 ? [
        {
          id: 'together', label: 'Palms together', cue: 'Bring your palms together', joints: [15, 16],
          value: handsOffCentre, max: 0.35, soft: 0.25,
        },
        {
          id: 'chest', label: 'Hands at chest', joints: [15, 16], cue: { low: 'Raise your hands to your chest', high: 'Lower your hands to your chest' },
          value: b => (mid(b.arms.L.c, b.arms.R.c).y - b.sh.y) / b.torsoLen, min: -0.05, max: 0.55, soft: 0.25,
        },
      ] : level === 2 ? [
        ...armsAtShoulders({ low: 'Raise your arms to shoulder height', high: 'Lower your arms to shoulder height' }),
        {
          id: 'wide', label: 'Arms wide', cue: 'Stretch your arms out wide', joints: [15, 16],
          value: b => dist(b.arms.L.c, b.arms.R.c) / b.shoulderW, min: 3, soft: 1,
        },
      ] : [
        {
          id: 'overhead', label: 'Palms overhead', cue: 'Push your palms up overhead', weight: 1.5, joints: [15, 16],
          value: b => (b.nose.y - Math.max(b.arms.L.c.y, b.arms.R.c.y)) / b.torsoLen, min: 0.35, soft: 0.35,
        },
        {
          id: 'straight', label: 'Straight arms', cue: 'Straighten your elbows', joints: [13, 14],
          value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 145, soft: 35,
        },
      ]),
      upright(8, 'Stand tall', 12),
    ],
    figure: level => ({
      view: 'front', torso: 180, ...(level === 4 ? { lift: 2 } : {}),
      legs: { L: [3, 0], R: [-3, 0] },
      arms: by(level, [{ L: [15, -115], R: [-15, 115] }, { L: [90, 90], R: [-90, -90] }, { L: [178, 188], R: [-178, -188] }, { L: [178, 188], R: [-178, -188] }]),
    }),
  },

  {
    id: 'stars', name: 'Plucking the Stars', native: 'Zhāi Xīng Huàn Dǒu', view: 'front', sides: true, camera: true,
    areas: { upper: 0.6, mobility: 0.4 }, style: 'soft',
    video: 'yi jin jing plucking stars posture',
    about: 'A Yi Jin Jing posture: one hand reaches up above your head, the other rests behind your back. Opens the shoulders and sides gently.',
    levels: [
      { name: 'Reaching up', target: 30, desc: 'Feet hip width, knees soft. Raise one hand above your head, palm facing down towards it. Bend the other arm and rest the back of that hand on your lower back. Then switch sides.' },
      { name: 'Plucking the stars', target: 60, desc: 'Reach the top hand higher, elbow gently rounded, and look up at your palm. Turn your chest slightly towards the arm behind your back.' },
      { name: 'Long reach', target: 90, desc: 'The same, held longer. Breathe slowly and let the shoulders soften.' },
      { name: 'Still as the night', target: 120, desc: 'Two minutes, one per side. Completely still, gaze on the raised palm.' },
    ],
    criteria: level => {
      // Only the raised arm: the hand behind your back is hidden from the camera.
      const top = b => (b.arms.L.c.y < b.arms.R.c.y ? b.arms.L : b.arms.R);
      return [
        {
          id: 'reach', label: 'Hand above head', cue: 'Reach your hand higher above your head', weight: 2, joints: () => [13, 14, 15, 16],
          value: b => (b.nose.y - top(b).c.y) / b.torsoLen, min: level === 1 ? 0.1 : 0.25, soft: 0.3,
        },
        {
          id: 'over', label: 'Hand over your head', cue: 'Bring the raised hand over your head', joints: () => [15, 16],
          value: b => Math.abs(top(b).c.x - b.nose.x) / b.shoulderW, max: 1.1, soft: 0.6,
        },
        {
          id: 'round', label: 'Rounded arm', cue: { low: 'Soften the elbow a little less', high: 'Round the raised arm a little' }, joints: () => [13, 14],
          value: b => top(b).angle, min: 95, max: 172, soft: 25,
        },
        upright(15, 'Stand tall'),
      ];
    },
    figure: () => ({
      view: 'front', torso: 180,
      legs: { L: [4, 0], R: [-4, 0] },
      arms: { L: [160, -130], R: [-20, 70] },
    }),
  },

  {
    id: 'feet', name: 'Hands to Feet', native: 'Liǎng Shǒu Pān Zú', view: 'side', sides: false, camera: true,
    areas: { mobility: 0.7, core: 0.3 }, style: 'soft',
    video: 'ba duan jin two hands hold the feet',
    about: 'From the Ba Duan Jin (Eight Brocades): a slow forward fold, said to strengthen the kidneys and waist. In plain terms, it stretches the back and hamstrings.',
    levels: [
      { name: 'Hands to knees', target: 30, desc: 'Feet hip width. Fold forward from the hips with your legs as straight as is comfortable, hands sliding down to your knees. Let your head hang.' },
      { name: 'Hands to shins', target: 45, desc: 'Fold further, hands down to your shins. Breathe out as you sink.' },
      { name: 'Hands to ankles', target: 60, desc: 'Hands to your ankles, legs straight, back long.' },
      { name: 'Holding the feet', target: 60, desc: 'Hold your toes or put your palms by your feet. Only go as far as feels good.' },
    ],
    criteria: level => [
      {
        id: 'reach', label: 'Reach', cue: 'Fold a little further, reaching down your legs', weight: 2, joints: [15, 16, 25, 26],
        value: b => (mid(b.arms.L.c, b.arms.R.c).y - kneesMid(b).y) / ((b.legs.L.lowerLen + b.legs.R.lowerLen) / 2),
        min: by(level, [-0.25, 0.35, 0.7, 0.95]), soft: 0.3,
      },
      {
        id: 'fold', label: 'Hinged forward', cue: 'Fold forward from your hips', joints: HIPS_SHOULDERS,
        value: b => b.torsoLean, min: by(level, [55, 80, 100, 115]), soft: 20,
      },
      {
        id: 'legs', label: 'Long legs', cue: 'Keep your legs as straight as is comfortable', joints: [25, 26],
        value: b => Math.min(b.legs.L.angle, b.legs.R.angle), min: 155, soft: 25,
      },
    ],
    figure: level => {
      // Side-on, facing right, folded forward from the hips, arms hanging down.
      const fold = by(level, [75, 100, 117, 125]);
      return { view: 'side', torso: 180 - fold, legs: { L: [0, 0], R: [0, 0] }, arms: { L: [0, 0], R: [-2, -2] } };
    },
  },

  {
    id: 'sky', name: 'Holding Up the Sky', native: 'Liǎng Shǒu Tuō Tiān', view: 'front', sides: false, camera: true,
    areas: { upper: 0.5, mobility: 0.5 }, style: 'soft',
    video: 'ba duan jin two hands hold up the heavens',
    about: 'The first of the Ba Duan Jin (Eight Brocades), a slow, flowing movement rather than a still hold. Each cycle: hands at your belly, palms up → lift them up the front → turn the palms over at your chest and push up to the sky → stretch → float your arms down the sides. The camera counts each cycle. It can’t see your fingers: it checks your hands are together at your belly, and together and straight overhead.',
    // A flowing hold: levels set a number of slow cycles, a minimum time per cycle,
    // and how long to pause at the top. See flow.js.
    flow: {
      minCycle: [5, 6, 8, 8],
      dwell: [0.3, 1, 2, 2],
      low: () => [
        {
          id: 'together', label: 'Hands together', cue: 'Bring your hands together in front of your belly', joints: [11, 12, 13, 14, 15, 16],
          value: handsOffCentre, max: 0.4, soft: 0.2,
        },
        {
          id: 'low', label: 'Hands at belly', cue: { low: 'Bring your hands down in front of your belly', high: 'Lift your hands to your belly' }, joints: [11, 12, 13, 14, 15, 16],
          value: b => (mid(b.arms.L.c, b.arms.R.c).y - b.sh.y) / b.torsoLen, min: 0.35, max: 1.05, soft: 0.25,
        },
        upright(10, 'Stand tall', 12),
      ],
      lowFigure: () => ({ view: 'front', torso: 180, legs: { L: [3, 0], R: [-3, 0] }, arms: { L: [20, -75], R: [-20, 75] } }),
    },
    levels: [
      { name: 'Gentle lift', target: 4, desc: 'Feet hip width. Hands together in front of your belly, fingers linked, palms up. Lift them up the front of your body; at your chest, turn the palms over and push them up overhead. Let go and float your arms down the sides back to your belly. At least 5 seconds each cycle.' },
      { name: 'Holding up the sky', target: 6, desc: 'Pause for a moment at the top, arms straight but not locked, stretching up through the palms. At least 6 seconds each.' },
      { name: 'Slow and full', target: 8, desc: 'Pause for two seconds at the top and look up at your hands. Let each cycle take 8 seconds or more.' },
      { name: 'On tiptoe', target: 10, desc: 'As you push up, rise onto your toes; lower your heels as your hands come down. Ten slow cycles.' },
    ],
    // The high position (palms overhead); the low one is in flow.low.
    criteria: () => [
      {
        id: 'overhead', label: 'Palms overhead', cue: 'Push your palms up to the sky', weight: 1.5, joints: [11, 12, 13, 14, 15, 16],
        value: b => (b.nose.y - Math.max(b.arms.L.c.y, b.arms.R.c.y)) / b.torsoLen, min: 0.4, soft: 0.35,
      },
      {
        id: 'straight', label: 'Straight arms', cue: 'Straighten your arms', joints: [11, 12, 13, 14, 15, 16],
        value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 150, soft: 35,
      },
      {
        id: 'together', label: 'Hands together', cue: 'Keep your hands together overhead', joints: [11, 12, 13, 14, 15, 16],
        value: handsOffCentre, max: 0.6, soft: 0.35,
      },
      upright(10, 'Stand tall', 12),
    ],
    figure: level => ({
      view: 'front', torso: 180, ...(level === 4 ? { lift: 2 } : {}),
      legs: { L: [3, 0], R: [-3, 0] }, arms: { L: [172, 196], R: [-172, -196] },
    }),
  },

  {
    id: 'sideplank', name: 'Side Plank', native: 'Cè Píngbǎn Zhīchēng', view: 'front', sides: true, camera: true,
    areas: { core: 0.8, upper: 0.2 }, style: 'hard',
    landscape: true,
    video: 'side plank progression tutorial',
    hint: 'Turn the phone sideways (landscape), low to the ground, with your front facing it',
    about: 'Not strictly Shaolin, but one of the best holds for the sides of the core and a stable spine.',
    levels: [
      { name: 'Knee side plank', target: 40, desc: 'On one forearm, elbow under the shoulder, knees bent. Lift your hips so shoulders, hips and knees make one line. Then switch sides.' },
      { name: 'Side plank', target: 60, desc: 'On your forearm with your legs straight and feet stacked. One straight line from shoulders to feet.' },
      { name: 'Straight-arm side plank', target: 60, desc: 'Up on your hand with the arm locked straight, hand under the shoulder.' },
      { name: 'Star side plank', target: 40, desc: 'Straight-arm side plank with the top leg lifted high and the top arm reaching to the sky.' },
    ],
    criteria: level => {
      const end = level === 1 ? kneesMid : level === 4 ? b => (b.la.y > b.ra.y ? b.la : b.ra) : anklesMid;
      const lowerArm = b => (b.arms.L.c.y > b.arms.R.c.y ? b.arms.L : b.arms.R);
      return [
        {
          id: 'line', label: 'Straight body', weight: 2, joints: [11, 12, 23, 24, 25, 26, 27, 28],
          cue: { high: 'Lift your hips', low: 'Lower your hips into a straight line' },
          value: b => hipSag(b, end(b)), min: -0.06, max: 0.04, soft: 0.06,
        },
        {
          id: 'down', label: 'In the side plank', cue: 'Get down into the side plank', weight: 2, joints: [11, 12, 27, 28],
          value: b => tilt(b.sh, end(b)), max: by(level, [40, 30, 38, 40]), soft: 20,
        },
        ...(level >= 3 ? [{
          id: 'arm', label: 'Straight supporting arm', cue: 'Straighten your supporting arm', joints: [13, 14],
          value: b => lowerArm(b).angle, min: 155, soft: 30,
        }] : []),
        ...(level === 4 ? [
          {
            id: 'leg', label: 'Top leg lifted', cue: 'Lift your top leg higher', joints: [27, 28],
            value: b => Math.abs(b.la.y - b.ra.y) / b.torsoLen, min: 0.9, soft: 0.4,
          },
          {
            id: 'reach', label: 'Top arm up', cue: 'Reach your top arm to the sky', joints: [15, 16],
            value: b => (Math.min(b.ls.y, b.rs.y) - Math.min(b.arms.L.c.y, b.arms.R.c.y)) / b.torsoLen, min: 0.5, soft: 0.4,
          },
        ] : []),
      ];
    },
    figure: level => {
      // Lying on the right side facing the camera, head to the left. Solve the body's
      // tilt so the supporting elbow (or hand) and the knees (or feet) both touch the floor.
      const arm = level >= 3 ? 27 : 14, legToFloor = level === 1 ? 22 : 44;
      let a = 15;
      for (let i = 0; i < 4; i++) a = Math.asin((arm + 3 * Math.cos(a * DEG)) / (30 + legToFloor)) / DEG;
      const body = 90 - a;
      const legs = level === 1 ? [body, 200] : [body, body];
      return {
        view: 'front', compact: true, torso: -(90 + a),
        ...(level === 1 ? { ground: 'rKnee' } : {}),
        legs: { R: legs, L: level === 4 ? [body + 30, body + 30] : legs },
        arms: { R: level >= 3 ? [0, 0] : [0, -90], L: level === 4 ? [180, 180] : [body, body] },
      };
    },
  },

  {
    id: 'birddog', name: 'Bird Dog', native: 'Niǎo Gǒu Shì', view: 'side', sides: true, camera: true,
    areas: { core: 0.7, balance: 0.3 }, style: 'hard',
    landscape: true,
    video: 'bird dog exercise how to',
    hint: 'Turn the phone sideways (landscape), low to the ground, side-on to you',
    about: 'Not strictly Shaolin, but a gentle, highly rated hold for the lower back and a core that resists twisting.',
    levels: [
      { name: 'Leg reach', target: 30, desc: 'On hands and knees, hands under shoulders. Reach one leg straight back, level with your back. Then switch legs.' },
      { name: 'Bird dog', target: 40, desc: 'Reach the opposite arm forward too, so arm, back and leg make one long level line.' },
      { name: 'Long bird dog', target: 60, desc: 'The same, held longer. Keep your hips square and your back flat.' },
      { name: 'Plank bird dog', target: 40, desc: 'From a high plank on hands and toes, lift one leg and the opposite arm level. Supporting leg straight.' },
    ],
    criteria: level => {
      const reachArm = b => (lean(b.arms.L.a, b.arms.L.c) > lean(b.arms.R.a, b.arms.R.c) ? b.arms.L : b.arms.R);
      return [
        {
          id: 'leg', label: 'Leg level', cue: 'Lift your leg level with your back', weight: 1.5, joints: s => s.main.idx,
          value: (b, s) => lean(s.main.a, s.main.c), min: by(level, [70, 75, 80, 80]), soft: 20,
        },
        {
          id: 'legStraight', label: 'Straight leg', cue: 'Straighten your back leg', joints: s => s.main.idx,
          value: (b, s) => s.main.angle, min: 155, soft: 25,
        },
        {
          id: 'flat', label: 'Flat back', cue: 'Keep your back flat', joints: HIPS_SHOULDERS,
          value: b => tilt(b.sh, b.hip), max: 15, soft: 15,
        },
        ...(level > 1 ? [
          {
            id: 'arm', label: 'Arm forward', cue: 'Reach your arm forward, level with your back', weight: 1.5, joints: [13, 14, 15, 16],
            value: b => lean(reachArm(b).a, reachArm(b).c), min: by(level, [0, 70, 80, 80]), soft: 20,
          },
          {
            id: 'armStraight', label: 'Straight arm', cue: 'Straighten your reaching arm', joints: [13, 14],
            value: b => reachArm(b).angle, min: 150, soft: 30,
          },
        ] : []),
        ...(level === 4 ? [{
          id: 'support', label: 'Knee off the floor', cue: 'Straighten your supporting leg, knee off the floor', joints: s => s.other.idx,
          value: (b, s) => s.other.angle, min: 160, soft: 20,
        }] : []),
      ];
    },
    figure: level => {
      // Side-on, facing right. Hands under shoulders; hips over the knee (or a straight leg to the toes).
      const reach = level > 1 ? [90, 90] : [2, 2];
      if (level === 4) {
        return { view: 'side', compact: true, torso: 90, legs: { L: [-90, -90], R: [-52, -52] }, arms: { R: [0, 0], L: reach } };
      }
      return {
        view: 'side', compact: true, torso: 90 + Math.asin(5 / 30) / DEG,
        legs: { L: [-90, -90], R: [0, -90] },
        arms: { R: [0, 0], L: reach },
      };
    },
  },

  {
    id: 'hollow', name: 'Hollow Hold', native: '', view: 'side', sides: false, camera: true,
    areas: { core: 1 }, style: 'hard',
    landscape: true,
    video: 'hollow body hold progression',
    hint: 'Turn the phone sideways (landscape), low to the ground, side-on to you',
    about: 'Borrowed from gymnastics: lower back pressed into the floor, shoulders and legs lifted. Builds the front of the core.',
    levels: [
      { name: 'Tuck hollow', target: 30, desc: 'On your back, knees pulled in, feet off the floor. Lift your shoulders and press your lower back down.' },
      { name: 'High hollow', target: 30, desc: 'Straighten your legs, feet high (about 45°). Shoulders lifted, arms reaching towards your feet.' },
      { name: 'Hollow hold', target: 45, desc: 'Lower your straight legs until your feet hover just off the floor. Lower back stays pressed down.' },
      { name: 'Full hollow', target: 45, desc: 'Low legs, with your arms reaching overhead past your ears.' },
    ],
    criteria: level => [
      {
        id: 'shoulders', label: 'Shoulders lifted', weight: 1.5, joints: HIPS_SHOULDERS,
        cue: { low: 'Lift your shoulders off the floor', high: 'Lower your shoulders a little' },
        value: b => (b.hip.y - b.sh.y) / b.torsoLen, min: 0.2, max: 0.7, soft: 0.15,
      },
      {
        id: 'legs', label: 'Leg height', weight: 1.5, joints: [23, 24, 27, 28],
        cue: { low: 'Lift your feet higher', high: 'Lower your legs' },
        value: b => (b.hip.y - anklesMid(b).y) / ((b.legs.L.len + b.legs.R.len) / 2),
        ...by(level, [{ min: 0.1, max: 1.2 }, { min: 0.45, max: 0.95 }, { min: 0.12, max: 0.45 }, { min: 0.12, max: 0.45 }]), soft: 0.15,
      },
      level === 1 ? {
        id: 'tuck', label: 'Knees in', cue: 'Pull your knees in', joints: [25, 26],
        value: b => Math.max(b.legs.L.angle, b.legs.R.angle), max: 110, soft: 30,
      } : {
        id: 'straight', label: 'Straight legs', cue: 'Straighten your legs', joints: [25, 26],
        value: b => Math.min(b.legs.L.angle, b.legs.R.angle), min: 160, soft: 20,
      },
      ...(level === 4 ? [{
        id: 'reach', label: 'Arms overhead', cue: 'Reach your arms past your head', joints: [13, 14, 15, 16],
        value: b => (dist(b.hip, mid(b.arms.L.c, b.arms.R.c)) - dist(b.hip, b.sh)) / b.torsoLen, min: 0.6, soft: 0.4,
      }] : []),
    ],
    figure: level => {
      // On the back, head to the left, resting on the lower back.
      const up = 20;
      const legs = by(level, [[165, 75], [125, 125], [105, 105], [105, 105]]);
      const arms = level === 4 ? [-(90 + up + 5), -(90 + up + 5)] : [90, 90];
      return {
        view: 'side', compact: true, torso: -(90 + up), ground: 'pelvis', groundGap: 5,
        legs: { L: legs, R: legs }, arms: { L: arms, R: arms },
      };
    },
  },

  {
    id: 'squat', name: 'Deep Squat', native: 'Shēn Dūn', view: 'side', sides: false, camera: true,
    areas: { mobility: 0.6, legs: 0.4 }, style: 'hard',
    video: 'deep squat hold mobility how to',
    about: 'Not strictly Shaolin, but resting in a deep squat restores hip and ankle mobility, and makes every low stance easier.',
    levels: [
      { name: 'Supported squat', target: 30, desc: 'Feet a little wider than your hips, toes slightly out. Hold a door frame or post and sink until your thighs are level.' },
      { name: 'Deep squat', target: 45, desc: 'Let go and sink all the way: hips below your knees, heels flat on the floor.' },
      { name: 'Prayer squat', target: 60, desc: 'Deep squat with your palms together at your chest, elbows pressing your knees out. Chest up.' },
      { name: 'Overhead squat', target: 60, desc: 'Deep squat with both arms straight overhead. Heels down, chest proud.' },
    ],
    criteria: level => [
      {
        id: 'depth', label: 'Depth', cue: 'Sink lower, hips below your knees', weight: 2, joints: [23, 24, 25, 26],
        value: b => Math.max(kneeDrop(b.legs.L), kneeDrop(b.legs.R)), max: by(level, [0.15, -0.1, -0.1, -0.1]), soft: 0.25,
      },
      {
        id: 'heels', label: 'Heels down', cue: 'Keep your heels down', joints: [29, 30, 31, 32],
        value: b => Math.max(b.P[31].y - b.P[29].y, b.P[32].y - b.P[30].y) / ((b.legs.L.lowerLen + b.legs.R.lowerLen) / 2), max: 0.12, soft: 0.15,
      },
      upright(by(level, [55, 45, 45, 45]), 'Lift your chest', 20),
      ...(level === 3 ? [
        {
          id: 'hands', label: 'Hands at chest', cue: 'Bring your palms together at your chest', joints: [15, 16],
          value: b => (mid(b.arms.L.c, b.arms.R.c).y - b.sh.y) / b.torsoLen, min: -0.2, max: 0.6, soft: 0.25,
        },
        {
          id: 'elbows', label: 'Elbows bent', cue: 'Bend your elbows, palms together', joints: [13, 14],
          value: b => Math.max(b.arms.L.angle, b.arms.R.angle), max: 120, soft: 30,
        },
      ] : []),
      ...(level === 4 ? [
        {
          id: 'overhead', label: 'Arms overhead', cue: 'Reach your arms straight overhead', joints: [15, 16],
          value: b => (b.nose.y - Math.min(b.arms.L.c.y, b.arms.R.c.y)) / b.torsoLen, min: 0.3, soft: 0.3,
        },
        {
          id: 'armStraight', label: 'Straight arms', cue: 'Straighten your arms', joints: [13, 14],
          value: b => Math.min(b.arms.L.angle, b.arms.R.angle), min: 150, soft: 30,
        },
      ] : []),
    ],
    figure: level => {
      // Side-on, facing right: knees forward over the toes, hips sitting back and low.
      const thigh = level === 1 ? 85 : 100;
      const arms = by(level, [[90, 90], [80, 85], [40, 150], [175, 178]]);
      return {
        view: 'side', torso: 145,
        legs: { L: [thigh, -25], R: [thigh, -25] },
        arms: { L: arms, R: [arms[0] - 3, arms[1] - 3] },
      };
    },
  },

  {
    id: 'bridge', name: 'Iron Bridge', native: '', view: 'side', sides: false, camera: true,
    areas: { core: 0.7, legs: 0.3 }, style: 'hard',
    landscape: true,
    video: 'iron bridge between two chairs bodyweight hold',
    hint: 'Turn the phone sideways (landscape), low to the ground, and lie side-on to it',
    about: 'The body held rigid as an iron plank, built up from a floor bridge to the strongman-style demonstration of lying stiff between two chairs. A demonstration feat rather than a classical stance.',
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
    areas: { balance: 0.4, legs: 0.4, core: 0.2 }, style: 'hard',
    hint: 'Turn the phone sideways (landscape) and stand side-on to it',
    landscape: true,
    video: 'yan shi ping heng swallow balance wushu',
    about: 'Balance on one leg with the body tipped forward and the other leg reaching back, like a swallow in flight.',
    levels: [
      { name: 'Leaning balance', target: 20, desc: 'Stand on one leg and tip forward, lifting the other leg behind you. Torso and back leg about 45° from upright. Then switch legs.' },
      { name: 'Half swallow', target: 30, desc: 'Tip further: torso and back leg about 30° from level. Both legs straight.' },
      { name: 'Swallow', target: 45, desc: 'Torso and back leg level with the floor, arms spread out to the sides like wings.' },
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
    areas: { legs: 0.5, balance: 0.3, mobility: 0.2 }, style: 'hard',
    hint: 'Turn the phone sideways (landscape) and stand side-on to it',
    landscape: true,
    video: 'deng tui heel kick kung fu',
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
    id: 'plank', name: 'Fist Plank', native: '', view: 'side', sides: false, camera: true,
    areas: { core: 0.6, upper: 0.4 }, style: 'hard',
    landscape: true,
    video: 'knuckle plank fist plank',
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
    id: 'rest', name: 'Rest Stance', native: 'Xiē Bù', view: 'side', sides: true, camera: true,
    areas: { legs: 0.7, mobility: 0.3 }, style: 'hard',
    video: 'xie bu rest stance kung fu tutorial',
    about: 'A low, cross-legged “resting” stance, like sitting down with your legs crossed while standing. Used for turning and coiling between moves. The camera checks that you’re low with both knees bent; it can’t see the legs cross, so keep that part honest.',
    levels: [
      { name: 'High rest', target: 20, desc: 'Turn your front foot out and step the other foot behind it so your legs cross. Both feet stay on the floor: front foot flat, back foot on its toes with the heel up. Bend both knees a little. Then switch sides.' },
      { name: 'Rest', target: 30, desc: 'Sink to about half-squat: your back knee tucks in behind your front calf. Front foot flat, back heel up, chest upright.' },
      { name: 'Low rest', target: 45, desc: 'Sit low, almost onto your back heel, thighs pressed together. Twist your chest towards the front foot.' },
      { name: 'Deep rest', target: 60, desc: 'Fully seated on your back heel, back knee just off the floor. Upright and still.' },
    ],
    // Only what the camera can see reliably: how low you sit, both knees bent, chest up.
    criteria: level => [
      {
        id: 'low', label: 'Sitting low', cue: 'Sink lower', weight: 2, joints: [23, 24, 27, 28],
        value: b => (Math.max(b.la.y, b.ra.y) - b.hip.y) / b.torsoLen, max: by(level, [1.35, 1.22, 1.08, 0.95]), soft: 0.15,
      },
      {
        id: 'bent', label: 'Both knees bent', cue: 'Bend both knees and sit down into it', joints: [25, 26],
        value: b => Math.max(b.legs.L.angle, b.legs.R.angle), max: by(level, [160, 145, 130, 120]), soft: 25,
      },
      upright(20, 'Chest up'),
    ],
    figure: level => {
      // Side-on, facing right, both feet on the floor. Front leg: shin upright, foot flat.
      // Back leg: knee low, tucked in behind the front calf; foot planted behind on its toes.
      const front = by(level, [40, 55, 68, 78]);
      const height = 22 * Math.cos(front * DEG) + 22 * Math.cos(5 * DEG);
      const kneeUp = Math.max(by(level, [14, 10, 6, 3]), height - 21);  // back knee's height off the floor
      const drop = height - kneeUp;
      const thigh = Math.atan2(Math.sqrt(22 * 22 - drop * drop), drop) / DEG;
      const shin = -Math.atan2(Math.sqrt(22 * 22 - kneeUp * kneeUp), kneeUp) / DEG;
      return {
        view: 'side', torso: 180,
        legs: { L: [front, 5], R: [thigh, shin] },
        arms: { L: [-25, 80], R: [-22, 82] },
      };
    },
  },
];

export const holdById = id => HOLDS.find(h => h.id === id);

export const AREAS = { legs: 'Legs', core: 'Core', upper: 'Arms & shoulders', balance: 'Balance', mobility: 'Mobility' };
export const STYLES = { hard: 'Hard', soft: 'Soft' };
// For sentences: "a lot of <work> lately. Give <rest> a rest".
export const AREA_WORDS = {
  legs: ['leg work', 'your legs'], core: ['core work', 'your core'], upper: ['arm and shoulder work', 'your arms and shoulders'],
  balance: ['balance work', 'those muscles'], mobility: ['stretching', 'those muscles'],
};
// The area a hold works most.
export const mainArea = hold => Object.entries(hold.areas).sort((x, y) => y[1] - x[1])[0][0];

// Landmarks that must be visible for the camera to judge a hold.
export const REQUIRED = [11, 12, 23, 24, 25, 26, 27, 28];
export const requiredFor = (hold, level) => {
  const set = new Set(REQUIRED);
  for (const c of hold.criteria(level)) if (Array.isArray(c.joints)) c.joints.forEach(j => set.add(j));
  return [...set];
};
