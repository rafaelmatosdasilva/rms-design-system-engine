// Which system version each product uses, and what a newer one changes for it (releases.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions, changesOf, recordRelease, readReleases, productsOf, productImpact, impactLines, lateTodos, RELEASES_FILE } from '../releases.mjs';
import { tempDir } from './helpers.mjs';

test('a release with breaking changes is recorded once per version, with the day to move by', () => {
  const d = tempDir('releases-');
  const changes = changesOf([{ level: 'breaking', msg: 'tileCard: prop "size" removed option(s) xl' }, { level: 'breaking', msg: 'token "kit/old/color" removed', ref: 'kit/old/color' }, { level: 'breaking', msg: 'tileCard: breaking change but version still 1.0.0 — bump the major in contract.authored.json' }, { level: 'info', msg: 'x' }]);
  assert.deepEqual(changes.map((c) => [c.kind, c.name]), [['component', 'tileCard'], ['token', 'kit/old/color']], 'the semver reminder is not a change');
  const e = recordRelease(d, { version: '2.0.0', changes, at: '2026-10-01T00:00:00Z', days: 30 });
  assert.equal(e.moveBy, '2026-10-31');
  recordRelease(d, { version: '1.4.0', changes: changes.slice(0, 1), at: '2026-09-01T00:00:00Z' });
  recordRelease(d, { version: '2.0.0', changes: changes.slice(1), at: '2026-10-02T00:00:00Z', days: 30 });
  assert.deepEqual(readReleases(d).map((r) => [r.version, r.changes.length]), [['1.4.0', 1], ['2.0.0', 1]], 'ordered by version, one entry each');
  assert.equal(recordRelease(d, { version: '2.1.0', changes: [] }), null, 'nothing broke: nothing recorded');
  assert.equal(compareVersions('2.0.26', '2.1.0'), -1);
  assert.equal(compareVersions('v3.0.0', '2.9.9'), 1);
});

test('each product told what the releases since its version touch in its own files, and by when; one past the day named late', () => {
  const sys = tempDir('releases-sys-'), app = join(sys, 'apps', 'shop');
  mkdirSync(join(app, 'src'), { recursive: true });
  writeFileSync(join(sys, 'package.json'), JSON.stringify({ name: '@acme/kit', version: '2.0.0' }));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { '@acme/kit': '^1.2.0' } }));
  writeFileSync(join(app, 'src', 'Cart.vue'), '<template><tile-card size="xl"/><p class="x" style="color: var(--kit-old-color)"></p></template>');
  writeFileSync(join(app, 'src', 'Other.vue'), '<template><tile-cardigan/></template>');
  const products = productsOf(sys, { pluginDirs: { shop: 'apps/shop' }, products: { kiosk: { uses: '2.0.0' } } });
  assert.deepEqual(products.map((p) => [p.name, p.uses]), [['shop', '1.2.0'], ['kiosk', '2.0.0']], 'its package.json says it, or the setup does');
  const releases = [
    { version: '1.4.0', moveBy: '2026-09-30', changes: [{ kind: 'component', name: 'tileCard', says: 'tileCard: prop "size" removed option(s) xl' }] },
    { version: '2.0.0', moveBy: '2026-12-31', changes: [{ kind: 'token', name: 'kit/old/color', says: 'token "kit/old/color" removed' }, { kind: 'component', name: 'badgeDot', says: 'badgeDot: state "pulse" removed' }] },
  ];
  const shop = productImpact(products[0], releases, { today: '2026-10-29' });
  assert.deepEqual(shop.behind.map((b) => [b.version, b.late, b.touched.map((t) => [t.change.name, t.files])]), [['1.4.0', true, [['tileCard', ['src/Cart.vue']]]], ['2.0.0', false, [['kit/old/color', ['src/Cart.vue']]]]], 'a tag in its kebab name, a token by its CSS name; tile-cardigan is not tile-card');
  assert.deepEqual(productImpact(products[1], releases).behind, [], 'on the latest: nothing behind');
  const lines = impactLines([shop]);
  assert.match(lines[0], /^shop: on 1\.2\.0, 2 releases behind \(latest 2\.0\.0\); 2 changes since touch its files:/);
  assert.match(lines[1], /1\.4\.0 \(move by 2026-09-30: late\): tileCard: prop "size" removed option\(s\) xl - src\/Cart\.vue/);
});

test('a product\'s docs are read with its code: its README and Markdown or MDX pages, the folders it names; never its changelog', () => {
  const sys = tempDir('releases-docs-'), app = join(sys, 'apps', 'shop'), guide = join(sys, 'handbook', 'shop');
  mkdirSync(join(app, 'docs'), { recursive: true }); mkdirSync(guide, { recursive: true });
  writeFileSync(join(app, 'README.md'), 'Show a product as `<tile-card size="xl">`.');
  writeFileSync(join(app, 'docs', 'colors.mdx'), 'Prices use `var(--kit-old-color)`.\n\n<TileCard size="xl" />');
  writeFileSync(join(app, 'docs', 'notes.md'), 'Each tilecard in prose, and a Tile card, is not the component.');
  writeFileSync(join(app, 'CHANGELOG.md'), 'Started using <tile-card> and --kit-old-color.');
  writeFileSync(join(guide, 'cards.md'), 'Use tileCard for every product.');
  const [shop] = productsOf(sys, { products: { shop: { dir: 'apps/shop', uses: '1.2.0', docs: 'handbook/shop' } } });
  const releases = [{ version: '2.0.0', moveBy: '2026-12-31', changes: [{ kind: 'component', name: 'tileCard', says: 'tileCard: prop "size" removed option(s) xl' }, { kind: 'token', name: 'kit/old/color', says: 'token "kit/old/color" removed' }] }];
  const i = productImpact(shop, releases, { today: '2026-10-29' });
  const [card, color] = i.behind[0].touched;
  assert.deepEqual(card.files.sort(), ['README.md', 'docs/colors.mdx', 'handbook/shop/cards.md'], 'its tag, its JSX name and its own name; prose and the changelog are not');
  assert.equal(card.docs, 3);
  assert.deepEqual(color.files, ['docs/colors.mdx']);
});

test('a product still on an older version past a release\'s day is a task on the Tasks list, for its own team', () => {
  const releases = [
    { version: '1.4.0', moveBy: '2026-09-30', changes: [{ kind: 'component', name: 'tileCard', says: 'tileCard: prop "size" removed option(s) xl' }] },
    { version: '2.0.0', moveBy: '2026-12-31', changes: [{ kind: 'token', name: 'kit/old/color', says: 'token "kit/old/color" removed' }] },
  ];
  const files = [{ file: 'src/Cart.vue', text: '<tile-card size="xl"/>' }, { file: 'README.md', text: '`<tile-card>`', doc: true }];
  const products = [{ name: 'Acme shop', uses: '1.2.0', team: 'Checkout team' }, { name: 'Northwind', uses: '1.0.0' }, { name: 'kiosk', uses: '1.0.0' }, { name: 'atlas', uses: '1.4.0' }, { name: 'nameless', uses: null }];
  const impacts = products.map((p) => productImpact(p, releases, { today: '2026-10-29', files: p.name === 'kiosk' ? [] : files }));
  const tasks = lateTodos(impacts, products, { owners: { Northwind: 'Northwind web team', '*': 'Product teams' } });
  assert.deepEqual(tasks.map((t) => [t.product, t.team]), [['Acme shop', 'Checkout team'], ['Northwind', 'Northwind web team'], ['kiosk', 'kiosk team']], 'its own team, else owners under its name, else its name; one not late yet (atlas) or with no version said is not named');
  const [shop, , kiosk] = tasks;
  assert.deepEqual([shop.area, shop.type, shop.who], ['Products', 'Acme shop, version', 'code']);
  assert.equal(shop.say, 'Acme shop is still on 1.2.0: 1.4.0 was to be taken by 2026-09-30 (latest 2.0.0). 1 breaking change since touch 2 of its files, docs included: tileCard: prop "size" removed option(s) xl.');
  assert.equal(shop.todo, 'Move Acme shop to 2.0.0, changing what rms-design-system-engine --products lists for it.');
  assert.match(kiosk.say, /None of the changes since touch its files\.$/);
  assert.equal(kiosk.todo, 'Move kiosk to 2.0.0.');
});

test('the style guide\'s Tasks list names a late product, with its team after who acts', async () => {
  const { generateStyleguide } = await import('../styleguide-gen.mjs');
  const sys = tempDir('releases-guide-'), app = join(sys, 'apps', 'shop');
  mkdirSync(join(app, 'src'), { recursive: true }); mkdirSync(join(sys, 'src'), { recursive: true });
  writeFileSync(join(sys, 'src', 'theme.css'), ':root { --a: 1px; }');
  writeFileSync(join(sys, 'package.json'), JSON.stringify({ name: '@acme/kit', version: '2.0.0' }));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { '@acme/kit': '^1.2.0' } }));
  writeFileSync(join(app, 'README.md'), 'Use `<tile-card size="xl">`.');
  writeFileSync(join(sys, RELEASES_FILE), JSON.stringify({ version: 1, releases: [{ version: '2.0.0', at: '2026-01-01T00:00:00Z', moveBy: '2026-04-01', changes: [{ kind: 'component', name: 'tileCard', says: 'tileCard: prop "size" removed option(s) xl' }] }] }));
  const out = '.design-system-engine-out/styleguide.html';
  await generateStyleguide(sys, { paths: { themeCSS: 'src/theme.css' }, pluginDirs: { shop: 'apps/shop' }, owners: { shop: 'Shop team' } }, { out });
  const html = readFileSync(join(sys, out), 'utf8');
  assert.match(html, /shop is still on 1\.2\.0: 2\.0\.0 was to be taken by 2026-04-01/);
  assert.match(html, /"team":"Shop team"/);
});
