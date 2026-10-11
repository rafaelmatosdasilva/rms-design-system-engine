// I97: a whole page is walked with Tab, and where each stop is on the page is read: a stop above the one before it in
// the same column sends the reader back up the page, and a stop no one can see loses them. F12: the products' own pages
// are checked as whole pages beside the style guide, and what is found there says which product.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { focusFlow, a11yFindingRecord, A11Y_GUIDE, severityOf } from '../a11y-check.mjs';
import { WCAG_KIND } from '../wcag21.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';

const box = (d, x, y, { w = 80, h = 30, shown = true, fixed = false } = {}) => ({ d, x, y, w, h, shown, fixed });

test('where Tab goes against where things are: back up the same column, and a stop no one sees', () => {
  // A, then C below, then B between them: Tab goes back up.
  assert.deepEqual(focusFlow([box('a', 0, 0), box('c', 0, 200), box('b', 0, 100), box('a', 0, 0)]), [{ kind: 'pageorder', desc: 'Tab goes from c back up to b, above it' }]);
  // Down the left column, then up to the top of the right one: a new column, read in order.
  assert.deepEqual(focusFlow([box('a', 0, 0), box('b', 0, 100), box('c', 300, 0), box('d', 300, 100)]), []);
  // A bar that stays on screen (fixed or sticky) is never out of order, wherever the page has scrolled.
  assert.deepEqual(focusFlow([box('a', 0, 400), box('menu', 0, 380, { fixed: true }), box('b', 0, 500)]), []);
  // A link off the screen when it has the focus: no one can see where they are.
  assert.deepEqual(focusFlow([box('skip', -9999, 0, { shown: false }), box('a', 0, 0), box('b', 0, 100)]), [{ kind: 'focushidden', desc: 'skip' }]);
  // One round only: the walk going back to the first stop and on again is not read twice.
  assert.deepEqual(focusFlow([box('a', 0, 0), box('b', 0, 100), box('a', 0, 0), box('x', 0, -50)]), []);
  assert.deepEqual(focusFlow([]), []);
  assert.equal(WCAG_KIND.pageorder, '2.4.3');
  assert.equal(WCAG_KIND.focushidden, '2.4.7');
  for (const k of ['pageorder', 'focushidden']) { assert.ok(A11Y_GUIDE[k]?.fix, k); assert.equal(severityOf(k), 'warning'); }
  assert.deepEqual(a11yFindingRecord('pageorder', { desc: 'x', product: 'shop' }).product, 'shop');
});

const PAGE = `<!doctype html><html lang="en"><head><title>Order</title><style>
  body { font: 16px/1.4 sans-serif; margin: 0; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .skip { position: absolute; left: -9999px; }
  .first { order: 1; } .second { order: 3; } .third { order: 2; }
  button { width: 160px; padding: 8px; color: #111; background: #fff; border: 1px solid #333; }
</style></head><body><main><h1>Order</h1>
  <a class="skip" href="#end">Skip to the end</a>
  <div style="display:flex;flex-direction:column;gap:16px"><button class="first">One</button><button class="second">Three</button><button class="third">Two</button></div>
  <p id="end">End</p>
</main></body></html>`;

test('in the browser: a whole page walked with Tab, its order and a stop no one sees', { timeout: 180000, skip: !HAS_CHROME && 'no Chrome' }, () => {
  const dir = makeFixture({ 'page.html': PAGE });
  try {
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json', '--no-axe', '--no-states'], { cwd: dir, encoding: 'utf8', timeout: 150000, env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const of = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
    assert.deepEqual(of('pageorder'), ['Tab goes from button.second "Three" back up to button.third "Two", above it']);
    assert.deepEqual(of('focushidden'), ['a.skip "Skip to the end"']);
    assert.equal(d.issues.find((i) => i.issue === 'pageorder').wcag, '2.4.3');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('in the browser: beside the style guide, each product\'s page is checked whole and says which product', { timeout: 300000, skip: !HAS_CHROME && 'no Chrome' }, () => {
  const root = makeFixture({});
  const ds = join(root, 'ds'), shop = join(root, 'shop');
  try {
    mkdirSync(join(ds, 'sg'), { recursive: true }); mkdirSync(shop, { recursive: true });
    writeFileSync(join(ds, 'theme.css'), '.chip { display: inline-block; padding: 4px 8px; color: #111; background: #eee; }\n');
    writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ paths: { themeCSS: 'theme.css', plugins: ['shop'], pluginCSS: ['../shop/ui.src.html'] }, componentSelectors: { chip: '.chip' }, styleguide: { out: 'sg/index.html' } }));
    writeFileSync(join(ds, 'sg', 'index.html'), '<!doctype html><html lang="en"><head><title>Guide</title><link rel="stylesheet" href="../theme.css"></head><body><main><h1>Guide</h1><span class="chip">Chip</span></main></body></html>');
    // The shop's page: the chip is fine, the page's own text is too pale to read.
    writeFileSync(join(shop, 'ui.src.html'), 'source');
    writeFileSync(join(shop, 'ui.html'), '<!doctype html><html lang="en"><head><title>Shop</title><style>.chip { display: inline-block; padding: 4px 8px; color: #111; background: #eee; } .note { color: #ccc; background: #fff; }</style></head><body><main><h1>Shop</h1><span class="chip">Chip</span><p class="note">Delivery in two days</p></main></body></html>');
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--json', '--no-axe', '--no-states'], { cwd: ds, encoding: 'utf8', timeout: 280000, env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const shopIssues = d.issues.filter((i) => i.product === 'shop');
    assert.ok(shopIssues.some((i) => i.issue === 'contrast' && /p\.note/.test(i.selector)), JSON.stringify(d.issues.map((i) => [i.issue, i.selector, i.product])));
    assert.ok(!d.issues.some((i) => !i.product && /p\.note/.test(i.selector)), 'the product\'s own text is said on the product');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
