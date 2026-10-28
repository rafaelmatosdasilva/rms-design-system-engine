// component-pairing.mjs — the one answer to "which code file is Figma component X", shared by the file finder, the
// component finder, the code-only lists and the audit. Every name below is invented for these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeFixture, runGate, budget, tempDir } from './helpers.mjs';
import { createPairing, pairingTasks, stateBase, stateSiblings, folderForms, words } from '../component-pairing.mjs';
import { resolveComponentFile, componentSourceFiles, textReader } from '../component-source.mjs';
import { loadLocator } from '../component-locator.mjs';
import { projectState } from '../route.mjs';
import { readPage } from '../styleguide-files.mjs';

const vue = (cls, style = '', script = '') => `<template><div class="${cls}"><slot /></div></template>\n<script setup>${script}</script>\n<style>${style}</style>\n`;
const snap = (components, props = {}, colors = {}) => ({
  'src/figma-structure.snapshot.json': { _updated: '2026-01-01T00:00:00.000Z', components: Object.fromEntries(components.map((n) => [n, { h: 32 }])) },
  'src/figma-component-props.snapshot.json': { _updated: '2026-01-01T00:00:00.000Z', ...props },
  'src/figma-vars.snapshot.json': { _updated: '2026-01-01T00:00:00.000Z', color: { light: colors }, sizing: {} },
});
const rel = (dir, f) => f && f.slice(dir.length + 1);

test('names: words, folder forms and state words', () => {
  assert.deepEqual(words('HbIconButton'), ['hb', 'icon', 'button']);
  assert.deepEqual(words('VButton'), ['v', 'button']);
  assert.deepEqual(folderForms('switches'), ['switches', 'switche', 'switch']);
  assert.ok(folderForms('categories').includes('category'));
  assert.equal(stateBase('tooltipOpen'), 'tooltip');
  assert.equal(stateBase('collapsedPanel'), 'panel');
  assert.equal(stateBase('iconButton'), null);
  assert.ok(stateSiblings('tooltipOpen', 'tooltipClosed'));
  assert.ok(stateSiblings('tooltip', 'tooltipOpen'));
  assert.ok(!stateSiblings('tooltipOpen', 'menuOpen'));
});

// A library of Vue files named by folder, with a CSS variable prefix of its own.
function library() {
  return makeFixture({
    'ds-config.json': {},
    ...snap(['toggle', 'card', 'select', 'tag', 'badge', 'avatar', 'divider'],
      { select: { properties: { size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['S', 'M'] }, 'label#1:0': { type: 'TEXT', defaultValue: 'Pick' } } } },
      { 'toggle/track/color': '#cccccc', 'toggle/thumb/color': '#ffffff', 'card/background/color': '#ffffff', 'card/border/color': '#dddddd',
        'badge/background/color': '#aa0000', 'badge/text/color': '#ffffff', 'divider/line/color': '#eeeeee' }),
    // A generic file name stands for its folder; its tokens agree: paired.
    'src/components/toggles/General.vue': vue('switcher', '.switcher { background: var(--toggle-track); } .switcher::after { background: var(--toggle-thumb); }'),
    // folder/Primary.vue is the folder's component when Figma has no cardPrimary; its tokens agree.
    'src/components/cards/Primary.vue': vue('panel', '.panel { background: var(--card-background); border-color: var(--card-border); }'),
    'src/components/cards/Outline.vue': vue('panel-outline'),
    // A generic file name and nothing else: a proposal.
    'src/components/selects/Default.vue': vue('picker'),
    'src/components/selects/Native.vue': vue('picker-native'),
    // The name after the library prefix, with its tokens: paired.
    'src/components/HbBadge.vue': vue('hb-badge', '.hb-badge { background: var(--badge-background); color: var(--badge-text); }'),
    // Named after avatar, so its divider tokens never make it a divider.
    'src/components/Avatar.vue': vue('avatar', '.avatar { border-color: var(--divider-line); outline-color: var(--divider-line); }'),
    'src/components/HbChip.vue': vue('hb-chip'),
    // Only in the code, its name near Figma's tag.
    'src/components/TagList.vue': vue('tag-list'),
    // A page that uses them holds their names too.
    'src/pages/Settings.vue': '<template><main><General /><Primary /><HbBadge /><!-- toggle, card, badge --></main></template>',
  });
}

test('a generic file name stands for its folder, and two agreeing signs pair it', () => {
  const dir = library();
  const p = createPairing({ ROOT: dir, cfg: {} });
  const toggle = p.pairOf('toggle');
  assert.equal(toggle.status, 'paired');
  assert.equal(rel(dir, toggle.file), 'src/components/toggles/General.vue');
  assert.deepEqual(toggle.signals.sort(), ['generic', 'tokens']);
  const card = p.pairOf('card');
  assert.equal(rel(dir, card.file), 'src/components/cards/Primary.vue', 'folder/Primary.vue is the folder when Figma has no cardPrimary');
  // One weak sign alone is a proposal, never applied.
  const select = p.pairOf('select');
  assert.equal(select.status, 'proposed');
  assert.equal(select.file, null);
  assert.deepEqual(select.candidates.map((c) => rel(dir, c.file)), ['src/components/selects/Default.vue']);
  assert.match(select.how, /^proposed: src\/components\/selects\/Default\.vue \(a generic file name in its folder\); confirm it, or pin it in componentFiles$/);
  // The library prefix (HbBadge, .hb-badge) and its tokens.
  assert.equal(rel(dir, p.pairOf('badge').file), 'src/components/HbBadge.vue');
  assert.deepEqual(p.pairOf('badge').signals.sort(), ['prefix', 'tokens']);
  // A file the name gives to another component is never offered on its tokens alone.
  assert.equal(rel(dir, p.pairOf('avatar').file), 'src/components/Avatar.vue');
  assert.equal(p.pairOf('divider').status, 'none');
  // Only in Figma: the files nearest its name are named.
  const tag = p.pairOf('tag');
  assert.equal(tag.status, 'none');
  assert.deepEqual(tag.candidates.map((c) => rel(dir, c.file)), ['src/components/TagList.vue']);
  assert.equal(tag.how, 'not found; nearest: src/components/TagList.vue');
});

test('folder/Primary.vue is <folder>Primary when Figma has it, and componentFiles always wins', () => {
  const dir = makeFixture({
    'ds-config.json': {},
    ...snap(['card', 'cardPrimary'], {}, { 'card/background/color': '#ffffff' }),
    'src/components/cards/Primary.vue': vue('panel', '.panel { background: var(--card-background); color: var(--card-background); }'),
    'src/components/cards/Plain.vue': vue('panel-plain'),
    'src/components/legacy/Box.vue': vue('box'),
  });
  const p = createPairing({ ROOT: dir, cfg: {} });
  assert.equal(rel(dir, p.pairOf('cardPrimary').file), 'src/components/cards/Primary.vue');
  assert.deepEqual(p.pairOf('cardPrimary').signals, ['folder']);
  assert.equal(p.pairOf('card').file, null, 'the file cardPrimary is named after is not card on its tokens alone');
  const pinned = createPairing({ ROOT: dir, cfg: { componentFiles: { cardPrimary: 'src/components/legacy/Box.vue' } } });
  assert.deepEqual([pinned.pairOf('cardPrimary').status, rel(dir, pinned.pairOf('cardPrimary').file)], ['pinned', 'src/components/legacy/Box.vue']);
});

test('a Figma component that is one style of a code component pairs with it: its name and a style its props choose', () => {
  const dir = makeFixture({
    'ds-config.json': {},
    ...snap(['bannerTopPrimary', 'bannerTopSecondary', 'bannerTopTertiary', 'bannerSide']),
    'src/components/banners/Top.vue': vue('top-wrapper', '', 'defineProps({ title: String, useSecondaryStyle: Boolean })'),
    'src/components/banners/Side.vue': vue('side-wrapper'),
  });
  const p = createPairing({ ROOT: dir, cfg: {} });
  for (const n of ['bannerTopPrimary', 'bannerTopSecondary']) assert.deepEqual([rel(dir, p.pairOf(n).file), p.pairOf(n).signals], ['src/components/banners/Top.vue', ['variant']], n);
  assert.equal(p.pairOf('bannerTopTertiary').file, null, 'a style no prop chooses is not that file');
  assert.equal(rel(dir, p.pairOf('bannerSide').file), 'src/components/banners/Side.vue');
});

test('tokens name the component, whatever the file is called: a proposal alone, paired with its props', () => {
  const props = { tooltip: { properties: { placement: { type: 'VARIANT', defaultValue: 'Top', variantOptions: ['Top', 'Bottom'] }, 'text#2:0': { type: 'TEXT', defaultValue: 'Hint' } } } };
  const colors = { 'tooltip/background/color': '#222222', 'tooltip/text/color': '#ffffff' };
  const css = '.popover { --local-bg: var(--advanced-tooltip-bg); background: var(--advanced-tooltip-bg); color: var(--advanced-tooltip-fg); }';
  const files = (script) => ({
    'ds-config.json': {},
    ...snap(['tooltip'], props, colors),
    'src/components/overlays/Advanced.vue': vue('popover', css, script),
    'src/components/overlays/Sheet.vue': vue('sheet'),
    // A page that uses it holds the word too: a mention shared with a page says nothing.
    'src/pages/Help.vue': '<template><main><Advanced text="A tooltip" /></main></template>',
  });
  const alone = makeFixture(files(''));
  const a = createPairing({ ROOT: alone, cfg: {} }).pairOf('tooltip');
  assert.equal(a.status, 'proposed');
  assert.deepEqual(a.candidates.map((c) => [rel(alone, c.file), c.signals]), [['src/components/overlays/Advanced.vue', ['tokens']]]);
  const withProps = makeFixture(files("defineProps({ placement: { type: String, default: 'Top' }, text: String })"));
  const b = createPairing({ ROOT: withProps, cfg: {} }).pairOf('tooltip');
  assert.equal(b.status, 'paired');
  assert.deepEqual(b.signals.sort(), ['props', 'tokens']);
});

test('one code component for two Figma components that differ by a state word, when the tokens agree', () => {
  const colors = { 'tooltip/background/color': '#222222', 'tooltip/text/color': '#ffffff' };
  const make = (style) => makeFixture({ 'ds-config.json': {}, ...snap(['tooltipOpen', 'tooltipClosed'], {}, colors), 'src/components/Tooltip.vue': vue('tooltip', style) });
  const agree = make('.tooltip { background: var(--tooltip-background); color: var(--tooltip-text); }');
  const p = createPairing({ ROOT: agree, cfg: {} });
  for (const n of ['tooltipOpen', 'tooltipClosed']) {
    assert.equal(p.pairOf(n).status, 'paired', n);
    assert.equal(rel(agree, p.pairOf(n).file), 'src/components/Tooltip.vue');
    assert.deepEqual(p.pairOf(n).signals.sort(), ['state', 'tokens']);
  }
  assert.deepEqual(p.codeOnly(), [], 'Tooltip.vue is theirs, not only the code\'s');
  // No tokens to agree: a proposal for each.
  const q = createPairing({ ROOT: make(''), cfg: {} });
  assert.deepEqual(['tooltipOpen', 'tooltipClosed'].map((n) => q.pairOf(n).status), ['proposed', 'proposed']);
});

test('only the library\'s own files are components: a docs site, a helper, a mock or a route never pairs or counts as code only', () => {
  const dir = makeFixture({
    'ds-config.json': {},
    ...snap(['searchBar', 'checkboxGroup', 'tag', 'chip', 'badge', 'buttonClock', 'clock', 'tableCell/amount', 'tableHeaderSorting', 'cardOutline']),
    'src/components/library/search/Bar.vue': vue('search-bar'),
    'src/components/library/checkbox/Group.vue': vue('checkbox-group'),
    'src/components/library/Tag.vue': vue('tag'),
    'src/components/library/Chip.vue': vue('chip'),
    'src/components/library/Badge.vue': vue('badge'),
    'src/components/library/buttons/Clock.vue': vue('button-clock'),
    'src/components/library/tables/body/cells/Amount.vue': vue('amount'),
    'src/components/library/tables/header/Sorting.vue': vue('sorting'),
    'src/components/library/headers/Page.vue': '<template><header class="header"><div class="cardOutline" /></header></template>',
    // The docs site's own copy, its helpers, a mock that lists the components, a route named after one.
    'src/docsSite/components/checkbox/Group.vue': vue('checkbox-group'),
    'src/docsSite/components/Anchors.vue': vue('anchors'),
    'src/docsSite/mocks/menu.js': "export default [{ name: 'searchBar' }, { name: 'clock' }];",
    'src/router/clock.js': "export default { path: '/clock' };",
    'src/views/Cards.vue': '<template><div class="cardOutline" /></template>',
  });
  const p = createPairing({ ROOT: dir, cfg: {} });
  assert.equal(p.home, 'src/components/library');
  assert.equal(rel(dir, p.pairOf('searchBar').file), 'src/components/library/search/Bar.vue', 'the mock that lists it is not a second candidate');
  assert.equal(rel(dir, p.pairOf('checkboxGroup').file), 'src/components/library/checkbox/Group.vue', 'nor the docs site\'s copy');
  // A Figma name its path spells, a folder in between left out and a plural s dropped.
  assert.deepEqual([p.pairOf('tableCell/amount').status, rel(dir, p.pairOf('tableCell/amount').file)], ['paired', 'src/components/library/tables/body/cells/Amount.vue']);
  assert.equal(rel(dir, p.pairOf('tableHeaderSorting').file), 'src/components/library/tables/header/Sorting.vue');
  // A file name alone gives way to the component its folder and name spell; a route named after it is no file of it.
  assert.equal(rel(dir, p.pairOf('buttonClock').file), 'src/components/library/buttons/Clock.vue');
  assert.equal(p.pairOf('clock').status, 'none');
  // The one library file holding a selector a page uses too is not its file.
  assert.equal(p.pairOf('cardOutline').status, 'none');
  assert.deepEqual(p.codeOnly().map((k) => k.file).filter((f) => !/^src\/components\/library\//.test(f)), [], 'the docs site\'s own components are not the code\'s');
});

test('a generic file in a folder of its name whose root class starts with it pairs; tokens a surface shares point at no file', () => {
  const dir = makeFixture({
    'ds-config.json': {},
    ...snap(['emptyState', 'tableHeader', 'cardFloat', 'tag', 'chip', 'badge', 'link', 'avatar'], {}, { 'cardFloat/background/color': '#ffffff', 'cardFloat/shadow/color': '#000000' }),
    'src/components/library/emptyStates/General.vue': vue('empty-state-container'),
    'src/components/library/tables/header/Base.vue': '<template><thead class="table-header-wrapper"><tr /></thead></template>',
    // Two pickers each painted with cardFloat's surface: neither is cardFloat.
    'src/components/library/calendar/PickerDay.vue': vue('picker-day', '.picker-day { background: var(--cardFloat-background); box-shadow: 0 0 2px var(--cardFloat-shadow); }'),
    'src/components/library/calendar/PickerYear.vue': vue('picker-year', '.picker-year { background: var(--cardFloat-background); box-shadow: 0 0 2px var(--cardFloat-shadow); }'),
    'src/components/library/Tag.vue': vue('tag'), 'src/components/library/Chip.vue': vue('chip'), 'src/components/library/Badge.vue': vue('badge'),
    'src/components/library/Link.vue': vue('link'), 'src/components/library/Avatar.vue': vue('avatar'),
  });
  const p = createPairing({ ROOT: dir, cfg: {} });
  assert.deepEqual([p.pairOf('emptyState').status, rel(dir, p.pairOf('emptyState').file)], ['paired', 'src/components/library/emptyStates/General.vue']);
  assert.deepEqual([p.pairOf('tableHeader').status, rel(dir, p.pairOf('tableHeader').file)], ['paired', 'src/components/library/tables/header/Base.vue']);
  assert.equal(p.pairOf('cardFloat').status, 'none');
});

test('every place shares the one pairing: the file finder, the component finder, the code-only lists and the tasks', async () => {
  const dir = library();
  const files = componentSourceFiles(dir, {});
  const read = textReader();
  // The file finder every gate uses.
  assert.equal(rel(dir, resolveComponentFile('toggle', { ROOT: dir, cfg: {}, files, read }).file), 'src/components/toggles/General.vue');
  const select = resolveComponentFile('select', { ROOT: dir, cfg: {}, files, read });
  assert.equal(select.file, null);
  assert.match(select.how, /^proposed: src\/components\/selects\/Default\.vue/);
  // A caller that reads only some files gets the pair only when it is one of them.
  const tsxOnly = files.filter((f) => f.endsWith('.tsx'));
  assert.equal(resolveComponentFile('toggle', { ROOT: dir, cfg: {}, files: tsxOnly, read }).file, null);
  // The component finder takes the paired file's class.
  const loc = await loadLocator(dir, {});
  assert.deepEqual([loc.selectorFor('toggle'), loc.sourceOf('toggle')], ['.switcher', 'code']);
  assert.equal(loc.selectorFor('select'), '.select', 'a proposal is never applied');
  // Only in the code: neither a paired file nor a proposed one.
  const only = loc.pairing().codeOnly().map((k) => k.name).sort();
  assert.deepEqual(only, ['HbChip', 'Native', 'Outline', 'TagList']);
  assert.ok(projectState(dir).components.includes('TagList'));
  assert.ok(!projectState(dir).components.includes('General'));
  // The audit's and the style guide's lines: confirm or pin each proposal, and the nearest files for one only in Figma.
  const tasks = pairingTasks(loc.pairing(), { ROOT: dir });
  assert.deepEqual(tasks.map((t) => [t.kind, t.name]), [['proposed', 'select'], ['none', 'tag']]);
  assert.match(tasks[0].todo, /componentFiles/);
  assert.deepEqual(pairingTasks(loc.pairing(), { ROOT: dir, skip: new Set(['select', 'tag']) }), []);
});

test('the props gate names the proposal for a component it finds no file for, and pairs on componentFiles', () => {
  const props = { select: { nodeId: '1:1', properties: { size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['S', 'M'] } } } };
  const files = {
    'ds-config.json': { paths: { compPropsSnapshot: 'src/figma-component-props.snapshot.json' } },
    ...snap(['select'], props),
    'src/components/selects/Default.vue': vue('picker', '', "defineProps({ size: { type: String, default: 'M' } })"),
  };
  const r = runGate('component-prop-check.mjs', files);
  assert.equal(r.code, 1);
  assert.match(r.out, /select: has Figma properties \[size\] but no code component found \(proposed: src\/components\/selects\/Default\.vue \(a generic file name in its folder\); confirm it, or pin it in componentFiles\)/);
  const pinned = runGate('component-prop-check.mjs', { ...files, 'ds-config.json': { ...files['ds-config.json'], componentFiles: { select: 'src/components/selects/Default.vue' } } });
  assert.equal(pinned.code, 0, pinned.out);
});

test('the audit and the style guide list a proposal to confirm or pin, and never show its file as the code\'s alone', { timeout: budget(300000) }, async () => {
  const { cpSync, writeFileSync, readFileSync, mkdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const ENGINE = join(import.meta.dirname, '..');
  const dir = tempDir('pairing-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), dir, { recursive: true });
  const structure = JSON.parse(readFileSync(join(dir, 'figma', 'structure.snapshot.json'), 'utf8'));
  structure.components.tag = { h: 20, defaultVariant: '', variants: {} };
  writeFileSync(join(dir, 'figma', 'structure.snapshot.json'), JSON.stringify(structure, null, 2));
  mkdirSync(join(dir, 'components', 'tags'), { recursive: true });
  writeFileSync(join(dir, 'components', 'tags', 'Default.vue'), '<template><span class="hb-tag-item"><slot /></span></template>\n');
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: '/nonexistent' } });
  const audit = run('--no-a11y-bake');
  assert.match(audit.stdout, /🔗 Which file is each Figma component: 1 on one sign only\. Not paired until you confirm it, or pin it in ds-config\.json → componentFiles\.\n {3}· Figma's tag may be components\/tags\/Default\.vue \(a generic file name in its folder\): one sign only, so it is not paired\./);
  assert.doesNotMatch(audit.stdout, /🧱 /, 'the proposed file is not a component only in code');
  const sg = run('--styleguide', '--no-a11y-bake');
  assert.equal(sg.status, 0, sg.stdout + sg.stderr);
  const page = readPage(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'));
  assert.match(page, /"who":"both","area":"Parity","type":"Component pairing","kind":"Pairing","pairing":"tag","match":"proposed","say":"Figma's tag may be components\/tags\/Default\.vue/);
  assert.doesNotMatch(page, /"codeOnly":\{"file":"components\/tags\/Default\.vue"/);
});
