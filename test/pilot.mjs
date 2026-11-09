// A scripted pilot for Divide's tests. It turns toward a target at the ship's capped rate, leads
// it, fires when lined up, and thrusts away from a piece about to hit it. Habits are parameters:
//   park:     never thrusts except to flee (sits wherever it is)
//   roam:     keeps thrusting forward most of the time
//   spray:    spins and fires all the time
//   bigFirst: targets the largest piece rather than the nearest
//   random:   turns and thrusts on a fixed pseudo-random pattern
import { createGame, pieceVelocity, startWave, step, wrapDelta } from '../src/divide.js';


function angleTo(dx, dy) {
  return Math.atan2(dx, -dy);
}

function diff(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

// Where to point to hit a piece moving at v from relative position (dx, dy) with shots at speed s.
function lead(dx, dy, v, s) {
  const a = v.vx * v.vx + v.vy * v.vy - s * s;
  const b = 2 * (dx * v.vx + dy * v.vy);
  const cc = dx * dx + dy * dy;
  const disc = b * b - 4 * a * cc;
  const t = disc < 0 ? 0 : Math.max(0, (-b - Math.sqrt(disc)) / (2 * a));
  return { x: dx + v.vx * t, y: dy + v.vy * t, t };
}

export function pilot(habit = {}) {
  return (state) => {
    const c = state.config;
    const ship = state.ship;
    if (!ship.alive) return {};
    const { width, height } = c.field;
    // A slow pseudo-random pattern, the same for the same run, for jitter and the random habit.
    const k = Math.floor(state.time * 2);
    const r = (((k + state.seed) * 2654435761) >>> 0) / 4294967296;
    let threat = null;
    let target = null;
    let best = Infinity;
    state.pieces.forEach((p, i) => {
      const dx = wrapDelta(ship.x, p.x, width);
      const dy = wrapDelta(ship.y, p.y, height);
      const v = pieceVelocity(state, p);
      const rvx = v.vx - ship.vx;
      const rvy = v.vy - ship.vy;
      const dist = Math.hypot(dx, dy);
      // Closest approach in the next second.
      const t = Math.max(0, Math.min(1, -(dx * rvx + dy * rvy) / (rvx * rvx + rvy * rvy || 1)));
      const miss = Math.hypot(dx + rvx * t, dy + rvy * t);
      if (miss < c.nodes.radius[p.size] + c.ship.radius + 10 && (!threat || t < threat.t)) threat = { dx, dy, t, dist };
      let score = dist;
      if (habit.bigFirst) score += (2 - p.size) * -1000;
      if (habit.random) score = ((i * 7919 + k * 104729) % 97) + dist / 1000;
      if (score < best) {
        best = score;
        target = { dx, dy, v };
      }
    });
    // Fleeing: point away from a piece about to hit and thrust.
    if (threat && threat.t < 0.7 && threat.dist < 90) {
      const off = diff(ship.angle, angleTo(-threat.dx, -threat.dy));
      return { left: off < -0.1, right: off > 0.1, thrust: Math.abs(off) < 1.2, fire: habit.spray === true };
    }
    if (!target) return {};
    const aim = lead(target.dx, target.dy, { vx: target.v.vx - ship.vx, vy: target.v.vy - ship.vy }, c.shots.speed);
    // Not a perfect shot: the aim wanders a little.
    const off = diff(ship.angle, angleTo(aim.x, aim.y) + (r - 0.5) * (habit.jitter ?? 0.3));
    const inRange = Math.hypot(aim.x, aim.y) < c.shots.speed * c.shots.life;
    const speed = Math.hypot(ship.vx, ship.vy);
    const calm = !threat;
    let thrust = false;
    if (habit.roam) thrust = calm && speed < c.ship.topSpeed * 0.35 && Math.abs(off) < 0.6;
    if (habit.random) thrust = calm && r > 0.6 && speed < c.ship.topSpeed * 0.3;
    const tolerance = habit.spray ? 0.8 : 0.12;
    return { left: off < -0.03, right: off > 0.03, thrust, fire: habit.spray || (inRange && Math.abs(off) < tolerance) };
  };
}

export const PILOTS = {
  parker: pilot({ park: true }),
  roamer: pilot({ roam: true }),
  sprayer: pilot({ spray: true }),
  bigFirst: pilot({ bigFirst: true }),
  random: pilot({ random: true }),
};

// Plays one run until game over, `maxWave` is passed, or the step cap. Returns the final state and
// the card reports in order.
export function flyRun(config, player, seed, { maxWave = Infinity, maxSteps = 60 * 60 * 10 } = {}) {
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

