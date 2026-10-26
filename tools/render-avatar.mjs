// Renders every monk character, outfit and accessory to one PNG for checking the art.
// Run: node tools/render-avatar.mjs <out-dir>
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix, rgb } from '../js/pixel.js';
import { drawAvatar, AVATAR_W, AVATAR_H } from '../js/avatar.js';
import { AVATAR_CHARACTERS, AVATAR_OUTFITS, AVATAR_ACCESSORIES } from '../js/economy.js';

const out = process.argv[2] ?? '.', SCALE = 6, GAP = 3;
const looks = [
  ...AVATAR_CHARACTERS.map(c => ({ character: c.id, outfit: 'saffron', sash: '#ee8a2a' })),
  ...AVATAR_OUTFITS.map(o => ({ character: 'young', outfit: o.id, sash: '#3a73c9' })),
  ...AVATAR_ACCESSORIES.map(a => ({ character: 'warrior', outfit: 'grey', sash: '#1d1a17', degree: 3, wear: { [a.slot]: a.id } })),
  { character: 'elder', outfit: 'golden', sash: '#1d1a17', degree: 5, wear: { head: 'hat', neck: 'mala', hand: 'staff' } },
];
const cols = 6, rows = Math.ceil(looks.length / cols);
const p = new Pix(cols * (AVATAR_W + GAP) + GAP, rows * (AVATAR_H + GAP) + GAP);
p.rect(0, 0, p.w, p.h, rgb('#f3ead9'));
looks.forEach((look, i) => drawAvatar(p, GAP + (i % cols) * (AVATAR_W + GAP), GAP + Math.floor(i / cols) * (AVATAR_H + GAP), look));

const w = p.w * SCALE, h = p.h * SCALE, raw = Buffer.alloc(h * (w * 4 + 1));
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const v = p.data[Math.floor(y / SCALE) * p.w + Math.floor(x / SCALE)], o = y * (w * 4 + 1) + 1 + x * 4;
  raw[o] = v & 255; raw[o + 1] = (v >>> 8) & 255; raw[o + 2] = (v >>> 16) & 255; raw[o + 3] = 255;
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
writeFileSync(`${out}/avatars.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('rendered', looks.length, 'monks');
