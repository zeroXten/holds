// Every hold's own stick figure should pass its criteria, and standing upright
// should not. Run: node tests/scoring.test.mjs
import { HOLDS, HOLD_GROUPS } from '../js/holds.js';
import { syntheticLandmarks, standing } from '../js/figure.js';
import { makeBody, scorePose, SwayMeter } from '../js/scoring.js';

let failures = 0;
const W = 720, H = 1280;
const score = (hold, level, spec, noise = 0) => scorePose(hold, level, makeBody(syntheticLandmarks(spec, { width: W, height: H, noise }), W, H));

for (const hold of HOLDS.filter(h => h.camera)) {
  for (let level = 1; level <= 4; level++) {
    const r = score(hold, level, hold.figure(level));
    const noisy = score(hold, level, hold.figure(level), 0.004);
    const stand = score(hold, level, standing(hold.view));
    // Standing Meditation's position is simply standing: only its stillness is judged.
    const ok = r.score >= 90 && noisy.score >= 75 && (stand.score < 50 || hold.id === 'wuji');
    if (!ok) failures++;
    const weak = r.results.filter(x => x.s < 1).map(x => `${x.id}=${x.value.toFixed(2)}`).join(' ');
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${hold.id} L${level}: figure ${r.score} noisy ${noisy.score} standing ${stand.score} ${weak}`);
  }
  // A deeper level's figure should also pass easier levels (some holds' levels change the position, e.g. knees to straight legs, rather than deepening it).
  if (['post', 'plank', 'squat', 'sideplank', 'hollow', 'weituo', 'stars', 'sky'].includes(hold.id)) continue;
  const r = score(hold, 1, hold.figure(4));
  if (r.score < 90) { failures++; console.log(`FAIL ${hold.id}: L4 figure scores ${r.score} at L1`); }
}
// Levels must actually get harder: an easier level's pose shouldn't pass the next level.
for (const id of ['horse', 'bow', 'cat', 'crane', 'drop', 'swallow', 'kick', 'sideplank', 'hollow', 'squat', 'feet']) {
  const hold = HOLDS.find(h => h.id === id);
  for (let level = 1; level < 4; level++) {
    const r = score(hold, level + 1, hold.figure(level));
    const ok = r.score < 90;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: L${level} pose at L${level + 1} scores ${r.score}`);
  }
}

// The arm holds look alike to the camera in places; each one's pose must fail the others.
for (const [a, b] of [['tray', 'claws'], ['claws', 'tray'], ['wings', 'palms'], ['palms', 'wings'], ['wings', 'drawbow'], ['drawbow', 'wings']]) {
  const ha = HOLDS.find(h => h.id === a), hb = HOLDS.find(h => h.id === b);
  const r = score(hb, 1, ha.figure(1));
  const ok = r.score < 50;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${a} pose as ${b} scores ${r.score}`);
}

// Every hold appears in exactly one home screen group.
{
  const grouped = HOLD_GROUPS.flatMap(g => g.ids);
  const ok = grouped.length === HOLDS.length && HOLDS.every(h => grouped.includes(h.id));
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} hold groups cover every hold once`);
}

// Sway: tracking jitter on a still body reads well inside the stillest limit; a gentle
// sway of about 3% of the picture each way doesn't.
{
  const wuji = HOLDS.find(h => h.id === 'wuji');
  const limit = wuji.criteria(4).find(c => c.id === 'still').max;
  const sway = wobble => {
    const m = new SwayMeter();
    let v = 0;
    for (let i = 0; i < 120; i++) {
      const dx = wobble * Math.sin(i / 30 * Math.PI);  // one sway every 2s at 30 fps
      const lm = syntheticLandmarks(wuji.figure(1), { width: W, height: H, noise: 0.002 }).map(p => ({ ...p, x: p.x + dx }));
      v = m.update(makeBody(lm, W, H), 1 / 30);
    }
    return v;
  };
  const still = sway(0), wobbly = sway(0.03);
  const ok = still < limit * 0.5 && wobbly > limit;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} sway: still ${still.toFixed(3)}, swaying ${wobbly.toFixed(3)} (stillest limit ${limit})`);
}

// A sagging iron bridge (hips dropped ~15°) should fail.
{
  const hold = HOLDS.find(h => h.id === 'bridge');
  const spec = hold.figure(4);
  const sag = { ...spec, torso: spec.torso - 15, legs: { L: [spec.legs.L[0] + 15, spec.legs.L[1] + 15], R: [spec.legs.R[0] + 15, spec.legs.R[1] + 15] } };
  const r = score(hold, 4, sag);
  const cue = r.results.find(x => x.id === 'line').cue;
  const ok = r.score < 50 && cue === 'Lift your hips';
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} bridge: sagging scores ${r.score}, cue "${cue}"`);
}

// Holding Up the Sky's start position with realistic hands: fingers linked in front of
// the belly leave the wrists a good way apart (here 0.5 shoulder widths), which must pass;
// arms hanging at the sides must not.
{
  const hold = HOLDS.find(h => h.id === 'sky');
  const low = { criteria: hold.flow.low, sides: false };
  const lm = syntheticLandmarks(hold.flow.lowFigure(1), { width: W, height: H });
  const sw = Math.abs(lm[11].x - lm[12].x), cx = (lm[11].x + lm[12].x) / 2;
  const spread = (k) => lm.map((p, i) => ([15, 17, 19, 21].includes(i) ? { ...p, x: cx + sw * k / 2 } : [16, 18, 20, 22].includes(i) ? { ...p, x: cx - sw * k / 2 } : p));
  const linked = scorePose(low, 1, makeBody(spread(0.5), W, H)).score;
  const apart = scorePose(low, 1, makeBody(spread(0.7), W, H)).score;
  const hanging = scorePose(low, 1, makeBody(syntheticLandmarks(standing('front'), { width: W, height: H }), W, H)).score;
  // Overhead: arms straight up at shoulder width (the natural push) must pass.
  const highLm = syntheticLandmarks(hold.figure(1), { width: W, height: H });
  const hsw = Math.abs(highLm[11].x - highLm[12].x), hcx = (highLm[11].x + highLm[12].x) / 2;
  const up = highLm.map((p, i) => ([15, 17, 19, 21].includes(i) ? { ...p, x: hcx + hsw / 2 } : [16, 18, 20, 22].includes(i) ? { ...p, x: hcx - hsw / 2 } : p));
  const overhead = scorePose({ criteria: hold.criteria, sides: false }, 1, makeBody(up, W, H)).score;
  console.log(`     sky overhead with hands shoulder-width apart: ${overhead}`);
  const ok = linked >= 85 && apart >= 70 && hanging < 50 && overhead >= 85;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} sky start position: wrists 0.5 apart ${linked}, 0.7 apart ${apart}, arms hanging ${hanging}`);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
