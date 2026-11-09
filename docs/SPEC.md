# Infinite Recursion spec (v1)

Status: draft, red-teamed once by Fable (2026-11-09), waiting for the owner's approval. Nothing gets built until it's approved. Name **Infinite Recursion** (owner's pick, 2026-11-09).

## What it is

An original fixed shooter for the browser, in the genre Space Invaders started: a swarm marches
side to side and down, you slide a cannon along the bottom and shoot up, and barriers wear away.

**The twist: the swarm learns you while you learn it.** The game watches your habits (where you stand, how you
shoot, which invaders you pick off first) and turns the strongest habit into a **lesson** that
reshapes the next wave against it. A card between waves says what it learned and how to beat it.
You win by changing habits faster than it can learn them. That fits prignano.ai, an AI site, and
the name says the loop: you adapt to it, it adapts to you, again. (The method is honest pattern-counting, not a neural network.)

Plain JavaScript and canvas, no build step, no dependencies. The repo is the site. Installable as
an app (PWA) from day one. All ages.

## Decisions so far

The owner picked the name. The other rows are the recommended defaults; change any of them in review.

| # | Question | Default |
| --- | --- | --- |
| 1 | The "redux" twist | A swarm that learns your habits, inside a fixed difficulty curve |
| 2 | Name | **Infinite Recursion** (owner, 2026-11-09). Earlier picks: Backprop (dropped, no gradients), Overfit. A small itch.io game shares the name; accepted for a hobby site |
| 3 | Repo and address | `nickprignano/infinite-recursion` at `infinite-recursion.prignano.ai`, Workers Builds deploy on merge, like pinball. The owner creates the repo |
| 4 | Audience | All ages: line-art bursts, no gore, nothing leaves the device |
| 5 | License | MIT, our own code, art and sound |

## Prior art and what we take from each

From a survey of open-source browser shooters (2026-11-08, licenses read from each repo).

| Source | License | What we use |
| --- | --- | --- |
| [dwmkerr/spaceinvaders](https://github.com/dwmkerr/spaceinvaders) | MIT | Reference only (its game-loop shape). No code or sounds; its `.wav` files look like arcade rips |
| [victorqribeiro/invaderz](https://github.com/victorqribeiro/invaderz) | MIT | The idea that invaders adapt between waves. Credited in About. Our mechanism is different (a player model, not a genetic algorithm), written fresh |
| pinball (ours) | GPL-3.0-only | The approach, rewritten rather than copied since this repo is MIT: theme from a pinned jsDelivr commit, the PWA recipe from PR #7, a `sw-version.mjs` tool, `wrangler.jsonc`, `docs/DEPLOY.md` |
| Zero Sum (ours) | MIT | Flash limiter, banned-words test, seeded pure game module tested in Node. Same owner and license, so small pieces may be copied |
| The original arcade game | Taito, all rights reserved | Genre mechanics only. Not its name, invader shapes, four-note march, sounds, font, 5×11 grid, four bunkers, top-crossing bonus ship or bonus-life rule |

## The player's path

1. **Title.** Name, Play, How to play, Scores, About, an Easy switch and a Reduce effects switch.
2. **Wave.** The swarm marches. Clear it to move on. If it reaches your row, or you lose your last
   life, the run ends.
3. **Lesson card** between waves: what the swarm learned, the number behind it, and the counter.
   Example: "7 of your 9 hits came from the left. Next wave aims left. Move more." It stays up at
   least 1.5 s, then closes on a fresh tap or key press (a held touch never closes it).
4. **Game over:** score, wave reached, the swarm's "final model" (its lessons from the run), then
   the high-score table.

## Wave rules

### The basics

- The swarm starts as 4 rows by 9 columns and grows by wave (sizes in `data/waves.json`). It
  marches sideways, steps down at each edge, and speeds up as it thins out, following the
  speed table in `waves.json`.
- One cannon, 3 lives, an extra life every 3 waves cleared. One of your shots on screen at a time,
  two from the wave set in `waves.json`.
- Three barriers made of small cells that chip away from both sides' shots, in our own rounded
  chevron shape, rebuilt between waves.
- **The Probe** (our bonus craft) drops in from a side and scans across once **40% of the swarm is
  gone**, every wave, so shooting it is a choice you can plan. Hitting it scores a fixed bonus and
  **makes the swarm forget**: no new lesson can trigger at the end of that wave.

### Traits

Each invader has three traits, each 0 to 3, and every level does something:

| Trait | Per level |
| --- | --- |
| Aim | Shots lead your movement more, and bias toward the lane a lesson names |
| Fire | Shoots more often |
| Dodge | Higher chance to sidestep a shot heading for it (capped at 60%, 1.5 s cooldown) |

Exact numbers per level live in `waves.json`.

### The difficulty curve (what keeps it fair)

Each wave has a trait budget in `waves.json`, the same every run. Lessons decide only **where the
budget goes** (which trait, which columns), never how big it is. Spreading the budget over the
invaders uses a fixed rounding rule (largest remainder), so the total always matches. Fairness is
checked two ways: the sum always matches the budget, and scripted players with different habits
all survive about as long (see Tests).

### Lessons

The game counts, per wave: where you stood (5 lanes), shots fired against hits, which columns you
cleared first, and time spent under a barrier. Each lesson in `data/lessons.json` has the shape
`{id, stat, threshold, trait, columns, weight, text, counter}`. Examples:

| Habit | Lesson |
| --- | --- |
| Camping one lane | Aim toward that lane |
| Spraying shots (low hit rate) | More Dodge across the swarm |
| Picking off edge columns first | More Dodge on the edge columns |
| Hiding under barriers | More Fire on the columns above them |

Rules: strength = how far past its threshold the stat went. At most two lessons are active; a
third replaces the weaker one. A lesson fades after two waves unless the habit repeats. Nothing
carries over between runs.

### Scoring

Flat points per row (higher rows worth more), wave-clear bonus, Probe bonus, and an "outsmarted"
bonus for clearing a wave without teaching the swarm anything (no new lesson and no repeated one). The extra-life rule is per wave, so it
doesn't depend on tuned scores.

### Easy

Slows swarm speed and swarm fire rate by 25%. Your speed and shots stay the same. Easy scores go in
the same table with an E mark.

### Deliberately missing

No power-ups, shop or upgrades. No boss waves. Difficulty never depends on how well you're
doing; only the mix does.

## How it works

### Files

```
index.html             page, canvas, control strip, theme header, title screen
src/main.js            screens, game flow, lesson cards
src/game.js            waves, movement, shots, barriers, Probe, scoring (pure, no DOM)
src/swarm.js           traits and spreading the budget (pure)
src/learner.js         player model and lessons (pure)
src/rng.js             seeded random numbers
src/draw.js            canvas drawing, invader shapes, effects, flash limiter
src/input.js           touch strip and keyboard
src/audio.js           synthesized sounds, mute
src/scores.js          high scores on the device
data/waves.json        grid sizes, budgets, speeds, trait numbers, second-shot wave
data/lessons.json      lesson rules and card text
tools/sw-version.mjs   stamps the service worker file list
sw.js, manifest.webmanifest, icons/
test/*.test.mjs
```

ES modules loaded directly by the browser. Tests and tools need only Node.

### Look

- Vector lines and glow in prignano-theme colors, following light and dark, like pinball. Theme
  CSS and JS loaded from a pinned commit on jsDelivr, never vendored.
- Invaders are our own line shapes. A trait adds a visible part (antenna for Aim, a mouth vent for
  Fire, side fins for Dodge), so you can read the swarm at a glance and color is never the only cue.
- The playfield keeps a fixed 3:4 shape scaled to fit, centered on desktop.
- Glow is a wide faint stroke under a thin bright one with `lighter` blending, not `shadowBlur`.
  Canvas backing store capped at 2× pixel ratio. At most 200 particles.

### Flash safety (from Zero Sum)

No full-screen flashes; a hit glow stays under a quarter of the playfield, nothing flashes
saturated red. A pure limiter allows at most 3 glow events a second. Reduce effects or
`prefers-reduced-motion` (watched live) turns off glow, shake and particles.

### Controls

- **Phone:** a control strip sits below the playfield (phones have room under a 3:4 field).
  Touching the strip moves the cannon to your thumb's x and fires; lifting stops both. Pause is a
  44 px button outside the playfield. `touch-action: none`, no double-tap zoom or pull-to-refresh.
- **Keyboard:** arrows or A/D to move, Space to fire (hold for auto-fire), P pause, M mute.
- Pauses when the tab is hidden and resumes with a 3-second countdown.

### Accessibility

Menus, lesson cards and scores are real DOM text, with an `aria-live` region for cards. It's a
reflex game with no screen-reader mode; How to play says so.

### Sound

Synthesized with the Web Audio API, nothing to license: shot, hit, barrier chip, Probe warble,
lesson chime, and a march pulse that rises in pitch as the swarm thins (not four descending notes).
Muted until the first tap or key; the mute setting is saved.

### Scores and data

Top 10 in `localStorage` (3 letters, score, wave, seed, Easy mark). If storage is blocked the game
still plays. Nothing leaves the device: no analytics, accounts, server or network calls beyond the
pinned theme files.

### Installable app

Pinball PR #7's recipe: manifest (`display: standalone`, portrait), original icons (one invader in
line art, any, maskable and Apple sizes), iOS home-screen tags, a service worker caching every file
with its list stamped by `tools/sw-version.mjs`, a test that fails when the list is stale, an
update button, safe-area padding, header hidden when installed, sound resumed after an iPhone locks.

### Hosting

Cloudflare Workers static assets, no Worker script (`wrangler.jsonc` named `infinite-recursion`,
`.assetsignore` leaving out tests, tools and docs), Workers Builds deploying each merge to `main`.
The owner creates the repo and adds the custom domain. Claude writes `docs/DEPLOY.md` and changes
nothing on the account without his yes.

## Tests

`node --test` covers:

1. **Game:** a seeded run is repeatable; the swarm steps down at edges and speeds up as it thins;
   barrier cells erode from both sides; the run ends at the cannon row or 0 lives; the Probe
   appears at 40% cleared.
2. **Budget:** `swarm.spreadBudget` over 10,000 random inputs always sums to the budget with every
   trait in 0 to 3; every budget in `waves.json` is a whole number no bigger than 9 × invaders.
3. **Fairness:** 50 seeded full runs each for scripted chaser, camper, sprayer, edge-picker,
   hider and random players (fast, headless), with the learning on and off. Median waves survived
   stay within a band set in `waves.json`, and the learning moves no player's median by more than
   `maxShift` waves.
4. **Lessons:** each scripted habit triggers its lesson within 2 waves; lessons fade after 2 waves
   without the habit; at most 2 active, a third replaces the weaker; hitting the Probe blocks a new
   lesson; nothing persists between runs.
5. **Words:** an encoded banned list (the original's title, its maker, and the title's two words
   side by side) never appears in shipped files. About names the genre only as "fixed shooter".
6. **Flash limiter:** never more than 3 glow events a second or one over a quarter of the
   playfield; Reduce effects gives zero.
7. **PWA:** the service worker file list is current.

**Done means:** all tests pass in CI. Before each PR the build thread also runs a Playwright check
by hand (not in CI, like pinball) at phone and desktop sizes that plays fixed seeds through three
waves and sees a lesson card. Install and offline play are a manual check in `docs/DEPLOY.md`.

## Pull requests

1. Core game: `game.js`, drawing, control strip, barriers, Probe, fixed waves, scores, tests 1, 5,
   6, CI.
2. Learning: `swarm.js`, `learner.js`, trait shapes, lesson cards, data files, tests 2 to 4.
3. Sound, PWA recipe, About, `wrangler.jsonc`, `docs/DEPLOY.md`, test 7, polish.

## Not in v1

Armor and diving traits (a possible PR 4 once the fairness test exists), a genetic-algorithm
breeding layer, shared leaderboard, two players, a "watch it learn" chart, music, gamepad.

## Open questions

1. **When to build.** Chess, Zero Sum and Payoff are in flight; this build starts when the owner
   says, per the one-build-at-a-time habit.

## Fable red team (2026-11-09)

12 findings, all folded in:

1. The budget fixed trait sums, not difficulty, and Armor (max level only) and Dive (one diver)
   were dead budget a player could exploit. → Cut to three traits where every level acts; added a
   survival-band fairness test.
2. "Points rise with trait total" was constant by construction. → Flat points per row; extra life
   per 3 waves instead of at 10,000.
3. Breeding was noise (back rows live longest) and invisible to the player. → Cut from v1;
   lessons carry the twist.
4. The Probe erasing a lesson did nothing if the habit retriggered, and a random Probe can't be
   planned. → Probe on a fixed cue (40% cleared); hitting it blocks new lessons that wave.
5. Cards closed by "any tap" would be skipped by a held fire touch. → 1.5 s minimum, fresh tap;
   cards give the counter.
6. Lesson rules underspecified. → Schema, strength, replacement and no-persistence rules written.
7. The 5×11 grid, 4 bunkers, top-crossing bonus ship and 10,000 bonus life together were the
   arcade's look. → 4×9 growing grid, 3 barriers, Probe from the side, per-wave life; invaderz
   credited.
8. "Backprop" misnames a method with no gradients. → Overfit, then the owner chose Infinite Recursion.
9. Touch scheme contradicted itself (thumb over the cannon, no choice not to fire). → Control
   strip below the playfield; lift to stop.
10. 10,000 full runs can't finish in CI and integer traits need a rounding rule. → Property test
    on the spreading function plus 50 full runs per player.
11. A banned list of invader names would hit generic words. → Exact title, maker, title phrase.
12. Builder-facing numbers missing. → All in `waves.json`; Dodge capped at 60% with a cooldown;
    Easy defined.

## Amendment 1: a second mode, Divide (2026-11-09)

Status: draft, red-teamed once by Fable (2026-11-09), waiting for the owner's approval. Asked for
by the owner on 2026-11-09 ("an asteroids mode"). Nothing in v1 above changes except where this
section says so.

### What it is

A second mode in the genre Asteroids started: you fly a ship that turns, thrusts and drifts on a
field that wraps at the edges, and break up shapes that split into smaller pieces when hit. The
existing mode becomes **Swarm**; the new one is **Divide**, after divide and conquer: every node
you hit splits into smaller copies of itself, which is recursion you can see.

**The twist carries over.** The same swarm learns your habits and spends a fixed difficulty budget
against them, with its own habits and lessons, the same card between waves, the same Probe and the
same kind of fairness test. One game, one install, one address, two modes.

### Decisions (defaults; change any in review)

| # | Question | Default |
| --- | --- | --- |
| A1 | Mode name | **Divide**; the v1 mode is named **Swarm** in the menu |
| A2 | Phone controls | Four buttons under the playfield: turn left, turn right, thrust, fire |
| A3 | Learning | Yes, three lessons inside a fixed budget, checked by a fairness test |
| A4 | Scores | A separate top 10 per mode; the existing table becomes Swarm's |
| A5 | prignano.ai/games entry | Unchanged: same game and address. How to play and About name both modes |

### What we don't take from the original

Genre mechanics only (turn, thrust, drift, wrapping, pieces that split when shot). Not its name,
its maker, its thin triangle ship, lumpy rock outlines, the two saucers that shoot, hyperspace, the
two-note heartbeat, points that rise as pieces shrink, or its 10,000-point bonus life. Here: 3 shots
not 4, flat points per piece, a Probe that drifts on a diagonal and never shoots. The words test
bans the title and the maker. Prior art (2026-11-08 survey): two MIT browser versions exist
(dmcinnes/HTML5-Asteroids, kevinroast/Asteroids-Reloaded); we read neither's code and copy nothing.

### Rules

- **Field.** The same 3:4 playfield (300 by 400 units); ship, shots and nodes wrap to the opposite
  edge.
- **Ship.** Turns at a fixed rate, thrusts forward, drifts with light drag and a top speed. Up to 3
  of your shots at once; each lives a fixed time and wraps. 3 lives, an extra life every 3 waves
  cleared, as in Swarm. Touching a piece costs a life.
- **Respawn.** The ship comes back at the center, facing up, once no piece is within the safe
  radius **or after 3 s**, whichever is first. It's drawn faint and can't be hit for 1.5 s (3 s when
  the timeout brought it back). No blinking.
- **Nodes.** Each wave starts with N large nodes entering from the edges, at least the spawn
  distance from the ship. A large node splits into 2 medium, a medium into 2 small, and a small is
  destroyed. Children leave at fixed angles either side of the parent's heading (never re-aimed),
  at their own size's speed, and inherit its traits. Everything moves in straight lines; nothing
  homes.
- **Pieces.** A wave has 7N pieces (N large, 2N medium, 4N small). A piece is gone when it's hit.
  The wave clears when all 7N are gone.
- **The Probe** appears once 40% of the wave's pieces are gone (0.4 × 7N hits). It drifts in from a
  corner on a diagonal and leaves, never shoots and can't hurt you. Hitting it scores its bonus and
  blocks new lessons that wave, as in Swarm.
- **Scoring.** Flat points per piece, wave-clear bonus, Probe bonus, and the outsmarted bonus for a
  wave that taught the swarm nothing.
- **Easy** slows pieces by 25%. Your ship stays the same.
- **Deliberately missing:** enemies that shoot, hyperspace, shields, power-ups, bosses.

### Traits and the budget

Each large node gets three traits, 0 to 3, and its children inherit them. Every level does
something:

| Trait | Per level |
| --- | --- |
| Aim | When the node **enters** (only then), its heading turns a third of the way per level toward its target: your ship, or the zone a lesson names. Entry is at least the spawn distance away, so you see it coming |
| Speed | Moves 20% faster. No piece ever moves faster than 60% of your shot speed |
| Dodge | A chance (20/40/60%, 1.5 s cooldown) to slide sideways when a shot's path would hit it: its own radius plus 4 units in 0.15 s, then its old velocity resumes. Never when the slide could bring it within 40 units of your ship, so a dodge can't land on you |

The budget per wave is listed in `divide.json`, the same every run, and spread over the large nodes
by the existing `spreadBudget` (largest remainder, so the total always matches). Lessons change only
where it goes. Inheritance means a trait point doesn't cost the same on every piece, so the claim
"the budget fixes the difficulty" rests on the fairness test, not on the arithmetic.

### Lessons

The game counts, per wave, leaving out time while the ship is respawning or faint: time spent in
each cell of a 3 by 3 grid, shots against hits (a hit on any piece counts), and how many small
pieces are still alive when the Probe appears. The lesson engine is Swarm's (strength past
threshold, at most 2 active, a third replaces the weaker, fades after 2 waves without the habit,
the Probe blocks, nothing carries between runs). The learner's Swarm-only `aimLane` becomes a
generic `target` each mode reads its own way. The three lessons, in `data/divide-lessons.json`,
with their own thresholds:

| Habit | Lesson | Counter |
| --- | --- | --- |
| Parking in one zone | Aim at that zone | Keep moving |
| Spraying shots (low hit rate) | More Dodge across the wave | Fewer, surer shots |
| Breaking big pieces and leaving small ones | More Speed across the wave | Clean up as you go |

One lesson per trait, so the card always matches what you see: pointed ticks, trails or fins.

### Controls

- **Phone:** in Divide the strip under the playfield holds four buttons in a row: turn left and
  turn right under the left thumb, thrust and fire under the right. Hold to act. Each is at least
  44 px wide; the strip is 112 px tall in portrait. Two touches at once are tracked separately.
  Pause stays a 44 px button outside the playfield.
- **Keyboard:** Left and Right (or A and D) turn, Up or W thrusts, Space fires (hold for repeat),
  P pause, M mute.
- Both give the game the same input (left, right, thrust, fire), so neither is faster.

### Starting numbers (`data/divide.json`)

| Key | Start |
| --- | --- |
| Ship turn rate, thrust, drag, top speed, radius | 270°/s, 200 u/s², 0.5 a second, 160 u/s, 7 |
| Shots: speed, life, max, cooldown | 300 u/s, 0.75 s, 3, 0.2 s |
| N large nodes per wave | 3, 4, 4, 5, 5, 6, then +1 every 2 waves, at most 8 |
| Piece radius large/medium/small | 20, 12, 6 |
| Piece speed large/medium/small | 30, 45, 60 u/s, +5% a wave, cap 180 u/s |
| Split angle | 35° either side of the parent's heading |
| Spawn distance, safe radius, faint time, respawn timeout | 120, 60, 1.5 s, 3 s |
| Dodge: look-ahead, slide, ship clearance | 70 units, radius + 4 in 0.15 s, 40 units |
| Spray lesson: shots needed before it can count | 15 |
| Points per piece, wave bonus, Probe bonus, outsmarted bonus | 20, 100 × wave, 300, 250 |
| Probe: radius, speed | 10, 50 u/s |
| Budgets | 2, 5, 8, 11, 14, 17, then +3 a wave, at most 9 × N |
| Fairness | 50 runs, maxWave 8, minMedian 3, maxMedian 9, maxShift 2, a step cap per run |

### Look and sound

- Nodes are our own: a regular hexagon holding a smaller hexagon holding a smaller one. A hit peels
  off the outer layer, so the children are visibly the parent's insides. Trait parts: a tick
  pointing along the heading for Aim, trailing lines for Speed, side fins for Dodge.
- The ship is our own: a rounded dart with a round cockpit, a short flame while thrusting.
- Sounds stay synthesized: Swarm's shot and hit, a split crack, a soft thrust hiss. No pulse or
  heartbeat in Divide.
- The same flash limiter, particle cap and Reduce effects rules apply.

### Menus and scores

The title gets a Swarm/Divide switch, remembered on the device, and one Play button. Scores shows
both tables. How to play and About describe both modes; About names the genres only in general
words.

### Files

```
src/divide.js             the mode's game: ship, wrap, pieces, splitting, shots, Probe, scoring (pure)
src/learner.js            lesson engine shared; each mode supplies its own habit counts and target
src/draw.js, input.js     a Divide renderer and the four-button strip
src/main.js               the mode switch; each mode exposes createGame, startWave and step
data/divide.json          the numbers above
data/divide-lessons.json  Divide's lessons and card text
test/pilot.mjs            a scripted pilot for Divide tests
```

### Tests

Added to `node --test`:

1. **Divide game:** a seeded run repeats; ship, shots and pieces wrap; a large splits into 2 medium
   and a medium into 2 small at the split angles, inheriting traits; no piece passes the speed cap;
   a hit costs a life and respawn happens at a clear center or the timeout; dodge never fires with
   the ship within 40 units; the Probe appears at 0.4 × 7N hits; the wave clears at 7N.
2. **Budget:** every budget in `divide.json` is a whole number no bigger than 9 × N, and assigned
   traits always sum to it.
3. **Fairness:** a shared pure pilot (turn toward a target with lead at the capped rate, fire when
   lined up, thrust away from the nearest threat) with habits as parameters plays 50 seeded runs
   each as parker, roamer, sprayer, big-first and random, learning on and off. Medians stay in the
   band (at least wave 3, so a weak pilot can't pass trivially) and learning moves none by more than
   `maxShift`. The whole Divide fairness test stays under 60 s, like Swarm's.
4. **Lessons:** each scripted habit triggers its lesson within 2 waves; respawn and faint time
   never count; the shared rules (fade, 2 active, Probe block, no persistence) hold for Divide.
5. **Words:** the banned list gains the drifting game's title and maker.
6. **Flash limiter** and **PWA** tests cover the new files.

Done means the same as v1: all tests pass, plus a Playwright check by hand at phone and desktop
sizes that plays fixed seeds of Divide through three waves and sees a lesson card.

### Pull requests

1. This amendment.
2. Divide core: `divide.js`, drawing, both control schemes, the mode switch, per-mode scores,
   sounds, the pilot, budget spread evenly (no lessons yet), tests 1, 2, 5, 6, and a learning-off
   survival check with the pilot so the band is tuned before lessons exist.
3. Divide learning: the shared lesson engine, `divide-lessons.json`, cards, tests 3 and 4.

The owner can stop after PR 2 and play it before PR 3. (Built: the owner took every default on
2026-11-09, and the amendment, core and learning went in as one PR. While building, a 14-unit dodge
over 0.75 s turned out too slow to ever make a shot miss, so the slide is the piece's radius plus 4
units in 0.15 s.)

### Fable red team (2026-11-09)

13 findings, all folded in:

1. Aim at every split was homing by another name, aimed from point-blank. → Aim acts only at entry;
   children leave at fixed angles.
2. Inheritance doesn't make trait points cost the same, and Speed could outrun shots. → Per-size
   speeds and a cap at 60% of shot speed; the fairness test is the proof.
3. A weak scripted pilot would die early either way and pass trivially. → Shared pilot delivered
   in PR 2, band floor at wave 3, step cap, time limit.
4. Dodge near the ship could land a piece on you; no formation to drift back to. → Offset that
   resumes the old velocity, path test, never within 40 units.
5. Respawn could wait forever, and faint time at the center would teach the zone lesson. → 3 s
   timeout; respawn and faint time excluded from counts.
6. The wrap lesson was unreadable and its counter pushed players into the zone lesson. → Dropped;
   replaced by "leaves small pieces" → Speed.
7. "Aim leads your movement" couldn't be seen. → Cut; one lesson per trait.
8. Swarm's spray threshold doesn't fit 3 wrapping shots and splitting targets. → Divide sets its
   own; any piece hit counts; `aimLane` becomes a generic `target`.
9. A steering stick overloaded one thumb and differed from keys. → Four hold buttons giving the
   same input as keys; two touches tracked; sizes stated.
10. 4 shots, rising points, a center-clear respawn and a side-to-side Probe at random height felt
    like the original. → 3 shots, flat points, a respawn timeout, a diagonal Probe.
11. "40% of pieces gone" was ambiguous. → Defined over 7N hits.
12. Builder-facing numbers missing. → Starting numbers table.
13. Scope is a second v1. → Kept to 3 lessons; the owner can stop after PR 2 and play it first.
