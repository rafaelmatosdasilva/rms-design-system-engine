// E37 and E38: what setup cannot know before Figma is captured (the collection names, the colour modes and the naming
// the token CSS follows) is filled from the first capture, never guessed, and a CSS that keeps `/color` or `/default`
// is read as it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { namingFromCode, namingWords, settleFromCapture, FROM_CAPTURE } from '../setup-facts.mjs';
import { varsFromDesign } from '../figma-cli-import.mjs';
import { tidepoolDesign } from './figma-cli-design.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const vars = (tokens, more = {}) => ({ color: { light: Object.fromEntries(tokens.map((t) => [t, '#000000'])) }, ...more });

test('E37: a CSS that keeps /color, /default or both is read as it is written', () => {
  const tokens = ['button/background/default/color', 'button/background/hover/color', 'chip/border/default/color'];
  const both = namingFromCode(':root { --button-background-default-color: #000; --button-background-hover-color: #111; --chip-border-default-color: #222 }', vars(tokens));
  assert.deepEqual(both.naming, { dropSegments: [] });
  assert.equal(both.found, 3);
  assert.equal(namingWords(both.naming), 'keeps /color and /default');
  const colour = namingFromCode(':root { --button-background-default-color: #000; --button-background-hover-color: #111 }', vars(['button/background/default/color', 'button/background/hover/color']));
  assert.equal(colour.found, 2);
  assert.deepEqual(namingFromCode(':root { --button-background-default: #000; --button-background-hover: #111 }', vars(tokens)).naming, { dropSegments: ['color'] });
  assert.equal(namingWords({ dropSegments: ['color'] }), 'keeps /default');
  assert.deepEqual(namingFromCode(':root { --button-background-iconText-default-color: #000 }', vars(['button/background/iconText/default/color'])).naming, { iconTextAlias: false, dropSegments: [] });
  assert.deepEqual(namingFromCode(':root { --button-background: #000; --button-background-hover: #111; --chip-border: #222 }', vars(tokens)).naming, {}, 'the default, as before');
});

test('E38: the first capture fills the collection names, the colour modes with their CSS, the naming, and says the other collections', () => {
  const css = ':root { --card-surface-color: #fff; --gap-m: 12px }\n:root[data-theme="night"] { --card-surface-color: #000 }\n@media (max-width: 600px) { :root { --gap-m: 8px } }';
  const cfg = { figma: { colorCollection: 'Color', sizingCollection: null, modes: [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'dark-media' }], fromCapture: FROM_CAPTURE } };
  const captured = {
    _modeOrder: { color: ['day', 'night'], Dimensions: ['desktop', 'phone'] },
    _collections: { color: 'Styling', colorModes: ['Day', 'Night'], sizing: ['Dimensions'] },
    color: { day: { 'card/surface/color': '#ffffff' }, night: { 'card/surface/color': '#000000' } },
    sizing: { 'gap/m': '12px' },
    modeVariants: { Dimensions: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'gap/m': { kind: 'scalar', values: { desktop: '12px', phone: '8px' } } } } },
  };
  assert.equal(settleFromCapture(cfg, { color: {} }, css), null, 'no capture yet: nothing to fill, the list kept');
  assert.equal(settleFromCapture({ figma: { colorCollection: 'Color' } }, captured, css), null, 'a project set up from a capture is left as it is');
  const r = settleFromCapture(cfg, captured, css);
  assert.equal(r.figma.fromCapture, undefined, 'filled once, then the list goes');
  assert.equal(r.figma.colorCollection, 'Styling');
  assert.equal(r.figma.sizingCollection, 'Dimensions');
  assert.deepEqual(r.figma.modes, [{ name: 'Day', snapshotKey: 'day', cssSelector: 'root' }, { name: 'Night', snapshotKey: 'night', cssSelector: 'data:theme=night' }]);
  assert.deepEqual(r.figma.namingConvention, { dropSegments: [] });
  assert.deepEqual(r.unsure, []);
  assert.deepEqual(r.lines, [
    'the colour collection is Styling',
    'the sizing collection is Dimensions',
    'the colour modes are Day (the base), Night (data:theme=night)',
    'the token CSS keeps /color and /default (2 of 2 Figma tokens found that way)',
    'Dimensions has the modes Desktop (the base), Phone (media:(max-width: 600px))',
  ]);
  // Two collections hold sizes: none is named, so a capture keeps reading both.
  assert.equal(settleFromCapture(cfg, { ...captured, _collections: { ...captured._collections, sizing: ['Dimensions', 'Radii'] } }, css).figma.sizingCollection, null);
});

// The capture recipe's single-pass script, run on a file whose collections and modes are not the ones the config
// names (setup's guess before a first capture): it finds them and says which it read.
test('E38: the capture recipe finds the colour collection, its modes and the sizes itself, and returns their names', async () => {
  const recipe = readFileSync(join(ENGINE, 'cookbook', 'refresh-figma.md'), 'utf8');
  const fence = '`'.repeat(3);
  const single = recipe.split('### Step 1b-single')[1].split(fence + 'js\n')[1].split(fence)[0];
  const cols = [
    { id: 'c1', name: 'Styling', modes: [{ modeId: 'm1', name: 'Day' }, { modeId: 'm2', name: 'Night' }], variableIds: ['v1'] },
    { id: 'c2', name: 'Dimensions', modes: [{ modeId: 'm3', name: 'Desktop' }, { modeId: 'm4', name: 'Phone' }], variableIds: ['v2'] },
  ];
  const vs = {
    v1: { id: 'v1', name: 'card/surface/color', resolvedType: 'COLOR', valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 }, m2: { r: 0, g: 0, b: 0, a: 1 } } },
    v2: { id: 'v2', name: 'gap/m', resolvedType: 'FLOAT', valuesByMode: { m3: 12, m4: 8 } },
  };
  const figma = { variables: { getLocalVariableCollectionsAsync: async () => cols, getVariableByIdAsync: async (id) => vs[id] ?? null }, getLocalTextStylesAsync: async () => [] };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const out = await new AsyncFunction('figma', single)(figma);
  assert.deepEqual(out.color, { day: { 'card/surface/color': '#ffffff' }, night: { 'card/surface/color': '#000000' } });
  assert.deepEqual(out.sizing, { 'gap/m': '12px' });
  assert.deepEqual(out._collections, { color: 'Styling', colorModes: ['Day', 'Night'], sizing: ['Dimensions'] });
  assert.deepEqual(out._modeOrder, { color: ['day', 'night'], Dimensions: ['desktop', 'phone'] });
  assert.deepEqual(out.modeVariants.Dimensions.vars['gap/m'].values, { desktop: '12px', phone: '8px' });
});

test('E38: the figma-cli import records the collections it read, and takes the file\'s modes when none configured is there', () => {
  const v = varsFromDesign(tidepoolDesign(), { figma: { modes: [{ name: 'Day', snapshotKey: 'day' }] } });
  assert.deepEqual(v.collections, { color: 'Theme', colorModes: ['Dark', 'Light'], sizing: ['Sizing'] });
  assert.deepEqual(Object.keys(v.color).sort(), ['dark', 'light']);
});

test('E37 and E38 end to end: setup lists what it cannot know, and the first capture fills ds-config.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'from-capture-'));
  const design = tidepoolDesign();
  const theme = design.variables.find((c) => c.name === 'Theme').variables;
  const val = (v, mode) => (typeof v.values[mode] === 'string' ? v.values[mode] : '#123456');
  // The token CSS keeps every segment of Figma's names (`--button-background-color`), and sets Dark on a data attribute.
  const css = `:root {\n${theme.map((v) => `  --${v.name.replace(/\//g, '-')}: ${val(v, 'Light')};`).join('\n')}\n}\n:root[data-theme="dark"] {\n${theme.map((v) => `  --${v.name.replace(/\//g, '-')}: ${val(v, 'Dark')};`).join('\n')}\n}\n`;
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'src', 'styles', 'tokens.css'), css);
  writeFileSync(join(dir, 'package.json'), '{"name":"kit"}\n');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FIGMA_TOKEN: '' } });
  let r = run('--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/Kit', '--theme-css=src/styles/tokens.css', '--project=.', '--no-hooks');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.deepEqual(cfg.figma.fromCapture, FROM_CAPTURE);
  for (const k of ['breakpointCollection', 'animationCollection', 'excludeCollections']) assert.equal(k in cfg.figma, false, `${k}: nothing reads it`);
  assert.match(r.stdout, /filled from the first capture/);
  assert.doesNotMatch(r.stdout, /defaulted to "Color"/);
  writeFileSync(join(dir, 'design.json'), JSON.stringify(design));
  r = run('--from-figma-cli', 'design.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.equal(cfg.figma.fromCapture, undefined);
  assert.equal(cfg.figma.colorCollection, 'Theme');
  assert.equal(cfg.figma.sizingCollection, 'Sizing');
  // Figma lists Dark first; the CSS sets Light in :root and Dark on a data attribute, so Light is the base.
  assert.deepEqual(cfg.figma.modes, [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'data:theme=dark' }]);
  assert.deepEqual(cfg.figma.namingConvention, { dropSegments: [] });
  assert.match(r.stdout, /From the first Figma capture, ds-config\.json now says what setup could not know/);
  assert.match(r.stdout, /the token CSS keeps \/color and \/default/);
  // Filled once: a later capture leaves the config alone.
  const before = readFileSync(join(dir, 'ds-config.json'), 'utf8');
  r = run('--from-figma-cli', 'design.json');
  assert.equal(readFileSync(join(dir, 'ds-config.json'), 'utf8'), before);
  assert.ok(existsSync(join(dir, 'src', 'styles', 'figma-vars.snapshot.json')));
});
