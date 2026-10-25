// The coin economy: earning rates, bonus tiers, hold of the day, unlocking
// holds and converting old points-based progress.
// Run: node tests/economy.test.mjs
globalThis.window = {};
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { HOLDS } = await import('../js/holds.js');
const { Session } = await import('../js/session.js');
const { bonusTier, STARTER_HOLDS, UNLOCK_PRICES, DAILY_MULT } = await import('../js/economy.js');
const P = await import('../js/progress.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

// Honour-mode session, held for `secs` seconds after the 5s countdown.
function honour(holdId, level, secs, opts = {}) {
  const hold = HOLDS.find(h => h.id === holdId);
  const s = new Session({ hold, level, camera: false, now: 0, ...opts });
  let t = 0;
  for (const end = 5 + secs; t < end;) { t += 1 / 30; s.tick(t, null); }
  return s.finish('stopped');
}

// Bonus tiers
check('tier before target', bonusTier(29, 30).tier === 0);
check('tier 1 at target', bonusTier(30, 30).tier === 1 && bonusTier(30, 30).mult === 1.5);
check('tier 2 at +50%', bonusTier(45, 30).tier === 2 && bonusTier(45, 30).mult === 2);
check('tier 3 at double', bonusTier(60, 30).tier === 3 && bonusTier(60, 30).mult === 3);

// Earning: horse L1 (30s target), honour form factor 0.75.
// 30s → 3 coins × 0.75 = 2.25, plus the 2-coin target bonus × 0.75 (honour form counts as 100 for the bonus).
{
  const r = honour('horse', 1, 30.05);
  check('30s at target', near(r.coins, 2.25 + 2, 0.1), `${r.coins.toFixed(2)} coins`);
  const r2 = honour('horse', 1, 60.05);
  // 0–30s: 3 coins; 30–45s: 1.5 × 1.5; 45–60s: 1.5 × 2 → (3 + 2.25 + 3) × 0.75 + 2
  check('60s with bonus tiers', near(r2.coins, (3 + 2.25 + 3) * 0.75 + 2, 0.15), `${r2.coins.toFixed(2)} coins`);
  const daily = honour('horse', 1, 30.05, { daily: true });
  check('hold of the day', near(daily.coins, r.coins * DAILY_MULT, 0.3), `${daily.coins.toFixed(2)} vs ${(r.coins * DAILY_MULT).toFixed(2)}`);
  const lvl4 = honour('horse', 4, 30.05);
  check('level 4 earns faster', near(lvl4.coins, 3 * 0.75 * 2, 0.1), `${lvl4.coins.toFixed(2)} coins in 30s`);
}

// Fresh progress: starter holds only, hold of the day is one of them and stable.
{
  store.clear();
  const s = P.load();
  check('starter holds', HOLDS.filter(h => P.isUnlocked(s, h.id)).map(h => h.id).join() === STARTER_HOLDS.join());
  const d1 = P.dailyHold(s, '2026-10-26'), d2 = P.dailyHold(s, '2026-10-26');
  check('daily is unlocked and stable', STARTER_HOLDS.includes(d1.id) && d1 === d2, d1.id);
  const days = new Set(Array.from({ length: 14 }, (_, i) => { s.daily = null; return P.dailyHold(s, `2026-11-${String(i + 1).padStart(2, '0')}`).id; }));
  check('daily varies by date', days.size === STARTER_HOLDS.length, [...days].join(', '));

  // Unlocking: can't afford, then can; price rises.
  check('cannot unlock when broke', P.unlockHold(s, 'crane') === null && !P.isUnlocked(s, 'crane'));
  s.coins = 60;
  const badges = P.unlockHold(s, 'crane');
  check('unlock spends coins', P.isUnlocked(s, 'crane') && s.coins === 60 - UNLOCK_PRICES[0] && badges.some(b => b.id === 'unlock'), `${s.coins} left`);
  check('next unlock costs more', P.unlockPrice(s) === UNLOCK_PRICES[1]);
  check('cannot buy twice', P.unlockHold(s, 'crane') === null);

  // Recording a session adds coins to the wallet and to lifetime (rank).
  const before = { coins: s.coins, lifetime: s.lifetime };
  const o = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 4.25, avgForm: 0, camera: false, reached: true, daily: false });
  check('session coins recorded', s.coins === before.coins + o.coins && s.lifetime === before.lifetime + o.coins && o.coins === Math.round(4.25 * o.streakMult), `${o.coins} coins`);
}

// Version 1 progress converts: points → coins, practised holds stay unlocked.
{
  store.clear();
  store.set('holds.v1', JSON.stringify({
    version: 1, xp: 8000, holds: { horse: { level: 2, sessions: 3 }, drop: { level: 1, sessions: 1 }, cat: { level: 1, sessions: 0 } },
    history: [{ holdId: 'drop', points: 400, held: 30 }], days: { '2026-10-24': { points: 800, time: 60, sessions: 2 } }, badges: {}, settings: {},
  }));
  const s = P.load();
  check('migrated coins', s.version === 2 && s.coins === 100 && s.lifetime === 100, `${s.coins} coins`);
  check('practised holds stay unlocked', P.isUnlocked(s, 'drop') && P.isUnlocked(s, 'horse') && P.isUnlocked(s, 'bow') && !P.isUnlocked(s, 'cat'));
  check('history and days converted', s.history[0].coins === 5 && s.days['2026-10-24'].coins === 10);
}

// Body areas: a run of leg holds flags legs, and suggestions spare them.
{
  store.clear();
  const s = P.load();
  const now = Date.now(), ago = h => new Date(now - h * 3.6e6).toISOString();
  s.history.push(
    { holdId: 'horse', level: 1, held: 40, at: ago(2) },
    { holdId: 'bow', level: 1, held: 35, at: ago(1.5) },
    { holdId: 'horse', level: 1, held: 30, at: ago(1) },
  );
  const over = P.overworked(s, now);
  check('legs flagged after three leg holds', over?.area === 'legs', JSON.stringify(over));
  const rest = P.restingHolds(s, 'legs');
  check('suggests soft holds that spare the legs', rest.unlocked.length > 0 && rest.unlocked.every(h => h.style === 'soft' && !P.leansOn(h, 'legs')), rest.unlocked.map(h => h.id).join());
  s.daily = null;
  const daily = P.dailyHold(s);
  check('hold of the day avoids leg holds', !P.leansOn(daily, 'legs'), daily.id);
  const picks = new Set(Array.from({ length: 40 }, () => P.pickHold(s).id));
  check('shuffle still works', picks.size >= 1);

  store.clear();
  const old = P.load();
  old.history.push({ holdId: 'horse', level: 1, held: 300, at: ago(24 * 5) });
  check('old sessions fade out', P.overworked(old, now) === null);
  store.clear();
  const mixed = P.load();
  mixed.history.push({ holdId: 'horse', level: 1, held: 40, at: ago(1) }, { holdId: 'hollow', level: 1, held: 60, at: ago(1) }, { holdId: 'weituo', level: 1, held: 60, at: ago(1) });
  check('balanced training not flagged', P.overworked(mixed, now) === null);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
