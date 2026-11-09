// Run with: node --test
// Divide's lessons (spec amendment 1, test 4). Each habit triggers its lesson, scripted pilots
// teach theirs within two waves, the zone lesson moves the aim, time spent gone or faint never
// counts, and the shared rules (Probe block, nothing between runs) hold for Divide.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, LARGE, startWave, step, waveStats, wrapDelta, zoneOf } from '../src/divide.js';
import { endWave, finalModel } from '../src/learner.js';
import { flyRun, PILOTS } from './pilot.mjs';

const lessons = JSON.parse(readFileSync('data/divide-lessons.json', 'utf8'));
const config = { ...JSON.parse(readFileSync('data/divide.json', 'utf8')), lessons };

// A wave's counts, as if the player had a habit.
function habit(state, { zones = new Array(9).fill(1 / 9), shots = 30, hits = 20, smallAtProbe = 2 } = {}) {
  state.learn.wave = { steps: 900, zones: zones.map((share) => share * 900), shots, hits, smallAtProbe };
}

const HABITS = {
  zone: { zones: [0, 0, 0, 0, 0.8, 0.2, 0, 0, 0] },
  spray: { shots: 80, hits: 15 },
  clutter: { smallAtProbe: 10 },
};

test('each Divide habit triggers its own lesson, and a balanced wave triggers none', () => {
  for (const [id, counts] of Object.entries(HABITS)) {
    const state = createGame(config, { seed: 1 });
    habit(state, counts);
    const report = endWave(state, waveStats(state));
    assert.deepEqual(report.learned.map((l) => l.id), [id], id);
    assert.match(report.learned[0].text, /\d/, 'the card quotes the number behind it');
    assert.ok(report.learned[0].counter, 'and says how to beat it');
  }
  const state = createGame(config, { seed: 1 });
  habit(state);
  assert.equal(endWave(state, waveStats(state)).learned.length, 0);
});

test('one lesson per trait, so the card matches what the nodes show', () => {
  assert.deepEqual(lessons.map((l) => l.trait).sort(), ['aim', 'dodge', 'speed']);
});

test('the zone lesson names the zone and aims the next wave there, not at the ship', () => {
  const state = createGame(config, { seed: 4 });
  habit(state, { zones: [0, 0, 0, 0, 0, 0, 0, 0, 1] });
  assert.match(endWave(state, waveStats(state)).learned[0].text, /bottom right corner/);
  assert.equal(state.learn.target, 8);
  startWave(state, 12); // a big budget, so Aim reaches its top level
  const aimed = state.pieces.filter((p) => p.traits.aim === 3);
  assert.ok(aimed.length > 0, 'the budget went to Aim');
  for (const p of aimed) {
    // Fully aimed: heading straight at the zone's center, the shortest way round the wrap.
    const want = Math.atan2(wrapDelta(p.x, 250, 300), -wrapDelta(p.y, 400 * (5 / 6), 400));
    const off = Math.abs(Math.atan2(Math.sin(p.heading - want), Math.cos(p.heading - want)));
    assert.ok(off < 1e-6, `heading off by ${off}`);
  }
});

test('scripted pilots teach their habit within two waves', () => {
  const want = { parker: 'zone', sprayer: 'spray', bigFirst: 'clutter' };
  for (const [name, id] of Object.entries(want)) {
    let taught = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { reports } = flyRun(config, PILOTS[name], seed, { maxWave: 2 });
      if (reports.some((r) => r.learned.some((l) => l.id === id) || r.repeated.includes(id))) taught += 1;
    }
    assert.ok(taught >= 5, `${name} taught ${id} in ${taught} of 10 runs`);
  }
});

test('time while the ship is gone or faint never counts', () => {
  const state = createGame(config, { seed: 2 });
  state.pieces = [{ size: LARGE, x: 10, y: 10, heading: 0, rot: 0, traits: { aim: 0, speed: 0, dodge: 0 }, dodgeReady: 0, dodgeUntil: 0, dvx: 0, dvy: 0 }];
  state.ship.faint = 1;
  for (let i = 0; i < 30; i++) step(state, {});
  assert.equal(state.learn.wave.steps, 0, 'faint');
  state.ship.alive = false;
  state.ship.dead = -100;
  for (let i = 0; i < 30; i++) step(state, {});
  assert.equal(state.learn.wave.steps, 0, 'gone');
  state.ship = { ...state.ship, alive: true, faint: 0 };
  step(state, {});
  assert.equal(state.learn.wave.steps, 1);
  assert.equal(state.learn.wave.zones[zoneOf(state, state.ship)], 1);
});

test('hitting the Probe blocks new Divide lessons, and nothing carries over between runs', () => {
  const state = createGame(config, { seed: 1 });
  habit(state, HABITS.zone);
  state.probeHit = true;
  const report = endWave(state, waveStats(state));
  assert.equal(report.blocked, true);
  assert.equal(report.learned.length, 0);
  const first = flyRun(config, PILOTS.parker, 3, { maxWave: 3 }).state;
  assert.ok(finalModel(first).length > 0, 'the first run learned something');
  const fresh = createGame(config, { seed: 3 });
  assert.deepEqual(fresh.learn.lessons, []);
  assert.equal(fresh.learn.target, null);
});
