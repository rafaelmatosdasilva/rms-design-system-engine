// git-rebuild: the person's own style guide built again after each commit and each change pulled in, by the project's
// git hooks. Only where a page was built before, never on CI or with "hooks": false, an amend never twice; git goes on
// at once and two events close together are one build and then one more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pageOf, shouldRebuild, childEnv, startRebuild, rebuildLoop, quickBuild, startedText, LOCK, AGAIN, LOG } from '../lib/git-rebuild.mjs';
import { installGitHooks, gitHooksStatus } from '../lib/hooks-install.mjs';
import { makeFixture, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV = { ...process.env, CI: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const page = (dir, at = '.design-system-engine-out/styleguide/index.html') => { mkdirSync(dirname(join(dir, at)), { recursive: true }); writeFileSync(join(dir, at), '<html></html>'); };
// Waits for a build started on its own to let go of its lock, so no test leaves one running.
async function settled(dir, ms = budget(60000)) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (!existsSync(join(dir, LOCK)) && existsSync(join(dir, LOG))) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}

test('built again only where a page was built before: never unasked, never on CI, never with hooks off, an amend never twice', () => {
  const dir = makeFixture({ 'ds-config.json': {} });
  const ok = (o) => shouldRebuild(dir, { cfg: {}, env: {}, ...o });
  assert.deepEqual(ok({ event: 'commit' }), { ok: false, why: 'no page built here yet' });
  page(dir);
  assert.deepEqual(ok({ event: 'commit' }), { ok: true, why: null });
  assert.equal(ok({ event: 'merge' }).ok, true);
  assert.equal(ok({ event: 'rewrite', how: 'rebase' }).ok, true, 'a pull with rebase is a change pulled in');
  assert.equal(ok({ event: 'rewrite', how: 'amend' }).ok, false, 'an amend is a commit: its post-commit built it');
  assert.equal(ok({ event: 'commit', env: { CI: 'true' } }).ok, false);
  assert.equal(ok({ event: 'commit', cfg: { hooks: false } }).ok, false);
  assert.equal(ok({ event: 'push' }).ok, false);
  // The page where the project keeps it, as the build writes it.
  const own = makeFixture({});
  assert.equal(pageOf(own, { styleguide: { out: 'site/guide/index.html' } }), join(own, 'site/guide/index.html'));
  assert.equal(shouldRebuild(own, { event: 'commit', cfg: { styleguide: { out: 'site/guide/index.html' } }, env: {} }).ok, false);
  page(own, 'site/guide/index.html');
  assert.equal(shouldRebuild(own, { event: 'commit', cfg: { styleguide: { out: 'site/guide/index.html' } }, env: {} }).ok, true);
});

test('the build carries none of the places git sets inside a hook, and git never waits on it', () => {
  const env = childEnv({ PATH: '/bin', HOME: '/h', GIT_DIR: '/repo/.git', GIT_INDEX_FILE: '/repo/.git/index', GIT_WORK_TREE: '/repo', GIT_PREFIX: 'sub/', GIT_CONFIG_GLOBAL: '/dev/null' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h', GIT_CONFIG_GLOBAL: '/dev/null' });
  let seen = null, unref = false;
  const r = startRebuild('/repo', { script: '/engine/lib/audit.mjs', env: { PATH: '/bin', GIT_DIR: '/repo/.git' }, spawn: (cmd, args, opts) => { seen = { cmd, args, opts }; return { pid: 42, unref: () => { unref = true; } }; } });
  assert.deepEqual(r, { pid: 42 });
  assert.deepEqual(seen.args, ['/engine/lib/audit.mjs', '--git-rebuild', 'run']);
  assert.equal(seen.opts.detached, true, 'its own process: git goes on at once');
  assert.equal(seen.opts.stdio, 'ignore');
  assert.equal(seen.opts.cwd, '/repo');
  assert.deepEqual(seen.opts.env, { PATH: '/bin' });
  assert.equal(unref, true);
  assert.match(startedText(), /your local style guide is being built again/);
});

test('events close together are one build and then one more; one that finds a build running only leaves its mark', async () => {
  const dir = makeFixture({});
  // Alone: one build.
  let n = 0;
  assert.deepEqual(await rebuildLoop(dir, { build: () => { n++; } }), { ran: 1, queued: false });
  assert.equal(n, 1);
  assert.equal(existsSync(join(dir, LOCK)), false, 'the lock let go');
  // Another event while it builds: once more, never twice at once.
  n = 0;
  const r = await rebuildLoop(dir, { build: () => { n++; if (n === 1) writeFileSync(join(dir, AGAIN), 'x'); } });
  assert.deepEqual(r, { ran: 2, queued: false });
  assert.equal(existsSync(join(dir, AGAIN)), false);
  // A build running already: this one builds nothing and leaves its mark for it.
  n = 0;
  const busy = await rebuildLoop(dir, { build: () => { n++; }, take: () => ({ ok: false, pid: 1, at: '' }) });
  assert.deepEqual(busy, { ran: 0, queued: true });
  assert.equal(n, 0);
  assert.ok(existsSync(join(dir, AGAIN)));
  // A mark left the moment the one building let go is caught: it takes the lock again.
  n = 0;
  let takes = 0;
  const late = await rebuildLoop(dir, { build: () => { n++; }, take: () => { takes++; return { ok: true, release: () => { if (takes === 1) writeFileSync(join(dir, AGAIN), 'x'); } }; } });
  assert.deepEqual(late, { ran: 2, queued: false }, 'the first build answers the mark left before it; the one left as it let go, one more');
  // Events that never stop: a run builds a bounded number of times and leaves the rest to the next.
  n = 0;
  const flood = await rebuildLoop(dir, { build: () => { n++; writeFileSync(join(dir, AGAIN), 'x'); }, most: 3 });
  assert.deepEqual(flood, { ran: 3, queued: false });
});

test('one quick build: the engine\'s own, what it printed kept as the last build\'s log', () => {
  const dir = makeFixture({});
  let seen = null;
  const code = quickBuild(dir, { script: '/engine/lib/audit.mjs', env: { PATH: '/bin', GIT_INDEX_FILE: '/x' }, run: (cmd, args, opts) => { seen = { args, opts }; return { status: 0 }; } });
  assert.equal(code, 0);
  assert.deepEqual(seen.args, ['/engine/lib/audit.mjs', '--styleguide', '--quick'], 'the page for the person, never the team\'s: nothing sent, nothing published');
  assert.deepEqual(seen.opts.env, { PATH: '/bin' });
  assert.ok(existsSync(join(dir, LOG)));
});

test('installed as git hooks after a commit, a merge and a rebase; the checks\' hooks stay exactly as they were', () => {
  const dir = makeFixture({ 'ds-config.json': {} });
  git(dir, 'init', '-q', '-b', 'main');
  const r = installGitHooks(dir, { engineDir: ENGINE });
  assert.deepEqual(r.written, ['pre-commit', 'pre-push', 'post-commit', 'post-merge', 'post-rewrite']);
  const read = (name) => readFileSync(join(r.dir, name), 'utf8');
  for (const [name, event] of [['post-commit', 'commit'], ['post-merge', 'merge'], ['post-rewrite', 'rewrite']]) {
    assert.match(read(name), new RegExp(`--git-rebuild ${event}`));
    assert.match(read(name), /\nexit 0\n$/, `${name}: git is never stopped`);
    assert.doesNotMatch(read(name), /^exec /m);
  }
  assert.match(read('post-rewrite'), /--git-rebuild rewrite "\$1"/, 'git says whether it was an amend or a rebase');
  // The checks' hooks, as every project set up before has them: a project's next run rewrites nothing.
  const audit = `'${join(ENGINE, 'audit.mjs')}'`;
  assert.equal(read('pre-commit'), ['#!/bin/sh', '# rms-design-system-engine --git-check commit: warns about the design system\'s findings in what the change uses.', '# Written by rms-design-system-engine --install-hooks; --remove-hooks takes it out.', `[ -f ${audit} ] && command -v node >/dev/null 2>&1 || exit 0`, `node ${audit} --git-check commit`, 'exit 0', ''].join('\n'));
  assert.equal(read('pre-push'), ['#!/bin/sh', '# rms-design-system-engine --git-check push: refuses the design system\'s findings in what the change uses.', '# Written by rms-design-system-engine --install-hooks; --remove-hooks takes it out.', `[ -f ${audit} ] && command -v node >/dev/null 2>&1 || exit 0`, `exec node ${audit} --git-check push`, ''].join('\n'));
  // A post-commit of the project's own stays its own: the line to add is said.
  const other = makeFixture({ 'ds-config.json': {} });
  git(other, 'init', '-q', '-b', 'main');
  const hooks = join(other, '.git', 'hooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, 'post-commit'), '#!/bin/sh\necho done\n');
  const o = installGitHooks(other, { engineDir: ENGINE });
  assert.equal(readFileSync(join(hooks, 'post-commit'), 'utf8'), '#!/bin/sh\necho done\n');
  assert.match(o.kept.find((k) => k.name === 'post-commit').line, /^node '.*audit\.mjs' --git-rebuild commit$/);
  writeFileSync(join(hooks, 'post-commit'), `#!/bin/sh\n${o.kept[0].line}\necho done\n`);
  assert.equal(gitHooksStatus(other).hooks['post-commit'], 'added');
});

test('a commit builds the page again on its own and goes ahead at once; with no page, nothing', { timeout: budget(120000) }, async () => {
  const dir = makeFixture({ 'ds-config.json': {}, '.gitignore': '.design-system-engine-out/\n', 'a.txt': 'one\n' });
  git(dir, 'init', '-q', '-b', 'main');
  installGitHooks(dir, { engineDir: ENGINE });
  // No page built here yet: the commit says nothing of it and nothing is built.
  git(dir, 'add', '-A');
  const first = spawnSync('git', ['commit', '-q', '-m', 'one'], { cwd: dir, env: ENV, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.doesNotMatch(first.stderr, /style guide/);
  assert.equal(existsSync(join(dir, LOG)), false);
  // A page built once: each commit after builds it again, and the commit is not held for it.
  page(dir);
  writeFileSync(join(dir, 'a.txt'), 'two\n');
  git(dir, 'add', '-A');
  const second = spawnSync('git', ['commit', '-q', '-m', 'two'], { cwd: dir, env: ENV, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stderr, /your local style guide is being built again/);
  assert.ok(await settled(dir), 'the build ends on its own and lets go of its lock');
  assert.match(readFileSync(join(dir, LOG), 'utf8'), /A quick build/, 'the quick build ran: nothing sent, nothing published');
  assert.match(readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8'), /design-system-engine-build" content="quick"/, 'the page is the one the build wrote, marked as quick');
});

test('the command: an event outside a project passes, a wrong one says how it is used', () => {
  const run = (args, cwd) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd, env: ENV, encoding: 'utf8' });
  assert.equal(run(['--git-rebuild', 'commit'], makeFixture({})).status, 0, 'no project here: nothing to build');
  const bad = run(['--git-rebuild', 'push'], makeFixture({ 'ds-config.json': {} }));
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /--git-rebuild commit\|merge\|rewrite/);
});
