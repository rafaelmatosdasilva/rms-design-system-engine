// Which system version each product uses, and what a newer one changes for it (releases.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions, changesOf, recordRelease, readReleases, productsOf, productImpact, impactLines, RELEASES_FILE } from '../releases.mjs';
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
