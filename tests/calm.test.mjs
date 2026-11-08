// The calm view's timing: when it fades in, what brings the full screen back, and the breath.
import { calmStep, breathAt, CALM } from '../js/calm.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('FAIL', msg); } };

const thr = { start: 70, hold: 50 };
const frame = (o = {}) => ({ state: 'holding', score: 90, sideHeld: 20, sideTarget: 60, sideReached: false, canSwitch: false, ...o });
const run = (st, v, secs, opts = { camera: true, thr }) => { let on; for (let t = 0; t < secs; t += 0.1) on = calmStep(st, v, 0.1, opts); return on; };

{
  const st = {};
  ok(!run(st, frame(), CALM.settle - 0.5), 'not calm before settling');
  ok(run(st, frame(), 1), 'calm once steady for the settle time');
  ok(!calmStep(st, frame({ score: 40 }), 0.1, { camera: true, thr }), 'poor form brings the full screen back at once');
  ok(!run(st, frame(), CALM.settle - 0.5), 'has to settle again after slipping');
}
{
  const st = {};
  run(st, frame(), CALM.settle + 1);
  ok(calmStep(st, frame({ score: 60 }), 0.1, { camera: true, thr }), 'a brief so-so moment keeps the calm view');
  ok(!run(st, frame({ score: 60 }), CALM.slip + 0.2), 'so-so form that lasts brings the full screen back');
}
{
  const st = {};
  run(st, frame(), CALM.settle + 1);
  ok(!calmStep(st, frame({ state: 'broken' }), 0.1, { camera: true, thr }), 'leaving the hold ends it');
  const st2 = {};
  run(st2, frame(), CALM.settle + 1);
  ok(!calmStep(st2, frame({ sideReached: true, canSwitch: true, sideHeld: 60 }), 0.1, { camera: true, thr }), 'time to switch sides shows the full screen');
  ok(!run({}, frame({ state: 'paused' }), 10), 'never calm while paused');
}
{
  ok(run({}, frame({ score: 0 }), CALM.settle + 1, { camera: false, thr }), 'without the camera, holding is enough');
}
{
  const st = {};
  run(st, frame({ sideHeld: 10 }), CALM.settle + 1);
  ok(!st.peek, 'no peek early in the hold');
  calmStep(st, frame({ sideHeld: 31 }), 0.1, { camera: true, thr });
  ok(st.peek, 'peeks at halfway');
  calmStep(st, frame({ sideHeld: 40 }), 0.1, { camera: true, thr });
  ok(!st.peek, 'peek ends after a few seconds');
  calmStep(st, frame({ sideHeld: 55 }), 0.1, { camera: true, thr });
  ok(st.peek, 'peeks for the last stretch');
  calmStep(st, frame({ sideHeld: 70, sideReached: true }), 0.1, { camera: true, thr });
  ok(!st.peek, 'bonus time after the target stays calm');
}
{
  ok(breathAt(0).inhale && breathAt(0).k < 0.01, 'a breath starts empty');
  ok(Math.abs(breathAt(CALM.breath * CALM.inhale - 0.001).k - 1) < 0.01, 'full at the top of the in-breath');
  ok(!breathAt(CALM.breath * 0.7).inhale, 'then breathes out');
  ok(breathAt(CALM.breath - 0.001).k < 0.01, 'and empties by the end');
  ok(60 / CALM.breath >= 5 && 60 / CALM.breath <= 7, 'about six breaths a minute');
}

console.log(`calm: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
