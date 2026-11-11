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
