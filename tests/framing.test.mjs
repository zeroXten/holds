// Auto-framing should fit the whole body between the on-screen controls with a margin, fill a good
// share of the screen, and fall back to the whole picture when nobody is seen.
// Run: node tests/framing.test.mjs
import { HOLDS } from '../js/holds.js';
import { syntheticLandmarks, standing } from '../js/figure.js';
import { AutoFrame, bodyBox } from '../js/framing.js';

let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); };

const screens = { portrait: [390, 844], landscape: [844, 390] };
const cams = { portrait: [960, 1280], landscape: [1280, 960] };
const poses = {
  standing: standing('front'),
  horse: HOLDS.find(h => h.id === 'horse').figure(4),
  plank: HOLDS.find(h => h.id === 'plank').figure(2),
  swallow: HOLDS.find(h => h.id === 'swallow').figure(4),
};

for (const [orient, [cw, ch]] of Object.entries(screens)) {
  const [vw, vh] = cams[orient];
  for (const [name, spec] of Object.entries(poses)) {
    // A small, off-centre person: as if standing far from the phone.
    const lm = syntheticLandmarks(spec, { width: vw, height: vh }).map(p => ({ ...p, x: 0.3 + (p.x - 0.5) * 0.45, y: 0.55 + (p.y - 0.5) * 0.45 }));
    const f = new AutoFrame();
    let view;
    // Roughly the timer and form-meter heights in each orientation.
    const inset = orient === 'portrait' ? { top: 150, bottom: 110 } : { top: 100, bottom: 80 };
    for (let i = 0; i < 120; i++) view = f.update(1 / 30, { landmarks: lm, width: vw, height: vh }, cw, ch, true, inset);
    const box = bodyBox(lm, vw, vh, true);
    const left = view.tx + view.s * box.x, right = left + view.s * box.w;
    const top = view.ty + view.s * box.y, bottom = top + view.s * box.h;
    const inside = left >= 0 && right <= cw && top >= inset.top - 1 && bottom <= ch - inset.bottom + 1;
    const fill = Math.max((right - left) / cw, (bottom - top) / (ch - inset.top - inset.bottom));
    const fit = Math.min(cw / vw, ch / vh);
    check(`${orient} ${name}`, inside && (fill >= 0.5 || view.s >= fit * 3.49),
      `zoom ${(view.s / fit).toFixed(2)}x, body fills ${Math.round(fill * 100)}%, ${inside ? 'fully on screen' : 'CUT OFF'}`);
  }
}

// Nobody in view: ease back to showing the whole picture.
{
  const [cw, ch] = screens.portrait, [vw, vh] = cams.portrait;
  const f = new AutoFrame();
  const lm = syntheticLandmarks(poses.standing, { width: vw, height: vh });
  for (let i = 0; i < 60; i++) f.update(1 / 30, { landmarks: lm, width: vw, height: vh }, cw, ch, true);
  let view;
  for (let i = 0; i < 300; i++) view = f.update(1 / 30, { landmarks: null, width: vw, height: vh }, cw, ch, true);
  const fit = Math.min(cw / vw, ch / vh);
  check('no body', Math.abs(view.s - fit) < fit * 0.01, `zoom ${(view.s / fit).toFixed(2)}x after 10s with nobody seen`);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
