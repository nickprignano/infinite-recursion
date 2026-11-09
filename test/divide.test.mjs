// Run with: node --test
// Divide, the second mode (spec amendment 1, tests 1 and 2, and the learning-off survival check).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, LARGE, nodesFor, PIECES_PER_NODE, pieceSpeed, SMALL, startWave, step, TRAITS, wrapDistance } from '../src/divide.js';
import { budgetFor, MAX_LEVEL } from '../src/swarm.js';
import { flyRun, PILOTS } from './pilot.mjs';

const config = JSON.parse(readFileSync('data/divide.json', 'utf8'));
const strip = (s) => ({ ...s, config: undefined });
const traitSum = (pieces) => pieces.reduce((s, p) => s + TRAITS.reduce((t, name) => t + p.traits[name], 0), 0);

// A game with the pieces cleared away, for setting up one situation at a time.
function empty(seed = 1) {
  const state = createGame(config, { seed });
  state.pieces = [];
  return state;
}

function node(state, x, y, heading, traits = { aim: 0, speed: 0, dodge: 0 }, size = LARGE) {
  const p = { size, x, y, heading, rot: 0, traits, dodgeReady: 0, dodgeUntil: 0, dvx: 0, dvy: 0 };
  state.pieces.push(p);
  return p;
}

test('a seeded run with the same inputs is the same run', () => {
  const run = (seed) => strip(flyRun(config, PILOTS.parker, seed, { maxSteps: 6000 }).state);
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test('each wave starts its nodes on the edge, far from the ship, with 7 pieces each', () => {
  for (let wave = 1; wave <= 12; wave++) {
    const state = createGame(config, { seed: wave });
    startWave(state, wave);
    const n = nodesFor(config, wave);
    assert.equal(state.pieces.length, n);
    assert.equal(state.total, n * PIECES_PER_NODE);
    assert.ok(n <= config.nodes.max);
    for (const p of state.pieces) assert.ok(wrapDistance(state, p, state.ship) >= config.nodes.spawnDistance);
  }
});

test('ship, shots and pieces wrap to the opposite edge', () => {
  const state = empty();
  Object.assign(state.ship, { x: 299, y: 200, vx: 120, vy: 0, angle: Math.PI / 2 });
  const p = node(state, 150, 1, Math.PI); // heading down... placed near the top, moving down
  p.heading = 0; // moving up, so it crosses the top edge
  node(state, 20, 20, 0, undefined, SMALL); // keeps the wave from clearing
  for (let i = 0; i < 10; i++) step(state, {});
  assert.ok(state.ship.x < 20, `ship x ${state.ship.x}`);
  assert.ok(p.y > 390, `piece y ${p.y}`);
  const s = empty();
  node(s, 20, 20, 0, undefined, SMALL);
  Object.assign(s.ship, { x: 150, y: 5, angle: 0 });
  step(s, { fire: true });
  for (let i = 0; i < 5; i++) step(s, {});
  assert.ok(s.shots[0].y > 300, `shot y ${s.shots[0].y}`);
});

test('a large node splits into 2 medium and a medium into 2 small, at the split angles, with its traits', () => {
  const state = empty();
  const traits = { aim: 1, speed: 2, dodge: 0 };
  node(state, 150, 100, 0.3, traits);
  node(state, 20, 380, 0, undefined, SMALL);
  Object.assign(state.ship, { x: 150, y: 200, angle: 0 });
  let events = [];
  for (let i = 0; i < 60 && !events.some((e) => e.type === 'split'); i++) events = step(state, { fire: i === 0 });
  const kids = state.pieces.filter((p) => p.size === 1);
  assert.equal(kids.length, 2);
  const spread = (config.nodes.splitAngle * Math.PI) / 180;
  assert.deepEqual(kids.map((k) => +(k.heading - 0.3).toFixed(9)).sort((a, b) => a - b), [-spread, spread].map((a) => +a.toFixed(9)));
  for (const k of kids) assert.deepEqual(k.traits, traits);
  assert.equal(state.hits, 1);
  assert.equal(state.score, config.points);
});

test('no piece moves faster than the cap, which is 60% of shot speed', () => {
  assert.ok(config.nodes.speedCap <= 0.6 * config.shots.speed);
  const state = empty();
  state.wave = 40;
  const p = node(state, 0, 0, 0, { aim: 0, speed: MAX_LEVEL, dodge: 0 }, SMALL);
  assert.equal(pieceSpeed(state, p), config.nodes.speedCap);
  state.easy = true;
  state.wave = 1;
  assert.ok(pieceSpeed(state, p) < config.nodes.speed[SMALL] * 1.6, 'Easy is slower');
});

test('touching a piece costs a life, and the ship comes back at a clear center or after the timeout', () => {
  const state = empty();
  node(state, 150, 200, 0, undefined, SMALL).heading = Math.PI / 2;
  Object.assign(state.ship, { x: 150, y: 200 });
  const events = step(state, {});
  assert.ok(events.some((e) => e.type === 'hit'));
  assert.equal(state.lives, config.ship.lives - 1);
  assert.equal(state.ship.alive, false);
  // The piece flies off to the right; the center is clear after the delay.
  let t = 0;
  while (!state.ship.alive) {
    step(state, {});
    t += 1 / 60;
  }
  assert.ok(t >= config.ship.respawnDelay - 1e-9 && t < config.ship.respawnTimeout, `came back after ${t}`);
  assert.equal(state.ship.faint, config.ship.faint);

  // A center that never clears: back after the timeout, faint for longer.
  const busy = empty();
  busy.pieces = [];
  node(busy, 150, 200, 0, undefined, SMALL);
  busy.config = { ...config, nodes: { ...config.nodes, speed: [0, 0, 0] } };
  Object.assign(busy.ship, { x: 150, y: 200 });
  step(busy, {});
  let u = 0;
  while (!busy.ship.alive && u < 10) {
    step(busy, {});
    u += 1 / 60;
  }
  assert.ok(Math.abs(u - config.ship.respawnTimeout) < 0.05, `came back after ${u}`);
  assert.equal(busy.ship.faint, config.ship.faintTimeout);
  step(busy, {});
  assert.equal(busy.lives, config.ship.lives - 1, 'faint ship cannot be hit');
});

test('dodging pieces slide sideways and resume, and never dodge with the ship close', () => {
  const sure = { ...config, traits: { ...config.traits, dodge: { ...config.traits.dodge, chance: [0, 1, 1, 1] } } };
  const state = empty();
  state.config = sure;
  const p = node(state, 150, 100, Math.PI / 2, { aim: 0, speed: 0, dodge: 1 }, SMALL);
  p.traits.speed = 0;
  node(state, 20, 380, 0, undefined, SMALL);
  Object.assign(state.ship, { x: 150, y: 200, angle: 0 });
  state.config = { ...sure, nodes: { ...sure.nodes, speed: [0, 0, 0] } };
  step(state, { fire: true });
  for (let i = 0; i < 30 && p.dvx === 0; i++) step(state, {});
  assert.notEqual(p.dvx, 0, 'it dodged');
  for (let i = 0; i < 60; i++) step(state, {});
  assert.equal(p.dvx, 0, 'old velocity resumed');
  assert.ok(state.pieces.includes(p), 'the shot missed');
  const offset = config.nodes.radius[SMALL] + config.traits.dodge.extra;
  assert.ok(Math.abs(Math.abs(p.x - 150) - offset) < 1.5, `moved ${p.x - 150}`);

  const near = empty();
  near.config = { ...sure, nodes: { ...sure.nodes, speed: [0, 0, 0] } };
  const q = node(near, 150, 160, 0, { aim: 0, speed: 0, dodge: 3 }, SMALL);
  Object.assign(near.ship, { x: 150, y: 210, angle: 0, faint: 5 });
  step(near, { fire: true });
  for (let i = 0; i < 10; i++) step(near, {});
  assert.ok(!near.pieces.includes(q), 'it was hit');
  });

test('the Probe drifts in on a diagonal at 40% of the pieces, and hitting it is noted', () => {
  const state = createGame(config, { seed: 3 });
  const need = Math.ceil(config.probe.at * state.total);
  state.hits = need - 1;
  step(state, {});
  assert.equal(state.probe, null);
  state.hits = need;
  step(state, {});
  assert.ok(state.probe && state.probe.vx !== 0 && state.probe.vy !== 0);
  const { x, y } = state.probe;
  Object.assign(state.ship, { x: x + Math.sign(state.probe.vx) * 40, y: y + Math.sign(state.probe.vy) * 40 });
  state.ship.angle = Math.atan2(x - state.ship.x, -(y - state.ship.y));
  state.ship.faint = 10;
  let events = [];
  for (let i = 0; i < 60 && !events.some((e) => e.type === 'probe'); i++) events = step(state, { fire: true });
  assert.ok(state.probeHit, 'Probe hit');
});

test('the wave clears when all 7N pieces are gone, with a bonus', () => {
  const state = createGame(config, { seed: 5 });
  state.pieces = [];
  state.hits = state.total;
  const events = step(state, {});
  assert.equal(state.phase, 'cleared');
  assert.equal(events.find((e) => e.type === 'cleared').bonus, config.waveBonus);
});

test('every Divide budget is whole and fits, and assigned traits sum to it', () => {
  for (let wave = 1; wave <= 20; wave++) {
    const n = nodesFor(config, wave);
    const budget = budgetFor(config, wave, n);
    assert.ok(Number.isInteger(budget) && budget <= 9 * n);
    const state = createGame(config, { seed: wave });
    startWave(state, wave);
    assert.equal(traitSum(state.pieces), budget, `wave ${wave}`);
    for (const p of state.pieces) for (const t of TRAITS) assert.ok(p.traits[t] >= 0 && p.traits[t] <= MAX_LEVEL);
  }
});

test('with learning off, every scripted pilot survives into the fairness band', () => {
  const { minMedian, maxMedian, maxWave, maxSteps } = config.fairness;
  for (const [name, player] of Object.entries(PILOTS)) {
    const reached = [];
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = flyRun(config, player, seed, { maxWave, maxSteps });
      reached.push(state.phase === 'over' ? state.wave : state.wave + 1);
    }
    reached.sort((a, b) => a - b);
    const median = reached[10];
    assert.ok(median >= minMedian && median <= maxMedian, `${name}: median wave ${median}`);
  }
});
