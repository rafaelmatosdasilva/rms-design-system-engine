// No table inside a table, anywhere in the style guide (the owner's rule): a panel that opens from a table's row says
// what a table would as labelled values (kvOne, kvList), never as another table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { templateText } from '../lib/styleguide-template.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const JS = (f) => readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', f), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, `${from} is where it was`); return src.slice(a, b); };

test('what each panel opened from a row draws holds no table', () => {
  // The Rules panel, Changes in Figma's diff, an issue's "What it affects", and the token panel with its users.
  assert.equal(/<table/.test(between(JS('07-second-in-the-list.js'), 'var panel = function', "m.querySelector('.sg-row-detail').innerHTML = sidePanelPage")), false, 'the Rules panel');
  assert.equal(/<table/.test(between(JS('07-second-in-the-list.js'), 'var diffTable = function', 'var rowHTML = function')), false, 'a change\'s parts');
  assert.equal(/<table/.test(between(JS('22-one-table-for-every-issue.js'), 'var COLS = [', 'What it affects')), false, 'what an issue affects');
  assert.equal(/<table/.test(between(JS('11-brand-kit.js'), "var m = document.getElementById('sg-tk-panel');", 'm._from = from || null;')), false, 'a token\'s panel');
  assert.equal(/<table/.test(between(JS('00-start.js'), 'function usersTable(names) {', '\n  }')), false, 'the components that use a token');
  assert.match(templateText(), /function kvList\(items, cls\)/, 'one helper for every list of labelled values');
  // Nor a box drawn as a table inside a panel's card: a border all round, a head, lines between rows. The tag is not
  // what makes a table; what it looks like does (the Rules panel drew one from plain boxes, 11 November 2026).
  const css = readFileSync(join(ENGINE, 'templates', 'styleguide', 'css', '09-component-playground.css'), 'utf8');
  const boxes = css.split('\n').filter((l) => /^\.sg-row-detail-body [^{]*\{[^}]*\bborder:\s*var\(--sg-line\)/.test(l));
  assert.deepEqual(boxes, [], 'no box with a border all round inside a panel card');
});

test('in Chrome: a token\'s panel and an issue\'s panel hold labelled values and no table', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-no-nested-');
  cpSync(HARBOR, dir, { recursive: true });
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
    const { sessionId } = await openPage(send, `file://${page}#tokens`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    // A token's panel, from its row's arrow.
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#tokens [data-detail]')`, { attempts: 200 }), true, 'the Tokens table has its rows');
    await run(`document.querySelector('#tokens [data-detail]').click()`);
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#sg-tk-panel .sg-tk-detail .sg-kv')`, { attempts: 100 }), true, 'the token\'s panel opens');
    const tk = await run(`(() => { const d = document.querySelector('#sg-tk-panel .sg-tk-detail'); return { tables: d.querySelectorAll('table').length, labels: [...d.querySelectorAll('.sg-tk-facts dt')].map((x) => x.textContent), modes: d.querySelectorAll('.sg-tk-vals dt').length }; })()`);
    assert.equal(tk.tables, 0, 'no table in a token\'s panel');
    assert.deepEqual(tk.labels, ['What it styles', 'In the code', 'What it is for']);
    assert.ok(tk.modes >= 1, 'a label for each mode over its value');
    // Every issue table on a component's page: each row's panel holds no table.
    await run(`location.hash = '#c-button'`);
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#c-button tr.sg-row-open')`, { attempts: 200 }), true, 'the button has rows that open');
    const issues = await run(`(() => { const out = []; for (const tr of [...document.querySelectorAll('#c-button tr.sg-row-open')].slice(0, 12)) { tr.cells[0].click(); const d = document.querySelector('#sg-row-panel .sg-row-detail'); out.push(d ? d.querySelectorAll('table').length : -1); } return out; })()`);
    assert.ok(issues.length > 0 && issues.every((n) => n === 0), `no table in any row's panel: ${issues.join(', ')}`);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

// A component's Figma review findings: a Rules area on its own page, from the Rules page's Figma rules to fix, with who
// acts and the link to its node in Figma said once above the rows, never on each.
test('a component\'s Rules area lists the Figma rules it breaks, and says what every row shares once', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../templates/styleguide/js/${f}`, import.meta.url), 'utf8');
  const tasks = read('30-its-accessibility.js'), page = read('33-a-component-the-build-went-through-with.js'), table = read('22-one-table-for-every-issue.js'), areas = read('27-changelog.js');
  assert.match(areas, /\['parity', 'Parity'\], \['rules', 'Rules'\]/);
  // Only Figma's rules that are to fix; one still to decide stays the team's question on the Rules page.
  assert.match(tasks, /if \(\(r\.side \|\| 'figma'\) !== 'figma' \|\| r\.status !== 'fix'\) return;/);
  // Shown only when the component breaks one, as Products is.
  assert.match(page, /\(a\[0\] !== 'rules' \|\| ruleRows\(c\)\.length\)/);
  // Who acts, and the link to Figma, once above the table: never a column, and never on each row.
  assert.match(table, /Rules: \[\['Task nr', 'no'\], \['Rule', 'kind'\], \['What to do', 'todo'\], \['Status', 'status'\], \['Last checked', 'updated'\]\]/);
  assert.match(table, /r\.area !== 'Rules' \? '<span class="sg-todo-who">'/);
  assert.match(tasks, /function rulesLead\(c\)[\s\S]*?sg-cx-figma[\s\S]*?FIGMA_SVG/);
  assert.match(tasks, /area: 'Rules', kind: r\.says, figma: '', code: ''/);
});
