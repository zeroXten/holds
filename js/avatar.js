// Your monk: a small pixel-art figure drawn in code from a character, an outfit,
// accessories and the sash for your rank. The figure is 11×18 art pixels, drawn
// into a 13×20 grid so it can have a one-pixel outline all round.

import { Pix, rgb } from './pixel.js';

export const AVATAR_W = 13, AVATAR_H = 20;

const C = {
  outline: rgb('#22161a'), skin: rgb('#e9b48a'), skinDark: rgb('#c98f68'), skinLight: rgb('#f4cba6'),
  wrap: rgb('#f2ead8'), shoe: rgb('#2a2622'), white: rgb('#f4f0e8'), gold: rgb('#e5b13a'),
  cap: rgb('#8d8a86'), capDark: rgb('#6a6763'), band: rgb('#c8322b'),
  bead: rgb('#6a3418'), straw: rgb('#d8b46a'), strawDark: rgb('#a8843a'),
  wood: rgb('#8a5a32'), woodLight: rgb('#b07a48'), fanRed: rgb('#c8322b'), gourd: rgb('#c8862a'),
};

const OUTFITS = {
  saffron: { robe: '#e8891e', dark: '#b85a12', light: '#f6a84e', pants: '#c86a18' },
  grey: { robe: '#8d8a86', dark: '#5f5c58', light: '#b5b2ad', pants: '#6e6b67' },
  black: { robe: '#2e2a33', dark: '#141216', light: '#4a4550', pants: '#1c1a1e', cuff: '#f2ead8' },
  winter: { robe: '#8a2a22', dark: '#5e1a15', light: '#b0443a', pants: '#5e1a15', collar: '#f4f0e8' },
  festival: { robe: '#c8322b', dark: '#8a1f1a', light: '#e05a44', pants: '#8a1f1a', trim: '#f0c040' },
  golden: { robe: '#e5b13a', dark: '#a87820', light: '#f6d77a', pants: '#c8922a', trim: '#fff1a8' },
};

// The head, with the character's features and any hat, in sprite coordinates (the face
// fills x 3–7, y 1–5). Shared by the standing sprite and the monk in a pose, so your monk
// has the same face everywhere.
function paintHead(set, rect, look) {
  rect(4, 1, 3, 1, C.skin);
  rect(3, 2, 5, 4, C.skin);
  for (let y = 2; y < 6; y++) set(7, y, C.skinDark);
  set(5, 6, C.skinDark);
  set(4, 3, C.outline); set(6, 3, C.outline);
  switch (look.character) {
    case 'nun':
      rect(3, 1, 5, 2, C.cap); rect(4, 0, 3, 1, C.cap); set(3, 3, C.cap); set(7, 3, C.capDark); set(7, 2, C.capDark);
      break;
    case 'warrior':
      rect(3, 2, 5, 1, C.band); set(8, 3, C.band); set(9, 4, C.band);
      set(4, 1, C.skinLight);
      break;
    case 'elder':
      set(4, 2, C.white); set(6, 2, C.white);
      rect(4, 5, 3, 3, C.white); set(5, 8, C.white); set(5, 9, C.white);
      set(4, 1, C.skinLight);
      break;
    default:
      set(4, 1, C.skinLight); set(3, 2, C.skinLight);
  }
  if (look.wear?.head === 'hat') { rect(0, 1, 11, 1, C.straw); rect(2, 0, 7, 1, C.straw); rect(4, -1, 3, 1, C.strawDark); set(0, 1, C.strawDark); set(10, 1, C.strawDark); }
}

export function drawAvatar(p, x0, y0, look) {
  const grid = new Array(AVATAR_W * AVATAR_H).fill(0);
  // Local coordinates: (0, 0) is the figure's top-left, inside the outline margin.
  const set = (x, y, c) => { x += 1; y += 1; if (x >= 0 && y >= 0 && x < AVATAR_W && y < AVATAR_H) grid[y * AVATAR_W + x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const o = OUTFITS[look.outfit] ?? OUTFITS.saffron;
  const robe = rgb(o.robe), dark = rgb(o.dark), light = rgb(o.light), pants = rgb(o.pants);
  const wear = look.wear ?? {};

  // Legs: trousers, white wraps, shoes.
  for (const x of [3, 6]) { rect(x, 13, 2, 2, pants); rect(x, 15, 2, 2, C.wrap); }
  rect(2, 17, 3, 1, C.shoe); rect(6, 17, 3, 1, C.shoe);
  // Robe: body, sleeves and hem.
  rect(3, 6, 5, 1, robe);
  rect(2, 7, 7, 6, robe);
  rect(1, 7, 2, 4, robe); rect(8, 7, 2, 4, robe);
  for (let y = 7; y < 11; y++) { set(1, y, dark); set(9, y, light); }
  // A shadow either side of the sash, so it shows up even in the robe's own colour.
  rect(2, 9, 7, 1, dark); rect(2, 11, 7, 1, dark);
  // The crossed front of the robe.
  set(4, 7, dark); set(5, 8, dark); set(6, 9, dark);
  if (o.collar) rect(3, 6, 5, 1, rgb(o.collar));
  const cuff = o.cuff ?? o.trim;
  if (cuff) { set(1, 10, rgb(cuff)); set(9, 10, rgb(cuff)); }
  if (o.trim) rect(2, 12, 7, 1, rgb(o.trim));
  // Hands
  set(1, 11, C.skin); set(9, 11, C.skin);
  // The sash in your rank's colour, a gold dot per black sash degree, and its tail.
  const sash = rgb(look.sash ?? '#f4efe6');
  rect(2, 10, 7, 1, sash);
  set(6, 11, sash); set(6, 12, sash);
  for (let i = 0; i < Math.min(5, look.degree ?? 0); i++) set(2 + i, 10, C.gold);

  paintHead(set, rect, look);

  // Accessories
  if (wear.neck === 'mala') { for (const [x, y] of [[3, 7], [4, 8], [5, 9], [6, 8], [7, 7]]) set(x, y, C.bead); }
  if (wear.hand === 'staff') { for (let y = -1; y < 18; y++) set(10, y, y % 6 === 0 ? C.woodLight : C.wood); }
  if (wear.hand === 'fan') { set(10, 9, C.fanRed); set(10, 10, C.white); set(9, 9, C.white); set(10, 8, C.white); set(9, 8, C.fanRed); }
  if (wear.hand === 'gourd') { set(8, 11, C.bead); set(8, 12, C.gourd); rect(8, 13, 2, 2, C.gourd); }

  // Outline every empty cell next to the figure, then copy onto the picture.
  const filled = (x, y) => x >= 0 && y >= 0 && x < AVATAR_W && y < AVATAR_H && grid[y * AVATAR_W + x] && grid[y * AVATAR_W + x] !== C.outline;
  for (let y = 0; y < AVATAR_H; y++) for (let x = 0; x < AVATAR_W; x++) {
    const i = y * AVATAR_W + x;
    if (grid[i]) p.set(x0 + x, y0 + y, grid[i]);
    else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) p.set(x0 + x, y0 + y, C.outline);
  }
}

// ---- Hand-drawn pose sprites ----
// Small pixel-art poses in the standing monk's style, for your monk in the temple. Each row
// is pixels: R robe, D robe shadow, L robe highlight, P trousers, S sash, s skin, w leg
// wraps, f shoes, '.' empty. The head (with the character's features and hat) is painted
// on at `head`, the offset of the standing sprite's head (its face fills x 3–7, y 1–5).
const POSES = {
  horse: { head: [2, 0], rows: [
    '', '', '', '', '', '',
    '.....RRRRR.....',
    '..LRRRRDRRRRD..',
    '..LRRRRRDRRRD..',
    '..sRRRRRRDRRs..',
    '...SSSSSSSSS...',
    '..PPPPPPPPPPP..',
    '.PPPPP...PPPPP.',
    '.PP.........PP.',
    '.PP.........PP.',
    '.ww.........ww.',
    '.ww.........ww.',
    'fff.........fff',
  ] },
  bow: { head: [3, 0], rows: [
    '', '', '', '', '', '',
    '......RRRRR.......',
    '.....LRRRRD.......',
    '.....LRRDRD.......',
    '.....sRRRDs.......',
    '......SSSS........',
    '......PPPPPP......',
    '.....PPP..PPPP....',
    '....PP.......PPP..',
    '...PP.........PP..',
    '..PP..........ww..',
    '.PP...........ww..',
    'ff............fff.',
  ] },
  crane: { head: [2, 0], rows: [
    '', '', '', '', '', '',
    '.....RRRRR....',
    '.....LRRRRDD..',
    '.....LRRRRDss.',
    '.....LRRRRD...',
    '......SSSS....',
    '......PPPPPPP.',
    '......PP...PP.',
    '......PP...PP.',
    '......PP...ff.',
    '......ww......',
    '......ww......',
    '.....fff......',
  ] },
  plank: { head: [0, 0], rows: [
    '',
    '',
    '',
    '',
    '',
    '',
    '......RRRRRRRS.............',
    '.....LRRRRRRRRSSPPPPPP.....',
    '.....sR.......SPPPPPPPPPPww',
    '.....s..................ff',
    '.....s....................',
  ] },
  sit: { head: [2, 0], rows: [
    '', '', '', '', '', '',
    '.....RRRRR.....',
    '....LRRRDRRD...',
    '...LRRRRRDRRD..',
    '...LRRRRRRDRD..',
    '...SSSSssSSSS..',
    '.PPPPPPsPPPPPP.',
    'PPPPPwwwwwPPPPP',
    '.PPPPPPPPPPPPP.',
  ] },
  armsUp: { head: [0, 4], rows: [
    '....sss....',
    '...RR.RR...',
    '..RR...RR..',
    '..R.....R..',
    '..R.....R..',
    '..R.....R..',
    '..R.....R..',
    '..R.....R..',
    '..R.....R..',
    '..R.....R..',
    '..LRRRRRD..',
    '..LRRDRRD..',
    '..LRRRDRD..',
    '..SSSSSSS..',
    '..RRRRRRR..',
    '...PP.PP...',
    '...PP.PP...',
    '...ww.ww...',
    '...ww.ww...',
    '..fff.fff..',
  ] },
  armsOut: { head: [4, 0], rows: [
    '', '', '', '', '', '',
    '.......RRRRR.......',
    'sRRRRRRRRRRRRRRRRRs',
    '......LRRDRRD......',
    '......LRRRDRD......',
    '......SSSSSSS......',
    '......RRRRRRR......',
    '.......PP.PP.......',
    '.......PP.PP.......',
    '.......ww.ww.......',
    '.......ww.ww.......',
    '......fff.fff......',
  ] },
};

// Which pose each hold shows (anything not listed stands).
export const POSE_OF = {
  horse: 'horse', drop: 'horse', squat: 'horse', post: 'horse',
  bow: 'bow', cat: 'bow', rest: 'bow',
  crane: 'crane', kick: 'crane', swallow: 'crane', balance: 'crane',
  plank: 'plank', forearm: 'plank', sideplank: 'plank', birddog: 'plank', bear: 'plank', hollow: 'plank', bridge: 'plank', yanfei: 'plank', fingertips: 'plank',
  zuochan: 'sit', nordic: 'sit',
  sky: 'armsUp', weituo: 'armsUp', stars: 'armsUp', toes: 'armsUp',
  wings: 'armsOut', drawbow: 'armsOut', claws: 'armsOut',
};

// Draws your monk in a hold's pose, feet on `ground`, centred on x.
export function drawPoseSprite(p, x, ground, look, holdId) {
  const pose = POSES[POSE_OF[holdId]];
  if (!pose) return drawAvatar(p, Math.round(x) - 6, ground - AVATAR_H + 1, look);
  const o = OUTFITS[look.outfit] ?? OUTFITS.saffron;
  const pal = { R: rgb(o.robe), D: rgb(o.dark), L: rgb(o.light), P: rgb(o.pants), S: rgb(look.sash ?? '#f4efe6'), s: C.skin, w: C.wrap, f: C.shoe };
  const W = Math.max(...pose.rows.map(r => r.length)) + 4, H = pose.rows.length + 4;
  const grid = new Array(W * H).fill(0);
  const set = (gx, gy, c) => { gx += 2; gy += 2; if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy * W + gx] = c; };
  pose.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) set(x, y, pal[ch]); }));
  // A gold dot per black sash degree, on the sash's left end.
  const sashRow = pose.rows.findIndex(r => r.includes('S'));
  if (sashRow >= 0) for (let i = 0; i < Math.min(5, look.degree ?? 0); i++) set(pose.rows[sashRow].indexOf('S') + i, sashRow, C.gold);
  const [hx, hy] = pose.head;
  paintHead((gx, gy, c) => set(hx + gx, hy + gy, c), (gx, gy, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(hx + gx + i, hy + gy + j, c); }, look);
  const x0 = Math.round(x) - Math.floor(W / 2), y0 = ground - H + 3;
  const filled = (gx, gy) => gx >= 0 && gy >= 0 && gx < W && gy < H && grid[gy * W + gx] && grid[gy * W + gx] !== C.outline;
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const v = grid[gy * W + gx];
    if (v) p.set(x0 + gx, y0 + gy, v);
    else if (filled(gx - 1, gy) || filled(gx + 1, gy) || filled(gx, gy - 1) || filled(gx, gy + 1)) p.set(x0 + gx, y0 + gy, C.outline);
  }
}

// Draws the monk alone into a canvas of AVATAR_W × AVATAR_H art pixels (transparent around it).
export function renderAvatar(canvas, look) {
  canvas.width = AVATAR_W; canvas.height = AVATAR_H;
  const p = new Pix(AVATAR_W, AVATAR_H);
  drawAvatar(p, 0, 0, look);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(AVATAR_W, AVATAR_H);
  new Uint32Array(img.data.buffer).set(p.data);
  ctx.putImageData(img, 0, 0);
}
