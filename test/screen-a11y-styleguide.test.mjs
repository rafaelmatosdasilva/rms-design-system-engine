// The designed screens, read for accessibility (--figma-a11y), reach the style guide: each problem a task for whoever
// keeps the Figma file, saying the screen, the layer and the criterion, and opening that layer in Figma from its panel,
// as a component's Figma task opens its node. A task of the code never links to Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { screenA11yFindings, screenA11yTodos } from '../lib/screen-a11y.mjs';
import { WCAG22 } from '../lib/wcag21.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
// One screen: grey words on white, and an icon button drawn 16 by 16.
const SNAP = { screens: [{ id: '10:1', name: 'Checkout', inks: [{ k: 't', ex: 'Pay now', fg: [150, 150, 150, 1], on: [[255, 255, 255, 1]], s: 14, w: 400, n: 2, ids: ['10:9'] }],
  small: [{ c: 'iconButton', w: 16, h: 16, n: 1, ids: ['10:7'] }] }] };
const link = (id) => `https://www.figma.com/design/AbCd1234?node-id=${id.replace(':', '-')}`;

test('each problem on a designed screen is a task for whoever keeps the Figma file, opening its own layer', () => {
  const todos = screenA11yTodos(screenA11yFindings(SNAP), { linkOf: link, wcag: WCAG22 });
  assert.equal(todos.length, 2);
  assert.deepEqual(todos.map((t) => [t.area, t.type, t.who, t.wcag, t.figmaUrl]), [
    ['Accessibility', '1.4.3 Contrast (Minimum), on the "Checkout" screen', 'figma', '1.4.3', link('10:9')],
    ['Accessibility', '2.5.8 Target Size (Minimum), on the "Checkout" screen', 'figma', '2.5.8', link('10:7')],
  ]);
  assert.match(todos[0].found, /^"Pay now" \(2 times\) is 2\.96:1 \(#969696 on #ffffff\), and it needs 4\.5:1\.$/, 'what was measured is what the check found');
  assert.equal(todos[0].say, WCAG22.find((k) => k.sc === '1.4.3').says, 'why: what the criterion asks, in its plain words');
  assert.match(todos[1].todo, /^In Figma, make it at least 24×24/);
  for (const t of todos) assert.ok(!/;/.test(t.say + t.todo + t.found), 'no ";" in the style guide\'s own words');
  // With no file key there is no link, and the task still stands.
  assert.equal(screenA11yTodos(screenA11yFindings(SNAP))[0].figmaUrl, null);
  // A problem with no layer of its own (nothing drawn behind the screen) opens the screen.
  const bare = screenA11yTodos(screenA11yFindings({ screens: [{ id: '11:1', name: 'Empty', inks: [{ k: 't', ex: 'Hi', fg: [0, 0, 0, 1], on: [], s: 14, w: 400 }] }] }), { linkOf: link });
  assert.equal(bare[0].figmaUrl, link('11:1'));
});

test('in Chrome: the screen\'s task opens its layer in Figma, from the system\'s own button', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-screen-a11y-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfgPath = join(dir, 'ds-config.json');
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, 'utf8')), figmaFileKey: 'AbCd1234' }, null, 2));
  writeFileSync(join(dir, 'figma', 'figma-screen-a11y.snapshot.json'), JSON.stringify(SNAP));
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
    const { sessionId } = await openPage(send, `file://${page}#status`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    const row = `[...document.querySelectorAll('tr[data-row-detail]')].find((tr) => /1\\.4\\.3 Contrast \\(Minimum\\), on the "Checkout" screen/.test(tr.textContent))`;
    assert.equal(await waitForTrue(send, sessionId, `!!(${row})`, { attempts: 600 }), true, 'the screen\'s problem is a row');
    const seen = await run(`(async () => {
      const tr = ${row}; tr.scrollIntoView(); (tr.cells[2] || tr.cells[0]).click(); await new Promise((r) => setTimeout(r, 400));
      const m = document.querySelector('#sg-row-panel:not([hidden])'), a = m && m.querySelector('a[data-see="sg-cx-figma"]');
      return { open: !!m, found: m ? m.innerText.includes('"Pay now" (2 times) is 2.96:1') : false, who: tr.cells[2].textContent.trim(), a: a ? [a.getAttribute('target'), a.href, a.textContent.trim(), !!a.querySelector('svg')] : null };
    })()`);
    assert.equal(seen.open, true, 'its panel opened');
    assert.equal(seen.who, 'You in Figma');
    assert.equal(seen.found, true, 'the panel says what was measured');
    assert.deepEqual(seen.a, ['_blank', link('10:9'), 'See in Figma', true], 'it opens the layer in Figma, in a tab of its own, with Figma\'s mark');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
