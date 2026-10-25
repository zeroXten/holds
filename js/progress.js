// Progress kept in localStorage: XP, levels, streaks, personal bests, badges.

import { HOLDS, LEVEL_MULT } from './holds.js';

const KEY = 'holds.v1';
export const QUALIFY_DAYS = 3;   // days hitting the target (with good form) to level up
export const QUALIFY_FORM = 70;  // minimum average form for a camera session to count

export const RANKS = [
  { xp: 0, name: 'White Sash', color: '#f4efe6' },
  { xp: 2500, name: 'Yellow Sash', color: '#f2c230' },
  { xp: 7500, name: 'Orange Sash', color: '#ee8a2a' },
  { xp: 15000, name: 'Green Sash', color: '#4f9d4a' },
  { xp: 30000, name: 'Blue Sash', color: '#3a73c9' },
  { xp: 50000, name: 'Purple Sash', color: '#7d4fc0' },
  { xp: 80000, name: 'Brown Sash', color: '#8a5a32' },
  { xp: 120000, name: 'Red Sash', color: '#c8322b' },
  { xp: 180000, name: 'Black Sash', color: '#1d1a17' },
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
];

export const DEFAULT_SETTINGS = { voice: true, sounds: true, camera: true, autoframe: true, strictness: 'normal', model: 'full' };

const blank = () => ({ version: 1, xp: 0, holds: {}, history: [], days: {}, badges: {}, settings: { ...DEFAULT_SETTINGS } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { ...blank(), ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return blank();
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
};

export function holdState(state, id) {
  return state.holds[id] ?? { level: 1, qualDays: [], mastered: false, best: {}, sessions: 0, totalTime: 0, last: null };
}

// Current streak: consecutive training days ending today, or yesterday if today isn't done yet.
export function streak(state, today = dayKey()) {
  let day = state.days[today] ? today : addDays(today, -1);
  let n = 0;
  while (state.days[day]) { n++; day = addDays(day, -1); }
  return n;
}

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], index: i, next, progress: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1 };
}

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

// Random hold for today's session, favouring ones not practised lately.
export function pickHold(state, exclude) {
  const today = dayKey();
  const weights = HOLDS.map(h => {
    if (h.id === exclude) return 0;
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
  const hold = HOLDS.find(h => h.id === s.holdId);
  const hs = holdState(state, s.holdId);
  const before = { rank: rankFor(state.xp), streak: streak(state) };
  const firstToday = !state.days[today];
  // One-sided holds only count as reached when both sides hit their target.
  const reached = s.reached ?? s.held >= s.target;

  // Streak bonus: +5% per day of streak (including today), up to +50%.
  const streakAfter = firstToday ? before.streak + 1 : Math.max(before.streak, 1);
  const streakMult = 1 + 0.05 * Math.min(streakAfter, 10);
  const points = Math.round(s.points * streakMult);

  const prevBest = hs.best[s.level] ?? 0;
  const pb = s.held > prevBest && s.held >= 5;
  if (pb) hs.best[s.level] = Math.round(s.held * 10) / 10;

  // Level progress: one qualifying session per day at the current level.
  let levelUp = false, mastered = false, qualified = false;
  const formOk = !s.camera || s.avgForm >= QUALIFY_FORM;
  if (reached && formOk && s.level === hs.level && !hs.mastered && !hs.qualDays.includes(today)) {
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

  state.xp += points;
  const day = state.days[today] ?? { points: 0, time: 0, sessions: 0 };
  day.points += points; day.time += s.held; day.sessions++;
  state.days[today] = day;
  state.history.push({
    at: new Date().toISOString(), holdId: s.holdId, level: s.level, held: Math.round(s.held * 10) / 10,
    target: s.target, avgForm: s.camera ? Math.round(s.avgForm) : null, points, camera: s.camera,
  });
  if (state.history.length > 1000) state.history.splice(0, state.history.length - 1000);

  // Badges
  const t = totals(state);
  const st = streak(state);
  const earn = [];
  const check = (id, cond) => { if (cond && !state.badges[id]) { state.badges[id] = today; earn.push(BADGES.find(b => b.id === id)); } };
  check('first', true);
  check('target', reached);
  check('perfect', reached && s.camera && s.avgForm >= 90);
  check('overtime', s.held >= s.target * 1.5);
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

  save(state);
  return {
    points, basePoints: Math.round(s.points), streakMult, streak: st, reached, pb, prevBest,
    qualified, qualDays: hs.qualDays.length, levelUp, mastered, newLevel: hs.level,
    badges: earn, rankUp: rankFor(state.xp).index > before.rank.index, rank: rankFor(state.xp),
  };
}

export { LEVEL_MULT };
