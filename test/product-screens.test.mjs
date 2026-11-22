// A product's screens drawn from the system's components, each region marked by where it comes from, and the screens
// that drifted since the last run (product-screens.mjs, --product-screens <product>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';
import { markScreen, screenDrift, screenLines } from '../lib/product-screens.mjs';

const catalog = { components: { button: { selector: '.button', props: { label: { type: 'text' } } }, card: { selector: '.card', props: {} } } };
const page = (cta) => `<html><body><header><nav><a href="/">Home</a></nav></header><main><h1>Cart</h1>
<section><h2>Items</h2>${cta}<div class="card"><p>Socks</p></div></section>
<section><h2>Pay</h2><input type="range" aria-label="Tip"></section></main></body></html>`;

test('each part is the system\'s, the product\'s own, or a stand-in', () => {
  const s = markScreen(page('<button class="button">Buy</button><button class="shop-btn">Save</button>'), { catalog, name: 'shop/cart.html' });
  const parts = s.regions.flatMap((g) => g.parts.map((p) => [g.name, p.job, p.from]));
  assert.ok(parts.some(([, job, from]) => job === 'button' && from === 'system'), JSON.stringify(parts));
  assert.ok(parts.some(([, job, from]) => job === 'button' && from === 'product'), 'a button the product built beside the system\'s');
  assert.ok(parts.some(([, , from]) => from === 'stand-in'), 'a job the system has no component for');
  assert.equal(s.prototype.component, 'Page');
  assert.ok(s.counts.system >= 1 && s.counts.product >= 1 && s.counts['stand-in'] >= 1);
});

test('a later run says which screens drifted, and how', () => {
  const was = markScreen(page('<button class="button">Buy</button>'), { catalog, name: 'cart' });
  const now = markScreen(page('<button class="shop-btn">Buy</button>'), { catalog, name: 'cart' });
  const d = screenDrift({ cart: was }, { cart: now });
  assert.equal(d.length, 1);
  assert.ok(d[0].changes.some((c) => /was the system's and is now the product's own/.test(c)), d[0].changes.join(' | '));
  assert.deepEqual(screenDrift({ cart: was }, { cart: was }), []);
  const lines = screenLines('shop', [now], d);
  assert.match(lines[0], /^🖼  shop: 1 screen drawn from the system's components/);
  assert.ok(lines.some((l) => /Since the last run, 1 screen drifted/.test(l)));
});

test('the command writes each screen to the engine\'s own workshop and keeps the marks for the next run', () => {
  const root = tempDir('screens-');
  mkdirSync(join(root, 'products/shop'), { recursive: true });
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts/catalog.json'), JSON.stringify(catalog));
  writeFileSync(join(root, 'products/shop/ui.html'), page('<button class="button">Buy</button>'));
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ paths: { plugins: ['shop'], pluginCSS: ['products/shop/ui.html'] } }));
  const run = (...a) => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_UPDATE: '1' } });
  const r = run('--product-screens', 'shop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /🖼  shop: 1 screen/);
  assert.ok(existsSync(join(root, '.design-system-engine-out/workshop/shop/ui.json')));
  assert.ok(JSON.parse(readFileSync(join(root, '.design-system-engine-out/workshop/shop.json'), 'utf8')).screens['products/shop/ui.html']);
  writeFileSync(join(root, 'products/shop/ui.html'), page('<button class="shop-btn">Buy</button>'));
  assert.match(run('--product-screens', 'shop').stdout, /drifted/);
  assert.equal(run('--product-screens', 'nope').status, 2);
});
