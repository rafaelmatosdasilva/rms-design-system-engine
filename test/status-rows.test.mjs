// One row a component on the Status page. A part is listed and counted inside its component's row, however deep it
// sits: a part of a part belongs to the component at the top, not to a row of its own as well. A family no component
// carries (nav/Primary, nav/Secondary) is the one row its members share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { templateText } from '../lib/styleguide-template.mjs';
import { budget, tempDir } from './helpers.mjs';

// A page of this data alone: the template with its data filled in and every other fill left empty, so the test says
// what the rows are made of and nothing else.
function pageOf(data) {
  let html = templateText();
  for (const key of ['THEME_CSS', 'COMPONENT_CSS', 'CHROME', 'ICON_SHEET', 'SYSTEM_SCRIPTS', 'MODULES', 'WCAG_PAGE']) {
    for (const m of [`<!--{{${key}}}-->`, `/*{{${key}}}*/`, `{{${key}}}`]) html = html.split(m).join('');
  }
  for (const [key, value] of [['AGREED', JSON.stringify(data)], ['USAGE', '{}'], ['DOCS_CODE', '{}'], ['DOCS', '{}']]) {
    for (const m of [`<!--{{${key}}}-->`, `/*{{${key}}}*/`, `{{${key}}}`]) html = html.split(m).join(value.replace(/<\/script/gi, '<\\/script'));
  }
  const dir = tempDir('status-rows-'), file = join(dir, 'index.html');
  writeFileSync(file, html);
  return file;
}

const component = (name, extra = {}) => ({ name, cls: name.replace(/[^\w-]/g, '-'), markup: `<div class="${name.replace(/[^\w-]/g, '-')}"></div>`, controls: [], tokens: [], ...extra });

test('the Status table gives each component one row: a part counts inside it however deep, and a family no component carries is one row', { timeout: budget(90000) }, async () => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  assert.ok(chromePath, 'Chrome is needed for this test');
  const file = pageOf({
    title: 'Fixture',
    components: [
      component('chip'),
      component('table'),
      component('table/Cell'),                                                  // a part of table, by its Figma path
      component('tableCellMark', { partOf: { root: 'table/Cell', by: 'name and nesting' } }),   // a part of that part
      component('nav/Primary'),                                                 // a family no component carries
      component('nav/Secondary'),
      component('Base', { codeOnly: { file: 'src/Base.vue', figma: true } }),     // only the code has it: built, so listed and counted
    ],
  });
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${file}#status`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `document.querySelectorAll('#status .sg-matrix tr.sg-mx-row').length > 0`);
    const names = await run(`[...document.querySelectorAll('#status .sg-matrix tr.sg-mx-row')].map((tr) => tr.dataset.name)`);
    assert.deepEqual(names.slice().sort(), ['Base', 'chip', 'nav', 'table'], 'one row a component: no row for a part, and the family once');
    // The cards count the rows the table shows, so a part counted in its component's row is never counted twice.
    const done = await run(`[...document.querySelectorAll('#status .sg-health-done')].map((p) => p.textContent.replace(/\\s+/g, ' ').trim())`);
    for (const line of done) assert.match(line, /of 4 complete$/, 'every card counts the rows the table has');
    // The menu lists what the Code card counts as built: the same number on both, the same components in both.
    const menu = await run(`(() => { const lab = document.querySelector('.sg-nav-label[data-group="Components"]'); const out = []; for (let n = lab.nextElementSibling; n && !n.classList.contains('sg-nav-label'); n = n.nextElementSibling) for (const a of n.matches('a') ? [n] : n.querySelectorAll('a')) out.push(a.textContent.trim()); return { label: lab.textContent.replace(/\\s+/g, ' ').trim(), names: out }; })()`);
    const built = await run(`[...document.querySelectorAll('#status .sg-matrix tr.sg-mx-row')].filter((tr) => tr.dataset.stCode === 'Built').map((tr) => tr.dataset.name)`);
    assert.deepEqual(menu.names.slice().sort(), built.slice().sort(), 'the menu lists every component the Code card counts as built, and nothing else');
    assert.match(menu.label, new RegExp('\\b' + built.length + '\\b'), 'the menu says the number the Code card says');
    assert.ok(done.some((line) => line.startsWith(built.length + ' of ')), 'the Code card says that many built');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('the Figma review\'s findings are tasks in each component\'s Rules area: its fix, a link to its node in Figma', { timeout: budget(90000) }, async () => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  assert.ok(chromePath, 'Chrome is needed for this test');
  const url = 'https://www.figma.com/design/AbCd1234?node-id=1-2';
  const file = pageOf({
    title: 'Fixture',
    components: [component('chip'), component('tag')],
    construction: {
      figmaUrls: { chip: url },
      rules: [
        { id: 'text-content', area: 'Properties', side: 'figma', who: 'figma', says: 'A text property ends with "Content"', status: 'fix', follows: 1, of: 2,
          toFix: [{ component: 'chip', fix: { say: 'Rename the property Label to labelContent' } }, { component: 'chip', fix: { say: 'Rename the property Hint to hintContent' } }] },
        { id: 'code-only', area: 'Code', side: 'code', who: 'code', says: 'A code rule', status: 'fix', follows: 0, of: 1, toFix: [{ component: 'tag', fix: { say: 'Not a Figma task' } }] },
      ],
    },
  });
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    // Each component's own page has a Rules area with its Figma findings, a task each (the owner's choice, 12 November 2026).
    const { sessionId } = await openPage(send, `file://${file}#c-chip`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `!!document.querySelector('#c-chip .pg-areas [data-v="rules"]')`, { attempts: 200 });
    await run(`document.querySelector('#c-chip .pg-areas [data-v="rules"]').click()`);
    // The table says the rule, its status and when; its fix, who acts and its node in Figma are in the row's panel.
    assert.deepEqual(await run(`[...document.querySelectorAll('#c-chip [data-area="rules"] thead th')].map((th) => th.textContent.trim()).filter(Boolean)`), ['Task nr', 'Rule', 'Status', 'Last checked', 'Open']);
    const tr = await run(`(() => { const tr = [...document.querySelectorAll('#c-chip [data-area="rules"] tr.sg-row-open')].find((x) => /Content/.test(x.textContent)); return tr ? { area: tr.dataset.area, status: tr.dataset.status, fixInTable: /labelContent/.test(tr.textContent) } : null; })()`);
    assert.deepEqual(tr, { area: 'Rules', status: 'todo', fixInTable: false });
    assert.equal(await run(`document.querySelectorAll('#c-chip [data-area="rules"] tbody tr.sg-row-open').length`), 1, 'one row a rule, however many fixes it has');
    await run(`[...document.querySelectorAll('#c-chip [data-area="rules"] tr.sg-row-open')].find((x) => /Content/.test(x.textContent)).click()`);
    await waitForTrue(send, sessionId, `(() => { const p = document.getElementById('sg-row-panel'); return !!p && !p.hidden && /labelContent/.test(p.textContent) && /hintContent/.test(p.textContent); })()`, { attempts: 50 });
    assert.equal(await run(`document.querySelectorAll('#sg-row-panel a.sg-cx-figma').length`), 1, 'its node in Figma once, below its fixes');
    const row = await run(`(() => { const a = document.querySelector('#sg-row-panel a.sg-cx-figma'); return { href: a && a.getAttribute('href'), target: a && a.target, mark: !!(a && a.querySelector('svg')) }; })()`);
    assert.deepEqual(row, { href: url, target: '_blank', mark: true }, 'its panel: the fix, and its node in Figma with Figma\'s mark');
    await run(`document.querySelector('#sg-row-panel [data-panel-close]').click()`);
    assert.equal(await run(`!!document.querySelector('#c-tag .pg-areas [data-v="rules"]')`), false, 'a code rule is not a Figma task: no Rules area for it');
    // Its own address, as every area has: the page writes it, and a link to it opens the Rules area straight away.
    await waitForTrue(send, sessionId, `location.hash === '#c-chip/rules'`, { attempts: 50 });
    assert.equal(await run('location.hash'), '#c-chip/rules', 'the address names the area');
    await run(`location.hash = '#status'`);
    await waitForTrue(send, sessionId, `!document.getElementById('c-chip') || document.getElementById('c-chip').hidden`, { attempts: 50 });
    await run(`location.hash = '#c-chip/rules'`);
    assert.equal(await waitForTrue(send, sessionId, `(() => { const a = document.querySelector('#c-chip [data-area="rules"]'); return !!a && !a.hidden; })()`, { attempts: 100 }), true, 'a link straight to the Rules area opens it');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
