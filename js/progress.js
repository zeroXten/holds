// Progress kept in localStorage: coins, unlocked holds, the hold of the day,
// levels, streaks, personal bests and badges.

import { HOLDS, HOLD_GROUPS, AREAS } from './holds.js';
import { DAY_TYPES, FALLBACK, DEFAULT_PLAN, MAX_SETS, PLAN_COINS, MINUTES, LENGTHS, FOCUSES, dayBudget, focusByKey, setSeconds } from './plans.js';
import {
  STARTER_HOLDS, UNLOCK_PRICES, REST_DAY_PRICE, REST_DAYS_PER_WEEK, FREEZE_PRICE, FREEZE_MAX,
  REPAIR_PRICE_PER_DAY, REPAIR_WINDOW_DAYS, BETS, LEVEL_UP_COINS, testPrice, TEMPLE_TIERS, TEMPLE_ITEMS, THEMES, OLD_THEME_PRICES, FRAMES, SEASONS, inSeason, inBloom, STREAK_MILESTONES, LEVEL_MULT,
  AVATAR_CHARACTERS, AVATAR_OUTFITS, AVATAR_ACCESSORIES,
  DAILY_MIN_SECONDS, STREAK_STEP, STREAK_MAX_WEEKS, MILESTONE_DAY_MULT, TEACHING_PRICE,
} from './economy.js';
import { TEACHINGS, teachingById } from './teachings.js';

const KEY = 'holds.v1';
// Levelling up a hold: reach its target on this many different days, with this average
// form or better, on camera (honour sessions earn coins but don't count). By current level;
// the 4th is for mastering it.
export const QUALIFY_DAYS = [7, 14, 21, 28];
export const QUALIFY_FORM = [70, 75, 80, 85, 90];  // the last for the mastery test
export const qualifyDays = level => QUALIFY_DAYS[level - 1];
export const qualifyForm = level => QUALIFY_FORM[level - 1];

// Sashes go by mastery points: one for each level reached beyond the first on any hold,
// and one more for mastering it (so up to 4 a hold). Skill, not coins.
export const RANKS = [
  { points: 0, key: 'white', name: 'White Sash', color: '#f4efe6' },
  { points: 2, key: 'yellow', name: 'Yellow Sash', color: '#f2c230' },
  { points: 5, key: 'orange', name: 'Orange Sash', color: '#ee8a2a' },
  { points: 9, key: 'green', name: 'Green Sash', color: '#4f9d4a' },
  { points: 14, key: 'blue', name: 'Blue Sash', color: '#3a73c9' },
  { points: 20, key: 'purple', name: 'Purple Sash', color: '#7d4fc0' },
  { points: 28, key: 'brown', name: 'Brown Sash', color: '#8a5a32' },
  { points: 38, key: 'red', name: 'Red Sash', color: '#c8322b' },
  { points: 50, key: 'black', name: 'Black Sash', color: '#1d1a17' },
  // Degrees (duan) of the black sash, shown as gold bands.
  { points: 65, key: 'duan1', name: 'Black Sash · 1st Duan', color: '#1d1a17', degree: 1 },
  { points: 80, key: 'duan2', name: 'Black Sash · 2nd Duan', color: '#1d1a17', degree: 2 },
  { points: 95, key: 'duan3', name: 'Black Sash · 3rd Duan', color: '#1d1a17', degree: 3 },
  { points: 110, key: 'duan4', name: 'Black Sash · 4th Duan', color: '#1d1a17', degree: 4 },
  { points: 125, key: 'duan5', name: 'Black Sash · 5th Duan', color: '#1d1a17', degree: 5 },
];
export const sashByKey = key => RANKS.find(r => r.key === key);

// In roughly the order you'll earn them, in three stages: getting started (the first
// days), the path (the weeks and months of regular training) and mastery.
export const BADGE_TIERS = [
  { id: 'start', name: 'Getting started' },
  { id: 'path', name: 'On the path' },
  { id: 'mastery', name: 'Mastery' },
];
export const BADGES = [
  { id: 'first', tier: 'start', name: 'First Stance', desc: 'Finish your first hold' },
  { id: 'target', tier: 'start', name: 'On Target', desc: 'Reach a target time' },
  { id: 'perfect', tier: 'start', name: 'Perfect Form', desc: 'Reach a target with 90+ average form' },
  { id: 'overtime', tier: 'start', name: 'Beyond the Target', desc: 'Hold 50% past a target' },
  { id: 'daily', tier: 'start', name: 'Daily Devotion', desc: 'Reach the target on the hold of the day' },
  { id: 'streak3', tier: 'start', name: 'Three Days', desc: 'Train 3 days in a row' },
  { id: 'unlock', tier: 'start', name: 'New Stance', desc: 'Unlock a hold with coins' },
  { id: 'early', tier: 'start', name: 'Early Bird', desc: 'Train between 4 and 7am' },
  { id: 'min30', tier: 'start', name: 'Half Hour', desc: 'Hold for 30 minutes in total' },
  { id: 'fiveholds', tier: 'start', name: 'Full Session', desc: 'Reach the target on 5 different holds in one day' },
  { id: 'streak7', tier: 'path', name: 'Full Week', desc: 'Train 7 days in a row' },
  { id: 'levelup', tier: 'path', name: 'Promoted', desc: 'Level up a hold' },
  { id: 'tenholds', tier: 'path', name: 'Ten Stances', desc: 'Practise 10 different holds' },
  { id: 'min120', tier: 'path', name: 'Two Hours', desc: 'Hold for 2 hours in total' },
  { id: 'days20', tier: 'path', name: 'Twenty Days', desc: 'Train on 20 different days' },
  { id: 'sessions100', tier: 'path', name: 'Hundred Holds', desc: 'Finish 100 holds' },
  { id: 'level3', tier: 'path', name: 'Third Level', desc: 'Reach level 3 on any hold' },
  { id: 'broad', tier: 'path', name: 'Broad Base', desc: 'Reach level 2 on 10 holds' },
  { id: 'streak30', tier: 'path', name: 'Iron Discipline', desc: 'Train 30 days in a row' },
  { id: 'min600', tier: 'path', name: 'Ten Hours', desc: 'Hold for 10 hours in total' },
  { id: 'level4', tier: 'path', name: 'Summit in Sight', desc: 'Reach level 4 on any hold' },
  { id: 'collector', tier: 'mastery', name: 'Full Set', desc: 'Unlock every hold' },
  { id: 'rounded', tier: 'mastery', name: 'Well Rounded', desc: 'Practise every hold' },
  { id: 'ironhorse', tier: 'mastery', name: 'Iron Horse', desc: 'Reach the Full Horse target' },
  { id: 'master', tier: 'mastery', name: 'Master of One', desc: 'Master any hold' },
  { id: 'master5', tier: 'mastery', name: 'Master of Five', desc: 'Master 5 holds' },
];

export const DEFAULT_SETTINGS = { holdList: null, voice: true, sounds: true, camera: true, autoframe: true, showValues: false, calm: true, strictness: 'normal', model: 'full', appearance: 'system', ambient: false };

const blank = () => ({
  version: 2, coins: 0, lifetime: 0, unlocked: [...STARTER_HOLDS], purchased: [], daily: null,
  holds: {}, history: [], days: {}, badges: {}, settings: { ...DEFAULT_SETTINGS },
  // covered: days that keep the streak alive without training ('rest' | 'freeze' | 'repair')
  streak: { freezes: 0, covered: {}, broken: null, claimed: {} },  // claimed: milestone days → the streak's start date
  bet: null,      // today's bet
  weekBet: null,  // a weekly bet, running alongside
  betLog: [],  // settled bets, newest first
  temple: { tier: 0, owned: [], hidden: [], theme: 'dawn', themes: THEMES.map(t => t.id), frame: 'none', frames: ['none'] },  // hidden: owned but put away
  // Your monk: what's worn, what's owned, and whether it stands in the temple.
  avatar: { character: 'young', outfit: 'saffron', wear: {}, owned: ['young', 'saffron'], inTemple: true },
  notices: [],  // messages to show once (a freeze was used, a bet was won...)
  starred: [],  // holds you've starred: your daily holds, done every day (see todaysList)
  // The donation box: teachings received (id → the day), in order, the day's, and starred ones.
  teachings: { got: {}, order: [], today: null, starred: [] },
  // Coins by day beyond the sessions' own (those are in days): spent, and earned from
  // milestones, bets and plans. Kept apart from days, since a day there means you trained.
  ledger: {}, ledgerSince: dayKey(),
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
      let refunded = false;
      // A running "new personal best" bet (now retired) gets its stake back.
      if (data.bet?.id === 'pb') { data.coins = (data.coins ?? 0) + 10; data.bet = null; data.notices = [...(data.notices ?? []), 'The personal best bet has been retired: your 10-coin stake is back.']; }
      // The times of day are free now: refund any that were bought, and make them all available.
      if (data.temple && !data.temple.themesFree) {
        const refund = (data.temple.themes ?? []).reduce((t, id) => t + (OLD_THEME_PRICES[id] ?? 0), 0);
        data.temple.themes = [...new Set([...(data.temple.themes ?? []), ...THEMES.map(t => t.id)])];
        data.temple.themesFree = true;
        if (refund) { data.coins = (data.coins ?? 0) + refund; data.notices = [...(data.notices ?? []), `Dawn, Day, Dusk and Night are free now: your ${refund} coins for them are back.`]; }
        refunded = true;
      }
      // Weekly bets used to share the one bet slot; they have their own now.
      if (data.bet && (BETS.find(b => b.id === data.bet.id)?.days ?? 1) > 1) { data.weekBet = data.bet; data.bet = null; }
      // The Temple Hall used to be a decoration; now it's a stage of the temple.
      if (data.temple?.owned?.includes('hall')) {
        data.temple.owned = data.temple.owned.filter(id => id !== 'hall');
        data.temple.tier = Math.max(data.temple.tier ?? 0, TEMPLE_TIERS.findIndex(t => t.id === 'hall'));
      }
      // The hold list setting was 'list' (always set, so it couldn't tell a choice from the
      // default); only a choice of Starred carries over.
      if (data.settings?.list) {
        if (data.settings.list === 'starred') data.settings.holdList ??= 'starred';
        delete data.settings.list;
      }
      // Saves from before the ledger only have spending from now on.
      data.ledger ??= {}; data.ledgerSince ??= dayKey();
      // Starter holds added since this save was made are free too.
      data.unlocked = [...new Set([...(data.unlocked ?? []), ...STARTER_HOLDS])];
      const state = {
        ...fresh, ...data,
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
        streak: { ...fresh.streak, ...data.streak },
        temple: { ...fresh.temple, ...data.temple },
        avatar: { ...fresh.avatar, ...data.avatar },
        teachings: { ...fresh.teachings, ...data.teachings },
      };
      if (refunded) save(state);  // so the refund can't happen twice
      return state;
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

// Coins in and out, booked by day for the charts.
function book(state, kind, n, day = dayKey()) {
  const l = (state.ledger ??= {})[day] ??= {};
  l[kind] = (l[kind] ?? 0) + n;
}
function spend(state, n) { state.coins -= n; book(state, 'spent', n); }
function gain(state, n) { state.coins += n; state.lifetime += n; book(state, 'earned', n); }

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
  // The first week of a streak earns the normal rate; each full week adds STREAK_STEP
  // (+5% from day 8, +10% from day 15...).
  const weeks = Math.floor(Math.max(days - 1, 0) / 7);
  const streakMult = 1 + STREAK_STEP * Math.min(weeks, STREAK_MAX_WEEKS);
  const nextStepIn = weeks < STREAK_MAX_WEEKS ? 7 * (weeks + 1) + 1 - days : null;  // days until it next rises
  const double = state.doubleDay === today;
  return { days, streakMult, nextStepIn, double, total: streakMult * (double ? MILESTONE_DAY_MULT : 1) };
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
    gain(state, coins);
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
  spend(state, b.price);
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
  spend(state, FREEZE_PRICE);
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
  spend(state, REST_DAY_PRICE);
  state.streak.covered[day] = 'rest';
  save(state);
  return true;
}

export function cancelRest(state, day, today = dayKey()) {
  if (state.streak.covered[day] !== 'rest' || day <= today) return false;
  delete state.streak.covered[day];
  spend(state, -REST_DAY_PRICE);  // a refund
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
  spend(state, def.stake);
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
  } else if (result === 'won') gain(state, def.payout);
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

// ---- Your monk ----

const AVATAR_KINDS = { character: AVATAR_CHARACTERS, outfit: AVATAR_OUTFITS, accessory: AVATAR_ACCESSORIES };
export const avatarItem = (kind, id) => AVATAR_KINDS[kind]?.find(i => i.id === id);
export const ownsAvatar = (state, id) => state.avatar.owned.includes(id);

// Buying something puts it on straight away.
export function buyAvatarItem(state, kind, id) {
  const item = avatarItem(kind, id);
  if (!item || ownsAvatar(state, id) || state.coins < item.price) return false;
  spend(state, item.price);
  state.avatar.owned.push(id);
  wearAvatarItem(state, kind, id);
  return true;
}

// Characters and outfits swap; an accessory goes in its slot, or comes off if it's already on.
export function wearAvatarItem(state, kind, id) {
  const item = avatarItem(kind, id);
  if (!item || !ownsAvatar(state, id)) return false;
  const a = state.avatar;
  if (kind === 'accessory') a.wear = { ...a.wear, [item.slot]: a.wear[item.slot] === id ? null : id };
  else a[kind] = id;
  save(state);
  return true;
}

export function toggleAvatarInTemple(state) {
  state.avatar.inTemple = !state.avatar.inTemple;
  save(state);
}

// What the drawing needs: the choices plus the sash for your rank.
export function avatarLook(state) {
  const r = sashRank(state), a = state.avatar;
  return { character: a.character, outfit: a.outfit, wear: a.wear, sash: r.color, degree: r.degree ?? 0 };
}

// ---- The temple ----

export const owns = (state, id) => state.temple.owned.includes(id);
export const isHidden = (state, id) => (state.temple.hidden ?? []).includes(id);
// What's on show: everything you own that you haven't put away.
export const shownItems = (state, date = new Date()) => state.temple.owned.filter(id => !isHidden(state, id) && inBloom(id, date));

// The seasonal packs on sale today.
export const activeSeasons = (date = new Date()) => SEASONS.filter(s => inSeason(s, date));

// Seasonal themes are kept with your themes; everything else with your decorations.
export const ownsSeasonal = (state, item) => (item.theme ? state.temple.themes.includes(item.id) : owns(state, item.id));

export function buySeasonalItem(state, id, date = new Date()) {
  const season = SEASONS.find(s => s.items.some(i => i.id === id)), item = season?.items.find(i => i.id === id);
  if (!item || !inSeason(season, date) || ownsSeasonal(state, item) || state.coins < item.price) return false;
  spend(state, item.price);
  if (item.theme) { state.temple.themes.push(id); state.temple.theme = id; } else state.temple.owned.push(id);
  save(state);
  return true;
}

// Put an owned decoration away, or bring it back out.
export const isStarred = (state, id) => state.starred.includes(id);

export function toggleStar(state, id) {
  state.starred = isStarred(state, id) ? state.starred.filter(x => x !== id) : [...state.starred, id];
  save(state);
}

export function toggleTempleItem(state, id) {
  if (!owns(state, id)) return false;
  const hidden = state.temple.hidden ?? [];
  state.temple.hidden = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
  save(state);
  return true;
}

// The next stage of the temple, or null at the last one.
export const nextTier = state => TEMPLE_TIERS[(state.temple.tier ?? 0) + 1] ?? null;

export function upgradeTemple(state) {
  const next = nextTier(state);
  if (!next || state.coins < next.price || !hasSash(state, next.sash)) return false;
  spend(state, next.price);
  state.temple.tier = (state.temple.tier ?? 0) + 1;
  save(state);
  return true;
}

export const canBuild = (state, item) => (state.temple.tier ?? 0) >= (item.needs ?? 0);

export function buyTempleItem(state, id) {
  const item = TEMPLE_ITEMS.find(i => i.id === id);
  if (!item || owns(state, id) || !canBuild(state, item) || state.coins < item.price) return false;
  spend(state, item.price);
  state.temple.owned.push(id);
  save(state);
  return true;
}

export function buyTheme(state, id) {
  const theme = THEMES.find(t => t.id === id);
  if (!theme || state.temple.themes.includes(id) || state.coins < theme.price) return false;
  spend(state, theme.price);
  state.temple.themes.push(id);
  state.temple.theme = id;
  save(state);
  return true;
}

export function buyFrame(state, id) {
  const f = FRAMES.find(x => x.id === id);
  if (!f || state.temple.frames.includes(id) || state.coins < f.price) return false;
  spend(state, f.price);
  state.temple.frames.push(id);
  state.temple.frame = id;
  save(state);
  return true;
}

export function useFrame(state, id) {
  if (!state.temple.frames.includes(id)) return false;
  state.temple.frame = id;
  save(state);
  return true;
}

export function useTheme(state, id, date = new Date()) {
  if (!state.temple.themes.includes(id) || !inBloom(id, date)) return false;
  state.temple.theme = id;
  save(state);
  return true;
}

export function rankFor(points) {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].points) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], index: i, next, points, progress: next ? (points - RANKS[i].points) / (next.points - RANKS[i].points) : 1 };
}

export const masteryPoints = state => HOLDS.reduce((t, h) => {
  const hs = state.holds[h.id];
  return hs ? t + (hs.level - 1) + (hs.mastered ? 1 : 0) : t;
}, 0);
export const sashRank = state => rankFor(masteryPoints(state));
// Whether your sash is at least `key` (no key: nothing needed).
export const hasSash = (state, key) => !key || sashRank(state).index >= RANKS.indexOf(sashByKey(key));

// ---- Unlocking holds ----

export const isUnlocked = (state, id) => state.unlocked.includes(id);
// All the days for the next level (or mastery) are in, so its test is open.
export const readyForTest = hs => !hs.mastered && hs.qualDays.length >= qualifyDays(hs.level);
// This hold's day is done: a day counted towards the next level, or a level test passed.
export const doneToday = (hs, today = dayKey()) => hs.qualDays.includes(today) || hs.passedOn === today;
// A level test for this hold has already been taken today.
export const testedToday = (state, id, today = dayKey()) => holdState(state, id).lastTest === today;
// What you can open and train: everything in test mode, otherwise what you've unlocked.
// (Unlock prices, the hold of the day and badges go by what you've really unlocked.)
export const isOpen = (state, id) => !!state.testMode || isUnlocked(state, id);

// Test mode: every hold and level open for trying out; sessions aren't recorded or paid.
export function setTestMode(state, on) {
  state.testMode = on;
  save(state);
}
export const unlockPrice = state => UNLOCK_PRICES[Math.min(state.purchased.length, UNLOCK_PRICES.length - 1)];

// Spends coins on a hold. Returns the badges earned, or null if it can't be bought.
export function unlockHold(state, id) {
  const price = unlockPrice(state), hold = HOLDS.find(h => h.id === id);
  if (isUnlocked(state, id) || state.coins < price || !hasSash(state, hold?.sash)) return null;
  spend(state, price);
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

// ---- Body areas ----

const LOAD_HALF_LIFE = 24;  // hours for a session's work to count half as much

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
// one you've unlocked (skipping the last hold of the day, if there's another choice).
// Saved, so it doesn't change later in the day.
export function dailyHold(state, today = dayKey()) {
  if (state.daily?.day === today && isUnlocked(state, state.daily.holdId)) return HOLDS.find(h => h.id === state.daily.holdId);
  const rand = seeded(today);
  const order = HOLDS.map(h => [rand(), h]).sort((a, b) => a[0] - b[0]).map(([, h]) => h);
  const last = state.daily?.holdId;
  const fresh = order.filter(h => isUnlocked(state, h.id) && h.id !== last);
  const open = fresh.length ? fresh : order.filter(h => isUnlocked(state, h.id));
  const hold = open[0] || HOLDS[0];
  state.daily = { day: today, holdId: hold.id };
  save(state);
  return hold;
}

// ---- Plans ----

// Sets of a hold done on a day: sessions that got at least halfway to the target.
export const setsDone = (state, holdId, day = dayKey()) =>
  state.history.filter(h => h.holdId === holdId && h.held >= h.target / 2 && dayKey(new Date(h.at)) === day).length;

// How a plan day went: 'full' (every set done), 'part' (some) or null (none).
function planDayStatus(state, picks, day) {
  const done = picks.map(p => setsDone(state, p.holdId, day) >= p.sets);
  return picks.length && done.every(Boolean) ? 'full' : picks.some(p => setsDone(state, p.holdId, day)) ? 'part' : null;
}

// Whether you've held anything today.
export const trainedOn = (state, day = dayKey()) => state.history.some(h => dayKey(new Date(h.at)) === day);

// Starts a plan from its first day: { minutes, focus, weeks }, each checked against the choices.
// Picked after you've trained today, it starts tomorrow: today's holds belong to the day
// you've had (often the last day of the plan before), not to the new plan's day 1.
export function startPlan(state, choice = {}, today = dayKey()) {
  const old = state.plan ?? {};
  const start = trainedOn(state, today) ? addDays(today, 1) : today;
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  state.plan = {
    minutes: pick(choice.minutes, MINUTES, DEFAULT_PLAN.minutes),
    focus: pick(choice.focus, FOCUSES.map(f => f.key), DEFAULT_PLAN.focus),
    weeks: pick(choice.weeks, LENGTHS, DEFAULT_PLAN.weeks),
    start, step: 0, day: null, picks: [], cycle: [], done: null,
    // The last plan day's holds and main sections, to give them a day's rest.
    prev: old.prev ?? [], prevMains: old.prevMains ?? [],
    points: sashRank(state).points,  // to count mastery points earned during the plan
    finished: old.finished ?? 0,
  };
  return planToday(state, today);
}

// Whether you're on a plan (or have just finished one): plans are only ever ones you chose.
// A plan set up automatically before that (`chosen: false`) or from before plans had choices
// doesn't count.
export const hasPlan = state => !!state.plan?.minutes && state.plan.chosen !== false;

// A plan picked after training that starts tomorrow: nothing to do on it today.
export const planWaiting = (state, today = dayKey()) => hasPlan(state) && !state.plan.done && state.plan.start > today;

// Stops the plan: back to training whatever you like. Keeps the count of plans finished.
export function endPlan(state) {
  const old = state.plan ?? {};
  state.plan = { finished: old.finished ?? 0, prev: old.prev ?? [], prevMains: old.prevMains ?? [] };
  if (state.settings.holdList === 'plan') delete state.settings.holdList;
  save(state);
}

// The card inviting you to build a plan, while you don't have one: shown until you dismiss
// it, then once more after a few more sessions.
export const PLAN_INVITE_AFTER = 3;
const sessionCount = state => Object.values(state.days).reduce((t, d) => t + (d.sessions ?? 0), 0);
export function showPlanInvite(state) {
  if (hasPlan(state) || state.testMode) return false;
  const n = state.planInvite ?? { dismissed: 0, at: 0 };
  return n.dismissed === 0 || (n.dismissed === 1 && sessionCount(state) >= n.at + PLAN_INVITE_AFTER);
}
export function dismissPlanInvite(state) {
  const n = state.planInvite ?? { dismissed: 0, at: 0 };
  state.planInvite = { dismissed: n.dismissed + 1, at: sessionCount(state) };
  save(state);
}

const planLength = p => p.weeks * 7;

// Today's plan: the day of the plan you're on, with its holds picked to fill its minutes,
// or null with no plan. Worked out once a day and kept. The plan moves on from a day you
// did any of it; a day you didn't waits for you. After the last day the plan is done
// (p.done) until you start another.
export function planToday(state, today = dayKey()) {
  if (!hasPlan(state)) return null;
  const p = state.plan;
  if (p.day === today) return p;
  if (planWaiting(state, today)) { p.picks = []; return p; }
  if (p.day && !p.done) {
    const status = planDayStatus(state, p.picks, p.day);
    if (status) advancePlan(state, status, today);
  }
  dailyHold(state, today);
  p.day = today;
  p.picks = p.done ? [] : fillPlanDay(state, p, today);
  save(state);
  return p;
}

function advancePlan(state, status, today) {
  const p = state.plan;
  p.cycle[p.step] = status;
  p.prev = p.picks.map(x => x.holdId);
  p.prevMains = p.picks.filter(x => x.main).map(x => x.group);
  if (++p.step < planLength(p)) return;
  // The end of the plan: coins for each day trained, more for full days.
  const full = p.cycle.filter(c => c === 'full').length, part = p.cycle.filter(c => c === 'part').length;
  const coins = full * PLAN_COINS.full + part * PLAN_COINS.part;
  const time = state.history.filter(h => dayKey(new Date(h.at)) >= p.start).reduce((t, h) => t + h.held, 0);
  gain(state, coins);
  p.done = { on: today, coins, full, part, days: planLength(p), time: Math.round(time), points: sashRank(state).points - p.points, seen: false };
  p.finished++;
}

// After a session: whether it finished today's plan (once a day), and if it was the plan's
// last day, the finished plan. A last day only partly done finishes the plan the next day.
function planAfterSession(state, today) {
  const p = state.plan;
  if (!hasPlan(state) || p.done || p.day !== today || p.fullOn === today) return null;
  if (planDayStatus(state, p.picks, today) !== 'full') return null;
  p.fullOn = today;
  if (p.step === planLength(p) - 1) advancePlan(state, 'full', today);
  return { dayDone: true, done: p.done };
}

// Your starred holds are your daily ones: one set each, every day. With a plan they're
// mixed into today's list (but the plan's days and coins only ever count its own holds,
// so starring a hold never makes a plan harder to finish); without one they're the list.
// Starred holds you haven't unlocked yet wait until you have.
export function dailyStarred(state) {
  const groupOf = id => HOLD_GROUPS.find(g => g.ids.includes(id))?.key;
  return state.starred.filter(id => isOpen(state, id) && HOLDS.some(h => h.id === id))
    .map(id => ({ holdId: id, sets: 1, group: groupOf(id), starred: true }));
}

// Mixes daily holds into a plan day's list where they fit: after the plan's holds from the
// same section, so a day's core work stays together; a hard hold from another section
// after the plan's hard holds, while you're fresh; a soft one at the end to wind down,
// stillness last. A hold already in the plan isn't added again.
export function mixInDaily(picks, extras) {
  const list = [...picks];
  const style = x => HOLDS.find(h => h.id === x.holdId)?.style;
  const lastIndex = test => list.reduce((at, x, i) => (test(x) ? i : at), -1);
  for (const x of extras) {
    if (list.some(y => y.holdId === x.holdId)) continue;
    // Insert after `at` (-1: at the start, as when a hard hold joins a day of soft ones).
    let at = lastIndex(y => y.group === x.group);
    if (at < 0) at = style(x) === 'hard' ? lastIndex(y => style(y) === 'hard')
      : x.group === 'still' ? list.length - 1 : lastIndex(y => y.group !== 'still');
    list.splice(at + 1, 0, x);
  }
  return list;
}

// Today's whole list: the plan's holds (if a plan day is on) with your daily holds mixed in.
export function todaysList(state, today = dayKey()) {
  const p = planToday(state, today);
  const picks = p && !p.done && !planWaiting(state, today) ? p.picks : [];
  return mixInDaily(picks, dailyStarred(state));
}

// Seconds of holding in today's plan, as picked.
export const planSeconds = (state, picks) =>
  picks.reduce((t, x) => t + x.sets * setSeconds(HOLDS.find(h => h.id === x.holdId), holdState(state, x.holdId).level), 0);

// Fills a plan day from its day type's slots until it reaches the day's minutes, each slot
// with a different hold. A main slot (2+ sets) takes a hard hold if any are open, and the
// sections of the last plan day's main holds are skipped (a day's recovery). Easy days take
// soft holds only. Within a section it favours a hold with a test waiting, one not yet
// mastered, the hold of the day, and one not done lately, and avoids the holds of the last
// plan day. If the slots run out short of the minutes, the holds picked get more sets.
function fillPlanDay(state, p, today) {
  const type = DAY_TYPES[focusByKey(p.focus).week[p.step % 7]];
  const budget = dayBudget(p, p.step), slack = 30;
  const rand = seeded(`plan ${today}`);
  const holdOf = id => HOLDS.find(h => h.id === id);
  const secs = id => setSeconds(holdOf(id), holdState(state, id).level);
  const score = id => {
    const hs = holdState(state, id);
    const days = hs.last ? Math.min(7, Math.round((new Date(today) - new Date(hs.last)) / 864e5)) : 7;
    return rand() + days * 0.3 + (readyForTest(hs) ? 3 : 0) + (hs.mastered ? 0 : 2) + (isDaily(state, id) ? 2.5 : 0) - (p.prev.includes(id) ? 4 : 0);
  };
  // The day's own sections (its main slots'): a core day is mostly core.
  const theme = new Set(type.slots.filter(x => x.sets > 1).map(x => x.group));
  // No one hold takes over the day (a long sit on a legs day): a cap on its time. The main
  // hold may take a little more, for its repeat sets, and a hold from outside the day's
  // own sections less, so long qigong or stillness holds don't crowd out the day's theme.
  const capOf = (main, group) => budget * (type.easy ? 0.6 : main ? 0.5 : theme.has(group) ? 0.4 : 0.25);
  const used = new Set(), picks = [];
  let total = 0, next = 0;
  const short = () => total < budget - slack;
  // The next slots, up to `limit` holds in the day.
  const addHolds = limit => {
    for (; next < type.slots.length && picks.length < limit && short(); next++) {
      const slot = type.slots[next], main = slot.sets > 1;
      // A section the last plan day worked hard rests: no main hold from it, and at most
      // one light set of one of its holds.
      const resting = g => p.prevMains.includes(g) && (main || picks.some(x => x.group === g));
      // The first section with a hold for the slot, looking past the last plan day's holds
      // before taking one of them again.
      const keys = [slot.group, ...FALLBACK[slot.group]].filter(g => !resting(g));
      const optionsFor = (key, fresh) => HOLD_GROUPS.find(g => g.key === key).ids.filter(id => isOpen(state, id) && !used.has(id)
        && (!fresh || !p.prev.includes(id)) && (!type.easy || holdOf(id).style === 'soft')
        && secs(id) <= capOf(main, key) && total + secs(id) <= budget + slack);
      let key, options;
      for (const fresh of [true, false]) if ((key = keys.find(k => (options = optionsFor(k, fresh)).length))) break;
      if (!key) continue;
      const hard = options.filter(id => holdOf(id).style === 'hard');
      if (main && hard.length) options = hard;
      // A main hold short enough for its sets, if there is one.
      const fits = options.filter(id => slot.sets * secs(id) <= capOf(main, key));
      if (main && fits.length) options = fits;
      const best = options.map(id => [score(id), id]).sort((a, b) => b[0] - a[0])[0][1];
      // Longer days start with a third set of the main hold.
      const want = main && budget >= 480 ? slot.sets + 1 : slot.sets;
      const rests = p.prevMains.includes(key);
      const sets = rests ? 1 : Math.max(1, Math.min(want, Math.floor((budget + slack - total) / secs(best)), Math.floor(capOf(main, key) / secs(best))));
      used.add(best);
      picks.push({ holdId: best, sets, group: key, main, ...(rests && { rests }) });
      total += sets * secs(best);
    }
  };
  // Another set of each hold in turn while short of the minutes: the day's own sections
  // first (main holds, then the rest of the theme), going round them until they're full,
  // and only then the other holds.
  const ours = x => x.main || theme.has(x.group);
  const addSets = () => {
    for (const order of [[...picks.filter(x => x.main), ...picks.filter(x => !x.main && ours(x))], picks.filter(x => !ours(x))])
    for (let added = true; added && short();) {
      added = false;
      for (const x of order) {
        const s = secs(x.holdId);
        if (short() && !x.rests && x.sets < (ours(x) ? MAX_SETS.main : MAX_SETS.other) && (x.sets + 1) * s <= capOf(x.main, x.group) && total + s <= budget + slack) {
          x.sets++; total += s; added = true;
        }
      }
    }
  };
  // A few holds with more sets beats many holds once each (less setting up between), so
  // the day takes a handful of holds first, then more sets of them, then more holds if
  // it's still short.
  addHolds(2 + Math.ceil(budget / 300));
  addSets();
  addHolds(Infinity);
  addSets();
  return picks;
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
  const weights = HOLDS.map(h => {
    if (h.id === exclude || !isUnlocked(state, h.id)) return 0;
    const hs = holdState(state, h.id);
    let days = 7;
    if (hs.last) days = Math.min(7, Math.round((new Date(today) - new Date(hs.last)) / 864e5));
    return 1 + days + (hs.mastered ? 0 : 2) + (h.camera ? 1 : 0);
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
  const before = { rank: sashRank(state), streak: streak(state) };
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

  // Levelling up: reach the target at your level on enough days (on camera, with the
  // level's form), then pass the next level's test: its full target on camera with
  // that level's form. One test a day; passing is free, not passing costs the test
  // price (you need the coins to take it). After level 4's days comes the mastery test
  // (as level 5): level 4's position for much longer, with 90+ form (s.mastery).
  const testLevel = s.mastery ? 5 : s.level;
  let levelUp = false, mastered = false, qualified = false, test = null;
  if (s.test && readyForTest(hs) && testLevel === hs.level + 1 && hs.lastTest !== today && state.coins >= testPrice(testLevel)) {
    hs.lastTest = today;
    const passed = reached && s.camera && s.avgForm >= qualifyForm(testLevel);
    if (passed && testLevel === 5) { hs.mastered = true; hs.masteredOn = today; hs.qualDays = []; mastered = true; }
    // The test doesn't count towards the next level, but it's today's work on this hold.
    else if (passed) { hs.level = testLevel; hs.qualDays = []; hs.passedOn = today; levelUp = true; }
    else spend(state, testPrice(testLevel));
    test = { passed, mastery: testLevel === 5, form: qualifyForm(testLevel), price: testPrice(testLevel) };
  }
  // A day counts towards the next level when the target is reached at your level, on
  // camera, with the level's form.
  const formOk = s.camera && s.avgForm >= qualifyForm(hs.level);
  if (!s.test && reached && formOk && s.level === hs.level && !hs.mastered && !readyForTest(hs) && !doneToday(hs, today)) {
    hs.qualDays.push(today);
    qualified = true;
  }
  // A coin bonus for reaching a new level, or for mastering the hold.
  const levelBonus = mastered ? LEVEL_UP_COINS.mastered : levelUp ? LEVEL_UP_COINS[hs.level] ?? 0 : 0;
  coins += levelBonus;
  hs.sessions++;
  hs.totalTime += s.held;
  hs.last = today;
  state.holds[s.holdId] = hs;

  state.coins += coins;
  state.lifetime += coins;
  const day = state.days[today] ?? { coins: 0, time: 0, sessions: 0 };
  day.coins += coins; day.time += s.held; day.sessions++;
  if (levelUp || mastered) day.points = (day.points ?? 0) + 1;  // mastery points gained
  state.days[today] = day;
  state.history.push({
    at: new Date().toISOString(), holdId: s.holdId, level: s.level, held: Math.round(s.held * 10) / 10,
    target: s.target, avgForm: s.camera ? Math.round(s.avgForm) : null, coins, camera: s.camera, daily: !!s.daily, reached,
    ...(s.fault && { fault: s.fault }),
  });
  if (state.history.length > 1000) state.history.splice(0, state.history.length - 1000);
  const plan = planAfterSession(state, today);  // today's plan done, or the whole plan

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
        gain(state, step.coins);
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
  const holdStates = Object.values(state.holds);
  const reachedToday = new Set(state.history.filter(h => h.at && dayKey(new Date(h.at)) === today && (h.reached ?? h.held >= h.target)).map(h => h.holdId));
  check('fiveholds', reachedToday.size >= 5);
  check('tenholds', holdStates.filter(h => h.sessions).length >= 10);
  check('days20', Object.values(state.days).filter(d => d.sessions).length >= 20);
  check('sessions100', holdStates.reduce((n, h) => n + (h.sessions ?? 0), 0) >= 100);
  check('level3', holdStates.some(h => h.level >= 3 || h.mastered));
  check('broad', holdStates.filter(h => h.level >= 2 || h.mastered).length >= 10);
  check('min600', t.time >= 36000);
  check('level4', holdStates.some(h => h.level >= 4 || h.mastered));
  check('master5', holdStates.filter(h => h.mastered).length >= 5);

  save(state);
  // The cheapest locked hold's price, to nudge towards the next unlock.
  const locked = HOLDS.filter(h => !isUnlocked(state, h.id));
  return {
    coins, streak: st, reached, pb, prevBest, milestoneDouble,
    qualified, qualDays: hs.qualDays.length, levelUp, mastered, newLevel: hs.level, test, bets, betSteps, milestones,
    levelBonus, badges: earn, rankUp: sashRank(state).index > before.rank.index, rank: sashRank(state),
    wallet: state.coins, nextUnlock: locked.length ? unlockPrice(state) : null, plan,
  };
}

// ---------- The donation box ----------

// A teaching a day: once you've trained today, a few coins in the box. 'ready', 'given'
// (today's is had), 'train' (train first) or 'coins' (not enough).
export function teachingStatus(state, today = dayKey()) {
  if (state.teachings.today?.day === today) return 'given';
  if (!trainedOn(state, today)) return 'train';
  return state.coins < TEACHING_PRICE ? 'coins' : 'ready';
}
export const todaysTeaching = (state, today = dayKey()) =>
  state.teachings.today?.day === today ? teachingById(state.teachings.today.id) : null;

// What today has been: the holds trained (weakest form first) with the form check that
// slipped most in each, and anything that marks the day.
function teachingDay(state, today) {
  const sessions = state.history.filter(h => dayKey(new Date(h.at)) === today);
  const byHold = new Map();
  for (const h of sessions) {
    const x = byHold.get(h.holdId) ?? { holdId: h.holdId, form: 100, faults: [] };
    if (h.avgForm != null) x.form = Math.min(x.form, h.avgForm);
    if (h.fault) x.faults.push(h.fault);
    byHold.set(h.holdId, x);
  }
  const before = state.history.some(h => dayKey(new Date(h.at)) < addDays(today, -1));
  return {
    holds: [...byHold.values()].sort((a, b) => a.form - b.form),
    first: !state.teachings.order.length,
    mastery: Object.values(state.holds).some(hs => hs.mastered && hs.masteredOn === today),
    levelup: Object.values(state.holds).some(hs => hs.passedOn === today),
    plan: hasPlan(state) && state.plan.done?.on === today,
    return: before && !trainedOn(state, addDays(today, -1)),
  };
}

// The teaching for today. A moment first (your first, a level up, a finished plan, back
// after a gap); then technique and wisdom take turns (technique after anything else). Technique goes to what you trained
// today: the check that slipped most, then the hold itself, the shakiest hold first.
// Wisdom goes round its kinds. Ones you haven't had come first; once they're all had,
// the one you had longest ago.
export function pickTeaching(state, today = dayKey()) {
  const got = state.teachings.got, ctx = teachingDay(state, today);
  const best = list => list.filter(t => !got[t.id])[0]
    ?? (list.length ? [...list].sort((a, b) => got[a.id].localeCompare(got[b.id]))[0] : null);
  const fresh = list => list.filter(t => !got[t.id])[0] ?? null;
  for (const when of ['first', 'mastery', 'levelup', 'plan', 'return']) {
    if (!ctx[when]) continue;
    const t = fresh(TEACHINGS.filter(x => x.when === when));
    if (t) return t;
  }
  const n = state.teachings.order.length;
  const technique = () => {
    for (const h of ctx.holds) {
      for (const crit of h.faults) { const t = fresh(TEACHINGS.filter(x => x.hold === h.holdId && x.crit === crit)); if (t) return t; }
      const t = fresh(TEACHINGS.filter(x => x.hold === h.holdId));
      if (t) return t;
    }
    return fresh(TEACHINGS.filter(x => x.kind === 'technique' && isUnlocked(state, x.hold)));
  };
  const wisdom = () => {
    const kinds = ['buddhist', 'training', 'dao', 'martial'];
    const k = Math.floor(n / 2) % kinds.length;
    for (const kind of [...kinds.slice(k), ...kinds.slice(0, k)]) {
      const t = fresh(TEACHINGS.filter(x => x.kind === kind && !x.when));
      if (t) return t;
    }
    return null;
  };
  const last = state.teachings.today && teachingById(state.teachings.today.id);
  return (last?.kind === 'technique' ? wisdom() ?? technique() : technique() ?? wisdom())
    ?? best(TEACHINGS.filter(x => !x.when && (x.kind !== 'technique' || isUnlocked(state, x.hold))));
}

// Puts coins in the box for today's teaching. Returns it, or null if it can't be had.
export function receiveTeaching(state, today = dayKey()) {
  if (teachingStatus(state, today) !== 'ready') return null;
  const t = pickTeaching(state, today);
  if (!t) return null;
  spend(state, TEACHING_PRICE);
  if (!state.teachings.got[t.id]) state.teachings.order.push(t.id);
  state.teachings.got[t.id] = today;
  state.teachings.today = { day: today, id: t.id };
  save(state);
  return t;
}

export function starTeaching(state, id) {
  const s = state.teachings.starred;
  state.teachings.starred = s.includes(id) ? s.filter(x => x !== id) : [...s, id];
  save(state);
}

// ---- Charts ----

// One number a day for the last `days` days, oldest first: coins earned or spent, time
// held, or sessions done.
export const METRICS = {
  earned: (d, l) => (d?.coins ?? 0) + (l?.earned ?? 0),
  spent: (d, l) => Math.max(0, l?.spent ?? 0),
  time: d => d?.time ?? 0,
  sessions: d => d?.sessions ?? 0,
};
export function dailySeries(state, metric, days = 30, today = dayKey()) {
  const f = METRICS[metric];
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, value: f(state.days[day], state.ledger?.[day]) };
  });
}

// A hold's longest session each day at each level it was done, oldest first, with that
// level's target. Levels are different positions, so each is its own line.
export function holdSeries(state, holdId) {
  const best = new Map();
  for (const h of state.history) {
    if (h.holdId !== holdId || !h.at) continue;
    const day = dayKey(new Date(h.at)), k = `${day}|${h.level}`, cur = best.get(k);
    if (!cur || h.held > cur.held) best.set(k, { day, level: h.level, held: h.held, target: h.target });
  }
  return [...best.values()].sort((a, b) => a.day.localeCompare(b.day) || a.level - b.level);
}

// Holds with any sessions recorded, the most recently practised first.
export function practisedHolds(state) {
  const last = new Map();
  for (const h of state.history) if (h.at) last.set(h.holdId, h.at);
  return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
}
