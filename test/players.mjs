// Scripted players for the fairness and lesson tests. Each is a habit: chase, camp a lane, spray,
// pick off the edges, hide under barriers, or play at random. All sidestep shots about to hit them,
// so they live long enough for their habit to count.
import { createGame, invaderPos, startWave, step } from '../src/game.js';
import { underBarrier } from '../src/learner.js';

// The x of the nearest live invader the cannon could hit from the open (not from under a barrier).
function nearestX(state, pick = () => true) {
  let best = null;
  for (const inv of state.invaders) {
    if (!inv.alive || !pick(inv)) continue;
    const { x } = invaderPos(state, inv);
    if (underBarrier(state, x)) continue;
    if (best === null || Math.abs(x - state.cannon.x) < Math.abs(best - state.cannon.x)) best = x;
  }
  return best ?? state.cannon.x;
}

function sidestep(state, target, reach = 40) {
  const danger = state.enemyShots.find((e) => e.y > 250 && Math.abs(e.x - state.cannon.x) < 16);
  return danger ? state.cannon.x + (danger.x < state.cannon.x ? reach : -reach) : target;
}

const clear = (state) => !underBarrier(state, state.cannon.x);

export const PLAYERS = {
  chaser: (state) => ({ moveTo: sidestep(state, nearestX(state)), fire: clear(state) }),
  camper: (state) => {
    const lane = state.config.field.width / 2;
    return { moveTo: sidestep(state, Math.max(lane - 45, Math.min(lane + 45, nearestX(state))), 20), fire: clear(state) };
  },
  sprayer: (state) => {
    const t = state.time % 6;
    const x = 20 + (state.config.field.width - 40) * (t < 3 ? t / 3 : 2 - t / 3);
    return { moveTo: sidestep(state, x), fire: true };
  },
  edges: (state) => {
    const cols = state.invaders.filter((i) => i.alive).map((i) => i.col);
    const lo = Math.min(...cols);
    const hi = Math.max(...cols);
    const side = state.time % 10 < 5 ? lo : hi;
    return { moveTo: sidestep(state, nearestX(state, (i) => i.col === side)), fire: clear(state) };
  },
  hider: (state) => {
    const b = state.barriers.reduce((a, c) => (Math.abs(c.x + 28 - state.cannon.x) < Math.abs(a.x + 28 - state.cannon.x) ? c : a));
    const hide = state.time % 2.5 < 1.5;
    return { moveTo: hide ? b.x + (b.cols * b.cell) / 2 : sidestep(state, nearestX(state)), fire: clear(state) };
  },
  random: (state) => {
    const seed = Math.floor(state.time * 2);
    const r = ((seed * 2654435761) >>> 0) / 4294967296;
    return { moveTo: sidestep(state, 15 + r * (state.config.field.width - 30)), fire: (seed & 1) === 0 };
  },
};

// Plays one run until game over, `maxWave` is passed, or the step cap. Returns the final state and
// the card reports in order.
export function playRun(config, player, seed, { maxWave = Infinity, maxSteps = 60 * 60 * 30 } = {}) {
  const state = createGame(config, { seed });
  const reports = [];
  for (let i = 0; i < maxSteps && state.phase !== 'over'; i++) {
    const events = step(state, player(state));
    if (state.phase === 'cleared') {
      reports.push(events.find((e) => e.type === 'cleared').report);
      if (state.wave >= maxWave) break;
      startWave(state, state.wave + 1);
    }
  }
  return { state, reports };
}
