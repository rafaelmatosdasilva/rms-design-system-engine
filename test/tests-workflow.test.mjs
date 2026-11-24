// tests.yml - the suite runs once for a change, and the badge says what that run counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shardOf, testFiles, readWeights } from './shard.mjs';

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

// The badge is this repository's own SVG now, drawn by lib/badge-svg.mjs and written by lib/badges.mjs, because
// GitHub proxies every README image it serves and that proxy was breaking the two live badges. What the badge says
// and what colour it says it in is held to in test/badge-svg.test.mjs; what this workflow owes is the count, the
// outcome, and a checkout to draw from.
test('the run that counts the tests is the run that draws its badge', () => {
  const badge = wf.slice(wf.indexOf('  badge:'));
  assert.match(badge, /node lib\/badges\.mjs tests "\$pretty"/, 'a passing run shows what it counted');
  assert.match(badge, /node lib\/badges\.mjs tests --failing/, 'a failing run never shows a count as failures');
  assert.match(badge, /uses: actions\/checkout@[0-9a-f]{40} #/, 'drawing the badge needs the repository, pinned by digest');
  assert.match(badge, /uses: actions\/setup-node@[0-9a-f]{40} #/);
  assert.doesNotMatch(badge, /img\.shields\.io/, 'nothing outside draws it any more');
});

// The suite runs in quarters on four machines at once, and `test` (the check main's ruleset requires) is their sum:
// it passes only when every quarter passed, so a quarter that failed, or never ran, can never pass a change quietly.
test('the suite runs in four quarters that cover every file, and the required check passes only if all four did', () => {
  const shards = wf.match(/shard: \[([\d, ]+)\]/)?.[1].split(',').map(Number);
  assert.deepEqual(shards, [1, 2, 3, 4], 'one machine per quarter');
  const runs = wf.match(/node --test \$\(node test\/shard\.mjs \$\{\{ matrix\.shard \}\} (\d+)\)/);
  assert.ok(runs, 'each quarter runs its share of the test files');
  const total = Number(runs[1]);
  assert.equal(total, shards.length, 'as many quarters as machines, so no file is left out');
  // Every file runs on exactly one machine, with the table as it is, with no table, and with one that names a file
  // that is gone and misses a new one.
  for (const weights of [readWeights(), {}, { 'gone.test.mjs': 500, [testFiles()[0]]: 1 }]) {
    const all = shards.flatMap((i) => shardOf(testFiles(), weights, i, total));
    assert.deepEqual([...all].sort(), testFiles(), 'each file in exactly one quarter');
  }
  assert.match(wf, /fail-fast: false/, 'a failing quarter does not hide the others\' failures');
  const sum = wf.slice(wf.indexOf('\n  test:'), wf.indexOf('\n  badge:'));
  assert.match(sum, /needs: \[suite, playwright\]\n {4}if: always\(\)/, 'the check runs even when a quarter failed, and says so');
  assert.match(sum, /RESULT: \$\{\{ needs\.suite\.result \}\}/);
  assert.match(sum, /PLAYWRIGHT: \$\{\{ needs\.playwright\.result \}\}/);
  assert.match(sum, /\[ "\$RESULT" = success \] && \[ "\$PLAYWRIGHT" = success \]\n/, 'it fails unless every quarter and every Playwright run passed');
  assert.match(sum, /awk '\{s\+=\$1\} END\{print s\+0\}'/, 'the badge counts every quarter\'s tests');
  assert.match(wf, /count-\$\{\{ matrix\.shard \}\}\.txt/);
});

// The split is even by the time each file last took, so no machine waits on the others for long. Node's own split
// (every fourth file) gave one machine half as much again as the rest.
test('each quarter gets about a quarter of the time, and the table names the files that exist', () => {
  const w = readWeights(), files = testFiles(), total = files.reduce((s, f) => s + (w[f] ?? 0), 0);
  const unknown = files.filter((f) => !(f in w));
  assert.ok(unknown.length <= files.length / 10, `refresh test/shard-weights.json (test/shard.mjs says how): ${unknown.length} files are not in it`);
  for (const i of [1, 2, 3, 4]) {
    const secs = shardOf(files, w, i, 4).reduce((s, f) => s + (w[f] ?? 0), 0);
    assert.ok(secs <= total / 4 * 1.1, `quarter ${i}: ${Math.round(secs)}s of ${Math.round(total)}s`);
  }
});
