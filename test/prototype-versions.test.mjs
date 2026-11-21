// A prototype across releases of the system: each record and handoff says which release it was held to, a handoff
// given again says what changed since the last one, and another release is tried against every prototype before
// anyone moves to it. Harbor (fictional) at two releases, the second of which renames a button variant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { tempDir, budget } from './helpers.mjs';
import { handoffDiff, sinceLines } from '../lib/handoff-versions.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', DESIGN_SYSTEM_ENGINE_CHROME: 'none' };
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8' }).trim();
const engine = (cwd, ...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd, encoding: 'utf8', env, timeout: budget(240000) });
const write = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };
const page = (buttons) => `<template>\n  <div>\n${buttons.map((v) => `    <HbButton variant="${v}" label="Go" />`).join('\n')}\n  </div>\n</template>\n<script setup>\nimport HbButton from '../../ds/components/HbButton.vue';\n</script>\n`;

function setUp() {
  const root = tempDir('versions-'), ds = join(root, 'ds'), shop = join(root, 'shop');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { shop: '../shop' }, prototype: { dir: '../shop/prototypes' } }, null, 2));
  git(ds, 'init', '-q'); git(ds, 'add', '-A'); git(ds, 'commit', '-qm', 'v1'); git(ds, 'tag', 'v1.0.0');
  // The next release renames the Secondary variant.
  const btn = join(ds, 'components', 'HbButton.vue');
  writeFileSync(btn, readFileSync(btn, 'utf8').replaceAll('Secondary', 'Outline'));
  git(ds, 'commit', '-qam', 'v2'); git(ds, 'tag', 'v2.0.0');
  git(ds, 'checkout', '-q', 'v1.0.0');
  write(join(shop, 'package.json'), '{ "name": "shop" }');
  write(join(shop, 'prototypes', 'Orders.vue'), page(['Primary', 'Secondary']));
  write(join(shop, 'prototypes', 'Home.vue'), page(['Primary']));
  git(shop, 'init', '-q'); git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'start');
  engine(ds);
  return { ds, shop };
}

test('another release is tried against every prototype: what it would break, and in which page', { timeout: budget(600000) }, () => {
  const { ds } = setUp();
  const r = engine(ds, '--prototype', '--against', 'v2.0.0');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /RELEASE v2\.0\.0 {2}against v1\.0\.0: 1 of 2 prototypes would break/);
  assert.match(r.stdout, /Orders\.vue\n {6}❌ line \d+: HbButton variant="Secondary" is not one of Primary, Outline/);
  assert.doesNotMatch(r.stdout, /Home\.vue/, 'a page the release leaves whole is not listed');
  assert.match(engine(ds, '--prototype', '--against', 'v1.0.0').stdout, /none of the 2 prototypes would break/);
  assert.match(engine(ds, '--prototype', '--against', 'v9').stdout, /v9 is not a release of the system's repository/);
});

test('a handoff at a tag is kept as a version, and the next says what changed since', { timeout: budget(600000) }, () => {
  const { ds, shop } = setUp();
  engine(ds, '--prototype', '--pin');
  git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'pin'); git(shop, 'tag', 'handoff/home/v1');
  let r = engine(ds, '--prototype', '../shop/prototypes/Home.vue', '--at', 'handoff/home/v1', '--handoff');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(join(shop, 'prototypes', 'Home.handoffs')), ['handoff__home__v1.json']);
  // The record kept beside the page says which release it was held to.
  const record = JSON.parse(readFileSync(join(shop, 'prototypes', 'Home.check.json'), 'utf8'));
  assert.equal(record.checkedAt.system, 'v1.0.0');
  assert.equal(record.checkedAt.tag, 'handoff/home/v1');
  assert.match(r.stdout, /held to the system at v1\.0\.0/);

  // v2: one more button, and a variant the system lacks.
  write(join(shop, 'prototypes', 'Home.vue'), page(['Primary', 'Primary', 'Ghost']));
  git(shop, 'commit', '-qam', 'more'); git(shop, 'tag', 'handoff/home/v2');
  r = engine(ds, '--prototype', '../shop/prototypes/Home.vue', '--at', 'handoff/home/v2', '--handoff');
  const handoff = readFileSync(join(shop, 'prototypes', 'Home.handoff.md'), 'utf8');
  assert.match(handoff, /## What changed since handoff\/home\/v1/);
  assert.match(handoff, /HbButton: used 3× \(was 1×\)/);
  assert.match(handoff, /- New: HbButton variant="Ghost" is not one of Primary, Secondary/);
  assert.equal(readdirSync(join(shop, 'prototypes', 'Home.handoffs')).length, 2);
});

test('what changed between two handoffs, and nothing when nothing did', () => {
  const v1 = { version: 'v1', components: [{ name: 'Button', times: 1 }], open: [{ message: 'a' }], gaps: [{ need: 'a map' }], dependencies: [], copies: [] };
  const v2 = { components: [{ name: 'Button', times: 1 }, { name: 'Badge', times: 2 }], open: [], gaps: [], dependencies: [{ name: 'axe-core', version: '^4' }], copies: [] };
  const d = handoffDiff(v1, v2);
  assert.deepEqual(d.components.added, ['Badge']);
  assert.deepEqual(d.findings.removed, ['a']);
  assert.deepEqual(d.gaps.removed, ['a map']);
  assert.deepEqual(d.dependencies.added, ['axe-core ^4']);
  assert.deepEqual(sinceLines(handoffDiff(v1, v1)).slice(2), ['Nothing the check reads: the same components, the same findings, the same gaps and dependencies.', '']);
  assert.equal(handoffDiff(null, v2), null, 'a first handoff has nothing to compare with');
});
