// The style guide kept up to date by itself on a person's computer (--auto): each round builds only when something
// moved, runs only the steps the moved sources feed, never two at once, and publishes only a page that changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FEEDS, STEPS, stepsFor, whatMoved, recordOf, autoRound, takeLock, pageFingerprint, plistOf, cronLineOf, install, uninstall, installed, autoLines, agentFile, localCode, LOCK, LOG, LAST_BUILD } from '../lib/auto-build.mjs';
import { builtFrom } from '../lib/guide-freshness.mjs';
import { tempDir, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const ids = STEPS.map((s) => s.id);

test('each source feeds its steps, written as data in one place', () => {
  assert.deepEqual(stepsFor([{ what: 'intentLayer' }]), ['outputs', 'build', 'check', 'publish'], 'the intent layer: the contracts, the design intent and the page, no gates');
  assert.deepEqual(stepsFor([{ what: 'the engine' }]), ['page', 'audit', 'build', 'check', 'publish'], 'the engine: everything');
  for (const what of ['Figma', 'the code', 'snapshots:design/snapshots', 'decisions', 'kept', 'the profile:design-system-engine-profile.json']) {
    assert.deepEqual(stepsFor([{ what }]), ['page', 'audit', 'build', 'check', 'publish'], `${what}: the audit and everything after`);
  }
  assert.deepEqual(stepsFor([{ what: 'themes' }]), ['build', 'check', 'publish'], 'the themes: the page only');
  assert.deepEqual(stepsFor([{ what: 'styleguide' }]), [], 'what a round publishes starts nothing');
  assert.deepEqual(stepsFor([{ what: 'something new' }]), ['page', 'audit', 'build', 'check', 'publish'], 'a source not listed: everything');
  assert.deepEqual(stepsFor([{ what: 'intentLayer' }, { what: 'Figma' }]), ['page', 'audit', 'build', 'check', 'publish'], 'the audit makes the contracts and the design intent itself');
  assert.deepEqual(stepsFor([{ what: 'intentLayer:specs' }, { what: 'themes' }]), ['outputs', 'build', 'check', 'publish']);
  for (const [what, steps] of Object.entries(FEEDS)) for (const s of steps) assert.ok(ids.includes(s), `${what} feeds a step there is (${s})`);
  assert.deepEqual(STEPS.find((s) => s.id === 'outputs').args, ['--outputs']);
  assert.deepEqual(STEPS.find((s) => s.id === 'check').args, ['--styleguide-check']);
  assert.ok(STEPS.filter((s) => s.args?.includes('--styleguide')).every((s) => s.args.includes('--no-publish')), 'a build step never publishes on its own');
});

test('what moved: a source that cannot be read is said, never built for; the record keeps what it last knew', () => {
  assert.equal(whatMoved({ a: '1' }, null).first, true);
  const m = whatMoved({ Figma: '2', 'the code': null, styleguide: 'x2', intentLayer: 'L' }, { sources: { Figma: '1', 'the code': 'c1', styleguide: 'x1', intentLayer: 'L' } });
  assert.deepEqual(m.moved.map((x) => x.what), ['Figma']);
  assert.deepEqual(m.unread, ['the code']);
  assert.deepEqual(recordOf({ Figma: '3', 'the code': null }, { Figma: '2', 'the code': null }, { sources: { 'the code': 'c1', gone: 'g' } }, { at: 'T' }), { at: 'T', sources: { 'the code': 'c1', gone: 'g', Figma: '3' } });
});

// A round with its sources and steps stubbed: what it ran, published and recorded.
function harness(root, { sources, fail = {}, publishOk = true, published = true } = {}) {
  const ran = [], pubs = [];
  const deps = {
    readSources: async () => ({ ...sources.now }),
    run: (step) => { ran.push(step.id); return { status: fail[step.id] ?? 0 }; },
    publish: async () => { pubs.push(1); return { ok: publishOk, published: publishOk && published, line: publishOk ? (published ? 'sent' : 'the page is the same as the one published') : 'the store refused it', page: 'fp1' }; },
  };
  return { ran, pubs, deps };
}
const record = (root, sources) => { mkdirSync(join(root, '.design-system-engine-out'), { recursive: true }); writeFileSync(join(root, LAST_BUILD), JSON.stringify({ at: '2026-01-01T00:00:00Z', sources })); };
const lastRecord = (root) => JSON.parse(readFileSync(join(root, LAST_BUILD), 'utf8'));
const logLines = (root) => readFileSync(join(root, LOG), 'utf8').trim().split('\n');
const BASE = { 'the engine': 'e1', 'intentLayer:specs': 'l1', Figma: '100', 'snapshots:snapshots': 's1' };

test('--auto --once: nothing moved, no build; one line in the log', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: BASE } });
  const r = await autoRound(root, h.deps);
  assert.equal(r.result, 'nothing moved');
  assert.deepEqual(h.ran, []);
  assert.equal(h.pubs.length, 0);
  assert.match(logLines(root).at(-1), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} nothing moved$/);
  assert.ok(!existsSync(join(root, LOCK)), 'the lock is let go');
});

test('--auto --once: only the intent layer moved, only its steps run; published and recorded', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l2' } } });
  const r = await autoRound(root, h.deps);
  assert.equal(r.result, 'published');
  assert.deepEqual(h.ran, ['outputs', 'build', 'check'], 'no audit gates, which read only Figma and the code');
  assert.equal(h.pubs.length, 1);
  assert.equal(lastRecord(root).sources['intentLayer:specs'], 'l2');
  assert.match(logLines(root).at(-1), /moved: intentLayer:specs l1 → l2 · ran outputs, build, check, publish · \d+s · published$/);
  const again = harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l2' } } });
  assert.equal((await autoRound(root, again.deps)).result, 'nothing moved', 'the next round has nothing to do');
});

test('--auto --once: the engine moved, every step runs; the same page is not published', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'the engine': 'e2' } }, published: false });
  const r = await autoRound(root, h.deps);
  assert.deepEqual(h.ran, ['page', 'audit', 'build', 'check']);
  assert.equal(r.result, 'built');
  assert.match(r.line, /not published \(the page is the same as the one published\)$/);
  assert.equal(lastRecord(root).sources['the engine'], 'e2', 'recorded all the same');
});

test('--auto --once: no build recorded yet, the whole sequence', async () => {
  const root = tempDir('acme-auto-');
  const h = harness(root, { sources: { now: BASE } });
  const r = await autoRound(root, h.deps);
  assert.deepEqual(h.ran, ['page', 'audit', 'build', 'check']);
  assert.match(r.line, /no build recorded yet/);
  assert.deepEqual(lastRecord(root).sources, BASE);
});

test('--auto --once: differences the audit finds still build the page; a failed step is never published, and tried again', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const findings = harness(root, { sources: { now: { ...BASE, Figma: '101' } }, fail: { audit: 1 } });
  assert.equal((await autoRound(root, findings.deps)).result, 'published', 'exit 1 of the audit is differences found');
  record(root, BASE);
  const failing = harness(root, { sources: { now: { ...BASE, Figma: '101' } }, fail: { check: 1 } });
  const r = await autoRound(root, failing.deps);
  assert.equal(r.result, 'failed');
  assert.equal(failing.pubs.length, 0, 'never published');
  assert.deepEqual(lastRecord(root).sources, BASE, 'not recorded');
  assert.match(logLines(root).at(-1), /failed at its check \(exit 1\): not published, tried again next round$/);
  const retry = harness(root, { sources: { now: { ...BASE, Figma: '101' } } });
  await autoRound(root, retry.deps);
  assert.deepEqual(retry.ran, ['page', 'audit', 'build', 'check'], 'the next round tries again');
  const crashed = harness(root, { sources: { now: { ...BASE, Figma: '102' } }, fail: { audit: 2 } });
  assert.equal((await autoRound(root, crashed.deps)).result, 'failed', 'any other exit of the audit is a failure');
  const refused = harness(root, { sources: { now: { ...BASE, Figma: '103' } }, publishOk: false });
  assert.equal((await autoRound(root, refused.deps)).result, 'failed', 'a publish the store refused');
  assert.equal(lastRecord(root).sources.Figma, '101');
});

test('--auto --once: a round whose sources cannot be asked at all stops, says so, and lets the lock go', async () => {
  const root = tempDir('acme-auto-');
  const r = await autoRound(root, { readSources: async () => { throw new Error('offline'); }, run: () => assert.fail('no step'), publish: async () => assert.fail('no publish') });
  assert.equal(r.result, 'failed');
  assert.match(r.line, /the round stopped \(offline\)/);
  assert.ok(!existsSync(join(root, LOCK)));
});

test('--auto --once: a source that cannot be read starts no build', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'snapshots:snapshots': null } } });
  const r = await autoRound(root, h.deps);
  assert.equal(r.result, 'nothing moved');
  assert.match(r.line, /not read: snapshots:snapshots/);
});

test('never two rounds at once: a lock held by a running process; one whose process is gone is taken over', async () => {
  const root = tempDir('acme-auto-');
  const file = join(root, LOCK);
  const a = takeLock(file, { pid: 111, alive: () => true });
  assert.equal(a.ok, true);
  const b = takeLock(file, { pid: 222, alive: () => true });
  assert.equal(b.ok, false);
  assert.equal(b.pid, 111);
  const h = harness(root, { sources: { now: BASE } });
  const r = await autoRound(root, { ...h.deps, lock: { alive: () => true } });
  assert.equal(r.result, 'busy');
  assert.deepEqual(h.ran, [], 'no build while another round runs');
  assert.match(logLines(root).at(-1), /a round is already running \(process 111/);
  const c = takeLock(file, { pid: 333, alive: () => false });
  assert.equal(c.ok, true, 'its process is gone');
  const d = takeLock(file, { pid: 444, alive: () => true, now: Date.now() + 7 * 3600e3 });
  assert.equal(d.ok, true, 'older than six hours');
  d.release();
  assert.ok(!existsSync(file));
});

test('the page compared without when or from which commit it was built', () => {
  const page = (at, sha, body) => new Map([
    ['index.html', Buffer.from(`<head><meta name="rms-design-system-engine-built" content="{&quot;engine&quot;:&quot;${sha}&quot;}"></head><body>${body}<script src="assets/x.data.${sha.slice(0, 10)}.js"></script></body>`)],
    [`assets/x.data.${sha.slice(0, 10)}.js`, Buffer.from(`self.SG_DATA={"builtAt":"${at}","built":{"code":"${sha}","engine":"${sha}","at":"${at}"},"name":"Acme"};`)],
    ['built-from.json', Buffer.from(at)],
  ]);
  const a = pageFingerprint(page('2026-11-01T10:00:00.000Z', 'aaaaaaaaaaaaaaaaaaaa', 'Button'));
  assert.equal(pageFingerprint(page('2026-11-02T11:30:12.345Z', 'bbbbbbbbbbbbbbbbbbbb', 'Button')), a, 'only when and from what');
  assert.notEqual(pageFingerprint(page('2026-11-01T10:00:00.000Z', 'aaaaaaaaaaaaaaaaaaaa', 'cardTile')), a, 'what it shows');
  assert.equal(builtFrom({ Figma: '1' }, { at: 'T', page: a }).page, a, 'kept in built-from.json beside the published page');
  assert.equal('page' in builtFrom({ Figma: '1' }, { at: 'T' }), false);
});

test('--auto --install: a LaunchAgent that runs one round every N minutes in the project, with PATH and no token', () => {
  const home = tempDir('acme-home-'), dir = '/projects/design-system';
  const r = install(dir, { home, platform: 'darwin', minutes: 15, node: '/usr/local/bin/node', engine: '/opt/engine', PATH: '/usr/bin:/bin' });
  assert.equal(r.file, agentFile(dir, home));
  assert.match(r.file, /Library\/LaunchAgents\/local\.rms-design-system-engine\.auto\.[0-9a-f]{10}\.plist$/);
  const xml = readFileSync(r.file, 'utf8');
  assert.match(xml, /<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/opt\/engine\/audit\.mjs<\/string>\s*<string>--auto<\/string>\s*<string>--once<\/string>/);
  assert.match(xml, /<key>WorkingDirectory<\/key>\s*<string>\/projects\/design-system<\/string>/);
  assert.match(xml, /<key>StartInterval<\/key>\s*<integer>900<\/integer>/);
  assert.match(xml, /<key>PATH<\/key>\s*<string>\/usr\/bin:\/bin<\/string>/);
  assert.doesNotMatch(xml, /TOKEN/);
  assert.ok(r.lines.some((l) => l.includes(`launchctl load -w '${r.file}'`)), 'the line for the person to run');
  assert.notEqual(agentFile('/projects/other', home), r.file, 'one per project folder');
  assert.deepEqual(installed(dir, { home, platform: 'darwin' }), { installed: true, how: r.file, minutes: 15 });
  assert.ok(uninstall(dir, { home, platform: 'darwin' }).some((l) => l.includes('launchctl unload -w')));
  assert.match(plistOf({ dir: '/a&b', node: 'n', engine: '/e', minutes: 5, PATH: '' }), /<string>\/a&amp;b<\/string>/);
});

test('--auto --install on Linux: the crontab line to add; --guide-status says it and what the last round did', async () => {
  const dir = '/projects/design-system';
  const line = cronLineOf({ dir, node: '/usr/bin/node', engine: '/opt/engine', minutes: 10, PATH: '/usr/bin' });
  assert.equal(line, "*/10 * * * * cd '/projects/design-system' && PATH='/usr/bin' '/usr/bin/node' '/opt/engine/audit.mjs' --auto --once >> '/projects/design-system/.design-system-engine-out/auto-agent.log' 2>&1   # rms-design-system-engine --auto");
  assert.match(cronLineOf({ dir, node: 'n', engine: '/e', minutes: 120 }), /^0 \*\/2 \* \* \* /);
  assert.ok(install(dir, { platform: 'linux', node: '/usr/bin/node', engine: '/opt/engine', PATH: '/usr/bin' }).lines.some((l) => l.includes(line)));
  assert.deepEqual(installed(dir, { platform: 'linux', crontab: () => `${line}\n` }), { installed: true, how: 'crontab', minutes: 10 });
  const root = tempDir('acme-auto-');
  assert.match(autoLines(root, dir, { platform: 'linux', crontab: () => '' })[0], /Not set to rebuild by itself on this computer: rms-design-system-engine --auto --install/);
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l9' } } });
  await autoRound(root, h.deps);
  const said = autoLines(root, dir, { platform: 'linux', crontab: () => line });
  assert.match(said[0], /Rebuilt by itself on this computer, every 10 min \(a crontab line\)/);
  assert.match(said[1], /Its last round, .*moved: intentLayer:specs l1 → l9 · ran outputs, build, check, publish · .* · published\.$/);
});

test('the code as a checkout here: its commit is a source, and a branch of its own is never published', () => {
  const answers = { 'rev-parse HEAD': 'c0ffee', 'rev-parse --abbrev-ref HEAD': 'feature', 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main' };
  const git = (args) => answers[args.join(' ')] ?? null;
  assert.deepEqual(localCode('/x', git), { sha: 'c0ffee', branch: 'feature', main: 'main', mayPublish: false });
  answers['rev-parse --abbrev-ref HEAD'] = 'main';
  assert.equal(localCode('/x', git).mayPublish, true);
  assert.equal(localCode('/x', () => null), null, 'not a checkout');
});

test('the command: --auto --install writes the agent into the home it is given and loads nothing', { timeout: budget(60000) }, () => {
  const home = tempDir('acme-home-'), dir = tempDir('acme-proj-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), dir, { recursive: true });
  const out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--auto', '--install', '20'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home, GITLAB_TOKEN: 'secret-acme' } });
  if (process.platform === 'darwin') {
    const file = agentFile(realpathSync(dir), home);
    assert.ok(existsSync(file), out);
    const xml = readFileSync(file, 'utf8');
    assert.match(xml, /<integer>1200<\/integer>/);
    assert.ok(xml.includes(`<string>${join(ENGINE, 'audit.mjs')}</string>`), 'the engine\'s own entry, as people\'s setups name it');
    assert.doesNotMatch(xml, /secret-acme/);
    assert.match(out, /launchctl load -w/);
    assert.match(out, /NEXT: .*never run it for them/);
  } else {
    assert.match(out, /--auto --once/);
  }
});
