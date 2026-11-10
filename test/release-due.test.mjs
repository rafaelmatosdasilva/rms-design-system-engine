// release-due.mjs - a version covers 50 commits, never a date, and releasing stops silently because it runs on its
// own and every gate reports to nobody. This reads the state (work on main that no release covers, whether that is a
// version yet and how long it has been one) rather than listening for a failure event, so one question catches a red
// run, a schedule that never fired, and a release nobody remembered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waiting, lastTag, issueBody, said, RELEASE_EVERY, OVERDUE_DAYS, ISSUE_TITLE } from '../lib/release-due.mjs';
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
const many = (n, at) => Array.from({ length: n }, () => ({ at }));

// A full group, gathered slowly: all but the last on day 2, the one that completes it on day 10.
const complete = repoAt([{ at: day(1), tag: 'v1.0.0' }, ...many(RELEASE_EVERY - 1, day(2)), { at: day(10) }]);
// One commit short, and old: the floor is a count, so no amount of waiting makes this a version.
const short = repoAt([{ at: day(1), tag: 'v1.0.0' }, ...many(RELEASE_EVERY - 1, day(2))]);

test('a group one commit short is no version, however long it has waited', () => {
  const w = waiting(short, NOW);
  assert.equal(w.tag, 'v1.0.0');
  assert.equal(w.commits, RELEASE_EVERY - 1);
  assert.equal(w.days, 18, 'the oldest commit no release covers, not the newest');
  assert.equal(w.due, false, `${RELEASE_EVERY - 1} commits is not a version`);
  assert.equal(w.dueDays, 0);
  assert.equal(w.overdue, false, 'nobody is told about work that is not a version yet');
  assert.match(said(w), /1 short of a version/);
});

test('the commit that completes the group makes it a version, and the wait starts there', () => {
  // Forty-nine commits waited since day 2, but the version did not exist until the fiftieth landed on day 10.
  const w = waiting(complete, new Date(Date.UTC(2026, 10, 11)));
  assert.equal(w.commits, RELEASE_EVERY);
  assert.equal(w.due, true);
  assert.equal(w.days, 9, 'the oldest commit is still nine days old');
  assert.equal(w.dueDays, 1, 'but a version has only been due for one day');
  assert.equal(w.overdue, false, 'the daily run has not had its day yet');
  assert.match(said(w), /a version is due/);
});

test('the day the ceiling is crossed, and not the day before', () => {
  const at = (n) => waiting(complete, new Date(Date.UTC(2026, 10, 10 + n)));
  assert.equal(at(OVERDUE_DAYS - 1).overdue, false, `${OVERDUE_DAYS - 1} days due is still inside the ceiling`);
  assert.equal(at(OVERDUE_DAYS).overdue, true, `${OVERDUE_DAYS} days due is overdue`);
  assert.match(said(at(OVERDUE_DAYS)), /overdue, the ceiling is 2/);
});

test('a release that just went out leaves nothing waiting', () => {
  const covered = repoAt([{ at: day(1) }, { at: day(19), tag: 'v1.1.0' }]);
  assert.deepEqual(waiting(covered, NOW), { tag: 'v1.1.0', commits: 0, days: 0, due: false, dueDays: 0, overdue: false });
  assert.match(said(waiting(covered, NOW)), /nothing waiting: v1\.1\.0 covers main/);
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
  assert.equal(w.due, false);
});

test('the issue names what is waiting, the rule it is measured against, and the three things it can be', () => {
  const body = issueBody({ tag: 'v3.4.0', commits: 62, days: 9, dueDays: 4 }, 'acme/engine');
  assert.match(body, /62 commits on `main` are in no release, and the oldest has waited 9 days/);
  assert.match(body, /A version covers 50 commits, so this one has been due for 4 days/);
  assert.match(body, /`v3\.4\.0`/);
  assert.match(body, /A run went red/);
  assert.match(body, /The schedule did not fire/);
  assert.match(body, /Nothing is wrong and this is noise/, 'the number being wrong is an answer too');
  assert.match(body, /50 commits a version is the wrong number/);
  assert.match(body, /acme\/engine\/actions\/workflows\/release\.yml/);
  assert.doesNotMatch(body, /\$\{|`\$/, 'the text is written here, never built in a shell');
});

test('the gate the release workflow reads answers yes or no in its first word', () => {
  const node = process.execPath;
  const cli = fileURLToPath(new URL('../lib/release-due.mjs', import.meta.url));
  const out = (cwd) => execFileSync(node, [cli, 'due'], { cwd, encoding: 'utf8' }).trim();
  assert.match(out(short), /^no /, 'a group short of a version releases nothing');
  assert.match(out(complete), /^yes /, 'a complete group is a release');
});

test('the workflow reads the state on every push and daily, and writes only an issue', () => {
  const wf = readFileSync(new URL('../.github/workflows/release-due.yml', import.meta.url), 'utf8');
  // A push is an event that certainly happens here; a schedule is the thing being checked, so it cannot be the
  // only trigger - that is how the silence lasted four days.
  assert.match(wf, /push:\s*\n\s*branches: \[main\]/);
  assert.match(wf, /cron: '\d?[1-9] 8 \* \* \*'/, 'daily, and never at the top of the hour');
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
