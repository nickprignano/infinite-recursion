// Screens and game flow: title and mode switch, play, the card between waves, pause, game over
// and scores, plus sound, the site header and the installable app.
import { Audio } from './audio.js';
import * as divide from './divide.js';
import { Renderer } from './draw.js';
import { Effects } from './effects.js';
import * as swarm from './game.js';
import { aliveCount, STEP, swarmSpeed } from './game.js';
import { Input } from './input.js';
import { finalModel } from './learner.js';
import { randomSeed } from './rng.js';
import { cleanName, Scores } from './scores.js';
import { Settings } from './settings.js';

const THEME_MODULE = 'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js';
const CARD_MIN_MS = 1500;
const MAX_CATCH_UP = 5;

const $ = (id) => document.getElementById(id);
const [waves, lessons, divideConfig] = await Promise.all(
  ['data/waves.json', 'data/lessons.json', 'data/divide.json'].map(async (url) => (await fetch(url)).json()),
);
const config = { ...waves, lessons };
// Each mode: its numbers, its game module, and whether it learns yet.
const MODES = {
  swarm: { config, game: swarm, learns: true, scores: new Scores(undefined, 'swarm') },
  divide: { config: divideConfig, game: divide, learns: false, scores: new Scores(undefined, 'divide') },
};
const settings = new Settings();
const renderer = new Renderer($('field'));
const input = new Input($('strip'), config.field.width, $('pads'));
const audio = new Audio();
const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

let game = null;
let mode = MODES[settings.mode]; // the mode being played, or picked on the title
let effects = null;
let screen = 'title';
let paused = false;
let countdownEnd = 0;
let cardReadyAt = 0;
let accumulator = 0;
let last = performance.now();
let marchClock = 0;

// Screens -------------------------------------------------------------------------------------

function show(name) {
  screen = name;
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== `screen-${name}`;
  $('btn-pause').hidden = !(name === 'play' || name === 'pause');
  if (name === 'scores') {
    fillScores($('score-list'), MODES.swarm.scores.list());
    fillScores($('score-list-divide'), MODES.divide.scores.list());
  }
  if (name === 'title') {
    $('btn-install').hidden = !installPrompt;
    $('btn-update').hidden = !updateWaiting;
  }
  if (name !== 'play') {
    audio.probe(false);
    audio.thrust(false);
  }
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

// The mode switch on the title: Divide plays with four buttons in place of the strip.
function pickMode(name) {
  mode = MODES[name];
  game = null;
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === name;
  $('strip').hidden = name !== 'swarm';
  $('pads').hidden = name !== 'divide';
  demo = null;
  layout();
}
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    settings.set('mode', radio.value);
    pickMode(radio.value);
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
  game = mode.game.createGame(mode.config, { seed, easy: settings.easy });
  effects = new Effects(mode.config.field, { reduced: () => settings.reduced });
  input.clear();
  accumulator = 0;
  marchClock = 0;
  show('play');
  hud();
}

function hud() {
  $('hud-score').textContent = game ? game.score : 0;
  $('hud-wave').textContent = game ? game.wave : 1;
  $('hud-lives').textContent = game ? game.lives : 3;
}

function waveCleared(events) {
  const cleared = events.find((e) => e.type === 'cleared');
  const extra = events.some((e) => e.type === 'extra-life');
  const report = cleared.report ?? { learned: [], repeated: [], faded: [], blocked: false };
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
  if (!report.learned.length && !report.repeated.length && !report.blocked && mode.learns) add('The swarm learned nothing about you this wave.');
  if (report.faded.length) add(`It forgot: ${report.faded.join(', ')}.`, 'quiet');
  add(`Bonus ${cleared.bonus}${cleared.outsmarted ? `, outsmarted ${cleared.outsmarted}` : ''}.${extra ? ' Extra life.' : ''}`, 'quiet');
  $('card-title').textContent = `Wave ${game.wave} cleared`;
  $('card-lines').replaceChildren(...lines);
  audio.play(report.learned.length ? 'lesson' : 'cleared');
  $('card-hint').hidden = true;
  cardReadyAt = performance.now() + CARD_MIN_MS;
  setTimeout(() => {
    if (screen === 'card') $('card-hint').hidden = false;
  }, CARD_MIN_MS);
  show('card');
}

function nextWave() {
  if (screen !== 'card' || performance.now() < cardReadyAt) return;
  mode.game.startWave(game, game.wave + 1);
  effects = new Effects(mode.config.field, { reduced: () => settings.reduced });
  accumulator = 0;
  show('play');
  hud();
}

// A fresh tap or key press closes the card; a touch held down from the wave never does.
addEventListener('pointerdown', () => nextWave());

function gameOver() {
  const landed = game.endReason === 'landed';
  $('over-title').textContent = landed ? 'The swarm landed' : 'Out of lives';
  const model = mode.learns ? finalModel(game) : [];
  const learned = model.length ? ` The swarm learned: ${model.join(', ')}.` : mode.learns ? ' The swarm learned nothing about you.' : '';
  $('over-text').textContent = `Score ${game.score}, wave ${game.wave}.${learned}`;
  audio.play('over');
  const { scores } = mode;
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
  const list = mode.scores.add(name, game.score, { wave: game.wave, seed: game.seed, easy: game.easy });
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
  if (key === 'm') toggleMute();
  else if (screen === 'card') nextWave();
  else if (key === 'p' || key === 'Escape') screen === 'pause' ? resume() : pause();
};

// Sound ---------------------------------------------------------------------------------------

// The first tap or key allows sound; later ones resume it after an iPhone locks.
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio.unlock());

function updateMuteButton() {
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', audio.muted ? 'Sound off' : 'Sound on');
  $('btn-mute').setAttribute('aria-pressed', String(!audio.muted));
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  updateMuteButton();
}
$('btn-mute').addEventListener('click', toggleMute);
updateMuteButton();

const SOUNDS = { fire: 'fire', kill: 'kill', split: 'split', chip: 'chip', probe: 'probe', hit: 'hit', 'extra-life': 'extra-life' };
function sounds(events) {
  for (const e of events) if (SOUNDS[e.type]) audio.play(SOUNDS[e.type]);
  audio.probe(Boolean(game.probe));
  if (mode === MODES.divide) {
    // Divide has a thrust hiss and no march.
    audio.thrust(game.ship.alive && game.ship.thrusting);
    return;
  }
  // The march: one beat per stretch of swarm travel, so it quickens as the swarm speeds up.
  marchClock += STEP;
  const beat = Math.max(0.18, Math.min(0.9, (0.9 * config.swarm.speed) / swarmSpeed(game)));
  if (marchClock >= beat) {
    marchClock = 0;
    audio.march(1 - aliveCount(game) / game.swarm.total);
  }
}

// Loop ----------------------------------------------------------------------------------------

function layout() {
  const stage = $('stage').getBoundingClientRect();
  const room = { w: stage.width - 12, h: stage.height - 12 };
  const ratio = mode.config.field.width / mode.config.field.height;
  const w = Math.max(120, Math.floor(Math.min(room.w, room.h * ratio)));
  const h = Math.floor(w / ratio);
  $('frame').style.width = `${w}px`;
  $('frame').style.height = `${h}px`;
  $('strip').style.width = `${w}px`;
  $('pads').style.width = `${w}px`;
  renderer.resize(w, h, mode.config.field);
}
addEventListener('resize', layout);

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
      const events = mode.game.step(game, input.state());
      if (events.length) effects.add(events, game.time);
      if (game.phase === 'play') sounds(events);
      else {
        audio.probe(false);
        audio.thrust(false);
      }
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

// Behind the title screen: the picked mode, still, so the first screen isn't empty.
let demo = null;
function demoState() {
  demo ??= mode.game.createGame(mode.config, { seed: 7 });
  return demo;
}
pickMode(settings.mode);

requestAnimationFrame(frame);

// For the scripted browser check before each PR (#test): lets it read the game it's playing.
if (location.hash === '#test') globalThis.gameForTest = () => game;

// Installable app --------------------------------------------------------------------------------

// sw.js keeps every game file so it plays offline. A new version downloads in the background and
// the title screen offers it; it never reloads the page by itself.
let updateWaiting = null;
let installPrompt = null;
let reloadOnUpdate = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((registration) => {
    const watch = (worker) => worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        updateWaiting = worker;
        if (screen === 'title') $('btn-update').hidden = false;
      }
    });
    if (registration.waiting && navigator.serviceWorker.controller) updateWaiting = registration.waiting;
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    // Installed apps are reopened rather than reloaded, so look for a new version each time.
    document.addEventListener('visibilitychange', () => document.hidden || registration.update().catch(() => {}));
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => reloadOnUpdate && location.reload());
}
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (screen === 'title') $('btn-install').hidden = false;
});
$('btn-install').addEventListener('click', async () => {
  installPrompt?.prompt();
  await installPrompt?.userChoice;
  installPrompt = null;
  $('btn-install').hidden = true;
});
$('btn-update').addEventListener('click', () => {
  reloadOnUpdate = true;
  updateWaiting?.postMessage('skip-waiting');
});

// Theme ---------------------------------------------------------------------------------------

// The phone's status bar takes the page's background color, in both themes.
function applyThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]').content = bg;
}


// Re-read colors when the site theme toggles or the system theme changes.
function themeChanged() {
  renderer.refreshPalette();
  applyThemeColor();
}
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
applyThemeColor();

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
// The installed app starts with the header hidden, to leave the screen to the game.
if (installed) setHeaderCollapsed(true);
import(THEME_MODULE)
  .then(({ headerHtml, initThemeToggle }) => {
    $('site-header').innerHTML = headerHtml({ bio: 'Infinite Recursion, an original game', links: [] });
    initThemeToggle();
    layout();
    themeChanged();
  })
  .catch(() => $('btn-header').remove());

show('title');
