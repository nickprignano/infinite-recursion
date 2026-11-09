// Screens and game flow: title, play, the card between waves, pause, game over and scores.
import { Renderer } from './draw.js';
import { Effects } from './effects.js';
import { createGame, startWave, step, STEP } from './game.js';
import { Input } from './input.js';
import { finalModel } from './learner.js';
import { randomSeed } from './rng.js';
import { cleanName, Scores } from './scores.js';
import { Settings } from './settings.js';

const THEME_MODULE = 'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js';
const CARD_MIN_MS = 1500;
const MAX_CATCH_UP = 5;

const $ = (id) => document.getElementById(id);
const [waves, lessons] = await Promise.all(['data/waves.json', 'data/lessons.json'].map(async (url) => (await fetch(url)).json()));
const config = { ...waves, lessons };
const settings = new Settings();
const scores = new Scores();
const renderer = new Renderer($('field'));
const input = new Input($('strip'), config.field.width);

let game = null;
let effects = null;
let screen = 'title';
let paused = false;
let countdownEnd = 0;
let cardReadyAt = 0;
let accumulator = 0;
let last = performance.now();

// Screens -------------------------------------------------------------------------------------

function show(name) {
  screen = name;
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== `screen-${name}`;
  $('btn-pause').hidden = !(name === 'play' || name === 'pause');
  if (name === 'scores') fillScores($('score-list'), scores.list());
  const focus = document.querySelector(`#screen-${name} .primary, #screen-${name} button`);
  if (focus && name !== 'play') focus.focus({ preventScroll: true });
}

function fillScores(list, entries, highlight) {
  list.replaceChildren(
    ...(entries.length ? entries : [null]).map((e) => {
      const li = document.createElement('li');
      if (!e) {
        li.textContent = 'No scores yet.';
        return li;
      }
      li.textContent = `${e.name}  ${e.score}  wave ${e.wave}`;
      if (e.easy) {
        const mark = document.createElement('span');
        mark.className = 'easy';
        mark.textContent = ' E';
        mark.title = 'Played on Easy';
        li.append(mark);
      }
      if (e === highlight) li.style.fontWeight = '700';
      return li;
    }),
  );
  if (!entries.length) list.style.listStyle = 'none';
  else list.style.listStyle = '';
}

for (const button of document.querySelectorAll('[data-go]')) {
  button.addEventListener('click', () => {
    const to = button.dataset.go;
    if (to === 'play') newGame();
    else show(to);
  });
}

$('set-easy').checked = settings.easy;
$('set-reduce').checked = settings.reduceSwitch;
$('set-easy').addEventListener('change', (e) => settings.set('easy', e.target.checked));
$('set-reduce').addEventListener('change', (e) => settings.set('reduceSwitch', e.target.checked));

// Game flow -----------------------------------------------------------------------------------

function newGame() {
  // ?seed=N replays a run (scores keep each run's seed).
  const seed = Number(new URLSearchParams(location.search).get('seed')) || randomSeed();
  game = createGame(config, { seed, easy: settings.easy });
  effects = new Effects(config.field, { reduced: () => settings.reduced });
  input.clear();
  accumulator = 0;
  show('play');
  hud();
}

function hud() {
  $('hud-score').textContent = game ? game.score : 0;
  $('hud-wave').textContent = game ? game.wave : 1;
  $('hud-lives').textContent = game ? game.lives : config.cannon.lives;
}

function waveCleared(events) {
  const cleared = events.find((e) => e.type === 'cleared');
  const extra = events.some((e) => e.type === 'extra-life');
  const { report } = cleared;
  const lines = [];
  const add = (text, cls) => {
    const p = document.createElement('p');
    p.textContent = text;
    if (cls) p.className = cls;
    lines.push(p);
  };
  if (report.blocked) add('You hit the Probe, so the swarm learned nothing from this wave.');
  for (const l of report.learned) {
    add(l.text);
    add(l.counter, 'counter');
  }
  for (const id of report.repeated) add(`You did it again, so it keeps this one: ${config.lessons.find((l) => l.id === id).name}.`);
  if (!report.learned.length && !report.repeated.length && !report.blocked) add('The swarm learned nothing about you this wave.');
  if (report.faded.length) add(`It forgot: ${report.faded.join(', ')}.`, 'quiet');
  add(`Bonus ${cleared.bonus}${cleared.outsmarted ? `, outsmarted ${cleared.outsmarted}` : ''}.${extra ? ' Extra life.' : ''}`, 'quiet');
  $('card-title').textContent = `Wave ${game.wave} cleared`;
  $('card-lines').replaceChildren(...lines);
  $('card-hint').hidden = true;
  cardReadyAt = performance.now() + CARD_MIN_MS;
  setTimeout(() => {
    if (screen === 'card') $('card-hint').hidden = false;
  }, CARD_MIN_MS);
  show('card');
}

function nextWave() {
  if (screen !== 'card' || performance.now() < cardReadyAt) return;
  startWave(game, game.wave + 1);
  effects = new Effects(config.field, { reduced: () => settings.reduced });
  accumulator = 0;
  show('play');
  hud();
}

// A fresh tap or key press closes the card; a touch held down from the wave never does.
addEventListener('pointerdown', () => nextWave());

function gameOver() {
  const landed = game.endReason === 'landed';
  $('over-title').textContent = landed ? 'The swarm landed' : 'Out of lives';
  const model = finalModel(game);
  $('over-text').textContent = `Score ${game.score}, wave ${game.wave}. ${
    model.length ? `The swarm learned: ${model.join(', ')}.` : 'The swarm learned nothing about you.'
  }`;
  const qualifies = scores.qualifies(game.score);
  $('name-form').hidden = !qualifies;
  $('over-buttons').hidden = qualifies;
  fillScores($('over-scores'), scores.list());
  $('over-scores').hidden = qualifies;
  show('over');
  if (qualifies) $('name-input').focus({ preventScroll: true });
}

$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName($('name-input').value);
  if (!name) {
    $('name-input').select();
    return;
  }
  const list = scores.add(name, game.score, { wave: game.wave, seed: game.seed, easy: game.easy });
  const mine = list.find((s) => s.name === name && s.score === game.score && s.seed === game.seed);
  fillScores($('over-scores'), list, mine);
  $('name-form').hidden = true;
  $('over-scores').hidden = false;
  $('over-buttons').hidden = false;
  $('over-buttons').querySelector('.primary').focus({ preventScroll: true });
});

// Pause ---------------------------------------------------------------------------------------

function pause() {
  if (screen !== 'play') return;
  paused = true;
  input.clear();
  show('pause');
}

function resume() {
  if (screen !== 'pause') return;
  paused = false;
  show('play');
  countdownEnd = performance.now() + 3000;
}

$('btn-pause').addEventListener('click', () => (screen === 'pause' ? resume() : pause()));
$('btn-resume').addEventListener('click', resume);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

input.onKey = (key) => {
  if (screen === 'card') nextWave();
  else if (key === 'p' || key === 'Escape') screen === 'pause' ? resume() : pause();
};

// Loop ----------------------------------------------------------------------------------------

function layout() {
  const stage = $('stage').getBoundingClientRect();
  const room = { w: stage.width - 12, h: stage.height - 12 };
  const ratio = config.field.width / config.field.height;
  const w = Math.max(120, Math.floor(Math.min(room.w, room.h * ratio)));
  const h = Math.floor(w / ratio);
  $('frame').style.width = `${w}px`;
  $('frame').style.height = `${h}px`;
  $('strip').style.width = `${w}px`;
  renderer.resize(w, h, config.field);
}
addEventListener('resize', layout);
layout();

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const counting = now < countdownEnd;
  $('countdown').hidden = !counting;
  if (counting) $('countdown').textContent = Math.ceil((countdownEnd - now) / 1000);

  if (game && screen === 'play' && !paused && !counting) {
    accumulator = Math.min(accumulator + dt, STEP * MAX_CATCH_UP);
    while (accumulator >= STEP && screen === 'play') {
      accumulator -= STEP;
      const events = step(game, input.state());
      if (events.length) effects.add(events, game.time);
      if (game.phase === 'cleared') waveCleared(events);
      else if (game.phase === 'over') gameOver();
    }
    hud();
  }
  if (effects) effects.update(screen === 'play' && !paused ? dt : 0);
  if (game) renderer.render(game, effects, settings.reduced);
  else renderer.render(demoState(), { rings: [], particles: [], glows: [] }, settings.reduced);
  requestAnimationFrame(frame);
}

// Behind the title screen: a still swarm, so the first screen isn't empty.
let demo = null;
function demoState() {
  demo ??= createGame(config, { seed: 7 });
  return demo;
}

requestAnimationFrame(frame);

// For the scripted browser check before each PR (#test): lets it read the game it's playing.
if (location.hash === '#test') globalThis.gameForTest = () => game;

// Theme ---------------------------------------------------------------------------------------

// Re-read colors when the site theme toggles or the system theme changes.
new MutationObserver(() => renderer.refreshPalette()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.refreshPalette());

// Site header from prignano-theme, loaded at runtime so this repo carries no personal details.
// The game works without it.
function setHeaderCollapsed(collapsed) {
  $('site-header').classList.toggle('collapsed', collapsed);
  $('btn-header').textContent = collapsed ? '▾' : '▴';
  $('btn-header').setAttribute('aria-expanded', String(!collapsed));
  $('btn-header').setAttribute('aria-label', collapsed ? 'Show the site header' : 'Hide the site header');
  layout();
}
$('btn-header').addEventListener('click', () => setHeaderCollapsed(!$('site-header').classList.contains('collapsed')));
import(THEME_MODULE)
  .then(({ headerHtml, initThemeToggle }) => {
    $('site-header').innerHTML = headerHtml({ bio: 'Infinite Recursion, an original game', links: [] });
    initThemeToggle();
    layout();
    renderer.refreshPalette();
  })
  .catch(() => $('btn-header').remove());

show('title');
