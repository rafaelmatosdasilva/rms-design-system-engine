// What a round of the watch runs (auto-build.mjs): only the steps the moved sources feed, never two rounds at once, the
// page published only when it changed, and one round now for a scheduler (--watch --once, --auto --once).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FEEDS, STEPS, WATCHED, roundLines, stepsFor, storeChanges, whatMoved, recordOf, runRound, autoRound, takeLock, pageFingerprint, publishIfChanged, localCode, LOCK, LOG, LAST_BUILD } from '../lib/auto-build.mjs';
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


test('a round\'s own sources under their FEEDS names; the stores asked beside them, without the ones it checks itself', () => {
  assert.deepEqual(Object.values(WATCHED).map((w) => stepsFor([{ what: w }])), [
    ['page', 'audit', 'build', 'publish'], ['page', 'audit', 'build', 'publish'], ['outputs', 'build', 'publish'], ['page', 'audit', 'build', 'publish'],
  ]);
  const now = { 'snapshots:snapshots': 's2', 'themes:themes': 't2', 'decisions:decisions': null, 'the profile:p.json': 'p1', Figma: '9', 'the code': 'c2', styleguide: 'x2' };
  const base = { 'snapshots:snapshots': 's1', 'themes:themes': 't1', 'decisions:decisions': 'd1', 'the profile:p.json': 'p1', Figma: '8', 'the code': 'c1', styleguide: 'x1' };
  assert.deepEqual(storeChanges(now, base, { except: ['Figma', 'intentLayer', 'the engine', 'the code'] }).map((m) => m.what), ['snapshots:snapshots', 'themes:themes'], 'unread, own and published sources left out');
  assert.deepEqual(storeChanges(now, base, { except: ['Figma'] }).map((m) => m.what), ['snapshots:snapshots', 'themes:themes', 'the code'], 'a GitLab code mirror is asked with the stores');
});

test('a round runs only what the moved sources feed, and publishes only a page that changed', async () => {
  const root = tempDir('acme-round-');
  record(root, BASE);
  let body = 'Button', published = null;
  const ran = [], sent = [], records = [];
  const page = () => new Map([['index.html', Buffer.from(`<p>${body}</p><i>${new Date().toISOString()}</i>`)]]);
  // A round for the sources given, as --auto runs one: the steps they feed, the publish, the record, its line in the log.
  const round = (moved) => runRound(root, {
    moved: moved.map((what) => ({ what })),
    readSources: async () => ({ ...BASE }),
    run: (step) => { ran.push(step.id); return { status: 0 }; },
    publish: () => publishIfChanged({ page: pageFingerprint(page()), there: published,
      send: async () => { sent.push(body); published = pageFingerprint(page()); return { ok: true, line: '📤 Style guide: published' }; },
      record: async () => { records.push(body); return { ok: true }; } }),
  });

  const first = await round(['the code']);
  assert.deepEqual(ran, ['page', 'audit', 'build'], 'the code: the steps it feeds, the publish being the deps\' own');
  assert.ok(['published', 'built'].includes(first.result), first.result);
  assert.deepEqual([sent, records], [['Button'], []], 'a page never published before: sent');

  ran.length = 0;
  await round(['the code']);
  assert.deepEqual([sent, records], [['Button'], ['Button']], 'built again, the same page: only its record');

  ran.length = 0; body = 'cardTile';
  await round(['intentLayer']);
  assert.deepEqual(ran, ['outputs', 'build'], 'the intent layer: no audit');
  assert.deepEqual(sent, ['Button', 'cardTile'], 'a page that changed: sent');

  ran.length = 0;
  await round(['themes:themes']);
  assert.deepEqual(ran, ['build'], 'a store: only what it feeds');
  assert.match(logLines(root).at(-1), /moved: themes:themes · ran build, publish · \d+s · not published \(the page is the one there\)/);
});

test('--guide-status says what this folder\'s last round did, and nothing about a watch', async () => {
  // Nothing rebuilds a style guide by itself any more, so there is no watch to report on - only what was last done.
  const root = tempDir('acme-round-said-');
  assert.deepEqual(roundLines(root), [], 'a folder with no round behind it says nothing');
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, LOG), '10:00 \u{1F440} a round\n');
  assert.equal(roundLines(root)[0], '\u{1F501} What the last round said: 10:00 \u{1F440} a round');
  record(root, BASE);
  await autoRound(root, harness(root, { sources: { now: { ...BASE, 'intentLayer:specs': 'l9' } } }).deps);
  const said = roundLines(root);
  assert.match(said[0], /Its last round, .*moved: intentLayer:specs l1 \u2192 l9 \u00b7 ran outputs, build, publish \u00b7 .* \u00b7 published\.$/);
  assert.ok(!said.some((l) => /watch/i.test(l)), 'no watch is offered, because none exists');
});

test('the commands: --watch --once and --auto --once, one round now, with nothing moved since the last build', { timeout: budget(60000) }, () => {
  const dir = tempDir('acme-proj-'), home = tempDir('acme-home-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), dir, { recursive: true });
  const engine = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ENGINE, encoding: 'utf8' }).stdout.trim();
  record(dir, engine ? { 'the engine': engine } : {});
  for (const args of [['--auto'], ['--auto', '--once']]) {
    const out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home, NO_COLOR: '1', FIGMA_TOKEN: '' } });
    assert.match(out, /🔁 \d{4}-\d{2}-\d{2} \d{2}:\d{2} nothing moved/, out);
  }
  assert.equal(logLines(dir).filter((l) => / nothing moved$/.test(l)).length, 2, 'one line a round in watch.log');
  assert.ok(!existsSync(join(dir, LOCK)));
});

test('a step still running past its limit is stopped with all it started, and the round says where; the next round tries again', async () => {
  const root = tempDir('acme-auto-');
  record(root, BASE);
  const h = harness(root, { sources: { now: { ...BASE, Figma: '101' } } });
  h.deps.run = (step) => { h.ran.push(step.id); return step.id === 'audit' ? { status: null, signal: 'SIGKILL', timedOut: 90 } : { status: 0 }; };
  const r = await autoRound(root, h.deps);
  assert.equal(r.result, 'failed');
  assert.deepEqual(h.ran, ['page', 'audit'], 'nothing after the step that was stopped');
  assert.equal(h.pubs.length, 0, 'never published');
  assert.deepEqual(lastRecord(root).sources, BASE, 'not recorded, so the next round builds again');
  assert.match(logLines(root).at(-1), /stopped at .+, still running after 90 min \(its browsers with it; the round's log says what it was on\): not published, tried again next round$/);
  // The watch's own runner: its limit from the setup, its process group stopped with it.
  const src = readFileSync(join(ENGINE, 'lib', 'audit.mjs'), 'utf8');
  assert.match(src, /const limitMin = Number\(cfg\.styleguide\?\.stepMinutes\) \|\| 90;/);
  assert.match(src, /timeout: limitMin \* 60e3, killSignal: 'SIGKILL', detached: true \}\);\n    if \(r\.error\?\.code !== 'ETIMEDOUT'\) return r;\n    try \{ process\.kill\(-r\.pid, 'SIGKILL'\); \}/);
});

test('the accessibility check stops a browser copy that runs past its limit, says what it was on, and leaves its parts', () => {
  const src = readFileSync(join(ENGINE, 'lib', 'a11y-check.mjs'), 'utf8');
  assert.match(src, /const wait = \(Number\(cfg\.a11y\?\.timeoutSec\) \|\| Math\.min\(LIMIT_CAP_SEC, Math\.max\(150, Math\.ceil\(open\.reduce\(\(s, t\) => s \+ share\(t\), 0\) \/ n\)\)\)\) \+ 120;/, 'its limit: its share, two minutes past');
  assert.match(src, /stdio: \['ignore', fd, fd\], detached: true \}\);/, 'what it prints kept, its browsers in its own group');
  assert.match(src, /setTimeout\(\(\) => \{ stopped\.push\(\{ i, said \}\); try \{ process\.kill\(-child\.pid, 'SIGKILL'\); \}/);
  assert.match(src, /was still checking after \$\{wait\}s: stopped, with every browser it started\. It was on: \$\{lastSaid\(x\.said\)\}\. Its parts are left for the page's own check\./);
});
