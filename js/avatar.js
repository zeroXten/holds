// Your monk: a small pixel-art figure drawn in code from a character, an outfit,
// accessories and the sash for your rank. The figure is 11×18 art pixels, drawn
// into a 13×20 grid so it can have a one-pixel outline all round.

import { Pix, rgb } from './pixel.js';
import { buildJoints, SEG } from './figure.js';

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

  // Head
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

  // Accessories
  if (wear.neck === 'mala') { for (const [x, y] of [[3, 7], [4, 8], [5, 9], [6, 8], [7, 7]]) set(x, y, C.bead); }
  if (wear.head === 'hat') { rect(0, 1, 11, 1, C.straw); rect(2, 0, 7, 1, C.straw); rect(4, -1, 3, 1, C.strawDark); set(0, 1, C.strawDark); set(10, 1, C.strawDark); }
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

// Your monk in a pose: a hold's stick figure (joint angles from holds.js), drawn as a
// small pixel-art body in your outfit and sash, standing with its feet at (x0, ground).
// The upper body rises and falls a touch with the breath at time `t`.
export function drawPoseMonk(p, x0, ground, look, spec, t = 0, scale = 0.22) {
  const j = buildJoints(spec);
  const breath = Math.sin(t * 1.25) * 0.45;
  const UPPER = ['neck', 'head', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lWrist', 'rWrist', 'lTip', 'rTip'];
  const at = k => [j[k][0] * scale, j[k][1] * scale + (UPPER.includes(k) ? breath : 0)];
  // Draw into a small buffer of its own so the whole body can be outlined, then copy it in.
  const pts = Object.keys(j).map(at), pad = 4;
  const minX = Math.floor(Math.min(...pts.map(q => q[0]))) - pad, maxX = Math.ceil(Math.max(...pts.map(q => q[0]))) + pad;
  const minY = Math.floor(Math.min(...pts.map(q => q[1]))) - pad - 2, maxY = Math.ceil(Math.max(...pts.map(q => q[1]))) + pad;
  const b = new Pix(maxX - minX + 1, maxY - minY + 1);
  const P = k => { const [x, y] = at(k); return [x - minX, y - minY]; };
  const limb = (a, c, r, col) => { const [ax, ay] = P(a), [bx, by] = P(c); b.capsule(ax, ay, bx, by, r, col); };
  const o = OUTFITS[look.outfit] ?? OUTFITS.saffron;
  const robe = rgb(o.robe), dark = rgb(o.dark), pants = rgb(o.pants), sash = rgb(look.sash ?? '#f4efe6');
  const limbR = Math.max(0.9, 4.5 * scale), bodyR = Math.max(1.4, 6.5 * scale);

  // Legs (trousers, shoes), body (robe with the sash band), arms (sleeves, hands), head.
  for (const s of ['r', 'l']) {
    limb(s + 'Hip', s + 'Knee', limbR, pants);
    limb(s + 'Knee', s + 'Ankle', limbR, pants);
    const [ax, ay] = P(s + 'Ankle'); b.disc(ax, ay, limbR, C.shoe);
  }
  limb('pelvis', 'neck', bodyR, robe);
  const [px, py] = P('pelvis'), [nx, ny] = P('neck');
  const along = f => [px + (nx - px) * f, py + (ny - py) * f];
  const [s1x, s1y] = along(0.12), [s2x, s2y] = along(0.28);
  b.capsule(s1x, s1y, s2x, s2y, bodyR, sash);
  for (const s of ['r', 'l']) {
    limb(s + 'Shoulder', s + 'Elbow', limbR, robe);
    limb(s + 'Elbow', s + 'Wrist', limbR, s === 'r' ? dark : robe);
    const [wx, wy] = P(s + 'Wrist'); b.disc(wx, wy, limbR * 0.9, C.skin);
  }
  const [hx, hy] = P('head'), hr = Math.max(1.6, SEG.headR * scale);
  b.disc(hx, hy, hr, C.skin);
  switch (look.character) {
    case 'nun': b.ellipse(hx, hy - hr * 0.5, hr, hr * 0.6, C.cap); break;
    case 'warrior': b.hline(hx - hr, hx + hr, hy - hr * 0.4, C.band); break;
    case 'elder': b.disc(hx, hy + hr * 0.9, hr * 0.6, C.white); break;
  }
  if (look.wear?.head === 'hat') { b.hline(hx - hr - 2, hx + hr + 2, hy - hr + 0.5, C.straw); b.hline(hx - hr * 0.6, hx + hr * 0.6, hy - hr - 0.5, C.strawDark); }

  // Outline, then copy onto the picture.
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const v = b.data[y * b.w + x], X = x0 + x + minX, Y = ground + y + minY;
    if (v) { p.set(X, Y, v); continue; }
    const n = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < b.w && yy < b.h && b.data[yy * b.w + xx]; };
    if (n(-1, 0) || n(1, 0) || n(0, -1) || n(0, 1)) p.set(X, Y, C.outline);
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
