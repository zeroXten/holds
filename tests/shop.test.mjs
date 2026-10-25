// Shop logic: rest days, freezes, repairs, bets, level test-out and the temple.
// Run: node tests/shop.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const P = await import('../js/progress.js');
const E = await import('../js/economy.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const fresh = (coins = 500) => { store.clear(); const s = P.load(); s.coins = coins; return s; };
const train = (s, ...days) => { for (const d of days) s.days[d] = { coins: 5, time: 30, sessions: 1 }; };

// Prices go rest day < freeze < repair.
check('price order', E.REST_DAY_PRICE < E.FREEZE_PRICE && E.FREEZE_PRICE < E.REPAIR_PRICE_PER_DAY);

// Streaks: covered days bridge but don't count.
{
  const s = fresh();
  train(s, '2026-10-20', '2026-10-21', '2026-10-23');
  s.streak.covered['2026-10-22'] = 'rest';
  check('rest day bridges streak', P.streak(s, '2026-10-23') === 3, `streak ${P.streak(s, '2026-10-23')}`);
}

// Rest days: planned ahead only, weekly cap, refund on cancel.
{
  const s = fresh(100);
  const today = '2026-10-26';  // a Monday
  check('no rest day today', P.planRest(s, today, today) === false);
  check('plan tomorrow', P.planRest(s, '2026-10-27', today) && s.coins === 100 - E.REST_DAY_PRICE);
  check('plan second this week', P.planRest(s, '2026-10-29', today));
  check('third this week blocked', P.planRest(s, '2026-10-30', today) === false, P.restBlocker(s, '2026-10-30', today));
  check('next week allowed', P.planRest(s, '2026-11-02', today));
  check('more than a week ahead blocked', P.planRest(s, '2026-11-04', today) === false);
  check('cancel refunds', P.cancelRest(s, '2026-10-29', today) && s.coins === 100 - 2 * E.REST_DAY_PRICE);
}

// Freezes: bought up to the max, used automatically on missed days.
{
  const s = fresh(100);
  train(s, '2026-10-20', '2026-10-21', '2026-10-22');
  check('buy freeze', P.buyFreeze(s) && P.buyFreeze(s) && !P.buyFreeze(s) && s.streak.freezes === 2);
  P.protectStreak(s, '2026-10-24');  // missed the 23rd
  check('freeze used on missed day', s.streak.covered['2026-10-23'] === 'freeze' && s.streak.freezes === 1 && P.streak(s, '2026-10-24') === 3);
  check('freeze notice', s.notices.some(n => n.includes('3-day streak')));
  P.protectStreak(s, '2026-10-24');
  check('no double spend', s.streak.freezes === 1);
}

// Not enough freezes: offered a repair priced per missed day, within the window.
{
  const s = fresh(200);
  train(s, '2026-10-18', '2026-10-19', '2026-10-20');
  P.protectStreak(s, '2026-10-23');  // missed 21st and 22nd, no freezes
  const b = s.streak.broken;
  check('repair offered', b && b.streak === 3 && b.missed.length === 2 && b.price === 2 * E.REPAIR_PRICE_PER_DAY, JSON.stringify(b));
  check('repair restores streak', P.repairStreak(s) && P.streak(s, '2026-10-23') === 3 && s.coins === 200 - b.price);
  const late = fresh(200);
  train(late, '2026-10-18');
  P.protectStreak(late, '2026-10-24');  // 5 missed days: too late
  check('no repair after the window', late.streak.broken === null);
}

// Bets: stake taken on placing, progress only from then, won or lost on time.
{
  const s = fresh(100);
  const today = P.dayKey();
  s.unlocked.push('crane');
  check('place bet', P.placeBet(s, 'holds3', today) && s.coins === 90);
  check('one bet at a time', !P.placeBet(s, 'time10', today));
  for (const holdId of ['horse', 'bow', 'crane']) {
    P.recordSession(s, { holdId, level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  }
  check('bet won after 3 holds', s.bet === null && s.coins === 90 + 25, `coins ${s.coins}`);
  check('no second bet the same day', !P.placeBet(s, 'form90', today) && P.betBlocker(s, 'form90', today).startsWith('One bet a day'));
  check('a new bet the next day', P.placeBet(s, 'form90', P.addDays(today, 1)));
  check('bet logged', s.betLog[0]?.result === 'won' && s.betLog[0].payout === 25 && s.lifetime >= 25);

  const t = fresh(100);
  P.placeBet(t, 'time10', '2026-10-20');
  P.settleBet(t, '2026-10-21');
  check('daily bet lost next day', t.bet === null && t.coins === 85 && t.notices.some(n => n.startsWith('Bet lost')));

  const u = fresh(100);
  P.placeBet(u, 'streak7', '2026-10-20');
  u.bet.days.push('2026-10-20');
  P.settleBet(u, '2026-10-22');  // missed the 21st
  check('unbroken week lost on a missed day', u.bet === null);
}

// Level test-out: pass to jump a level for free; fail and pay.
{
  const s = fresh(100);
  const o = P.recordSession(s, { holdId: 'horse', level: 2, test: true, held: 46, target: 45, coins: 0, avgForm: 85, camera: true, reached: true });
  check('test passed', o.test.passed && P.holdState(s, 'horse').level === 2 && s.coins === 100 + o.coins);
  const before = s.coins;
  const f = P.recordSession(s, { holdId: 'horse', level: 3, test: true, held: 20, target: 60, coins: 0, avgForm: 85, camera: true, reached: false });
  check('test failed costs coins', !f.test.passed && P.holdState(s, 'horse').level === 2 && s.coins === before - E.testPrice(3) + f.coins);
}

// Temple: buy items and themes once.
{
  const s = fresh(300);
  check('buy item', P.buyTempleItem(s, 'path') && P.owns(s, 'path') && s.coins === 275);
  check('no double buy', !P.buyTempleItem(s, 'path'));
  check('too expensive', !P.buyTempleItem(s, 'pagoda'));
  check('buy theme switches to it', P.buyTheme(s, 'night') && s.temple.theme === 'night' && P.useTheme(s, 'dawn') && s.temple.theme === 'dawn');
}

// Streak milestones: paid once per streak, with a free freeze at 1 week.
{
  const s = fresh(0);
  const today = P.dayKey();
  for (let i = 6; i >= 1; i--) train(s, P.addDays(today, -i));
  const o = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  check('1-week milestone', o.milestones.length === 1 && o.milestones[0].days === 7 && s.streak.freezes === 1 && s.coins === 20, JSON.stringify(o.milestones));
  const again = P.recordSession(s, { holdId: 'bow', level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  check('paid once per streak', again.milestones.length === 0 && s.coins === 20);
  check('next milestone', P.nextMilestone(s, today).days === 14);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
