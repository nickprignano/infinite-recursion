// Service worker: keeps a copy of every game file so the installed app plays offline.
// VERSION and FILES are written by `node tools/sw-version.mjs`; a test fails if they're stale.

const VERSION = '258da0fba972';
const FILES = [
  'data/lessons.json',
  'data/waves.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  '/',
  'manifest.webmanifest',
  'src/audio.js',
  'src/draw.js',
  'src/effects.js',
  'src/game.js',
  'src/input.js',
  'src/learner.js',
  'src/main.js',
  'src/rng.js',
  'src/scores.js',
  'src/settings.js',
  'src/storage.js',
  'src/swarm.js',
  'styles.css',
];
// The shared theme, pinned to a commit so it never changes. Kept if it loads, skipped if not.
const EXTRA = [
  'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/theme.css',
  'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js',
];
const CACHE = `infinite-recursion-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' skips the browser's HTTP cache, so a new version never keeps old files.
      await cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })));
      await Promise.allSettled(EXTRA.map((url) => cache.add(url)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page posts this when the player taps Update.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Every page is the one app page, cached as "/".
      const cached = request.mode === 'navigate'
        ? await cache.match('/')
        : await cache.match(request, { ignoreSearch: new URL(request.url).origin === location.origin });
      return cached || fetch(request);
    })(),
  );
});
