// Run with: node --test
// The arcade original's title and maker never appear in a file the site serves. The list is
// stored encoded so this repo never spells it out; docs and tests aren't served, so they're
// left out of the scan.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const BANNED = ['c3BhY2UgaW52YWRlcnM=', 'c3BhY2VpbnZhZGVycw==', 'c3BhY2UtaW52YWRlcnM=', 'dGFpdG8='].map((b) =>
  Buffer.from(b, 'base64').toString(),
);
const TEXT = /\.(html|css|m?js|json|webmanifest|svg|txt)$/;

function servedFiles() {
  const ignored = readFileSync('.assetsignore', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir || '.')) {
      const path = dir ? join(dir, name) : name;
      if (ignored.includes(path) || name === 'node_modules') continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (TEXT.test(name)) files.push(path);
    }
  })('');
  return files;
}

test('no served file names the arcade original or its maker', () => {
  const files = servedFiles();
  assert.ok(files.includes('index.html') && files.includes('src/game.js'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const word of BANNED) assert.ok(!text.includes(word), `${file} contains a banned name`);
  }
});
