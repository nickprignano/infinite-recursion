// Run with: node --test
// Spec test 4: lessons. Each habit triggers its lesson, lessons fade, at most two are active, the
// Probe blocks new ones, and nothing carries over between runs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, step } from '../src/game.js';
import { endWave, finalModel, startWaveStats } from '../src/learner.js';
import { PLAYERS, playRun } from './players.mjs';

const lessons = JSON.parse(readFileSync('data/lessons.json', 'utf8'));
const config = { ...JSON.parse(readFileSync('data/waves.json', 'utf8')), lessons };

// A wave's counts, as if the player had a habit. Lanes: share of steps per lane.
function habit(state, { lanes = [0.2, 0.2, 0.2, 0.2, 0.2], under = 0, shots = 20, kills = 18, killCols = [4, 5, 3, 4, 5, 3] } = {}) {
  startWaveStats(state);
  const w = state.learn.wave;
  w.steps = 1000;
  w.lanes = lanes.map((share) => share * 1000);
  w.under = under * 1000;
  w.shots = shots;
  w.kills = kills;
  w.killCols = killCols;
}

const HABITS = {
  camp: { lanes: [0, 0.8, 0.1, 0.1, 0] },
  spray: { shots: 60, kills: 10 },
  edges: { killCols: [0, 8, 1, 7, 0, 8, 1, 7, 4, 0] },
  hide: { under: 0.7 },
};

test('each habit triggers its own lesson, and a balanced wave triggers none', () => {
  for (const [id, counts] of Object.entries(HABITS)) {
    const state = createGame(config, { seed: 1 });
    habit(state, counts);
    const report = endWave(state);
    assert.deepEqual(report.learned.map((l) => l.id), [id], id);
    assert.match(report.learned[0].text, /\d/, 'the card quotes the number behind it');
    assert.ok(report.learned[0].counter, 'and says how to beat it');
  }
  const state = createGame(config, { seed: 1 });
  habit(state);
  assert.equal(endWave(state).learned.length, 0);
});

test('the camp lesson names your lane and sends the aim there', () => {
  const state = createGame(config, { seed: 1 });
  habit(state, HABITS.camp);
  assert.match(endWave(state).learned[0].text, /left lane/);
  assert.equal(state.learn.aimLane, 1);
});

test('a lesson fades after two waves unless the habit repeats', () => {
  const state = createGame(config, { seed: 1 });
  habit(state, HABITS.hide);
  endWave(state);
  habit(state);
  assert.deepEqual(endWave(state).active, ['Fires on cover']);
  habit(state);
  const report = endWave(state);
  assert.deepEqual(report.active, []);
  assert.deepEqual(report.faded, ['Fires on cover']);

  const again = createGame(config, { seed: 1 });
  for (let i = 0; i < 4; i++) {
    habit(again, HABITS.hide);
    endWave(again);
  }
  assert.deepEqual(again.learn.lessons.map((l) => l.id), ['hide'], 'repeating the habit keeps it');
});

test('at most two lessons are active, and a third replaces the weaker', () => {
  const state = createGame(config, { seed: 1 });
  habit(state, { ...HABITS.hide, under: 0.55 });
  endWave(state);
  habit(state, { ...HABITS.camp, under: 0.55 });
  endWave(state);
  assert.equal(state.learn.lessons.length, 2);
  habit(state, HABITS.spray);
  const report = endWave(state);
  assert.equal(state.learn.lessons.length, 2);
  assert.deepEqual(report.learned.map((l) => l.id), ['spray']);
  assert.ok(!state.learn.lessons.some((l) => l.id === 'hide'), 'the weaker one (barely hiding) went');
});

test('hitting the Probe means nothing new is learned that wave', () => {
  const state = createGame(config, { seed: 1 });
  habit(state, HABITS.camp);
  state.probeHit = true;
  const report = endWave(state);
  assert.equal(report.blocked, true);
  assert.equal(report.learned.length, 0);
});

test('a wave cleared without a new lesson pays the outsmarted bonus', () => {
  const state = createGame(config, { seed: 1 });
  state.probeHit = true;
  state.invaders.forEach((inv) => (inv.alive = false));
  const cleared = step(state, {}).find((e) => e.type === 'cleared');
  assert.equal(cleared.outsmarted, config.outsmartedBonus);
});

test('scripted players pick up their habits\' lessons in real play', () => {
  const learned = (player) => {
    const ids = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      for (const r of playRun(config, PLAYERS[player], seed, { maxWave: 3 }).reports) r.learned.forEach((l) => ids.add(l.id));
    }
    return ids;
  };
  assert.ok(learned('sprayer').has('spray'));
  assert.ok(learned('edges').has('edges'));
  assert.ok(learned('hider').has('hide'));
});

test('nothing carries over between runs', () => {
  const first = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => playRun(config, PLAYERS.edges, seed, { maxWave: 3 }).state).find((s) => finalModel(s).length > 0);
  assert.ok(first, 'some run learned something');
  const next = createGame(config, { seed: 3 });
  assert.deepEqual(next.learn.lessons, []);
  assert.deepEqual(finalModel(next), []);
});
