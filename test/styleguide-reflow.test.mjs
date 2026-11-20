// The style guide reflows at 320px (WCAG 1.4.10): no page of it is wider than a phone held upright. A bar that
// scrolls sideways (a component's areas) or a code block may scroll inside its own box; the page itself never does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureProject, budget } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { readPage } from '../lib/styleguide-files.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });

test('every page of the style guide fits 320px: grids, tab bars and long titles stay inside it', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(300000) }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'sg-reflow-');
  // A component with a long one-word name, as a real system has (segmentedPickerOption).
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readPage(file).match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const pages = ['', ...data.components.map((c) => `#c-${c.name}`), '#colors', '#spacing', '#status'];
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
      await send('Runtime.evaluate', { expression: `(() => { const h = document.querySelector('.sg-section:not([hidden]) h2, .pg-head h2'); if (h) h.textContent = 'segmentedPickerOptionWithALongName'; })()` }, sessionId);
      await new Promise((res) => setTimeout(res, 100));
      const { sw, cw } = (await send('Runtime.evaluate', { expression: '({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })', returnByValue: true }, sessionId)).result.value;
      if (sw > cw) wide.push(`${hash || 'overview'}: ${sw}px in ${cw}px`);
    }
    assert.deepEqual(wide, [], 'pages wider than the screen at 320px');
  } finally { close(); browser.kill(); }
});

// Found on a published guide and on Harbor (16 November 2026): on the Identity page the personality's claim was drawn
// over its own heading and its chart's labels ran into each other, its two large colour cards were colours inside a
// component, and the Status page's four cards, held to the window's width, spilled their words past their edge on a
// 1280px laptop.
test('the Identity and Status pages at laptop widths: nothing drawn over anything, nothing past its card', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(300000) }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), 'sg-laptop-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'sg-laptop-' });
  const { send, close } = await connectCDP(browser.wsUrl);
  try {
    const { sessionId } = await openPage(send, 'about:blank');
    const look = async (w, h, hash, expression) => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
      await send('Page.navigate', { url: pathToFileURL(file).href + hash }, sessionId);
      await waitForTrue(send, sessionId, 'document.readyState === "complete"', { attempts: 200, intervalMs: 50 });
      await new Promise((res) => setTimeout(res, 1200));
      return (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    };
    const identity = await look(1600, 900, '#identity', `(() => {
      const p = document.querySelector('#identity .sg-bk-pers'); const box = (e) => e.getBoundingClientRect();
      const labs = [...p.querySelectorAll('.sg-bk-pers-l')].map((l) => [l.textContent, box(l)]), hits = [];
      for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) { const a = labs[i][1], b = labs[j][1]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(labs[i][0] + '/' + labs[j][0]); }
      const cards = [...document.querySelectorAll('#identity .sg-bk-t, #identity .sg-bk-swatch')].map((c) => c.innerText).join('\\n');
      const names = cards.match(/[\\w-]+(?:\\/[\\w-]+)+/g) ?? [];
      return { claimTop: box(p.querySelector('.sg-bk-pers-t')).top, headBottom: box(p.querySelector('.sg-bk-pers-h')).bottom, hits, names };
    })()`);
    assert.ok(identity.claimTop >= identity.headBottom, `the claim under its heading: ${JSON.stringify(identity)}`);
    assert.deepEqual(identity.hits, [], "no two of the chart's labels on each other");
    assert.ok(!identity.names.some((n) => /^(button|badge|iconbutton)/i.test(n)), `no colour of a component as the system's: ${identity.names.join(', ')}`);
    assert.equal(new Set(identity.names).size, identity.names.length, `no colour twice: ${identity.names.join(', ')}`);
    const status = await look(1280, 720, '#status', `(() => [...document.querySelectorAll('#status .sg-health-tiles > *')].map((c) => {
      const edge = c.getBoundingClientRect().right, num = c.querySelector('.sg-health-num');
      const spill = !!num && [...num.children].some((k) => k.getBoundingClientRect().right > edge + 0.5);
      const wrap = [...c.querySelectorAll('[data-go-area]')].some((b) => b.getBoundingClientRect().height > (parseFloat(getComputedStyle(b).lineHeight) || 20) * 1.5);
      return (spill ? 'spills' : '') + (wrap ? 'wraps' : '') || 'ok';
    }))()`);
    assert.ok(status.length && status.every((s) => s === 'ok'), `every Status card holds its words at 1280: ${status.join(', ')}`);
  } finally { close(); browser.kill(); }
});
