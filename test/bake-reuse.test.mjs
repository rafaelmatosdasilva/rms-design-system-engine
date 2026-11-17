// A component unchanged between two builds keeps its saved accessibility results, so a build tries only what changed
// (the owner's, 17 November 2026: a demo build tried 5 components on every build for nothing). Its signature never holds
// where it was placed on the page it was measured in, and a date it is given is the same on every build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ENGINE, p), 'utf8');

test('a component\'s signature leaves out where its markup sat on the page, as it does for its renders', () => {
  const start = read('templates/styleguide/js/00-start.js');
  const line = start.split('\n').find((l) => l.startsWith('  function noPlace('));
  assert.ok(line, 'one helper for it');
  const noPlace = new Function(`${line}\nreturn noPlace;`)();
  const at = (top) => `<div class="header-divider" style="top: ${top}px;"></div>`;
  assert.equal(noPlace(at(48812)), noPlace(at(48850)), 'moved down the page: the same component');
  assert.notEqual(noPlace('<div style="width: 12px"></div>'), noPlace('<div style="width: 16px"></div>'), 'its own size still counts');
  assert.match(start, /c\.markup && noPlace\(c\.markup\)/, 'its markup');
  assert.match(start, /c\.markups && c\.markups\.map\(/, 'and each of its markups');
  assert.match(start, /var renders = c\.renders \? JSON\.parse\(noPlace\(/, 'and its renders, through the same helper');
});

test('a date a component reads and is not given is the same on every build, never the moment it is drawn', () => {
  const harness = read('lib/vue-harness.mjs');
  assert.match(harness, /const SAMPLE_DATE = '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}';/, 'one fixed sample date');
  assert.match(harness, /out\[d\] = new Date\(SAMPLE_DATE\);/, 'given to a date it reads');
  assert.doesNotMatch(harness, /out\[d\] = new Date\(\);/, 'never today');
});
