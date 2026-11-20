// The donation box: a teaching a day after training, picked to suit the day.
// Run: node tests/teachings.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const P = await import('../js/progress.js');
const { TEACHINGS, KINDS } = await import('../js/teachings.js');
const { HOLDS } = await import('../js/holds.js');
const { TEACHING_PRICE } = await import('../js/economy.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const fresh = () => { store.clear(); return P.load(); };
const day = i => P.addDays('2026-11-02', i);
const did = (s, holdId, d, extra = {}) => s.history.push({ at: `${d}T12:00:00`, holdId, level: 1, held: 40, target: 30, avgForm: 80, coins: 5, camera: true, ...extra });

{
  const ids = TEACHINGS.map(t => t.id);
  check('every teaching has its own id', new Set(ids).size === ids.length);
  check('technique is for real holds', TEACHINGS.filter(t => t.kind === 'technique').every(t => HOLDS.some(h => h.id === t.hold)));
  check('every technique form check is one the hold has', TEACHINGS.filter(t => t.crit).every(t => {
    const h = HOLDS.find(x => x.id === t.hold);
    return [1, 2, 3, 4].some(l => h.criteria(l).some(c => c.id === t.crit));
  }), TEACHINGS.filter(t => t.crit && ![1, 2, 3, 4].some(l => HOLDS.find(x => x.id === t.hold).criteria(l).some(c => c.id === t.crit))).map(t => t.id).join());
  check('every kind is known', TEACHINGS.every(t => KINDS.some(k => k.key === t.kind)));
  check('at least 250 to start', TEACHINGS.length >= 250, `${TEACHINGS.length}`);
}

{
  const s = fresh();
  s.coins = 100;
  check('nothing before training', P.teachingStatus(s, day(0)) === 'train' && !P.receiveTeaching(s, day(0)));
  did(s, 'horse', day(0));
  check('ready once trained', P.teachingStatus(s, day(0)) === 'ready');
  const t = P.receiveTeaching(s, day(0));
  check('the first is the welcome', t?.when === 'first' && s.coins === 100 - TEACHING_PRICE);
  check('one a day', P.teachingStatus(s, day(0)) === 'given' && !P.receiveTeaching(s, day(0)) && P.todaysTeaching(s, day(0)).id === t.id);
  did(s, 'horse', day(1), { fault: 'knees' });
  const t2 = P.receiveTeaching(s, day(1));
  check('technique for the form check that slipped', t2?.hold === 'horse' && t2.crit === 'knees', t2?.id);
  did(s, 'horse', day(2));
  const t3 = P.receiveTeaching(s, day(2));
  check('then wisdom', t3 && t3.kind !== 'technique' && !t3.when, t3?.id);
  did(s, 'horse', day(4));
  const t4 = P.receiveTeaching(s, day(4));
  check('back after a gap', t4?.when === 'return', t4?.id);
  s.coins = 2; did(s, 'horse', day(5));
  check('not without the coins', P.teachingStatus(s, day(5)) === 'coins' && !P.receiveTeaching(s, day(5)));
  P.starTeaching(s, t2.id);
  check('starring', s.teachings.starred.includes(t2.id));
  P.starTeaching(s, t2.id);
  check('and unstarring', !s.teachings.starred.includes(t2.id));
}

{
  // Never the same one twice until they've all been had, then the longest ago.
  const s = fresh();
  s.coins = 1e6;
  s.unlocked = HOLDS.map(h => h.id);
  const seen = new Set();
  let repeat = null;
  const total = TEACHINGS.filter(t => !t.when).length;
  for (let i = 0; i < total + 3; i++) {
    did(s, HOLDS[i % HOLDS.length].id, day(i));
    const t = P.receiveTeaching(s, day(i));
    if (!t) { repeat = `none on day ${i}`; break; }
    if (seen.has(t.id) && i < total) { repeat = `${t.id} on day ${i}`; break; }
    seen.add(t.id);
  }
  check('no repeats until every teaching is had', !repeat, repeat ?? '');
  check('then they come round again', s.teachings.order.length >= total);
}

console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
