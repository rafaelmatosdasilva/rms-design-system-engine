// who-did-it.mjs: who did a piece of work on the style guide's History, beside who answered a decision. Each row
// that rests on a commit names its author, and who brought it in when that is somebody else; a run with nobody
// behind it is said as what started it, never as whoever owns the schedule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runOf, runTrailer, runFromTrailer, doneBy, doneByAll } from '../lib/who-did-it.mjs';
import { runBy } from '../lib/decided-by.mjs';
import { changelogs, figmaChangelogs } from '../lib/component-changelog.mjs';
import { tempDir } from './helpers.mjs';

test('one name when one person did it all, both when somebody else brought it in', () => {
  assert.equal(doneBy({ author: 'Quokka', committer: 'Quokka' }), 'Done by Quokka');
  assert.equal(doneBy({ author: 'Quokka', committer: 'quokka' }), 'Done by Quokka', 'the same person, whatever the case');
  assert.equal(doneBy({ author: 'Quokka', committer: 'Wombat' }), 'Done by Quokka · pushed by Wombat', 'a maintainer who brought in someone else\'s work');
  assert.equal(doneBy({ author: 'Quokka' }), 'Done by Quokka');
  assert.equal(doneBy({}), null, 'nobody known, nothing said');
});

test('an account is never said as if it were a person', () => {
  // The host's own merge button, an app, and a project access token's bot.
  assert.equal(doneBy({ author: 'Quokka', committer: 'GitHub' }), 'Done by Quokka');
  assert.equal(doneBy({ author: 'Quokka', committer: 'web-flow' }), 'Done by Quokka');
  assert.equal(doneBy({ author: 'renovate[bot]', committer: 'GitHub' }), 'Done by a pipeline');
  assert.equal(doneBy({ author: 'project_412_bot_9f2c1e', committer: 'project_412_bot_9f2c1e' }), 'Done by a pipeline');
  assert.equal(doneBy({ author: 'project_412_bot_9f2c1e', committer: 'Wombat' }), 'Done by a pipeline · pushed by Wombat');
});

test('a run with nobody behind it is said as what started it, never as the schedule\'s owner', () => {
  assert.equal(doneBy({ author: 'Schedule Owner', run: { how: 'schedule' } }), 'Done by the schedule');
  assert.equal(doneBy({ run: { how: 'trigger' } }), 'Done by a pipeline trigger');
  assert.equal(doneBy({ run: { how: 'pipeline' } }), 'Done by a pipeline');
  assert.deepEqual(runFromTrailer('schedule'), { how: 'schedule' });
  assert.deepEqual(runFromTrailer(' Schedule '), { how: 'schedule' });
  assert.equal(runFromTrailer('Quokka'), null, 'a trailer naming a person is not a run with nobody behind it');
  assert.equal(runFromTrailer(''), null);
});

test('a GitLab pipeline names who started it, and a schedule names nobody', () => {
  const gl = (source, more = {}) => ({ GITLAB_CI: 'true', CI_PIPELINE_SOURCE: source, GITLAB_USER_NAME: 'Wombat', GITLAB_USER_EMAIL: 'ben@example.com', ...more });
  for (const source of ['push', 'web', 'merge_request_event']) assert.deepEqual(runOf(gl(source)), { how: 'person', name: 'Wombat', email: 'ben@example.com', source }, source);
  // GitLab names the schedule's owner as the one who ran it: that is never taken as who did the work.
  assert.deepEqual(runOf(gl('schedule')), { how: 'schedule', source: 'schedule' });
  assert.deepEqual(runOf(gl('trigger')), { how: 'trigger', source: 'trigger' });
  assert.deepEqual(runOf(gl('parent_pipeline')), { how: 'pipeline', source: 'parent_pipeline' });
  assert.equal(runTrailer(runOf(gl('schedule'))), 'Run-by: schedule');
  assert.equal(runTrailer(runOf(gl('push'))), null, 'a person-started run says who through its author, needing no trailer');
  // GitHub Actions the same way.
  assert.deepEqual(runOf({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule', GITHUB_ACTOR: 'owner' }), { how: 'schedule', source: 'schedule' });
  assert.deepEqual(runOf({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_ACTOR: 'quokka' }), { how: 'person', name: 'quokka', email: null, source: 'push' });
  assert.equal(runOf({}), null, 'not a pipeline: the run\'s own git says who');
});

test('a commit the engine makes in a pipeline is authored by who started it, and by nobody for a schedule', () => {
  const dir = tempDir('who-runby-');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Configured In The Pipeline'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'ci@example.com'], { cwd: dir });
  const gl = (source) => ({ GITLAB_CI: 'true', CI_PIPELINE_SOURCE: source, GITLAB_USER_NAME: 'Wombat', GITLAB_USER_EMAIL: 'ben@example.com' });
  assert.deepEqual(runBy(dir, [], gl('push')), { name: 'Wombat', email: 'ben@example.com' }, 'who pushed, not the name the pipeline configured');
  assert.equal(runBy(dir, [], gl('schedule')), null, 'a schedule has nobody behind it');
  assert.deepEqual(runBy(dir, ['--by', 'Quokka'], gl('schedule')), { name: 'Quokka', email: 'ci@example.com' }, 'a name given with --by still wins');
  assert.deepEqual(runBy(dir, [], {}), { name: 'Configured In The Pipeline', email: 'ci@example.com' }, 'outside a pipeline, the checkout\'s own git');
});

// A project's history with commits made by different people, one brought in by a maintainer and one a scheduled run.
function history() {
  const dir = tempDir('who-history-');
  const git = (env, ...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const as = (author, committer = author) => ({ GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: committer, GIT_COMMITTER_EMAIL: 'c@example.com' });
  git({}, 'init', '-q', '-b', 'main');
  const css = (pad) => `.chip {\n  padding: ${pad};\n}\n`;
  const snap = (opts) => JSON.stringify({ chip: { properties: { 'Size#1:0': { type: 'VARIANT', variantOptions: opts, defaultValue: opts[0] } } } }, null, 2);
  writeFileSync(join(dir, 'theme.css'), css('8px')); writeFileSync(join(dir, 'props.json'), snap(['S']));
  git(as('Quokka'), 'add', '-A'); git(as('Quokka'), 'commit', '-qm', 'first');
  writeFileSync(join(dir, 'theme.css'), css('12px')); git(as('Quokka', 'Wombat'), 'commit', '-qam', 'chip padding follows Figma');
  writeFileSync(join(dir, 'props.json'), snap(['S', 'M'])); git(as('project_7_bot_ab12'), 'commit', '-qam', 'Figma read again\n\nRun-by: schedule');
  return dir;
}

test('History says who did each change: the author, who brought it in, or the schedule', () => {
  const dir = history();
  const code = changelogs(dir, [{ name: 'chip', files: ['theme.css'] }]).chip;
  assert.deepEqual(code.map((r) => [r.subject, r.by]), [['chip padding follows Figma', 'Done by Quokka · pushed by Wombat'], ['first', 'Done by Quokka']]);
  // The same commits read rule by rule (git log -L) say the same.
  const ranged = changelogs(dir, [{ name: 'chip', files: ['theme.css'], ranges: [['theme.css', 1, 3]] }]).chip;
  assert.deepEqual(ranged.map((r) => r.by), ['Done by Quokka · pushed by Wombat', 'Done by Quokka']);
  // A read of Figma a schedule saved is the schedule's, never the token's bot nor whoever owns the schedule.
  const fig = figmaChangelogs(dir, { props: 'props.json' }, ['chip'], { cache: false }).chip;
  assert.deepEqual(fig.map((r) => r.by), ['Done by the schedule', 'Done by Quokka']);
});

test('several commits, one line: every person once, in the order they worked; nobody known is null', () => {
  assert.equal(doneByAll(['Done by Quokka', 'Done by Wombat', 'Done by quokka', null]), 'Done by Quokka, Wombat');
  assert.equal(doneByAll(['Done by Quokka · pushed by Wombat']), 'Done by Quokka · pushed by Wombat');
  assert.equal(doneByAll(['Done by quokka.da.wombat', 'Done by Wombat', 'Done by Quokka da Wombat']), 'Done by Quokka da Wombat, Wombat', 'one person under a username and a name: once, by the name');
  assert.equal(doneByAll([null, undefined]), null);
});

test('a Windows sign-in is said by its name alone, without its machine or domain', () => {
  assert.equal(doneBy({ author: 'WOMBAT-PC\\wombat.jones', committer: 'WOMBAT-PC\\wombat.jones' }), 'Done by wombat.jones');
  assert.equal(doneBy({ author: 'ACME\\quokka', committer: 'Wombat' }), 'Done by quokka · pushed by Wombat');
});
