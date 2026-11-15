// The signs a product has quietly left the system, gathered under it: how far behind it is and for how long, a
// component it copied and changed, one it built beside the system's (product-departures.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { versionsOf, versionGap, definedComponents, parallelComponents, departures, departureLines } from '../lib/product-departures.mjs';
import { productsOf, lockedVersion } from '../lib/releases.mjs';
import { tempDir } from './helpers.mjs';

const versions = [
  { version: '1.2.0', at: '2026-03-01T00:00:00Z' }, { version: '1.3.0', at: '2026-05-01T00:00:00Z' }, { version: '1.3.1', at: null },
  { version: '2.0.0', at: '2026-07-01T00:00:00Z' }, { version: '2.1.0', at: '2026-09-01T00:00:00Z' }, { version: '2.10.0', at: '2026-10-01T00:00:00Z' },
];

test('how far behind a product is: majors and minors over the versions the system lists, and since the one after its own', () => {
  assert.deepEqual(versionGap('1.2.0', '2.10.0', versions, { today: '2026-11-15' }), { uses: '1.2.0', latest: '2.10.0', majors: 1, minors: 3, since: '1.3.0', at: '2026-05-01', days: 198 });
  assert.equal(versionGap('2.10.0', '2.10.0', versions), null, 'on the latest: nothing');
  assert.equal(versionGap('3.0.0', '2.10.0', versions), null, 'ahead of it: nothing');
  assert.equal(versionGap(null, '2.10.0', versions), null, 'a version it does not say: nothing');
  assert.deepEqual(versionGap('1.3.0', '1.3.1', versions), { uses: '1.3.0', latest: '1.3.1', majors: 0, minors: 0, since: null, at: null, days: null }, 'a patch behind, with no day');
  // With no list, from the numbers alone.
  assert.deepEqual(versionGap('1.2.0', '1.5.3', []), { uses: '1.2.0', latest: '1.5.3', majors: 0, minors: 3, since: null, at: null, days: null });
});

test('the system\'s versions from its tags, with the day each came out, and the releases it recorded', () => {
  const d = tempDir('departures-git-');
  const git = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-04-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-04-01T00:00:00Z' } });
  git('init', '-q'); git('-c', 'user.email=ci@example.com', '-c', 'user.name=CI', 'commit', '-q', '--allow-empty', '-m', 'first');
  git('tag', 'v1.0.0'); git('tag', 'not-a-version');
  const v = versionsOf(d, [{ version: '1.1.0', at: '2026-06-01T00:00:00Z' }, { version: '1.0.0', at: '2020-01-01T00:00:00Z' }]);
  assert.deepEqual(v.map((x) => [x.version, x.at?.slice(0, 10)]), [['1.0.0', '2026-04-01'], ['1.1.0', '2026-06-01']], 'the tag\'s own day wins over a record')
});

test('the version a product\'s lockfile pinned is the one it uses, past the range its package.json accepts', () => {
  const sys = tempDir('departures-lock-');
  writeFileSync(join(sys, 'package.json'), JSON.stringify({ name: '@acme/kit', version: '2.0.0' }));
  for (const [app, lock, text] of [
    ['npm', 'package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@acme/kit': { version: '1.4.2' } } })],
    ['yarn', 'yarn.lock', '# yarn lockfile v1\n\n"@acme/kit@^1.2.0":\n  version "1.3.5"\n  resolved "https://registry.example.com/kit.tgz"\n'],
    ['pnpm', 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      '@acme/kit':\n        specifier: ^1.2.0\n        version: 1.6.0\n"],
    ['none', null, null],
  ]) {
    mkdirSync(join(sys, 'apps', app), { recursive: true });
    writeFileSync(join(sys, 'apps', app, 'package.json'), JSON.stringify({ dependencies: { '@acme/kit': '^1.2.0' } }));
    if (lock) writeFileSync(join(sys, 'apps', app, lock), text);
  }
  assert.equal(lockedVersion(join(sys, 'apps', 'none'), '@acme/kit'), null);
  const products = productsOf(sys, { pluginDirs: { npm: 'apps/npm', yarn: 'apps/yarn', pnpm: 'apps/pnpm', none: 'apps/none' } });
  assert.deepEqual(products.map((p) => [p.name, p.uses]), [['npm', '1.4.2'], ['yarn', '1.3.5'], ['pnpm', '1.6.0'], ['none', '1.2.0']]);
});

test('the components a file defines, by the names it gives them', () => {
  assert.deepEqual(definedComponents('src/Button.vue', '<template><button/></template>'), [{ name: 'Button', line: 1 }]);
  assert.deepEqual(definedComponents('src/x.vue', "<script>\nexport default { name: 'AcmeModal' }\n</script>"), [{ name: 'AcmeModal', line: 2 }]);
  assert.deepEqual(definedComponents('src/ui.jsx', 'import x from "y";\nexport function Button() { return <b/>; }\nconst Modal = (p) => <div/>;\nexport const Chip = forwardRef((p, r) => <i/>);\nfunction helper() {}\n').map((c) => [c.name, c.line]), [['Button', 2], ['Modal', 3], ['Chip', 4]]);
  assert.deepEqual(definedComponents('src/util.js', 'export function Button() { return 1; }'), [], 'a plain script draws nothing')
  assert.deepEqual(definedComponents('src/el.js', "customElements.define('shop-toggle', class extends HTMLElement {});"), [{ name: 'toggle', tag: 'shop-toggle', line: 1 }]);
});

test('a component built beside the system\'s: its name, the product\'s name before it, or an alias. A wrapper of the system\'s is none', () => {
  const comps = ['button', 'dialog', 'chip', 'tag', 'field'];
  const files = [
    { file: '../shop/src/Button.vue', text: '<template><button class="shop-btn"><slot/></button></template>' },
    { file: '../shop/src/ShopField.tsx', text: 'export function ShopField() { return <input/>; }' },
    { file: '../shop/src/Modal.jsx', text: 'export default function Modal() { return <div role="dialog"/>; }' },
    { file: '../shop/src/Tag.jsx', text: 'export const Tag = () => <span/>;' },
    { file: '../shop/src/Card.jsx', text: 'export const Card = () => <div/>;' },
    { file: '../shop/src/IconButton.jsx', text: 'export const IconButton = () => <i/>;' },
    { file: '../shop/src/Wrap.jsx', text: "import { Dialog } from '@acme/kit';\nexport const Modal = () => <Dialog/>;" },
    { file: '../shop/src/Chip.vue', text: '<template><span class="chip"><slot/></span></template>' },
    { file: '../shop/src/Button.stories.jsx', text: 'export const Button = () => <b/>;' },
  ];
  const got = parallelComponents(files, comps, { product: 'shop', pkg: '@acme/kit', classes: { chip: '.chip' } }).map((x) => `${x.file}:${x.line} ${x.name} ${x.like}`);
  assert.deepEqual(got, ['../shop/src/Button.vue:1 Button button', '../shop/src/ShopField.tsx:1 ShopField field', '../shop/src/Modal.jsx:1 Modal dialog', '../shop/src/Tag.jsx:1 Tag tag'],
    'a Card the system has not, an IconButton (a component of its own), a wrapper, a file drawing with the system\'s class and a story are none');
  // An alias only stands in when the system has no component of that name.
  assert.deepEqual(parallelComponents([{ file: 'a/Modal.jsx', text: 'export const Modal = () => <div/>;' }], ['dialog', 'modal']).map((x) => x.like), ['modal']);
});

test('one block a product, each need with what it built instead and where. A product on the latest with nothing else says nothing', () => {
  const products = [{ name: 'shop', uses: '1.2.0' }, { name: 'kiosk', uses: '2.10.0' }, { name: 'atlas', uses: null }];
  const copies = [{ product: '../shop', file: '../shop/shop.css', line: 2, cls: 'shopButton', like: 'button', same: 5, of: 6, differ: ['background'] }];
  const list = departures({ products, latest: '2.10.0', versions, copies, parallels: { shop: [{ file: '../shop/src/Modal.jsx', line: 1, name: 'Modal', like: 'dialog' }], atlas: [] }, productOf: (c) => ({ '../shop': 'shop' })[c.product], today: '2026-11-15' });
  assert.deepEqual(list.map((d) => d.product), ['shop'], 'kiosk is on the latest, atlas says no version and built nothing');
  const lines = departureLines(list);
  assert.deepEqual(lines, [
    'shop has left the system in 3 places, each a need the system does not meet yet (ask its team what it needed):',
    '   · stopped upgrading: on 1.2.0, 1 major and 3 minors behind 2.10.0, for 198 days (1.3.0 came out on 2026-05-01)',
    '   · copied button and changed it: ../shop/shop.css:2  .shopButton (5 of 6 declarations alike, differs in background)',
    '   · built its own dialog: ../shop/src/Modal.jsx:1  Modal',
  ]);
  for (const l of lines) assert.ok(!l.includes(';'), `no semicolon: ${l}`);
  assert.deepEqual(departureLines([]), []);
});
