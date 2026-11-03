// Plans: templates, filling slots from your holds, and the cycle moving on.
// Run: node tests/plan.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const P = await import('../js/progress.js');
const { PLANS, FALLBACK } = await import('../js/plans.js');
const { HOLDS, HOLD_GROUPS } = await import('../js/holds.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const fresh = () => { store.clear(); return P.load(); };
const day = i => P.addDays('2026-11-02', i);
// A finished set of a hold on a day.
const did = (s, holdId, d) => s.history.push({ at: `${d}T12:00:00`, holdId, level: 1, held: 31, target: 30, coins: 5, camera: true });

{
  const keys = HOLD_GROUPS.map(g => g.key);
  const ok = PLANS.every(p => p.days.length === 7 && P.RANKS.some(r => r.key === p.from)
    && p.days.every(d => d.slots.every(sl => keys.includes(sl.group) && sl.sets >= 1)));
  check('every plan has 7 days of known sections', ok && keys.every(k => FALLBACK[k]));
}

{
  const s = fresh();
  const p = P.planToday(s, day(0));
  check('a new player gets the Foundation plan', P.planFor(s).key === 'foundation');
  check('filled from open holds only', p.picks.length > 0 && p.picks.every(x => P.isUnlocked(s, x.holdId)), p.picks.map(x => x.holdId).join());
  check('no hold twice in a day', new Set(p.picks.map(x => x.holdId)).size === p.picks.length);
  check('day 1 is legs, with 2 sets of a stance', p.picks[0].group === 'stances' && p.picks[0].sets === 2);
  const again = P.planToday(s, day(0)).picks.map(x => x.holdId).join();
  check('the same all day', again === p.picks.map(x => x.holdId).join());

  // A missed day waits.
  P.planToday(s, day(1));
  check('a missed day doesn\'t move the plan on', s.plan.step === 0);
  // Training some of it moves it on the next day, avoiding yesterday's holds where it can.
  const yesterday = s.plan.picks.map(x => x.holdId);
  did(s, yesterday[0], day(1));
  P.planToday(s, day(2));
  check('doing some of a day moves the plan on', s.plan.step === 1 && s.plan.cycle[0] === 'part', JSON.stringify(s.plan.cycle));
  check('day 2 is arms', s.plan.picks[0].group === 'upper');
  // A whole day done is marked full.
  for (const x of s.plan.picks) for (let i = 0; i < x.sets; i++) did(s, x.holdId, day(2));
  P.planToday(s, day(3));
  check('a full day is marked full', s.plan.cycle[1] === 'full');
  // Seven days make a week.
  for (let i = 3; i < 8; i++) { did(s, s.plan.picks[0].holdId, day(i)); P.planToday(s, day(i + 1)); }
  check('seven days make a week', s.plan.weeks === 1 && s.plan.step === 0 && s.plan.cycle.length === 0, JSON.stringify(s.plan));
}

{
  // With more holds open, the hold done on the last plan day is skipped.
  const s = fresh();
  s.unlocked = HOLDS.map(h => h.id);
  P.planToday(s, day(0));
  const legs = s.plan.picks[0].holdId;
  for (const x of s.plan.picks) did(s, x.holdId, day(0));
  for (let i = 1; i < 4; i++) { P.planToday(s, day(i)); for (const x of s.plan.picks) did(s, x.holdId, day(i)); }
  P.planToday(s, day(4));  // the next legs day
  check('yesterday\'s holds are avoided', !s.plan.picks.some(x => s.plan.prev.includes(x.holdId)));
  check('legs days spread over different stances', s.plan.picks[0].group === 'stances', `${legs} then ${s.plan.picks[0].holdId}`);
}

{
  // No section's main work two days running (the week wraps round), and hard days stay on theme.
  const main = d => d.slots.find(sl => sl.sets > 1)?.group;
  const bad = PLANS.flatMap(p => p.days.map((d, i) => [p.key, d, p.days[(i + 1) % 7]])
    .filter(([, d, next]) => main(d) && next.slots.some(sl => sl.group === main(d))).map(([k, d]) => `${k} ${d.name}`));
  check('main work gets a day to recover', !bad.length, bad.join());
  const upper = PLANS.flatMap(p => p.days.filter(d => main(d) === 'upper')).some(d => d.slots.some(sl => sl.group === 'still'));
  check('no stillness on arm days', !upper);
}

{
  // The main hold of a day is a hard one when you have one open.
  const s = fresh();
  s.unlocked = ['claws', 'drawbow', 'palms', 'post'];
  s.holds.claws = { ...P.holdState(s, 'claws'), level: 1 };  // claws would win on every other count
  s.plan = { step: 1 };
  const p = P.planToday(s, day(0));
  const style = id => HOLDS.find(h => h.id === id).style;
  check('arm day leads with a hard hold', p.picks[0].holdId === 'palms' && style(p.picks[1].holdId) === 'soft' && p.picks[1].group === 'upper', p.picks.map(x => x.holdId).join());
}

{
  // Plans grow with the sash.
  const s = fresh();
  for (const id of ['horse', 'bow', 'cat']) s.holds[id] = { ...P.holdState(s, id), level: 4 };  // 9 points: green
  check('green sash: the Steady plan', P.sashRank(s).key === 'green' && P.planFor(s).key === 'steady');
}

console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
