// wrong.mjs - findings a person marked as wrong, and what each check has cried wolf about. A check nobody trusts is
// read less, so the record exists to get the check fixed; it never hides the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordWrong, readWrong, dropWrong, byCheck, wrongLines, wrongPath } from '../wrong.mjs';
import { tempDir } from './helpers.mjs';

const dir = () => tempDir('wrong-');
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

test('each finding marked wrong is a case its check must pass: still raised, or passed now, only for the checks that ran', async () => {
  const { wrongCases, caseLines } = await import('../wrong.mjs');
  const d = dir();
  recordWrong(d, [f('Token values', 'chip radius differs', 'chip'), f('Markup', 'tile has no id', 'tile'), f('Icons', 'star path differs')], { why: 'it reads the hover rule' });
  const cases = wrongCases(d, [{ check: 'Token values', what: 'chip radius differs' }], ['Token values', 'Markup']);
  assert.deepEqual(cases.still.map((m) => m.what), ['chip radius differs'], 'still raised: the check is still wrong');
  assert.deepEqual(cases.fixed.map((m) => m.what), ['tile has no id'], 'its check ran and no longer raises it: passed');
  const lines = caseLines(cases);
  assert.match(lines[0], /^Marked wrong and still raised: 1/);
  assert.match(lines[1], /Token values: chip radius differs \(wrong because: it reads the hover rule\)/);
  assert.ok(lines.some((l) => /--unwrong --match/.test(l)));
  assert.deepEqual(caseLines(wrongCases(d, [], [])), [], 'a run that ran none of their checks says nothing of them');
});

test('--wrong marks the last audit\'s findings that match, only with why; --unwrong takes them back', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const d = dir();
  writeFileSync(join(d, 'ds-config.json'), '{}');
  mkdirSync(join(d, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(d, '.design-system-engine-out', 'findings.json'), JSON.stringify({ findings: [{ check: 'Token values', evidence: 'chip radius differs', component: 'chip' }, { check: 'Markup', evidence: 'tile has no id', component: 'tile' }] }));
  const run = (...a) => spawnSync(process.execPath, [join(process.cwd(), 'audit.mjs'), ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  assert.match(run('--wrong', '--match', 'radius').stdout, /needs why/);
  const ok = run('--wrong', '--match', 'radius', '--why', 'it reads the hover rule', '--by', 'QA');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.deepEqual(readWrong(d).map((m) => [m.what, m.why, m.by]), [['chip radius differs', 'it reads the hover rule', 'QA']]);
  assert.match(run('--wrong').stdout, /Marked wrong \(design-system-engine-wrong\.json\): 1/);
  assert.equal(run('--wrong', '--match', 'nothing', '--why', 'x').status, 1);
  assert.equal(run('--unwrong', '--match', 'radius').status, 0);
  assert.deepEqual(readWrong(d), []);
});
