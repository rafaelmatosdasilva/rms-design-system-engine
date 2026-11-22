// Which release a prototype is held to: the one the building team's product uses offered to the pin, a disagreement
// said, a newer release said when the work starts, and an icon or a token the system renamed said by its new name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { tempDir, budget } from './helpers.mjs';
import { tagFor, pinAdvice, newerReleases, trackLines } from '../lib/release-track.mjs';
import { iconRenames, tokenRenames, renamedTo } from '../lib/system-renames.mjs';
import { editFindings } from '../lib/edit-check.mjs';
import { steeringTruth } from '../lib/steering-check.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', DESIGN_SYSTEM_ENGINE_CHROME: 'none' };
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8' }).trim();
const engine = (cwd, ...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd, encoding: 'utf8', env, timeout: budget(240000) });
const write = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };

test('a version as a product writes it is matched to the system\'s tag, and newer releases come oldest first', () => {
  const tags = ['v1.0.0', 'v1.2.0', 'v2.0.0', '2.1.0', 'nightly'];
  assert.equal(tagFor(null, '1.2.0', tags), 'v1.2.0');
  assert.equal(tagFor(null, '^2.0.0', tags), 'v2.0.0', 'a range where no lockfile pinned it');
  assert.equal(tagFor(null, '2.1.0', tags), '2.1.0', 'a tag with no v');
  assert.equal(tagFor(null, '9.9.9', tags), null);
  assert.equal(tagFor(null, 'workspace:*', tags), null);
  assert.deepEqual(newerReleases(null, 'v1.0.0', tags), ['v1.2.0', 'v2.0.0', '2.1.0']);
  assert.deepEqual(newerReleases(null, 'main', tags), [], 'a branch has no newer');
});

test('the pin is offered the release the products agree on, several are said, and a disagreement is named', () => {
  const shop = { name: 'shop', uses: '2.0.0', from: 'package-lock.json', tag: 'v2.0.0' };
  const admin = { name: 'admin', uses: '1.2.0', from: 'package.json', tag: 'v1.2.0' };
  assert.deepEqual(pinAdvice([shop]), { offer: 'v2.0.0', several: [], disagree: [] });
  assert.deepEqual(pinAdvice([shop, admin]).several, ['v2.0.0', 'v1.2.0']);
  assert.equal(pinAdvice([shop, admin]).offer, null);
  assert.deepEqual(pinAdvice([shop, admin], 'v2.0.0').disagree, [admin]);
  const lines = trackLines({ pinned: 'v1.0.0', disagree: [shop], newer: ['v1.2.0', 'v2.0.0'] });
  assert.match(lines[0], /the product shop uses v2\.0\.0 \(package-lock\.json\), and the prototype is pinned to v1\.0\.0/);
  assert.match(lines[1], /a newer release of the system is out: v2\.0\.0 \(2 since v1\.0\.0\)\. --prototype --against v2\.0\.0/);
});

test('an icon and a token the system renamed are found in its history, never guessed from the names', () => {
  const repo = tempDir('renames-');
  write(join(repo, 'icons', 'cart.svg'), '<svg/>');
  write(join(repo, 'tokens.css'), ':root {\n  --space-m: 8px;\n  --brand-blue: #1f5fd6;\n  --tone: #111;\n}\n');
  git(repo, 'init', '-q'); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'one');
  renameSync(join(repo, 'icons', 'cart.svg'), join(repo, 'icons', 'basket.svg'));
  // --space-m becomes --gap-m with the same value: a rename. --tone changes its value: not one.
  write(join(repo, 'tokens.css'), ':root {\n  --gap-m: 8px;\n  --brand-blue: #1f5fd6;\n  --tone: #222;\n}\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'two');
  renameSync(join(repo, 'icons', 'basket.svg'), join(repo, 'icons', 'bag.svg'));
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'three');
  assert.equal(renamedTo(iconRenames(repo), 'cart'), 'bag', 'followed through the later rename');
  assert.equal(renamedTo(tokenRenames(repo), '--space-m'), '--gap-m');
  assert.equal(renamedTo(tokenRenames(repo), '--tone'), null, 'a value changed, not a name');
  assert.equal(renamedTo(tokenRenames(repo), '--brand-blue'), null);
});

test('the edit check says a renamed token by its new name', () => {
  const truth = steeringTruth({ catalog: { components: {} }, cssVars: ['--gap-m'] });
  truth.renamedToken = (n) => (n === '--space-m' ? '--gap-m' : null);
  const line = '.card { padding: var(--space-m); }';
  const said = editFindings([line], line, { truth, tokenByValue: new Map() }).map((f) => f.text);
  assert.ok(said.includes('var(--space-m) was renamed to var(--gap-m) in the system: write var(--gap-m)'), said.join('\n'));
});

// Harbor (fictional) at two releases, and a shop whose lockfile says which one it builds with.
function setUp({ uses = '2.0.0' } = {}) {
  const root = tempDir('track-'), ds = join(root, 'ds'), shop = join(root, 'shop');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { shop: '../shop' }, prototype: { dir: '../shop/prototypes' } }, null, 2));
  write(join(ds, 'package.json'), JSON.stringify({ name: '@acme/harbor', version: '1.0.0' }));
  git(ds, 'init', '-q'); git(ds, 'add', '-A'); git(ds, 'commit', '-qm', 'v1'); git(ds, 'tag', 'v1.0.0');
  const btn = join(ds, 'components', 'HbButton.vue');
  writeFileSync(btn, readFileSync(btn, 'utf8').replaceAll('Secondary', 'Outline'));
  git(ds, 'commit', '-qam', 'v2'); git(ds, 'tag', 'v2.0.0');
  git(ds, 'checkout', '-q', 'v1.0.0');
  write(join(shop, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { '@acme/harbor': `^${uses}` } }));
  write(join(shop, 'package-lock.json'), JSON.stringify({ name: 'shop', lockfileVersion: 3, packages: { 'node_modules/@acme/harbor': { version: uses } } }));
  const page = (v) => `<template>\n  <div>\n    <HbButton variant="${v}" label="Go" />\n  </div>\n</template>\n<script setup>\nimport HbButton from '../../ds/components/HbButton.vue'\n</script>\n`;
  write(join(shop, 'prototypes', 'Orders.vue'), page('Secondary'));
  write(join(shop, 'prototypes', 'Home.vue'), page('Primary'));
  git(shop, 'init', '-q'); git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'start');
  engine(ds);
  return { ds, shop };
}

test('a new pin takes the release the building team\'s product uses, read from its lockfile', { timeout: budget(600000) }, () => {
  const { ds, shop } = setUp({ uses: '2.0.0' });
  const r = engine(ds, '--prototype', '--pin');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /shop uses 2\.0\.0 \(package\.json\): the prototype is pinned to v2\.0\.0, the release the team building it uses/);
  assert.equal(JSON.parse(readFileSync(join(shop, 'design-system-pin.json'), 'utf8')).system.ref, 'v2.0.0');
});

test('a pin the product has moved past is said, and the catalog says the newer release with what it would break', { timeout: budget(600000) }, () => {
  const { ds } = setUp({ uses: '2.0.0' });
  engine(ds, '--prototype', '--pin', '--system', 'v1.0.0');
  const again = engine(ds, '--prototype', '--pin');
  assert.match(again.stdout, /the product shop uses v2\.0\.0 \(package\.json\), and the prototype is pinned to v1\.0\.0/);
  assert.match(again.stdout, /a newer release of the system is out: v2\.0\.0/);
  const cat = engine(ds, '--prototype', '--catalog');
  assert.match(cat.stdout, /A newer release of the system is out: v2\.0\.0, and the prototypes are pinned to v1\.0\.0\. It would break 1 of 2 prototypes\./);
  assert.match(cat.stdout, /shop builds with v2\.0\.0 \(package\.json\), and the prototypes are pinned to v1\.0\.0/);
});
