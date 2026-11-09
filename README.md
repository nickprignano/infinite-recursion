# Infinite Recursion

An original browser fixed shooter where the swarm learns your habits while you learn its. Plain
JavaScript and canvas, no build step. MIT licensed.

The plan is in [docs/SPEC.md](docs/SPEC.md). It installs as an app and plays offline. Putting it
on Cloudflare is in [docs/DEPLOY.md](docs/DEPLOY.md).

The idea of invaders that adapt between waves comes from
[invaderz](https://github.com/victorqribeiro/invaderz) by Victor Ribeiro (MIT); the code here is our
own. The site look is [prignano-theme](https://github.com/nickprignano/prignano-theme) (MIT).

## Run it

Serve the folder with any static server, for example `python3 -m http.server`, and open it. Tests
need only Node: `node --test`. After changing any file the site serves, run
`node tools/sw-version.mjs` so the installed app picks up the new version.
