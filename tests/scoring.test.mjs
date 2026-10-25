// Every hold's own stick figure should pass its criteria, and standing upright
// should not. Run: node tests/scoring.test.mjs
import { HOLDS } from '../js/holds.js';
import { syntheticLandmarks, standing } from '../js/figure.js';
import { makeBody, scorePose } from '../js/scoring.js';

let failures = 0;
const W = 720, H = 1280;
const score = (hold, level, spec, noise = 0) => scorePose(hold, level, makeBody(syntheticLandmarks(spec, { width: W, height: H, noise }), W, H));

for (const hold of HOLDS.filter(h => h.camera)) {
  for (let level = 1; level <= 4; level++) {
    const r = score(hold, level, hold.figure(level));
    const noisy = score(hold, level, hold.figure(level), 0.004);
    const stand = score(hold, level, standing(hold.view));
    const ok = r.score >= 90 && noisy.score >= 75 && stand.score < 50;
    if (!ok) failures++;
    const weak = r.results.filter(x => x.s < 1).map(x => `${x.id}=${x.value.toFixed(2)}`).join(' ');
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${hold.id} L${level}: figure ${r.score} noisy ${noisy.score} standing ${stand.score} ${weak}`);
  }
  // A deeper level's figure should also pass easier levels (some holds' levels change the position, e.g. knees to straight legs, rather than deepening it).
  if (['post', 'plank', 'squat', 'sideplank', 'hollow'].includes(hold.id)) continue;
  const r = score(hold, 1, hold.figure(4));
  if (r.score < 90) { failures++; console.log(`FAIL ${hold.id}: L4 figure scores ${r.score} at L1`); }
}
// Levels must actually get harder: an easier level's pose shouldn't pass the next level.
for (const id of ['horse', 'bow', 'cat', 'crane', 'drop', 'swallow', 'kick', 'sideplank', 'hollow', 'squat']) {
  const hold = HOLDS.find(h => h.id === id);
  for (let level = 1; level < 4; level++) {
    const r = score(hold, level + 1, hold.figure(level));
    const ok = r.score < 90;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: L${level} pose at L${level + 1} scores ${r.score}`);
  }
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

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
