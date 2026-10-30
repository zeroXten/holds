// The coin economy: how fast coins are earned and what things cost.
// Kept in one place so it's easy to rebalance.

// Every hold pays the same for reaching its target, at any level and however long the
// target is: 15 seconds of a hard stance and five minutes of meditation are worth the same.
// Higher levels don't pay faster; they earn points towards your sash (see progress.js).
// Of those coins, TARGET_SHARE is paid on reaching the target and the rest builds up evenly
// over the target's length; bonus time past it carries on at that same base rate, times
// the bonus tier. Everything scales from the base, so form, hold of the day and streaks
// multiply it all alike.
export const TARGET_COINS = 5;               // at good form, before the hold's own rating
export const TARGET_SHARE = 0.2;
export const LEVEL_MULT = [1, 1.25, 1.5, 2]; // how hard each level is (for body-area load)
// Seconds a level's target takes (for flowing holds: cycles × the slowest cycle allowed).
export const targetSeconds = (hold, level) => hold.levels[level - 1].target * (hold.flow ? hold.flow.minCycle[level - 1] : 1);
// Each hold can tweak the base for how hard it is: `coins` is a multiplier (about 0.8 for
// the gentlest holds up to 1.3 for the hardest), or one per level.
const holdMult = (hold, level) => (Array.isArray(hold.coins) ? hold.coins[level - 1] : hold.coins ?? 1);
// Coins for reaching a hold's target at good form, before boosts.
export const coinsAtTarget = (hold, level) => TARGET_COINS * holdMult(hold, level);
// Base coins per second while holding, before form, bonus time and boosts.
export const coinRateFor = (hold, level) => coinsAtTarget(hold, level) * (1 - TARGET_SHARE) / targetSeconds(hold, level);
// Coins for reaching the target, before form and boosts.
export const targetBonusFor = (hold, level) => coinsAtTarget(hold, level) * TARGET_SHARE;
export const DAILY_MULT = 3;                 // hold of the day: this many times the coins, on its first session each day
export const DAILY_MIN_SECONDS = 10;         // ...a session this long uses up the day's multiplier
export const STREAK_STEP = 0.05;             // +5% coins for each full week of streak...
export const STREAK_MAX_WEEKS = 10;          // ...up to +50% (from day 71)
export const MILESTONE_DAY_MULT = 2;         // reaching a streak milestone doubles your coins for the rest of that day
export const HONOUR_FORM = 0.75;             // form factor without the camera

// Bonus time past the target, as a fraction of the target: the further you go, the faster coins come.
export const BONUS_TIERS = [
  { from: 0, mult: 1.5 },
  { from: 0.5, mult: 2 },
  { from: 1, mult: 3 },
];

// The first holds are free; the rest are bought with coins, each unlock costing more.
export const STARTER_HOLDS = ['horse', 'wings', 'plank', 'weituo'];
export const UNLOCK_PRICES = [20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720, 750];

// Camera form score → coin rate: 0.75x at a scrape-through 50, 1.25x at perfect form.
export const formFactor = score => Math.max(0.75, Math.min(1.25, 0.75 + 0.5 * (score - 50) / 50));

// 0 = before the target, 1–3 = bonus tiers.
export function bonusTier(held, target) {
  if (held < target) return { tier: 0, mult: 1 };
  const over = (held - target) / target;
  let tier = 0;
  while (tier + 1 < BONUS_TIERS.length && over >= BONUS_TIERS[tier + 1].from) tier++;
  return { tier: tier + 1, mult: BONUS_TIERS[tier].mult };
}

// ---- Shop: protecting the streak (cheapest when planned ahead, dearest after the fact) ----
export const REST_DAY_PRICE = 30;       // book a rest day in advance: a real cost, but well below a freeze
export const REST_DAYS_PER_WEEK = 2;
export const FREEZE_PRICE = 100;        // used automatically on a missed day; a hard day's training to
                                        // earn, as milestones give them away (1, 3 and 6 weeks, 100 days)
export const FREEZE_MAX = 2;
export const REPAIR_PRICE_PER_DAY = 300; // buy back a broken streak: far dearer than a freeze
export const REPAIR_WINDOW_DAYS = 3;    // ...if you come back within this many missed days

// ---- Bets on yourself: stake coins, win more if you do it in time ----
export const BETS = [
  { id: 'holds3', name: 'Three holds today', desc: 'Reach the target on 3 different holds today.', stake: 10, payout: 25, days: 1 },
  { id: 'time10', name: 'Ten minutes today', desc: 'Hold for 10 minutes in total today.', stake: 15, payout: 40, days: 1 },
  { id: 'form90', name: 'Perfect form', desc: 'Reach a target with 90+ average form today (camera on).', stake: 10, payout: 25, days: 1 },
  // Bonus time pays in steps as you reach them, rather than all at the end.
  {
    id: 'bonus', name: 'Bonus time', stake: 15, payout: 55, days: 1,
    desc: 'Hold past your target today, all in one hold at your current level. Bonus time is measured against that hold’s own target, and gentle (soft) holds count half. Pays at each step: half again, double, twice over and three times over.',
    // `x`: bonus time as a multiple of the target (0.5 = half the target's length again).
    steps: [{ x: 0.5, name: 'Half again', coins: 10 }, { x: 1, name: 'Double', coins: 10 }, { x: 2, name: 'Twice over', coins: 15 }, { x: 3, name: 'Three times over', coins: 20 }],
  },
  // Retired (too easy to win while your bests are new); kept so old bets and history still read.
  { id: 'pb', name: 'New personal best', desc: 'Beat one of your personal bests today.', stake: 10, payout: 25, days: 1, retired: true },
  // Weekly bets run in a slot of their own, alongside the daily ones.
  { id: 'week5', name: 'Five-day week', desc: 'Train on 5 of the next 7 days.', stake: 30, payout: 90, days: 7 },
  { id: 'streak7', name: 'Unbroken week', desc: 'Train every day for 7 days. Planned rest days count; freezes don’t.', stake: 40, payout: 140, days: 7 },
];

// ---- Level test-out: try the next level early; it only costs coins if you don't pass ----
export const TEST_FORM = 85;
// Coins for reaching a new level of a hold (by the level reached), and for mastering it.
export const LEVEL_UP_COINS = { 2: 10, 3: 15, 4: 20, mastered: 30 };
export const testPrice = level => 10 * level;

// ---- The temple: features and themes to buy (drawn in temple.js) ----
// The temple itself grows in stages, from a carved stone to a grand temple; each
// upgrade is bought in turn. Decorations can go around any stage, but a few big
// buildings need a temple of a certain size (`needs`: the stage's index).
export const TEMPLE_TIERS = [
  { id: 'stone', name: 'Shrine Stone', price: 0, desc: 'A carved stone on bare earth: where every temple begins.' },
  { id: 'shrine', name: 'Wayside Shrine', price: 30, desc: 'A little roofed shrine on a stone base.' },
  { id: 'small', name: 'Small Temple', price: 120, desc: 'One room, red columns and a tiled roof.' },
  // Bigger stages also need a sash: coins alone can't buy them.
  { id: 'hall', name: 'Temple Hall', price: 250, sash: 'orange', desc: 'The main hall with two sweeping roofs.' },
  { id: 'grand', name: 'Grand Temple', price: 500, sash: 'green', desc: 'A raised hall with three roofs, a balustrade and gold.' },
  { id: 'monastery', name: 'Mountain Monastery', price: 1500, sash: 'blue', desc: 'A walled monastery: a red courtyard wall and side halls.' },
  { id: 'golden', name: 'Golden Temple', price: 3000, sash: 'brown', desc: 'Gilded roofs on every hall, catching the light.' },
  { id: 'cloud', name: 'Cloud Temple', price: 6000, sash: 'black', desc: 'High above the mist, glowing at the top of the mountain.' },
];

export const TEMPLE_ITEMS = [
  { id: 'path', name: 'Stone Path', price: 25, desc: 'Worn flagstones across the courtyard.' },
  { id: 'bamboo', name: 'Bamboo Grove', price: 40, desc: 'Tall bamboo swaying at the edges.' },
  { id: 'posts', name: 'Plum Blossom Poles', price: 60, desc: 'Meihuazhuang: training poles for stance work.' },
  { id: 'lanterns', name: 'Red Lanterns', price: 60, desc: 'Lanterns that glow when night falls.' },
  { id: 'incense', name: 'Incense Burner', price: 70, desc: 'A bronze cauldron with drifting smoke.' },
  { id: 'mist', name: 'Mountain Mist', price: 50, desc: 'Soft mist drifting between the peaks.' },
  { id: 'plum', name: 'Plum Blossom Tree', price: 90, desc: 'A gnarled old tree shedding petals.' },
  { id: 'lions', name: 'Stone Lions', price: 100, desc: 'A pair of guardians by the path.' },
  { id: 'cranes', name: 'Cranes', price: 100, desc: 'Red-crowned cranes crossing the sky.' },
  { id: 'pond', name: 'Koi Pond', price: 140, desc: 'Lily pads and lazy koi.' },
  { id: 'bell', name: 'Bell Tower', price: 160, desc: 'A pavilion with a great bronze bell.', needs: 2 },
  { id: 'gate', name: 'Mountain Gate', price: 200, desc: 'A painted archway framing the view.' },
  { id: 'waterfall', name: 'Waterfall', price: 200, desc: 'Falling water on the far mountain.' },
  { id: 'pagoda', name: 'Pagoda', price: 400, desc: 'A three-tiered pagoda beside the hall.', needs: 3 },
  // The late game
  { id: 'banners', name: 'Silk Banners', price: 600, desc: 'Tall red and gold banners either side of the temple.' },
  { id: 'buddha', name: 'Golden Buddha', price: 900, desc: 'A golden statue glowing through the open doors of the hall.', needs: 3 },
  { id: 'dragons', name: 'Dragon Pillars', price: 1200, desc: 'Red pillars wrapped in golden dragons, framing the path.' },
  { id: 'yard', name: 'Training Yard', price: 1500, desc: 'A wooden dummy and a rack of staffs for training.' },
];

// ---- Seasonal packs ----
// On sale only during their season (month-day, inclusive; a season may wrap the new
// year). Once bought they're yours, and appear in the temple during that season each year.
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', icon: '🎃', from: '10-15', to: '11-07', items: [
    { id: 'pumpkins', name: 'Jack-o’-lanterns', price: 80, desc: 'Grinning pumpkins glowing along the path.' },
    { id: 'bats', name: 'Bats', price: 60, desc: 'A flutter of bats crossing the sky.' },
    { id: 'harvestmoon', name: 'Harvest Moon', price: 120, desc: 'A huge orange moon hanging low over the mountains.' },
  ] },
];
const monthDay = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function inSeason(season, date = new Date()) {
  const k = monthDay(date);
  return season.from <= season.to ? k >= season.from && k <= season.to : k >= season.from || k <= season.to;
}
export const seasonOfItem = id => SEASONS.find(s => s.items.some(i => i.id === id)) ?? null;
// Whether an owned decoration is on show at this date (seasonal ones only in season).
export const inBloom = (id, date = new Date()) => { const s = seasonOfItem(id); return !s || inSeason(s, date); };

// Frames around the temple picture (drawn in temple.js).
export const FRAMES = [
  { id: 'none', name: 'No frame', price: 0, desc: 'The picture as it is.' },
  { id: 'lacquer', name: 'Red Lacquer', price: 150, desc: 'Glossy red with gold corners.' },
  { id: 'wood', name: 'Carved Wood', price: 250, desc: 'Dark wood with a grain you can see.' },
  { id: 'jade', name: 'Jade', price: 400, desc: 'Cool green stone with pale corners.' },
  { id: 'gold', name: 'Gold Filigree', price: 600, desc: 'Gold, with ornaments on every edge.' },
];

export const THEMES = [
  { id: 'dawn', name: 'Dawn', price: 0, desc: 'First light over the mountains.' },
  { id: 'day', name: 'Clear Day', price: 80, desc: 'Blue skies and green hills.' },
  { id: 'dusk', name: 'Dusk', price: 100, desc: 'A red sun sinking behind the peaks.' },
  { id: 'autumn', name: 'Autumn', price: 120, desc: 'Golden hills and falling leaves.' },
  { id: 'night', name: 'Night', price: 150, desc: 'Moonlight, stars and glowing lanterns.' },
  { id: 'snow', name: 'Snow', price: 150, desc: 'A hush of winter on the temple.' },
];

// ---- Your monk: a character, an outfit and accessories (drawn in avatar.js) ----
// The sash always shows your rank. Accessories go in slots, one each: head, neck, hand.
export const AVATAR_CHARACTERS = [
  { id: 'young', name: 'Young Monk', price: 0, desc: 'Shaved head, bright eyes, eager to train.' },
  { id: 'nun', name: 'Shaolin Nun', price: 300, desc: 'Calm and steady, in a grey cap.' },
  { id: 'warrior', name: 'Warrior Monk', price: 800, desc: 'A red headband and a fierce brow.' },
  { id: 'elder', name: 'Elder Master', price: 1500, desc: 'White brows and a long white beard.' },
];
export const AVATAR_OUTFITS = [
  { id: 'saffron', name: 'Saffron Robe', price: 0, desc: 'The classic orange robe.' },
  { id: 'grey', name: 'Training Greys', price: 150, desc: 'Plain grey training clothes.' },
  { id: 'black', name: 'Kung Fu Suit', price: 400, desc: 'Black jacket with white cuffs.' },
  { id: 'winter', name: 'Winter Robe', price: 600, desc: 'Deep red, with a warm white collar.' },
  { id: 'festival', name: 'Festival Robe', price: 1000, desc: 'Red and gold, for the new year.' },
  { id: 'golden', name: 'Golden Master Robe', price: 2000, desc: 'Gold silk with a yellow trim.' },
];
export const AVATAR_ACCESSORIES = [
  { id: 'mala', name: 'Mala Beads', slot: 'neck', price: 100, desc: 'A loop of wooden prayer beads.' },
  { id: 'fan', name: 'Fighting Fan', slot: 'hand', price: 200, desc: 'A red and white folding fan.' },
  { id: 'gourd', name: 'Water Gourd', slot: 'hand', price: 300, desc: 'A gourd of water on a cord.' },
  { id: 'hat', name: 'Straw Hat', slot: 'head', price: 500, desc: 'A wide conical hat for the road.' },
  { id: 'staff', name: 'Bo Staff', slot: 'hand', price: 800, desc: 'A long wooden staff, taller than you.' },
];

// ---- Streak milestones: a one-off reward each time a streak reaches these lengths ----
// (on top of the everyday streak bonus: +5% coins per full week, up to +50%). Rewards are
// mixed: coins, a free freeze, and `double`: the rest of that day earns MILESTONE_DAY_MULT×.
// A double day grows with what you earn, so it carries the later milestones.
export const STREAK_MILESTONES = [
  { days: 3, name: '3-day streak', coins: 15 },
  { days: 7, name: '1-week streak', coins: 25, freeze: true },
  { days: 10, name: '10-day streak', double: true },
  { days: 14, name: '2-week streak', coins: 50 },
  { days: 21, name: '3-week streak', freeze: true },
  { days: 30, name: '1-month streak', coins: 150, double: true },
  { days: 42, name: '6-week streak', freeze: true },
  { days: 60, name: '2-month streak', coins: 300 },
  { days: 100, name: '100-day streak', coins: 500, freeze: true, double: true },
  { days: 182, name: '6-month streak', coins: 1000, double: true },
  { days: 365, name: '1-year streak', coins: 2500, double: true },
];
