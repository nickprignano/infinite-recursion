// Run with: node --test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Effects, MAX_GLOWS_PER_SECOND, MAX_PARTICLES } from '../src/effects.js';

const { field } = JSON.parse(readFileSync('data/waves.json', 'utf8'));
const quarter = (field.width * field.height) / 4;

// A storm of kills, Probe hits and cannon hits, 20 a second for 10 seconds.
function storm(effects) {
  const glows = [];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const types = ['kill', 'kill', 'kill', 'probe', 'hit', 'chip'];
  for (let i = 0; i < 200; i++) {
    const time = i / 20;
    const before = effects.glows.length;
    effects.add([{ type: types[Math.floor(rand() * types.length)], x: rand() * field.width, y: rand() * field.height }], time);
    glows.push(...effects.glows.slice(before));
    effects.update(1 / 20);
    assert.ok(effects.particles.length <= MAX_PARTICLES);
  }
  return glows;
}

test('never more than 3 glow events in any second, none over a quarter of the playfield', () => {
  const glows = storm(new Effects(field));
  assert.ok(glows.length > 0);
  for (const g of glows) {
    assert.ok(Math.PI * g.r * g.r <= quarter, 'glow area');
    const inWindow = glows.filter((o) => o.time > g.time - 1 && o.time <= g.time).length;
    assert.ok(inWindow <= MAX_GLOWS_PER_SECOND, `${inWindow} glows in one second`);
  }
});

test('Reduce effects gives no glows and no particles, only plain rings', () => {
  const effects = new Effects(field, { reduced: () => true });
  assert.equal(storm(effects).length, 0);
  assert.equal(effects.particles.length, 0);
  effects.add([{ type: 'kill', x: 10, y: 10 }], 99);
  assert.equal(effects.rings.length > 0, true);
});

test('turning Reduce effects on mid-game clears glows and particles at once', () => {
  let reduced = false;
  const effects = new Effects(field, { reduced: () => reduced });
  effects.add([{ type: 'probe', x: 100, y: 100 }], 0);
  assert.ok(effects.glows.length && effects.particles.length);
  reduced = true;
  effects.update(0);
  assert.equal(effects.glows.length + effects.particles.length, 0);
});
