// Renders temple scenes to PNG files for checking the artwork outside the browser.
// Run: node tools/render-temple.mjs <out-dir> [width]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix } from '../js/pixel.js';
import { renderTemple, SCENE_H } from '../js/temple.js';
import { TEMPLE_ITEMS } from '../js/economy.js';

const out = process.argv[2] ?? '.', W = +(process.argv[3] ?? 195), SCALE = 4;

function png(p) {
  const w = p.w * SCALE, h = p.h * SCALE, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = p.data[Math.floor(y / SCALE) * p.w + Math.floor(x / SCALE)], o = y * (w * 4 + 1) + 1 + x * 4;
    raw[o] = v & 255; raw[o + 1] = (v >>> 8) & 255; raw[o + 2] = (v >>> 16) & 255; raw[o + 3] = 255;
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const all = TEMPLE_ITEMS.map(i => i.id);
const scenes = {
  'base-dawn': { owned: [], theme: 'dawn' },
  'all-dawn': { owned: all, theme: 'dawn' },
  'all-day': { owned: all, theme: 'day' },
  'all-dusk': { owned: all, theme: 'dusk' },
  'all-autumn': { owned: all, theme: 'autumn' },
  'all-night': { owned: all, theme: 'night' },
  'all-snow': { owned: all, theme: 'snow' },
  'some-dawn': { owned: ['path', 'bamboo', 'posts', 'lanterns', 'hall'], theme: 'dawn' },
};
for (const [name, opts] of Object.entries(scenes)) {
  const p = renderTemple(new Pix(W, SCENE_H), { ...opts, t: 3.3 });
  writeFileSync(`${out}/${name}.png`, png(p));
}
console.log('rendered', Object.keys(scenes).length, 'scenes');
