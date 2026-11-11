// known-pages: every style guide this computer built is built again when the installed engine moves on - a merge
// pulled in, or the daily self-update - through the engine's own post-merge hook. Only the pages that fell behind, under
// the same rules as every rebuild; never a test's or a temporary folder's page on the person's list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { rememberPage, knownPages, rebuildKnownPages, hookScript, ensureEngineHook } from '../lib/known-pages.mjs';
import { stampMeta } from '../lib/stamp.mjs';
import { makeFixture } from './helpers.mjs';

const ENV = { ...process.env, CI: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { ...o, env: ENV });
// The fixtures sit in the system's temporary folder, which rememberPage leaves out on purpose: here another one counts.
const NOT_TMP = '/no-such-temporary-folder';
const PAGE = '.design-system-engine-out/styleguide/index.html';
const project = (stamp) => {
  const dir = makeFixture({ 'ds-config.json': {}, '.gitlab-source.json': { ref: 'master', sha: 'code-new' } });
  if (stamp) { mkdirSync(join(dir, '.design-system-engine-out/styleguide'), { recursive: true }); writeFileSync(join(dir, PAGE), `<html><head>${stampMeta(stamp)}</head></html>`); }
  return dir;
};
function engineRepo() {
  const dir = makeFixture({ 'a.txt': 'one\n' });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'one');
  const first = git(dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(dir, 'a.txt'), 'two\n'); git(dir, 'commit', '-qam', 'two');
  return { dir, first, now: git(dir, 'rev-parse', 'HEAD').trim() };
}

test('where a page was built is kept, once, on this computer; never a temporary folder\'s, a test\'s or CI\'s', () => {
  const file = join(makeFixture({}), 'pages.json'), a = project(), b = project();
  const keep = (root, env = {}, tmp = NOT_TMP) => rememberPage(root, { env, file, tmp });
  assert.equal(keep(a), true);
  assert.equal(keep(a), true, 'kept already');
  assert.equal(keep(b), true);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pages.length, 2, 'each project once');
  assert.equal(keep(project(), { CI: 'true' }), false, 'never on CI');
  assert.equal(keep(project(), { NODE_TEST_CONTEXT: 'child-v8' }), false, 'never a page a test built, wherever it sits');
  assert.equal(keep(project(), {}, join(a, '..')), false, 'never in a temporary folder: an evaluation run\'s, a test\'s');
  // A project that went away leaves the list.
  rmSync(join(b, 'ds-config.json'));
  assert.equal(knownPages({ env: {}, file }).length, 1);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pages.length, 1, 'and the list says so');
});

test('when the engine moved on, each page it left behind is built again, and only those', () => {
  const e = engineRepo(), file = join(makeFixture({}), 'pages.json');
  const behind = project({ engine: e.first, code: 'code-new' });
  const current = project({ engine: e.now, code: 'code-new' });
  const off = project({ engine: e.first, code: 'code-new' });
  writeFileSync(join(off, 'ds-config.json'), JSON.stringify({ hooks: false }));
  for (const p of [behind, current, off]) rememberPage(p, { env: {}, file, tmp: NOT_TMP });
  const started = [];
  const spawn = (node, args, o) => { started.push(o.cwd); return { pid: 1, unref() {} }; };
  const r = rebuildKnownPages({ engineDir: e.dir, env: {}, file, script: '/engine/lib/audit.mjs', spawn });
  // The list keeps each folder as it really is (macOS's /var is /private/var).
  assert.deepEqual(started, [realpathSync(behind)], 'the one the engine left behind, never the current one or one with hooks off');
  assert.deepEqual(r.filter((x) => x.started).map((x) => x.why), [['the engine']]);
  assert.deepEqual(rebuildKnownPages({ engineDir: e.dir, env: { CI: 'true' }, file, spawn }), [], 'never on CI');
});

test('the hook goes into the installed engine only, names node by its path, and leaves somebody else\'s alone', () => {
  const e = engineRepo(), hook = join(e.dir, '.git', 'hooks', 'post-merge');
  const ensure = (o = {}) => ensureEngineHook(e.dir, { env: {}, node: '/opt/node 22/bin/node', run, ...o });
  assert.deepEqual(ensure(), { installed: true, why: 'written' });
  const text = readFileSync(hook, 'utf8');
  assert.equal(text, hookScript(e.dir, '/opt/node 22/bin/node'));
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.match(text, /'\/opt\/node 22\/bin\/node' '.*known-pages\.mjs' --rebuild/, 'node and the module by their full paths, quoted');
  assert.ok(statSync(hook).mode & 0o111, 'it runs');
  assert.deepEqual(ensure(), { installed: true, why: 'already' });
  assert.deepEqual(ensure({ node: '/usr/local/bin/node' }), { installed: true, why: 'updated' }, 'node moved: the hook follows');
  assert.equal(ensure({ env: { CI: 'true' } }).installed, false);
  // A developer's clone keeps its own hooks folder: a pull there never builds anybody's page with unmerged code.
  git(e.dir, 'config', 'core.hooksPath', '.githooks');
  assert.deepEqual(ensure(), { installed: false, why: 'its own hooks folder' });
  git(e.dir, 'config', '--unset', 'core.hooksPath');
  git(e.dir, 'checkout', '-q', '-b', 'work');
  assert.deepEqual(ensure(), { installed: false, why: 'not on main' });
  git(e.dir, 'checkout', '-q', 'main');
  writeFileSync(hook, '#!/bin/sh\necho mine\n');
  assert.deepEqual(ensure(), { installed: false, why: 'another post-merge hook' });
  assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\necho mine\n', 'left as it was');
});

test('pulling the engine runs the hook: a merge brought in by hand and the daily update alike', () => {
  // The remote engine carries a stand-in for known-pages.mjs that says it ran; the installed one is a clone of it.
  const remote = engineRepo();
  mkdirSync(join(remote.dir, 'lib'));
  writeFileSync(join(remote.dir, 'lib', 'known-pages.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('../ran.txt', import.meta.url), process.argv.slice(2).join(' '));\n");
  git(remote.dir, 'add', '-A'); git(remote.dir, 'commit', '-qm', 'lib');
  const installed = join(makeFixture({}), 'engine');
  git(remote.dir, 'clone', '-q', remote.dir, installed);
  assert.equal(ensureEngineHook(installed, { env: {}, run }).installed, true);
  writeFileSync(join(remote.dir, 'a.txt'), 'three\n'); git(remote.dir, 'commit', '-qam', 'three');
  git(installed, 'pull', '-q', '--ff-only', 'origin', 'main');
  assert.equal(existsSync(join(installed, 'ran.txt')) && readFileSync(join(installed, 'ran.txt'), 'utf8'), '--rebuild', 'the pull ran the rebuild');
});

test('a scratch copy in the system\'s temporary folders is never kept, whatever this process\'s own one is', () => {
  const file = join(makeFixture({}), 'pages.json');
  for (const root of ['/tmp/a-session/preview/proj', '/private/tmp/a-session/preview/proj']) assert.equal(rememberPage(root, { env: {}, file }), false, root);
});
