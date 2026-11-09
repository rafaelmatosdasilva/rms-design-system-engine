// A prototype is clicked before it is shown. The check drew the page at every width and never used it, so a menu
// toggle that did nothing and a chip whose close button did nothing reached the reviewer looking finished — found by
// hand, which is the time the check should have spent. These run the real expression in a real browser, because a
// check whose whole job is clicking is not proved by formatting its sentences.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { INTERACT_EXPRESSION, interactionLines } from '../lib/prototype-render.mjs';

const CHROME = process.env.CHROME_PATH || findChrome({ playwright: true });
const NO_BROWSER = !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false;

// One browser for the file, not one a test: each launch is a second of a suite that already fights itself for the
// machine, and the test next door measures a page against a 30-second clock.
let browser = null, send = null, close = null;
before(async () => {
  if (NO_BROWSER) return;
  browser = await launchChrome(CHROME, { tmpPrefix: 'page-driven-' });
  ({ send, close } = await connectCDP(browser.wsUrl));
});
after(() => { try { close?.(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } });

// The page, driven: writes `html`, opens it in a tab of its own, runs the expression against `root`, closes the tab.
async function drive(html, root = '#page') {
  const dir = tempDir('page-driven-');
  const page = join(dir, 'p.html');
  writeFileSync(page, `<!doctype html><body>${html}</body>`);
  const { targetId, sessionId } = await openPage(send, pathToFileURL(page).href);
  try {
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const r = await send('Runtime.evaluate', { expression: INTERACT_EXPRESSION(root), awaitPromise: true, returnByValue: true }, sessionId);
    return r.result?.value ?? [];
  } finally { try { await send('Target.closeTarget', { targetId }); } catch { /* gone */ } }
}

test('a control that changes nothing when clicked is named, and one that changes something is not', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  const found = await drive(`
    <div id="page">
      <button id="dead">Sort by name</button>
      <button id="live" onclick="document.getElementById('rows').textContent = 'sorted'">Sort by date</button>
      <div id="rows">unsorted</div>
    </div>`);
  const acts = found.filter((i) => i.kind === 'acts');
  assert.equal(acts.length, 2, 'both buttons were clicked');
  assert.equal(acts.find((a) => /name/.test(a.by))?.changed, false, 'the one that does nothing');
  assert.equal(acts.find((a) => /date/.test(a.by))?.changed, true, 'the one that does something');
  assert.deepEqual(interactionLines(found), ['⚠️  "Sort by name" changes nothing on the page when it is clicked']);
});

test('the checks that read what a control says about itself still run, and nothing is clicked twice', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  const found = await drive(`
    <div id="page">
      <button id="t" aria-pressed="false" onclick="this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')">Bold</button>
      <button id="stuck" aria-pressed="false">Italic</button>
    </div>`);
  assert.deepEqual(found.filter((i) => i.kind === 'toggle').map((i) => [i.by, i.flips]), [['Bold', true], ['Italic', false]]);
  // A toggle is judged by its own attribute and already clicked twice: clicking it again as an unknown control
  // would undo it and say nothing, so it is left out.
  assert.deepEqual(found.filter((i) => i.kind === 'acts'), [], 'a toggle is not clicked a third time');
  assert.deepEqual(interactionLines(found), ['⚠️  "Italic" does not turn on and off when clicked']);
});

test('a row and a list-wide checkbox are driven too, which say nothing about themselves in their markup', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  const found = await drive(`
    <div id="page">
      <table>
        <thead><tr><th aria-sort="none" id="h">Name</th></tr></thead>
        <tbody><tr tabindex="0" id="r"><td>a row that opens nothing</td></tr></tbody>
      </table>
      <input type="checkbox" id="all" aria-label="Mark every line">
    </div>`);
  const by = Object.fromEntries(found.filter((i) => i.kind === 'acts').map((i) => [i.by, i.changed]));
  // A checkbox changes its own checked state, which is a change; a sortable header and a row that wire nothing do not.
  assert.equal(Object.keys(by).length, 3, `three controls driven, got ${Object.keys(by).join(', ')}`);
  assert.equal(by['Name'], false, 'a sortable header that sorts nothing');
  assert.ok('Mark every line' in by, 'a checkbox over the list is driven');
  assert.match(interactionLines(found).join('\n'), /"Name" changes nothing on the page when it is clicked/);
});

test('a page the root does not match is no findings, never a crash', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  assert.deepEqual(await drive('<div id="somewhere-else"><button>Go</button></div>'), []);
});

test('the line for a control that does nothing', () => {
  assert.deepEqual(interactionLines([{ kind: 'acts', by: 'Load more', changed: false }, { kind: 'acts', by: 'Next', changed: true }]),
    ['⚠️  "Load more" changes nothing on the page when it is clicked']);
});
