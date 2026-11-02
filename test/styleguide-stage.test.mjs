// Each component's stage worked out: the Tasks page suggests Stable, Beta or Deprecated from what it measures (the
// Status row's Parity, Accessibility and Documentation, and the tests' coverage when the project reports it), and a
// component being retired names what replaces it. No stage shows in a component's header: the one the page measures is
// a task, to set when the team gave none and to look at again when the team's differs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deprecationOf, statusView } from '../lib/styleguide-data.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('what replaces a component being retired: a release that retired it, else a line of Figma or the code naming one the system has', () => {
  const names = ['button', 'iconButton', 'cardTile'];
  assert.deepEqual(deprecationOf({ migration: { toName: 'cardTile' }, names }), { from: 'a release', instead: 'cardTile' });
  const fromCode = statusView({ text: '<!-- @deprecated Use button instead. -->' });
  assert.deepEqual(deprecationOf({ status: fromCode, text: '<!-- @deprecated Use button instead. -->', names }), { from: 'the code', instead: 'button' });
  assert.deepEqual(deprecationOf({ status: { kind: 'deprecated', from: 'Figma' }, description: 'Status: deprecated. Replaced by tiles.', names }).instead, null, 'a name the system does not have as written is not guessed');
  assert.deepEqual(deprecationOf({ status: { kind: 'deprecated', from: 'Figma' }, description: 'Status: deprecated. Replaced by cardTile.', names }), { from: 'Figma', instead: 'cardTile' });
  assert.deepEqual(deprecationOf({ status: { kind: 'deprecated', from: 'Figma' }, description: 'Status: deprecated.', names }), { from: 'Figma', instead: null });
  assert.equal(deprecationOf({ status: { kind: 'beta' }, description: 'Use button instead of a link.', names }), null, 'only a component being retired');
});

test('in the browser: no stage in a component\'s header, and the stage the page measures a task on the Tasks page', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-stage-');
  cpSync(HARBOR, dir, { recursive: true });
  // The icon button retired in its own code, naming the button; the button given a stage by the team.
  const ib = join(dir, 'components', 'HbIconButton.vue');
  const ibText = readFileSync(ib, 'utf8');
  assert.ok(ibText.startsWith('<!--'), 'the fixture opens with its comment');
  writeFileSync(ib, '<!-- Harbor icon button (fictional). @deprecated Use button instead. -->' + ibText.slice(ibText.indexOf('-->') + 3));
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  authored.components.button.status = 'stable';
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored, null, 1));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#c-badge`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    const headerOf = async (id) => {
      await run(`location.hash = '#${id}'`);
      await waitForTrue(send, sessionId, `!!document.querySelector('#${id} .pg-meta')`, { attempts: 200 });
      return run(`document.querySelector('#${id} .pg-meta').innerText.replace(/\\s+/g, ' ').trim()`);
    };
    // No stage in any component's header: not the team's, not the one the page measures.
    for (const id of ['c-badge', 'c-button', 'c-iconButton']) assert.doesNotMatch(await headerOf(id), /\b(Stable|Beta|Deprecated|Suggested)\b/, id);
    // The stage the page measures is a task in its Documentation area: one to set when the team gave none.
    await run(`location.hash = '#c-badge/docs'`);
    const stageRow = `[...document.querySelectorAll('#c-badge .pg-area[data-area="docs"] tbody')].map((b) => b.textContent.replace(/\\s+/g, ' ')).join(' ')`;
    assert.equal(await waitForTrue(send, sessionId, `/Stage/.test(${stageRow})`, { attempts: 300 }), true, 'the stage is a task');
    // Opened, it says what the page measures and where the team sets it.
    await run(`[...document.querySelectorAll('#c-badge .pg-area[data-area="docs"] tr')].find((r) => /Stage/.test(r.textContent)).click()`);
    const opened = `document.body.innerText.replace(/\\s+/g, ' ')`;
    assert.equal(await waitForTrue(send, sessionId, `/No stage yet/.test(${opened})`, { attempts: 100 }), true, 'its words');
    assert.match(await run(opened), /No stage yet: what the page measures makes it (Beta|Stable) \(.+?\)\..*?Set its status in contract\.authored\.json \((beta|stable)\)\./);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
