// Divide, the second mode: a ship that turns, thrusts and drifts on a field that wraps at the edges,
// and nodes that split into smaller copies of themselves when hit. Pure functions over a plain
// state object, with no DOM, so Node tests can play it. Numbers come from data/divide.json.
// Coordinates are playfield units (300 by 400), y pointing down; an angle of 0 points up.
import { random } from './rng.js';
import { assignTraits, budgetFor } from './swarm.js';

export const STEP = 1 / 60;
export const TRAITS = ['aim', 'speed', 'dodge'];
export const LARGE = 0;
export const SMALL = 2;
// A large node is 1 + 2 + 4 pieces.
export const PIECES_PER_NODE = 7;

const RAD = Math.PI / 180;

export function createGame(config, { seed = 1, easy = false } = {}) {
  const state = {
    mode: 'divide',
    config,
    seed,
    rng: seed >>> 0,
    easy,
    time: 0,
    score: 0,
    lives: config.ship.lives,
    wave: 0,
    wavesCleared: 0,
    phase: 'play', // 'play' | 'cleared' | 'over'
    endReason: null, // 'lives'
  };
  startWave(state, 1);
  return state;
}

// Large nodes in a wave: listed, then one more every `growEvery` waves, up to `max`.
export function nodesFor(config, wave) {
  const n = config.nodes;
  const list = n.perWave;
  const extra = Math.floor(Math.max(0, wave - list.length) / n.growEvery);
  return Math.min(list[Math.min(wave, list.length) - 1] + extra, n.max);
}

// Wrapped difference b - a along one axis: the shortest way round.
export function wrapDelta(a, b, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

export function wrapDistance(state, a, b) {
  const { width, height } = state.config.field;
  return Math.hypot(wrapDelta(a.x, b.x, width), wrapDelta(a.y, b.y, height));
}

function wrap(state, o) {
  const { width, height } = state.config.field;
  o.x = ((o.x % width) + width) % width;
  o.y = ((o.y % height) + height) % height;
}

export function startWave(state, wave) {
  const c = state.config;
  state.wave = wave;
  state.phase = 'play';
  state.ship = newShip(c, 0);
  state.shots = [];
  state.probe = null;
  state.probeSpawned = false;
  state.probeHit = false;
  state.hits = 0;
  const count = nodesFor(c, wave);
  state.total = count * PIECES_PER_NODE;
  state.pieces = [];
  for (let i = 0; i < count; i++) state.pieces.push(enterNode(state));
  // Traits come from the fixed budget. Spread evenly until Divide learns.
  assignTraits(state.pieces, budgetFor(c, wave, count), () => 1, TRAITS);
  for (const p of state.pieces) aimAtEntry(state, p);
}

function newShip(c, faint) {
  return { x: c.field.width / 2, y: c.field.height / 2, angle: 0, vx: 0, vy: 0, cooldown: 0, alive: true, dead: 0, faint, thrusting: false };
}

// A large node on a random point of the field's edge, with a random heading. Edges are always at
// least the spawn distance from the center, where the ship starts each wave.
function enterNode(state) {
  const { width, height } = state.config.field;
  let t = random(state) * 2 * (width + height);
  let x;
  let y;
  if (t < width) [x, y] = [t, 0];
  else if ((t -= width) < height) [x, y] = [width, t];
  else if ((t -= height) < width) [x, y] = [t, height];
  else [x, y] = [0, t - width];
  return piece(LARGE, x, y, random(state) * Math.PI * 2, random(state) * Math.PI * 2);
}

function piece(size, x, y, heading, rot, traits) {
  return { size, x, y, heading, rot, traits, dodgeReady: 0, dodgeUntil: 0, dvx: 0, dvy: 0 };
}

// Aim acts once, when the node enters: its heading turns a third of the way per level toward its
// target. Nothing homes after that.
function aimAtEntry(state, p) {
  const level = p.traits.aim;
  if (!level) return;
  const target = aimTarget(state);
  const { width, height } = state.config.field;
  const want = Math.atan2(wrapDelta(p.x, target.x, width), -wrapDelta(p.y, target.y, height));
  let diff = want - p.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  p.heading += (diff * level) / 3;
}

// What Aim points at: the ship. (Divide's lessons will name a zone instead.)
function aimTarget(state) {
  return state.ship;
}

export function pieceSpeed(state, p) {
  const n = state.config.nodes;
  const easy = state.easy ? state.config.easy : 1;
  const speed = n.speed[p.size] * (1 + n.speedPerWave * (state.wave - 1)) * (1 + state.config.traits.speed.perLevel * p.traits.speed) * easy;
  return Math.min(speed, n.speedCap);
}

export function pieceVelocity(state, p) {
  const s = pieceSpeed(state, p);
  return { vx: Math.sin(p.heading) * s + p.dvx, vy: -Math.cos(p.heading) * s + p.dvy };
}

// One fixed step. input: { left, right, thrust, fire }. Returns what happened, for drawing and
// sound.
export function step(state, input = {}) {
  const events = [];
  if (state.phase !== 'play') return events;
  state.time += STEP;
  moveShip(state, input, events);
  fire(state, input, events);
  dodge(state);
  movePieces(state);
  moveProbe(state);
  moveShots(state, events);
  collide(state, events);
  if (state.phase !== 'play') return events;

  if (state.hits >= state.total) {
    const c = state.config;
    state.phase = 'cleared';
    state.wavesCleared += 1;
    const bonus = c.waveBonus * state.wave;
    state.score += bonus;
    events.push({ type: 'cleared', bonus, outsmarted: 0, report: null });
    if (state.wavesCleared % c.ship.extraLifeEvery === 0 && state.lives < c.ship.maxLives) {
      state.lives += 1;
      events.push({ type: 'extra-life' });
    }
  }
  return events;
}

function moveShip(state, input, events) {
  const c = state.config;
  const s = c.ship;
  const ship = state.ship;
  if (!ship.alive) {
    // Back at the center once it's clear, or after the timeout regardless (then faint for longer).
    ship.dead += STEP;
    if (ship.dead < s.respawnDelay) return;
    const center = { x: c.field.width / 2, y: c.field.height / 2 };
    const clear = state.pieces.every((p) => wrapDistance(state, p, center) > s.safeRadius + c.nodes.radius[p.size]);
    if (clear || ship.dead >= s.respawnTimeout) {
      state.ship = newShip(c, clear ? s.faint : s.faintTimeout);
      events.push({ type: 'respawn' });
    }
    return;
  }
  ship.faint = Math.max(0, ship.faint - STEP);
  ship.angle += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * s.turnRate * RAD * STEP;
  ship.thrusting = Boolean(input.thrust);
  if (ship.thrusting) {
    ship.vx += Math.sin(ship.angle) * s.thrust * STEP;
    ship.vy -= Math.cos(ship.angle) * s.thrust * STEP;
  }
  const keep = 1 - s.drag * STEP;
  ship.vx *= keep;
  ship.vy *= keep;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > s.topSpeed) {
    ship.vx *= s.topSpeed / speed;
    ship.vy *= s.topSpeed / speed;
  }
  ship.x += ship.vx * STEP;
  ship.y += ship.vy * STEP;
  wrap(state, ship);
}

function fire(state, input, events) {
  const c = state.config;
  const ship = state.ship;
  ship.cooldown = Math.max(0, ship.cooldown - STEP);
  if (!ship.alive || !input.fire || ship.cooldown > 0 || state.shots.length >= c.shots.max) return;
  const dx = Math.sin(ship.angle);
  const dy = -Math.cos(ship.angle);
  const shot = { x: ship.x + dx * c.ship.radius, y: ship.y + dy * c.ship.radius, vx: dx * c.shots.speed, vy: dy * c.shots.speed, life: c.shots.life };
  wrap(state, shot);
  state.shots.push(shot);
  ship.cooldown = c.shots.cooldown;
  events.push({ type: 'fire' });
}

// Dodge: a piece whose path a shot is about to cross may slide sideways (chance by level, then a
// cooldown): its radius plus a few units, quickly, after which its old velocity resumes. Never
// while the ship is near enough for the slide to bring the piece within `shipClear` of it.
function dodge(state) {
  const c = state.config;
  const d = c.traits.dodge;
  const { width, height } = c.field;
  for (const p of state.pieces) {
    if (state.time >= p.dodgeUntil) p.dvx = p.dvy = 0;
    if (!p.traits.dodge || state.time < p.dodgeReady) continue;
    const r = c.nodes.radius[p.size];
    const offset = r + d.extra;
    if (state.ship.alive && wrapDistance(state, p, state.ship) < d.shipClear + r + offset) continue;
    const v = pieceVelocity(state, p);
    const shot = state.shots.find((s) => {
      // Where the shot passes closest to the piece, in the piece's frame.
      const rx = wrapDelta(p.x, s.x, width);
      const ry = wrapDelta(p.y, s.y, height);
      const vx = s.vx - v.vx;
      const vy = s.vy - v.vy;
      const t = -(rx * vx + ry * vy) / (vx * vx + vy * vy);
      if (t <= 0 || t * Math.hypot(vx, vy) > d.range) return false;
      return Math.hypot(rx + vx * t, ry + vy * t) < r + 2;
    });
    if (!shot) continue;
    p.dodgeReady = state.time + d.cooldown;
    if (random(state) >= d.chance[p.traits.dodge]) continue;
    // At right angles to the shot, away from its line.
    const len = Math.hypot(shot.vx, shot.vy);
    let nx = -shot.vy / len;
    let ny = shot.vx / len;
    const side = wrapDelta(shot.x, p.x, width) * nx + wrapDelta(shot.y, p.y, height) * ny;
    if (side < 0 || (side === 0 && random(state) < 0.5)) [nx, ny] = [-nx, -ny];
    p.dvx = (nx * offset) / d.time;
    p.dvy = (ny * offset) / d.time;
    p.dodgeUntil = state.time + d.time;
  }
}

function movePieces(state) {
  const spin = state.config.nodes.spin;
  for (const p of state.pieces) {
    const { vx, vy } = pieceVelocity(state, p);
    p.x += vx * STEP;
    p.y += vy * STEP;
    p.rot += spin * STEP * (p.size + 1);
    wrap(state, p);
  }
}

// The Probe drifts in from a corner on a diagonal once 40% of the wave's pieces are gone, and
// leaves. It never shoots and can't hurt you.
function moveProbe(state) {
  const c = state.config;
  const p = c.probe;
  const { width, height } = c.field;
  if (!state.probeSpawned && state.hits >= Math.ceil(p.at * state.total)) {
    state.probeSpawned = true;
    const fromLeft = random(state) < 0.5;
    const fromTop = random(state) < 0.5;
    const x = fromLeft ? -p.radius : width + p.radius;
    const y = fromTop ? -p.radius : height + p.radius;
    const len = Math.hypot(width, height);
    state.probe = { x, y, vx: ((fromLeft ? 1 : -1) * width * p.speed) / len, vy: ((fromTop ? 1 : -1) * height * p.speed) / len };
  }
  const probe = state.probe;
  if (!probe) return;
  probe.x += probe.vx * STEP;
  probe.y += probe.vy * STEP;
  if (probe.x < -2 * p.radius || probe.x > width + 2 * p.radius || probe.y < -2 * p.radius || probe.y > height + 2 * p.radius) state.probe = null;
}

function moveShots(state, events) {
  const c = state.config;
  for (const shot of state.shots) {
    shot.x += shot.vx * STEP;
    shot.y += shot.vy * STEP;
    shot.life -= STEP;
    wrap(state, shot);
    if (shot.life <= 0) shot.dead = true;
  }
  for (const shot of state.shots) {
    if (shot.dead) continue;
    const hit = state.pieces.find((p) => wrapDistance(state, p, shot) <= c.nodes.radius[p.size]);
    if (hit) {
      shot.dead = true;
      breakPiece(state, hit, events);
      continue;
    }
    const probe = state.probe;
    if (probe && Math.hypot(probe.x - shot.x, probe.y - shot.y) <= c.probe.radius) {
      shot.dead = true;
      state.score += c.probe.bonus;
      state.probeHit = true;
      state.probe = null;
      events.push({ type: 'probe', x: probe.x, y: probe.y, points: c.probe.bonus });
    }
  }
  state.shots = state.shots.filter((s) => !s.dead);
}

// A hit piece is gone. Large and medium ones leave two children at fixed angles either side of
// the parent's heading, with its traits; they are never re-aimed.
function breakPiece(state, p, events) {
  const c = state.config;
  state.pieces = state.pieces.filter((q) => q !== p);
  state.hits += 1;
  state.score += c.points;
  if (p.size < SMALL) {
    const spread = c.nodes.splitAngle * RAD;
    for (const side of [-1, 1]) state.pieces.push(piece(p.size + 1, p.x, p.y, p.heading + side * spread, p.rot, { ...p.traits }));
  }
  events.push({ type: p.size < SMALL ? 'split' : 'kill', x: p.x, y: p.y, size: p.size, points: c.points });
}

function collide(state, events) {
  const c = state.config;
  const ship = state.ship;
  if (!ship.alive || ship.faint > 0) return;
  const hit = state.pieces.some((p) => wrapDistance(state, p, ship) <= c.nodes.radius[p.size] + c.ship.radius);
  if (!hit) return;
  state.lives -= 1;
  events.push({ type: 'hit', x: ship.x, y: ship.y });
  ship.alive = false;
  ship.dead = 0;
  ship.thrusting = false;
  if (state.lives <= 0) {
    state.phase = 'over';
    state.endReason = 'lives';
    events.push({ type: 'over', reason: 'lives' });
  }
}
