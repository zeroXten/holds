// Runs the scripted demo through the session state machine for every hold and
// level, with a simulated clock. Each should reach its target with good form,
// survive the scripted wobble, and end by itself once the figure stands up.
// Run: node tests/session.test.mjs
globalThis.window = {};
const { HOLDS } = await import('../js/holds.js');
const { DemoSource } = await import('../js/pose.js');
const { Session } = await import('../js/session.js');

let failures = 0;
for (const hold of HOLDS.filter(h => h.camera)) {
  for (let level = 1; level <= 4; level++) {
    const target = hold.levels[level - 1].target;
    const src = new DemoSource(hold, level, target);
    let t = 0;
    src.t0 = 0;
    src.now = () => t;
    const s = new Session({ hold, level, camera: true, now: 0 });
    const states = new Set();
    while (s.state !== 'done' && t < target + 120) {
      t += 1 / 30;
      s.tick(t, src.next());
      states.add(s.state);
    }
    const r = s.result;
    const ok = r && r.held >= target && r.avgForm >= 70 && r.reason === 'complete';
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${hold.id} L${level}: held ${r ? r.held.toFixed(1) : '-'}/${target}s, form ${r ? Math.round(r.avgForm) : '-'}, ${r ? Math.round(r.points) : '-'} pts, ended "${r?.reason ?? 'never'}" via ${[...states].join('→')}`);
  }
}
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
