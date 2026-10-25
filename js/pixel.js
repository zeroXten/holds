// A tiny software canvas for code-drawn pixel art. Pixels are packed RGBA in a
// Uint32Array (little-endian, so it can be copied straight into ImageData).

export const rgb = (hex, a = 255) => {
  const n = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
};

// Blend two hex colours: t = 0 → a, t = 1 → b.
export const mix = (a, b, t) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

// 4x4 ordered-dither thresholds, for gradients in the 90s style.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
  }

  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, a = c >>> 24;
    if (a === 255) { this.data[i] = c; return; }
    if (a === 0) return;
    const d = this.data[i], k = a / 255;
    const ch = s => Math.round(((c >>> s) & 255) * k + ((d >>> s) & 255) * (1 - k));
    this.data[i] = ((255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  hline(x0, x1, y, c) { if (x0 > x1) [x0, x1] = [x1, x0]; for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { if (y0 > y1) [y0, y1] = [y1, y0]; for (let y = Math.round(y0); y <= Math.round(y1); y++) this.set(x, y, c); }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const half = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01)));
      this.hline(cx - half, cx + half, cy + y, c);
    }
  }

  disc(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }

  // Draws an ASCII sprite: each character is a key in `pal` ('.' or space = transparent).
  sprite(x, y, rows, pal, flip = false) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        const c = pal[ch];
        if (c !== undefined) this.set(x + (flip ? row.length - 1 - i : i), y + j, c);
      });
    });
  }
}
