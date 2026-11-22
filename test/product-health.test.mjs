// A product's own health report, beside the system's (product-health.mjs, --health --product <name>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';
import { headingsOf, weightOf, hostsIn, measuresIn, productHealth, readProductEvidence, PRODUCT_QUESTIONS } from '../lib/product-health.mjs';

test('the readings: headings in order, what a page loads, the hosts it names, what it measures', () => {
  assert.deepEqual(headingsOf('<h1>A</h1><h2>B</h2><h4>C</h4><h1>D</h1>'), { levels: [1, 2, 4, 1], skips: ['h2 to h4'], ones: 2 });
  const w = weightOf('<link href="main.css"><script src="main.js"></script><img src="https://cdn.example.org/x.png">', (u) => ({ 'main.css': 1000, 'main.js': 3000 })[u] ?? null);
  assert.equal(w.assets, 2);
  assert.ok(w.bytes > 4000);
  assert.deepEqual(hostsIn('<script src="https://cdn.acme-analytics.io/a.js"></script><a href="https://docs.acme.dev">docs</a>\nfetch("https://api.acme.dev/v1")\nfetch("http://localhost:3000/x")'), ['api.acme.dev', 'cdn.acme-analytics.io']);
  assert.deepEqual(measuresIn("gtag('event', 'x'); track('saved')"), ['Google Analytics', 'its own events']);
});

test('each answer says what it read, what it did not see and what only the team can tell', () => {
  const rows = productHealth({ product: { name: 'shop', uses: '2.0.0' }, latest: '2.1.0', compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0), files: 12, hosts: [], measures: [], tests: 0, pages: [{ file: 'shop/index.html', headings: { levels: [1, 2], skips: [], ones: 1 }, weight: { bytes: 200 * 1024, assets: 3 } }], departures: { copies: 1, own: 0, names: ['button'] }, a11y: null });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(rows.map((r) => r.id), PRODUCT_QUESTIONS.map((q) => q.id));
  assert.equal(by.built.rating, 'mixed');
  assert.match(by.built.evidence[0], /1 copy of the system's components .*: button/);
  assert.equal(by.reading.rating, 'good');
  assert.equal(by.hosts.rating, 'good');
  assert.equal(by.access.rating, null);
  assert.match(by.access.unseen[0], /no accessibility run/);
  assert.equal(by.tests.rating, 'poor');
  assert.equal(by.release.rating, 'mixed');
  assert.equal(by.weight.rating, 'good');
  assert.equal(by.measures.rating, 'poor');
  assert.ok(rows.every((r) => r.team));
  assert.match(by.reading.run, /--health --product shop/);
});

test('the command writes the product\'s report beside the system\'s, and names the products when one is wrong', async () => {
  const root = tempDir('product-health-');
  mkdirSync(join(root, 'products/shop/src'), { recursive: true });
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ products: { shop: { dir: 'products/shop', uses: '1.0.0' } } }));
  writeFileSync(join(root, 'products/shop/src/main.js'), "fetch('https://api.acme.dev/cart'); plausible('saved');\n");
  writeFileSync(join(root, 'products/shop/src/main.test.js'), 'test()\n');
  const ev = await readProductEvidence(root, JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8')), 'shop');
  assert.deepEqual(ev.hosts, ['api.acme.dev']);
  assert.deepEqual(ev.measures, ['Plausible']);
  assert.equal(ev.tests, 1);
  const run = (...a) => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_UPDATE: '1' } });
  const r = run('--health', '--product', 'shop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /🩺 shop's health:/);
  assert.match(readFileSync(join(root, '.design-system-engine-out/product-health-shop.md'), 'utf8'), /^# shop's health/);
  const bad = run('--health', '--product', 'nope');
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /No product called nope: the products set up are shop/);
});
