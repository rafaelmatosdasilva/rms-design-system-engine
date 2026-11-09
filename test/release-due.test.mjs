// release-due.mjs - releasing stops silently, because it runs on its own and every gate reports to nobody. This
// reads the state (work on main that no tag covers, and its age) rather than listening for a failure event, so one
// question catches a red run, a schedule that never fired, and a release nobody remembered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { waiting, lastTag, issueBody, OVERDUE_DAYS, ISSUE_TITLE } from '../lib/release-due.mjs';
import { tempDir } from './helpers.mjs';

const ENV = { GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com' };
// A repository whose commits and tags are laid down at the days given, so age is a fact and never the clock.
function repoAt(steps) {
  const d = tempDir('release-due-');
  const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  for (const [i, s] of steps.entries()) {
    writeFileSync(join(d, `f${i}.txt`), String(i));
    git('add', '-A');
    execFileSync('git', ['commit', '-q', '-m', s.msg ?? `c${i}`], { cwd: d, env: { ...process.env, ...ENV, GIT_AUTHOR_DATE: s.at, GIT_COMMITTER_DATE: s.at }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (s.tag) git('tag', s.tag);
  }
  return d;
}
const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString();
const NOW = new Date(Date.UTC(2026, 10, 20));

test('work no tag covers, and how long it has waited', () => {
  const d = repoAt([{ at: day(1), tag: 'v1.0.0' }, { at: day(2) }, { at: day(3) }]);
  const w = waiting(d, NOW);
  assert.equal(w.tag, 'v1.0.0');
  assert.equal(w.commits, 2);
  assert.equal(w.days, 18, 'the oldest commit no tag covers, not the newest');
  assert.equal(w.overdue, true);
});

test('a release that just went out is not overdue, and neither is a wait inside the week', () => {
  // Every commit tagged: nothing waiting at all.
  const covered = repoAt([{ at: day(1) }, { at: day(19), tag: 'v1.1.0' }]);
  assert.deepEqual(waiting(covered, NOW), { tag: 'v1.1.0', commits: 0, days: 0, overdue: false });
  // Waiting, but inside the weekly cadence: a release is due, not overdue, and nobody is told.
  const fresh = repoAt([{ at: day(14), tag: 'v1.0.0' }, { at: day(18) }]);
  const w = waiting(fresh, NOW);
  assert.equal(w.days, 2);
  assert.equal(w.overdue, false);
});

test('the day the ceiling is crossed, and not the day before', () => {
  const at = (n) => waiting(repoAt([{ at: day(1), tag: 'v1.0.0' }, { at: day(n) }]), NOW);
  assert.equal(at(20 - OVERDUE_DAYS + 1).overdue, false, `${OVERDUE_DAYS - 1} days is still inside the ceiling`);
  assert.equal(at(20 - OVERDUE_DAYS).overdue, true, `${OVERDUE_DAYS} days is overdue`);
});

test('the highest version, not the nearest tag by ancestry', () => {
  // The 5 November fault, as a repository: a higher version tagged earlier in the history than a lower one.
  const d = repoAt([{ at: day(1), tag: 'v2.0.0' }, { at: day(2), tag: 'v3.4.0' }, { at: day(3), tag: 'v2.1.0' }, { at: day(4) }]);
  assert.equal(lastTag(d), 'v3.4.0', 'a release must never compute a version below one already published');
  assert.equal(waiting(d, NOW).tag, 'v3.4.0');
});

test('a repository with no tag at all is every commit waiting', () => {
  const d = repoAt([{ at: day(1) }, { at: day(2) }]);
  const w = waiting(d, NOW);
  assert.equal(w.tag, '');
  assert.equal(w.commits, 2);
  assert.equal(w.overdue, true);
});

test('the issue names what is waiting and the three things it can be', () => {
  const body = issueBody({ tag: 'v3.4.0', commits: 37, days: 4 }, 'acme/engine');
  assert.match(body, /37 commits on `main` are in no release, and the oldest has waited 4 days/);
  assert.match(body, /`v3\.4\.0`/);
  assert.match(body, /A run went red/);
  assert.match(body, /The schedule did not fire/);
  assert.match(body, /Nothing is wrong and this is noise/, 'the ceiling being wrong is an answer too');
  assert.match(body, /acme\/engine\/actions\/workflows\/release\.yml/);
  assert.doesNotMatch(body, /\$\{|`\$/, 'the text is written here, never built in a shell');
});

test('the workflow reads the state on every push and daily, and writes only an issue', () => {
  const wf = readFileSync(new URL('../.github/workflows/release-due.yml', import.meta.url), 'utf8');
  // A push is an event that certainly happens here; a schedule is the thing being checked, so it cannot be the
  // only trigger - that is how the silence lasted four days.
  assert.match(wf, /push:\s*\n\s*branches: \[main\]/);
  assert.match(wf, /cron: '0 8 \* \* \*'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /issues: write/);
  assert.match(wf, /concurrency:\n\s*group: release-due/, 'one run at a time; a run in progress is never cancelled, by the default');
  assert.match(wf, /release-due\.mjs check/);
  // Tags, releases and main itself are the release workflow's to write, never this one's.
  assert.doesNotMatch(wf, /git (tag|push)|gh release create|npm publish/);
  // Every tag has to be there for the highest to be found.
  assert.match(wf, /fetch-depth: 0/);
  assert.equal(ISSUE_TITLE, 'Releasing has stopped');
});
