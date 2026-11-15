import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobOf, pageOf, sameJobs, sameJobLines } from '../lib/same-jobs.mjs';

const names = ['button', 'textField', 'card', 'table', 'pagination'];
const cls = (n) => `.${n}`;

test('a page says its job by its name, its folder, or what it is built from', () => {
  assert.equal(jobOf('src/pages/CreateOrder.jsx'), 'create');
  assert.equal(jobOf('src/orders/new/index.vue'), 'create');
  assert.equal(jobOf('src/routes/orders/[id]/+page.svelte'), 'detail');
  assert.equal(jobOf('src/components/AppSidebar.tsx'), 'navigation');
  assert.equal(jobOf('src/pages/Orders.jsx', ['table', 'pagination']), 'list');
  assert.equal(jobOf('src/pages/Orders.jsx', ['textField', 'button'], '<button type="submit">'), 'create');
  assert.equal(jobOf('src/pages/About.jsx', ['card']), null);
});

const shop = { productName: 'shop', file: '../shop/src/CreateOrder.jsx', text: '<form>\n<TextField label="Name" />\n<Card />\n<Button type="submit">Save</Button>\n</form>' };
const admin = { productName: 'admin', file: '../admin/src/NewOrder.jsx', text: '<form>\n<Button type="submit">Save</Button>\n<TextField label="Name" />\n<Pagination />\n</form>' };

test('a page is read for the components that carry it, in order, and where its main action sits', () => {
  const p = pageOf(shop, names, cls);
  assert.deepEqual(p, { product: 'shop', file: '../shop/src/CreateOrder.jsx', job: 'create', components: ['textField', 'card', 'button'], action: 'bottom' });
});

test('the same job across products is grouped with what differs, and a page with no twin is left alone', () => {
  const pages = [shop, admin, { productName: 'admin', file: '../admin/src/Settings.jsx', text: '<Card />' }].map((p) => pageOf(p, names, cls));
  const [g, ...rest] = sameJobs(pages);
  assert.equal(rest.length, 0);
  assert.equal(g.job, 'create');
  assert.deepEqual(g.differences.map((d) => d.kind), ['components', 'order', 'action']);
  assert.match(g.differences[0].text, /admin uses pagination, shop uses card/);
  assert.match(g.differences[1].text, /admin button → textField, shop textField → button/);
  const lines = sameJobLines([g]);
  assert.match(lines[0], /1 job is done differently across products/);
  assert.match(lines[1], /a create flow \(admin NewOrder\.jsx, shop CreateOrder\.jsx\)/);
});

test('the same job built the same way is no finding, and one kept different is said with its reason', () => {
  const twin = pageOf({ ...shop, productName: 'admin', file: '../admin/src/CreateOrder.jsx' }, names, cls);
  assert.deepEqual(sameJobs([pageOf(shop, names, cls), twin]), []);
  const kept = sameJobs([shop, admin].map((p) => pageOf(p, names, cls)), { keep: { create: 'admin creates in bulk' } });
  assert.deepEqual(sameJobLines(kept), ['A create flow is kept different across admin · shop on purpose: admin creates in bulk.']);
});
