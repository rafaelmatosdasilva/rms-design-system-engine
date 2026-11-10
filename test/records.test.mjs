// The evaluation records kept in the repository: what they hold, and what they must never hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneRow, runStats, resultsEntry, moreSteps, scrubPaths } from './skill-evals/record.mjs';
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

test('every record in the repository: no private task, no installed package, and its README names it', async () => {
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
    assert.match(await summarize(readFolder(join(RECORDS, dir))), /\| Side \| Pass \|/);
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

test('input that moved while input a turn held is said to be turns, never something grown (FINDINGS.md)', () => {
  // The case that took three wrong guesses: 92k to 105k, the guide, the project and the engine's output all the same.
  // Here each run reads 26k a turn before and after; only the number of turns changes.
  const row = (task, run, turns, engineHash) => ({ task, run, pass: true, engineHash, project: 'p1', usage: { cost: 0.05, input: 26000 * turns, turns }, checks: [{ name: 'does the task', ok: true }], rules: [{ name: 'never commits', ok: true }] });
  const before = runStats([row('refresh-no-figma', 0, 1, 'e1'), row('refresh-no-figma', 1, 2, 'e1'), row('audit-all', 0, 2, 'e1'), row('audit-all', 1, 2, 'e1')]);
  const now = runStats([row('refresh-no-figma', 0, 3, 'e2'), row('refresh-no-figma', 1, 3, 'e2'), row('audit-all', 0, 2, 'e2'), row('audit-all', 1, 3, 'e2')]);
  const said = moreSteps(before, now);
  assert.match(said, /^Input moved but input a turn held \(26k to 26k\): the turns moved, 1\.8 to 2\.8, and nothing a run reads grew/);
  assert.match(said, /most in `refresh-no-figma` 1\.5 to 3\.0, `audit-all` 2\.0 to 2\.5/, 'the tasks whose turns moved most, most first');
  const md = resultsEntry({ title: 't', what: 'x', guideSet: 'abcdef123456', now: { 'claude-haiku-4-5-20251001': now }, before: { 'claude-haiku-4-5-20251001': before }, name: 'n', date: '2026-11' });
  assert.match(md, /\| Turns a run \| 1\.8 \| 2\.8 \|/, 'turns have a row of their own, beside input');
  assert.match(md, /in 2\.8 turns against 1\.8/);
  assert.match(md, /the turns moved/);
  // Input that grew because each turn reads more is something grown, and is never called turns.
  const bigger = runStats([row('a', 0, 2, 'e2')].map((r) => ({ ...r, usage: { ...r.usage, input: 80000 } })));
  assert.equal(moreSteps(runStats([row('a', 0, 2, 'e1')]), bigger), '');
  // Nor is a small move, or an entry before with no turns recorded.
  assert.equal(moreSteps(before, before), '');
  assert.equal(moreSteps({ ...before, turns: 0 }, now), '');
});

test('a run stopped at the harness\'s own limit is recorded apart from one that broke a rule', () => {
  const row = (task, run, pass, extra = {}) => ({ task, run, pass, engineHash: 'e2', project: 'p1', usage: { cost: 0.05, input: 100000 }, checks: [{ name: 'does the task', ok: pass }], rules: [{ name: 'never commits', ok: true }], ...extra });
  // Four runs: two pass, one broke a rule, one was never allowed to finish.
  const broke = row('b', 0, false, { rules: [{ name: 'never commits', ok: false, detail: 'it committed' }] });
  const stopped = row('c', 0, false, { limit: 'ran out of turns', checks: [{ name: 'the run was given room to finish', ok: false, detail: 'ran out of turns' }] });
  const s = runStats([row('a', 0, true), row('a', 1, true), broke, stopped]);
  assert.equal(s.violations, 1, 'only the one that broke a rule');
  assert.equal(s.limits, 1);
  assert.deepEqual(s.limited, ['c #0: ran out of turns']);

  // The entry says it, so a reading never takes the ceiling for the guide getting worse.
  const md = resultsEntry({ title: 't', what: 'x', guideSet: 'abcdef123456', now: { 'claude-haiku-4-5-20251001': s }, name: 'n', date: '2026-10' });
  assert.match(md, /\| Runs stopped at a limit \| - \| 1 \|/);
  assert.match(md, /never finished: c #0: ran out of turns — read those as the ceiling, not the guide/);

  // Nothing stopped: the row is left out entirely rather than printing a zero nobody needs.
  const clean = runStats([row('a', 0, true), row('a', 1, true)]);
  assert.equal(clean.limits, 0);
  assert.doesNotMatch(resultsEntry({ title: 't', what: 'x', guideSet: 'abcdef123456', now: { 'claude-haiku-4-5-20251001': clean }, name: 'n', date: '2026-10' }), /stopped at a limit/);
});

test('a record carries no folder of this computer, the engine\'s own included', () => {
  // The home folder was the only root written out, and a run measured from a worktree put the engine somewhere
  // else: a temporary folder whose path still spelt the person's name, flattened into one segment that homedir()
  // never matched. It reached the record, and the privacy hook caught it on the way to a public repository.
  const home = '/Users/someone';
  const engine = '/private/tmp/claude-501/-Users-someone-Documents-engine/abc/scratchpad/wt-x';
  const said = scrubPaths(`ran ${engine}/audit.mjs, read ${home}/notes.md`, { engine, home });
  assert.equal(said, 'ran <engine>/audit.mjs, read ~/notes.md');
  assert.doesNotMatch(said, /someone/);

  // The engine under the home folder is still the engine: the longer root wins, so neither is half-written.
  const under = '/Users/someone/Documents/engine';
  assert.equal(scrubPaths(`${under}/lib/x.mjs`, { engine: under, home }), '<engine>/lib/x.mjs');
  // Nothing of this computer in it is left as it is.
  assert.equal(scrubPaths('a line with no path', { engine, home }), 'a line with no path');
  // A root that is the whole disk would blank every path there is.
  assert.equal(scrubPaths('/etc/hosts', { engine: '/', home: '/' }), '/etc/hosts');
});
