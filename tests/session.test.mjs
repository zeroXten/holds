// Runs the scripted demo through the session state machine for every hold and
// level, with a simulated clock. Each should reach its target with good form,
// survive the scripted wobble, and end by itself once the figure stands up.
// Run: node tests/session.test.mjs
globalThis.window = {};
const { HOLDS } = await import('../js/holds.js');
const { DemoSource } = await import('../js/pose.js');
const { Session } = await import('../js/session.js');
const { createSession, FlowSession } = await import('../js/flow.js');

let failures = 0;
for (const hold of HOLDS.filter(h => h.camera)) {
  for (let level = 1; level <= 4; level++) {
    const target = hold.levels[level - 1].target;
    const src = new DemoSource(hold, level, target);
    let t = 0;
    src.t0 = 0;
    src.now = () => t;
    const s = createSession({ hold, level, camera: true, now: 0 });
    const states = new Set();
    while (s.state !== 'done' && t < (hold.flow ? 400 : target + 120)) {
      t += 1 / 30;
      s.tick(t, src.next());
      states.add(s.state);
    }
    const r = s.result;
    // One-sided holds: each side reaches its own target and earns bonus time.
    const sidesOk = !hold.sides || (r?.sides?.length === 2 && r.sides.every(t => t > target / 2));
    const ok = r && r.reached && r.held >= target && r.avgForm >= 70 && r.reason === 'complete' && sidesOk;
    if (!ok) failures++;
    const sides = r?.sides ? ` (${r.sides.map(t => t.toFixed(1)).join(' + ')})` : '';
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${hold.id} L${level}: held ${r ? r.held.toFixed(1) : '-'}${sides}/${target}s, form ${r ? Math.round(r.avgForm) : '-'}, ${r ? Math.round(r.coins * 10) / 10 : "-"} coins, ended "${r?.reason ?? 'never'}" via ${[...states].join('→')}`);
  }
}
// Honour mode, one-sided: hold past side one's target, tap Switch, then side two.
{
  const hold = HOLDS.find(h => h.id === 'rest');
  const s = new Session({ hold, level: 1, camera: false, now: 0 });
  let t = 0;
  const run = secs => { for (const end = t + secs; t < end;) { t += 1 / 30; s.tick(t, null); } };
  run(5 + 14);             // countdown, then 14s on side one (target 10s)
  const bonusOne = s.view().sideReached;
  s.switchNow();
  run(5 + 12);             // switch countdown, then 12s on side two
  const r = s.finish('stopped');
  const ok = bonusOne && r.reached && r.sides[0] > 13 && r.sides[1] > 11;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} honour rest L1: sides ${r.sides.map(x => x.toFixed(1)).join(' + ')}, reached ${r.reached}`);
}

// Giving up on side one early still moves on to side two.
{
  const hold = HOLDS.find(h => h.id === 'crane');
  const { syntheticLandmarks, standing } = await import('../js/figure.js');
  const s = new Session({ hold, level: 1, camera: true, now: 0 });
  const pose = { landmarks: syntheticLandmarks(hold.figure(1)), width: 720, height: 1280 };
  const stand = { landmarks: syntheticLandmarks(standing('side')), width: 720, height: 1280 };
  let t = 0;
  const run = (secs, frame) => { for (const end = t + secs; t < end;) { t += 1 / 30; s.tick(t, frame); } };
  run(8, pose);            // 8s of side one (target 15s)
  run(12, stand);          // give up
  const switched = s.state === 'switch' || s.sideIndex === 1;
  run(20, pose);           // side two, past its target
  const r = s.finish('stopped');
  const ok = switched && s.sideIndex === 1 && !r.reached && r.sides[1] > 15;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} crane give-up: sides ${r.sides.map(x => x.toFixed(1)).join(' + ')}, reached ${r.reached}`);
}

// Flowing holds: cycles that are too quick don't count.
{
  const hold = HOLDS.find(h => h.id === 'sky');
  const { syntheticLandmarks, lerpSpec } = await import('../js/figure.js');
  const low = hold.flow.lowFigure(2), high = hold.figure(2);
  const s = new FlowSession({ hold, level: 2, camera: true, now: 0 });
  let t = 0;
  const run = (secs, spec) => { const f = { landmarks: syntheticLandmarks(spec), width: 720, height: 1280 }; for (const end = t + secs; t < end;) { t += 1 / 30; s.tick(t, f); } };
  run(2, low);                                  // ready in the start position
  for (let i = 0; i < 2; i++) { run(1, lerpSpec(low, high, 0.5)); run(1.3, high); run(1, low); }  // 3.3s cycles: too quick
  const quick = s.count;
  for (let i = 0; i < 2; i++) { run(3, lerpSpec(low, high, 0.5)); run(2, high); run(3, low); }  // 8s cycles: count
  const ok = quick === 0 && s.count === 2;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} sky: quick cycles counted ${quick}, slow cycles counted ${s.count - quick}`);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
