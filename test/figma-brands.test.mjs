import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandsCaptureScript, brandsSnapshot, readBrandsWith, brandList, brandDeclarations, brandCss, brandOf } from '../figma-brands.mjs';

const LIST = { _read: '2026-10-15T00:00:00Z', _file: 'Themes', collections: [
  { name: 'Acme', parent: 'Theme', root: 'Theme', modes: ['Light', 'Dark'], overridden: 2 },
  { name: 'Retail Styling', parent: 'Acme', root: 'Theme', modes: ['Light', 'Dark'], overridden: 1 },
  { name: 'Acme Sizing', parent: 'Breakpoint', root: 'Breakpoint', modes: ['Desktop', 'Phone'], overridden: 1 },
] };
const PARTS = [
  { collection: 'Acme', overrides: { 'primitives/green': { Light: '#00aa66', Dark: '#00ff99' }, 'base/brandHue/color': { Light: { alias: 'primitives/green' }, Dark: { alias: 'primitives/green' } } }, next: null },
  { collection: 'Retail Styling', overrides: { 'primitives/green': { Light: '#cc5500' } }, next: null },
  { collection: 'Acme Sizing', overrides: { 'bannerMain/minHeight': { Desktop: 88 } }, next: null },
];

test('the capture script only reads: it names no setter, and asks for one collection part by part', () => {
  for (const s of [brandsCaptureScript(), brandsCaptureScript({ collection: 'Acme', from: 150 })]) {
    assert.doesNotMatch(s, /\.(setValueForMode|remove|extend|createVariable|setPluginData)\(/);
    assert.match(s, /Read-only/);
  }
  assert.match(brandsCaptureScript({ collection: 'Acme', from: 150 }), /const WANT = "Acme";[\s\S]*FROM = 150/);
});

test('a brand is its collections by their first word, under the brand its colour collection extends', () => {
  assert.equal(brandOf('Retail Styling'), 'Retail');
  assert.equal(brandOf('Acme Sizing'), 'Acme');
  const list = brandList(brandsSnapshot([JSON.stringify(LIST), ...PARTS.map((p) => JSON.stringify(p))]));
  assert.deepEqual(list.map((b) => [b.key, b.parent]), [['acme', null], ['retail', 'acme']]);
  const retail = list.find((b) => b.key === 'retail');
  // Retail inherits Acme's values, its own winning, and Acme's sizes.
  assert.equal(retail.overrides['primitives/green'].Light, '#cc5500');
  assert.equal(retail.overrides['primitives/green'].Dark, '#00ff99');
  assert.equal(retail.overrides['bannerMain/minHeight'].Desktop, 88);
  assert.deepEqual(list[0].family, ['acme', 'retail']);
});

test('a variable that points at an overridden one is written again, all the way up its chain', () => {
  const decl = brandDeclarations({ 'primitives/green': { Light: '#0a6' } }, 'Light', { 'base/accent': ['primitives/green'], 'button/background': ['base/accent', 'primitives/green'], 'other': ['primitives/red'] });
  assert.deepEqual([...decl.keys()].sort(), ['base/accent', 'button/background', 'primitives/green']);
  assert.deepEqual(decl.get('button/background'), { alias: 'base/accent' });
});

test('the CSS puts a brand on the previews only, each mode where it applies, a brand under another writing only what it changes', () => {
  const list = brandList(brandsSnapshot([LIST, ...PARTS]));
  const css = brandCss(list, {
    axes: [{ attr: 'data-theme', baseValue: 'light', modes: [{ name: 'Light', key: 'light', attr: null, value: 'light' }, { name: 'Dark', key: 'dark', attr: 'data-theme', value: 'dark' }] }],
    aliases: { light: {}, dark: {} }, toVar: (n) => '--' + n.replace(/\//g, '-'), scope: '.pg-preview',
  });
  // Acme's block reaches Retail; Retail's writes its own light value only.
  assert.match(css, /:is\(\[data-brand="acme"\], \[data-brand="retail"\]\) :is\(\.pg-preview\):not\(\[data-theme="dark"\], \[data-theme="dark"\] \*\)/);
  assert.match(css, /\[data-brand="retail"\] :is\(\.pg-preview\):not[^{]*\{\n  --primitives-green: #cc5500;\n/);
  assert.doesNotMatch(css.split('[data-brand="retail"] :is')[1] ?? '', /--primitives-green: #00ff99/);
  assert.match(css, /--base-brandHue-color: var\(--primitives-green\)/);
  // Dark where the page or the preview is dark, never in a preview set back to light.
  assert.match(css, /\[data-theme="dark"\] :is\(\.pg-preview\):not\(\[data-theme="light"\]\)/);
  assert.doesNotMatch(css, /:root|body/);
});

test('read through a runner: the list, then each collection in parts, a part cut read in smaller ones', async () => {
  const seen = [];
  const run = async (script) => {
    const want = /const WANT = ("[^"]*"|null)/.exec(script)[1], from = Number(/FROM = (\d+)/.exec(script)[1]), count = Number(/COUNT = (\d+)/.exec(script)[1]);
    seen.push([want, from, count]);
    if (want === 'null') return JSON.stringify(LIST);
    const name = JSON.parse(want);
    if (name === 'Acme' && count > 50) return 'output cut at 20000 characters';
    return JSON.stringify(PARTS.find((p) => p.collection === name));
  };
  const snap = await readBrandsWith(run, { wait: 0 });
  assert.equal(snap.collections.length, 3);
  assert.equal(snap.collections[0].overrides['primitives/green'].Dark, '#00ff99');
  assert.ok(seen.some(([w, , c]) => w === '"Acme"' && c === 50));
});

test('a layer a brand switches off draws nothing: its colours transparent, its offsets and widths 0', async () => {
  const { hiddenLayers } = await import('../figma-brands.mjs');
  const names = ['bannerMain/shadow/display', 'bannerMain/shadow/color', 'bannerMain/shadow/Y', 'bannerMain/shadow/blur', 'bannerMain/radius', 'button/border/default/display', 'button/border/default/color'];
  const standard = (v) => ({ 'bannerMain/shadow/display': true, 'button/border/default/display': 'false' })[v] ?? null;
  const off = hiddenLayers({ 'bannerMain/shadow/display': { Dark: false }, 'button/border/default/display': { Dark: false } }, 'Dark', { names, standard });
  // Off wherever it is off (the code has no switch for it, so it draws the layer whatever the system says).
  assert.deepEqual(Object.fromEntries(off), { 'bannerMain/shadow/color': 'transparent', 'bannerMain/shadow/Y': 0, 'bannerMain/shadow/blur': 0, 'button/border/default/color': 'transparent' });
  // In another mode: nothing to write.
  assert.equal(hiddenLayers({ 'bannerMain/shadow/display': { Dark: false } }, 'Light', { names, standard }).size, 0);
});

test('brands kept as stylesheets give the same snapshot: a file a brand, each block in the mode its selector names', async () => {
  const { brandsFromCss } = await import('../figma-brands.mjs');
  const snap = brandsFromCss([
    { name: 'acme.css', css: ':root { --primitives-green: #0a6; --base-accent: var(--primitives-green); }\n[data-theme="dark"] { --primitives-green: #0f9; }' },
    { name: 'retail.css', css: '/* extends: acme */\n:root { --primitives-green: #c50; }' },
  ], { modes: [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'data:theme=dark' }] });
  const list = brandList(snap);
  assert.deepEqual(list.map((b) => [b.key, b.parent]), [['acme', null], ['retail', 'acme']]);
  assert.deepEqual(list[1].overrides['--primitives-green'], { Light: '#c50', Dark: '#0f9' });
  assert.deepEqual(list[0].overrides['--base-accent'], { Light: { alias: '--primitives-green' } });
});

test('a brand under another follows the links of the one above it, not the system\'s', () => {
  const standard = { 'menu/selected': ['base/primary'], 'base/primary': [] };
  // Acme points the selected background at the app's background; Retail changes the primary hue only.
  const acme = { 'menu/selected': { Light: { alias: 'base/pageBackground' } } };
  const retail = { 'base/primary': { Light: '#e05200' } };
  const decl = brandDeclarations(retail, 'Light', standard, { names: [] }, { ...acme, ...retail });
  assert.deepEqual([...decl.keys()], ['base/primary']);
  // On its own (the system's links), Retail would repaint the selected background too.
  assert.deepEqual([...brandDeclarations(retail, 'Light', standard).keys()].sort(), ['base/primary', 'menu/selected']);
});

test('a colour with an opacity of its own is mixed with transparent at that share; an unread shape is left out', () => {
  const list = brandList(brandsSnapshot([{ collections: [{ name: 'Acme', parent: 'Theme', modes: ['Light'] }] }, { collection: 'Acme', overrides: { 'check/bg': { Light: { alias: 'base/primary', opacity: 16 } }, 'odd': { Light: { color: {}, opacity: 3 } } } }]));
  const css = brandCss(list, { axes: [{ attr: 'data-theme', baseValue: null, modes: [{ name: 'Light', key: 'light', attr: null }] }], toVar: (n) => '--' + n.replace(/\//g, '-') });
  assert.match(css, /--check-bg: color-mix\(in srgb, var\(--base-primary\) 16%, transparent\);/);
  assert.doesNotMatch(css, /\[object Object\]|--odd:/);
});

test('a link written again keeps the opacity the brand above gave it', () => {
  const acme = { 'line/color': { Light: { alias: 'neutral/1000', opacity: 3 } } };
  const retail = { 'neutral/1000': { Light: '#0f0d0a' } };
  const decl = brandDeclarations(retail, 'Light', {}, { names: [] }, { ...acme, ...retail });
  assert.deepEqual(decl.get('line/color'), { alias: 'neutral/1000', opacity: 3 });
});

test('a link with an opacity to a colour that has one already keeps the inner one, as Figma draws it', () => {
  const list = brandList(brandsSnapshot([{ collections: [{ name: 'Acme', parent: 'Theme', modes: ['Light'] }] }, { collection: 'Acme', overrides: { 'stepper/active': { Light: { alias: 'base/primary', opacity: 6 } }, 'row/selected': { Light: { alias: 'stepper/active', opacity: 16 } } } }]));
  const css = brandCss(list, { axes: [{ attr: 'data-theme', baseValue: null, modes: [{ name: 'Light', key: 'light', attr: null }] }], toVar: (n) => '--' + n.replace(/\//g, '-') });
  assert.match(css, /--row-selected: var\(--stepper-active\);/);
  assert.match(css, /--stepper-active: color-mix\(in srgb, var\(--base-primary\) 6%, transparent\);/);
});

test('fontFaces: one file per weight and style, the smallest format the folder has', async () => {
  const { fontFaces } = await import('../figma-brands.mjs');
  const f = (name) => ({ name, data: Buffer.from(name) });
  const faces = fontFaces('Acme Sans', [f('AcmeSans-Bold.otf'), f('AcmeSans-Bold.woff2'), f('AcmeSans-Bold.ttf'), f('AcmeSans-BoldItalic.otf'), f('AcmeSans-Regular.ttf'), f('AcmeSans-Regular.woff'), f('Other-Bold.woff2')]);
  assert.equal(faces.length, 3);
  assert.match(faces[0], /font\/woff2;.*font-weight: 700; font-style: normal/);
  assert.match(faces[1], /font\/otf;.*font-weight: 700; font-style: italic/);
  assert.match(faces[2], /font\/woff;.*font-weight: 400; font-style: normal/);
});
