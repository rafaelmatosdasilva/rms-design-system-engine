// The background watch on by default (watch-default.mjs): installed by the engine itself, once, at the end of setup and
// on an ordinary run where it is missing; never on CI, never twice, a failure said once, turning it off sticks, and
// styleguide.watch: false (by hand or from a team's profile) takes away the one the engine turned on.
// Every case has a temporary HOME of its own and a stubbed runner: launchd and systemd are never asked anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ensureWatch, turnedOff, turnedOn, readChoice, RECORD, ON_LINE } from '../lib/watch-default.mjs';
import { jobFor, isInstalled } from '../lib/watch.mjs';
import { applyProfile } from '../lib/profile.mjs';
import { tempDir } from './helpers.mjs';

const platform = process.platform === 'linux' ? 'linux' : 'darwin';
// A project and a home of its own, which the case treats as this computer user's own (realHome), with a runner that
// only counts what it is asked. tmp: null, so the project's temporary folder is not taken for one.
function setup({ status = 0 } = {}) {
  const ROOT = tempDir('wd-project-'), home = tempDir('wd-home-'), engineDir = tempDir('wd-engine-');
  const calls = [];
  const run = (argv) => { calls.push(argv); return { status, stdout: '', stderr: status ? 'Bootstrap failed: 5: Input/output error' : '' }; };
  const job = jobFor({ ROOT, engineDir, platform, home, node: '/usr/local/bin/node', uid: 501 });
  const opts = (more = {}) => ({ env: {}, home, realHome: home, platform, engineDir, run, tmp: null, ...more });
  return { ROOT, home, calls, run, job, opts };
}
const starts = (calls, job) => calls.filter((a) => a.join(' ') === job.start.join(' ')).length;

test('first setup ends with the watch installed: one line, started once', () => {
  const s = setup();
  const r = ensureWatch(s.ROOT, {}, s.opts());   // what setup's last step calls with the config it just wrote
  assert.equal(r.on, true);
  assert.deepEqual(r.lines, [ON_LINE]);
  assert.match(ON_LINE, /rebuilds itself on this computer when anything it's built from changes \(only what changed\)\. Turn it off: rms-design-system-engine --watch-uninstall \(or styleguide\.watch: false\)/);
  assert.ok(isInstalled(s.job));
  assert.equal(starts(s.calls, s.job), 1);
  assert.ok(readChoice(s.home, s.ROOT).auto, 'remembered as turned on by the engine');
});

test('an ordinary run installs it when it is missing, and never twice', () => {
  const s = setup();
  const cfg = { styleguide: { watch: true } };
  assert.deepEqual(ensureWatch(s.ROOT, cfg, s.opts()).lines, [ON_LINE]);
  const again = ensureWatch(s.ROOT, cfg, s.opts());
  assert.deepEqual(again, { on: true, lines: [] }, 'already on: nothing said, nothing asked');
  ensureWatch(s.ROOT, cfg, s.opts());
  assert.equal(starts(s.calls, s.job), 1);
});

test('never on CI, in a test, in the watch\'s own round, offline, with a borrowed home, in a temporary folder or from a worktree', () => {
  const s = setup();
  const cases = [
    [{ env: { CI: 'true' } }, /CI run/],
    [{ env: { NODE_TEST_CONTEXT: 'child-v8' } }, /test run/],
    [{ env: { DESIGN_SYSTEM_ENGINE_WATCH_ROUND: '1' } }, /watch's own run/],
    [{ offline: true }, /offline/],
    [{ realHome: tempDir('wd-real-') }, /home is not this computer user's own/],
    [{ tmp: s.ROOT }, /temporary folder/],
  ];
  for (const [more, why] of cases) {
    const r = ensureWatch(s.ROOT, {}, s.opts(more));
    assert.equal(r.on, false); assert.match(r.why, why); assert.deepEqual(r.lines, []);
  }
  const wt = tempDir('wd-worktree-');
  writeFileSync(join(wt, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n');
  assert.match(ensureWatch(s.ROOT, {}, s.opts({ engineDir: wt, job: s.job })).why, /git worktree/);
  assert.equal(s.calls.length, 0, 'launchctl or systemctl never asked');
  assert.ok(!isInstalled(s.job), 'nothing written');
});

test('a failed install is said once with its reason, and not tried again on every run', () => {
  const s = setup({ status: 5 });
  const r = ensureWatch(s.ROOT, {}, s.opts());
  assert.equal(r.on, false);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /could not start rebuilding itself on this computer: Bootstrap failed: 5: Input\/output error\. It is not tried again on every run; rms-design-system-engine --watch-install tries again\./);
  assert.ok(!isInstalled(s.job), 'its file taken away, so it is never taken for on');
  assert.ok(JSON.parse(readFileSync(join(s.ROOT, RECORD), 'utf8')).failed.reason, 'kept in the output folder');
  const later = ensureWatch(s.ROOT, {}, s.opts());
  assert.deepEqual(later.lines, []);
  assert.match(later.why, /could not be turned on \(Bootstrap failed/);
  assert.equal(starts(s.calls, s.job), 1, 'tried once');
  turnedOn(s.ROOT, { home: s.home });   // --watch-install
  assert.ok(!JSON.parse(readFileSync(join(s.ROOT, RECORD), 'utf8')).failed, 'a hand install forgets the failure');
});

test('a computer with no background job is told once how to rebuild by hand', () => {
  const s = setup();
  const o = s.opts({ platform: 'win32', job: null });
  const r = ensureWatch(s.ROOT, {}, o);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /can't rebuild itself in the background here: .*win32.*--styleguide.*--watch running in a terminal/);
  assert.deepEqual(ensureWatch(s.ROOT, {}, o).lines, [], 'said once');
});

test('turning it off sticks: no later run installs it again, until --watch-install', () => {
  const s = setup();
  ensureWatch(s.ROOT, {}, s.opts());
  turnedOff(s.ROOT, { home: s.home });   // --watch-uninstall records it, then takes the job away
  unlinkSync(s.job.file);
  const r = ensureWatch(s.ROOT, {}, s.opts());
  assert.equal(r.on, false); assert.deepEqual(r.lines, []);
  assert.match(r.why, /you turned it off for this folder/);
  assert.equal(starts(s.calls, s.job), 1);
  turnedOn(s.ROOT, { home: s.home });
  assert.deepEqual(ensureWatch(s.ROOT, {}, s.opts()).lines, [ON_LINE], 'turned back on by hand: the default applies again');
});

test('styleguide.watch: false takes away the one the engine turned on, and leaves one installed by hand', () => {
  const s = setup();
  ensureWatch(s.ROOT, {}, s.opts());
  const r = ensureWatch(s.ROOT, { styleguide: { watch: false } }, s.opts());
  assert.equal(r.on, false);
  assert.match(r.lines[0], /styleguide\.watch is false in ds-config\.json: the background watch the engine had turned on for this folder is off now/);
  assert.ok(!isInstalled(s.job));
  assert.ok(s.calls.some((a) => a.join(' ') === s.job.stop.join(' ')), 'stopped');
  assert.deepEqual(ensureWatch(s.ROOT, { styleguide: { watch: false } }, s.opts()).lines, [], 'said once');
  // Installed by hand (--watch-install): the person's own choice stays.
  mkdirSync(join(s.job.file, '..'), { recursive: true }); writeFileSync(s.job.file, s.job.text); turnedOn(s.ROOT, { home: s.home });
  const hand = ensureWatch(s.ROOT, { styleguide: { watch: false } }, s.opts());
  assert.equal(hand.on, true); assert.deepEqual(hand.lines, []); assert.ok(isInstalled(s.job));
});

test('a team\'s profile that sets styleguide.watch: false applies to every member', () => {
  const s = setup();
  const cfg = applyProfile({ styleguide: { out: 'site/index.html' } }, { profile: 1, config: { styleguide: { watch: false } } }, { source: 'p.json', sha: 'a1', now: '2026-11-02' });
  assert.equal(cfg.styleguide.watch, false); assert.equal(cfg.styleguide.out, 'site/index.html', 'the member\'s own keys stay');
  const r = ensureWatch(s.ROOT, cfg, s.opts());
  assert.equal(r.on, false); assert.match(r.why, /styleguide\.watch is false/);
  assert.equal(s.calls.length, 0); assert.ok(!isInstalled(s.job));
  // Turned on by default before the profile said so: taken away on the next run.
  const t = setup();
  ensureWatch(t.ROOT, {}, t.opts());
  assert.match(ensureWatch(t.ROOT, cfg, t.opts()).lines[0], /is off now/);
  assert.ok(!isInstalled(t.job));
});

test('dry: only says, changes nothing', () => {
  const s = setup();
  const r = ensureWatch(s.ROOT, {}, s.opts({ dry: true }));
  assert.equal(r.on, false); assert.match(r.why, /next run turns it on/);
  assert.equal(s.calls.length, 0); assert.ok(!existsSync(join(s.ROOT, RECORD)));
});
