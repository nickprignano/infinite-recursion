// Run with: node --test
// Spec test 3: fairness. Scripted players with different habits play 50 seeded runs each, with
// the learning on and with it off. Every median stays in the band set in waves.json, and the
// learning moves no player's median by more than `maxShift` waves: it changes how the swarm comes
// at you, not how hard the game is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PLAYERS, playRun } from './players.mjs';

const waves = JSON.parse(readFileSync('data/waves.json', 'utf8'));
const lessons = JSON.parse(readFileSync('data/lessons.json', 'utf8'));
const { runs, maxWave, minMedian, maxMedian, maxShift } = waves.fairness;

function median(config, player) {
  const reached = [];
  for (let seed = 1; seed <= runs; seed++) {
    const { state } = playRun(config, player, seed, { maxWave });
    reached.push(state.phase === 'over' ? state.wave : state.wave + 1);
  }
  reached.sort((a, b) => a - b);
  return reached[Math.floor(runs / 2)];
}

for (const [name, player] of Object.entries(PLAYERS)) {
  test(`fairness: ${name}`, () => {
    const on = median({ ...waves, lessons }, player);
    const off = median({ ...waves, lessons: [] }, player);
    assert.ok(on >= minMedian && on <= maxMedian, `${name}: median wave ${on} is outside ${minMedian} to ${maxMedian}`);
    assert.ok(Math.abs(on - off) <= maxShift, `${name}: learning moved the median from ${off} to ${on}`);
  });
}
