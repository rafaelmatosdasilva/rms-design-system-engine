// Each change read from the intent layer is kept (the snapshot's changes, newest first, the last 50) and shown on the
// style guide's History as an Intent layer card: the pages it changed, the commit that made it, and the components those
// pages document; each component's own History lists the changes to its page.
import { test } from 'node:test';
import { templateText } from '../styleguide-template.mjs';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPage } from '../styleguide-files.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('the layer\'s changes on History: a card each, linked to the components their pages document, and on each component\'s own History', { timeout: budget(300000) }, async (t) => {
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
    { from: 'b0', to: 'c2d4e6f8a0b1', at: '2026-10-31T09:00:00Z', url: 'https://github.com/acme/guidelines/commit/c2d4e6f8a0b1', files: ['docs/components/button.md', 'docs/components/saving.md'], pages: ['button', 'Saving'] },
    { from: 'a0', to: 'b0b1b2b3b4b5', at: '2026-10-20T09:00:00Z', files: ['docs/README.md'], pages: [] },
  ];
  writeFileSync(snapFile, JSON.stringify(snap, null, 2));
  r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readPage(page).match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.intentChanges.map((x) => [x.to, x.pages, x.components, x.files]), [['c2d4e6f8a0b1', ['button', 'Saving'], ['button'], 2], ['b0b1b2b3b4b5', [], [], 1]]);
  assert.equal(JSON.parse(readFileSync(snapFile, 'utf8')).changes.length, 2, 'kept as they were while the layer did not move');

  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
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
    const cards = await run(`[...document.querySelectorAll('#history .pg-inspect')].filter((c) => c.querySelector('tr[data-chip="intent"]')).map((c) => c.querySelector('.pg-inspect-head').textContent + ' | ' + c.querySelector('tbody').innerText.replace(/\\s+/g, ' ').trim())`);
    assert.deepEqual(cards, ['Intent layer2026-10-31 | 2 pages changed Saving Committed in c2d4e6f8 button', 'Intent layer2026-10-20 | 1 file changed, none of them a page Committed in b0b1b2b3 No component']);
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
