// The player model. During a wave the game counts your habits: where you stood (5 lanes), shots
// against hits, which columns you hit first, and time spent under a barrier. When the wave is
// cleared, the strongest habits past their thresholds in data/lessons.json become lessons that
// tilt where the next wave's trait budget goes. Pure functions over the game state.
//
// Rules: strength = how far past its threshold the stat went. At most two lessons are active; a new
// one replaces the weaker. A lesson fades after two waves unless the habit repeats. Hitting the
// Probe means nothing new is learned that wave. Nothing carries over between runs.

export const LANES = 5;
export const MAX_ACTIVE = 2;
export const FADE_AFTER = 2;
const LANE_NAMES = ['far left lane', 'left lane', 'middle lane', 'right lane', 'far right lane'];

export function newLearner() {
  return { lessons: [], history: [], wave: null, aimLane: null };
}

export function startWaveStats(state) {
  state.learn.wave = { steps: 0, lanes: new Array(LANES).fill(0), under: 0, shots: 0, kills: 0, killCols: [] };
}

export function laneOf(state, x) {
  return Math.max(0, Math.min(LANES - 1, Math.floor((x / state.config.field.width) * LANES)));
}

// Whether a barrier cell is straight above x.
export function underBarrier(state, x) {
  return state.barriers.some((b) => {
    const col = Math.floor((x - b.x) / b.cell);
    if (col < 0 || col >= b.cols) return false;
    for (let r = 0; r < b.rows; r++) if (b.cells[r * b.cols + col]) return true;
    return false;
  });
}

// Called once per step with that step's events.
export function observe(state, events) {
  const w = state.learn.wave;
  w.steps += 1;
  w.lanes[laneOf(state, state.cannon.x)] += 1;
  if (underBarrier(state, state.cannon.x)) w.under += 1;
  for (const e of events) {
    if (e.type === 'fire') w.shots += 1;
    else if (e.type === 'kill') {
      w.kills += 1;
      w.killCols.push(e.col);
    }
  }
}

// The four habit numbers for the wave just played, with the details the cards quote.
export function waveStats(state) {
  const w = state.learn.wave;
  const steps = Math.max(1, w.steps);
  const lane = w.lanes.indexOf(Math.max(...w.lanes));
  const cols = state.swarm.cols;
  const firstHalf = w.killCols.slice(0, Math.ceil(state.swarm.total / 2));
  const edges = firstHalf.filter((c) => c <= 1 || c >= cols - 2).length;
  return {
    laneShare: { value: w.lanes[lane] / steps, pct: Math.round((100 * w.lanes[lane]) / steps), lane: LANE_NAMES[lane], laneIndex: lane },
    missRate: {
      value: w.shots >= state.config.minShotsForSpray ? 1 - w.kills / w.shots : 0,
      missed: w.shots - w.kills,
      shots: w.shots,
    },
    edgeShare: { value: firstHalf.length >= 4 ? edges / firstHalf.length : 0, pct: Math.round((100 * edges) / Math.max(1, firstHalf.length)) },
    hideShare: { value: w.under / steps, pct: Math.round((100 * w.under) / steps) },
  };
}

function fill(text, detail) {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(detail[key]));
}

// Ends the wave: ages old lessons, learns new ones. Returns what the card shows.
export function endWave(state) {
  const learn = state.learn;
  const stats = waveStats(state);
  const blocked = state.probeHit;
  const triggered = blocked
    ? []
    : state.config.lessons
        .map((l) => ({ lesson: l, detail: stats[l.stat] }))
        .filter(({ lesson, detail }) => detail.value >= lesson.threshold)
        .map(({ lesson, detail }) => ({ lesson, detail, strength: detail.value - lesson.threshold }))
        .sort((a, b) => b.strength - a.strength);

  const repeated = [];
  const faded = [];
  for (const active of learn.lessons) {
    const again = triggered.find((t) => t.lesson.id === active.id);
    if (again) {
      Object.assign(active, { age: 0, strength: again.strength, detail: again.detail });
      repeated.push(active.id);
    } else active.age += 1;
  }
  for (const active of learn.lessons.filter((l) => l.age >= FADE_AFTER)) faded.push(lessonById(state, active.id).name);
  learn.lessons = learn.lessons.filter((l) => l.age < FADE_AFTER);

  const learned = [];
  for (const t of triggered.filter((t) => !repeated.includes(t.lesson.id))) {
    if (learn.lessons.length >= MAX_ACTIVE) {
      const weakest = learn.lessons.reduce((a, b) => (b.strength < a.strength ? b : a));
      learn.lessons = learn.lessons.filter((l) => l !== weakest);
      faded.push(lessonById(state, weakest.id).name);
    }
    learn.lessons.push({ id: t.lesson.id, strength: t.strength, age: 0, detail: t.detail });
    learn.history.push(t.lesson.id);
    learned.push({ id: t.lesson.id, text: fill(t.lesson.text, t.detail), counter: t.lesson.counter });
  }
  const camp = learn.lessons.find((l) => l.id === 'camp');
  learn.aimLane = camp ? camp.detail.laneIndex : null;
  return { learned, repeated, faded, blocked, active: learn.lessons.map((l) => lessonById(state, l.id).name) };
}

export function lessonById(state, id) {
  return state.config.lessons.find((l) => l.id === id);
}

// Which columns a lesson's weight applies to.
function columnMatches(state, which, col) {
  if (which === 'all') return true;
  if (which === 'edges') return col <= 1 || col >= state.swarm.cols - 2;
  if (which === 'barriers') {
    const x = state.swarm.ox + col * state.config.swarm.spacingX;
    return state.barriers.some((b) => x >= b.x && x <= b.x + b.cols * b.cell);
  }
  throw new Error(`unknown columns: ${which}`);
}

// The weight of one trait slot for the coming wave: 1, plus each active lesson's weight where it
// applies. Always positive, so the budget can always be spread.
export function weightOf(state) {
  return (inv, trait) => {
    let w = 1;
    for (const active of state.learn.lessons) {
      const l = lessonById(state, active.id);
      if (l.trait === trait && columnMatches(state, l.columns, inv.col)) w += l.weight;
    }
    return w;
  };
}

// The swarm's "final model" for the game-over screen: every lesson it learned this run.
export function finalModel(state) {
  return [...new Set(state.learn.history)].map((id) => lessonById(state, id).name);
}
