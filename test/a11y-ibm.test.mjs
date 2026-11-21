// IBM's Equal Access Checker beside axe-core and the engine's own checks (a11y-ibm.mjs): what it confirms, what only it
// finds and what only the others find, and the pinned copy run for real in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ibmFindings, ibmIntact, fetchIbmSource, IBM_JS, IBM_VERSION } from '../lib/a11y-ibm.mjs';
import { WCAG21_KIND } from '../lib/wcag21.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const CHROME = findChrome({ playwright: true });

test('an element and a criterion IBM shares with another check is confirmed, the rest is said as whose it is', () => {
  const results = [
    { rule: 'text_contrast_sufficient', level: 'FAIL', sc: ['1.4.3'], desc: 'p.low', message: 'Text contrast of 2.32' },
    { rule: 'img_alt_valid', level: 'FAIL', sc: ['1.1.1'], desc: 'img.logo', message: 'The image has no name' },
    { rule: 'style_color_misuse', level: 'POTENTIAL', sc: ['1.4.1'], desc: 'p.low', message: 'Verify colour is not alone' },
  ];
  const engine = [{ kind: 'contrast', desc: 'p.low' }, { kind: 'name', desc: 'button.icon' }];
  const axe = [{ kind: 'axe:image-alt', wcag: '1.1.1', elements: ['img.logo'] }];
  const got = ibmFindings(results, engine, axe, WCAG21_KIND);
  assert.deepEqual(got.confirmed.map((c) => [c.by, c.ibm]), [['engine', 'text_contrast_sufficient'], ['axe-core', 'img_alt_valid']]);
  assert.deepEqual(got.rows.map((r) => [r.kind, r.severity, r.wcag]), [['ibm:style_color_misuse', 'advisory', '1.4.1']], 'a "verify this" of its own is advice');
  assert.deepEqual(got.summary, { confirmed: 2, onlyIbm: 1, onlyOthers: 1 }, 'the button only the engine raised');
  // A finding whose words are not its element (a control with no name) is matched by the element it carries, under any
  // of the criteria its kind stands for.
  const named = ibmFindings([{ rule: 'input_label_exists', level: 'FAIL', sc: ['4.1.2'], desc: 'button', message: '' }], [{ kind: 'name', el: 'button', desc: '<button> with no accessible name' }], [], { name: ['1.1.1', '4.1.2', '3.3.2'] });
  assert.equal(named.summary.confirmed, 1);
  // The same element under another criterion is not the same problem.
  assert.equal(ibmFindings([{ rule: 'x', level: 'FAIL', sc: ['2.4.7'], desc: 'p.low', message: '' }], engine, [], WCAG21_KIND).summary.confirmed, 0);
  assert.equal(ibmFindings([{ rule: 'x', level: 'FAIL', sc: ['2.4.7'], desc: 'p.low', message: '' }], [], [], {}).rows[0].severity, 'warning', 'a failure only it raised never stops a run');
});

test('only the pinned copy runs: a changed file is refused, and nothing is fetched unless asked', async () => {
  assert.equal(ibmIntact('not the checker'), false);
  const home = tempDir('ibm-home-');
  try {
    let asked = 0;
    assert.equal(await fetchIbmSource({}, { home, fetchImpl: async () => { asked++; return { ok: true, text: async () => 'x' }; } }), null);
    assert.equal(asked, 0, 'a run never downloads it');
    assert.equal(await fetchIbmSource({}, { home, download: true, fetchImpl: async () => ({ ok: true, text: async () => 'tampered', arrayBuffer: async () => new ArrayBuffer(0) }) }), null, 'a file that is not the pinned one is never kept');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test(`in a real browser: IBM's rules ${IBM_VERSION} run on a page and confirm what the engine's own check raised`, { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(180000) }, async () => {
  // Into a home of its own: the computer's own cache is left as it was, so no other test finds IBM installed.
  const home = tempDir('ibm-cache-');
  const src = await fetchIbmSource({}, { download: true, home });
  assert.ok(src, 'the pinned copy is fetched (online) or already cached');
  const dir = tempDir('ibm-page-');
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><html lang="en"><head><title>t</title></head><body><main><p class="low" style="color:#aaa;background:#fff">Low contrast words</p><img class="logo" src="x.png"></main></body></html>');
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    await send('Runtime.evaluate', { expression: src }, sessionId);
    const v = (await send('Runtime.evaluate', { expression: IBM_JS(null), awaitPromise: true, returnByValue: true }, sessionId)).result.value;
    const results = JSON.parse(v);
    assert.ok(results.some((r) => r.rule === 'text_contrast_sufficient' && r.sc.includes('1.4.3') && r.desc === 'p.low'), v);
    assert.ok(results.some((r) => r.sc.includes('1.1.1') && r.desc === 'img.logo'), v);
    const got = ibmFindings(results, [{ kind: 'contrast', desc: 'p.low' }], [], WCAG21_KIND);
    assert.ok(got.confirmed.some((c) => c.kind === 'contrast'), 'the engine\'s contrast finding is confirmed');
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); }
});
