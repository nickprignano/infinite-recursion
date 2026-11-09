// Run with: node --test
// Divide's fairness (spec amendment 1, test 3). Scripted pilots with different habits play 50
// seeded runs each, with the learning on and with it off. Every median stays in the band set in
// divide.json, and the learning moves no pilot's median by more than `maxShift` waves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flyRun, PILOTS } from './pilot.mjs';

const divide = JSON.parse(readFileSync('data/divide.json', 'utf8'));
const lessons = JSON.parse(readFileSync('data/divide-lessons.json', 'utf8'));
const { runs, maxWave, minMedian, maxMedian, maxShift, maxSteps } = divide.fairness;

function median(config, player) {
  const reached = [];
  for (let seed = 1; seed <= runs; seed++) {
    const { state } = flyRun(config, player, seed, { maxWave, maxSteps });
    reached.push(state.phase === 'over' ? state.wave : state.wave + 1);
  }
  reached.sort((a, b) => a - b);
  return reached[Math.floor(runs / 2)];
}

for (const [name, player] of Object.entries(PILOTS)) {
  test(`Divide fairness: ${name}`, () => {
    const on = median({ ...divide, lessons }, player);
    const off = median({ ...divide, lessons: [] }, player);
    assert.ok(on >= minMedian && on <= maxMedian, `${name}: median wave ${on} is outside ${minMedian} to ${maxMedian}`);
    assert.ok(Math.abs(on - off) <= maxShift, `${name}: learning moved the median from ${off} to ${on}`);
  });
}
