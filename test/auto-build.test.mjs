// What a round of the watch runs (auto-build.mjs): only the steps the moved sources feed, never two rounds at once, the
// page published only when it changed, and one round now for a scheduler (--watch --once, --auto --once).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FEEDS, STEPS, WATCHED, stepsFor, storeChanges, whatMoved, recordOf, runRound, autoRound, takeLock, pageFingerprint, publishIfChanged, watchLines, localCode, LOCK, LOG, LAST_BUILD } from '../lib/auto-build.mjs';
import { makeWatch } from '../lib/watch.mjs';
import { builtFrom } from '../lib/guide-freshness.mjs';
import { tempDir, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const ids = STEPS.map((s) => s.id);

test('each source feeds its steps, written as data in one place', () => {
  assert.deepEqual(stepsFor([{ what: 'intentLayer' }]), ['outputs', 'build', 'publish'], 'the intent layer: the contracts, the design intent and the page, no gates');
  assert.deepEqual(stepsFor([{ what: 'the engine' }]), ['page', 'audit', 'build', 'publish'], 'the engine: everything');
  for (const what of ['Figma', 'the code', 'snapshots:design/snapshots', 'decisions', 'kept', 'the profile:design-system-engine-profile.json']) {
    assert.deepEqual(stepsFor([{ what }]), ['page', 'audit', 'build', 'publish'], `${what}: the audit and everything after`);
  }
  assert.deepEqual(stepsFor([{ what: 'themes' }]), ['build', 'publish'], 'the themes: the page only');
  assert.deepEqual(stepsFor([{ what: 'styleguide' }]), [], 'what a round publishes starts nothing');
  assert.deepEqual(stepsFor([{ what: 'something new' }]), ['page', 'audit', 'build', 'publish'], 'a source not listed: everything');
  assert.deepEqual(stepsFor([{ what: 'intentLayer' }, { what: 'Figma' }]), ['page', 'audit', 'build', 'publish'], 'the audit makes the contracts and the design intent itself');
  assert.deepEqual(stepsFor([{ what: 'intentLayer:specs' }, { what: 'themes' }]), ['outputs', 'build', 'publish']);
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

test('one round now: nothing moved, no build; one line in the log', async () => {
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

test('one round now: only the intent layer moved, only its steps run; published and recorded', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l2' } } });
  const r = await autoRound(root, h.deps);
  assert.equal(r.result, 'published');
  assert.deepEqual(h.ran, ['outputs', 'build'], 'no audit gates, which read only Figma and the code');
  assert.equal(h.pubs.length, 1);
  assert.equal(lastRecord(root).sources['intentLayer:specs'], 'l2');
  assert.match(logLines(root).at(-1), /moved: intentLayer:specs l1 → l2 · ran outputs, build, publish · \d+s · published$/);
  const again = harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l2' } } });
  assert.equal((await autoRound(root, again.deps)).result, 'nothing moved', 'the next round has nothing to do');
});

test('one round now: the engine moved, every step runs; the same page is not published', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, 'the engine': 'e2' } }, published: false });
  const r = await autoRound(root, h.deps);
  assert.deepEqual(h.ran, ['page', 'audit', 'build']);
  assert.equal(r.result, 'built');
  assert.match(r.line, /not published \(the page is the same as the one published\)$/);
  assert.equal(lastRecord(root).sources['the engine'], 'e2', 'recorded all the same');
});

test('one round now: no build recorded yet, the whole sequence', async () => {
  const root = tempDir('acme-auto-');
  const h = harness(root, { sources: { now: BASE } });
  const r = await autoRound(root, h.deps);
  assert.deepEqual(h.ran, ['page', 'audit', 'build']);
  assert.match(r.line, /no build recorded yet/);
  assert.deepEqual(lastRecord(root).sources, BASE);
});

test('one round now: differences the audit finds still build the page; a failed step is never published, and tried again', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const findings = harness(root, { sources: { now: { ...BASE, Figma: '101' } }, fail: { audit: 1 } });
  assert.equal((await autoRound(root, findings.deps)).result, 'published', 'exit 1 of the audit is differences found');
  record(root, BASE);
  const failing = harness(root, { sources: { now: { ...BASE, Figma: '101' } }, fail: { build: 1 } });
  const r = await autoRound(root, failing.deps);
  assert.equal(r.result, 'failed');
  assert.equal(failing.pubs.length, 0, 'never published');
  assert.deepEqual(lastRecord(root).sources, BASE, 'not recorded');
  assert.match(logLines(root).at(-1), /failed at the style guide \(exit 1\): not published, tried again next round$/);
  const retry = harness(root, { sources: { now: { ...BASE, Figma: '101' } } });
  await autoRound(root, retry.deps);
  assert.deepEqual(retry.ran, ['page', 'audit', 'build'], 'the next round tries again');
  const crashed = harness(root, { sources: { now: { ...BASE, Figma: '102' } }, fail: { audit: 2 } });
  assert.equal((await autoRound(root, crashed.deps)).result, 'failed', 'any other exit of the audit is a failure');
  const refused = harness(root, { sources: { now: { ...BASE, Figma: '103' } }, publishOk: false });
  assert.equal((await autoRound(root, refused.deps)).result, 'failed', 'a publish the store refused');
  assert.equal(lastRecord(root).sources.Figma, '101');
});

test('one round now: a round whose sources cannot be asked at all stops, says so, and lets the lock go', async () => {
  const root = tempDir('acme-auto-');
  const r = await autoRound(root, { readSources: async () => { throw new Error('offline'); }, run: () => assert.fail('no step'), publish: async () => assert.fail('no publish') });
  assert.equal(r.result, 'failed');
  assert.match(r.line, /the round stopped \(offline\)/);
  assert.ok(!existsSync(join(root, LOCK)));
});

test('one round now: a source that cannot be read starts no build', async () => {
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

test('the code as a checkout here: its commit is a source, and a branch of its own is never published', () => {
  const answers = { 'rev-parse HEAD': 'c0ffee', 'rev-parse --abbrev-ref HEAD': 'feature', 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main' };
  const git = (args) => answers[args.join(' ')] ?? null;
  assert.deepEqual(localCode('/x', git), { sha: 'c0ffee', branch: 'feature', main: 'main', mayPublish: false });
  answers['rev-parse --abbrev-ref HEAD'] = 'main';
  assert.equal(localCode('/x', git).mayPublish, true);
  assert.equal(localCode('/x', () => null), null, 'not a checkout');
});


test('the watch\'s own sources under their FEEDS names; the stores asked beside them, without the ones it checks itself', () => {
  assert.deepEqual(Object.values(WATCHED).map((w) => stepsFor([{ what: w }])), [
    ['page', 'audit', 'build', 'publish'], ['page', 'audit', 'build', 'publish'], ['outputs', 'build', 'publish'], ['page', 'audit', 'build', 'publish'],
  ]);
  const now = { 'snapshots:snapshots': 's2', 'themes:themes': 't2', 'decisions:decisions': null, 'the profile:p.json': 'p1', Figma: '9', 'the code': 'c2', styleguide: 'x2' };
  const base = { 'snapshots:snapshots': 's1', 'themes:themes': 't1', 'decisions:decisions': 'd1', 'the profile:p.json': 'p1', Figma: '8', 'the code': 'c1', styleguide: 'x1' };
  assert.deepEqual(storeChanges(now, base, { except: ['Figma', 'intentLayer', 'the engine', 'the code'] }).map((m) => m.what), ['snapshots:snapshots', 'themes:themes'], 'unread, own and published sources left out');
  assert.deepEqual(storeChanges(now, base, { except: ['Figma'] }).map((m) => m.what), ['snapshots:snapshots', 'themes:themes', 'the code'], 'a GitLab code mirror is asked with the stores');
});

test('a watch tick runs only what the moved sources feed, and publishes only a page that changed', async () => {
  const root = tempDir('acme-watch-');
  record(root, BASE);
  let codeSig = 'c1', body = 'Button', layerMoved = false, storesMoved = null, published = null;
  const ran = [], sent = [], records = [];
  const page = () => new Map([['index.html', Buffer.from(`<p>${body}</p><i>${new Date().toISOString()}</i>`)]]);
  const round = (moved) => runRound(root, {
    moved: moved.map((what) => ({ what })),
    readSources: async () => ({ ...BASE }),
    run: (step) => { ran.push(step.id); return { status: 0 }; },
    publish: () => publishIfChanged({ page: pageFingerprint(page()), there: published,
      send: async () => { sent.push(body); published = pageFingerprint(page()); return { ok: true, line: '📤 Style guide: 1 file pushed' }; },
      record: async () => { records.push(body); return { ok: true }; } }),
  });
  const w = makeWatch({
    code: () => codeSig, engine: () => 'e1',
    layer: async () => (layerMoved ? { changed: true, line: 'the intent layer has a new commit' } : { changed: false }),
    stores: async () => (storesMoved ? { changed: true, line: 'moved: themes', moved: storesMoved } : { changed: false }),
    build: async (reasons, moved) => { const r = await round(moved); return { ok: ['published', 'built'].includes(r.result), line: r.line }; },
    settleMs: 0, remoteEveryMs: 1000,
  });
  await w.tick(0);
  codeSig = 'c2'; await w.tick(10); const first = await w.tick(20);
  assert.deepEqual(first.moved, ['the code']);
  assert.deepEqual(ran, ['page', 'audit', 'build']);
  assert.deepEqual([sent, records], [['Button'], []], 'a page never published: sent');
  ran.length = 0; codeSig = 'c3'; await w.tick(30); await w.tick(40);
  assert.deepEqual([sent, records], [['Button'], ['Button']], 'built again, the same page: only its record');
  ran.length = 0; layerMoved = true; body = 'cardTile';
  const layer = await w.tick(2000);
  assert.deepEqual(layer.moved, ['intentLayer']);
  assert.deepEqual(ran, ['outputs', 'build'], 'the intent layer: no audit');
  assert.deepEqual(sent, ['Button', 'cardTile'], 'a page that changed: sent');
  ran.length = 0; layerMoved = false; storesMoved = ['themes:themes'];
  await w.tick(4000);
  assert.deepEqual(ran, ['build'], 'a store: only what it feeds');
  assert.match(logLines(root).at(-1), /moved: themes:themes · ran build, publish · \d+s · not published \(the page is the same as the one published\)$/);
});

test('a watch build that failed is tried again at the next check, for the same sources, never at every tick', async () => {
  let codeSig = 'a', ok = false;
  const builds = [];
  const w = makeWatch({ code: () => codeSig, engine: () => 'e', build: async (r, moved) => { builds.push(moved); return { ok }; }, settleMs: 0, remoteEveryMs: 1000 });
  await w.tick(0);
  codeSig = 'b'; await w.tick(1); await w.tick(2);
  assert.deepEqual(builds, [['the code']]);
  await w.tick(500);
  assert.equal(builds.length, 1, 'not at every tick');
  ok = true;
  const again = await w.tick(1100);
  assert.deepEqual([again.moved, builds.length], [['the code'], 2], 'at the next check');
  await w.tick(2200);
  assert.equal(builds.length, 2, 'built: nothing more');
});

test('--guide-status: whether the background watch is on, and what its last round did', async () => {
  const root = tempDir('acme-auto-');
  assert.deepEqual(watchLines(root, {}), ['🔁 No background watch for this folder: rms-design-system-engine --watch-install turns it on.']);
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, LOG), '10:00 👀 Watching\n');
  assert.equal(watchLines(root, {})[1], '   What it said last: 10:00 👀 Watching');
  record(root, BASE);
  await autoRound(root, harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l9' } } }).deps);
  const said = watchLines(root, { job: { file: '/h/Library/LaunchAgents/acme.plist' }, installed: true });
  assert.match(said[0], /The background watch is on for this folder \(\/h\/Library\/LaunchAgents\/acme\.plist\)/);
  assert.match(said[1], /Its last round, .*moved: intentLayer:specs l1 → l9 · ran outputs, build, publish · .* · published\.$/);
});

test('the commands: --watch --once and --auto --once, one round now, with nothing moved since the last build', { timeout: budget(60000) }, () => {
  const dir = tempDir('acme-proj-'), home = tempDir('acme-home-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), dir, { recursive: true });
  const engine = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ENGINE, encoding: 'utf8' }).stdout.trim();
  record(dir, engine ? { 'the engine': engine } : {});
  for (const args of [['--watch', '--once'], ['--auto', '--once']]) {
    const out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home, NO_COLOR: '1', FIGMA_TOKEN: '' } });
    assert.match(out, /🔁 \d{4}-\d{2}-\d{2} \d{2}:\d{2} nothing moved/, out);
  }
  assert.equal(logLines(dir).filter((l) => / nothing moved$/.test(l)).length, 2, 'one line a round in watch.log');
  assert.ok(!existsSync(join(dir, LOCK)));
});
