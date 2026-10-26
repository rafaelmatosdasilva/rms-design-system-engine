// The style guide's accessibility, tried while the page is built and kept in it (styleguide-bake.mjs): the results go
// in once, replace an earlier build's, and never close the page's own script early.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBaked, withoutBaked, BAKED_ID, ageOpen, withOpenSince, OPEN_ID, savedFor } from '../styleguide-bake.mjs';
import { budget } from './helpers.mjs';

test('the results are kept in the page right after its data, before its script reads them; an earlier build\'s replaced', () => {
  const page = '<html><body><main></main><script type="application/json" id="sg-data">{}</script><script>var x = 1;</script></body></html>';
  const one = withBaked(page, { at: 't1', results: { chip: { sig: 'a', live: { tried: 4 }, items: [] } } });
  assert.match(one, new RegExp(`id="sg-data">\\{\\}</script><script id="${BAKED_ID}" type="application/json">\\{"at":"t1".*</script><script>var x = 1;</script></body></html>$`));
  // A page with no data of its own: before its first script.
  assert.match(withBaked('<body><script>go()</script></body>', { at: 't', results: {} }), new RegExp(`^<body><script id="${BAKED_ID}"[^>]*>.*</script><script>go\\(\\)</script></body>$`));
  const two = withBaked(one, { at: 't2', results: {} });
  assert.equal(two.split(BAKED_ID).length, 2, 'one set of results, never two');
  assert.match(two, /"at":"t2"/);
  assert.equal(withoutBaked(two), page, 'taken out, the page is as it was built');
});

test('what a component holds never closes the script it is kept in', () => {
  const out = withBaked('<body></body>', { at: 't', results: { x: { items: [{ html: '</script><img src=x onerror=alert(1)>' }] } } });
  assert.equal(out.match(/<\/script>/g).length, 1);
  assert.equal(JSON.parse(out.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]).results.x.items[0].html, '</script><img src=x onerror=alert(1)>');
});

test('a page whose script stops is said at once, never waited out for an hour', { timeout: budget(120000) }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  if (!findChrome({ playwright: true }) || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { bakeA11y } = await import('../styleguide-bake.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'sg-dead-'));
  try {
    const file = join(dir, 'index.html');
    writeFileSync(file, '<html><body><script type="application/json" id="sg-data">{"components":[{"name":"chip"}]}</script><script>rows.push(1); window.__sgA11yResults = function () { return {}; };</script></body></html>');
    const t0 = Date.now();
    const r = await bakeA11y(file, { jobs: 1, timeoutMs: 60 * 60 * 1000 });
    assert.equal(r.dead, true, JSON.stringify(r));
    assert.ok(Date.now() - t0 < 60000, 'said within a minute');
    assert.match(r.errors.join(), /rows is not defined/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('saved results go into the page before it tries anything, so it tries only what changed; they come back with the new ones', { timeout: budget(120000) }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  if (!findChrome({ playwright: true }) || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { bakeA11y, readSaved, RESULTS_FILE } = await import('../styleguide-bake.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'sg-saved-'));
  try {
    const file = join(dir, 'index.html');
    // A page with two themes (the default one and a brand, Acme Retail) that keeps what it was given for the theme it is opened
    // in and tries only the component it has no result for there.
    writeFileSync(file, '<html><body><script type="application/json" id="sg-data">{"components":[{"name":"chip"},{"name":"tag"}],"brands":{"list":[{"key":"acme"},{"key":"retail","parent":"acme"}]}}</script><script>var th = new URLSearchParams(location.search).get("brand") || "default", b = JSON.parse((document.getElementById("sg-a11y-baked") || {}).textContent || "null"), r = (b && b.themes && b.themes[th]) || {}; r.tag = { sig: "t1-" + th, live: { tried: 1 }, items: [] }; window.__sgA11yResults = function () { return r; }; window.__sgSweepDone = true;</script></body></html>');
    const saved = { default: { chip: { sig: 'c1', live: { tried: 3 }, items: [] } } };
    const r = await bakeA11y(file, { jobs: 1, saved });
    assert.deepEqual(r.themeList, ['default', 'retail'], 'the default theme, and each brand that is not only the base of others');
    assert.equal(r.reused, 1, JSON.stringify(r));
    assert.deepEqual(Object.keys(r.themes.default).sort(), ['chip', 'tag']);
    assert.deepEqual(Object.keys(r.themes.retail), ['tag'], 'a theme with nothing saved tries everything there');
    assert.equal(r.themes.retail.tag.sig, 't1-retail', 'each theme tried in itself');
    assert.match(readFileSync(file, 'utf8'), /"themes":\{"default":\{"chip":\{"sig":"c1"/, 'the page keeps the saved result');
    writeFileSync(join(dir, RESULTS_FILE), JSON.stringify({ at: 't', themes: r.themes }));
    assert.deepEqual(Object.keys(readSaved(join(dir, RESULTS_FILE))).sort(), ['default', 'retail']);
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ at: 't', results: { chip: {} } }));
    assert.deepEqual(readSaved(join(dir, 'old.json')), { default: { chip: {} } }, 'an older file with one set is the default theme\'s');
    assert.deepEqual(readSaved(join(dir, 'none.json')), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('each open task keeps the day it was first found; a new one starts now, a closed one leaves', () => {
  assert.deepEqual(ageOpen({ 'chip\u0000a': '2026-01-01', 'chip\u0000gone': '2026-01-02' }, ['chip\u0000a', 'chip\u0000b'], '2026-03-01'), { 'chip\u0000a': '2026-01-01', 'chip\u0000b': '2026-03-01' });
  const page = '<script id="sg-data" type="application/json">{}</script><script>run()</script>';
  const once = withOpenSince(page, { a: '2026-01-01' }), twice = withOpenSince(once, { b: '</script>' });
  assert.match(once, new RegExp(`id="sg-data"[^>]*>{}</script><script id="${OPEN_ID}"`));
  assert.equal((twice.match(new RegExp(OPEN_ID, 'g')) || []).length, 1, 'replaced, never added twice');
  assert.doesNotMatch(twice, /"<\/script>"/, 'a value never closes the tag');
});

test('the default theme saved by another name (an older build named it after the system) is read as default, never a guess', () => {
  assert.deepEqual(savedFor({ acme: { chip: {} }, retail: {} }, ['default', 'retail']), { default: { chip: {} }, retail: {} });
  assert.deepEqual(savedFor({ acme: {}, northwind: {} }, ['default']), { acme: {}, northwind: {} }, 'never a guess between two');
  assert.deepEqual(savedFor({ default: { chip: {} }, acme: {} }, ['default']), { default: { chip: {} }, acme: {} });
});

test('a page built without trying its accessibility carries the saved results: the browser tries only what changed', { timeout: budget(250000) }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { join, dirname } = await import('node:path');
  const { writeFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { fixtureProject } = await import('./helpers.mjs');
  const { readPage } = await import('../styleguide-files.mjs');
  const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'sg-saved-');
  writeFileSync(join(dir, 'a11y-results.snapshot.json'), JSON.stringify({ at: '2026-01-01T00:00:00.000Z', themes: { acme: { button: { sig: 'x.y', live: { ran: {} }, items: [] } } } }));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(240000), env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Accessibility from the saved results/);
  const baked = JSON.parse(new RegExp(`<script id="${BAKED_ID}" type="application/json">([\\s\\S]*?)</script>`).exec(readPage(join(dir, '.design-system-engine-out', 'styleguide', 'index.html')))[1]);
  assert.deepEqual(baked, { at: '2026-01-01T00:00:00.000Z', themes: { default: { button: { sig: 'x.y', live: { ran: {} }, items: [] } } } });
});
