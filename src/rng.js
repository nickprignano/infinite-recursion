// Seeded random numbers (mulberry32). The generator's state is a plain number kept in the game
// state, so a run with the same seed and inputs is the same run, and the state can be compared.
export function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
