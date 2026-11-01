// Each component's stage worked out: the page suggests Stable, Beta or Deprecated from what it measures (the
// Status row's Parity, Accessibility and Documentation, and the tests' coverage when the project reports it), and a
// component being retired names what replaces it. The team's own stage is never replaced: the suggestion is said beside
// it only when they differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deprecationOf, statusView } from '../styleguide-data.mjs';
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

test('in the browser: a stage suggested from what the page measures, the team\'s own kept, and a retired one naming its replacement', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-stage-');
  cpSync(HARBOR, dir, { recursive: true });
  // The icon button retired in its own code, naming the button; the button given a stage by the team.
  const ib = join(dir, 'components', 'HbIconButton.vue');
  writeFileSync(ib, readFileSync(ib, 'utf8').replace(/^<!--[\s\S]*?-->/, '<!-- Harbor icon button (fictional). @deprecated Use button instead. -->'));
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
    const stageOf = async (id) => {
      await run(`location.hash = '#${id}'`);
      await waitForTrue(send, sessionId, `(() => { const p = document.querySelector('#${id} .pg-status'); return !!p && !p.hidden; })()`, { attempts: 200 });
      return run(`(() => { const p = document.querySelector('#${id} .pg-status'); return [p.querySelector('.sg-status') ? p.querySelector('.sg-status').className : '', p.innerText.replace(/\\s+/g, ' ').trim()]; })()`);
    };
    // No stage from the team: one suggested, outlined, with what it rests on and how the team makes it its own.
    const [badgeCls, badge] = await stageOf('c-badge');
    assert.match(badgeCls, /sg-status--suggested/);
    assert.match(badge, /^(Beta Suggested from (Parity|Accessibility|Documentation) \w+.*|Stable Suggested from Parity Match.*)\. The team makes it its own with status in contract\.authored\.json\.$/);
    // The team's stage kept, the page's own said beside it when it differs.
    const [buttonCls, button] = await stageOf('c-button');
    assert.doesNotMatch(buttonCls, /sg-status--suggested/);
    assert.match(button, /^Stable( From what the page measures it would be Beta \(.+\)\.)?/);
    // Retired in its code: Deprecated, and what replaces it.
    const [, icon] = await stageOf('c-iconButton');
    assert.match(icon, /^Deprecated Use button instead\.$/);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
