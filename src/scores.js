// High scores kept on the player's device: the top 10, best first. Each entry keeps the wave
// reached, the seed (so a run can be replayed) and whether it was played on Easy.
import { load, save } from './storage.js';

const KEY = 'infinite-recursion-scores';
const MAX_SCORES = 10;

export class Scores {
  constructor(storage) {
    this.storage = storage;
  }

  // [{ name, score, wave, seed, easy, date }]
  list() {
    return load(KEY, [], this.storage);
  }

  qualifies(score) {
    const list = this.list();
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }

  add(name, score, extra = {}) {
    const entry = { name, score, date: new Date().toISOString().slice(0, 10), ...extra };
    const list = [...this.list(), entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
    save(KEY, list, this.storage);
    return list;
  }
}

// Arcade-style initials: 1 to 3 letters, upper-cased.
export function cleanName(text) {
  const name = String(text).trim().toUpperCase();
  return /^[A-Z]{1,3}$/.test(name) ? name : null;
}
