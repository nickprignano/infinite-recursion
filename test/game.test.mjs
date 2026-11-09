// Run with: node --test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, invaderPos, shooters, startWave, step, swarmSpeed } from '../src/game.js';
import { PLAYERS, playRun } from './players.mjs';

const config = { ...JSON.parse(readFileSync('data/waves.json', 'utf8')), lessons: JSON.parse(readFileSync('data/lessons.json', 'utf8')) };
const strip = (s) => ({ ...s, config: undefined });

function play(seed, maxSteps) {
  return playRun(config, PLAYERS.chaser, seed, { maxSteps }).state;
}

test('a seeded run with the same inputs is the same run', () => {
  assert.deepEqual(strip(play(42, 6000)), strip(play(42, 6000)));
  assert.notDeepEqual(strip(play(42, 6000)), strip(play(43, 6000)));
});

test('the swarm steps down and turns at each edge', () => {
  const state = createGame(config, { seed: 1 });
  const oy = state.swarm.oy;
  let events = [];
  for (let i = 0; i < 60 * 30 && !events.some((e) => e.type === 'step-down'); i++) events = step(state, {});
  assert.equal(state.swarm.oy, oy + config.swarm.stepDown);
  assert.equal(state.swarm.dir, -1);
  const right = Math.max(...state.invaders.map((inv) => invaderPos(state, inv).x)) + config.invader.width / 2;
  assert.ok(right <= config.field.width - config.swarm.edgeMargin + 1e-9);
});

test('the swarm speeds up as it thins out', () => {
  const state = createGame(config, { seed: 1 });
  const full = swarmSpeed(state);
  state.invaders.slice(0, state.invaders.length / 2).forEach((inv) => (inv.alive = false));
  const half = swarmSpeed(state);
  state.invaders.slice(0, -1).forEach((inv) => (inv.alive = false));
  const last = swarmSpeed(state);
  assert.ok(full < half && half < last, `${full} < ${half} < ${last}`);
  assert.ok(swarmSpeed({ ...state, easy: true }) < last, 'Easy is slower');
});

test('only the lowest invader in each column shoots', () => {
  const state = createGame(config, { seed: 1 });
  const bottom = state.swarm.rows - 1;
  assert.ok(shooters(state).every((inv) => inv.row === bottom));
  state.invaders.find((inv) => inv.col === 0 && inv.row === bottom).alive = false;
  assert.equal(shooters(state).find((inv) => inv.col === 0).row, bottom - 1);
});

function barrierColumn(state) {
  const b = state.barriers[1];
  const col = 6;
  const x = b.x + col * b.cell + b.cell / 2;
  const rows = [...Array(b.rows).keys()].filter((r) => b.cells[r * b.cols + col]);
  return { b, col, x, rows };
}

test('barriers erode from below under your shots', () => {
  const state = createGame(config, { seed: 1 });
  const { b, col, x, rows } = barrierColumn(state);
  state.cannon.x = x;
  state.enemyShots = [];
  state.config = { ...config, invaderShots: { ...config.invaderShots, perSecond: 0 } };
  for (let i = 0; i < 30 && state.shots.length === 0; i++) step(state, { moveTo: x, fire: true });
  for (let i = 0; i < 60 && state.shots.length; i++) step(state, { moveTo: x });
  const lowest = Math.max(...rows);
  assert.equal(b.cells[lowest * b.cols + col], 0, 'the lowest cell went first');
  assert.equal(b.cells[Math.min(...rows) * b.cols + col], 1, 'the top cell is still there');
});

test('barriers erode from above under the swarm\'s shots', () => {
  const state = createGame(config, { seed: 1 });
  const { b, col, x, rows } = barrierColumn(state);
  state.config = { ...config, invaderShots: { ...config.invaderShots, perSecond: 0 } };
  state.enemyShots = [{ x, y: b.y - 20, vx: 0 }];
  for (let i = 0; i < 60 && state.enemyShots.length; i++) step(state, {});
  assert.equal(b.cells[Math.min(...rows) * b.cols + col], 0, 'the top cell went first');
  assert.equal(b.cells[Math.max(...rows) * b.cols + col], 1, 'the lowest cell is still there');
});

test('the run ends when the swarm reaches the cannon row', () => {
  const state = createGame(config, { seed: 1 });
  state.swarm.oy = config.cannon.y - 80;
  let events = [];
  for (let i = 0; i < 60 * 60 && state.phase === 'play'; i++) events = step(state, {});
  assert.equal(state.phase, 'over');
  assert.equal(state.endReason, 'landed');
  assert.ok(events.some((e) => e.type === 'over'));
});

test('the run ends when the last life is lost', () => {
  const state = createGame(config, { seed: 1 });
  state.lives = 1;
  state.enemyShots = [{ x: state.cannon.x, y: config.cannon.y - 20, vx: 0 }];
  for (let i = 0; i < 30 && state.phase === 'play'; i++) step(state, {});
  assert.equal(state.lives, 0);
  assert.equal(state.endReason, 'lives');
});

test('a hit costs a life and pauses the swarm until the cannon is back', () => {
  const state = createGame(config, { seed: 1 });
  state.enemyShots = [{ x: state.cannon.x, y: config.cannon.y - 20, vx: 0 }];
  for (let i = 0; i < 30 && state.lives === 3; i++) step(state, {});
  assert.equal(state.lives, 2);
  const ox = state.swarm.ox;
  step(state, {});
  assert.equal(state.swarm.ox, ox);
});

test('the Probe appears once 40% of the swarm is gone, not before', () => {
  const state = createGame(config, { seed: 3 });
  const need = Math.ceil(state.swarm.total * config.probe.at);
  state.invaders.slice(0, need - 1).forEach((inv) => (inv.alive = false));
  step(state, {});
  assert.equal(state.probe, null);
  state.invaders[need - 1].alive = false;
  step(state, {});
  assert.ok(state.probe, 'the Probe is on screen');
  assert.ok(state.probe.x < 0 || state.probe.x > config.field.width, 'it comes in from a side');
});

test('hitting the Probe scores its bonus and marks it hit', () => {
  const state = createGame(config, { seed: 3 });
  state.probe = { x: 150, y: config.probe.y, dir: 1 };
  state.probeSpawned = true;
  state.shots = [{ x: 150, y: config.probe.y + 8 }];
  const events = step(state, {});
  assert.ok(events.some((e) => e.type === 'probe'));
  assert.equal(state.score, config.probe.bonus);
  assert.equal(state.probeHit, true);
});

test('clearing a wave scores its bonus, and every third wave gives a life', () => {
  const state = createGame(config, { seed: 1 });
  let expected = 0;
  for (let wave = 1; wave <= 3; wave++) {
    state.invaders.forEach((inv) => (inv.alive = false));
    const cleared = step(state, {}).find((e) => e.type === 'cleared');
    assert.equal(state.phase, 'cleared');
    assert.equal(cleared.bonus, config.waveBonus * wave);
    expected += cleared.bonus + cleared.outsmarted;
    if (wave < 3) startWave(state, wave + 1);
  }
  assert.equal(state.score, expected);
  assert.equal(state.lives, config.cannon.lives + 1);
});

test('the grid starts at 4 by 9 and grows, never to the arcade original\'s 5 by 11', () => {
  assert.deepEqual(config.grids[0], [4, 9]);
  assert.ok(config.grids.every(([r, c]) => !(r === 5 && c === 11)));
  const state = createGame(config, { seed: 1 });
  startWave(state, 99);
  assert.deepEqual([state.swarm.rows, state.swarm.cols], config.grids.at(-1));
  assert.equal(config.barriers.count, 3);
});

test('you get a second shot from the wave set in waves.json', () => {
  const state = createGame(config, { seed: 1 });
  const fireTwice = () => {
    state.shots = [];
    state.cannon.cooldown = 0;
    step(state, { fire: true });
    state.cannon.cooldown = 0;
    step(state, { fire: true });
    return state.shots.length;
  };
  assert.equal(fireTwice(), 1);
  startWave(state, config.playerShots.secondShotWave);
  assert.equal(fireTwice(), 2);
});
