// A browser accessibility check that could not run never throws away the last good result: the style guide would say
// "the audit has not run in a browser yet" on every component (a11y-check.mjs → keepA11yResult, audit.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { keepA11yResult } from '../a11y-check.mjs';

const last = { total: 172, ran: ['keyboard trap'], checkedAt: '2026-10-26T22:10:49.406Z', issues: [] };

test('a run that measured nothing, or wrote nothing, leaves the last result where it was', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-keep-'));
  const run = join(dir, 'a11y.run.json'), kept = join(dir, 'a11y.json');
  writeFileSync(kept, JSON.stringify(last));
  writeFileSync(run, JSON.stringify({ total: 0, ran: [], checkedAt: '2026-10-27T19:13:00.000Z', issues: [] }));
  assert.deepEqual(keepA11yResult(run, kept), { replaced: false, keptFrom: last.checkedAt });
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).total, 172, 'the last good result, unchanged');
  assert.equal(existsSync(run), false, 'this run\'s empty result is not left behind');
  assert.deepEqual(keepA11yResult(run, kept), { replaced: false, keptFrom: last.checkedAt }, 'a check stopped before it wrote anything');
});

test('a run that measured something takes the last one\'s place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-keep-'));
  const run = join(dir, 'a11y.run.json'), kept = join(dir, 'a11y.json');
  writeFileSync(kept, JSON.stringify(last));
  writeFileSync(run, JSON.stringify({ total: 12, ran: [], checkedAt: '2026-10-27T20:00:00.000Z', issues: [] }));
  assert.deepEqual(keepA11yResult(run, kept), { replaced: true, keptFrom: null });
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).total, 12);
  assert.equal(existsSync(run), false);
  // No earlier result and nothing measured: nothing kept, nothing invented.
  const fresh = mkdtempSync(join(tmpdir(), 'a11y-keep-'));
  assert.deepEqual(keepA11yResult(join(fresh, 'a11y.run.json'), join(fresh, 'a11y.json')), { replaced: false, keptFrom: null });
});

test('the audit never deletes the last result before the check runs, and reports only this run\'s', () => {
  const src = readFileSync(fileURLToPath(new URL('../audit.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /unlinkSync\(A11Y_JSON\)/, 'the last result is never removed up front');
  assert.match(src, /'--json-out', A11Y_RUN/, 'the check writes beside it');
  assert.doesNotMatch(src, /readFileSync\(A11Y_JSON, 'utf8'\)/, 'this run\'s report reads this run\'s result (A11Y_NOW), never the kept one');
});
