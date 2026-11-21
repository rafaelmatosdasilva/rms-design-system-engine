// What a prototype hands over beyond its page: checked at a tag against the system it pinned, the copy of the system it
// holds held to that release, its demonstration code kept apart by the team's convention, and what it added to the
// project's dependencies. Harbor (fictional) at two releases, with a product beside it that copied the first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { tempDir, budget } from './helpers.mjs';
import { kindOf, demoFindings, demoSummary, demoConvention } from '../lib/demo-code.mjs';
import { addedDependencies } from '../lib/added-dependencies.mjs';
import { copyCheck } from '../lib/system-copy.mjs';
import { fixedPoint, PIN_FILE } from '../lib/fixed-point.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', DESIGN_SYSTEM_ENGINE_CHROME: 'none' };
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8' }).trim();
const engine = (cwd, ...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd, encoding: 'utf8', env, timeout: budget(240000) });
const write = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };

function setUp() {
  const root = tempDir('handoff-checks-'), ds = join(root, 'ds'), shop = join(root, 'shop');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { shop: '../shop' },
    prototype: { dir: '../shop/prototypes', demo: { simulated: ['src/mocks'], staging: ['src/demo'], marker: 'DEMO_MODE', words: ['mock', 'fixture'] } },
    copies: [{ dir: '../shop/src/library', from: 'components' }] }, null, 2));
  git(ds, 'init', '-q'); git(ds, 'add', '-A'); git(ds, 'commit', '-qm', 'v1'); git(ds, 'tag', 'v1.0.0');
  appendFileSync(join(ds, 'components', 'HbBadge.vue'), '<!-- 1.1 -->\n');
  git(ds, 'commit', '-qam', 'v1.1'); git(ds, 'tag', 'v1.1.0');
  // The product copies the system at its first release.
  mkdirSync(join(shop, 'src', 'library'), { recursive: true });
  for (const f of ['HbBadge.vue', 'HbButton.vue', 'HbIconButton.vue']) write(join(shop, 'src', 'library', f), git(ds, 'show', `v1.0.0:components/${f}`) + '\n');
  write(join(shop, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { vue: '^3.4.0' } }));
  git(shop, 'init', '-q'); git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'start');
  engine(ds);   // the contracts and the catalog
  return { root, ds, shop };
}

test('a prototype handed over at a tag: pinned, its copy of the system, its demonstration code and what it added', { timeout: budget(600000) }, () => {
  const { ds, shop } = setUp();
  // Pinned once, before the first screen. A second pin keeps the first unless the system is named.
  let r = engine(ds, '--prototype', '--pin', '--system', 'v1.1.0');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const pin = JSON.parse(readFileSync(join(shop, PIN_FILE), 'utf8'));
  assert.equal(pin.system.ref, 'v1.1.0');
  assert.equal(pin.from, git(shop, 'rev-parse', 'HEAD'));
  assert.match(engine(ds, '--prototype', '--pin').stdout, /already pins the system at v1\.1\.0/);
  git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'pin');

  // The work: an accessibility fix made inside the copy, a page, demonstration code, a new dependency.
  const icon = join(shop, 'src', 'library', 'HbIconButton.vue');
  writeFileSync(icon, readFileSync(icon, 'utf8').replace('<button', '<button aria-label="Action"'));
  git(shop, 'commit', '-qam', 'name the icon button');
  write(join(shop, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { vue: '^3.4.0' }, devDependencies: { 'axe-core': '^4.10.3' } }));
  write(join(shop, 'src', 'mock-orders.js'), 'export const orders = [];\n');
  write(join(shop, 'src', 'mocks', 'api.js'), 'export const api = {};\n');
  const page = `<template>\n  <div>\n    <HbButton variant="Primary" label="Approve" />\n    <HbButton variant="Ghost" label="Reject" />\n  </div>\n</template>\n<script setup>\nimport HbButton from '../src/library/HbButton.vue';\nconst DEMO_MODE = true;\n</script>\n`;
  write(join(shop, 'prototypes', 'Approve.vue'), page);
  write(join(shop, 'src', 'Approve.vue'), page);
  git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'approve'); git(shop, 'tag', 'handoff/approve/v1');
  // The folder moves on after the tag: what the tag holds is what is checked.
  rmSync(join(shop, 'prototypes', 'Approve.vue'));

  // The copy, on its own: one file from the older release, one changed in the copy, by the commit that changed it.
  r = engine(ds, '--prototype', '--copies');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /held to v1\.1\.0: 1 the same · 1 from an older release · 0 from a later release · 1 changed in the copy/);
  assert.match(r.stdout, /bring the copy up to v1\.1\.0: HbBadge\.vue/);
  assert.match(r.stdout, /changed in the copy by [0-9a-f]+ "name the icon button": HbIconButton\.vue/);

  // The page at its tag: evidence, its import from the copy read as the system's component, and the rest beside it.
  r = engine(ds, '--prototype', '../shop/prototypes/Approve.vue', '--at', 'handoff/approve/v1', '--handoff');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CHECKED AT {2}a fixed point: this report stands as evidence/);
  assert.match(r.stdout, /prototype {6}prototypes\/Approve\.vue at tag handoff\/approve\/v1/);
  assert.match(r.stdout, /system {9}v1\.1\.0, as pinned/);
  assert.match(r.stdout, /1 system component \(HbButton\)/, 'a component imported from the copy is the system\'s');
  assert.match(r.stdout, /line 4: HbButton variant="Ghost" is not one of Primary, Secondary/);
  assert.match(r.stdout, /src\/Approve\.vue: a product file with demonstration branches, to take out at lines 9/);
  assert.match(r.stdout, /src\/mock-orders\.js is named as demonstration code and sits with the product's: move it to src\/mocks or src\/demo/);
  assert.match(r.stdout, /1 in the copy of the system, taken from the system/);
  assert.match(r.stdout, /axe-core \^4\.10\.3, for development only/);
  const handoff = readFileSync(join(shop, 'prototypes', 'Approve.handoff.md'), 'utf8');
  assert.match(handoff, /## Where it was checked\n\nAt a fixed point/);
  assert.match(handoff, /## The copy of the system in/);
  assert.match(handoff, /## What it added to the project[\s\S]*`axe-core` \^4\.10\.3, for development only/);

  // The same page from the folder, with the system on another release: a draft, and it says why.
  git(ds, 'checkout', '-q', 'v1.0.0');
  write(join(shop, 'prototypes', 'Approve.vue'), page);
  r = engine(ds, '--prototype', '../shop/prototypes/Approve.vue');
  assert.match(r.stdout, /CHECKED AT {2}a draft: good for iterating, not evidence/);
  assert.match(r.stdout, /read from the folder, not at a ref: run it again with --at <tag>/);
  assert.match(r.stdout, /the system here is v1\.0\.0, the prototype pinned v1\.1\.0/);
});

test('the demonstration convention is the team\'s own, and says nothing when there is none', () => {
  assert.equal(demoConvention({}), null);
  const conv = demoConvention({ prototype: { demo: { simulated: ['src/mocks'], staging: 'src/demo/', marker: 'DEMO', words: ['fixture'] } } });
  assert.deepEqual(conv.staging, ['src/demo']);
  assert.equal(kindOf('src/mocks/api.js', '', conv), 'simulated');
  assert.equal(kindOf('src/demo/picker.vue', '', conv), 'staging');
  assert.equal(kindOf('src/Page.vue', 'if (DEMO) {}', conv), 'mixed');
  assert.equal(kindOf('docs/notes.md', '', conv), 'outside');
  assert.equal(kindOf('src/library/X.vue', '', { ...conv, copies: ['src/library'] }), 'copy');
  assert.deepEqual(demoFindings([{ rel: 'src/orders.fixture.js', text: '' }, { rel: 'src/mocks/fixture.js', text: '' }], conv).map((f) => f.file), ['src/orders.fixture.js'], 'only out of its place');
  assert.deepEqual(demoSummary([{ rel: 'src/Page.vue', text: 'a\nif (DEMO) {}\nb' }], conv).mixed, [{ file: 'src/Page.vue', lines: [2] }]);
});

test('a dependency added or moved since the work began is listed, one already there is not', () => {
  const repo = tempDir('deps-');
  git(repo, 'init', '-q');
  write(join(repo, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.4.0', dayjs: '1.0.0' } }));
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'start');
  const from = git(repo, 'rev-parse', 'HEAD');
  write(join(repo, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.4.0', dayjs: '1.1.0' }, devDependencies: { 'axe-core': '^4' } }));
  assert.deepEqual(addedDependencies(repo, { from }), [{ name: 'axe-core', version: '^4', was: null, dev: true }, { name: 'dayjs', version: '1.1.0', was: '1.0.0', dev: false }]);
  assert.equal(addedDependencies(repo, { from: null }), null, 'with no starting point, nothing to say');
});

test('without a pin or a git repository, the check says what it is missing rather than guessing', () => {
  const root = tempDir('no-pin-');
  write(join(root, 'p', 'Page.vue'), '<template><div/></template>\n');
  const fp = fixedPoint({ ROOT: root, file: 'p/Page.vue' });
  assert.equal(fp.evidence, false);
  assert.match(fp.why.join(' | '), /in no git repository/);
  assert.match(copyCheck(root, { dir: 'p' }).error, /no git repository/);
});
