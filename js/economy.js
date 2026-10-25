// The coin economy: how fast coins are earned and what things cost.
// Kept in one place so it's easy to rebalance.

export const COIN_SECONDS = 10;              // seconds of good form per coin, before multipliers
export const LEVEL_MULT = [1, 1.25, 1.5, 2]; // harder levels earn faster
export const TARGET_BONUS = 2;               // coins for reaching a target (split across sides)
export const DAILY_MULT = 3;                 // hold of the day earns this many times the coins
export const HONOUR_FORM = 0.75;             // form factor without the camera

// Bonus time past the target, as a fraction of the target: the further you go, the faster coins come.
export const BONUS_TIERS = [
  { from: 0, mult: 1.5 },
  { from: 0.5, mult: 2 },
  { from: 1, mult: 3 },
];

// The first holds are free; the rest are bought with coins, each unlock costing more.
export const STARTER_HOLDS = ['horse', 'bow'];
export const UNLOCK_PRICES = [20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 240, 270, 300];

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
