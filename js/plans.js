// Training plans, built from three choices: minutes a day, a focus, and a length in weeks.
// A plan is a block of 1–6 weeks. Each week follows the focus's pattern of day types
// (legs, arms, core, easy...), and each day is filled from the holds you have open until
// it reaches its minutes (see fillPlanDay in progress.js), so a plan works whatever
// you've unlocked and grows as you level up.
//
// A day type is a list of slots ("a stance hold, 2 sets") in the order they're filled.
// The first slots carry the day's theme; filling stops once the day's minutes are reached,
// so a short plan only takes the first few and a long one goes further down the list. If
// the list runs out first, sets are added to the holds already picked.
//
// A slot with 2 or more sets is a main slot: it takes a hard hold when you have one, and
// its section gets a day's rest afterwards (the next day skips that section). Easy days
// are soft holds only, at EASY_SHARE of the minutes. Qigong holds are mostly arm work, so
// they fill out arm days and easy days. The plan moves on a day when you train, so a missed
// day doesn't skip anything.

const slots = (...list) => list.map(([group, sets = 1]) => ({ group, sets }));

export const DAY_TYPES = {
  legs: { name: 'Legs', slots: slots(['stances', 2], ['core'], ['stances'], ['qigong'], ['upper'], ['still'], ['stances'], ['core']) },
  arms: { name: 'Arms & upper body', slots: slots(['upper', 2], ['qigong'], ['upper'], ['core'], ['stances'], ['qigong'], ['upper']) },
  core: { name: 'Core', slots: slots(['core', 2], ['qigong'], ['core'], ['stances'], ['still'], ['upper'], ['core']) },
  armscore: { name: 'Arms & core', slots: slots(['upper', 2], ['core', 2], ['qigong'], ['upper'], ['core'], ['stances']) },
  easy: { name: 'Easy day', easy: true, slots: slots(['still'], ['qigong'], ['qigong'], ['still'], ['qigong'], ['still']) },
};

// Each focus is a week of day types: its own area gets three hard days, the others one each.
export const FOCUSES = [
  { key: 'balanced', name: 'Balanced', week: ['legs', 'arms', 'easy', 'core', 'legs', 'armscore', 'easy'] },
  { key: 'legs', name: 'Legs', week: ['legs', 'armscore', 'legs', 'easy', 'legs', 'core', 'easy'] },
  { key: 'arms', name: 'Arms', week: ['arms', 'legs', 'arms', 'easy', 'arms', 'core', 'easy'] },
  { key: 'core', name: 'Core', week: ['core', 'legs', 'core', 'easy', 'core', 'arms', 'easy'] },
];

export const MINUTES = [5, 10, 15, 20];
export const LENGTHS = [1, 2, 4, 6];
export const DEFAULT_PLAN = { minutes: 10, focus: 'balanced', weeks: 2 };

// How much of the minutes each week asks for: longer plans ease in and ease off at the end.
export const RAMPS = { 1: [1], 2: [0.85, 1], 4: [0.7, 1, 1, 0.85], 6: [0.7, 0.85, 1, 1, 1, 0.85] };
export const EASY_SHARE = 0.6;

// The most sets of one hold in a day: the main hold, and the others.
export const MAX_SETS = { main: 4, other: 3 };

// Coins for finishing a plan: for each day of it you trained, more for a full day.
export const PLAN_COINS = { full: 10, part: 5 };

// When a section has none of your holds left for a slot, the slot takes one from these instead.
export const FALLBACK = {
  stances: ['core', 'qigong'],
  upper: ['qigong', 'core'],
  core: ['upper', 'stances'],
  qigong: ['still', 'upper'],
  still: ['qigong', 'core'],
};

export const focusByKey = key => FOCUSES.find(f => f.key === key) ?? FOCUSES[0];

// A plan day's target in seconds: the minutes, eased by the week of the plan, and less on easy days.
export function dayBudget(plan, step) {
  const ramp = RAMPS[plan.weeks] ?? RAMPS[2];
  const type = DAY_TYPES[focusByKey(plan.focus).week[step % 7]];
  return Math.round(plan.minutes * 60 * ramp[Math.min(ramp.length - 1, Math.floor(step / 7))] * (type.easy ? EASY_SHARE : 1));
}

// Seconds of holding in one set of a hold at a level: its target, or for a flowing hold
// its cycles at their slowest-allowed pace.
export const setSeconds = (hold, level) => {
  const t = hold.levels[level - 1].target;
  return hold.flow ? t * hold.flow.minCycle[level - 1] : t;
};
