// The Status page's numbers kept per release (health-history.mjs): each release keeps the numbers measured from the
// newer inputs, work not released yet becomes its release's once tagged, two copies merge entry by entry, history fills
// what was never kept, and the page shows each card's trend beside today's number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordHealth, mergeHealth, trendOf, withHealth, healthIn, backfillHealth, pagesAtReleases, releaseFinder, parseHealth, healthText, HEALTH_FILE, HEALTH_ID, UNRELEASED } from '../health-history.mjs';
import { fixtureProject, budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
// Stamps ordered by Figma's version alone (no git needed): a higher version is newer.
const stamp = (figma) => ({ code: null, figma, figmaRead: null, engine: null, at: '2026-10-29T10:00:00Z' });
const vals = (p) => ({ Parity: p, Code: 50, Accessibility: 60, Documentation: 20, 'AI readiness': 10 });

test('a run\'s numbers go to its release; work not released yet becomes its release\'s once tagged', () => {
  const tags = { aaa: 'v1.0.0', bbb: null, ccc: null };
  const releaseOf = (sha) => tags[sha] ?? null;
  let r = recordHealth(null, { values: vals(40), code: 'aaa', built: stamp('5'), at: '2026-10-01T00:00:00Z' }, { releaseOf });
  assert.equal(r.key, 'v1.0.0');
  r = recordHealth(r.record, { values: vals(55), code: 'bbb', built: stamp('6'), at: '2026-10-10T00:00:00Z' }, { releaseOf });
  assert.equal(r.key, UNRELEASED, 'after the last tag: the next release\'s');
  assert.deepEqual(Object.keys(r.record.releases).sort(), ['unreleased', 'v1.0.0']);
  // The tag v1.1.0 now holds bbb; the next run, on later work, moves bbb's numbers to v1.1.0 first.
  tags.bbb = 'v1.1.0';
  r = recordHealth(r.record, { values: vals(61), code: 'ccc', built: stamp('7'), at: '2026-10-20T00:00:00Z' }, { releaseOf });
  assert.equal(r.record.releases['v1.1.0'].values.Parity, 55, 'measured before its tag: that release\'s');
  assert.equal(r.record.releases.unreleased.values.Parity, 61);
  assert.equal(r.record.releases['v1.0.0'].values.Parity, 40);
});

test('a release keeps the numbers measured from the newer inputs; a number not measured keeps the one it had', () => {
  const releaseOf = () => 'v2.0.0';
  const first = recordHealth(null, { values: vals(70), code: 'x', built: stamp('9') }, { releaseOf }).record;
  const older = recordHealth(first, { values: vals(10), code: 'x', built: stamp('8') }, { releaseOf });
  assert.equal(older.kept, true, 'an older run never replaces what newer inputs measured');
  assert.equal(older.record.releases['v2.0.0'].values.Parity, 70);
  const partial = recordHealth(first, { values: { ...vals(75), Accessibility: null }, code: 'x', built: stamp('10') }, { releaseOf }).record;
  assert.equal(partial.releases['v2.0.0'].values.Parity, 75);
  assert.equal(partial.releases['v2.0.0'].values.Accessibility, 60, 'accessibility not tried everywhere this time: the release keeps its last');
  assert.equal(recordHealth(first, { values: {}, code: 'x' }, { releaseOf }).record.releases['v2.0.0'].values.Parity, 70, 'nothing measured, nothing changed');
});

test('two copies merge entry by entry: every release either holds, the newer inputs\' numbers where both do', () => {
  const a = { releases: { 'v1.0.0': { at: '1', built: stamp('5'), values: { Parity: 10 } }, 'v1.1.0': { at: '2', built: stamp('7'), values: { Parity: 30 } } } };
  const b = { releases: { 'v1.1.0': { at: '3', built: stamp('6'), values: { Parity: 20 } }, 'v1.2.0': { at: '4', built: stamp('8'), values: { Parity: 40 } } } };
  const m = mergeHealth(a, healthText(parseHealth(b)));
  assert.deepEqual(Object.keys(m.releases).sort(), ['v1.0.0', 'v1.1.0', 'v1.2.0']);
  assert.equal(m.releases['v1.1.0'].values.Parity, 30, 'Figma version 7 is newer than 6');
  // No stamps to order them: the later one.
  const loose = mergeHealth({ releases: { 'v1.0.0': { at: '2026-01-01', values: { Parity: 1 } } } }, { releases: { 'v1.0.0': { at: '2026-02-01', values: { Parity: 2 } } } });
  assert.equal(loose.releases['v1.0.0'].values.Parity, 2);
  assert.deepEqual(parseHealth('not json'), { version: 1, releases: {} });
});

test('the trend: past releases oldest first, today\'s release and the work after it left out', () => {
  const rec = { releases: { 'v1.10.0': { values: { Parity: 50 } }, 'v1.2.0': { values: { Parity: 20 } }, 'v1.9.0': { values: { Parity: 40 } }, unreleased: { values: { Parity: 60 } } } };
  assert.deepEqual(trendOf(rec).past.map((p) => p.release), ['v1.2.0', 'v1.9.0', 'v1.10.0'], 'by version, not by text');
  assert.deepEqual(trendOf(rec, 'v1.9.0').past.map((p) => p.release), ['v1.2.0'], 'built at v1.9.0: only the releases before it');
  assert.equal(trendOf(rec).kept.releases.unreleased.values.Parity, 60, 'the page carries the whole record');
  assert.deepEqual(trendOf(null).past, []);
});

test('the record in the page: once, after its data, never closing its script; pages kept in history fill the record', () => {
  const page = '<script type="application/json" id="sg-data">{}</script><script>run()</script>';
  const one = withHealth(page, trendOf({ releases: { 'v1.0.0': { values: { Parity: 12 } } } }));
  const two = withHealth(one, { past: [], kept: { releases: { 'v0.1.0': { values: { Parity: 1, Code: '</script>' } } } } });
  assert.match(one, new RegExp(`id="sg-data">\\{\\}</script><script id="${HEALTH_ID}" type="application/json">`));
  assert.equal(two.split(HEALTH_ID).length, 2, 'replaced, never added twice');
  assert.equal(two.match(/<\/script>/g).length, 3, 'a value never closes the tag');
  assert.equal(healthIn(one).past[0].values.Parity, 12);
  assert.equal(healthIn('<p>no record</p>'), null);
  const filled = backfillHealth({ releases: { 'v1.1.0': { values: { Parity: 30 } } } }, [one, '<p>an older page</p>']);
  assert.deepEqual(Object.keys(filled.releases).sort(), ['v1.0.0', 'v1.1.0']);
});

test('history: the pages the project committed at its release tags give the releases never kept', () => {
  const dir = tempDir('hh-git-');
  const git = (...a) => spawnSync('git', ['-c', 'user.email=qa@example.com', '-c', 'user.name=QA', ...a], { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(dir, 'guide'), { recursive: true });
  writeFileSync(join(dir, 'guide', 'index.html'), withHealth('<script id="sg-data" type="application/json">{}</script>', trendOf({ releases: { 'v0.9.0': { values: { Parity: 5 } } } })));
  git('add', '-A'); git('commit', '-qm', 'Acme guide'); git('tag', 'v0.9.0');
  writeFileSync(join(dir, 'guide', 'index.html'), withHealth('<script id="sg-data" type="application/json">{}</script>', trendOf({ releases: { 'v0.9.0': { values: { Parity: 5 } }, 'v1.0.0': { values: { Parity: 15 } } } })));
  git('add', '-A'); git('commit', '-qm', 'cardTile'); git('tag', 'v1.0.0');
  const sha = git('rev-parse', 'HEAD~1').stdout.trim();
  writeFileSync(join(dir, 'later.txt'), 'x'); git('add', '-A'); git('commit', '-qm', 'later');
  const pages = pagesAtReleases(dir, 'guide/index.html', ['v1.0.0', 'v0.9.0'], { releases: { 'v0.9.0': { values: { Parity: 5 } } } });
  assert.equal(pages.length, 1, 'only the releases the record lacks are read');
  assert.equal(backfillHealth({}, pages).releases['v1.0.0'].values.Parity, 15);
  assert.deepEqual(pagesAtReleases(dir, '../elsewhere.html', ['v1.0.0']), [], 'only a page inside the project');
  // Which release a commit belongs to: the release log first, else the first tag that holds it.
  const find = releaseFinder(dir, [{ release: null, commits: [{ sha: 'abc' }] }]);
  assert.equal(find('abc'), null, 'in the log, not released yet');
  assert.equal(find(sha), 'v0.9.0');
  assert.equal(find(git('rev-parse', 'HEAD').stdout.trim()), null, 'after the last tag');
});

test('Status: each card shows its number at every past release beside today\'s, the change in words; the build keeps today\'s', { timeout: budget(400000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'hh-sg-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p))); }
  const page = join(dir, '.design-system-engine-out/styleguide/index.html');
  const build = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const open = async () => {
      const { sessionId } = await openPage(send, `file://${page}#status`);
      await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
      return async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    };
    // Nothing kept yet: today's number alone, and the trend starts now.
    let r = build('--no-a11y-bake');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(existsSync(join(dir, HEALTH_FILE)), false, 'nothing measured in a browser, nothing kept');
    let run = await open();
    assert.match(await run(`document.querySelector('#status .sg-health-tile [data-trend="Parity"]').textContent`), /^The trend starts now: each release keeps this number\.$/);
    // Two releases kept: each card says the change since the last and every value, oldest first, today's last.
    writeFileSync(join(dir, HEALTH_FILE), healthText({ releases: { 'v0.9.0': { at: '2026-09-01T00:00:00Z', values: { Parity: 0, Code: 1, Accessibility: 2, Documentation: 3, 'AI readiness': 0 } }, 'v1.0.0': { at: '2026-10-01T00:00:00Z', values: { Parity: 1, Code: 100, Accessibility: 4, Documentation: 5, 'AI readiness': 0 } } } }));
    r = build();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /📈 The Status page's numbers kept for the next release \(Parity \d+%, Code \d+%.*\) in health-history\.snapshot\.json: each card shows them beside 2 earlier releases\./);
    const kept = JSON.parse(readFileSync(join(dir, HEALTH_FILE), 'utf8'));
    assert.deepEqual(Object.keys(kept.releases), ['v0.9.0', 'v1.0.0', 'unreleased'], 'today\'s kept for the next release');
    run = await open();
    const now = await run(`window.__sgHealthNow()`);
    assert.deepEqual(Object.keys(now).filter((k) => typeof now[k] === 'number'), Object.keys(kept.releases.unreleased.values), 'the numbers kept are the cards\' own');
    const cards = await run(`[...document.querySelectorAll('#status .sg-health-tile')].map((t) => { const tr = t.querySelector('.sg-health-trend'); return [t.querySelector('.sg-health-label').textContent, t.querySelector('.sg-health-num').textContent, tr ? (tr.querySelector('.sg-health-change') || {}).textContent || '' : null, tr ? [...tr.querySelectorAll('.sg-health-past li')].map((li) => li.textContent) : null, tr ? tr.querySelector('.sg-health-past').getAttribute('aria-label') : null, !!(tr && tr.querySelector('svg.sg-health-spark[aria-hidden="true"]'))]; })`);
    const parity = cards.find((x) => x[0] === 'Parity'), code = cards.find((x) => x[0] === 'Code');
    const p = now.Parity;
    assert.equal(parity[2], p > 1 ? `Up ${p - 1} points since v1.0.0` : p === 1 ? 'No change since v1.0.0' : 'Down 1 point since v1.0.0', 'the change since the last release, in words');
    assert.deepEqual(parity[3], ['v0.9.0 0%', 'v1.0.0 1%', `Today ${p}%`], 'every value written out with its release, oldest first');
    assert.equal(parity[4], 'Parity at each release, oldest first');
    assert.equal(parity[5], true, 'the line beside the values, hidden from a screen reader');
    assert.match(code[2], /^Down \d+ points since v1\.0\.0$/);
    // AI readiness: a card of its own, under the four, with its trend.
    const ai = cards.find((x) => x[0] === 'AI readiness');
    if (ai) assert.deepEqual(ai[3].slice(0, 2), ['v0.9.0 0%', 'v1.0.0 0%']);
    assert.equal(await run(`!!document.querySelector('#status .sg-health-tile.is-wide')`), !!ai);
    // The page carries the record, so a page kept in history gives it back.
    assert.ok(healthIn(readFileSync(page, 'utf8')).kept.releases.unreleased, 'the page carries the record with today\'s numbers');
    assert.equal(await run(`document.querySelectorAll('#status .sg-health-box table').length`), 0, 'the trend is in the cards: the page keeps its one table');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
