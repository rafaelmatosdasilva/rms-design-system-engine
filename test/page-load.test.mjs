// A product's built pages opened in a browser: what they load from other hosts and how long they take, on a slow
// network too (page-load.mjs), and the product's health report answering from it (product-health.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { measurePages, hostsOf, slowestOf } from '../lib/page-load.mjs';
import { productHealth } from '../lib/product-health.mjs';

const CHROME = findChrome();

test('each page\'s requests to other hosts, and its times on a normal and a slow network', { skip: CHROME ? false : 'Chrome not found', timeout: 120000 }, async () => {
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); res.end('window.__loaded = true;' + ' '.repeat(20000)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const dir = tempDir('page-load-');
    writeFileSync(join(dir, 'own.js'), 'window.__own = true;');
    const page = join(dir, 'index.html');
    writeFileSync(page, `<!doctype html><html><head><title>Shop</title><script src="own.js"></script><script src="http://127.0.0.1:${port}/lib.js"></script></head><body><h1>Cart</h1></body></html>`);
    const r = await measurePages([page], { chromePath: CHROME });
    assert.equal(r.why, undefined, r.why);
    const p = r.pages[0];
    assert.deepEqual(p.normal.requests.map((x) => [x.host, x.type]), [['127.0.0.1', 'Script']], 'its own file is not another host');
    assert.ok(p.normal.bytes > 20000, `${p.normal.bytes} bytes from the other host`);
    assert.ok(p.normal.timings.loaded > 0);
    assert.ok(p.slow.timings.loaded > p.normal.timings.loaded, `slow ${p.slow.timings.loaded}ms after normal ${p.normal.timings.loaded}ms`);
    assert.deepEqual(hostsOf(r.pages), ['127.0.0.1']);
    assert.equal(slowestOf(r.pages).file, page);
  } finally { server.close(); }
});

test('without Chrome, it says why and measures nothing', async () => {
  const was = process.env.DESIGN_SYSTEM_ENGINE_CHROME;
  process.env.DESIGN_SYSTEM_ENGINE_CHROME = 'none';   // the engine's own way to run with no browser
  try { assert.deepEqual(await measurePages(['/nowhere.html']), { pages: [], why: 'no Chrome on this computer (CHROME_PATH)' }); }
  finally { if (was === undefined) delete process.env.DESIGN_SYSTEM_ENGINE_CHROME; else process.env.DESIGN_SYSTEM_ENGINE_CHROME = was; }
});

test('the health report answers its hosts and its weight from the browser when it measured', () => {
  const page = (loaded, slow, hosts = []) => ({ file: 'shop/index.html', normal: { requests: hosts.map((h) => ({ host: h, type: 'Script', bytes: 30000 })), bytes: hosts.length * 30000, timings: { firstDraw: 200, read: 300, loaded } }, slow: { requests: [], bytes: 0, timings: { firstDraw: 900, read: 1200, loaded: slow } } });
  const base = { product: { name: 'shop' }, files: 3, hosts: [], measures: [], tests: 1, pages: [{ file: 'shop/index.html', headings: { levels: [1], skips: [], ones: 1 }, weight: { bytes: 100 * 1024, assets: 2 } }] };
  const by = (ev) => Object.fromEntries(productHealth(ev).map((r) => [r.id, r]));
  const fast = by({ ...base, measured: { pages: [page(800, 3000, ['cdn.acme.dev'])] } });
  assert.equal(fast.hosts.rating, 'mixed');
  assert.match(fast.hosts.evidence[1], /1 other host reached when its pages open in a browser: cdn\.acme\.dev/);
  assert.equal(fast.weight.rating, 'good');
  assert.match(fast.weight.evidence.at(-1), /drawn in 0\.2s and loaded in 0\.8s, and on a slow network \(400 ms, 400 kbit\/s\) in 0\.9s and 3\.0s/);
  assert.equal(by({ ...base, measured: { pages: [page(6000, 20000)] } }).weight.rating, 'poor');
  const none = by({ ...base, measured: { pages: [], why: 'no Chrome on this computer (CHROME_PATH)' } });
  assert.match(none.weight.unseen[0], /its pages in a browser: no Chrome/);
});
