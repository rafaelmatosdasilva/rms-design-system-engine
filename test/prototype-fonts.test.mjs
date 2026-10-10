// The design's fonts never hold a prototype up: a font installed on the machine is used as it is, one the system's CSS
// ships comes from it, any other is asked of Google Fonts in the background; the page draws at once in the system's own
// stack meanwhile, and a font found nowhere (not installed, not served, no network) is said on the page and by the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prototypePage, fontLoader, fontLines, shippedFamilies, designFamilies } from '../prototype.mjs';
import { fontStack, systemFamily, systemScales } from '../prototype-pieces.mjs';
import { FONTS_IN } from '../prototype-render.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const CHROME = findChrome({ playwright: true });

test('the design\'s family is set with the system\'s own stack behind it, so the page reads while the font loads', () => {
  const css = ':root { --font-family: Inter; } body { font-family: var(--font-family), ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }';
  assert.equal(systemFamily(css), 'Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif', 'the variable\'s own declaration is no family the system sets');
  assert.equal(fontStack('Inter', systemFamily(css)), 'Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif');
  assert.equal(fontStack('Source Sans 3', null), '"Source Sans 3", sans-serif', 'a name of more than one word is quoted; a generic family last');
  assert.equal(fontStack('Georgia, serif', 'Inter, sans-serif'), 'Georgia, serif, Inter, sans-serif');
  assert.equal(fontStack(null, 'Inter, sans-serif'), null);
  const scales = systemScales({}, { typography: { 'body/m': { size: '14px', weight: 400, lh: '20px', family: 'Inter' } } }, css);
  assert.equal(scales.family, 'Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif');
  assert.equal(scales.text[0].family, scales.family);
  assert.equal(systemScales({}, {}, '').family, null);
});

test('where each family comes from: the machine, the system\'s @font-face, else Google; one found nowhere is said', () => {
  assert.deepEqual(designFamilies({ family: '"Brand Sans", sans-serif', text: [{ family: 'brand sans' }, { family: 'Inter' }, { family: 'Arial' }] }), ['Brand Sans', 'Inter']);
  assert.deepEqual(shippedFamilies('@font-face { font-family: "Brand Sans"; src: url(brand.woff2); } /* @font-face { font-family: Old } */ body { font-family: Inter }'), ['Brand Sans']);
  assert.match(fontLoader({ family: 'Brand Sans, Inter, sans-serif', text: [{ family: 'Inter' }] }, { css: '@font-face { font-family: "Brand Sans"; src: url(b.woff2) }' }), /\(\[\{"family":"Brand Sans","shipped":true\},\{"family":"Inter"\}\], true\);/);
  assert.deepEqual(fontLines({ Inter: 'installed', Brand: 'google' }), []);
  assert.deepEqual(fontLines({ Brand: 'missing', Inter: 'installed' }, { family: 'Brand, ui-sans-serif, sans-serif' }), [
    '🔤 Brand is not installed on this machine, and Google Fonts did not serve it (not one of its fonts, or no network): the page and its picture are set in the system\'s fallback (ui-sans-serif, sans-serif). Install it to see the page in it.']);
  assert.match(fontLines({ Brand: 'missing' }, { google: false })[0], /not installed on this machine \(prototypeFonts: false, so Google Fonts is not asked\)/);
  assert.match(fontLines({ Brand: 'loading' })[0], /Google Fonts did not answer within 3s/);
  assert.match(fontLines({ Brand: 'broken' })[0], /shipped by the system's @font-face, whose files did not load from the page/);
});

test('a prototype draws at once wherever its fonts are: installed, served, failing or never answering', { skip: CHROME ? false : 'no Chrome available', timeout: 90000 }, async () => {
  let have = 'DejaVu Sans';   // a font the machine has, found below
  const server = createServer((req, res) => {
    if (req.url.startsWith('/hang')) return;   // a network that never answers
    if (req.url.startsWith('/fail')) { res.writeHead(400); return res.end(); }   // not one of Google's fonts
    res.writeHead(200, { 'content-type': 'text/css', 'access-control-allow-origin': '*' });
    res.end(`@font-face { font-family: "Pt Probe Sans"; src: local("${have}"); }`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'proto-fonts-'));
  const tree = { component: 'Page', props: { width: '400' }, children: [{ component: 'Text', props: { text: 'Scan history' } }] };
  const page = (path, family, css = '') => {
    const file = join(dir, `${path}.html`);
    const parts = { themeCSS: css, componentCSS: '', view: { components: [], modes: [] } };
    writeFileSync(file, prototypePage({ name: 'p', tree, parts, scales: { family: `"${family}", ui-sans-serif, sans-serif`, text: [], spacing: [] }, gaps: [] }).replace('https://fonts.googleapis.com/css2', `${base}/${path}`));
    return pathToFileURL(file).href;
  };
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const ev = async (sessionId, e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    const open = async (url) => {
      const started = Date.now();
      const { sessionId } = await openPage(send, url);
      assert.ok(await waitForTrue(send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { attempts: 200 }), 'the page draws');
      return { sessionId, drewIn: Date.now() - started };
    };
    // A font installed on the machine: never asked of the network. Whichever of these this machine has.
    const probe = await open(page('probe', 'Pt Probe Sans'));
    const installed = await ev(probe.sessionId, `(() => { const c = document.createElement('canvas').getContext('2d'); const w = (f) => { c.font = '72px ' + f; return c.measureText('mmmmmmmmmmlli1WQ@#').width; }; return ['DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Verdana', 'Georgia', 'Times New Roman'].find((f) => w('"' + f + '", monospace') !== w('monospace') || w('"' + f + '", serif') !== w('serif')); })()`);
    assert.ok(installed, 'one of the usual fonts is installed');
    have = installed;
    const local = await open(page('hang', installed));
    assert.deepEqual(await ev(local.sessionId, FONTS_IN), { [installed]: 'installed' });
    assert.equal(await ev(local.sessionId, `document.querySelectorAll('link[data-pt-font]').length`), 0, 'no request for a font the machine has');
    // One the system's own CSS ships: its @font-face, never another copy.
    const shipped = await open(page('hang', 'Pt Probe Sans', `@font-face { font-family: "Pt Probe Sans"; src: local("${have}"); }`));
    assert.deepEqual(await ev(shipped.sessionId, FONTS_IN), { 'Pt Probe Sans': 'system' });
    // Any other is asked of Google Fonts, and the page does not wait: served, refused, or never answered.
    for (const [path, end] of [['ok', 'google'], ['fail', 'missing'], ['hang', 'loading']]) {
      const { sessionId, drewIn } = await open(page(path, 'Pt Probe Sans'));
      assert.ok(drewIn < 2000, `${path}: drawn in ${drewIn}ms, without waiting for the font`);
      assert.equal(await ev(sessionId, `getComputedStyle(document.querySelector('[data-pt-path="0"]')).fontFamily`), '"Pt Probe Sans", ui-sans-serif, sans-serif', 'the system\'s stack behind it meanwhile');
      const waited = Date.now();
      assert.deepEqual(await ev(sessionId, FONTS_IN), { 'Pt Probe Sans': end });
      assert.ok(Date.now() - waited < 4000, `${path}: the picture waits 3s at most`);
      assert.equal(await ev(sessionId, `(() => { const n = document.getElementById('pt-font-note'); return n.hidden ? '' : n.textContent; })()`), path === 'fail' ? 'Pt Probe Sans is not installed here and could not be loaded: set in the system\'s fallback fonts' : '');
    }
  } finally { close(); chrome.kill(); server.close(); }
});
