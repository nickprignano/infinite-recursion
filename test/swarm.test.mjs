// Run with: node --test
// Spec test 2: the budget. Whatever the lessons, a wave's trait total is exactly its budget.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, startWave } from '../src/game.js';
import { budgetFor, MAX_LEVEL, spreadBudget, TRAITS, traitTotal } from '../src/swarm.js';

const waves = JSON.parse(readFileSync('data/waves.json', 'utf8'));
const lessons = JSON.parse(readFileSync('data/lessons.json', 'utf8'));
const config = { ...waves, lessons };

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('spreading the budget always sums to it, with every level 0 to 3 (10,000 random cases)', () => {
  const r = rng(7);
  for (let i = 0; i < 10000; i++) {
    const slots = 1 + Math.floor(r() * 180);
    const weights = Array.from({ length: slots }, () => (r() < 0.2 ? 1 + r() * 20 : 1));
    const budget = Math.floor(r() * (slots * MAX_LEVEL + 1));
    const levels = spreadBudget(weights, budget);
    assert.equal(levels.reduce((a, b) => a + b, 0), budget);
    assert.ok(levels.every((v) => Number.isInteger(v) && v >= 0 && v <= MAX_LEVEL));
  }
});

test('heavier weights get at least as many points', () => {
  const levels = spreadBudget([5, 1, 1, 1, 1, 1], 6);
  assert.ok(levels[0] >= Math.max(...levels.slice(1)));
});

test('a budget too big for the slots is an error, not a silent cut', () => {
  assert.throws(() => spreadBudget([1, 1], 7));
});

test('every budget in waves.json is a whole number that fits the swarm it is for', () => {
  for (let wave = 1; wave <= 30; wave++) {
    const [rows, cols] = waves.grids[Math.min(wave, waves.grids.length) - 1];
    const listed = wave <= waves.budgets.length ? waves.budgets[wave - 1] : null;
    if (listed !== null) {
      assert.ok(Number.isInteger(listed) && listed >= 0, `wave ${wave}`);
      assert.ok(listed <= rows * cols * TRAITS.length * MAX_LEVEL, `wave ${wave} budget fits`);
    }
    assert.ok(budgetFor(waves, wave, rows * cols) >= budgetFor(waves, Math.max(1, wave - 1), rows * cols) || wave === 1);
  }
});

test('whatever the swarm has learned, each wave\'s trait total is its budget', () => {
  const r = rng(11);
  for (let i = 0; i < 300; i++) {
    const state = createGame(config, { seed: i + 1 });
    // Any mix of active lessons, of any age, aiming at any lane.
    state.learn.lessons = lessons
      .filter(() => r() < 0.5)
      .slice(0, 2)
      .map((l) => ({ id: l.id, strength: r(), age: 0, detail: { target: Math.floor(r() * 5) } }));
    const wave = 1 + Math.floor(r() * 20);
    startWave(state, wave);
    assert.equal(traitTotal(state.invaders), budgetFor(waves, wave, state.invaders.length));
  }
});

test('lessons move the budget toward their trait', () => {
  const plain = createGame(config, { seed: 1 });
  startWave(plain, 4);
  const taught = createGame(config, { seed: 1 });
  taught.learn.lessons = [{ id: 'hide', strength: 0.3, age: 0, detail: {} }];
  startWave(taught, 4);
  const sum = (s, t) => s.invaders.reduce((a, inv) => a + inv.traits[t], 0);
  assert.ok(sum(taught, 'fire') > sum(plain, 'fire'));
  assert.equal(traitTotal(taught.invaders), traitTotal(plain.invaders));
});
