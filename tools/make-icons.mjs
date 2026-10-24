// Draws the app icons (a horse-stance figure on saffron) as SVG and PNG.
// Run: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildJoints, SEG } from '../js/figure.js';
import { holdById } from '../js/holds.js';

const j = buildJoints(holdById('horse').figure(3));
const BONES = [['neck', 'pelvis'], ['lShoulder', 'rShoulder'], ['lHip', 'rHip'], ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'],
  ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'], ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle']];
// Fit the figure into the middle of a 100x100 icon.
const xs = Object.values(j).map(p => p[0]), ys = Object.values(j).map(p => p[1]);
const minY = Math.min(...ys) - SEG.headR, w = Math.max(...xs) - Math.min(...xs);
const s = 62 / Math.max(w, -minY);
const tx = p => [50 + p[0] * s, 50 + (p[1] - minY / 2) * s];
const segs = BONES.map(([a, b]) => [tx(j[a]), tx(j[b])]);
const head = tx(j.head), headR = SEG.headR * s, stroke = 3.6 * s / 1.3;
const ground = [[18, tx([0, 0])[1] + 3], [82, tx([0, 0])[1] + 3]];
const BG = [196, 80, 29], FG = [255, 244, 228];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="rgb(${BG})"/>
<g stroke="rgb(${FG})" stroke-width="${stroke.toFixed(2)}" stroke-linecap="round" fill="none">
${segs.map(([a, b]) => `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`).join('\n')}
<circle cx="${head[0].toFixed(2)}" cy="${head[1].toFixed(2)}" r="${headR.toFixed(2)}"/>
<line x1="${ground[0][0]}" y1="${ground[0][1].toFixed(2)}" x2="${ground[1][0]}" y2="${ground[1][1].toFixed(2)}" stroke-opacity=".5"/>
</g></svg>\n`;
writeFileSync('icons/icon.svg', svg);

function segDist(px, py, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

function png(size, { rounded }) {
  const SS = 3, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let fg = 0, bg = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size) * 100, v = ((y + (sy + 0.5) / SS) / size) * 100;
        if (rounded) {
          const cx = Math.max(22, Math.min(78, u)), cy = Math.max(22, Math.min(78, v));
          if (Math.hypot(u - cx, v - cy) > 22) continue;
        }
        bg++;
        const d = Math.min(...segs.map(sg => segDist(u, v, sg)), Math.abs(Math.hypot(u - head[0], v - head[1]) - headR));
        const g = u >= 18 && u <= 82 ? Math.abs(v - ground[0][1]) : 99;
        if (d <= stroke / 2) fg++; else if (g <= stroke / 2) fg += 0.5;
      }
      const n = SS * SS, a = bg / n, f = bg ? fg / bg : 0, o = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * f);
      raw[o + 3] = Math.round(a * 255);
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

writeFileSync('icons/icon-180.png', png(180, { rounded: false }));
writeFileSync('icons/icon-192.png', png(192, { rounded: true }));
writeFileSync('icons/icon-512.png', png(512, { rounded: true }));
writeFileSync('icons/maskable-512.png', png(512, { rounded: false }));
console.log('icons written');
