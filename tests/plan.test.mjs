// Plans: choices, filling days to their minutes, the plan moving on, and finishing it.
// Run: node tests/plan.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const P = await import('../js/progress.js');
const { DAY_TYPES, FOCUSES, FALLBACK, RAMPS, LENGTHS, PLAN_COINS, dayBudget } = await import('../js/plans.js');
const { HOLDS, HOLD_GROUPS } = await import('../js/holds.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const fresh = () => { store.clear(); return P.load(); };
const day = i => P.addDays('2026-11-02', i);
// A finished set of a hold on a day.
const did = (s, holdId, d, held = 31) => s.history.push({ at: `${d}T12:00:00`, holdId, level: 1, held, target: 30, coins: 5, camera: true });
const doAll = (s, d) => { for (const x of s.plan.picks) for (let i = 0; i < x.sets; i++) did(s, x.holdId, d); };
const style = id => HOLDS.find(h => h.id === id).style;

{
  const keys = HOLD_GROUPS.map(g => g.key);
  check('day types use known sections', Object.values(DAY_TYPES).every(t => t.slots.every(sl => keys.includes(sl.group) && sl.sets >= 1)) && keys.every(k => FALLBACK[k]));
  check('every focus is a week of known day types', FOCUSES.every(f => f.week.length === 7 && f.week.every(t => DAY_TYPES[t])));
  check('every length has a ramp, reaching full minutes', LENGTHS.every(n => RAMPS[n]?.length === n && RAMPS[n].includes(1)));
  check('no stillness on arm days', !DAY_TYPES.arms.slots.some(sl => sl.group === 'still'));
  // A focus's own area gets three hard days.
  const count = (f, t) => focusByKey(f).week.filter(x => x === t).length;
  function focusByKey(k) { return FOCUSES.find(f => f.key === k); }
  check('a focus gets three days', count('legs', 'legs') === 3 && count('arms', 'arms') === 3 && count('core', 'core') === 3);
}

{
  const s = fresh();
  const p = P.planToday(s, day(0));
  check('a new player gets a plan set up', p.minutes === 10 && p.focus === 'balanced' && p.weeks === 2 && !p.chosen);
  check('filled from open holds only', p.picks.length > 0 && p.picks.every(x => P.isUnlocked(s, x.holdId)), p.picks.map(x => x.holdId).join());
  check('no hold twice in a day', new Set(p.picks.map(x => x.holdId)).size === p.picks.length);
  check('day 1 is legs, led by a stance with more than one set', p.picks[0].group === 'stances' && p.picks[0].sets >= 2 && p.picks[0].main);
  check('the same all day', P.planToday(s, day(0)).picks.map(x => x.holdId).join() === p.picks.map(x => x.holdId).join());

  // A missed day waits.
  P.planToday(s, day(1));
  check('a missed day doesn\'t move the plan on', s.plan.step === 0);
  did(s, s.plan.picks[0].holdId, day(1));
  P.planToday(s, day(2));
  check('doing some of a day moves the plan on', s.plan.step === 1 && s.plan.cycle[0] === 'part', JSON.stringify(s.plan.cycle));
  check('day 2 is arms', s.plan.picks[0].group === 'upper');
  doAll(s, day(2));
  P.planToday(s, day(3));
  check('a full day is marked full', s.plan.cycle[1] === 'full');
}

{
  // Days fill to their minutes, and more minutes means more holding.
  const s = fresh();
  s.unlocked = HOLDS.map(h => h.id);
  const total = minutes => { P.startPlan(s, { minutes, focus: 'balanced', weeks: 1 }, day(0)); return P.planSeconds(s, s.plan.picks); };
  const t5 = total(5), t10 = total(10), t20 = total(20);
  check('a day comes close to its minutes', Math.abs(t10 - 600) <= 60, `${t10}s for 10 min`);
  check('more minutes, more holding', t5 < t10 && t10 < t20, `${t5} ${t10} ${t20}`);
  check('no one hold takes over a day', s.plan.picks.every(x => x.sets * 30 <= 1200 * 0.4 + 1));
  check('a long day starts with 3 sets of the main hold', s.plan.picks[0].sets >= 3);
  // Easy days: soft holds, and fewer minutes.
  const easy = FOCUSES[0].week.indexOf('easy');
  check('easy days ask for less', dayBudget({ minutes: 10, focus: 'balanced', weeks: 1 }, easy) === 360);
  for (let i = 0; i < easy; i++) { doAll(s, day(i)); P.planToday(s, day(i + 1)); }
  check('easy days are soft holds only', dayType(s) === 'easy' && s.plan.picks.length && s.plan.picks.every(x => style(x.holdId) === 'soft'), s.plan.picks.map(x => x.holdId).join());
  function dayType(st) { return FOCUSES[0].week[st.plan.step % 7]; }
  // Longer plans ease in.
  check('a 4-week plan eases in', dayBudget({ minutes: 10, focus: 'balanced', weeks: 4 }, 0) === 420 && dayBudget({ minutes: 10, focus: 'balanced', weeks: 4 }, 7) === 600);
}

{
  // With more holds open, the last plan day's holds and main section get a rest.
  const s = fresh();
  s.unlocked = HOLDS.map(h => h.id);
  for (const focus of ['balanced', 'legs', 'arms', 'core']) {
    P.startPlan(s, { minutes: 15, focus, weeks: 1, chosen: true }, day(0));
    let bad = [];
    for (let i = 0; i < 7; i++) {
      const prev = s.plan.picks;
      doAll(s, day(i));
      P.planToday(s, day(i + 1));
      if (i === 6) break;
      const mains = prev.filter(x => x.main).map(x => x.group);
      bad.push(...s.plan.picks.filter(x => mains.includes(x.group) || prev.some(y => y.holdId === x.holdId)).map(x => `day ${i + 2} ${x.holdId}`));
    }
    check(`${focus}: main sections and holds get a day's rest`, !bad.length, bad.join());
  }
}

{
  // The main hold of a day is a hard one when you have one open.
  const s = fresh();
  s.unlocked = ['claws', 'drawbow', 'palms', 'post'];
  s.holds.claws = { ...P.holdState(s, 'claws'), level: 1 };  // claws would win on every other count
  P.startPlan(s, { focus: 'arms', minutes: 10, weeks: 1 }, day(0));
  const p = s.plan;
  check('arm day leads with a hard hold', p.picks[0].holdId === 'palms' && p.picks[0].main, p.picks.map(x => x.holdId).join());
}

{
  // Finishing a plan: coins for each day trained, and it waits for you to start another.
  const s = fresh();
  P.startPlan(s, { minutes: 5, focus: 'legs', weeks: 1, chosen: true }, day(0));
  const coins = s.coins;
  for (let i = 0; i < 6; i++) { if (i === 2) did(s, s.plan.picks[0].holdId, day(i)); else doAll(s, day(i)); P.planToday(s, day(i + 1)); }
  check('on the last day', s.plan.step === 6 && !s.plan.done);
  // The last day finishes the plan as soon as it's all done (via recordSession).
  const picks = s.plan.picks;
  for (const x of picks) for (let n = 0; n < x.sets; n++) {
    const last = x === picks.at(-1) && n === x.sets - 1;
    if (!last) { did(s, x.holdId, P.dayKey()); continue; }
  }
  // Recorded sessions use today's date, so line the plan up with today.
  s.plan.day = P.dayKey();
  const lastPick = picks.at(-1), h = HOLDS.find(x => x.id === lastPick.holdId);
  const o = P.recordSession(s, { holdId: h.id, level: 1, held: 200, target: 30, coins: 0, camera: false, avgForm: 0, unit: 'seconds' });
  check('the last full day finishes the plan', o.plan?.done && s.plan.done, JSON.stringify(o.plan));
  const want = 6 * PLAN_COINS.full + PLAN_COINS.part;
  check('coins for each day trained', s.plan.done.coins === want && s.coins - coins === want + o.coins, `${s.plan.done.coins} vs ${want}`);
  check('a finished plan has no holds until you start another', P.planToday(s, P.addDays(P.dayKey(), 1)).picks.length === 0);
  P.startPlan(s, { minutes: 20, focus: 'core', weeks: 4, chosen: true });
  check('going again starts from day 1', s.plan.step === 0 && !s.plan.done && s.plan.finished === 1 && s.plan.minutes === 20);
}

{
  // Plans from before plans had choices get set up afresh; bad choices fall back.
  store.clear();
  localStorage.setItem('holds.v1', JSON.stringify({ version: 2, plan: { step: 3, day: '2026-01-01', picks: [], prev: [], cycle: ['full'], weeks: 4 } }));
  const s = P.load();
  P.planToday(s, day(0));
  check('an old plan becomes a new one', s.plan.minutes === 10 && s.plan.step === 0 && !s.plan.chosen);
  P.startPlan(s, { minutes: 7, focus: 'toes', weeks: 3 });
  check('unknown choices fall back', s.plan.minutes === 10 && s.plan.focus === 'balanced' && s.plan.weeks === 2);
}

console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
