// Every documented way of asking for a prototype reaches a command of its own, and not the usage text.
//
// Three faults shipped that no test could see, because every test calls the functions and these sat between the
// command line and the functions: --judge was not among the flags that run with no file named, a flag's own value
// was read as the composition to open, and the record each check writes was read as a page to judge (engine #517).
// Each made a documented command print the usage text. This reads the commands themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reaches, WHOLE_PROJECT, NEEDS_NO_FILE, TAKES_A_VALUE, wordsAfter } from '../lib/prototype.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
// The arguments of a documented command, after the engine's name and --prototype.
const argsOf = (cmd) => (cmd.match(/[^\s"]+|"([^"]*)"/g) ?? []).map((w) => w.replace(/^"|"$/g, '')).filter((w) => w !== 'rms-design-system-engine' && w !== '--prototype');

test('every branch --prototype takes is in the table the guard is read from', () => {
  // The source, not a copy of it: a branch added without its entry is a command that falls to the usage text,
  // which is the whole of what engine #517 fixed, and nothing would have said so.
  const src = read('lib/prototype.mjs');
  const body = src.slice(src.indexOf('export async function runPrototype'));
  const branched = [...body.matchAll(/args\.includes\('(--[a-z-]+)'\)\)\s*(?:return|\{)/g)].map((m) => m[1]);
  const missing = [...new Set(branched)].filter((f) => !NEEDS_NO_FILE.includes(f) && f !== '--json');
  assert.deepEqual(missing, [], 'each of these is a flag runPrototype acts on that the guard would refuse first');
});

test('every documented prototype command reaches a command of its own', () => {
  const pages = ['docs/features.md', 'docs/creation.md', 'reference/usage.md'];
  const found = [];
  for (const f of pages) for (const m of read(f).matchAll(/rms-design-system-engine --prototype([^\n`|]*)/g)) {
    const cmd = m[0].trim().replace(/[.,;:]$/, '');
    // Placeholders a reader fills in are not commands: <name>, <that file>, …
    if (/<[^>]+>|…|…/.test(cmd)) continue;
    found.push(cmd);
  }
  assert.ok(found.length >= 5, `the documentation gives prototype commands (found ${found.length})`);
  const dead = found.filter((cmd) => !reaches(argsOf(cmd)));
  assert.deepEqual([...new Set(dead)], [], 'these print the usage text instead of running');
});

test('the command the judge is asked for by runs', () => {
  // The exact shape engine #517 found unusable, kept here by name so it cannot come back.
  assert.equal(reaches(['--judge', '--for', 'a way to approve an order']), 'the request, judged against what was drawn');
  assert.equal(reaches(['--catalog', '--judge-shell', '--for', 'a page to browse orders']), 'the catalog');
});

test('a flag that carries a word is never read as the file to open', () => {
  for (const f of TAKES_A_VALUE) {
    const args = ['--judge', f, 'something'];
    assert.equal(wordsAfter(args, TAKES_A_VALUE).find((a) => !a.startsWith('--')), undefined, `${f}'s value`);
  }
});

test('a command with nothing to act on is the usage text, and says so', () => {
  assert.equal(reaches([]), null);
  assert.equal(reaches(['--offline']), null, 'a flag that changes how it runs is not something to run');
  assert.equal(reaches(['--for', 'a page to browse orders']), null, 'a request with no command is not one');
});

test('a composition named, or a capture to start from, is a command', () => {
  assert.equal(reaches(['prototypes/orders.json']), 'one composition');
  assert.equal(reaches(['prototypes/orders.json', '--offline']), 'one composition');
  assert.equal(reaches(['--from-screens', 'figma-screens.json']), 'a screen capture read as a starting point');
});

test('every entry in the table says what it does, for the person reading the usage', () => {
  for (const [flag, what] of WHOLE_PROJECT) {
    assert.match(flag, /^--[a-z-]+$/);
    assert.ok(what && what.length > 8, `${flag}: ${what}`);
  }
  assert.equal(new Set(NEEDS_NO_FILE).size, NEEDS_NO_FILE.length, 'no flag twice');
});
