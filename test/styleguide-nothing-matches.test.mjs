// A table a filter has left with no row to show says so, in the card where the rows were. Its column names stand over
// nothing once the rows are hidden, so the head goes with them: what is left is one line saying nothing matches and how
// many rows the table holds in all. A table that never had a row is left alone - nothing is filtered there, and saying
// "nothing matches" of it would be a lie (that empty is the system's own state, and wants its own words).
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

// Every page that filters a table calls it, so no page is left with a head over nothing.
test('every filter that hides rows says so when it hides them all', () => {
  const tpl = templateText();
  assert.match(tpl, /function tableNone\(table, said, yet\) \{/, 'one helper, shared by every page that filters');
  assert.match(tpl, /if \(table\.tHead\) table\.tHead\.hidden = none;/, 'the head goes with the rows');
  assert.match(tpl, /var bare = rows\.length === 0;/, 'a table that never had a row is a different empty');
  assert.match(tpl, /var none = bare \? !!yet : !Array\.prototype\.some\.call\(rows, function \(tr\) \{ return !tr\.hidden; \}\);/, 'and says nothing unless its page says what it waits for');
  assert.match(tpl, /note\.innerHTML = bare \? '<strong>' \+ esc\(yet\.head\)/, 'its own words, never the filters ones');
  // The four places rows are hidden: a column filter, a chip, a ticket, the Status page's own filters.
  assert.match(tpl, /trs\.forEach\(function \(tr\) \{ tr\.hidden = !passes\(tr\); \}\);\n\s+if \(trs\.length\) tableNone\(trs\[0\]\.closest\('table'\), o\.said\);/, 'a column filter');
  assert.match(tpl, /chipped\.forEach\(function \(t\) \{ tableNone\(t, o\.said\); \}\);/, 'a chip');
  assert.match(tpl, /tableNone\(logTable, 'changes'\);/, 'a ticket, on History');
  assert.match(tpl, /tableNone\(body\.parentNode, 'components'\);/, 'the Status page\'s table');
  // Each table says what it holds, so the line under can name it rather than saying "rows".
  for (const said of ["said: 'rules'", "said: 'pages'", "said: 'decisions'", "said: 'changes'"]) assert.ok(tpl.includes(said), said);
  // The Rules page is built whenever the library was read for its rules, mined or none, so its table is the one that
  // can stand there with no row of its own. History builds no page at all until it has a change to show.
  assert.match(tpl, /tableNone\(sec\.querySelector\('\.sg-cx-table'\), 'rules', \{ head: 'No rule has been mined yet', say: '[^']+' \}\);/, 'the Rules table says what fills it');
  assert.match(tpl, /if \(CHANGES\.length \|\| RLOG\.length \|\| DECISIONS\.length \|\| \(DATA\.intentChanges \|\| \[\]\)\.length\) \{/, 'History is built only once it has a change: it is never empty');
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
    // chip shows its count rather than hiding itself. Which source leaves a status empty is the demo's business and
    // changes whenever a rule is added, so each source is tried until one does, rather than naming one here.
    const groups = await run(`[...document.querySelectorAll('#rules .sg-chip-menu[data-fg]')].map((m) => m.getAttribute('data-fg'))`);
    let zero = null, tried = [];
    for (const g of groups) {
      await run(`(() => { const m = document.querySelector('#rules .sg-chip-menu[data-fg="${g}"]'); if (m) m.click(); })()`);
      const values = await run(`[...document.querySelectorAll('#sg-f-rules-${g} [data-f^="${g}:"]')].map((b) => b.getAttribute('data-f')).filter((f) => f !== '${g}:')`);
      for (const v of values) {
        tried.push(v);
        await run(`(() => { const b = document.querySelector('#sg-f-rules-${g} [data-f="${v}"]'); if (b) b.click(); })()`);
        zero = await run(`(() => { const z = [...document.querySelectorAll('#rules .sg-chips .sg-chip[data-chip]')].find((c) => /\\b0\\b/.test(c.textContent)); if (!z) return null; z.click(); return z.getAttribute('data-chip'); })()`);
        if (zero) break;
        await run(`(() => { const b = document.querySelector('#sg-f-rules-${g} [data-f="${v}"]'); if (b) b.click(); })()`);   // put it back before the next
      }
      if (zero) break;
    }
    assert.ok(zero, `a chip some column value leaves no row in (tried ${tried.join(', ')})`);
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

test('a table that never had a row says what fills it, not that a filter hid it', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-nothing-yet-');
  cpSync(HARBOR, dir, { recursive: true });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = join(dir, '.design-system-engine-out', 'styleguide');
  // The library read for its rules, and none mined: the page is built all the same, its table with no row of its own.
  const assets = join(out, 'assets');
  const file = join(assets, readdirSync(assets).find((n) => n.startsWith('index.data.')));
  const text = readFileSync(file, 'utf8');
  const pre = 'self.SG_DATA_OF=(function(){return ', suf = ';});self.SG_DATA=self.SG_DATA_OF();';
  assert.ok(text.startsWith(pre) && text.includes(suf), 'the data asset is the one the page reads');
  const data = JSON.parse(text.slice(pre.length, text.indexOf(suf)));
  assert.ok(data.construction.rules.length, 'the fixture mines rules, so emptying them is the case under test');
  data.construction.rules = [];
  writeFileSync(file, pre + JSON.stringify(data) + text.slice(text.indexOf(suf)));

  const page = join(out, 'index.html');
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
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#rules .sg-none')`, { attempts: 200 }), true, 'the page is built, and says why its table is empty');
    assert.equal(await run(`document.querySelectorAll('#rules .sg-cx-table tbody tr').length`), 0, 'no row of its own');
    assert.equal(await run(`document.querySelector('#rules .sg-cx-table').tHead.hidden`), true, 'the column names go: they stand over nothing');
    assert.equal(await run(`!!document.querySelector('#rules [data-f-clear]')`), false, 'no filters, so nothing to clear');
    assert.equal(await run(`document.querySelector('#rules .sg-none').innerText.replace(/\\s+/g, ' ').trim()`),
      'No rule has been mined yet A rule is read from what most components already do. The next run that reads the library fills this table.',
      'its own words: what the table waits for, never a filter the person never set');
    assert.doesNotMatch(await run(`document.querySelector('#rules .sg-none').innerText`), /Nothing matches/, 'never the filters line');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
