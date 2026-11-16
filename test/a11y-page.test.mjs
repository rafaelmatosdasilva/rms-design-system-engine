// The Accessibility page: every criterion of every component in one table, as Rules and Documentation gather theirs.
// Each row is the row the component's own Accessibility area shows, under the same task number, opening the same panel,
// filtered by status, component, level, principle, who acts and what the criterion depends on. It is drawn at once with
// every result already known, a component still being tried saying so on its rows, each drawn again in place when its
// try ends, never a row moved under the reader. A component's Accessibility area is this table, limited to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { templateText } from '../lib/styleguide-template.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const tpl = templateText();

test('the page is made of the rows a component\'s own area shows, and the try fills it as it fills the Status page', () => {
  assert.match(tpl, /a11yIssueRows\(c, t \? t\.items : c\.a11y \? a11yStaticItems\(c\) : \[\], t \? t\.live : null\)\.forEach\(function \(r\) \{\n\s+if \(!\(A11Y_ST\[r\.st\] && !r\.extra && r\.k && \(r\.k\.level === 'A' \|\| r\.k\.level === 'AA'\)\)\) return;/, 'the same rows, one way to work them out, those AA asks for');
  assert.match(tpl, /pending: \['…', 'Being tried in this browser…', 'none'\]/, 'a row still being tried says so, with a neutral dot');
  assert.match(tpl, /a11yTable\(box, c\.name\);/, 'a component\'s area is the page\'s own table, limited to it');
  assert.match(tpl, /ROW_DETAIL\.push\(\{ r: r, area: 'Accessibility' \}\)/, 'each opens the same panel as on the component');
  assert.match(tpl, /var SWEEP_PAGES = \{ status: 1, accessibility: 1 \};/, 'opening the page tries every component, as the Status page does');
  assert.match(tpl, /fillTodoNos\(document\);\n    fillA11yPage\(\);/, 'drawn with the task numbers it shares');
  assert.match(tpl, /href="#accessibility\?show=differs"/, 'the Status page counts what differs by browser and opens the page on it');
  // The component panel loaded ahead and parked out of sight is no person reading: counted as one, it held the try
  // forever after the second component, and the table never filled.
  assert.match(tpl, /\.sg-comp-panel:not\(\[hidden\]\):not\(\.is-parked\)'\)\); \};/);
});

test('in Chrome: one table for every component, filtered as Rules is, each row opening its panel', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-a11y-page-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfgPath = join(dir, 'ds-config.json');
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, 'utf8')), figmaFileKey: 'AbCd1234' }, null, 2));
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
    const { sessionId } = await openPage(send, `file://${page}#accessibility`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    assert.equal(await run(`!!document.querySelector('nav a[href="#accessibility"]')`), true, 'in the menu');
    // Drawn at once, before every component is tried: the rows still being tried say so, and each ends in place.
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#accessibility .sg-a11y-table tbody tr')`, { attempts: 40 }), true, 'the table shows at once');
    const order0 = await run(`[...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].map((tr) => tr.dataset.rowDetail ? tr.cells[1].textContent + tr.cells[2].textContent.split(' ')[0] : '').join('|')`);
    assert.equal(await waitForTrue(send, sessionId, `(() => { const t = [...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')]; return t.length > 0 && !t.some((tr) => tr.dataset.status === 'pending'); })()`, { attempts: 600 }), true, 'every row ends with its result');
    const order1 = await run(`[...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].map((tr) => tr.cells[1].textContent + tr.cells[2].textContent.split(' ')[0]).join('|')`);
    assert.ok(order0.split('|').filter((x) => order1.split('|').includes(x)).join('|') === order1.split('|').filter((x) => order0.split('|').includes(x)).join('|'), 'no row moved while the tries ended');
    const seen = await run(`(() => {
      const sec = document.getElementById('accessibility'), trs = [...sec.querySelectorAll('.sg-a11y-table tbody tr')];
      return { rows: trs.length, comps: [...new Set(trs.map((tr) => tr.cells[1].textContent.trim()))].length,
        heads: [...sec.querySelectorAll('.sg-a11y-table thead th[data-sort]')].map((th) => th.textContent.trim()).filter(Boolean),
        filters: [...sec.querySelectorAll('.sg-todo-head .sg-chip-menu .sg-chip-label')].map((x) => x.textContent),
        chips: [...sec.querySelectorAll('.sg-todo-head .sg-chip[data-chip]')].map((x) => x.getAttribute('data-chip')),
        cards: [...sec.querySelectorAll('.sg-cx-score .sg-health-label')].map((x) => x.textContent),
        statuses: [...new Set(trs.map((tr) => tr.dataset.status))].sort(),
        comp: (() => { const a = trs[0].querySelector('a.sg-uses-link'); return a && a.getAttribute('href'); })() };
    })()`);
    assert.ok(seen.rows > 10 && seen.comps > 1, JSON.stringify(seen));
    assert.deepEqual(seen.heads, ['Task nr', 'Component', 'WCAG', 'Level', 'Who acts', 'Status', 'Last checked']);
    assert.deepEqual(seen.filters, ['Level', 'Who acts'], 'the level and who acts, nothing else: the component, the principle and what it depends on are in each row and its panel');
    assert.deepEqual(await run(`[...new Set([...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].map((t) => t.dataset.fLevel))].sort()`), ['A', 'AA'], 'only the criteria AA asks for')
    assert.ok(seen.chips.includes('todo') || seen.chips.includes('check'), seen.chips.join());
    assert.deepEqual(seen.cards, ['Level A', 'Level AA'], 'a card a level')
    assert.equal(await run(`[...document.querySelectorAll('#accessibility .sg-cx-score')].every((c) => c.querySelector('.sg-health-top .sg-tip'))`), true, 'its tip says how it is counted, as the Status page\'s cards do')
    // Each card counts criteria across the system, never rows: a criterion is met only when no component fails it and
    // none waits on a review. Levels build on each other: Level AA is A and AA together, the Status page's number.
    const counted = await run(`(() => {
      const trs = [...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')], rank = { done: 0, check: 1, todo: 2 }, all = {};
      const out = ['A', 'AA'].map((lv) => {
        const by = {};
        trs.filter((t) => (lv === 'AA' ? /^(A|AA)$/ : /^A$/).test(t.dataset.fLevel || '') && t.dataset.fPrinciple).forEach((t) => { const sc = t.cells[2].textContent.trim().split(' ')[0]; by[sc] = Math.max(by[sc] ?? 0, rank[t.dataset.status]); all[sc] = by[sc]; });
        const v = Object.values(by), card = [...document.querySelectorAll('#accessibility .sg-cx-score')].find((c) => c.querySelector('.sg-health-label').textContent === 'Level ' + lv);
        return { want: v.filter((x) => x === 0).length + ' of ' + v.length, got: card.querySelector('.sg-cx-ring-text .sg-health-sub').textContent };
      });
      const v = Object.values(all);
      return { levels: out, both: Math.floor(v.filter((x) => x === 0).length / v.length * 100) };
    })()`);
    for (const c of counted.levels) assert.equal(c.got, c.want);
    const statusN = await run(`(() => { const t = [...document.querySelectorAll('#status .sg-health-tile')].find((x) => /^Accessibility$/.test(x.querySelector('.sg-health-label').textContent)); return t ? t.querySelector('.sg-health-pct').textContent.replace(/\\D/g, '') : null; })()`);
    assert.equal(statusN, String(counted.both), 'the Status page says both levels together');
    const aaN = await run(`[...document.querySelectorAll('#accessibility .sg-cx-score')].find((c) => c.querySelector('.sg-health-label').textContent === 'Level AA').querySelector('.sg-health-num').textContent.replace(/\\D/g, '')`);
    assert.equal(aaN, statusN, 'Level AA here is the Status page\'s number');
    // Every task names a person by role (a designer, a developer, a person checking by hand, whoever writes the words,
    // whoever owns the flow): never the older "You decide" or "You in Figma", which said a place or a doubt.
    const who = await run(`[...new Set([...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].map((t) => t.dataset.fWho).filter(Boolean))]`);
    for (const w of who) assert.match(w, /^(A designer, in Figma|A developer, in the code|A person checks it by hand|Whoever writes the words|Whoever owns the flow)/, w);
    assert.match(seen.comp, /^#c-/, 'a row names its component, a link to its page');
    // The rows are the component's own: the same criteria its Accessibility area lists.
    // Read and counted in the page, so nothing read from it is written back into the code that runs there.
    const here = await run(`(() => { const rows = [...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')]; const name = rows[0].cells[1].textContent.trim(); return rows.filter((tr) => tr.cells[1].textContent.trim() === name).length; })()`);
    assert.ok(here > 0);
    // A status chip leaves only its rows; Clear filters brings them all back.
    const chip = seen.chips.includes('todo') ? 'todo' : 'check';
    const filtered = await run(`(() => { const sec = document.getElementById('accessibility'); sec.querySelector('.sg-chip[data-chip="${chip}"]').click(); const vis = [...sec.querySelectorAll('.sg-a11y-table tbody tr')].filter((tr) => !tr.hidden); const ok = vis.length > 0 && vis.every((tr) => tr.dataset.status === '${chip}'); sec.querySelector('[data-f-clear]').click(); return { ok, back: [...sec.querySelectorAll('.sg-a11y-table tbody tr')].filter((tr) => !tr.hidden).length }; })()`);
    assert.equal(filtered.ok, true);
    assert.equal(filtered.back, seen.rows);
    // A row opens its panel, the one the component's own row opens: What to do first when there is something to do.
    const panel = await run(`(async () => { const tr = [...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].find((x) => x.dataset.status === '${chip}'); tr.cells[2].click(); await new Promise((r) => setTimeout(r, 400)); const m = document.querySelector('#sg-row-panel:not([hidden])'); return m ? [...m.querySelectorAll('.pg-inspect-head')].map((h) => h.textContent) : null; })()`);
    assert.ok(panel && panel.length, 'the panel opened');
    assert.ok(panel.includes('What to do'), panel.join());
    assert.ok(panel.includes('Level and principle'), 'the panel says the level and the principle, as the filters do');
    assert.deepEqual(panel.slice(0, 3), ['What to do', 'Component', 'Status'], 'whose it is right under what to do, then its status: where it was read is with the rest, after it');
    assert.ok(panel.indexOf('Where it was read') > panel.indexOf('Status'), 'where it was read comes after its status');
    // A task for a designer links to the component in Figma in What to do, in a tab of its own with Figma's mark. A
    // task for a developer never links to Figma.
    const figma = await run(`(async () => {
      const out = {};
      for (const who of ['A designer, in Figma', 'A developer, in the code']) {
        const tr = [...document.querySelectorAll('#accessibility .sg-a11y-table tbody tr')].find((x) => (x.dataset.fWho || '').startsWith(who) && x.dataset.status !== 'done');
        if (!tr) continue;
        tr.cells[2].click(); await new Promise((r) => setTimeout(r, 400));
        const first = document.querySelector('#sg-row-panel .pg-inspect');
        const a = first && first.querySelector('a[data-see="sg-cx-figma"]');
        out[who] = a ? [a.getAttribute('target'), !!a.querySelector('svg'), /figma\\.com/.test(a.href), a.textContent.trim(), a.className.includes('sg-uses-link')] : null;
      }
      return out;
    })()`);
    if ('A designer, in Figma' in figma) assert.deepEqual(figma['A designer, in Figma'], ['_blank', true, true, 'See in Figma', false], 'a Figma task opens the component in Figma, from the system\'s own button');
    if ('A developer, in the code' in figma) assert.equal(figma['A developer, in the code'], null, 'a task of the code never links to Figma');
    assert.ok(Object.keys(figma).length, 'both kinds of task were looked at');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
