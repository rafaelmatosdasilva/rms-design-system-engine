// The Rules page's draft: the components a rule's suggestion changes, grouped by the change they take, so a change
// several take is said once; a list, never a table inside the rules' own table; and a component a Figma rule changes
// opens in Figma, where a person checks it, with Figma's mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { constructionView } from '../lib/construction-page.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('the view carries a Figma link only for a component a Figma rule changes', () => {
  const v = constructionView({ grammar: [{ id: 'description', says: 'x', toFix: [{ component: 'chip', value: '' }] }], code: [{ id: 'raw', side: 'code', says: 'y', toFix: [{ component: 'card', value: '' }] }],
    figmaUrls: { chip: 'https://www.figma.com/design/K?node-id=1-2', card: 'https://www.figma.com/design/K?node-id=3-4', tag: 'https://www.figma.com/design/K?node-id=5-6' } });
  assert.deepEqual(v.figmaUrls, { chip: 'https://www.figma.com/design/K?node-id=1-2' }, 'the code rule\'s card and the unnamed tag are left out');
  assert.equal(constructionView({ grammar: [{ id: 'd', says: 'x', toFix: [] }] }).figmaUrls, undefined);
  // Only a Figma task's component: a rule that says no side is not one.
  assert.equal(constructionView({ code: [{ id: 'r', says: 'z', toFix: [{ component: 'chip', value: '' }] }], figmaUrls: { chip: 'https://www.figma.com/design/K?node-id=1-2' } }).figmaUrls, undefined);
});

test('a rule\'s draft: each change said once above its components, each a Figma link, no table inside', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-rules-draft-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfgPath = join(dir, 'ds-config.json'), cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, figmaFileKey: 'AbCd1234' }, null, 2));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${page}#rules`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#rules .sg-cx-table tbody tr')`, { attempts: 200 }), true, 'the Rules table has its rows');
    // Each rule's draft, opened from its row: a list, never a table inside the rules' table; each change said once, above
    // the components that take it; each component a link to its node in the Figma file, with Figma's mark.
    const rules = await run(`[...document.querySelectorAll('#rules tr.sg-row-open')].map((x) => x.cells[0].textContent.trim())`);
    // By the row's place in the table, a number: the page is never handed a rule's words to run as code.
    const draftOf = (rule) => run(`(() => { const tr = [...document.querySelectorAll('#rules tr.sg-row-open')][${Number(rules.indexOf(rule))}]; if (!tr) return null; tr.cells[0].click();
      const d = document.querySelector('#sg-cx-panel .sg-cx-changes'); if (!d) return { none: true };
      const boxed = [d, ...d.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none'); }).length;
      return { tables: d.querySelectorAll('table').length, boxed, groups: [...d.querySelectorAll('dl.sg-cx-kv > div')].map((g) => ({ say: [...g.querySelectorAll('dd .sg-cx-say')].map((x) => x.textContent).join(' | '),
        pills: [...g.querySelectorAll('dt .sg-cx-pills li')].map((li) => { const a = li.querySelector('a'); return [li.textContent, a && a.getAttribute('href'), a && a.target, !!(a && a.querySelector('svg'))]; }) })) }; })()`);
    const layout = rules.find((x) => /auto layout/.test(x)), described = rules.find((x) => /description in Figma/.test(x));
    assert.ok(layout && described, 'both rules are on the page');
    for (const [rule, comps] of [[described, ['iconButton']], [layout, ['badge', 'button', 'iconButton']]]) {
      const draft = await draftOf(rule);
      assert.equal(draft.tables, 0, `${rule}: labelled values, never a table inside the rules' table`);
      assert.equal(draft.boxed, 0, `${rule}: nor a box drawn as one, inside the panel's card`);
      const says = draft.groups.map((g) => g.say);
      assert.equal(new Set(says).size, says.length, `${rule}: each change said once`);
      const pills = draft.groups.flatMap((g) => g.pills);
      assert.deepEqual(pills.map(([n]) => n).sort(), comps, `${rule}: every component it changes`);
      for (const [n, href, target, mark] of pills) {
        assert.match(href ?? '', /^https:\/\/www\.figma\.com\/design\/AbCd1234\?node-id=\d+-\d+$/, `${n} opens its node in the Figma file`);
        assert.equal(target, '_blank', 'in a tab of its own');
        assert.equal(mark, true, 'with Figma\'s mark');
      }
    }
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('nothing the Rules panel draws is a table: it opens from a row of the rules\' table', () => {
  const src = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '07-second-in-the-list.js'), 'utf8');
  const start = src.indexOf('var panel = function'), end = src.indexOf("m.querySelector('.sg-row-detail').innerHTML = sidePanelPage", start);
  assert.ok(start > 0 && end > start, 'the Rules panel is where it was');
  assert.equal(/<table/.test(src.slice(start, end)), false, 'the draft and a family\'s ways are lists');
});
