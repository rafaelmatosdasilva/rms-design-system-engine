// The style guide reflows at 320px (WCAG 1.4.10, E20): no page of it is wider than a phone held upright. A bar that
// scrolls sideways (a component's areas) or a code block may scroll inside its own box; the page itself never does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureProject } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });

test('every page of the style guide fits 320px: grids, tab bars and long titles stay inside it', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: 300000 }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'sg-reflow-');
  // A component with a long one-word name, as a real system has (segmentedControlSegment).
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', timeout: 250000, env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readFileSync(file, 'utf8').match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const pages = ['', ...data.components.map((c) => `#c-${c.name}`), '#colors', '#spacing', '#todo'];
  const browser = await launchChrome(CHROME, { tmpPrefix: 'sg-reflow-' });
  const { send, close } = await connectCDP(browser.wsUrl);
  try {
    const { sessionId } = await openPage(send, 'about:blank');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
    const wide = [];
    for (const hash of pages) {
      await send('Page.navigate', { url: pathToFileURL(file).href + hash }, sessionId);
      await waitForTrue(send, sessionId, 'document.readyState === "complete"', { attempts: 200, intervalMs: 50 });
      await new Promise((res) => setTimeout(res, 600));
      // A long title, as the page would have for a component named in one long word.
      await send('Runtime.evaluate', { expression: `(() => { const h = document.querySelector('.sg-section:not([hidden]) h2, .pg-head h2'); if (h) h.textContent = 'segmentedControlSegmentWithALongName'; })()` }, sessionId);
      await new Promise((res) => setTimeout(res, 100));
      const { sw, cw } = (await send('Runtime.evaluate', { expression: '({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })', returnByValue: true }, sessionId)).result.value;
      if (sw > cw) wide.push(`${hash || 'overview'}: ${sw}px in ${cw}px`);
    }
    assert.deepEqual(wide, [], 'pages wider than the screen at 320px');
  } finally { close(); browser.kill(); }
});
