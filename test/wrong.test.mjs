// wrong.mjs - findings a person marked as wrong, and what each check has cried wolf about. A check nobody trusts is
// read less, so the record exists to get the check fixed; it never hides the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordWrong, readWrong, dropWrong, byCheck, wrongLines, wrongPath } from '../wrong.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'wrong-'));
const f = (check, what, component = null) => ({ check, what, component });

test('a finding marked wrong is recorded with why, and a check is counted by how often it was', () => {
  const d = dir();
  assert.deepEqual(readWrong(d), [], 'nothing recorded yet');
  assert.deepEqual(wrongLines(d), [], 'and nothing said');

  // Why is required: without it, whoever fixes the check learns nothing.
  assert.throws(() => recordWrong(d, [f('Token values', 'chip radius differs')], { why: '  ' }), /needs why/);

  const added = recordWrong(d, [f('Token values', 'chip radius differs', 'chip')], { why: 'it reads the hover value as the base one', by: 'QA' });
  assert.equal(added.length, 1);
  assert.equal(added[0].check, 'Token values');
  assert.equal(added[0].why, 'it reads the hover value as the base one');
  assert.equal(added[0].by, 'QA');
  assert.ok(existsSync(wrongPath(d)));

  // The same finding marked again replaces rather than doubles.
  recordWrong(d, [f('Token values', 'chip radius differs', 'chip')], { why: 'still wrong' });
  assert.equal(readWrong(d).length, 1);
  assert.equal(readWrong(d)[0].why, 'still wrong');
});

test('the run names a check called wrong more than once, and never the one called wrong once', () => {
  const d = dir();
  recordWrong(d, [f('Token values', 'chip radius', 'chip'), f('Token values', 'card radius', 'card')], { why: 'reads hover as base' });
  recordWrong(d, [f('Markup', 'badge has no id', 'badge')], { why: 'the id is set by the framework' });

  const counts = byCheck(d);
  assert.deepEqual(counts.map((c) => [c.check, c.times]), [['Token values', 2], ['Markup', 1]], 'most-called first');
  // Alphabetical, because the file is written sorted: a committed record reads the same on every machine.
  assert.deepEqual(counts[0].components, ['card', 'chip']);

  const lines = wrongLines(d).join('\n');
  assert.match(lines, /Token values: 2 times \(card, chip\)/);
  assert.doesNotMatch(lines, /Markup/, 'once is not a pattern');
  assert.match(lines, /Fix the check/);

  // A finding is never hidden by being marked: the record says nothing about what a run reports today.
  assert.equal(readFileSync(wrongPath(d), 'utf8').includes('suppress'), false);
});

test('a mark is taken back when the check is fixed', () => {
  const d = dir();
  recordWrong(d, [f('Token values', 'chip radius', 'chip'), f('Markup', 'badge id', 'badge')], { why: 'misread' });
  const gone = dropWrong(d, (x) => x.check === 'Token values');
  assert.equal(gone.length, 1);
  assert.deepEqual(readWrong(d).map((x) => x.check), ['Markup']);
});
