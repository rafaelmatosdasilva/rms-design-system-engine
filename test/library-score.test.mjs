// The Figma library's health in one number (library-score.mjs), and a component no product uses (need-rules.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { scoreOf, withHistory } from '../lib/library-score.mjs';
import { needRules } from '../lib/need-rules.mjs';

test('a score from the rules the team keeps, each kind averaged, the kinds averaged', () => {
  const s = scoreOf([
    { area: 'naming', status: 'rule', follows: 10, of: 10 }, { area: 'naming', status: 'fix', follows: 8, of: 10 },
    { area: 'layout', status: 'fix', follows: 6, of: 10 },
    // Still to decide, or reading nothing: counts for nothing.
    { area: 'layout', status: 'decide', follows: 0, of: 10 }, { area: 'variables', status: 'rule', follows: 0, of: 0 },
  ]);
  assert.deepEqual(s, { score: 75, areas: [{ area: 'layout', score: 60, rules: 1 }, { area: 'naming', score: 90, rules: 2 }] });
  assert.equal(scoreOf([{ area: 'naming', status: 'decide', follows: 1, of: 2 }]), null, 'nothing kept, no score');
});

test('the history keeps one score a day and says the last other day\'s', () => {
  const file = join(tempDir('score-'), 'library-score.json');
  const s = (n) => ({ score: n, areas: [{ area: 'naming', score: n, rules: 1 }] });
  assert.equal(withHistory(file, '2026-11-01T10:00:00Z', s(70)).previous, undefined, 'the first build has nothing to compare');
  withHistory(file, '2026-11-01T18:00:00Z', s(72));
  assert.deepEqual(withHistory(file, '2026-11-08T09:00:00Z', s(80)).previous, { at: '2026-11-01T18:00:00Z', score: 72 }, 'the day\'s last');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((e) => e.score), [72, 80], 'one entry a day');
});

test('a component the code builds that no product uses, when the catalog knows the products', () => {
  const props = { button: { properties: {} }, chip: { properties: {} }, tag: { properties: {} } };
  const used = { products: [{ name: 'Banking app' }] }, own = { products: [{ name: 'Style guide', own: true }] };
  const r = needRules({ props, usage: { button: used, chip: used, tag: own } }).find((x) => x.id === 'component-in-products');
  assert.deepEqual(r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]), [['tag', 'no product\'s code uses it']], 'the system\'s own pages are not a product');
  assert.equal(needRules({ props, usage: { button: used } }).some((x) => x.id === 'component-in-products'), false, 'too little known');
  assert.equal(needRules({ props }).some((x) => x.id === 'component-in-products'), false, 'no catalog, nothing said');
});

test('in Chrome: the Rules page opens with the library\'s health, each kind beside it', { timeout: 300000 }, async (t) => {
  const { cpSync } = await import('node:fs'), { spawnSync } = await import('node:child_process'), { dirname } = await import('node:path'), { fileURLToPath } = await import('node:url');
  const ENGINE = dirname(dirname(fileURLToPath(import.meta.url))), dir = tempDir('sg-score-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), dir, { recursive: true });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out', 'styleguide', 'index.html')}#rules`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#rules .sg-cx-score')`, { attempts: 200 }), true, 'the score is on the Rules page');
    const run = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true }, sessionId)).result.value;
    const got = await run(`(() => { const s = document.querySelector('#rules .sg-cx-score'); return { head: s.querySelector('.sg-cx-score-head').textContent, kinds: s.querySelectorAll('.sg-cx-score-areas li').length, tables: s.querySelectorAll('table').length, beforeTable: !!s.parentNode.querySelector('.sg-cx-score ~ .pg-par-card .sg-cx-table') }; })()`);
    assert.match(got.head, /^Library health \d+$/);
    assert.ok(got.kinds >= 1, 'each kind of rule with its own score');
    assert.equal(got.tables, 0, 'a list, never a table');
    assert.equal(got.beforeTable, true, 'above the rules\' table');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
