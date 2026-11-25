// A pinned package's new version moved with its hash, tried, and proposed (pin-move.mjs, .github/workflows/pin-move.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOVES, moved } from '../lib/pin-move.mjs';
import { PINNED, pinnedNow } from '../lib/pinned-standards.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
const H384 = 'A'.repeat(64);

test('every move is a pin the registry is asked about, with both its lines where they are and tests that exist', () => {
  const now = Object.fromEntries(pinnedNow(ENGINE).map((p) => [p.id, p]));
  for (const [id, m] of Object.entries(MOVES)) {
    const pin = PINNED.find((p) => p.id === id);
    assert.ok(pin, `${id} is in the list of pins`);
    assert.equal(pin.ask.kind, 'npm', `${id}: its registry is asked`);
    assert.equal(pin.file, m.file, `${id}: the same file the list reads it from`);
    const text = read(m.file);
    assert.ok(m.version[0].test(text) && m.hash[0].test(text), `${id}: both its lines are in ${m.file}`);
    for (const t of m.tries) assert.ok(existsSync(join(ENGINE, t)), `${id}: ${t} exists`);
    assert.ok(now[id].pinned, `${id} reads as pinned`);
  }
});

test('a move rewrites the version and its hash together, and nothing else', () => {
  const text = read(MOVES['axe-core'].file);
  const out = moved('axe-core', text, '9.9.9', H384);
  assert.match(out, /^const AXE_VERSION = '9\.9\.9';$/m);
  assert.match(out, new RegExp(`^export const AXE_SHA384 = '${H384}';$`, 'm'));
  const changed = out.split('\n').filter((l, i) => l !== text.split('\n')[i]);
  assert.equal(changed.length, 2, 'two lines, the version and the hash');
  assert.match(moved('playwright', read(MOVES.playwright.file), '9.9.9', `sha512-${'B'.repeat(86)}==`), /^export const PW_INTEGRITY = 'sha512-B{86}==';$/m, 'Playwright\'s integrity, sha512, moves the same way');
});

test('a version or hash that is not one is never written into the engine', () => {
  const text = read(MOVES['web-features'].file);
  assert.throws(() => moved('web-features', text, "1.0.0'; process.exit(1); '", H384), /not a plain version/);
  assert.throws(() => moved('web-features', text, '1.0.0', "x'; evil"), /not a hash/);
  assert.throws(() => moved('nope', text, '1.0.0', H384), /no move for "nope"/);
  assert.throws(() => moved('web-features', 'nothing here', '1.0.0', H384), /no longer has the line/);
});

test('the workflow runs the new version only where nothing can be written, and proposes without running it', () => {
  const wf = read('.github/workflows/pin-move.yml');
  const job = (name) => wf.split(/\n  (?=[a-z]+:\n)/).find((b) => b.startsWith(`${name}:`)) ?? '';
  assert.match(job('try'), /contents: read/);
  assert.doesNotMatch(job('try'), /contents: write|pull-requests: write/);
  assert.match(job('try'), /node --test \$\(node lib\/pin-move\.mjs tries/);
  assert.match(job('propose'), /contents: write/);
  assert.doesNotMatch(job('propose'), /node --test|lib\/pin-move\.mjs hash|before/);
  assert.match(job('propose'), /gh workflow run tests\.yml/);
  assert.match(job('propose'), /--draft/, 'a move whose tests failed opens as a draft');
});
