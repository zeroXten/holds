// Draws the app icon, a pixel-art temple silhouette against a rising sun, and writes it
// as SVG and PNG at each size. The art is 32×32 pixels, scaled up by whole numbers so
// it stays crisp. Run: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix, rgb } from '../js/pixel.js';

const N = 32;
const COLORS = {
  sky: '#c4501d', glow: '#e9773a', sun: '#ffe2b0', ground: '#8f3412',
  temple: '#2b140b', light: '#ffcf70',
};

function art() {
  const p = new Pix(N, N), c = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, rgb(v)]));
  p.rect(0, 0, N, N, c.sky);
  p.disc(16, 14, 11.5, c.glow);
  p.disc(16, 14, 10, c.sun);
  p.rect(0, 24, N, N - 24, c.ground);
  const t = c.temple;
  // Finial
  p.rect(15, 4, 2, 3, t);
  // Upper roof, sweeping out to upturned eaves, over a narrow upper hall with a lit window.
  p.hline(12, 19, 7, t); p.hline(10, 21, 8, t); p.hline(9, 22, 9, t);
  p.set(8, 8, t); p.set(23, 8, t); p.set(7, 7, t); p.set(24, 7, t);
  p.rect(13, 10, 6, 3, t);
  p.rect(15, 11, 2, 1, c.light);
  // Lower roof, wider, over the main hall with a lit doorway.
  p.hline(9, 22, 13, t); p.hline(7, 24, 14, t); p.hline(6, 25, 15, t);
  p.set(5, 14, t); p.set(26, 14, t); p.set(4, 13, t); p.set(27, 13, t);
  p.rect(10, 16, 12, 6, t);
  p.rect(15, 18, 2, 4, c.light);
  // Platform and steps on the horizon.
  p.hline(8, 23, 22, t); p.hline(7, 24, 23, t);
  return p;
}

const picture = art();
const color = (x, y) => picture.data[y * N + x];
const hex = v => `#${[0, 8, 16].map(s => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')}`;

// SVG: one rect per run of same-coloured pixels, clipped to a rounded square.
const runs = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N;) {
    let end = x;
    while (end + 1 < N && color(end + 1, y) === color(x, y)) end++;
    runs.push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1" fill="${hex(color(x, y))}"/>`);
    x = end + 1;
  }
}
writeFileSync('icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">
<clipPath id="r"><rect width="${N}" height="${N}" rx="7"/></clipPath>
<g clip-path="url(#r)">${runs.join('')}</g></svg>\n`);

// PNG: the art at `scale` pixels per art pixel, centred on a `size` square filled with
// the sky colour; `rounded` cuts the corners (the maskable icon keeps the full square).
function png(size, scale, { rounded }) {
  const off = (size - N * scale) / 2, r = size * 0.22;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Outside the art (the maskable icon's border), carry on its edge colours.
      const ax = Math.max(0, Math.min(N - 1, Math.floor((x - off) / scale))), ay = Math.max(0, Math.min(N - 1, Math.floor((y - off) / scale)));
      const v = color(ax, ay);
      const cx = Math.max(r, Math.min(size - r, x + 0.5)), cy = Math.max(r, Math.min(size - r, y + 0.5));
      const inside = !rounded || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = v & 255; raw[o + 1] = (v >>> 8) & 255; raw[o + 2] = (v >>> 16) & 255; raw[o + 3] = inside ? 255 : 0;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('icons/icon-180.png', png(180, 5, { rounded: false }));   // iOS rounds the corners itself
writeFileSync('icons/icon-192.png', png(192, 6, { rounded: true }));
writeFileSync('icons/icon-512.png', png(512, 16, { rounded: true }));
writeFileSync('icons/maskable-512.png', png(512, 12, { rounded: false }));  // art inside the safe zone
console.log('icons written');
