// The evaluation records kept in the repository: what they hold, and what they must never hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneRow, runStats, resultsEntry } from './skill-evals/record.mjs';
import { readFolder, summarize } from './skill-evals/summarize.mjs';

const RECORDS = join(dirname(fileURLToPath(import.meta.url)), 'skill-evals', 'records');
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : f.endsWith('.jsonl') ? [p] : []; });

test('a record keeps the run as scored, without private tasks, installed packages or very large files', () => {
  assert.equal(pruneRow({ task: 'private-badge-pt', files: {} }), null);
  const r = pruneRow({ task: 'proto-settings', changed: ['prototypes/a.json', 'node_modules/x/index.js', 'package-lock.json'], files: { 'prototypes/a.json': '{}', 'node_modules/x/index.js': 'x', 'package-lock.json': '{}', 'big.css': 'a'.repeat(50000) } });
  assert.deepEqual(r.changed, ['prototypes/a.json']);
  assert.deepEqual(Object.keys(r.files), ['prototypes/a.json', 'big.css']);
  assert.match(r.files['big.css'], /more characters left out of the record\)$/);
});

test('every record in the repository: no private task, no installed package, and its README names it', () => {
  if (!existsSync(RECORDS)) return;
  const readme = readFileSync(join(RECORDS, 'README.md'), 'utf8');
  for (const dir of readdirSync(RECORDS).filter((f) => statSync(join(RECORDS, f)).isDirectory())) {
    assert.ok(readme.includes(`\`${dir}\``), `records/README.md names ${dir}`);
    for (const f of files(join(RECORDS, dir))) {
      for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        assert.ok(!/^private/.test(row.task), `${f}: a private task`);
        assert.ok(!Object.keys(row.files ?? {}).some((p) => /node_modules\//.test(p)), `${f}: an installed package`);
      }
    }
    assert.match(summarize(readFolder(join(RECORDS, dir))), /\| Side \| Pass \|/);
  }
});

test('recording an evaluation writes its RESULTS.md entry from the runs, against the runs of the entry before', () => {
  const row = (task, run, pass, extra = {}) => ({ task, run, pass, engineHash: 'e2', project: 'p1', usage: { cost: 0.05, input: 100000 }, checks: [{ name: 'does the task', ok: pass }], rules: [{ name: 'never commits', ok: true }], ...extra });
  const now = { 'claude-haiku-4-5-20251001': runStats([row('a', 0, true), row('a', 1, true), row('b', 0, true), row('b', 1, false), row('b', 2, true)]) };
  const before = { 'claude-haiku-4-5-20251001': runStats([row('a', 0, true, { engineHash: 'e1', usage: { cost: 0.04, input: 90000 } }), row('b', 0, true, { engineHash: 'e1', usage: { cost: 0.04, input: 90000 } })]) };
  assert.deepEqual([now['claude-haiku-4-5-20251001'].pass, now['claude-haiku-4-5-20251001'].more], [4, ['`b` at 3 runs']]);
  const md = resultsEntry({ title: 'a change', what: 'one; two', guideFiles: ['cookbook/x.md'], prevEngine: 'e1', guideSet: 'abcdef123456', now, before, name: '2026-10-05-x', date: '2026-10' });
  assert.match(md, /^## 2026-10: a change \(continuous evaluation\)\n\nWhat changed since the entry below \(engine e1\): one; two\. The guide changed in `cookbook\/x\.md`\./);
  assert.match(md, /Guide set measured: `abcdef123456` · Project measured: `p1`/, 'the line test/skill-evals.test.mjs reads');
  assert.match(md, /\| The 2 guide tasks \(`b` at 3 runs\) \| 2\/2 \| 4\/5 \|/);
  assert.match(md, /Haiku: 1 of 5 runs failed, fewer passes than the entry below\. Failed: b #1: does the task\./, 'a failure is named, task and check');
  assert.match(md, /Records: `records\/2026-10-05-x`\./);
});
