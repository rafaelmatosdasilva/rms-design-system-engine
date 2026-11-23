// A Showroom screen is drawn in a frame as wide as the screen, so its @media rules, its vw and its fixed parts read the
// screen's width, never the style guide's window (06-overview.js screenFrame). Before, a screen designed at 640px was
// drawn inside a 1600px window, and every rule for a narrow screen read 1600.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureProject, budget } from './helpers.mjs';
import { readPage } from '../lib/styleguide-files.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('in the browser: a Showroom screen reads its own width in its frame, and its pins sit on its parts', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'sr-frame-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
  const b = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const html = readPage(file);
  const tag = /<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/;
  const data = JSON.parse(tag.exec(html)[1]);
  // A phone screen whose layout changes under 700px, and a note pinned on its button.
  data.showroom = [{ key: 'Phone', title: 'Phone', size: [375, 700],
    markup: '<style>.row{display:flex}@media (max-width:700px){.row{display:block}}</style><main class="row"><h1>Pay</h1><button data-figma="buttonPrimary" style="margin-left:100px">Pay</button></main>',
    missing: [{ name: 'buttonPrimary', what: 'a note on the button' }] }];
  writeFileSync(file, html.replace(tag, () => `<script type="application/json" id="sg-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`));
  const browser = await launchChrome(chromePath, { tmpPrefix: 'sr-frame-' });
  const cdp = await connectCDP(browser.wsUrl);
  try {
    const { sessionId } = await openPage(cdp.send, pathToFileURL(file).href + '#showroom');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitForTrue(cdp.send, sessionId, FILE_PAGE_LOADED, { attempts: 400, intervalMs: 50 });
    const r = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(1200);
      // The grid's card: its screen in a frame too.
      const card = document.querySelector('.sg-showroom-thumb .sg-showroom-frame');
      const cardRow = card && card.contentDocument.querySelector('.row');
      window.__dseShowroomFrame = 'laptop';
      location.hash = '#showroom/Phone';
      await wait(800);
      const fr = document.querySelector('.sg-showroom-detail .sg-showroom-frame[data-screen="Phone"]');
      const sc = fr && fr.contentDocument.querySelector('.sg-showroom-screen');
      const row = sc && sc.querySelector('.row');
      // The colour mode the page switches reaches the frame.
      document.documentElement.setAttribute('data-theme', 'dark');
      await wait(100);
      const theme = fr && fr.contentDocument.documentElement.getAttribute('data-theme');
      // Its differences shown: the pin over the button, in the page's own coordinates.
      document.querySelector('[data-differences]').click();
      await wait(300);
      const pin = document.querySelector('.sg-pin'), btn = sc && sc.querySelector('button');
      const f = fr.getBoundingClientRect(), k = f.width / fr.offsetWidth, br = btn.getBoundingClientRect(), pr = pin && pin.getBoundingClientRect();
      return JSON.stringify({
        windowWidth: innerWidth, frameWidth: fr && fr.offsetWidth, inner: fr && fr.contentWindow.innerWidth,
        display: row && fr.contentWindow.getComputedStyle(row).display,
        cardDisplay: cardRow && card.contentWindow.getComputedStyle(cardRow).display,
        theme, pinDx: pr ? Math.round(pr.left - (f.left + br.left * k)) : null, pinDy: pr ? Math.round(pr.top - (f.top + br.top * k)) : null,
      });
    })()` }, sessionId);
    const got = JSON.parse(r.result.value);
    assert.equal(got.windowWidth, 1600, 'the style guide\'s window');
    assert.equal(got.frameWidth, 375, 'the frame as wide as the screen');
    assert.equal(got.inner, 375, 'the screen\'s own window');
    assert.equal(got.display, 'block', 'the rule for a narrow screen holds: it reads the screen\'s 375px, not the window\'s 1600');
    assert.equal(got.cardDisplay, 'block', 'and in the grid\'s card');
    assert.equal(got.theme, 'dark', 'the page\'s colour mode reaches the frame');
    // The pin is drawn 12px into its part's box (placePins), wherever the frame sits and however it is scaled.
    assert.ok(got.pinDx >= 0 && got.pinDx <= 24 && got.pinDy >= 0 && got.pinDy <= 24, `the pin on the button: ${got.pinDx}, ${got.pinDy}`);
  } finally { cdp.close(); browser.kill(); }
});
