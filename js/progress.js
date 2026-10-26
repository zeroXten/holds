// Progress kept in localStorage: coins, unlocked holds, the hold of the day,
// levels, streaks, personal bests and badges.

import { HOLDS, AREAS } from './holds.js';
import {
  STARTER_HOLDS, UNLOCK_PRICES, REST_DAY_PRICE, REST_DAYS_PER_WEEK, FREEZE_PRICE, FREEZE_MAX,
  REPAIR_PRICE_PER_DAY, REPAIR_WINDOW_DAYS, BETS, TEST_FORM, testPrice, TEMPLE_TIERS, TEMPLE_ITEMS, THEMES, STREAK_MILESTONES, LEVEL_MULT,
  DAILY_MIN_SECONDS, STREAK_STEP, STREAK_MAX_DAYS, MILESTONE_DAY_MULT,
} from './economy.js';

const KEY = 'holds.v1';
export const QUALIFY_DAYS = 3;   // days hitting the target (with good form) to level up
export const QUALIFY_FORM = 70;  // minimum average form for a camera session to count

// Ranks go by coins earned over all time (spending doesn't lower your rank).
export const RANKS = [
  { coins: 0, name: 'White Sash', color: '#f4efe6' },
  { coins: 50, name: 'Yellow Sash', color: '#f2c230' },
  { coins: 150, name: 'Orange Sash', color: '#ee8a2a' },
  { coins: 300, name: 'Green Sash', color: '#4f9d4a' },
  { coins: 600, name: 'Blue Sash', color: '#3a73c9' },
  { coins: 1000, name: 'Purple Sash', color: '#7d4fc0' },
  { coins: 1600, name: 'Brown Sash', color: '#8a5a32' },
  { coins: 2400, name: 'Red Sash', color: '#c8322b' },
  { coins: 3500, name: 'Black Sash', color: '#1d1a17' },
  // Degrees (duan) of the black sash, shown as gold bands.
  { coins: 6000, name: 'Black Sash · 1st Duan', color: '#1d1a17', degree: 1 },
  { coins: 10000, name: 'Black Sash · 2nd Duan', color: '#1d1a17', degree: 2 },
  { coins: 16000, name: 'Black Sash · 3rd Duan', color: '#1d1a17', degree: 3 },
  { coins: 25000, name: 'Black Sash · 4th Duan', color: '#1d1a17', degree: 4 },
  { coins: 40000, name: 'Black Sash · 5th Duan', color: '#1d1a17', degree: 5 },
];

export const BADGES = [
  { id: 'first', name: 'First Stance', desc: 'Finish your first hold' },
  { id: 'target', name: 'On Target', desc: 'Reach a target time' },
  { id: 'perfect', name: 'Perfect Form', desc: 'Reach a target with 90+ average form' },
  { id: 'overtime', name: 'Beyond the Target', desc: 'Hold 50% past a target' },
  { id: 'streak3', name: 'Three Days', desc: 'Train 3 days in a row' },
  { id: 'streak7', name: 'Full Week', desc: 'Train 7 days in a row' },
  { id: 'streak30', name: 'Iron Discipline', desc: 'Train 30 days in a row' },
  { id: 'levelup', name: 'Promoted', desc: 'Level up a hold' },
  { id: 'rounded', name: 'Well Rounded', desc: 'Practise every hold' },
  { id: 'ironhorse', name: 'Iron Horse', desc: 'Reach the Full Horse target' },
  { id: 'master', name: 'Master of One', desc: 'Master any hold' },
  { id: 'min30', name: 'Half Hour', desc: 'Hold for 30 minutes in total' },
  { id: 'min120', name: 'Two Hours', desc: 'Hold for 2 hours in total' },
  { id: 'early', name: 'Early Bird', desc: 'Train between 4 and 7am' },
  { id: 'unlock', name: 'New Stance', desc: 'Unlock a hold with coins' },
  { id: 'collector', name: 'Full Set', desc: 'Unlock every hold' },
  { id: 'daily', name: 'Daily Devotion', desc: 'Reach the target on the hold of the day' },
];

export const DEFAULT_SETTINGS = { voice: true, sounds: true, camera: true, autoframe: true, showValues: false, strictness: 'normal', model: 'full', appearance: 'system' };

const blank = () => ({
  version: 2, coins: 0, lifetime: 0, unlocked: [...STARTER_HOLDS], purchased: [], daily: null,
  holds: {}, history: [], days: {}, badges: {}, settings: { ...DEFAULT_SETTINGS },
  // covered: days that keep the streak alive without training ('rest' | 'freeze' | 'repair')
  streak: { freezes: 0, covered: {}, broken: null, claimed: {} },  // claimed: milestone days → the streak's start date
  bet: null,      // today's bet
  weekBet: null,  // a weekly bet, running alongside
  betLog: [],  // settled bets, newest first
  temple: { tier: 0, owned: [], theme: 'dawn', themes: ['dawn'] },
  notices: [],  // messages to show once (a freeze was used, a bet was won...)
});

// Version 1 had points (about 80 per coin) and every hold open. Convert the
// points, and keep any hold already practised unlocked.
const POINTS_PER_COIN = 80;
function migrate(data) {
  if (data.version === 1) {
    const toCoins = p => Math.round((p ?? 0) / POINTS_PER_COIN);
    data.lifetime = data.coins = toCoins(data.xp);
    delete data.xp;
    data.unlocked = [...new Set([...STARTER_HOLDS, ...Object.keys(data.holds ?? {}).filter(id => data.holds[id].sessions)])];
    data.purchased = [];
    for (const h of data.history ?? []) { h.coins = toCoins(h.points); delete h.points; }
    for (const d of Object.values(data.days ?? {})) { d.coins = toCoins(d.points); delete d.points; }
    data.version = 2;
  }
  return data;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = migrate(JSON.parse(raw));
      const fresh = blank();
      // A running "new personal best" bet (now retired) gets its stake back.
      if (data.bet?.id === 'pb') { data.coins = (data.coins ?? 0) + 10; data.bet = null; data.notices = [...(data.notices ?? []), 'The personal best bet has been retired: your 10-coin stake is back.']; }
      // Weekly bets used to share the one bet slot; they have their own now.
      if (data.bet && (BETS.find(b => b.id === data.bet.id)?.days ?? 1) > 1) { data.weekBet = data.bet; data.bet = null; }
      // The Temple Hall used to be a decoration; now it's a stage of the temple.
      if (data.temple?.owned?.includes('hall')) {
        data.temple.owned = data.temple.owned.filter(id => id !== 'hall');
        data.temple.tier = Math.max(data.temple.tier ?? 0, TEMPLE_TIERS.findIndex(t => t.id === 'hall'));
      }
      // Starter holds added since this save was made are free too.
      data.unlocked = [...new Set([...(data.unlocked ?? []), ...STARTER_HOLDS])];
      return {
        ...fresh, ...data,
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
        streak: { ...fresh.streak, ...data.streak },
        temple: { ...fresh.temple, ...data.temple },
      };
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return blank();
}

export const isBackup = data => (data?.version === 1 && typeof data.xp === 'number') || (data?.version === 2 && typeof data.coins === 'number');

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
};

export function holdState(state, id) {
  return state.holds[id] ?? { level: 1, qualDays: [], mastered: false, best: {}, sessions: 0, totalTime: 0, last: null };
}

// A day keeps the streak alive if you trained, or it was a rest day, freeze or repair.
const trained = (state, day) => !!state.days[day];
const kept = (state, day) => trained(state, day) || !!state.streak.covered[day];

// Current streak: training days in an unbroken run ending today (or yesterday if today
// isn't done yet). Covered days bridge the run but don't add to the count.
export function streak(state, today = dayKey()) {
  let day = kept(state, today) ? today : addDays(today, -1);
  let n = 0;
  while (kept(state, day)) { if (trained(state, day)) n++; day = addDays(day, -1); }
  return n;
}

// First day of the current run (the earliest training day in it), so milestone
// rewards can be claimed once per streak.
export function streakStart(state, today = dayKey()) {
  let day = kept(state, today) ? today : addDays(today, -1), start = null;
  while (kept(state, day)) { if (trained(state, day)) start = day; day = addDays(day, -1); }
  return start;
}

// What each day from `from` to `to` was (or is planned to be), for the streak strip:
// 'trained', 'rest', 'freeze', 'repair', 'missed', or 'open' for today and later.
export function dayMarks(state, from, to, today = dayKey()) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const mark = trained(state, d) ? 'trained' : state.streak.covered[d] ?? (d >= today ? 'open' : 'missed');
    out.push({ day: d, mark });
  }
  return out;
}

export const nextMilestone = (state, today = dayKey()) => STREAK_MILESTONES.find(m => m.days > streak(state, today)) ?? null;

// Coin multipliers from outside the hold, for a session starting now: the streak bonus
// (counting today, as training today extends the streak) and a milestone day's double.
export function coinBoost(state, today = dayKey()) {
  const days = trained(state, today) ? streak(state, today) : streak(state, today) + 1;
  const streakMult = 1 + STREAK_STEP * Math.min(days, STREAK_MAX_DAYS);
  const double = state.doubleDay === today;
  return { days, streakMult, double, total: streakMult * (double ? MILESTONE_DAY_MULT : 1) };
}

// Pays out any milestone the current streak has reached and not yet claimed.
function claimMilestones(state, today) {
  const n = streak(state, today), start = streakStart(state, today), earned = [];
  for (const m of STREAK_MILESTONES) {
    if (n < m.days || state.streak.claimed[m.days] === start) continue;
    state.streak.claimed[m.days] = start;
    let coins = m.coins ?? 0, freeze = false;
    if (m.freeze) {
      // A free freeze, or its price in coins if you already hold the maximum.
      if (state.streak.freezes < FREEZE_MAX) { state.streak.freezes++; freeze = true; } else coins += FREEZE_PRICE;
    }
    state.coins += coins;
    state.lifetime += coins;
    earned.push({ ...m, coins, freeze });
  }
  return earned;
}

// ---- Protecting the streak ----

// Run on opening the app (and before recording a session): spend freezes on missed
// days if there are enough, otherwise offer a repair while it's still recent.
export function protectStreak(state, today = dayKey()) {
  const missed = [];
  let day = addDays(today, -1);
  while (!kept(state, day) && missed.length <= REPAIR_WINDOW_DAYS) { missed.push(day); day = addDays(day, -1); }
  state.streak.broken = null;
  if (!missed.length || !kept(state, day)) return;   // nothing missed, or too long ago
  const run = streak(state, day);
  if (!run) return;
  if (missed.length <= state.streak.freezes) {
    for (const d of missed) state.streak.covered[d] = 'freeze';
    state.streak.freezes -= missed.length;
    state.notices.push(`${missed.length === 1 ? 'A streak freeze' : `${missed.length} streak freezes`} saved your ${run}-day streak.`);
  } else if (state.streak.dismissed !== day) {
    // `since` (the streak's last kept day) identifies this break, so a dismissed offer stays dismissed.
    state.streak.broken = { streak: run, missed: missed.reverse(), price: missed.length * REPAIR_PRICE_PER_DAY, since: day };
  }
  save(state);
}

export function repairStreak(state) {
  const b = state.streak.broken;
  if (!b || state.coins < b.price) return false;
  for (const d of b.missed) state.streak.covered[d] = 'repair';
  state.coins -= b.price;
  state.streak.broken = null;
  save(state);
  return true;
}

export function dismissRepair(state) {
  if (!state.streak.broken) return;
  state.streak.dismissed = state.streak.broken.since;
  state.streak.broken = null;
  save(state);
}

export function buyFreeze(state) {
  if (state.streak.freezes >= FREEZE_MAX || state.coins < FREEZE_PRICE) return false;
  state.coins -= FREEZE_PRICE;
  state.streak.freezes++;
  save(state);
  return true;
}

const weekStart = key => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return addDays(key, -((date.getDay() + 6) % 7));  // Monday
};
export const restDaysInWeek = (state, key) => {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(d => state.streak.covered[d] === 'rest').length;
};

// Why a day can't be booked as a rest day, or null if it can.
export function restBlocker(state, day, today = dayKey()) {
  if (day <= today) return 'Rest days have to be planned at least a day ahead.';
  if (day > addDays(today, 7)) return 'You can plan up to a week ahead.';
  if (state.streak.covered[day]) return 'Already covered.';
  if (restDaysInWeek(state, day) >= REST_DAYS_PER_WEEK) return `Up to ${REST_DAYS_PER_WEEK} rest days a week.`;
  if (state.coins < REST_DAY_PRICE) return `Needs ${REST_DAY_PRICE} coins.`;
  return null;
}

export function planRest(state, day, today = dayKey()) {
  if (restBlocker(state, day, today)) return false;
  state.coins -= REST_DAY_PRICE;
  state.streak.covered[day] = 'rest';
  save(state);
  return true;
}

export function cancelRest(state, day, today = dayKey()) {
  if (state.streak.covered[day] !== 'rest' || day <= today) return false;
  delete state.streak.covered[day];
  state.coins += REST_DAY_PRICE;
  save(state);
  return true;
}

// ---- Bets ----

export const betDef = id => BETS.find(b => b.id === id);

// Daily bets go in `bet`, weekly ones in `weekBet`, so a week-long bet doesn't stop you betting day to day.
export const betSlot = def => (def.days > 1 ? 'weekBet' : 'bet');

// One daily bet a day, won or lost, so an easy bet can't be farmed by placing it again
// and again; and one weekly bet at a time.
export function betBlocker(state, id, today = dayKey()) {
  const def = betDef(id);
  if (def.retired) return 'This bet has been retired.';
  const slot = betSlot(def);
  if (state[slot]) return slot === 'weekBet' ? 'Finish your weekly bet first.' : 'Finish today’s bet first.';
  if (slot === 'bet' && state.lastBetDay === today) return 'One daily bet a day: the next one opens tomorrow.';
  if (id === 'holds3' && HOLDS.filter(h => isUnlocked(state, h.id)).length < 3) return 'Needs 3 unlocked holds.';
  if (state.coins < def.stake) return `Needs ${def.stake} coins.`;
  return null;
}

export function placeBet(state, id, today = dayKey()) {
  if (betBlocker(state, id, today)) return false;
  const def = betDef(id);
  state.coins -= def.stake;
  if (betSlot(def) === 'bet') state.lastBetDay = today;
  state[betSlot(def)] = { id, start: today, end: addDays(today, def.days - 1), holds: [], time: 0, days: [], done: false, bonus: 0, paid: 0, paidCoins: 0 };
  save(state);
  return true;
}

// Progress text and fraction for an active bet ('bet' or 'weekBet').
export function betProgress(state, slot = 'bet') {
  const b = state[slot];
  if (!b) return null;
  const def = betDef(b.id);
  const p = {
    holds3: () => [b.holds.length, 3, `${b.holds.length} of 3 holds`],
    time10: () => [Math.min(b.time, 600), 600, `${Math.floor(b.time / 60)} of 10 minutes`],
    form90: () => [b.done ? 1 : 0, 1, b.done ? 'Done' : 'Not yet'],
    pb: () => [b.done ? 1 : 0, 1, b.done ? 'Done' : 'Not yet'],
    bonus: () => bonusProgress(def, b),
    week5: () => [b.days.length, 5, `${b.days.length} of 5 days`],
    streak7: () => [b.days.length, 7, `${b.days.length} of 7 days`],
  }[b.id]();
  return { def, frac: p[0] / p[1], text: p[2], end: b.end };
}

// Today's best single hold, as a multiple of its target, e.g. "Best hold: 0.6× its target in bonus · next: Double (1×, +15)".
function bonusProgress(def, b) {
  const next = def.steps[b.paid], x = b.bonus ?? 0, top = def.steps.at(-1).x;
  return [Math.min(x, top), top,
    next ? `Best hold: ${x.toFixed(1)}× its target in bonus · next: ${next.name} (${next.x}×, +${next.coins})` : `Best hold: ${x.toFixed(1)}× in bonus · every step reached`];
}

function betWon(state, b) {
  switch (b.id) {
    case 'bonus': return b.paid >= betDef('bonus').steps.length;
    case 'holds3': return b.holds.length >= 3;
    case 'time10': return b.time >= 600;
    case 'form90': case 'pb': return b.done;
    case 'week5': return b.days.length >= 5;
    case 'streak7': {
      // Every day of the week trained, or a planned rest day.
      for (let d = b.start; d <= b.end; d = addDays(d, 1)) if (!b.days.includes(d) && state.streak.covered[d] !== 'rest') return false;
      return true;
    }
  }
  return false;
}

// Settles the active bet: a win as soon as it's met, a loss once its time is up
// (or, for the unbroken week, as soon as a day is missed).
export function settleBet(state, today = dayKey(), { notify = true, slot = 'bet' } = {}) {
  const b = state[slot];
  if (!b) return null;
  const def = betDef(b.id);
  let result = null;
  if (betWon(state, b)) result = 'won';
  else if (today > b.end) result = 'lost';
  else if (b.id === 'streak7') {
    for (let d = b.start; d < today; d = addDays(d, 1)) {
      if (!b.days.includes(d) && state.streak.covered[d] !== 'rest') { result = 'lost'; break; }
    }
  }
  if (!result) return null;
  const progress = betProgress(state, slot).text;
  let payout = def.payout;
  if (def.steps) {
    // Stepped bets have paid out as each step was reached; time up after at least one is a win.
    payout = b.paidCoins ?? 0;
    if (result === 'lost' && b.paid > 0) result = 'won';
  } else if (result === 'won') { state.coins += def.payout; state.lifetime += def.payout; }
  if (notify) state.notices.push(result === 'won' ? `Bet won: ${def.name}! +${payout} coins.` : `Bet lost: ${def.name}. Better luck next time.`);
  state.betLog.unshift({ id: def.id, result, stake: def.stake, payout, progress, at: new Date().toISOString() });
  state.betLog.splice(30);
  state[slot] = null;
  save(state);
  return { result, def, progress, payout, steps: def.steps ? b.paid : null };
}

// Settles both slots; returns the bets that finished.
export const settleBets = (state, today = dayKey(), opts = {}) =>
  ['bet', 'weekBet'].map(slot => settleBet(state, today, { ...opts, slot })).filter(Boolean);

// ---- The temple ----

export const owns = (state, id) => state.temple.owned.includes(id);

// The next stage of the temple, or null at the last one.
export const nextTier = state => TEMPLE_TIERS[(state.temple.tier ?? 0) + 1] ?? null;

export function upgradeTemple(state) {
  const next = nextTier(state);
  if (!next || state.coins < next.price) return false;
  state.coins -= next.price;
  state.temple.tier = (state.temple.tier ?? 0) + 1;
  save(state);
  return true;
}

export const canBuild = (state, item) => (state.temple.tier ?? 0) >= (item.needs ?? 0);

export function buyTempleItem(state, id) {
  const item = TEMPLE_ITEMS.find(i => i.id === id);
  if (!item || owns(state, id) || !canBuild(state, item) || state.coins < item.price) return false;
  state.coins -= item.price;
  state.temple.owned.push(id);
  save(state);
  return true;
}

export function buyTheme(state, id) {
  const theme = THEMES.find(t => t.id === id);
  if (!theme || state.temple.themes.includes(id) || state.coins < theme.price) return false;
  state.coins -= theme.price;
  state.temple.themes.push(id);
  state.temple.theme = id;
  save(state);
  return true;
}

export function useTheme(state, id) {
  if (!state.temple.themes.includes(id)) return false;
  state.temple.theme = id;
  save(state);
  return true;
}

export function rankFor(coins) {
  let i = 0;
  while (i + 1 < RANKS.length && coins >= RANKS[i + 1].coins) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], index: i, next, progress: next ? (coins - RANKS[i].coins) / (next.coins - RANKS[i].coins) : 1 };
}

// ---- Unlocking holds ----

export const isUnlocked = (state, id) => state.unlocked.includes(id);
export const unlockPrice = state => UNLOCK_PRICES[Math.min(state.purchased.length, UNLOCK_PRICES.length - 1)];

// Spends coins on a hold. Returns the badges earned, or null if it can't be bought.
export function unlockHold(state, id) {
  const price = unlockPrice(state);
  if (isUnlocked(state, id) || state.coins < price) return null;
  state.coins -= price;
  state.unlocked.push(id);
  state.purchased.push(id);
  const earned = [];
  const today = dayKey();
  for (const [badge, cond] of [['unlock', true], ['collector', HOLDS.every(h => isUnlocked(state, h.id))]]) {
    if (cond && !state.badges[badge]) { state.badges[badge] = today; earned.push(BADGES.find(b => b.id === badge)); }
  }
  save(state);
  return earned;
}

// ---- Body areas: spotting when one part of you has done a lot lately ----

const LOAD_HALF_LIFE = 24;  // hours for a session's work to count half as much
const OVERWORKED = 90;      // recent work (seconds × level) in one area that counts as a lot
const OVERWORKED_SHARE = 0.5;
export const LEANS_ON = 0.5;  // a hold "leans on" an area if it gets at least this weight

// Work per body area from recent sessions: seconds held × level multiplier, split by the
// hold's area weights, fading by half every day. `days` counts back without fading.
export function areaLoad(state, { now = Date.now(), days = null } = {}) {
  const load = Object.fromEntries(Object.keys(AREAS).map(a => [a, 0]));
  for (const h of state.history) {
    const hold = HOLDS.find(x => x.id === h.holdId);
    if (!hold || !h.at) continue;
    const hours = (now - new Date(h.at)) / 3.6e6;
    if (hours < 0 || hours > (days ? days * 24 : LOAD_HALF_LIFE * 4)) continue;
    const work = h.held * LEVEL_MULT[(h.level ?? 1) - 1] * (days ? 1 : 0.5 ** (hours / LOAD_HALF_LIFE));
    for (const [area, k] of Object.entries(hold.areas)) load[area] += work * k;
  }
  return load;
}

// The area doing most of the recent work, if it's doing a lot of it, or null.
export function overworked(state, now = Date.now()) {
  const load = areaLoad(state, { now });
  const total = Object.values(load).reduce((a, b) => a + b, 0);
  const [area, work] = Object.entries(load).sort((a, b) => b[1] - a[1])[0];
  return work >= OVERWORKED && work / total >= OVERWORKED_SHARE ? { area, name: AREAS[area], work } : null;
}

export const leansOn = (hold, area) => (hold.areas[area] ?? 0) >= LEANS_ON;

// Holds that spare an overworked area: unlocked ones first (soft ones first among
// those), least recently done first.
export function restingHolds(state, area, n = 3) {
  const last = id => holdState(state, id).last ?? '';
  const spare = HOLDS.filter(h => (h.areas[area] ?? 0) <= 0.2);
  const order = (a, b) => (a.style === 'soft' ? 0 : 1) - (b.style === 'soft' ? 0 : 1) || last(a.id).localeCompare(last(b.id));
  const unlocked = spare.filter(h => isUnlocked(state, h.id)).sort(order);
  return { unlocked: unlocked.slice(0, n), locked: unlocked.length ? [] : spare.filter(h => !isUnlocked(state, h.id)).sort(order).slice(0, n) };
}

// ---- Hold of the day ----

// Small seeded random number generator (mulberry32), seeded from the date.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same for the whole day: a date-seeded shuffle of all holds, taking the first
// one you've unlocked (skipping the last hold of the day, and any that lean on an area
// you've overworked, if there's another choice). Saved, so it doesn't change later in the day.
export function dailyHold(state, today = dayKey()) {
  if (state.daily?.day === today && isUnlocked(state, state.daily.holdId)) return HOLDS.find(h => h.id === state.daily.holdId);
  const rand = seeded(today);
  const order = HOLDS.map(h => [rand(), h]).sort((a, b) => a[0] - b[0]).map(([, h]) => h);
  const over = overworked(state), last = state.daily?.holdId;
  const fresh = order.filter(h => isUnlocked(state, h.id) && h.id !== last);
  const open = fresh.length ? fresh : order.filter(h => isUnlocked(state, h.id));
  const hold = (over && open.find(h => !leansOn(h, over.area))) || open[0] || HOLDS[0];
  state.daily = { day: today, holdId: hold.id };
  save(state);
  return hold;
}

export const isDaily = (state, id) => state.daily?.day === dayKey() && state.daily.holdId === id;
// The hold of the day's multiplier is for its first proper session each day.
export const dailyAvailable = (state, id) => isDaily(state, id) && !state.daily.used;

export function totals(state) {
  const time = state.history.reduce((t, h) => t + h.held, 0);
  let bestStreak = 0, run = 0, prev = null;
  for (const day of Object.keys(state.days).sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = day;
  }
  return { time, sessions: state.history.length, bestStreak };
}

// Random unlocked hold, favouring ones not practised lately.
export function pickHold(state, exclude) {
  const today = dayKey();
  const over = overworked(state);
  const weights = HOLDS.map(h => {
    if (h.id === exclude || !isUnlocked(state, h.id)) return 0;
    const hs = holdState(state, h.id);
    let days = 7;
    if (hs.last) days = Math.min(7, Math.round((new Date(today) - new Date(hs.last)) / 864e5));
    // Much less likely to pick a hold that leans on an overworked area.
    return (1 + days + (hs.mastered ? 0 : 2) + (h.camera ? 1 : 0)) * (over && leansOn(h, over.area) ? 0.15 : 1);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < HOLDS.length; i++) { r -= weights[i]; if (r <= 0) return HOLDS[i]; }
  return HOLDS[0];
}

// Records a finished session and works out everything that changed.
export function recordSession(state, s) {
  const today = dayKey();
  protectStreak(state, today);  // in case the day rolled over with the app open
  const hold = HOLDS.find(h => h.id === s.holdId);
  const hs = holdState(state, s.holdId);
  const before = { rank: rankFor(state.lifetime), streak: streak(state) };
  // One-sided holds only count as reached when both sides hit their target.
  const reached = s.reached ?? s.held >= s.target;

  // The session's coins already include the streak bonus and any milestone-day double
  // (see coinBoost), passed in as s.boost.
  let coins = Math.round(s.coins);
  if (s.daily && isDaily(state, s.holdId) && s.held >= DAILY_MIN_SECONDS) state.daily.used = true;
  // Bonus time only counts at your current level (or a level test), and soft holds count half.
  const bonusX = s.level >= hs.level ? (s.bonus ?? 0) * (hold.style === 'soft' ? 0.5 : 1) : 0;

  // Personal bests: seconds held, or cycles for flowing holds.
  const measure = s.unit === 'cycles' ? s.count : Math.round(s.held * 10) / 10;
  const prevBest = hs.best[s.level] ?? 0;
  const pb = measure > prevBest && (s.unit === 'cycles' ? measure >= 1 : measure >= 5);
  if (pb) hs.best[s.level] = measure;

  // Level test-out: pass the next level's target with good form to unlock it now.
  // Passing is free; not passing costs the test price.
  let levelUp = false, mastered = false, qualified = false, test = null;
  if (s.test) {
    const passed = reached && (!s.camera || s.avgForm >= TEST_FORM);
    if (passed) { hs.level = s.level; hs.qualDays = []; levelUp = true; }
    else state.coins = Math.max(0, state.coins - testPrice(s.level));
    test = { passed, price: testPrice(s.level) };
  }
  const formOk = !s.camera || s.avgForm >= QUALIFY_FORM;
  if (!s.test && reached && formOk && s.level === hs.level && !hs.mastered && !hs.qualDays.includes(today)) {
    hs.qualDays.push(today);
    qualified = true;
    if (hs.qualDays.length >= QUALIFY_DAYS) {
      if (hs.level < 4) { hs.level++; levelUp = true; } else { hs.mastered = true; mastered = true; }
      hs.qualDays = [];
    }
  }
  hs.sessions++;
  hs.totalTime += s.held;
  hs.last = today;
  state.holds[s.holdId] = hs;

  state.coins += coins;
  state.lifetime += coins;
  const day = state.days[today] ?? { coins: 0, time: 0, sessions: 0 };
  day.coins += coins; day.time += s.held; day.sessions++;
  state.days[today] = day;
  state.history.push({
    at: new Date().toISOString(), holdId: s.holdId, level: s.level, held: Math.round(s.held * 10) / 10,
    target: s.target, avgForm: s.camera ? Math.round(s.avgForm) : null, coins, camera: s.camera, daily: !!s.daily,
  });
  if (state.history.length > 1000) state.history.splice(0, state.history.length - 1000);

  // Bet progress, then settle (the stakes were paid when the bets were placed).
  const betSteps = [];  // bonus time steps reached in this session
  for (const b of [state.bet, state.weekBet].filter(Boolean)) {
    if (reached && !b.holds.includes(s.holdId)) b.holds.push(s.holdId);
    b.time += s.held;
    if (!b.days.includes(today)) b.days.push(today);
    if ((b.id === 'form90' && reached && s.camera && s.avgForm >= 90) || (b.id === 'pb' && pb)) b.done = true;
    if (b.id === 'bonus') {
      // Steps are reached within a single hold, so keep today's best, not a running total.
      b.bonus = Math.max(b.bonus ?? 0, bonusX);
      const steps = betDef('bonus').steps;
      while (b.paid < steps.length && b.bonus >= steps[b.paid].x) {
        const step = steps[b.paid];
        state.coins += step.coins;
        state.lifetime += step.coins;
        b.paidCoins = (b.paidCoins ?? 0) + step.coins;
        b.paid++;
        betSteps.push({ ...step, n: b.paid, of: steps.length });
      }
    }
  }
  const bets = settleBets(state, today, { notify: false });  // the summary screen shows them
  const milestones = claimMilestones(state, today);
  // Some milestones make today a double-coins day, starting with this session.
  let milestoneDouble = 0;
  if (milestones.some(m => m.double) && state.doubleDay !== today) {
    state.doubleDay = today;
    if (!s.boostDouble) {
      milestoneDouble = coins * (MILESTONE_DAY_MULT - 1);
      coins += milestoneDouble;
      state.coins += milestoneDouble; state.lifetime += milestoneDouble;
      state.days[today].coins += milestoneDouble;
      state.history.at(-1).coins = coins;
    }
  }

  // Badges
  const t = totals(state);
  const st = streak(state);
  const earn = [];
  const check = (id, cond) => { if (cond && !state.badges[id]) { state.badges[id] = today; earn.push(BADGES.find(b => b.id === id)); } };
  check('first', true);
  check('target', reached);
  check('perfect', reached && s.camera && s.avgForm >= 90);
  check('overtime', s.unit === 'cycles' ? s.count >= s.goal * 1.5 : s.held >= s.target * 1.5);
  check('streak3', st >= 3);
  check('streak7', st >= 7);
  check('streak30', st >= 30);
  check('levelup', levelUp);
  check('rounded', HOLDS.every(h => state.holds[h.id]?.sessions));
  check('ironhorse', hold.id === 'horse' && s.level === 4 && reached);
  check('master', mastered);
  check('min30', t.time >= 1800);
  check('min120', t.time >= 7200);
  check('early', new Date().getHours() >= 4 && new Date().getHours() < 7);
  check('daily', reached && s.daily);

  save(state);
  // The cheapest locked hold's price, to nudge towards the next unlock.
  const locked = HOLDS.filter(h => !isUnlocked(state, h.id));
  return {
    coins, streak: st, reached, pb, prevBest, milestoneDouble,
    qualified, qualDays: hs.qualDays.length, levelUp, mastered, newLevel: hs.level, test, bets, betSteps, milestones,
    badges: earn, rankUp: rankFor(state.lifetime).index > before.rank.index, rank: rankFor(state.lifetime),
    wallet: state.coins, nextUnlock: locked.length ? unlockPrice(state) : null,
  };
}
