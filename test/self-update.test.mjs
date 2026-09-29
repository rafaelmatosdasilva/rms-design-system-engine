// The installed skill keeps itself current: once a day, only a clean install on main, never on CI or when
// turned off, and a failure changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { autoUpdate, updatedLine } from '../self-update.mjs';
import { makeFixture } from './helpers.mjs';

const ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' };
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...ENV }, encoding: 'utf8' }).trim();

// A remote with one commit on main, and an install cloned from it; then a new commit lands on the remote.
function setup() {
  const origin = makeFixture({ 'guide.md': 'v1\n' });
  git(origin, 'init', '-q', '-b', 'main'); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'v1');
  const install = join(makeFixture({}), 'skill');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin}`, install]);
  writeFileSync(join(origin, 'guide.md'), 'v2\n'); git(origin, 'commit', '-qam', 'v2');
  const stamp = join(makeFixture({}), 'stamp');
  return { origin, install, stamp, v2: git(origin, 'rev-parse', 'HEAD') };
}

test('a clean install on main is brought up to date, once a day', () => {
  const { install, stamp, v2 } = setup();
  const r = autoUpdate(install, { env: {}, stamp, now: 1e12 });
  assert.equal(r.updated, true);
  assert.equal(git(install, 'rev-parse', 'HEAD'), v2);
  assert.match(updatedLine(r), /^ℹ️  The parity skill updated itself \([0-9a-f]{7} → [0-9a-f]{7}\)\. Turn this off with PARITY_NO_AUTO_UPDATE=1\.$/);
  assert.deepEqual(autoUpdate(install, { env: {}, stamp, now: 1e12 + 3600e3 }), { updated: false, why: 'checked today' });
  assert.deepEqual(autoUpdate(install, { env: {}, stamp, now: 1e12 + 25 * 3600e3 }), { updated: false, why: 'already current' });
});

test('never with local changes, on another branch, on CI, or when turned off', () => {
  let { install, stamp } = setup();
  const head = git(install, 'rev-parse', 'HEAD');
  writeFileSync(join(install, 'guide.md'), 'my edit\n');
  assert.deepEqual(autoUpdate(install, { env: {}, stamp, now: 1e12 }), { updated: false, why: 'local changes' });
  assert.equal(git(install, 'rev-parse', 'HEAD'), head);

  ({ install, stamp } = setup());
  git(install, 'checkout', '-q', '-b', 'my-work');
  assert.deepEqual(autoUpdate(install, { env: {}, stamp, now: 1e12 }), { updated: false, why: 'not on main' });

  ({ install, stamp } = setup());
  assert.deepEqual(autoUpdate(install, { env: { CI: 'true' }, stamp, now: 1e12 }), { updated: false, why: 'CI' });
  assert.deepEqual(autoUpdate(install, { env: { PARITY_NO_AUTO_UPDATE: '1' }, stamp, now: 1e12 }), { updated: false, why: 'turned off' });
  assert.equal(existsSync(stamp), false);   // an off switch does not even count as a check
});

test('no remote or not a git checkout: nothing changes, the run goes on', () => {
  const { install, stamp } = setup();
  git(install, 'remote', 'set-url', 'origin', 'file:///nowhere/at/all');
  assert.deepEqual(autoUpdate(install, { env: {}, stamp, now: 1e12 }), { updated: false, why: 'pull failed' });
  const plain = makeFixture({ 'guide.md': 'x\n' });
  assert.equal(autoUpdate(plain, { env: {}, stamp: join(plain, 's'), now: 1e12 }).updated, false);
});
