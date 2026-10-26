// Renders Robo Monk in a few poses to PNG, for checking the artwork.
// Run: node tools/render-robot.mjs <out-dir>
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix } from '../js/pixel.js';
import { drawRobot, hallBackground } from '../js/robot.js';
import { buildJoints, standing } from '../js/figure.js';
import { HOLDS } from '../js/holds.js';

const out = process.argv[2] ?? '.', W = 130, H = 210, SCALE = 4;

function png(p) {
  const w = p.w * SCALE, h = p.h * SCALE, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = p.data[Math.floor(y / SCALE) * p.w + Math.floor(x / SCALE)], o = y * (w * 4 + 1) + 1 + x * 4;
    raw[o] = v & 255; raw[o + 1] = (v >>> 8) & 255; raw[o + 2] = (v >>> 16) & 255; raw[o + 3] = 255;
  }
  const t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Figure joints (y up from the ground) → robot points in art pixels.
function joints(spec) {
  const j = buildJoints(spec), s = 1.7, cx = W / 2, gy = H - 14;
  const at = k => ({ x: cx + j[k][0] * s, y: gy + j[k][1] * s });
  return { ls: at('lShoulder'), rs: at('rShoulder'), le: at('lElbow'), re: at('rElbow'), lw: at('lWrist'), rw: at('rWrist'),
    lh: at('lHip'), rh: at('rHip'), lk: at('lKnee'), rk: at('rKnee'), la: at('lAnkle'), ra: at('rAnkle'), head: at('head') };
}

const handsUp = { ...standing('front'), arms: { L: [175, 178], R: [-175, -178] } };
const poses = {
  standing: [standing('front'), 'normal'], 'hands-up': [handsUp, 'happy'],
  horse: [HOLDS.find(h => h.id === 'horse').figure(3), 'normal'], 'arms-wide': [HOLDS.find(h => h.id === 'horse').figure(4), 'happy'],
  'side-on': [standing('side'), 'normal', 1], 'half-turned': [standing('front'), 'normal', 0.5],
};
for (const [name, [spec, mood, turn = 0]] of Object.entries(poses)) {
  const p = new Pix(W, H);
  p.data.set(hallBackground(W, H));
  drawRobot(p, { ...joints(spec), turn }, 1.3, mood);
  writeFileSync(`${out}/robot-${name}.png`, png(p));
}
console.log('rendered', Object.keys(poses).length);
