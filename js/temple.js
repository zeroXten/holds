// The temple courtyard: a pixel-art scene drawn entirely in code. It starts as
// bare mountains and earth with a carved stone; the
// temple grows through its stages and the courtyard gains each feature you buy. Themes change the time of day or season (and the app's accent colours).

import { Pix, rgb, mix, bayer } from './pixel.js';
import { drawPoseSprite } from './avatar.js';
import { inBloom } from './economy.js';

// ---- Palettes ----

const BASE = {
  stone: '#a9a196', stoneLight: '#cfc8bc', stoneDark: '#6e675e',
  wood: '#7a4a2c', woodLight: '#9b6a40', woodDark: '#4a2a18',
  red: '#b8352b', redLight: '#d85a40', redDark: '#7a1f1a',
  roof: '#3f5f63', roofLight: '#6b9095', roofDark: '#26393c',
  plaster: '#e9dcc0', plasterDark: '#c4b38f', lattice: '#5a2a1c',
  gold: '#e5b13a', goldDark: '#a87820', goldLight: '#f6d77a',
  bronze: '#8a6a3a', bronzeLight: '#b89a5a', bronzeDark: '#5a4224',
  foliage: '#4a7a3a', foliageLight: '#7aaa4a', foliageDark: '#2c4a26',
  bamboo: '#6a9a3a', bambooLight: '#9ac45a', bambooDark: '#3e6a26',
  bark: '#4a3226', barkLight: '#6e4c38',
  blossom: '#f0a0c0', blossomLight: '#ffd8e8', blossomDark: '#c8668e',
  water: '#3a6e8c', waterLight: '#8cc4d8', waterDark: '#24485e',
  earth: '#8a6a4a', earthLight: '#a8865e', earthDark: '#5e4630',
  outline: '#22161a', white: '#f4f0e8', koi: '#f07a2a', smoke: '#d8d4cc',
  lantern: '#d8382a', lanternLight: '#ff7a48',
};
// Light sources keep their colour at night.
const LIGHTS = { glow: '#ffc860', window: '#ffcf70', lanternLight: '#ff8a50', gold: '#e5b13a', goldLight: '#f6d77a' };

const THEMES = {
  dawn: {
    sky: ['#2e2a5a', '#7a3e72', '#d0607a', '#f6a868'], sun: { x: -0.26, y: -40, r: 10, c: '#ffd890', glow: '#ffb070' },
    far: '#9a6a8a', mid: '#6e4a72', near: '#4a3456', tint: ['#803050', 0.12],
  },
  day: {
    sky: ['#2a6fd0', '#4a90e0', '#86c0ec', '#cceaf8'], sun: { x: 0.3, y: 16, r: 6, c: '#fff6c8', glow: '#ffffff' },
    far: '#8ab0c8', mid: '#5e8a84', near: '#3e6a4e', clouds: true,
  },
  dusk: {
    sky: ['#1e1a40', '#5a2658', '#c8463e', '#ff9a40'], sun: { x: 0.27, y: -36, r: 12, c: '#ff7a40', glow: '#ff5a30' },
    far: '#7a3a5a', mid: '#4e2a48', near: '#2e1e34', tint: ['#602040', 0.25],
  },
  autumn: {
    sky: ['#3a6ab8', '#6a9ad0', '#c8d0b8', '#f4e2b0'], sun: { x: -0.3, y: 18, r: 7, c: '#fff0b0', glow: '#fff8e0' },
    far: '#a89070', mid: '#a8603a', near: '#7a4a2a', clouds: true,
    over: {
      foliage: '#c8742a', foliageLight: '#e8a848', foliageDark: '#8a4a22', bamboo: '#9a9a3a', bambooLight: '#c8c45a',
      blossom: '#d8602a', blossomLight: '#f0a040', blossomDark: '#a8401e', earth: '#9a7048',
    },
  },
  night: {
    sky: ['#05081c', '#0c1432', '#16224a', '#22305c'], moon: { x: -0.16, y: 30, r: 6, c: '#f4f0d0' },
    far: '#2a3460', mid: '#1e2648', near: '#141a34', tint: ['#0e1638', 0.55], stars: true, lightsOn: true,
  },
  snow: {
    sky: ['#7a889e', '#9aa6b8', '#c0cad8', '#dfe6ee'], sun: { x: -0.2, y: 20, r: 8, c: '#f0f2f4', glow: '#ffffff', faint: true },
    far: '#c8d0dc', mid: '#9aa4b6', near: '#76829a', tint: ['#c8d4e0', 0.15], snowing: true,
    over: { earth: '#e6ecf2', earthLight: '#f6f9fc', earthDark: '#b8c2d0', foliage: '#3a5a46', foliageDark: '#24402e' },
  },
};

function palette(name) {
  const th = THEMES[name] ?? THEMES.dawn;
  const pal = { ...BASE, ...th.over };
  if (th.tint) for (const k in pal) pal[k] = mix(pal[k], th.tint[0], th.tint[1]);
  Object.assign(pal, LIGHTS);
  const out = {};
  for (const k in pal) out[k] = rgb(pal[k]);
  out.hex = pal;
  return { th, c: out };
}

// ---- Noise ----

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
const fbm = (x, seed) => noise(x + seed) * 0.65 + noise(x * 2.3 + seed * 1.7) * 0.35;
// Ridged noise: sharp peaks, for the far mountains.
const ridged = (x, seed) => (1 - Math.abs(noise(x + seed) * 2 - 1)) * 0.7 + noise(x * 2.7 + seed) * 0.3;

// ---- Building blocks ----

// A Chinese tiled roof: concave sweep, ridge, tile lines and upturned eaves.
function roof(p, c, x, top, w, h, snow) {
  for (let r = 0; r < h; r++) {
    const k = h === 1 ? 1 : r / (h - 1);
    const half = Math.round(w / 2 - 4 + 4 * k * k);
    const col = r === 0 ? c.roofDark : r === 1 ? c.roofLight : r === h - 1 ? c.roofDark : c.roof;
    p.hline(x - half, x + half, top + r, snow && r < 2 ? c.white : col);
    if (r >= 2 && r < h - 1 && !(snow && r < 3)) for (let i = x - half + 1; i < x + half; i += 3) p.set(i, top + r, c.roofDark);
  }
  const half = Math.round(w / 2);
  p.set(x - half - 1, top + h - 2, c.roofDark); p.set(x + half + 1, top + h - 2, c.roofDark);
  p.set(x - half - 2, top + h - 3, c.roofDark); p.set(x + half + 2, top + h - 3, c.roofDark);
}

function glowAt(p, x, y, r, color) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy) / r;
    if (d < 1) p.set(x + dx, y + dy, (color & 0x00ffffff) | (Math.round((1 - d) * (1 - d) * 90) << 24));
  }
}

// ---- Sprites ----

const SPRITES = {
  bell: ['..o..', '.bBb.', 'bBBbd', 'bBBbd', 'bBBbd', 'ggggg', 'bd.db'],
  lion: [
    '..oooo..', '.oMMMMo.', 'oMmMMmMo', 'oMMSSMMo', '.oMMMMo.', '.oSSSSo.', 'oSSSSSSo', 'oSoSSoSo', 'PPPPPPPP', 'pppppppp',
  ],
  burner: [
    '.g.....g.', '.g.....g.', 'ggggggggg', 'oBBBBBBBo', 'oBbBbBbBo', '.oBBBBBo.', '..ooooo..', '..d.d.d..', '.d..d..d.',
  ],
  hangLantern: ['.ggg.', 'LLLLL', 'LLlLL', 'LlllL', 'LLlLL', 'LLLLL', '.ggg.', '..r..', '..r..'],
  stoneLantern: ['.sss.', 'ssSss', '..d..', '.dGd.', '.dGd.', 'sssss', '..s..', '..s..', '.sss.', 'sssss'],
  crane: [['.........', 'kww...wwk', '..wwrww..', '....w....'], ['kww...wwk', '..wwwww..', '....wr...', '.........']],
};

// ---- Features (each draws itself; positions are relative to the centre cx and ground line G) ----

function sky(p, c, th, W, G, t) {
  // Twice as many stops as the palette gives, for finer dithering between bands.
  const stops = th.sky.flatMap((h, i) => (i ? [mix(th.sky[i - 1], h, 0.5), h] : [h])).map(h => rgb(h));
  for (let y = 0; y < G; y++) {
    const f = (y / G) * (stops.length - 1), i = Math.min(Math.floor(f), stops.length - 2), k = f - i;
    for (let x = 0; x < W; x++) p.set(x, y, k > bayer(x, y) ? stops[i + 1] : stops[i]);
  }
  if (th.stars) {
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash(i * 3.1) * W), y = Math.floor(hash(i * 7.7) * (G - 34));
      const tw = hash(i + Math.floor(t * 2) * 0.13) > 0.25;
      p.set(x, y, tw ? c.white : rgb('#8a94c0'));
    }
  }
  const cx = W / 2;
  if (th.sun) {
    const s = th.sun, x = Math.round(cx + s.x * W), y = s.y < 0 ? G + s.y : s.y;
    if (!s.faint) glowAt(p, x, y, s.r + 8, rgb(s.glow));
    p.disc(x, y, s.r, rgb(s.c, s.faint ? 110 : 255));
    if (!s.faint) p.disc(x - 1, y - 1, s.r - 3, rgb(mix(s.c, '#ffffff', 0.4)));
  }
  if (th.moon) {
    const m = th.moon, x = Math.round(cx + m.x * W);
    glowAt(p, x, m.y, m.r + 7, rgb('#6070b0'));
    p.disc(x, m.y, m.r, rgb(m.c));
    p.set(x - 2, m.y - 1, rgb('#d8d2b0')); p.set(x + 1, m.y + 2, rgb('#d8d2b0')); p.set(x + 2, m.y - 2, rgb('#d8d2b0'));
  }
  if (th.clouds) {
    for (let i = 0; i < 3; i++) {
      const x = ((hash(i * 9.3) * W + t * (1.5 + i * 0.6)) % (W + 40)) - 20, y = 10 + i * 9;
      const shade = rgb('#e8f0f6'), white = rgb('#ffffff');
      p.ellipse(x, y + 1, 10, 3, shade); p.ellipse(x - 4, y, 5, 3, white); p.ellipse(x + 3, y - 1, 6, 4, white);
    }
  }
}

function mountains(p, c, th, W, G, layer, seed) {
  const cx = W / 2;
  const cfg = {
    far: { base: G - 20, amp: 30, freq: 1 / 26, col: th.far },
    mid: { base: G - 13, amp: 12, freq: 1 / 22, col: th.mid },
    near: { base: G - 3, amp: 6, freq: 1 / 14, col: th.near },
  }[layer];
  const col = rgb(cfg.col), light = rgb(mix(cfg.col, '#ffffff', 0.18)), snowCap = rgb(mix(cfg.col, '#ffffff', th.snowing ? 0.8 : 0.55));
  const ridge = [];
  const shape = layer === 'far' ? ridged : fbm;
  for (let x = 0; x < W; x++) ridge.push(Math.round(cfg.base - cfg.amp * shape((x - cx) * cfg.freq, seed)));
  for (let x = 0; x < W; x++) {
    p.vline(x, ridge[x], G, col);
    if (x > 0 && ridge[x - 1] > ridge[x]) p.set(x, ridge[x], light);
    // Snow on the highest peaks only.
    if (layer === 'far' && ridge[x] < G - 41) p.vline(x, ridge[x], Math.min(G - 41, ridge[x] + 2), snowCap);
    if (th.snowing && layer !== 'far') p.set(x, ridge[x], snowCap);
  }
  return ridge;
}

function mist(p, W, G, t) {
  const white = rgb('#ffffff', 60);
  for (const [y0, sp] of [[G - 30, 4], [G - 17, -3]]) {
    for (let x = 0; x < W; x++) {
      const y = y0 + Math.round(Math.sin((x + t * sp) / 13) * 1.5);
      for (let k = 0; k < 3; k++) p.set(x, y + k, white);
    }
  }
}

function waterfall(p, c, W, G, far, mid, t) {
  const x0 = Math.round(W / 2 + 40);
  const top = far[x0] + 2, bottom = mid[x0];
  for (let y = top; y < bottom; y++) {
    for (let dx = 0; dx < 3; dx++) {
      const band = (y - Math.floor(t * 14) + dx * 2) % 5 === 0;
      p.set(x0 + dx, y, band ? c.water : dx === 1 ? c.white : c.waterLight);
    }
  }
  for (let i = 0; i < 6; i++) p.set(x0 - 2 + ((i * 3 + Math.floor(t * 6)) % 7), bottom - 1 - (i % 2), rgb('#ffffff', 170));
}

function ground(p, c, W, H, G) {
  for (let y = G; y < H; y++) for (let x = 0; x < W; x++) {
    const n = hash(x * 13.7 + y * 91.3);
    p.set(x, y, n > 0.93 ? c.earthDark : n > 0.86 ? c.earthLight : c.earth);
  }
  p.hline(0, W, G, c.earthDark);
}

function path(p, c, W, H, G) {
  const cx = Math.round(W / 2);
  for (let y = G + 1; y < H; y++) {
    const k = (y - G) / (H - G), half = Math.round(5 + 11 * k);
    p.hline(cx - half, cx + half, y, c.stone);
    p.set(cx - half, y, c.stoneDark); p.set(cx + half, y, c.stoneDark);
  }
  // Flagstone joints, spaced wider towards the viewer.
  let y = G + 3, step = 2, row = 0;
  while (y < H) {
    const k = (y - G) / (H - G), half = Math.round(5 + 11 * k);
    p.hline(cx - half, cx + half, y, c.stoneDark);
    p.hline(cx - half + 1, cx + half - 1, y + 1, c.stoneLight);
    for (let x = cx - half + (row % 2 ? 3 : 6); x < cx + half; x += 7) p.vline(x, y + 1, y + step, c.stoneDark);
    y += step + 1; step++; row++;
  }
}

// Stage 1: a carved standing stone with a red cloth tied round it.
function shrineStone(p, c, cx, G, snow) {
  p.rect(cx - 6, G - 2, 12, 2, c.stoneDark);
  p.hline(cx - 6, cx + 5, G - 2, c.stone);
  for (let y = G - 14; y < G - 2; y++) {
    const half = y < G - 12 ? 2 : 3;
    p.hline(cx - half, cx + half - 1, y, c.stone);
    p.set(cx - half, y, c.stoneLight); p.set(cx + half - 1, y, c.stoneDark);
  }
  if (snow) p.hline(cx - 2, cx + 1, G - 14, c.white);
  p.hline(cx - 3, cx + 2, G - 10, c.red);
  p.set(cx + 3, G - 9, c.red); p.set(cx + 3, G - 8, c.redDark);
  for (const y of [G - 7, G - 5]) p.hline(cx - 1, cx, y, c.stoneDark);  // a carved glyph
}

// Stage 2: a small roofed shrine on a stone base, a little gold figure inside.
function waysideShrine(p, c, cx, G, night, snow) {
  p.rect(cx - 9, G - 3, 18, 3, c.stone);
  p.hline(cx - 9, cx + 8, G - 3, c.stoneLight);
  p.hline(cx - 9, cx + 8, G - 1, c.stoneDark);
  p.rect(cx - 5, G - 14, 10, 11, night ? c.window : c.woodDark);
  if (night) glowAt(p, cx, G - 8, 9, c.glow);
  p.disc(cx, G - 10, 1.2, c.gold);
  p.ellipse(cx, G - 6, 3, 2, c.gold);
  p.hline(cx - 3, cx + 2, G - 4, c.goldDark);
  for (const x of [cx - 7, cx + 5]) { p.rect(x, G - 15, 2, 12, c.red); p.vline(x, G - 15, G - 4, c.redLight); }
  roof(p, c, cx, G - 20, 24, 5, snow);
  p.set(cx, G - 21, c.gold);
}

// Stage 3: a one-room temple with red columns and a single roof.
function smallTemple(p, c, cx, G, night, snow) {
  p.rect(cx - 22, G - 3, 44, 3, c.stone);
  p.hline(cx - 22, cx + 21, G - 3, c.stoneLight);
  p.hline(cx - 22, cx + 21, G - 1, c.stoneDark);
  for (let i = 0; i < 2; i++) p.hline(cx - 5 - i, cx + 4 + i, G - 2 + i, i % 2 ? c.stoneDark : c.stoneLight);
  const top = G - 15;
  p.rect(cx - 17, top, 34, 12, c.plaster);
  p.hline(cx - 17, cx + 16, top, c.plasterDark);
  for (const off of [-15, 9]) {
    const x0 = cx + off;
    for (let y = top + 3; y < G - 6; y++) for (let x = x0; x < x0 + 6; x++) {
      const lattice = (x + y) % 2 === 0 || y === top + 3 || y === G - 7;
      p.set(x, y, night ? (lattice ? c.lattice : c.window) : (lattice ? c.lattice : c.plasterDark));
    }
  }
  for (const off of [-18, -8, 6, 16]) { p.rect(cx + off, top, 2, 12, c.red); p.vline(cx + off, top, G - 4, c.redLight); }
  p.rect(cx - 4, top + 2, 8, 10, c.redDark);
  p.vline(cx, top + 2, G - 4, c.outline);
  for (let y = top + 4; y < G - 4; y += 3) { p.set(cx - 2, y, c.gold); p.set(cx + 1, y, c.gold); }
  roof(p, c, cx, G - 22, 48, 7, snow);
  p.rect(cx - 17, G - 24, 3, 2, c.gold); p.rect(cx + 14, G - 24, 3, 2, c.gold);
  p.rect(cx - 1, G - 24, 2, 2, c.gold);
}

// Stage 5: the hall raised on a wide two-step terrace with a balustrade, a third
// roof and a golden finial.
function grandTemple(p, c, cx, G, night, snow) {
  p.rect(cx - 42, G - 3, 84, 3, c.stone);
  p.hline(cx - 42, cx + 41, G - 3, c.stoneLight);
  p.hline(cx - 42, cx + 41, G - 1, c.stoneDark);
  p.rect(cx - 38, G - 6, 76, 3, c.stone);
  p.hline(cx - 38, cx + 37, G - 6, c.stoneLight);
  p.hline(cx - 38, cx + 37, G - 4, c.stoneDark);
  for (let x = cx - 38; x <= cx + 37; x += 3) if (Math.abs(x - cx) > 8) p.vline(x, G - 9, G - 7, c.stoneLight);
  p.hline(cx - 38, cx - 8, G - 9, c.stoneLight); p.hline(cx + 8, cx + 37, G - 9, c.stoneLight);
  for (let i = 0; i < 6; i++) p.hline(cx - 7, cx + 6, G - 6 + i, i % 2 ? c.stoneDark : c.stoneLight);
  const g = G - 5;
  hall(p, c, cx, g, night, snow);
  p.rect(cx - 15, g - 44, 30, 3, c.red);
  for (let x = cx - 13; x < cx + 13; x += 4) p.set(x, g - 43, c.gold);
  roof(p, c, cx, g - 50, 36, 6, snow);
  p.vline(cx, g - 55, g - 51, c.gold);
  p.disc(cx, g - 56, 1.2, c.gold);
  p.set(cx - 18, g - 47, c.gold); p.set(cx + 18, g - 47, c.gold);
}

// Stage 4 (and the heart of stage 5): the main hall.
function hall(p, c, cx, G, night, snow) {
  // Stone platform and steps
  p.rect(cx - 33, G - 4, 66, 4, c.stone);
  p.hline(cx - 33, cx + 32, G - 4, c.stoneLight);
  p.hline(cx - 33, cx + 32, G - 1, c.stoneDark);
  for (let i = 0; i < 3; i++) p.hline(cx - 6 - i, cx + 5 + i, G - 3 + i, i % 2 ? c.stoneDark : c.stoneLight);
  // Walls with lattice windows between red columns
  const top = G - 20;
  p.rect(cx - 26, top, 52, 16, c.plaster);
  p.hline(cx - 26, cx + 25, top, c.plasterDark);
  for (const off of [-26, -16, 6, 16]) {
    const x0 = cx + off + 2;
    for (let y = top + 3; y < G - 7; y++) for (let x = x0; x < x0 + 6; x++) {
      const lattice = (x + y) % 2 === 0 || y === top + 3 || y === G - 8;
      p.set(x, y, night ? (lattice ? c.lattice : c.window) : (lattice ? c.lattice : c.plasterDark));
    }
  }
  for (const off of [-27, -17, -7, 6, 16, 25]) { p.rect(cx + off, top, 2, 16, c.red); p.vline(cx + off, top, G - 5, c.redLight); }
  // Door with gold studs
  p.rect(cx - 5, top + 2, 10, 14, c.redDark);
  p.vline(cx, top + 2, G - 5, c.outline);
  for (let y = top + 4; y < G - 5; y += 3) { p.set(cx - 3, y, c.gold); p.set(cx + 2, y, c.gold); }
  // Lower roof, band, upper roof with gold ridge ends
  roof(p, c, cx, G - 27, 74, 7, snow);
  p.rect(cx - 22, G - 30, 44, 3, c.red);
  for (let x = cx - 20; x < cx + 20; x += 4) p.set(x, G - 29, c.gold);
  roof(p, c, cx, G - 38, 54, 8, snow);
  p.rect(cx - 24, G - 40, 3, 2, c.gold); p.rect(cx + 21, G - 40, 3, 2, c.gold);
  p.set(cx - 25, G - 41, c.gold); p.set(cx + 24, G - 41, c.gold);
  p.rect(cx - 1, G - 41, 2, 2, c.gold);
}

function pagoda(p, c, x, G, night, snow) {
  p.rect(x - 11, G - 2, 22, 2, c.stone);
  p.hline(x - 11, x + 10, G - 2, c.stoneLight);
  let y = G - 2;
  for (const w of [14, 11, 8]) {
    const h = 7;
    p.rect(x - w / 2, y - h, w, h, c.red);
    p.vline(x - w / 2, y - h, y - 1, c.redLight);
    p.rect(x - 1, y - h + 2, 2, 4, night ? c.window : c.outline);
    y -= h;
    roof(p, c, x, y - 4, w + 10, 4, snow);
    y -= 4;
  }
  p.vline(x, y - 6, y - 1, c.gold);
  p.set(x, y - 7, c.gold); p.set(x - 1, y - 3, c.gold); p.set(x + 1, y - 3, c.gold);
}

function bellTower(p, c, x, G, t, snow) {
  p.rect(x - 11, G - 3, 22, 3, c.stone);
  p.hline(x - 11, x + 10, G - 3, c.stoneLight);
  for (const off of [-9, 8]) { p.rect(x + off, G - 24, 2, 21, c.red); p.vline(x + off, G - 24, G - 4, c.redLight); }
  p.rect(x - 10, G - 25, 21, 2, c.wood);
  roof(p, c, x, G - 31, 28, 6, snow);
  const swing = Math.round(Math.sin(t * 1.2) * 1);
  p.vline(x, G - 23, G - 21, c.woodDark);
  p.sprite(x - 2 + swing, G - 21, SPRITES.bell, { o: c.bronzeDark, b: c.bronze, B: c.bronzeLight, d: c.bronzeDark, g: c.gold });
}

function poles(p, c, x, G, snow) {
  const set = [[-7, 3, 11], [0, 1, 14], [7, 3, 10], [-4, 7, 9], [4, 7, 12]];
  for (const [dx, dy, h] of set.sort((a, b) => a[1] - b[1])) {
    const bx = x + dx, by = G + dy;
    p.rect(bx, by - h, 2, h, c.wood);
    p.vline(bx, by - h, by - 1, c.woodLight);
    p.hline(bx, bx + 1, by - h, snow ? c.white : c.woodLight);
    p.hline(bx - 1, bx + 2, by, c.earthDark);
  }
}

function pond(p, c, x, y, t) {
  p.ellipse(x, y, 17, 6, c.stoneDark);
  p.ellipse(x, y - 0.5, 16, 5, c.stone);
  p.ellipse(x, y, 14, 4, c.water);
  p.hline(x - 13, x + 13, y - 3, c.waterDark);
  for (let i = 0; i < 6; i++) {
    const rx = x - 10 + ((i * 7 + Math.floor(t * 3)) % 21), ry = y - 1 + (i % 3);
    p.hline(rx, rx + 1, ry, c.waterLight);
  }
  for (const [dx, dy] of [[-8, 1], [6, -1], [10, 2]]) { p.hline(x + dx - 1, x + dx + 1, y + dy, c.foliage); p.set(x + dx, y + dy - 1, c.foliageLight); }
  for (let k = 0; k < 2; k++) {
    const a = t * 0.7 + k * Math.PI, fx = x + Math.cos(a) * 9, fy = y + Math.sin(a) * 2;
    const dir = -Math.sin(a) > 0 ? 1 : -1;
    p.set(fx, fy, c.koi); p.set(fx - dir, fy, c.koi); p.set(fx + dir, fy, c.white);
  }
}

function lions(p, c, cx, G) {
  const pal = { o: c.stoneDark, M: c.stone, m: c.stoneDark, S: c.stoneLight, P: c.stoneDark, p: c.outline };
  p.sprite(cx - 24, G + 1, SPRITES.lion, pal);
  p.sprite(cx + 16, G + 1, SPRITES.lion, pal, true);
}

function burner(p, c, cx, G, t) {
  const y = G + 9;
  p.sprite(cx - 4, y, SPRITES.burner, { g: c.gold, B: c.bronze, b: c.bronzeDark, o: c.bronzeDark, d: c.bronzeDark });
  for (let k = 0; k < 12; k++) {
    const phase = (t * 5 + k) % 12;
    const sy = y - phase * 1.6, sx = cx + Math.round(Math.sin(t * 1.5 + phase * 0.5) * phase * 0.25);
    p.set(sx, sy, (c.smoke & 0x00ffffff) | (Math.round(200 * (1 - phase / 12)) << 24));
  }
}

function lanterns(p, c, W, G, cx, gate, t, lit) {
  const spots = gate ? [Math.round(W * 0.2), Math.round(W * 0.8)] : [cx - 37, cx + 33];
  spots.forEach((x, i) => {
    if (gate) {
      const sway = Math.round(Math.sin(t * 1.6 + i * 2) * 1);
      p.vline(x, 16, 19, c.outline);
      if (lit) { glowAt(p, x + sway, 23, 12, c.glow); glowAt(p, x + sway, 23, 6, c.glow); }
      p.sprite(x - 2 + sway, 20, SPRITES.hangLantern, { g: c.gold, G: c.goldDark, L: c.lantern, l: lit ? c.glow : c.lanternLight, r: c.lantern });
    } else {
      if (lit) { glowAt(p, x + 2, G - 1, 10, c.glow); glowAt(p, x + 2, G - 1, 5, c.glow); }
      p.sprite(x, G - 4, SPRITES.stoneLantern, { s: c.stone, S: c.stoneLight, d: c.stoneDark, G: lit ? c.glow : c.stoneDark });
    }
  });
}

function bamboo(p, c, W, H, t, snow) {
  const stalks = [[1, 8, -1], [5, 3, 1], [9, 11, -1], [13, 6, 1], [W - 3, 7, 1], [W - 7, 2, -1], [W - 11, 10, 1], [W - 15, 5, -1]];
  stalks.forEach(([x0, top, lean], i) => {
    const sway = Math.sin(t * 0.9 + i) * 1.2;
    for (let y = top; y < H; y++) {
      const k = 1 - (y - top) / (H - top), x = Math.round(x0 + lean * k * 3 + sway * k);
      const node = (y - top) % 8 === 0;
      p.set(x, y, node ? c.bambooDark : c.bamboo);
      p.set(x + 1, y, node ? c.bambooDark : c.bambooLight);
      if (node && y < H - 20 && hash(i * 31 + y) > 0.4) {
        const d = hash(y + i) > 0.5 ? 1 : -1;
        for (let j = 1; j < 5; j++) p.set(x + (d > 0 ? 1 + j : -j), y - Math.floor(j / 2), j < 3 ? c.foliageDark : snow ? c.white : c.foliage);
      }
    }
  });
}

function plumTree(p, c, W, H, G, t) {
  const x0 = Math.round(W / 2 - 78);
  const blossoms = [];
  const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const branch = (x, y, ang, len, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len;
    for (let w = 0; w < Math.max(1, depth - 1); w++) p.line(x + w, y, x2 + w, y2, w === 0 ? c.barkLight : c.bark);
    if (depth <= 1) { blossoms.push([x2, y2]); return; }
    branch(x2, y2, ang + 0.45 + rand() * 0.3, len * 0.72, depth - 1);
    branch(x2, y2, ang - 0.4 - rand() * 0.3, len * 0.68, depth - 1);
  };
  branch(x0, H, Math.PI / 2 + 0.12, 16, 4);
  for (const [bx, by] of blossoms) {
    for (let i = 0; i < 16; i++) {
      const dx = Math.round((rand() - 0.5) * 9), dy = Math.round((rand() - 0.5) * 6);
      p.set(bx + dx, by + dy, i % 3 === 0 ? c.blossomDark : i % 3 === 1 ? c.blossom : c.blossomLight);
    }
  }
  for (let i = 0; i < 9; i++) {
    const fall = (t * 7 + i * 11) % (H - G + 30);
    const px = x0 - 6 + ((i * 17) % 34) + Math.round(Math.sin(t + i) * 2) + fall * 0.4, py = G - 30 + fall;
    p.set(px, py, i % 2 ? c.blossom : c.blossomLight);
  }
}

function cranes(p, c, W, t) {
  for (let i = 0; i < 3; i++) {
    const x = ((t * 6 + i * 23) % (W + 40)) - 20, y = 14 + i * 5 + Math.round(Math.sin(t * 1.3 + i) * 1.5);
    const frame = SPRITES.crane[Math.floor(t * 3 + i) % 2];
    p.sprite(x, y, frame, { w: c.white, k: c.outline, r: c.red });
  }
}

// ---- Seasonal decorations ----

// Spring
const EGG = ['.a.', 'aba', 'aaa', '.a.'];
function eggs(p, cx, G) {
  const cols = [['#f4a6c8', '#fff4a8'], ['#a8d8f4', '#ffffff'], ['#b8e6a0', '#f4a6c8'], ['#fff4a8', '#a8d8f4'], ['#d8b8f4', '#fff4a8']];
  [[-60, 8], [-18, 17], [24, 6], [60, 17], [-46, 19]].forEach(([dx, dy], i) => p.sprite(cx + dx, G + dy, EGG, { a: rgb(cols[i][0]), b: rgb(cols[i][1]) }));
}

function flowers(p, c, W, G) {
  const petals = [rgb('#f4a6c8'), rgb('#fff4a8'), rgb('#ffffff'), rgb('#e86a8a')];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? W - 3 - (hash(i * 3.3) * 26) : 2 + hash(i * 3.3) * 26;
    const x = Math.round(side), y = Math.round(G + 2 + hash(i * 7.1) * 18);
    p.set(x, y + 1, c.foliageDark);
    p.set(x, y, petals[i % petals.length]);
    p.set(x + 1, y, petals[(i + 1) % petals.length]);
  }
}

const BUNNY = [['.w.w..', '.w.w..', '.wwwk.', 'wwwww.', '.w.w..'], ['......', '.w.w..', '.wwwk.', 'wwwwww', 'w...w.']];
function bunny(p, W, G, t) {
  const x = Math.round(((t * 7) % (W + 20)) - 10), hop = Math.abs(Math.sin(t * 5)) * 3;
  p.sprite(x, Math.round(G + 9 - hop), BUNNY[hop > 1.5 ? 1 : 0], { w: rgb('#f4f0e8'), k: rgb('#22161a') });
}

// Summer
function parasol(p, c, cx, G) {
  const x = cx - 64, top = G - 13;
  p.vline(x, top, G + 9, c.woodDark);
  for (let r = 0; r < 5; r++) {
    const half = 3 + r * 2;
    for (let i = -half; i <= half; i++) p.set(x + i, top + r, Math.floor((i + 20) / 3) % 2 ? rgb('#e84a3a') : rgb('#fff4e8'));
  }
  // Deckchair: a slanted striped canvas on a wooden frame.
  const dx = x + 9, dy = G + 9;
  p.line(dx, dy, dx + 6, dy - 6, c.woodDark); p.line(dx + 2, dy, dx + 7, dy - 3, c.woodDark);
  for (let k = 0; k < 6; k++) p.set(dx + 1 + k, dy - 1 - k, k % 2 ? rgb('#3a8ad8') : rgb('#fff4e8'));
  p.hline(dx - 1, dx + 3, dy - 1, rgb('#3a8ad8'));
}

const KITE = ['..k..', '.kak.', 'kaaak', '.kak.', '..k..'];
function kites(p, c, W, H, t) {
  [[0.22, 14, '#e84a3a'], [0.68, 22, '#3a8ad8']].forEach(([fx, y0, col], i) => {
    const x = Math.round(W * fx + Math.sin(t * 0.9 + i) * 4), y = Math.round(y0 + Math.cos(t * 1.1 + i) * 2);
    for (let k = 1; k < 30; k++) if (k % 2) p.set(x + 2 + k * 0.6, y + 5 + k * 1.6, rgb('#f4f0e8', 160));  // the string
    p.sprite(x, y, KITE, { k: c.outline, a: rgb(col) });
    for (let k = 0; k < 4; k++) p.set(x + 2 - k + Math.round(Math.sin(t * 3 + k)), y + 5 + k * 2, k % 2 ? rgb('#fff4a8') : rgb(col));
  });
}

function fireflies(p, W, G, t, dark) {
  for (let i = 0; i < 12; i++) {
    if (hash(i + Math.floor(t * 1.5 + i * 0.3)) < 0.35) continue;  // blinking
    const x = Math.round((hash(i * 9.1) * W + Math.sin(t * 0.7 + i) * 6 + W) % W), y = Math.round(G - 14 + hash(i * 4.4) * 24 + Math.cos(t + i) * 2);
    if (dark) glowAt(p, x, y, 3, rgb('#d8ff70'));
    p.set(x, y, rgb(dark ? '#f4ffb0' : '#c8e04a'));
  }
}

// Autumn: leaves blowing across.
function leaves(p, W, H, t) {
  const cols = ['#c8322b', '#e07a1a', '#e5b13a', '#a8401e'].map(h => rgb(h));
  for (let i = 0; i < 14; i++) {
    const x = Math.round((hash(i * 2.7) * W + t * (10 + (i % 4) * 3)) % (W + 10)) - 5, y = Math.round((hash(i * 5.9) * H + t * (5 + (i % 3) * 2)) % H);
    p.set(x, y, cols[i % 4]); p.set(x + 1, y + (Math.floor(t * 4 + i) % 2), cols[(i + 1) % 4]);
  }
}

// Winter
function xmasTree(p, c, cx, G, t) {
  const x = cx + 64, base = G + 18;
  p.rect(x - 1, base - 3, 3, 3, c.bark);
  for (let r = 0; r < 18; r++) {
    const half = Math.round(1 + (r % 6) * 0.9 + Math.floor(r / 6) * 1.6), y = base - 4 - (17 - r);
    p.hline(x - half, x + half, y, r % 6 === 5 ? c.foliageDark : c.foliage);
  }
  const lights = ['#ff5a4a', '#ffe070', '#6ac8ff', '#ffffff'].map(h => rgb(h));
  for (let i = 0; i < 12; i++) {
    const y = base - 6 - Math.round(hash(i * 3.1) * 14), half = 1 + Math.floor((y - (base - 21)) / 3);
    if ((i + Math.floor(t * 2)) % 3) p.set(x - half + Math.round(hash(i * 7.7) * half * 2), y, lights[i % 4]);
  }
  p.set(x, base - 23, c.gold); p.hline(x - 1, x + 1, base - 22, c.gold); p.set(x, base - 21, c.gold);
}

function snowman(p, c, cx, G) {
  const x = cx - 62, base = G + 16, white = rgb('#f6f9fc'), shade = rgb('#c8d4e0');
  p.disc(x, base - 4, 4.5, white); p.disc(x, base - 11, 3.4, white);
  p.hline(x - 4, x + 4, base, shade);
  p.set(x - 1, base - 12, c.outline); p.set(x + 1, base - 12, c.outline);
  p.hline(x, x + 2, base - 11, rgb('#f07a1a'));
  p.hline(x - 3, x + 3, base - 8, c.red);  // a monk's sash for a scarf
  p.set(x, base - 5, c.outline); p.set(x, base - 3, c.outline);
}

function newYearLanterns(p, c, W, t, lit) {
  for (const [y0, sag, off] of [[8, 7, 0], [16, 5, 7]]) {
    const at = x => Math.round(y0 + sag * Math.sin(Math.PI * x / W));
    for (let x = 0; x < W; x++) if (x % 2) p.set(x, at(x), c.redDark);
    for (let x = 6 + off; x < W - 4; x += 14) {
      const y = at(x) + 1, sway = Math.round(Math.sin(t * 1.5 + x) * 0.6);
      if (lit) glowAt(p, x + 1, y + 3, 5, c.glow);
      p.hline(x + sway, x + 2 + sway, y, c.gold);
      p.rect(x - 1 + sway, y + 1, 5, 4, c.lantern);
      p.vline(x + 1 + sway, y + 2, y + 3, lit ? c.glow : c.lanternLight);
      p.hline(x + sway, x + 2 + sway, y + 5, c.gold);
      p.set(x + 1 + sway, y + 6, c.gold);
    }
  }
}

// Autumn's Halloween

function harvestMoon(p, W, G, cx) {
  const x = Math.round(cx + W * 0.27), y = G - 40;
  glowAt(p, x, y, 18, rgb('#ff9a3a'));
  p.disc(x, y, 11, rgb('#f2a03a'));
  p.disc(x - 2, y - 2, 8, rgb('#f8b85a'));
  for (const [dx, dy, r] of [[-4, 2, 2], [3, -3, 1.5], [4, 4, 1.2], [-1, -5, 1]]) p.disc(x + dx, y + dy, r, rgb('#d8822a'));
}

const BAT = [['k...k', 'kk.kk', '.kkk.'], ['.....', '.kkk.', 'kk.kk']];
function bats(p, W, t) {
  for (let i = 0; i < 5; i++) {
    const x = ((t * (9 + i * 2) + i * 37) % (W + 30)) - 15, y = 10 + ((i * 7) % 22) + Math.round(Math.sin(t * 2.2 + i * 1.7) * 3);
    p.sprite(x, y, BAT[Math.floor(t * 6 + i) % 2], { k: rgb('#1a1020') });
  }
}

const PUMPKIN = ['..g..', '.ooo.', 'oyoyo', 'ooooo', '.oyo.'];
function pumpkins(p, c, W, H, G, lit) {
  const cx = Math.round(W / 2);
  for (const [k, side] of [[0.25, -1], [0.25, 1], [0.7, -1], [0.7, 1]]) {
    const y = Math.round(G + 2 + k * (H - G - 6)), half = Math.round(5 + 11 * ((y - G) / (H - G)));
    const x = cx + side * (half + 4) - 2;
    if (lit) glowAt(p, x + 2, y + 2, 6, c.glow);
    p.sprite(x, y, PUMPKIN, { g: c.foliageDark, o: rgb('#e07a1a'), y: lit ? rgb('#ffe070') : rgb('#7a3a0a') });
  }
}

function gate(p, c, W, H, cx, snow) {
  for (const x of [2, W - 6]) {
    p.rect(x, 12, 4, H - 12, c.red);
    p.vline(x, 12, H, c.redLight);
    p.vline(x + 3, 12, H, c.redDark);
    p.rect(x - 1, H - 5, 6, 5, c.stone);
    p.hline(x - 1, x + 4, H - 5, c.stoneLight);
  }
  p.rect(0, 12, W, 4, c.red);
  p.hline(0, W, 12, c.redLight);
  p.hline(0, W, 15, c.redDark);
  for (let x = 4; x < W; x += 6) p.set(x, 13, c.gold);
  p.rect(0, 19, W, 2, c.red);
  p.hline(0, W, 20, c.redDark);
  p.rect(cx - 9, 13, 18, 8, c.gold);
  p.rect(cx - 8, 14, 16, 6, c.redDark);
  // Three little glyphs on the plaque.
  const glyphs = [['x.x', 'xxx', 'x.x', 'xxx'], ['xxx', '.x.', 'xxx', 'x.x'], ['.x.', 'xxx', 'x.x', 'x.x']];
  glyphs.forEach((g, i) => p.sprite(cx - 6 + i * 5, 15, g, { x: c.gold }));
  roof(p, c, cx, 3, W + 4, 9, snow);
}

function snowfall(p, W, H, t) {
  const white = rgb('#ffffff', 220);
  for (let i = 0; i < 70; i++) {
    const x = (hash(i * 5.3) * W + t * 3 + Math.sin(t + i) * 2) % W, y = (hash(i * 2.1) * H + t * (8 + (i % 3) * 3)) % H;
    p.set(x, y, white);
  }
}

// ---- The whole scene ----

export const SCENE_H = 104;

// Stage 6: a red courtyard wall with tiled coping right across, and a side hall at each end.
function monasteryWall(p, c, W, cx, G, night, snow) {
  const top = G - 11;
  p.rect(0, top, W, 11, c.red);
  p.hline(0, W, top + 2, c.redLight);
  p.hline(0, W, G - 1, c.redDark);
  p.rect(0, top - 3, W, 3, c.roof);
  p.hline(0, W, top - 3, snow ? c.white : c.roofLight);
  for (let x = 1; x < W; x += 3) p.set(x, top - 1, c.roofDark);
  for (const x of [cx - 80, cx + 80]) sideHall(p, c, x, G, night, snow);
}

function sideHall(p, c, x, G, night, snow) {
  p.rect(x - 12, G - 3, 24, 3, c.stone);
  p.hline(x - 12, x + 11, G - 3, c.stoneLight);
  const top = G - 14;
  p.rect(x - 9, top, 18, 11, c.plaster);
  p.rect(x - 3, top + 3, 6, 8, night ? c.window : c.redDark);
  for (const off of [-10, 8]) { p.rect(x + off, top, 2, 11, c.red); p.vline(x + off, top, G - 4, c.redLight); }
  roof(p, c, x, G - 20, 28, 6, snow);
}

// Stages 6–8 keep the grand temple, in gold from stage 7.
const gilded = c => ({ ...c, roof: c.gold, roofLight: c.goldLight, roofDark: c.goldDark });

// Stage 8: a halo of light behind the temple and banks of cloud around the mountain.
function cloudHalo(p, c, cx, G, t) {
  const y0 = G - 42;
  for (let i = 0; i < 3; i++) glowAt(p, cx, y0, 46 - i * 12, c.goldLight);
  // Slowly turning rays.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + t * 0.04;
    for (let r = 20; r < 58; r++) {
      const fade = Math.round(150 * (1 - (r - 20) / 38));
      p.set(cx + Math.cos(a) * r, y0 + Math.sin(a) * r * 0.75, (c.goldLight & 0x00ffffff) | (fade << 24));
    }
  }
}

function cloudBanks(p, W, G, t) {
  const white = rgb('#ffffff', 200), shade = rgb('#e8ecf4', 200);
  for (let i = 0; i < 9; i++) {
    const x = ((hash(i * 4.7) * W + t * (1 + (i % 3) * 0.5)) % (W + 50)) - 25, y = G - 17 - (i % 3) * 5;
    p.ellipse(x, y + 1, 14, 3, shade); p.ellipse(x - 5, y, 7, 3, white); p.ellipse(x + 5, y - 1, 8, 4, white);
  }
}

const STAGES = [
  (p, c, cx, G, lit, snow) => shrineStone(p, c, cx, G, snow),
  waysideShrine, smallTemple, hall, grandTemple, grandTemple, grandTemple, grandTemple,
];

// ---- Late-game decorations ----

function banners(p, c, cx, G, t, snow) {
  [cx - 45, cx + 43].forEach((x, i) => {
    p.rect(x, G - 34, 2, 37, c.woodDark);
    p.vline(x, G - 34, G + 2, c.wood);
    p.set(x, G - 35, c.gold); p.set(x + 1, G - 35, c.gold);
    p.hline(x - 1, x + 6, G - 32, c.woodDark);
    for (let y = G - 31; y < G - 12; y++) {
      const sway = Math.round(Math.sin(t * 1.4 + i + (y - G) * 0.15) * (y - (G - 31)) / 14);
      for (let dx = 0; dx < 5; dx++) p.set(x + 2 + dx + sway, y, dx === 0 || dx === 4 ? c.redDark : (y % 5 === 0 && dx === 2 ? c.gold : c.red));
    }
    if (snow) p.hline(x - 1, x + 6, G - 33, c.white);
  });
}

// A golden Buddha seen through the hall's open doors (stage 4 and up).
function buddha(p, c, cx, G, tier, night) {
  const g = tier >= 4 ? G - 5 : G, top = g - 20;
  p.rect(cx - 5, top + 2, 10, 14, night ? c.woodDark : c.outline);
  glowAt(p, cx, top + 9, 7, c.glow);
  p.disc(cx, top + 6, 1.6, c.gold);
  p.ellipse(cx, top + 11, 3.5, 3, c.gold);
  p.hline(cx - 1, cx + 1, top + 10, c.goldLight);
  p.hline(cx - 4, cx + 3, top + 14, c.goldDark);
  p.set(cx, top + 4, c.goldLight);
}

function dragonPillars(p, c, cx, G, H, t) {
  for (const x of [cx - 15, cx + 13]) {
    p.rect(x, G - 8, 3, H - G + 8, c.red);
    p.vline(x, G - 8, H, c.redLight);
    p.vline(x + 2, G - 8, H, c.redDark);
    p.rect(x - 1, G - 10, 5, 2, c.gold);
    p.rect(x - 1, H - 3, 5, 3, c.stone);
    // A golden dragon spiralling up the pillar.
    for (let y = G - 6; y < H - 3; y++) {
      const k = Math.sin((y + t * 4) * 0.45);
      if (Math.abs(k) < 0.5) p.set(x + (k > 0 ? 0 : 2), y, c.gold);
      else p.set(x + 1, y, c.goldDark);
    }
    p.set(x + 1, G - 7, c.goldLight);
  }
}

function trainingYard(p, c, cx, G) {
  // Wooden dummy: a post with three arms and a leg.
  const x = cx + 64, y = G + 4;
  p.rect(x, y, 3, 14, c.wood);
  p.vline(x, y, y + 13, c.woodLight);
  p.hline(x - 3, x - 1, y + 3, c.woodDark); p.hline(x + 3, x + 5, y + 3, c.woodDark);
  p.hline(x - 3, x - 1, y + 6, c.woodDark);
  p.line(x + 3, y + 9, x + 6, y + 12, c.woodDark);
  p.hline(x - 1, x + 3, y + 14, c.earthDark);
  // A rack of staffs.
  const rx = cx + 72;
  p.hline(rx - 1, rx + 7, G + 6, c.woodDark);
  p.hline(rx - 1, rx + 7, G + 15, c.woodDark);
  for (let i = 0; i < 4; i++) p.vline(rx + i * 2, G + 1, G + 17, i % 2 ? c.woodLight : c.wood);
  p.vline(rx - 1, G + 5, G + 18, c.woodDark); p.vline(rx + 7, G + 5, G + 18, c.woodDark);
}

// ---- Frames: pixel-art borders around the picture ----

const FRAME_COLORS = {
  lacquer: { outer: '#4a100c', main: '#b8352b', inner: '#e5b13a', corner: '#e5b13a' },
  wood: { outer: '#2e1a10', main: '#7a4a2c', grain: '#9b6a40', inner: '#4a2a18', corner: '#4a2a18' },
  jade: { outer: '#1c3f2e', main: '#3f8f6a', inner: '#9fd8b4', corner: '#e8f4ea' },
  gold: { outer: '#3a2610', main: '#e5b13a', inner: '#7a5418', corner: '#fff1a8' },
};

function frame(p, kind) {
  const f = FRAME_COLORS[kind];
  if (!f) return;
  const c = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, rgb(v)]));
  const W = p.w, H = p.h;
  const ring = (i, col) => { p.hline(i, W - 1 - i, i, col); p.hline(i, W - 1 - i, H - 1 - i, col); p.vline(i, i, H - 1 - i, col); p.vline(W - 1 - i, i, H - 1 - i, col); };
  ring(0, c.outer);
  ring(1, c.main); ring(2, c.main);
  if (c.grain) for (let x = 3; x < W - 3; x += 4) { p.set(x, 1, c.grain); p.set(x + 2, H - 2, c.grain); }
  if (c.grain) for (let y = 3; y < H - 3; y += 4) { p.set(1, y, c.grain); p.set(W - 2, y + 2, c.grain); }
  ring(3, c.inner);
  // Corner pieces, and (gold) a small ornament halfway along each edge.
  for (const [x, y] of [[0, 0], [W - 6, 0], [0, H - 6], [W - 6, H - 6]]) {
    p.rect(x, y, 6, 6, c.main);
    p.rect(x + 1, y + 1, 4, 4, c.corner);
    p.rect(x + 2, y + 2, 2, 2, c.outer);
  }
  if (kind === 'gold') for (const [x, y] of [[W / 2 - 2, 0], [W / 2 - 2, H - 4], [0, H / 2 - 2], [W - 4, H / 2 - 2]]) p.rect(x, y, 4, 4, c.corner);
}

// `groundRows`: how much of the picture is courtyard (taller in the full-screen view).
// `monk`: { look, holdId } to draw your monk in that hold's pose, in the courtyard.
export function renderTemple(p, { owned = [], tier = 0, theme = 'dawn', t = 0, monk = null, frame: frameKind = null, groundRows = 22 } = {}) {
  const { th, c } = palette(theme);
  const has = id => owned.includes(id);
  const W = p.w, H = p.h, G = H - groundRows, cx = Math.round(W / 2);
  const lit = !!th.lightsOn, snow = !!th.snowing;

  sky(p, c, th, W, G, t);
  if (has('harvestmoon')) harvestMoon(p, W, G, cx);
  if (has('cranes')) cranes(p, c, W, t);
  if (has('bats')) bats(p, W, t);
  if (has('kites')) kites(p, c, W, H, t);
  if (has('newyear')) newYearLanterns(p, c, W, t, lit);
  const far = mountains(p, c, th, W, G, 'far', 3.7);
  if (has('mist')) mist(p, W, G, t);
  // The waterfall runs down the far mountain and disappears behind the nearer ridge.
  const midRidge = Array.from({ length: W }, (_, x) => Math.round(G - 13 - 12 * fbm((x - W / 2) / 22, 11.2)));
  if (has('waterfall')) waterfall(p, c, W, G, far, midRidge, t);
  mountains(p, c, th, W, G, 'mid', 11.2);
  mountains(p, c, th, W, G, 'near', 21.9);

  const stage = Math.max(0, Math.min(STAGES.length - 1, tier));
  const tc = stage >= 6 ? gilded(c) : c;  // the temple's own colours
  if (stage >= 7) { cloudHalo(p, c, cx, G, t); cloudBanks(p, W, G, t); }
  if (stage >= 5) monasteryWall(p, tc, W, cx, G, lit, snow);
  if (has('pagoda')) pagoda(p, tc, cx + 56, G, lit, snow);
  STAGES[stage](p, tc, cx, G, lit, snow);
  if (has('buddha') && stage >= 3) buddha(p, c, cx, G, stage, lit);
  if (has('bell')) bellTower(p, tc, cx - 56, G, t, snow);

  ground(p, c, W, H, G);
  if (has('path')) path(p, c, W, H, G);
  if (has('pumpkins')) pumpkins(p, c, W, H, G, lit || has('harvestmoon'));
  if (has('flowers')) flowers(p, c, W, G);
  if (has('eggs')) eggs(p, cx, G);
  if (has('parasol')) parasol(p, c, cx, G);
  if (has('snowman')) snowman(p, c, cx, G);
  if (has('xmastree')) xmasTree(p, c, cx, G, t);
  if (has('bunny')) bunny(p, W, G, t);
  if (has('posts')) poles(p, c, cx - 46, G, snow);
  if (has('pond')) pond(p, c, cx + 44, G + 12, t);
  if (has('lions')) lions(p, c, cx, G);
  if (has('banners')) banners(p, c, cx, G, t, snow);
  if (has('dragons')) dragonPillars(p, c, cx, G, H, t);
  if (has('yard')) trainingYard(p, c, cx, G);
  if (has('lanterns') && !has('gate')) lanterns(p, c, W, G, cx, false, t, lit);
  if (has('incense')) burner(p, c, cx, G, t);
  if (has('bamboo')) bamboo(p, c, W, H, t, snow);
  if (has('plum')) plumTree(p, c, W, H, G, t);
  // Your monk, in the pose of your last hold, in the open courtyard left of the path.
  if (monk) drawPoseSprite(p, cx - 32, G + 15, monk.look, monk.holdId);
  if (has('gate')) {
    gate(p, c, W, H, cx, snow);
    if (has('lanterns')) lanterns(p, c, W, G, cx, true, t, lit);
  }
  if (has('fireflies')) fireflies(p, W, G, t, lit || th.tint?.[1] > 0.2);
  if (has('leaves')) leaves(p, W, H, t);
  if (snow) snowfall(p, W, H, t);
  if (frameKind && frameKind !== 'none') frame(p, frameKind);
  return p;
}

// Draws the scene into a <canvas> whose width/height are in art pixels.
export function drawTemple(canvas, state, t, theme = state.temple.theme, monk = null, groundRows = 22) {
  const p = new Pix(canvas.width, canvas.height);
  // What's on show: owned, not put away, and (for seasonal decorations) in season.
  const shown = state.temple.owned.filter(id => !(state.temple.hidden ?? []).includes(id) && inBloom(id));
  renderTemple(p, { owned: shown, tier: state.temple.tier ?? 0, theme, t, monk, frame: state.temple.frame, groundRows });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(p.w, p.h);
  new Uint32Array(img.data.buffer).set(p.data);
  ctx.putImageData(img, 0, 0);
}
