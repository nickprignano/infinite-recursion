// The game itself: waves, movement, shots, barriers, the Probe and scoring. Pure functions over a
// plain state object, with no DOM, so Node tests can play it. Numbers come from data/waves.json.
// Coordinates are playfield units (300 by 400), y pointing down; positions are centers.
// config is data/waves.json with data/lessons.json under `lessons`.
import { endWave, newLearner, observe, startWaveStats, weightOf } from './learner.js';
import { random } from './rng.js';
import { assignTraits, budgetFor } from './swarm.js';

export const STEP = 1 / 60;

// Our own barrier shape: a chevron with a rounded peak and a notch underneath.
const BARRIER_SHAPE = [
  '.....XXXX.....',
  '...XXXXXXXX...',
  '.XXXXXXXXXXXX.',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXX....XXXXX',
  'XXXX......XXXX',
  'XXX........XXX',
];

export function createGame(config, { seed = 1, easy = false } = {}) {
  const state = {
    config,
    seed,
    rng: seed >>> 0,
    easy,
    time: 0,
    score: 0,
    lives: config.cannon.lives,
    wave: 0,
    wavesCleared: 0,
    phase: 'play', // 'play' | 'cleared' | 'over'
    endReason: null, // 'lives' | 'landed'
    learn: newLearner(),
  };
  startWave(state, 1);
  return state;
}

export function startWave(state, wave) {
  const c = state.config;
  const [rows, cols] = c.grids[Math.min(wave, c.grids.length) - 1];
  const s = c.swarm;
  state.wave = wave;
  state.phase = 'play';
  state.swarm = {
    ox: (c.field.width - (cols - 1) * s.spacingX) / 2,
    oy: Math.min(s.startY + s.startYPerWave * (wave - 1), s.startYMax),
    dir: 1,
    rows,
    cols,
    total: rows * cols,
  };
  state.invaders = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      state.invaders.push({ row, col, alive: true, dx: 0, dodgeTo: 0, dodgeUntil: 0, dodgeReady: 0 });
    }
  }
  state.cannon = { x: c.field.width / 2, vx: 0, cooldown: 0, respawn: 0 };
  state.shots = [];
  state.enemyShots = [];
  state.barriers = makeBarriers(c);
  state.probe = null;
  state.probeSpawned = false;
  state.probeHit = false;
  // The learning: this wave's traits come from the fixed budget, spread by the active lessons.
  assignTraits(state.invaders, budgetFor(c, wave, state.invaders.length), weightOf(state));
  startWaveStats(state);
}

function makeBarriers(c) {
  const { count, y, cell } = c.barriers;
  const cols = BARRIER_SHAPE[0].length;
  const rows = BARRIER_SHAPE.length;
  const barriers = [];
  for (let i = 0; i < count; i++) {
    const center = (c.field.width * (i + 1)) / (count + 1);
    barriers.push({
      x: center - (cols * cell) / 2,
      y,
      cell,
      cols,
      rows,
      cells: BARRIER_SHAPE.join('').split('').map((ch) => (ch === 'X' ? 1 : 0)),
    });
  }
  return barriers;
}

export function invaderPos(state, inv) {
  const s = state.config.swarm;
  return { x: state.swarm.ox + inv.col * s.spacingX + inv.dx, y: state.swarm.oy + inv.row * s.spacingY };
}

export function aliveCount(state) {
  return state.invaders.reduce((n, inv) => n + (inv.alive ? 1 : 0), 0);
}

// Sideways speed in units a second: faster each wave, and much faster as the swarm thins out.
export function swarmSpeed(state) {
  const s = state.config.swarm;
  const killed = 1 - aliveCount(state) / state.swarm.total;
  const easy = state.easy ? state.config.easy : 1;
  return s.speed * (1 + s.speedPerWave * (state.wave - 1)) * (1 + s.thinBoost * killed * killed) * easy;
}

// One fixed step. input: { moveTo: x or null, left, right, fire }. Returns what happened, for
// drawing and sound.
export function step(state, input = {}) {
  const events = [];
  if (state.phase !== 'play') return events;
  state.time += STEP;
  const c = state.config;

  if (state.cannon.respawn > 0) {
    // After a hit everything holds still until the cannon is back.
    state.cannon.respawn -= STEP;
    return events;
  }

  moveCannon(state, input);
  fire(state, input, events);
  moveSwarm(state, events);
  if (state.phase !== 'play') return events;
  dodge(state);
  enemyFire(state);
  moveProbe(state);
  moveShots(state, events);
  if (state.phase !== 'play') return events;
  observe(state, events);

  if (aliveCount(state) === 0) {
    state.phase = 'cleared';
    state.wavesCleared += 1;
    const bonus = c.waveBonus * state.wave;
    const report = endWave(state);
    // Outsmarted: the swarm learned nothing from this wave, new or repeated.
    const outsmarted = report.learned.length === 0 && report.repeated.length === 0 ? c.outsmartedBonus : 0;
    state.score += bonus + outsmarted;
    events.push({ type: 'cleared', bonus, outsmarted, report });
    if (state.wavesCleared % c.cannon.extraLifeEvery === 0 && state.lives < c.cannon.maxLives) {
      state.lives += 1;
      events.push({ type: 'extra-life' });
    }
  }
  return events;
}

function moveCannon(state, input) {
  const c = state.config;
  const cannon = state.cannon;
  const before = cannon.x;
  if (input.moveTo != null) {
    const max = c.cannon.followSpeed * STEP;
    cannon.x += Math.max(-max, Math.min(max, input.moveTo - cannon.x));
  } else {
    cannon.x += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * c.cannon.speed * STEP;
  }
  const half = c.cannon.width / 2 + 2;
  cannon.x = Math.max(half, Math.min(c.field.width - half, cannon.x));
  cannon.vx = (cannon.x - before) / STEP;
}

function fire(state, input, events) {
  const c = state.config;
  const cannon = state.cannon;
  cannon.cooldown = Math.max(0, cannon.cooldown - STEP);
  const max = state.wave >= c.playerShots.secondShotWave ? 2 : 1;
  if (input.fire && cannon.cooldown === 0 && state.shots.length < max) {
    state.shots.push({ x: cannon.x, y: c.cannon.y - c.cannon.height });
    cannon.cooldown = c.playerShots.cooldown;
    events.push({ type: 'fire' });
  }
}

function moveSwarm(state, events) {
  const c = state.config;
  const sw = state.swarm;
  const halfW = c.invader.width / 2;
  sw.ox += sw.dir * swarmSpeed(state) * STEP;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const inv of state.invaders) {
    if (!inv.alive) continue;
    const { x, y } = invaderPos(state, inv);
    minX = Math.min(minX, x - halfW);
    maxX = Math.max(maxX, x + halfW);
    maxY = Math.max(maxY, y + c.invader.height / 2);
  }
  const margin = c.swarm.edgeMargin;
  if ((sw.dir > 0 && maxX >= c.field.width - margin) || (sw.dir < 0 && minX <= margin)) {
    sw.ox -= sw.dir > 0 ? maxX - (c.field.width - margin) : minX - margin;
    sw.dir = -sw.dir;
    sw.oy += c.swarm.stepDown;
    maxY += c.swarm.stepDown;
    events.push({ type: 'step-down' });
  }
  // Invaders wipe out any barrier cells they pass through.
  for (const inv of state.invaders) {
    if (!inv.alive) continue;
    const { x, y } = invaderPos(state, inv);
    for (const b of state.barriers) {
      eraseRect(b, x - halfW, y - c.invader.height / 2, x + halfW, y + c.invader.height / 2);
    }
  }
  if (maxY >= c.cannon.y - c.cannon.height / 2) {
    state.phase = 'over';
    state.endReason = 'landed';
    events.push({ type: 'over', reason: 'landed' });
  }
}

function eraseRect(b, x0, y0, x1, y1) {
  const { cell } = b;
  for (let r = 0; r < b.rows; r++) {
    const cy = b.y + r * cell;
    if (cy + cell <= y0 || cy >= y1) continue;
    for (let col = 0; col < b.cols; col++) {
      const cx = b.x + col * cell;
      if (cx + cell <= x0 || cx >= x1) continue;
      b.cells[r * b.cols + col] = 0;
    }
  }
}

// The lowest invader in each column may shoot.
export function shooters(state) {
  const lowest = new Map();
  for (const inv of state.invaders) {
    if (inv.alive && (!lowest.has(inv.col) || inv.row > lowest.get(inv.col).row)) lowest.set(inv.col, inv);
  }
  return [...lowest.values()].sort((a, b) => a.col - b.col);
}

// Fire: each level makes that invader likelier to be the one shooting and the swarm shoot more
// often. Aim: each level leads your movement more and bends the shot toward you (and toward the
// lane a lesson names).
function enemyFire(state) {
  const cfg = state.config;
  const c = cfg.invaderShots;
  const can = shooters(state);
  if (can.length === 0 || state.enemyShots.length >= c.max) return;
  const easy = state.easy ? cfg.easy : 1;
  const weights = can.map((inv) => 1 + cfg.traits.fire.perLevel * inv.traits.fire);
  const total = weights.reduce((a, b) => a + b, 0);
  const rate = c.perSecond * (1 + c.perSecondPerWave * (state.wave - 1)) * easy * (total / can.length);
  if (random(state) >= rate * STEP) return;
  let pick = random(state) * total;
  let k = 0;
  while (pick >= weights[k] && k < can.length - 1) pick -= weights[k++];
  const inv = can[k];
  const { x, y } = invaderPos(state, inv);
  const y0 = y + cfg.invader.height / 2;
  let vx = 0;
  const aim = inv.traits.aim / 3;
  if (aim > 0) {
    const flight = (cfg.cannon.y - y0) / c.speed;
    let target = state.cannon.x + state.cannon.vx * flight * aim;
    if (state.learn.target != null) {
      const laneX = ((state.learn.target + 0.5) / 5) * cfg.field.width;
      target += (laneX - target) * cfg.traits.aim.laneBlend * aim;
    }
    const max = cfg.traits.aim.maxVx * aim;
    vx = Math.max(-max, Math.min(max, ((target - x) / flight) * aim));
  }
  state.enemyShots.push({ x, y: y0, vx });
}

// Dodge: an invader with a shot heading for it may sidestep (chance by level, then a cooldown),
// and drifts back into formation afterwards.
function dodge(state) {
  const cfg = state.config;
  const d = cfg.traits.dodge;
  const halfW = cfg.invader.width / 2;
  for (const inv of state.invaders) {
    if (!inv.alive) continue;
    if (inv.traits.dodge > 0 && state.time >= inv.dodgeReady) {
      const { x, y } = invaderPos(state, inv);
      const shot = state.shots.find((s) => s.y > y && s.y - y < d.range && Math.abs(s.x - x) < halfW + 2);
      if (shot) {
        inv.dodgeReady = state.time + d.cooldown;
        if (random(state) < d.chance[inv.traits.dodge]) {
          const away = shot.x === x ? (random(state) < 0.5 ? -1 : 1) : Math.sign(x - shot.x);
          inv.dodgeTo = away * d.step;
          inv.dodgeUntil = state.time + d.cooldown / 2;
        }
      }
    }
    const goal = state.time < inv.dodgeUntil ? inv.dodgeTo : 0;
    const move = d.speed * STEP;
    inv.dx += Math.max(-move, Math.min(move, goal - inv.dx));
  }
}

function moveProbe(state) {
  const c = state.config;
  const p = c.probe;
  if (!state.probeSpawned && 1 - aliveCount(state) / state.swarm.total >= p.at) {
    state.probeSpawned = true;
    const dir = random(state) < 0.5 ? 1 : -1;
    state.probe = { x: dir > 0 ? -p.width : c.field.width + p.width, y: p.y, dir };
  }
  if (!state.probe) return;
  state.probe.x += state.probe.dir * p.speed * STEP;
  if (state.probe.x < -p.width * 2 || state.probe.x > c.field.width + p.width * 2) state.probe = null;
}

function moveShots(state, events) {
  const c = state.config;

  // Your shots, moving up. Each checks the path it swept this step, so nothing is skipped.
  for (const shot of state.shots) {
    const y0 = shot.y;
    const y1 = y0 - c.playerShots.speed * STEP;
    shot.y = y1;
    if (hitBarrier(state, shot.x, y0, y1, events)) {
      shot.dead = true;
      continue;
    }
    for (const inv of state.invaders) {
      if (!inv.alive) continue;
      const { x, y } = invaderPos(state, inv);
      if (Math.abs(shot.x - x) <= c.invader.width / 2 && y1 <= y + c.invader.height / 2 && y0 >= y - c.invader.height / 2) {
        inv.alive = false;
        shot.dead = true;
        const points = c.rowPoints[Math.min(inv.row, c.rowPoints.length - 1)];
        state.score += points;
        events.push({ type: 'kill', x, y, row: inv.row, col: inv.col, points });
        break;
      }
    }
    if (shot.dead) continue;
    const probe = state.probe;
    if (probe && Math.abs(shot.x - probe.x) <= c.probe.width / 2 && y1 <= probe.y + c.probe.height / 2 && y0 >= probe.y - c.probe.height / 2) {
      shot.dead = true;
      state.score += c.probe.bonus;
      state.probeHit = true;
      state.probe = null;
      events.push({ type: 'probe', x: probe.x, y: probe.y, points: c.probe.bonus });
      continue;
    }
    if (y1 < 0) shot.dead = true;
  }
  state.shots = state.shots.filter((s) => !s.dead);

  // The swarm's shots, moving down.
  const cannonTop = c.cannon.y - c.cannon.height / 2;
  for (const shot of state.enemyShots) {
    const y0 = shot.y;
    const y1 = y0 + c.invaderShots.speed * STEP;
    shot.x += shot.vx * STEP;
    shot.y = y1;
    if (hitBarrier(state, shot.x, y0, y1, events)) {
      shot.dead = true;
      continue;
    }
    if (Math.abs(shot.x - state.cannon.x) <= c.cannon.width / 2 && y1 >= cannonTop && y0 <= c.cannon.y + c.cannon.height / 2) {
      shot.dead = true;
      loseLife(state, events);
      return;
    }
    if (y1 > c.field.height) shot.dead = true;
  }
  state.enemyShots = state.enemyShots.filter((s) => !s.dead);
}

function loseLife(state, events) {
  state.lives -= 1;
  events.push({ type: 'hit', x: state.cannon.x, y: state.config.cannon.y });
  state.enemyShots = [];
  state.shots = [];
  if (state.lives <= 0) {
    state.phase = 'over';
    state.endReason = 'lives';
    events.push({ type: 'over', reason: 'lives' });
  } else {
    state.cannon.respawn = state.config.cannon.respawn;
  }
}

// Finds the first barrier cell a shot meets moving from y0 to y1 at x, removes it and a small
// cross around it, and says whether the shot was stopped.
function hitBarrier(state, x, y0, y1, events) {
  const down = y1 > y0;
  for (const b of state.barriers) {
    const { cell } = b;
    const col = Math.floor((x - b.x) / cell);
    if (col < 0 || col >= b.cols) continue;
    const order = [...Array(b.rows).keys()];
    if (!down) order.reverse();
    for (const r of order) {
      if (!b.cells[r * b.cols + col]) continue;
      const top = b.y + r * cell;
      const bottom = top + cell;
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      if (bottom < lo || top > hi) continue;
      for (const [dr, dc] of [[0, 0], [0, -1], [0, 1], [down ? 1 : -1, 0]]) {
        const rr = r + dr;
        const cc = col + dc;
        if (rr >= 0 && rr < b.rows && cc >= 0 && cc < b.cols) b.cells[rr * b.cols + cc] = 0;
      }
      events.push({ type: 'chip', x, y: top + cell / 2 });
      return true;
    }
  }
  return false;
}
