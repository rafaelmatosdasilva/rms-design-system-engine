// A brand changes values, never structure: each component's shape in each brand against the first brand's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { SHAPE_JS, shapesOf, shapeChanges, brandShapeDiffs, brandShapeLines } from '../lib/brand-shape.mjs';

const CHROME = findChrome();

test('only shapes that differ between modes are kept', () => {
  assert.equal(shapesOf({ light: { shape: ['button block static'] }, dark: { shape: ['button block static'] } }), null);
  assert.deepEqual(shapesOf({ acme: { shape: ['a'] }, northwind: { shape: ['b'] }, none: null }), { acme: ['a'], northwind: ['b'] });
});

test('a part gone, added, hidden or laid out another way is a change; the same shape is none', () => {
  const base = ['div.card flex static column', '  span.icon inline-flex static row', '  p.title block static', '    ::before block absolute'];
  assert.deepEqual(shapeChanges(base, base), []);
  assert.deepEqual(shapeChanges(base, ['div.card flex static row', '  span.icon inline-flex static row hidden', '  p.title block static']), [
    '::before: not drawn here',
    'div.card: laid out flex static column in the base brand, flex static row here',
    'span.icon: shown in the base brand, hidden here',
  ]);
  assert.deepEqual(shapeChanges(base, [...base, '  em.badge inline static']), ['em.badge: drawn only here']);
});

test('each brand that lays a component out differently is said against the first, other modes never compared', () => {
  const components = {
    card: { shapes: { acme: ['div.card flex static column'], northwind: ['div.card flex static row'], dark: ['div.card block static'] } },
    chip: { shapes: { acme: ['span.chip inline static'], northwind: ['span.chip inline static'] } },
    tag: {},
  };
  const rows = brandShapeDiffs(components, ['acme', 'northwind']);
  assert.deepEqual(rows, [{ component: 'card', brand: 'northwind', base: 'acme', changes: ['div.card: laid out flex static column in the base brand, flex static row here'] }]);
  assert.deepEqual(brandShapeDiffs(components, ['acme']), [], 'one brand: nothing to compare');
  assert.match(brandShapeLines(rows)[1], /card in northwind \(against acme\): div\.card: laid out/);
  assert.deepEqual(brandShapeLines([]), []);
});

test('the shape is read in a real browser: a brand rule that hides a part and turns a row is seen', { skip: !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false, timeout: budget(60000) }, async () => {
  const dir = tempDir('brand-shape-');
  const page = join(dir, 'page.html');
  writeFileSync(page, `<!doctype html><style>
.card{display:flex;flex-direction:column;padding:8px;background:var(--surface,#fff)} .card::before{content:'';display:block}
[data-brand=northwind] .card{flex-direction:row;--surface:#eee} [data-brand=northwind] .icon{display:none}
</style><div class="card" id="c"><span class="icon">*</span><p class="title">Title</p></div>`);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'brand-shape-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { targetId, sessionId } = await openPage(send, pathToFileURL(page).href);
    assert.equal(await waitForTrue(send, sessionId, FILE_PAGE_LOADED), true);
    const read = async (brand) => (await send('Runtime.evaluate', { expression: `(() => { document.documentElement.setAttribute('data-brand', ${JSON.stringify(brand)}); const el = document.getElementById('c'); return ${SHAPE_JS}; })()`, returnByValue: true }, sessionId)).result.value;
    const acme = await read('acme'), northwind = await read('northwind');
    assert.deepEqual(acme, ['div.card flex static column', '  ::before block static', '  span.icon block static', '  p.title block static']);
    assert.deepEqual(shapeChanges(acme, northwind), ['div.card: laid out flex static column in the base brand, flex static row here', 'span.icon: shown in the base brand, hidden here']);
    await send('Target.closeTarget', { targetId });
    close();
  } finally { browser.kill(); }
});
