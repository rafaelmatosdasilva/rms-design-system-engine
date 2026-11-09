// A table a filter has left with no row to show says so, in the card where the rows were. Its column names stand over
// nothing once the rows are hidden, so the head goes with them: what is left is one line saying nothing matches and how
// many rows the table holds in all. A table that never had a row is left alone - nothing is filtered there, and saying
// "nothing matches" of it would be a lie (that empty is the system's own state, and wants its own words).
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

// Every page that filters a table calls it, so no page is left with a head over nothing.
test('every filter that hides rows says so when it hides them all', () => {
  const tpl = templateText();
  assert.match(tpl, /function tableNone\(table, said\) \{/, 'one helper, shared by every page that filters');
  assert.match(tpl, /if \(table\.tHead\) table\.tHead\.hidden = none;/, 'the head goes with the rows');
  assert.match(tpl, /var none = rows\.length > 0 && !Array\.prototype\.some\.call\(rows, function \(tr\) \{ return !tr\.hidden; \}\);/, 'a table that never had a row is not an empty filter');
  // The four places rows are hidden: a column filter, a chip, a ticket, the Status page's own filters.
  assert.match(tpl, /trs\.forEach\(function \(tr\) \{ tr\.hidden = !passes\(tr\); \}\);\n\s+if \(trs\.length\) tableNone\(trs\[0\]\.closest\('table'\), o\.said\);/, 'a column filter');
  assert.match(tpl, /chipped\.forEach\(function \(t\) \{ tableNone\(t, o\.said\); \}\);/, 'a chip');
  assert.match(tpl, /tableNone\(logTable, 'changes'\);/, 'a ticket, on History');
  assert.match(tpl, /tableNone\(body\.parentNode, 'components'\);/, 'the Status page\'s table');
  // Each table says what it holds, so the line under can name it rather than saying "rows".
  for (const said of ["said: 'rules'", "said: 'pages'", "said: 'decisions'", "said: 'changes'"]) assert.ok(tpl.includes(said), said);
});

test('a table filtered to nothing: the head goes with the rows, and one line says why', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-nothing-matches-');
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
    const { sessionId } = await openPage(send, `file://${page}#rules`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#rules .sg-cx-table tbody tr')`, { attempts: 200 }), true, 'the Rules table has its rows');
    const shown = () => run(`[...document.querySelectorAll('#rules .sg-cx-table tbody tr')].filter((tr) => !tr.hidden).length`);
    const headGone = () => run(`document.querySelector('#rules .sg-cx-table').tHead.hidden`);
    const note = () => run(`(() => { const p = document.querySelector('#rules .sg-none'); return p && !p.hidden ? p.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
    const all = await shown();
    assert.ok(all > 1, 'rows to filter');
    assert.equal(await headGone(), false, 'the head is there while rows are');
    assert.equal(await note(), null, 'and nothing is said');
    // A column value and a chip that share no row: the one combination the filter bar cannot talk you out of, since a
    // chip shows its count rather than hiding itself.
    await run(`document.querySelector('#rules .sg-chip-menu[data-fg="source"]').click()`);
    await run(`document.querySelector('#sg-f-rules-source [data-f="source:Code"]').click()`);
    const zero = await run(`(() => { const z = [...document.querySelectorAll('#rules .sg-chips .sg-chip[data-chip]')].find((c) => /\\b0\\b/.test(c.textContent)); if (!z) return null; z.click(); return z.getAttribute('data-chip'); })()`);
    assert.ok(zero, 'a chip the chosen column leaves no row in');
    assert.equal(await shown(), 0, 'every row hidden');
    assert.equal(await headGone(), true, 'the column names go with the rows they stood over');
    assert.equal(await note(), `Nothing matches these filters ${all} rules in all, none of them this combination.`, 'one line, and how many the table holds in all');
    assert.equal(await run(`document.querySelector('#rules .sg-none').getAttribute('role')`), 'status', 'said to a screen reader when it appears');
    assert.equal(await run(`document.querySelector('#rules .sg-none').previousElementSibling === document.querySelector('#rules .sg-cx-table')`), true, 'in the card, where the rows were');
    // Cleared, the table comes back as it was: the rows, their head, and nothing said.
    await run(`document.querySelector('#rules [data-f-clear]').click()`);
    assert.equal(await shown(), all);
    assert.equal(await headGone(), false, 'the head returns with the rows');
    assert.equal(await note(), null, 'and the line goes');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
