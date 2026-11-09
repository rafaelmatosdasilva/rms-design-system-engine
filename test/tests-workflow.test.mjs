// tests.yml - the suite runs once for a change, and the badge says what that run counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');

test('a change runs the suite once, and main runs it for itself', () => {
  // `push:` on every branch beside `pull_request:` ran the whole suite twice for the same commit, and the merge
  // waited for both: two runs of about fifteen minutes each. Every other workflow here already limits its push.
  assert.match(wf, /on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:/);
  assert.doesNotMatch(wf, /on:\n {2}push:\n {2}pull_request:/, 'a pull request is not a reason to run it twice');
});

test('the badge is written from main only, after the suite, and says what the run counted', () => {
  assert.match(wf, /count=\$\(grep -m1 '\^# tests ' test\.log \| awk '\{print \$3\}'\)/, 'the number comes from the run, not from a person');
  assert.match(wf, /needs: test/);
  assert.match(wf, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/, 'no branch and no pull request writes the badge');
  assert.match(wf, /if: always\(\)/, 'a failed run still reports what it managed to count');
  // The badge job writes; the job that runs the tests does not.
  const badge = wf.slice(wf.indexOf('  badge:'));
  assert.match(badge, /permissions:\n {6}contents: write/);
  assert.equal(wf.slice(0, wf.indexOf('  badge:')).includes('contents: write'), false, 'the test job stays read-only');
});
