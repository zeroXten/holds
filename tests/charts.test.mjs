// The progress charts: coins in and out by day, and a hold's longest time each day.
// Run: node tests/charts.test.mjs
globalThis.window = {};
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const P = await import('../js/progress.js');
const { FREEZE_PRICE } = await import('../js/economy.js');

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

const state = P.load();
const today = P.dayKey();
state.coins = 1000;

// Spending is booked by day, without making it a training day.
P.buyFreeze(state);
check('spend booked', state.ledger[today].spent === FREEZE_PRICE, JSON.stringify(state.ledger));
check('spending isn\'t training', !state.days[today]);
const tomorrow = P.addDays(today, 1);
P.planRest(state, tomorrow, today);
P.cancelRest(state, tomorrow, today);
check('a refund takes the spend back', state.ledger[today].spent === FREEZE_PRICE);

// Daily series: earned counts the sessions' coins plus other earnings.
state.days[today] = { coins: 40, time: 95, sessions: 3 };
state.ledger[today].earned = 10;
const earned = P.dailySeries(state, 'earned', 30, today);
check('30 days, ending today', earned.length === 30 && earned.at(-1).day === today && earned[0].day === P.addDays(today, -29));
check('earned adds both', earned.at(-1).value === 50);
check('time', P.dailySeries(state, 'time', 30, today).at(-1).value === 95);
check('sessions', P.dailySeries(state, 'sessions', 7, today).at(-1).value === 3);
check('empty days are zero', earned[0].value === 0);

// A hold's series: the longest each day, at each level.
const at = (day, h) => new Date(`${day}T${h}:00`).toISOString();
const d1 = P.addDays(today, -21), d2 = P.addDays(today, -7);
state.history = [
  { at: at(d1, '09'), holdId: 'plank', level: 1, held: 33, target: 30 },
  { at: at(d1, '18'), holdId: 'plank', level: 1, held: 28, target: 30 },
  { at: at(d2, '09'), holdId: 'plank', level: 1, held: 80, target: 30 },
  { at: at(d2, '10'), holdId: 'plank', level: 2, held: 50, target: 45 },
  { at: at(today, '09'), holdId: 'plank', level: 2, held: 75, target: 45 },
  { at: at(d2, '11'), holdId: 'tree', level: 1, held: 20, target: 30 },
];
const s = P.holdSeries(state, 'plank');
check('one point a day and level', s.length === 4, JSON.stringify(s));
check('longest of the day', s[0].held === 33);
check('each level kept apart', s[1].level === 1 && s[1].held === 80 && s[2].level === 2 && s[2].held === 50);
check('oldest first', s.at(-1).day === today && s.at(-1).held === 75);
check('practised holds, latest first', P.practisedHolds(state).join() === 'plank,tree');

console.log(failures ? `${failures} failed` : 'all passed');
if (failures) process.exit(1);
