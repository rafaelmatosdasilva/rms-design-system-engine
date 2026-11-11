// A prototype written in the product's own code, opened so a person can look at it. The route wrote the page and
// checked it and left nowhere to see it: on the run this came from, the agent built a preview by hand, and reviewing
// the page in it is where the owner found most of what the check missed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { previewScript, previewLines, previewPage, GAP_SELECTOR } from '../lib/page-preview.mjs';

const CHROME = process.env.CHROME_PATH || findChrome({ playwright: true });
const NO_BROWSER = !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false;

test('the gaps it draws are the ones already written in the page', () => {
  // Both are in the DOM: the overlay outlines what is there rather than guessing where a need belongs.
  assert.equal(GAP_SELECTOR, '[data-missing], [data-gap-part]');
});

test('what the person is told: where to look, and what they are looking at', () => {
  const withGaps = previewLines({ url: 'http://localhost:5173/x', gaps: 2 }).join('\n');
  assert.match(withGaps, /Preview: http:\/\/localhost:5173\/x/);
  assert.match(withGaps, /2 gaps are drawn on it where they sit/);
  assert.match(withGaps, /the page the check measured/, 'not a second rendering of it');
  assert.match(previewLines({ url: 'u', gaps: 0 }).join('\n'), /No gaps: every part of this page is the system's/);
  assert.match(previewLines({ url: 'u', gaps: 1 }).join('\n'), /1 gap is drawn/);
});

test('a page the preview cannot draw says why, and never guesses', async () => {
  const r = await previewPage('/nowhere', {}, 'page.svelte');
  assert.match(r.why, /has no preview yet/);
  assert.equal(r.url, undefined);
});

test('the overlay outlines each gap, labels it with what is needed, and counts them', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  const dir = tempDir('page-preview-');
  const page = join(dir, 'p.html');
  writeFileSync(page, `<!doctype html><body>
    <div data-missing="a date range picker">nothing here</div>
    <span data-gap-part="a count beside the title">Title</span>
    <p>an ordinary part of the page</p>
  </body>`);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'page-preview-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const count = (await send('Runtime.evaluate', { expression: previewScript([]), returnByValue: true }, sessionId)).result?.value;
    assert.equal(count, 2, 'the two gaps, not the ordinary paragraph');
    const read = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true }, sessionId)).result?.value;
    assert.equal(await read('document.querySelectorAll("[data-dse-gap-outline]").length'), 2);
    const labels = await read('[...document.querySelectorAll("[data-dse-gap-label]")].map((x) => x.textContent).join("|")');
    assert.match(labels, /a date range picker/, 'the label says what is needed, from the page itself');
    assert.match(labels, /a count beside the title/);
    assert.match(await read('document.querySelector("[data-dse-gap-note]").textContent'), /2 gaps/);
    close();
  } finally { try { browser.kill(); } catch { /* gone */ } }
});

test('a page with nothing missing says so, rather than showing an empty overlay', { skip: NO_BROWSER, timeout: budget(60000) }, async () => {
  const dir = tempDir('page-preview-clean-');
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><body><p>every part of this is the system\'s</p></body>');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'page-preview-clean-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    assert.equal((await send('Runtime.evaluate', { expression: previewScript([]), returnByValue: true }, sessionId)).result?.value, 0);
    const note = (await send('Runtime.evaluate', { expression: 'document.querySelector("[data-dse-gap-note]").textContent', returnByValue: true }, sessionId)).result?.value;
    assert.match(note, /No gaps/);
    close();
  } finally { try { browser.kill(); } catch { /* gone */ } }
});
