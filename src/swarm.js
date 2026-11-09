// Traits and the difficulty budget. Each invader has three traits (aim, fire, dodge), each 0 to 3.
// A wave's budget is the total of all traits, fixed by data/waves.json. Lessons only change the
// weights that decide where the budget goes, never how big it is. Pure functions.

export const TRAITS = ['aim', 'fire', 'dodge'];
export const MAX_LEVEL = 3;

// The budget for a wave: listed in waves.json, then growing by `budgetGrowth` a wave, never more
// than every trait of every invader at max.
export function budgetFor(config, wave, invaders) {
  const list = config.budgets;
  const listed = list[Math.min(wave, list.length) - 1];
  const extra = Math.max(0, wave - list.length) * config.budgetGrowth;
  return Math.min(listed + extra, invaders * TRAITS.length * MAX_LEVEL);
}

// Spreads `budget` points over slots (one per invader per trait) in proportion to their weights,
// with no slot above MAX_LEVEL. Fractions are settled by largest remainder, so the total is always
// exactly the budget. weights: array of positive numbers, one per slot. Returns whole levels.
export function spreadBudget(weights, budget) {
  const n = weights.length;
  if (budget > n * MAX_LEVEL) throw new Error(`budget ${budget} is more than ${n} slots can hold`);
  const share = new Array(n).fill(0);
  let free = [...weights.keys()];
  let left = budget;
  // Water filling: give each free slot its share; slots that would pass the cap are capped and
  // the rest is shared again among the others.
  while (left > 1e-9 && free.length) {
    const total = free.reduce((s, i) => s + weights[i], 0);
    const capped = free.filter((i) => share[i] + (left * weights[i]) / total >= MAX_LEVEL);
    if (capped.length === 0) {
      for (const i of free) share[i] += (left * weights[i]) / total;
      left = 0;
    } else {
      for (const i of capped) {
        left -= MAX_LEVEL - share[i];
        share[i] = MAX_LEVEL;
      }
      free = free.filter((i) => !capped.includes(i));
    }
  }
  const levels = share.map(Math.floor);
  let rest = budget - levels.reduce((s, v) => s + v, 0);
  const order = [...share.keys()]
    .filter((i) => levels[i] < MAX_LEVEL)
    .sort((a, b) => share[b] - levels[b] - (share[a] - levels[a]) || a - b);
  for (const i of order) {
    if (rest === 0) break;
    levels[i] += 1;
    rest -= 1;
  }
  return levels;
}

// Gives each invader its traits for the wave. weightOf(invader, trait) > 0.
export function assignTraits(invaders, budget, weightOf) {
  const weights = [];
  for (const inv of invaders) for (const t of TRAITS) weights.push(weightOf(inv, t));
  const levels = spreadBudget(weights, budget);
  invaders.forEach((inv, k) => {
    inv.traits = Object.fromEntries(TRAITS.map((t, j) => [t, levels[k * TRAITS.length + j]]));
  });
}

export function traitTotal(invaders) {
  return invaders.reduce((s, inv) => s + TRAITS.reduce((t, name) => t + inv.traits[name], 0), 0);
}
