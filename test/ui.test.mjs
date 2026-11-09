// Run with: node --test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanName, Scores } from '../src/scores.js';
import { Settings } from '../src/settings.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

test('initials are 1 to 3 letters, upper-cased', () => {
  assert.equal(cleanName(' ada '), 'ADA');
  assert.equal(cleanName('z'), 'Z');
  for (const bad of ['abcd', 'a1', 'a b', '']) assert.equal(cleanName(bad), null, bad);
});

test('scores keep the top 10, best first, with wave, seed and the Easy mark', () => {
  const scores = new Scores(memoryStorage());
  for (let i = 1; i <= 12; i++) scores.add('AAA', i * 100, { wave: i, seed: i, easy: i % 2 === 0 });
  const list = scores.list();
  assert.equal(list.length, 10);
  assert.equal(list[0].score, 1200);
  assert.equal(list[0].easy, true);
  assert.equal(list.at(-1).score, 300);
  assert.equal(scores.qualifies(250), false);
  assert.equal(scores.qualifies(350), true);
  assert.equal(scores.qualifies(0), false);
});

test('blocked storage never stops the game', () => {
  const scores = new Scores(blocked);
  assert.deepEqual(scores.list(), []);
  assert.doesNotThrow(() => scores.add('AAA', 10));
  const settings = new Settings(blocked, null);
  assert.doesNotThrow(() => settings.set('easy', true));
  assert.equal(settings.easy, true);
});

test('settings are saved, and the system reduced-motion setting counts as Reduce effects', () => {
  const storage = memoryStorage();
  new Settings(storage, null).set('reduceSwitch', true);
  assert.equal(new Settings(storage, null).reduced, true);
  assert.equal(new Settings(memoryStorage(), { matches: true }).reduced, true);
  assert.equal(new Settings(memoryStorage(), { matches: false }).reduced, false);
});
