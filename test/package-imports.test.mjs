// A product checked out beside the system imports it by its package name (`import { HbButton } from '@harbor/ds'`), as
// every product does. The page check took each of those for a component of the product's own and flagged the real
// ones, the edit check skipped the product's files and never knew a component its code names with a prefix, and the
// cards told a product to import from a path inside the system's folder. Harbor (fictional) with a product beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tempDir, budget } from './helpers.mjs';
import { importsOf, importedName, importedComponents } from '../lib/page-check.mjs';
import { componentTagIn } from '../lib/edit-check.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', DESIGN_SYSTEM_ENGINE_CHROME: 'none' };
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8' });
const engine = (cwd, ...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd, encoding: 'utf8', env, timeout: budget(240000) });
const write = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };

function setUp() {
  const root = tempDir('pkg-imports-'), ds = join(root, 'ds'), shop = join(root, 'shop');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  write(join(ds, 'package.json'), JSON.stringify({ name: '@harbor/ds', version: '2.3.0', main: 'index.js' }, null, 2));
  write(join(ds, 'index.js'), ['HbButton', 'HbBadge', 'HbIconButton'].map((n) => `export { default as ${n} } from './components/${n}.vue';`).join('\n') + '\n');
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { shop: '../shop' } }, null, 2));
  write(join(shop, 'src', 'Orders.vue'), `<template>\n  <div><HbBadge tone="success" label="Paid" /><HbButton variant="Primary" label="Approve" /></div>\n</template>\n<script setup>\nimport { HbButton, HbBadge } from '@harbor/ds';\n</script>\n`);
  for (const d of [ds, shop]) { git(d, 'init', '-q'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'init'); }
  engine(ds);   // the contracts and the catalog the checks read
  return { root, ds, shop };
}

test('a product beside the system that imports it by its package name is held to the system, and nothing else is', { timeout: budget(600000) }, () => {
  const { root, ds, shop } = setUp();
  // A prototype in the product, not committed yet, as an agent leaves it.
  write(join(shop, 'prototypes', 'Approve.vue'), `<template>
  <div>
    <Pill tone="danger" label="Pending" />
    <HbButton variant="Primary" size="Large" label="Approve" />
    <HbButton variant="Ghost" label="Reject" />
    <HbCard title="Order" />
  </div>
</template>
<script setup>
import { HbButton, HbCard, HbBadge as Pill } from '@harbor/ds';
</script>
`);
  let r = engine(ds, '--prototype', '../shop/prototypes/Approve.vue');
  assert.doesNotMatch(r.stdout, /a component of its own/, 'the package\'s own components are the system\'s');
  assert.match(r.stdout, /2 system components \(HbBadge, HbButton\)/, 'named, aliased and plain imports alike');
  assert.match(r.stdout, /line 5: HbButton variant="Ghost" is not one of Primary, Secondary/);
  assert.match(r.stdout, /line 6: <HbCard> is imported from @harbor\/ds, the system's own package, which has no HbCard/);
  assert.equal(r.status, 1);

  // The edit check reads the product's file, beside the system, and knows HbButton is button.
  r = engine(ds, '--edit-check', '../shop/prototypes/Approve.vue');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Approve\.vue:5 {2}variant="Ghost" is not a value this prop takes; it takes Primary, Secondary/);
  // Its committed lines are its own repository's: the product's committed page adds nothing.
  assert.equal(engine(ds, '--edit-check', '../shop/src/Orders.vue').status, 0);
  // A folder no setting lists stays outside the check.
  write(join(root, 'elsewhere', 'Page.vue'), '<template><HbButton variant="Ghost" /></template>\n');
  assert.equal(engine(ds, '--edit-check', '../elsewhere/Page.vue').status, 0);

  // Inside the system's own folder too: a prefixed tag is the component its contract says.
  write(join(ds, 'prototypes', 'Inside.vue'), `<template>\n  <div>\n    <HbButton variant="Ghost" label="Reject" />\n  </div>\n</template>\n<script setup>\nimport HbButton from '../components/HbButton.vue';\n</script>\n`);
  r = engine(ds, '--edit-check', 'prototypes/Inside.vue');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Inside\.vue:3 {2}variant="Ghost" is not a value this prop takes/);
});

test('each card gives the import that resolves where the prototypes are written', { timeout: budget(600000) }, () => {
  const { ds } = setUp();
  // In the system's own folder (the default), its own way: its package name does not resolve there.
  let r = engine(ds, '--prototype', '--catalog', '--for', 'approve an order');
  assert.match(r.stdout, /HbButton {2}import HbButton from '\.\/components\/HbButton\.vue';/);
  assert.doesNotMatch(r.stdout, /from '@harbor\/ds'/);
  // In a product beside it, as a product writes it, a named import in braces, also for a component no product uses yet.
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ ...cfg, prototype: { dir: '../shop/prototypes' } }, null, 2));
  r = engine(ds, '--prototype', '--catalog', '--for', 'approve an order');
  assert.match(r.stdout, /HbButton {2}import \{ HbButton \} from '@harbor\/ds'/);
  assert.match(r.stdout, /HbIconButton {2}import \{ HbIconButton \} from '@harbor\/ds'/);
});

test('an import keeps the name it has where it comes from, and a prefixed tag is found by its code name', () => {
  const imports = importsOf(`import Btn from './Btn.vue';\nimport { HbBadge as Pill, HbCard } from '@harbor/ds';`);
  assert.equal(importedName(imports, 'Btn'), 'default');
  assert.equal(importedName(imports, 'Pill'), 'HbBadge');
  assert.equal(importedName(imports, 'HbCard'), 'HbCard');
  const tags = new Map([['hbbutton', 'button']]);
  assert.equal(componentTagIn('<HbButton variant="Ghost" />', ['button'], tags), 'HbButton');
  assert.equal(componentTagIn('<HbButton variant="Ghost" />', ['button']), null, 'without the code\'s names, as before');
  // An example in the intent layer, written as a product writes it, names the component it imports.
  const page = { ROOT: '/nowhere', aliases: [{ from: '@harbor/ds', to: '/nowhere' }], byFile: new Map(), components: { HbButton: { name: 'HbButton', tag: 'HbButton' } }, pkg: '@harbor/ds', entry: null };
  assert.deepEqual(importedComponents(page, "```vue\nimport { HbButton } from '@harbor/ds'\n```"), ['HbButton']);
  assert.deepEqual(importedComponents(page, "```vue\nimport { HbCard } from '@harbor/ds'\n```"), []);
});
