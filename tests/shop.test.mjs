// Shop logic: rest days, freezes, repairs, bets, level test-out and the temple.
// Run: node tests/shop.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const P = await import('../js/progress.js');
const E = await import('../js/economy.js');
const { HOLDS } = await import('../js/holds.js');

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
  const s = fresh(3 * E.FREEZE_PRICE);
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
  const s = fresh(1000);
  train(s, '2026-10-18', '2026-10-19', '2026-10-20');
  P.protectStreak(s, '2026-10-23');  // missed 21st and 22nd, no freezes
  const b = s.streak.broken;
  check('repair offered', b && b.streak === 3 && b.missed.length === 2 && b.price === 2 * E.REPAIR_PRICE_PER_DAY, JSON.stringify(b));
  check('repair restores streak', P.repairStreak(s) && P.streak(s, '2026-10-23') === 3 && s.coins === 1000 - b.price);
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
  check('no second bet the same day', !P.placeBet(s, 'form90', today) && P.betBlocker(s, 'form90', today).startsWith('One daily bet a day'));
  check('a new bet the next day', P.placeBet(s, 'form90', P.addDays(today, 1)));
  check('bet logged', s.betLog[0]?.result === 'won' && s.betLog[0].payout === 25 && s.lifetime >= 25);

  const t = fresh(100);
  P.placeBet(t, 'time10', '2026-10-20');
  P.settleBet(t, '2026-10-21');
  check('daily bet lost next day', t.bet === null && t.coins === 85 && t.notices.some(n => n.startsWith('Bet lost')));

  const u = fresh(100);
  P.placeBet(u, 'streak7', '2026-10-20');
  check('weekly bet in its own slot', u.weekBet?.id === 'streak7' && u.bet === null && u.coins === 60);
  check('daily bet alongside a weekly one', P.placeBet(u, 'holds3', '2026-10-20') && u.bet?.id === 'holds3');
  check('one weekly bet at a time', !P.placeBet(u, 'week5', '2026-10-21'));
  u.weekBet.days.push('2026-10-20');
  P.settleBets(u, '2026-10-22');  // missed the 21st
  check('unbroken week lost on a missed day', u.weekBet === null);
}

// An old save with a weekly bet in the one bet slot moves it to the weekly slot.
{
  store.clear();
  store.set('holds.v1', JSON.stringify({ version: 2, coins: 0, lifetime: 0, unlocked: [], purchased: [], holds: {}, history: [], days: {}, badges: {}, settings: {},
    bet: { id: 'week5', start: '2026-10-25', end: '2026-10-31', holds: [], time: 0, days: [], done: false } }));
  const t = P.load();
  check('weekly bet migrates', t.bet === null && t.weekBet?.id === 'week5');
}

// Bonus time bet: steps are relative to the hold's target, must be reached within a
// single hold (they don't add up across holds), and pay as they're reached.
{
  const s = fresh(100);
  const today = P.dayKey();
  check('place bonus bet', P.placeBet(s, 'bonus', today) && s.coins === 85);
  const rec = bonus => P.recordSession(s, { holdId: 'horse', level: 1, held: 30 + bonus * 30, target: 30, coins: 0, avgForm: 0, camera: false, reached: true, bonus });
  const a = rec(0.3);
  check('no step at 0.3×', a.betSteps.length === 0 && s.coins === 85);
  const b = rec(0.3);
  check('two short holds don\'t add up', b.betSteps.length === 0 && s.coins === 85, `coins ${s.coins}`);
  const soft = P.recordSession(s, { holdId: 'weituo', level: 1, held: 120, target: 60, coins: 0, avgForm: 0, camera: false, reached: true, bonus: 0.8 });
  check('soft holds count half', soft.betSteps.length === 0 && s.coins === 85, `coins ${s.coins}`);
  const c = rec(0.6);
  check('half again in one hold', c.betSteps.length === 1 && c.betSteps[0].name === 'Half again' && s.coins === 95, `coins ${s.coins}`);
  s.holds.horse.level = 2;
  const low = rec(1.2);
  check('a level below yours doesn\'t count', low.betSteps.length === 0 && s.coins === 95, `coins ${s.coins}`);
  s.holds.horse.level = 1;
  const d = rec(1.2);
  check('double in one hold', d.betSteps.length === 1 && d.betSteps[0].name === 'Double' && s.coins === 105, `coins ${s.coins}`);
  const r = P.settleBet(s, P.addDays(today, 1), { notify: false });
  check('time up after two steps is a win, paid as it went', r.result === 'won' && r.payout === 20 && s.coins === 105 && s.betLog[0].payout === 20, JSON.stringify({ result: r.result, payout: r.payout, coins: s.coins }));
}

// The personal best bet is retired: can't be placed, and a running one is refunded.
{
  const s = fresh(50);
  check('personal best bet retired', !P.placeBet(s, 'pb') && P.betBlocker(s, 'pb').includes('retired'));
  store.clear();
  store.set('holds.v1', JSON.stringify({ version: 2, coins: 40, lifetime: 40, unlocked: [], purchased: [], holds: {}, history: [], days: {}, badges: {}, settings: {},
    bet: { id: 'pb', start: '2026-10-25', end: '2026-10-25', holds: [], time: 0, days: [], done: false } }));
  const t = P.load();
  check('running personal best bet refunded', t.bet === null && t.coins === 50 && t.notices.some(n => n.includes('retired')));
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
  check('bell tower needs a small temple', !P.buyTempleItem(s, 'bell'));
  check('upgrade temple', P.upgradeTemple(s) && s.temple.tier === 1 && s.coins === 275 - E.TEMPLE_TIERS[1].price);
  s.coins = 1000;
  check('upgrades in order', P.upgradeTemple(s) && s.temple.tier === 2 && P.buyTempleItem(s, 'bell'));
  s.coins = 20000;
  for (const h of HOLDS) s.holds[h.id] = { ...P.holdState(s, h.id), level: 4, mastered: true };  // a full black sash
  while (P.upgradeTemple(s));
  check('last stage', s.temple.tier === E.TEMPLE_TIERS.length - 1 && P.nextTier(s) === null);
  check('times of day are free', ['dawn', 'day', 'dusk', 'night'].every(id => s.temple.themes.includes(id)) && P.useTheme(s, 'night') && s.temple.theme === 'night');
}

// An old save that bought the Temple Hall as a decoration gets it as a temple stage.
{
  const s = fresh(0);
  s.temple.owned = ['path', 'hall'];
  delete s.temple.tier;
  P.save(s);
  const t = P.load().temple;
  check('hall becomes a stage', t.tier === 3 && !t.owned.includes('hall') && t.owned.includes('path'), JSON.stringify(t));
}

// Streak milestones: paid once per streak, with a free freeze at 1 week.
{
  const s = fresh(0);
  const today = P.dayKey();
  for (let i = 6; i >= 1; i--) train(s, P.addDays(today, -i));
  const o = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  check('3-day and 1-week milestones', o.milestones.map(m => m.days).join() === '3,7' && s.streak.freezes === 1 && s.coins === 15 + 25 && !o.milestoneDouble, JSON.stringify(o.milestones));
  const again = P.recordSession(s, { holdId: 'bow', level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  check('paid once per streak', again.milestones.length === 0 && s.coins === 40);
  check('next milestone', P.nextMilestone(s, today).days === 10);
}

// A milestone makes the rest of the day double coins, including the session that reached it.
{
  const s = fresh(0);
  const today = P.dayKey();
  for (let i = 9; i >= 1; i--) train(s, P.addDays(today, -i));
  for (const days of [3, 7]) s.streak.claimed[days] = P.addDays(today, -9);
  check('streak bonus counts today', P.coinBoost(s, today).days === 10 && Math.abs(P.coinBoost(s, today).streakMult - 1.05) < 1e-9 && !P.coinBoost(s, today).double);
  const o = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 10, avgForm: 0, camera: false, reached: true });
  check('10-day milestone doubles its session', o.milestones.map(m => m.days).join() === '10' && o.milestoneDouble === 10 && o.coins === 20 && s.coins === 20, JSON.stringify({ coins: o.coins, wallet: s.coins }));
  const b = P.coinBoost(s, today);
  check('rest of the day is doubled', b.double && Math.abs(b.total - 2 * 1.05) < 1e-9);
  const again = P.recordSession(s, { holdId: 'bow', level: 1, held: 31, target: 30, coins: 10, avgForm: 0, camera: false, reached: true, boostDouble: true });
  check('already-doubled sessions aren\'t doubled again', again.milestoneDouble === 0 && again.coins === 10);
}

// The streak bonus rises a step each full week: none in week 1, +5% from day 8.
{
  const s = fresh(0);
  check('day 1 has no streak bonus', P.coinBoost(s).days === 1 && P.coinBoost(s).streakMult === 1 && P.coinBoost(s).nextStepIn === 7);
  for (let i = 6; i >= 1; i--) train(s, P.addDays(P.dayKey(), -i));
  check('day 7 still none', P.coinBoost(s).days === 7 && P.coinBoost(s).streakMult === 1);
  train(s, P.addDays(P.dayKey(), -7));
  check('day 8 is +5%', Math.abs(P.coinBoost(s).streakMult - 1.05) < 1e-9 && P.coinBoost(s).nextStepIn === 7);
}

// The hold of the day never repeats the day before's.
{
  const s = fresh(0);
  let prev = null, repeats = 0;
  for (let i = 0; i < 60; i++) {
    const h = P.dailyHold(s, P.addDays('2026-10-01', i)).id;
    if (h === prev) repeats++;
    prev = h;
  }
  check('hold of the day changes every day', repeats === 0, `${repeats} repeats`);
}

// The hold of the day's multiplier is used up by its first proper session.
{
  const s = fresh(0);
  const hold = P.dailyHold(s);
  check('daily available', P.dailyAvailable(s, hold.id));
  P.recordSession(s, { holdId: hold.id, level: 1, held: 5, target: 30, coins: 1, avgForm: 0, camera: false, reached: false, daily: true });
  check('a very short go doesn\'t use it', P.dailyAvailable(s, hold.id));
  P.recordSession(s, { holdId: hold.id, level: 1, held: 31, target: 30, coins: 9, avgForm: 0, camera: false, reached: true, daily: true });
  check('first proper session uses it', P.isDaily(s, hold.id) && !P.dailyAvailable(s, hold.id));
}

// Your monk: buy to wear, swap characters and outfits, one accessory per slot.
{
  const s = fresh(2000);
  check('starts as a young monk in saffron', s.avatar.character === 'young' && s.avatar.outfit === 'saffron' && P.ownsAvatar(s, 'young'));
  check('buy a character wears it', P.buyAvatarItem(s, 'character', 'nun') && s.avatar.character === 'nun' && s.coins === 2000 - 300);
  check('no double buy', !P.buyAvatarItem(s, 'character', 'nun'));
  check('swap back to an owned one', P.wearAvatarItem(s, 'character', 'young') && s.avatar.character === 'young');
  check('can\'t wear what you don\'t own', !P.wearAvatarItem(s, 'outfit', 'golden'));
  P.buyAvatarItem(s, 'accessory', 'fan'); P.buyAvatarItem(s, 'accessory', 'staff');
  check('one per slot', s.avatar.wear.hand === 'staff');
  P.wearAvatarItem(s, 'accessory', 'staff');
  check('take an accessory off', !s.avatar.wear.hand);
  check('nothing starred to begin with', s.starred.length === 0);
  P.toggleStar(s, 'horse'); P.toggleStar(s, 'crane');
  check('star holds', P.isStarred(s, 'horse') && P.isStarred(s, 'crane') && !P.isStarred(s, 'bow'));
  P.toggleStar(s, 'horse');
  check('unstar a hold', !P.isStarred(s, 'horse') && P.isStarred(s, 'crane'));
  check('stars are saved', P.load().starred.join() === 'crane');
  for (const id of ['horse', 'bow', 'cat', 'rest', 'drop', 'crane', 'kick', 'swallow', 'squat', 'nordic', 'toes', 'tray', 'palms', 'wings', 'claws', 'drawbow', 'fingertips', 'plank', 'sideplank', 'birddog'])
    s.holds[id] = { ...P.holdState(s, id), level: 4, mastered: true };  // 80 points: 2nd duan
  const look = P.avatarLook(s);
  check('sash follows your rank', look.sash === '#1d1a17' && look.degree === 2, JSON.stringify(look));
  store.clear();
  store.set('holds.v1', JSON.stringify({ version: 2, coins: 0, lifetime: 0, unlocked: [], purchased: [], holds: {}, history: [], days: {}, badges: {}, settings: {} }));
  check('old saves get a monk', P.load().avatar?.character === 'young');
}

// Test mode opens every hold without unlocking anything for real.
{
  const s = fresh(0);
  P.setTestMode(s, true);
  check('test mode opens locked holds', P.isOpen(s, 'crane') && !P.isUnlocked(s, 'crane'));
  P.setTestMode(s, false);
  check('and closes them again', !P.isOpen(s, 'crane') && P.isOpen(s, 'horse'));
}

// Sashes come from levels: a point per level beyond the first, one more for mastery.
{
  const s = fresh(0);
  check('a new start is a white sash', P.sashRank(s).key === 'white' && P.masteryPoints(s) === 0);
  s.holds.horse = { ...P.holdState(s, 'horse'), level: 3 };
  s.holds.wings = { ...P.holdState(s, 'wings'), level: 4, mastered: true };
  check('points from levels and mastery', P.masteryPoints(s) === 2 + 4 && P.sashRank(s).key === 'orange', `${P.masteryPoints(s)} points`);
  check('the sash opens gated holds', P.hasSash(s, 'yellow') && P.hasSash(s, 'orange') && !P.hasSash(s, 'green'));
}

// Levelling up is slow and camera-only: 7 days at 70+ form for level 2, with a coin bonus.
{
  const s = fresh(0);
  const day = i => P.addDays(P.dayKey(), i - 7);
  for (let i = 0; i < 6; i++) { s.holds.horse = P.holdState(s, 'horse'); s.holds.horse.qualDays.push(day(i)); }
  const honour = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 0, avgForm: 0, camera: false, reached: true });
  check('honour sessions don\'t count towards levels', !honour.qualified && P.holdState(s, 'horse').level === 1);
  const low = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 0, avgForm: 65, camera: true, reached: true });
  check('form below the level\'s bar doesn\'t count', !low.qualified);
  const up = P.recordSession(s, { holdId: 'horse', level: 1, held: 31, target: 30, coins: 0, avgForm: 75, camera: true, reached: true });
  check('7th day levels up, with a bonus', up.levelUp && P.holdState(s, 'horse').level === 2 && up.levelBonus === E.LEVEL_UP_COINS[2] && up.coins === E.LEVEL_UP_COINS[2], JSON.stringify({ lv: P.holdState(s, 'horse').level, bonus: up.levelBonus }));
  check('the next level needs 14 days', P.qualifyDays(2) === 14 && P.qualifyForm(2) === 75);
}

// Temple stages past the small temple need a sash too.
{
  const s = fresh(5000);
  P.upgradeTemple(s); P.upgradeTemple(s);
  check('temple hall needs an orange sash', s.temple.tier === 2 && !P.upgradeTemple(s), `stage ${s.temple.tier}`);
}

// Owned decorations can be put away and brought back without losing them.
{
  const s = fresh(1000);
  P.buyTempleItem(s, 'path'); P.buyTempleItem(s, 'bamboo');
  check('put a decoration away', P.toggleTempleItem(s, 'bamboo') && P.shownItems(s).join() === 'path' && P.owns(s, 'bamboo'));
  check('and bring it back', P.toggleTempleItem(s, 'bamboo') && P.shownItems(s).join() === 'path,bamboo');
  check('can\'t hide what you don\'t own', !P.toggleTempleItem(s, 'pond'));
}

// Frames: bought once, then switched freely.
{
  const s = fresh(500);
  check('starts with no frame', s.temple.frame === 'none' && P.useFrame(s, 'none'));
  check('buying a frame puts it on', P.buyFrame(s, 'lacquer') && s.temple.frame === 'lacquer' && s.coins === 500 - 150);
  check('switch back without paying again', P.useFrame(s, 'none') && P.useFrame(s, 'lacquer') && s.coins === 350);
  check('can\'t use a frame you don\'t own', !P.useFrame(s, 'gold'));
}

// Seasonal packs: on sale only in season; once bought, shown only in season each year.
{
  const s = fresh(500);
  const oct = new Date(2026, 9, 30), may = new Date(2027, 4, 1), nextOct = new Date(2027, 9, 20);
  check('autumn (with Halloween) on sale in late October', P.activeSeasons(oct).map(x => x.id).join() === 'autumn' && P.activeSeasons(may).map(x => x.id).join() === 'spring');
  check('winter wraps the new year', P.activeSeasons(new Date(2026, 11, 25)).map(x => x.id).join() === 'winter' && P.activeSeasons(new Date(2027, 1, 10)).map(x => x.id).join() === 'winter');
  check('can\'t buy out of season', !P.buySeasonalItem(s, 'pumpkins', may) && !P.buySeasonalItem(s, 'parasol', oct));
  check('buy in season', P.buySeasonalItem(s, 'pumpkins', oct) && P.owns(s, 'pumpkins') && s.coins === 500 - 80);
  check('shown only in season, every year', P.shownItems(s, oct).includes('pumpkins') && !P.shownItems(s, may).includes('pumpkins') && P.shownItems(s, nextOct).includes('pumpkins'));
}

// Seasonal themes: bought in season, used in season, Clear Day the rest of the year.
{
  const s = fresh(500);
  const oct = new Date(2026, 9, 30), jan = new Date(2027, 0, 10);
  check('buy a seasonal theme in season', P.buySeasonalItem(s, 'autumn', oct) && s.temple.theme === 'autumn' && s.temple.themes.includes('autumn') && s.coins === 350);
  check('out of season it shows as Clear Day', E.shownTheme('autumn', jan) === 'day' && E.shownTheme('autumn', oct) === 'autumn' && E.shownTheme('night', jan) === 'night');
  check('can\'t switch to it out of season', P.useTheme(s, 'dawn') && !P.useTheme(s, 'autumn', jan));
}

// Anyone who bought Day, Dusk or Night gets their coins back.
{
  store.clear();
  store.set('holds.v1', JSON.stringify({ version: 2, coins: 10, lifetime: 0, unlocked: [], purchased: [], holds: {}, history: [], days: {}, badges: {}, settings: {},
    temple: { owned: [], theme: 'night', themes: ['dawn', 'day', 'night', 'snow'] } }));
  const t = P.load();
  check('time-of-day themes refunded', t.coins === 10 + 80 + 150 && t.temple.themes.includes('dusk') && t.temple.themes.includes('snow'), `${t.coins} coins`);
  check('refunded only once', P.load().coins === t.coins, `${P.load().coins} coins on reload`);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
