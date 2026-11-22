// What a person meets with the settings they use (user-settings.mjs): zoomed in, with a magnifier, and in forced
// colours with an error shown only by its colour. Each page is drawn in a real browser under the setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ZOOM_LEVELS, ZOOM_HIDDEN_JS, FAR_MESSAGE_JS } from '../lib/user-settings.mjs';
import { forcedStateExpression, severityOf } from '../lib/a11y-check.mjs';
import { BEYOND_KIND } from '../lib/wcag21.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const CHROME = findChrome({ playwright: true });
const HAS = CHROME && typeof WebSocket !== 'undefined';

test('each is advice on its own row, never an AA criterion', () => {
  for (const k of ['zoomhidden', 'farmessage']) { assert.equal(severityOf(k), 'advisory'); assert.equal(BEYOND_KIND[k], 'Zoom and magnification'); }
  assert.deepEqual(ZOOM_LEVELS.map((z) => [z.zoom, z.width]), [[200, 640], [400, 320]]);
});

async function onPage(html, fn) {
  const dir = tempDir('user-settings-');
  const page = join(dir, 'p.html');
  writeFileSync(page, html);
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    return await fn({ send, sessionId, ev });
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
}

test('in a real browser: zoomed to 400%, a Save button under a footer that stays on screen is said, and one that scrolls clear is not', { skip: HAS ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const page = (footer) => `<!doctype html><html><body style="margin:0;font:16px sans-serif"><form style="padding-bottom:${footer ? 0 : 120}px">${'<p>Some words to read in the form.</p>'.repeat(8)}<button type="submit">Save</button></form>${footer ? '<div class="cookie" style="position:fixed;left:0;right:0;bottom:0;height:90px;background:#eee">We use cookies</div>' : ''}</body></html>`;
  for (const [footer, want] of [[true, 1], [false, 0]]) {
    const got = await onPage(page(footer), async ({ send, sessionId, ev }) => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 200, deviceScaleFactor: 1, mobile: false }, sessionId);
      return ev(ZOOM_HIDDEN_JS(null));
    });
    assert.equal(got.filter((d) => /Save/.test(d)).length, want, JSON.stringify(got));
  }
});

test('in a real browser: a field whose message sits at the top of the page is out of a magnifier\'s view, one beside it is not', { skip: HAS ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const got = await onPage(`<!doctype html><html><body style="margin:0;width:1200px">
    <p id="far" style="margin:0">Email is not valid</p><div style="height:600px"></div>
    <input class="far" aria-invalid="true" aria-describedby="far">
    <input class="near" aria-invalid="true" aria-describedby="near"><span id="near">Name is needed</span>
  </body></html>`, ({ ev }) => ev(FAR_MESSAGE_JS(null)));
  assert.equal(got.length, 1, JSON.stringify(got));
  assert.match(got[0], /input\.far .*Email is not valid/);
});

test('in a real browser: in forced colours, an error shown only by its border colour looks like the fields beside it, and one with its message does not count', { skip: HAS ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const got = await onPage(`<!doctype html><html><head><style>.f{border:2px solid #888}.f[aria-invalid=true]{border-color:#c00}</style></head><body>
    <div><input class="f" aria-invalid="true"></div><div><input class="f"></div>
    <div><input class="f" aria-invalid="true" aria-describedby="m"><span id="m">Too short</span></div>
  </body></html>`, async ({ send, sessionId, ev }) => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] }, sessionId);
    return ev(forcedStateExpression(null));
  });
  assert.equal(got.filter((d) => /\(invalid\)/.test(d)).length, 1, JSON.stringify(got));
});
