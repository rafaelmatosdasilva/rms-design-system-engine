// Each change read from the intent layer is kept (the snapshot's changes, newest first, the last 50) and shown on the
// style guide's History as an Intent layer card: the pages it changed, the commit that made it, and the components those
// pages document; each component's own History lists the changes to its page.
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPage } from '../lib/styleguide-files.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('the layer\'s changes on History: a row each in its one table, linked to the components their pages document, and on each component\'s own History', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-intent-history-');
  cpSync(HARBOR, dir, { recursive: true });
  mkdirSync(join(dir, 'docs', 'components'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'components', 'button.md'), '# button\n\nThe next step the person is expected to take.\n\n## When to use\n\n- To submit a form.\n');
  writeFileSync(join(dir, 'docs', 'components', 'saving.md'), '# Saving\n\nSave a long form as a draft.\n');
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  cfg.intentLayer = 'docs';
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const build = () => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // Two changes read before (newest first), as a layer read where it lives keeps them.
  const snapFile = join(dir, 'intent-layer.snapshot.json');
  const snap = JSON.parse(readFileSync(snapFile, 'utf8'));
  snap.changes = [
    { from: 'b0', to: 'c2d4e6f8a0b1', at: '2026-10-31T09:00:00Z', url: 'https://github.com/acme/guidelines/commit/c2d4e6f8a0b1', files: ['docs/components/button.md', 'docs/components/saving.md'], pages: ['button', 'Saving'], by: 'Done by Quokka · pushed by Wombat' },
    { from: 'a0', to: 'b0b1b2b3b4b5', at: '2026-10-20T09:00:00Z', files: ['docs/README.md'], pages: [] },
  ];
  writeFileSync(snapFile, JSON.stringify(snap, null, 2));
  r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readPage(page).match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.intentChanges.map((x) => [x.to, x.pages, x.components, x.files]), [['c2d4e6f8a0b1', ['button', 'Saving'], ['button'], 2], ['b0b1b2b3b4b5', [], [], 1]]);
  // Who did each, beside who answers a decision: a change whose commit names nobody says nothing rather than guessing.
  assert.deepEqual(data.intentChanges.map((x) => x.by ?? null), ['Done by Quokka · pushed by Wombat', null]);
  assert.equal(JSON.parse(readFileSync(snapFile, 'utf8')).changes.length, 2, 'kept as they were while the layer did not move');

  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${page}#history`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#history tr[data-chip="intent"]')`, { attempts: 200 }), true, 'History has its rows');
    // One table, a row each: its date and time, its type, what it did, who did it, what it affects.
    assert.deepEqual(await run(`[...document.querySelectorAll('#history table.sg-log thead th')].map((th) => th.textContent)`), ['Date', 'Type', 'What', 'Done by', 'Affects']);
    const rows = await run(`[...document.querySelectorAll('#history tr[data-chip="intent"]')].map((tr) => [...tr.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()))`);
    assert.equal(rows.length, 2);
    assert.match(rows[0][0], /^2026-10-3[01] \d\d:\d\d$/, 'its day and time, as the reader\'s clock says it');
    assert.deepEqual(rows[0].slice(1), ['Intent layer', '2 pages changed Saving Committed in c2d4e6f8', 'Quokka · pushed by Wombat', 'button']);
    assert.deepEqual(rows[1].slice(1), ['Intent layer', '1 file changed, none of them a page Committed in b0b1b2b3', '', 'No component']);
    assert.equal(await run(`document.querySelectorAll('#history .pg-inspect').length`), 1, 'one table, never a card per change');
    assert.equal(await run(`document.querySelector('#history tr[data-chip="intent"] a[href^="https://github.com/acme/guidelines/commit/"]') !== null`), true, 'its commit linked');
    assert.equal(await run(`document.querySelector('#history tr[data-chip="intent"] a[href="#c-button/documentation"]') !== null`), true, 'the component its page documents');
    // A chip of its own when History has another kind beside it (one kind alone needs none).
    assert.match(templateText(), /var kinds = \[\['code', 'Code'\], \['figma', 'Figma'\], \['intent', 'Intent layer'\], \['decisions', 'Decisions'\]\]/);
    assert.equal(await run(`document.querySelectorAll('#history .sg-chip').length`), 0, 'one kind alone: no chips');
    // The button's own History: the change to its page.
    await run(`location.hash = '#c-button/history'`);
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#c-button .pg-inspect[data-hist="intent"]')`, { attempts: 200 }), true, 'the button\'s History has its row');
    assert.match(await run(`document.querySelector('#c-button .pg-inspect[data-hist="intent"]').innerText.replace(/\\s+/g, ' ')`), /Intent layer c2d4e6f8 Its page and 1 more changed: button, Saving\. 2026-10-31/);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('the code on History: a row each commit, the issues it names, how many commits an issue has (and those alone), its release, its people by one name', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-code-history-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  cfg.changelog = { ticket: '#\\d+|REV-\\d+' };
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const git = (who, ...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: who, GIT_COMMITTER_NAME: who, GIT_AUTHOR_EMAIL: 'a@example.test', GIT_COMMITTER_EMAIL: 'a@example.test' } });
  git('x', 'init', '-q', '-b', 'main');
  git('Setup', 'add', '-A'); git('Setup', 'commit', '-qm', 'The system as it was', '--date', '2026-10-01T09:00:00Z');   // its Figma snapshots: a read of Figma, not a row of the code
  writeFileSync(join(dir, 'notes.md'), 'zero\n'); git('Quokka da Wombat', 'add', '-A'); git('Quokka da Wombat', 'commit', '-qm', '#11 - the tile, first', '--date', '2026-10-15T10:57:00Z');
  git('x', 'tag', 'v1.0.0');
  writeFileSync(join(dir, 'notes.md'), 'one\n'); git('ACME\\wombat', 'add', '-A'); git('ACME\\wombat', 'commit', '-qm', '#11 - the tile, second', '--date', '2026-10-16T14:47:00Z');
  writeFileSync(join(dir, 'notes.md'), 'two\n'); git('quokka.da.wombat', 'add', '-A'); git('quokka.da.wombat', 'commit', '-qm', '[#11 #12 - REV-1] Code review', '--date', '2026-10-17T10:06:00Z');
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
    const { sessionId } = await openPage(send, `file://${page}#history`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#history tr[data-chip="code"]')`, { attempts: 200 }), true, 'History has its rows');
    const rows = async () => run(`[...document.querySelectorAll('#history tr[data-chip="code"]:not([hidden])')].map((tr) => [...tr.cells].slice(1).map((c) => c.innerText.replace(/\\s+/g, ' ').trim()))`);
    const all = await rows();
    assert.equal(all.length, 3, 'a row each commit');
    assert.match(all[0][1], /^#11 · 3 commits #12 REV-1 Code review [0-9a-f]{7}$/, 'every issue it names, each with how many commits it has when more than one, then what it says');
    assert.match(all[2][1], /Released in v1\.0\.0/);
    assert.deepEqual(all.map((x) => x[2]), ['Quokka da Wombat', 'wombat', 'Quokka da Wombat'], 'one person by the name they sign with; a Windows sign-in by its name alone');
    // An issue's count shows its commits alone, and a way back to every change.
    await run(`document.querySelector('#history [data-ticket="#12"], #history [data-ticket="#11"]').click()`);
    assert.equal((await rows()).length, 3);
    assert.match(await run(`document.querySelector('#history .sg-log-only-bar').innerText`), /The commits of #11/);
    await run(`document.querySelector('#history [data-ticket-all]').click()`);
    // Scrolled, the lowest bar paints the gap the table's head sticks under, as over every table: no row shows above the head.
    await run(`window.scrollTo(0, 400); window.dispatchEvent(new Event('scroll'))`);
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#history .sg-sticky-band')`, { attempts: 50 }), true, 'the History table has the band over it');
    assert.equal(await run(`document.querySelector('#history .sg-log-only-bar').hidden`), true);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
