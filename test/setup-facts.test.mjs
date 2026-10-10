// First-time setup reads what the project already says: the naming its token CSS follows, every Figma snapshot beside
// it, the system's own scripts, the products checked out beside it, and the frames and screens a captured screen
// snapshot names. And a project set up with no Figma link is told its snapshots cannot be refreshed, never failed for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { namingFromCode, snapshotPaths, systemScripts, productsBeside, framesFromSnapshot, figmaTokenNames } from '../setup-facts.mjs';
import { dataStateLine } from '../next-step.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), typeof text === 'string' ? text : JSON.stringify(text, null, 2)); };
const vars = (tokens) => ({ color: { light: Object.fromEntries(tokens.map((t) => [t, '#000000'])), dark: Object.fromEntries(tokens.map((t) => [t, '#ffffff'])) }, sizing: { 'gap/m': '8px' } });

test('the naming the token CSS follows is read from it, the default when it fits as well', () => {
  const tokens = ['button/iconText/color', 'button/background/color', 'list/iconText/hover/color'];
  assert.deepEqual(figmaTokenNames(vars(tokens)).sort(), [...tokens, 'gap/m'].sort());
  const keeps = namingFromCode(':root { --button-iconText: #000; --button-background: #fff; --list-iconText-hover: #111; --gap-m: 8px }', vars(tokens));
  assert.deepEqual([keeps.naming, keeps.found, keeps.of], [{ iconTextAlias: false }, 4, 4], 'a CSS that keeps iconText');
  assert.deepEqual(namingFromCode(':root { --button-text: #000; --button-background: #fff; --list-text-hover: #111 }', vars(tokens)).naming, {}, 'the default, iconText as text');
  assert.deepEqual(namingFromCode(':root { --node-selected-hover: #000 }', vars(['node/selectedHover/color'])).naming, { case: 'kebab' }, 'camelCase split with hyphens');
  assert.deepEqual(namingFromCode(':root { --button-background: #fff }', vars(tokens)).naming, {}, 'a tie keeps the default');
  assert.deepEqual(namingFromCode('', vars(tokens)).naming, {});
});

test('every snapshot is beside the token CSS; the system\'s own scripts and the one that holds its icons are found', () => {
  assert.deepEqual(snapshotPaths('packages/ui/src'), {
    snapshotVars: 'packages/ui/src/figma-vars.snapshot.json', snapshotStructure: 'packages/ui/src/figma-structure.snapshot.json',
    compPropsSnapshot: 'packages/ui/src/figma-component-props.snapshot.json', snapshotFrameGeometry: 'packages/ui/src/figma-frame-geometry.snapshot.json',
    snapshotIcons: 'packages/ui/src/figma-icons.snapshot.json', snapshotScreenComponents: 'packages/ui/src/figma-screen-components.snapshot.json',
  });
  const root = mkdtempSync(join(tmpdir(), 'setup-scripts-'));
  put(root, 'src/theme.css', ':root { --a: 1px }');
  put(root, 'src/shared.js', 'document.addEventListener("click", () => {}); const sheet = "<svg><symbol id=\\"icon-a\\"></symbol></svg>";');
  put(root, 'src/wire.js', 'window.addEventListener("load", () => document.body.dataset.ready = "1");');
  put(root, 'src/shared.test.js', 'document.body;');
  put(root, 'src/Button.js', 'import React from "react"; export default () => document.title;');
  put(root, 'src/tokens.js', 'export const gap = 8;');
  assert.deepEqual(systemScripts(root, 'src'), { scripts: ['src/shared.js', 'src/wire.js'], iconSources: ['src/shared.js'] });
});

test('the products checked out beside the system are the folders whose package depends on it; one it lists and lacks is said', () => {
  const parent = mkdtempSync(join(tmpdir(), 'setup-products-'));
  const ds = join(parent, 'tidal-ds');
  put(ds, 'package.json', { name: '@tidal/ds-core' });
  put(ds, '.git/config', '[remote "origin"]\n\turl = https://github.com/tidal-co/tidal-ds.git\n');
  put(ds, 'products.json', { products: [{ repo: 'tidal-co/tidal-app-harbor' }, { repo: 'tidal-co/tidal-app-kelp' }, { repo: 'tidal-co/tidal-app-reef' }] });
  put(join(parent, 'tidal-app-harbor'), 'package.json', { dependencies: { '@tidal/ds-core': 'github:tidal-co/tidal-ds#v1.2.0' } });
  put(join(parent, 'tidal-app-harbor'), 'ui.src.html', '<style>.a{}</style>');
  put(join(parent, 'tidal-app-kelp'), 'package.json', { devDependencies: { 'tidal-ui': 'github:tidal-co/tidal-ds' } });
  put(join(parent, 'tidal-app-kelp'), 'src/ui.src.html', '<style>.a{}</style>');
  put(join(parent, 'other-tool'), 'package.json', { dependencies: { lodash: '^4' } });
  const { products, missing } = productsBeside(ds);
  assert.deepEqual(products, [{ key: 'harbor', dir: '../tidal-app-harbor', ui: '../tidal-app-harbor/ui.src.html' }, { key: 'kelp', dir: '../tidal-app-kelp', ui: '../tidal-app-kelp/src/ui.src.html' }], 'by the package\'s name, or by the repository');
  assert.deepEqual(missing, ['tidal-co/tidal-app-reef']);
  assert.deepEqual(productsBeside(ds, { screenKeys: ['app-harbor'] }).products.map((p) => p.key), ['app-harbor', 'kelp'], 'the key a captured screen names wins');
});

test('the frames and screens a captured screen snapshot names: each product\'s whole screen a frame, its finer views screens', () => {
  const { frames, screens } = framesFromSnapshot({ screens: {
    '1:2': { name: 'Harbor', plugin: 'harbor' }, '3:4': { name: 'Harbor — Export dialog', plugin: 'harbor' },
    '5:6': { name: 'Kelp', plugin: 'kelp' }, '7:8': { name: 'A loose view' } } });
  assert.deepEqual(frames, [{ name: 'Harbor', nodeId: '1-2', plugin: 'harbor' }, { name: 'Kelp', nodeId: '5-6', plugin: 'kelp' }]);
  assert.deepEqual(screens.map((s) => s.name), ['A loose view', 'Harbor — Export dialog']);
  assert.deepEqual(framesFromSnapshot(null), { frames: [], screens: [] });
});

test('setup writes what the project says into ds-config.json', () => {
  const parent = mkdtempSync(join(tmpdir(), 'setup-writes-'));
  const ds = join(parent, 'tidal-ds');
  put(ds, 'package.json', { name: '@tidal/ds-core' });
  put(ds, 'src/theme.css', ':root { --button-iconText: #000; --button-background: #fff; --gap-m: 8px }\n@media (prefers-color-scheme: dark) { :root { --button-iconText: #fff } }');
  put(ds, 'src/figma-vars.snapshot.json', vars(['button/iconText/color', 'button/background/color']));
  put(ds, 'src/figma-screen-components.snapshot.json', { screens: { '1:2': { name: 'Harbor', plugin: 'harbor' }, '3:4': { name: 'Harbor — Export', plugin: 'harbor' } } });
  put(ds, 'src/shared.js', 'document.addEventListener("click", () => {});');
  put(join(parent, 'tidal-harbor'), 'package.json', { dependencies: { '@tidal/ds-core': '^1' } });
  put(join(parent, 'tidal-harbor'), 'ui.src.html', '<style>.a{}</style>');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', '--project=.', '--no-hooks'], { cwd: ds, encoding: 'utf8', env: { ...process.env, FIGMA_TOKEN: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Token names: the CSS keeps Figma's iconText/);
  const cfg = JSON.parse(readFileSync(join(ds, 'ds-config.json'), 'utf8'));
  assert.deepEqual(cfg.figma.namingConvention, { iconTextAlias: false });
  assert.equal(cfg.paths.compPropsSnapshot, 'src/figma-component-props.snapshot.json');
  assert.deepEqual(cfg.systemScripts, ['src/shared.js']);
  assert.deepEqual(cfg.pluginDirs, { harbor: '../tidal-harbor' });
  assert.ok(cfg.paths.pluginCSS.includes('../tidal-harbor/ui.src.html'));
  assert.deepEqual([cfg.frames.map((f) => f.name), cfg.screens.map((s) => s.name)], [['Harbor'], ['Harbor — Export']]);
});

test('with no Figma link the summary says the snapshots cannot be refreshed, and what the checks compared with', () => {
  const line = dataStateLine({ noLink: true, snapshots: [{ file: 'src/figma-vars.snapshot.json', ageHours: 80 }] });
  assert.equal(line, '**No Figma link, so the Figma data cannot be refreshed.** The checks against Figma compared the code with the committed snapshots (the oldest, src/figma-vars.snapshot.json, 3 days old), as they are. Add the Figma file\'s link (figmaFileKey in ds-config.json) to refresh them.');
  assert.match(dataStateLine({ snapshots: [{ file: 'a', ageHours: 80 }] }), /^\*\*Figma data was not refreshed in this run\.\*\*/);
});
