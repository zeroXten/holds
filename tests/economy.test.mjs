// The coin economy: earning rates, bonus tiers, hold of the day, unlocking
// holds and converting old points-based progress.
// Run: node tests/economy.test.mjs
globalThis.window = {};
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { HOLDS } = await import('../js/holds.js');
const { Session } = await import('../js/session.js');
const { bonusTier, STARTER_HOLDS, UNLOCK_PRICES, DAILY_MULT, coinsAtTarget } = await import('../js/economy.js');
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

// Earning: reaching a target pays the hold's coinsAtTarget for its level, however long the
// target (here in honour mode, form factor 0.75): 80% over the target's length, 20% on reaching it.
{
  const at = (id, level) => coinsAtTarget(HOLDS.find(h => h.id === id), level);
  const c1 = at('tray', 1);  // Carrying the Tray is rated 1: the plain base, one side, 45s
  const r = honour('tray', 1, 45.05);
  check('45s at target', near(r.coins, c1 * 0.75, 0.1), `${r.coins.toFixed(2)} coins`);
  const t2 = honour('tray', 1, 90.05);  // tray: rated 1, 45s target, one side
  // Base 4 coins / 45s. 45–67.5s at ×1.5 = 3, 67.5–90s at ×2 = 4 → (4 + 3 + 4 + 1 target) × 0.75
  check('bonus tiers multiply the base rate', near(t2.coins, (4 + 3 + 4 + 1) * 0.75, 0.15), `${t2.coins.toFixed(2)} coins`);
  const daily = honour('tray', 1, 45.05, { daily: true });
  check('hold of the day', near(daily.coins, r.coins * DAILY_MULT, 0.3), `${daily.coins.toFixed(2)} vs ${(r.coins * DAILY_MULT).toFixed(2)}`);
  const b45 = honour('horse', 1, 45), side = honour('bow', 1, 40);
  check('bonus as a fraction of the target', near(b45.bonus, 0.5, 0.02), b45.bonus.toFixed(2));
  check('two-sided bonus measured against the whole target', near(side.bonus, 25 / 30, 0.03), side.bonus.toFixed(2));  // 40s on side one of a 15s-per-side hold
  // However long the target, a hold pays its own rating at it: a 30s stance, a 60s soft hold
  // and 5 minutes of meditation.
  const horse = honour('horse', 1, 30.05), soft = honour('weituo', 1, 60.05), sit = honour('zuochan', 1, 300.05);
  check('coins at target follow each hold\'s rating', near(horse.coins, at('horse', 1) * 0.75, 0.1) && near(soft.coins, at('weituo', 1) * 0.75, 0.1) && near(sit.coins, at('zuochan', 1) * 0.75, 0.1),
    `horse ${horse.coins.toFixed(2)}, wei tuo ${soft.coins.toFixed(2)}, meditation ${sit.coins.toFixed(2)}`);
  const lvl4 = honour('horse', 4, 90.05);
  check('level 4 pays the same at target', near(lvl4.coins, at('horse', 4) * 0.75, 0.15), `${lvl4.coins.toFixed(2)} coins`);
}


// Fresh progress: starter holds only, hold of the day is one of them and stable.
{
  store.clear();
  const s = P.load();
  check('starter holds', HOLDS.filter(h => P.isUnlocked(s, h.id)).map(h => h.id).sort().join() === [...STARTER_HOLDS].sort().join());
  const d1 = P.dailyHold(s, '2026-10-26'), d2 = P.dailyHold(s, '2026-10-26');
  check('daily is unlocked and stable', STARTER_HOLDS.includes(d1.id) && d1 === d2, d1.id);
  const days = new Set(Array.from({ length: 14 }, (_, i) => { s.daily = null; return P.dailyHold(s, `2026-11-${String(i + 1).padStart(2, '0')}`).id; }));
  check('daily varies by date', days.size === STARTER_HOLDS.length, [...days].join(', '));

  // Unlocking: can't afford, then can; price rises.
  check('cannot unlock when broke', P.unlockHold(s, 'cat') === null && !P.isUnlocked(s, 'cat'));
  s.coins = 60;
  const badges = P.unlockHold(s, 'cat');
  check('unlock spends coins', P.isUnlocked(s, 'cat') && s.coins === 60 - UNLOCK_PRICES[0] && badges.some(b => b.id === 'unlock'), `${s.coins} left`);
  check('a sash hold needs its sash, whatever the coins', P.unlockHold(s, 'crane') === null && !P.isUnlocked(s, 'crane'));
  check('next unlock costs more', P.unlockPrice(s) === UNLOCK_PRICES[1]);
  check('cannot buy twice', P.unlockHold(s, 'cat') === null);

  // Recording a session adds coins to the wallet and to lifetime (rank).
  const before = { coins: s.coins, lifetime: s.lifetime };
  const o = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 4.25, avgForm: 0, camera: false, reached: true, daily: false });
  check('session coins recorded', s.coins === before.coins + o.coins && s.lifetime === before.lifetime + o.coins && o.coins === 4, `${o.coins} coins`);
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
  check('practised holds stay unlocked', P.isUnlocked(s, 'drop') && P.isUnlocked(s, 'horse') && P.isUnlocked(s, 'wings') && !P.isUnlocked(s, 'cat'));
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
  check('suggests holds that spare the legs, soft ones first', rest.unlocked.length > 0 && rest.unlocked[0].style === 'soft' && rest.unlocked.every(h => !P.leansOn(h, 'legs')), rest.unlocked.map(h => h.id).join());
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
