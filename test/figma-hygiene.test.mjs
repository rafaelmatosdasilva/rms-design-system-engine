// the Figma file's own hygiene, recorded by the component-values sweep and listed as advice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hygieneOf, hygieneFindings, hygieneBlock, hygieneScore, reliability, reliabilityLine } from '../figma-hygiene.mjs';
import { byNodeId } from '../figma-fetch.mjs';
import { burndown } from '../run-diff.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const solid = (r, g, b, extra = {}) => ({ type: 'SOLID', color: { r, g, b }, ...extra });
const alias = { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' };

// A REST /nodes document: a set with two variants.
const restSet = {
  type: 'COMPONENT_SET', name: 'Chip', strokes: [solid(0.59, 0.28, 1)],   // the set's own dashed border is Figma's, never counted
  children: [
    { type: 'COMPONENT', name: 'Size=M', layoutMode: 'HORIZONTAL', itemSpacing: 4, paddingLeft: 12, paddingRight: 12,
      boundVariables: { paddingLeft: alias, paddingRight: alias, itemSpacing: alias, fills: [alias] },
      fills: [solid(1, 1, 1)], cornerRadius: 16, styles: {},
      children: [
        { type: 'TEXT', name: 'Label', styles: { text: 'S:1', fill: 'S:2' }, fills: [solid(0, 0, 0)] },
        { type: 'INSTANCE', name: 'Icon', fills: [solid(1, 0, 0)], children: [{ type: 'VECTOR', name: 'Glyph', fills: [solid(1, 0, 0)] }] },
      ] },
    { type: 'COMPONENT', name: 'Size=L', cornerRadius: 16, boundVariables: { topLeftRadius: alias },
      fills: [solid(1, 1, 1, { boundVariables: { color: alias } }), solid(0, 0, 0, { visible: false })],
      children: [
        { type: 'TEXT', name: 'Label', style: { fontSize: 14 }, fills: [solid(0.1, 0.45, 0.91)] },
        { type: 'FRAME', name: 'Tail', layoutMode: 'HORIZONTAL', itemSpacing: 6, paddingTop: 2, children: [{ type: 'RECTANGLE', name: 'a' }, { type: 'RECTANGLE', name: 'b' }] },
        { type: 'VECTOR', name: 'Divider', strokes: [solid(0.5, 0.5, 0.5)] },
      ] },
  ],
};

test('REST: a value with no variable or style is raw; styles, bound variables, artwork, instances and hidden paints are not', () => {
  const h = hygieneOf(restSet, '');
  assert.deepEqual(h.raw, [
    { at: 'Size=M', field: 'radius', value: 16 },
    { at: 'Size=L/Label', field: 'fill', value: '#1a73e8' },
    { at: 'Size=L/Label', field: 'text style', value: '14px' },
    { at: 'Size=L/Tail', field: 'padding', value: 'top 2' },
    { at: 'Size=L/Tail', field: 'gap', value: 6 },
  ]);
  assert.equal(h.rawCount, 5);
  assert.deepEqual(h.noAutoLayout, ['Size=L']);   // three layers and no auto layout
  assert.equal(h.description, false);
  assert.equal('detached' in h, false);           // REST has no detached flag: not captured, never "none"
  assert.equal(hygieneOf(restSet, 'A filter chip.').description, true);
});

test('Plugin API: style ids count as a style, a detached frame is listed', () => {
  const comp = { type: 'COMPONENT', name: 'Row', layoutMode: 'VERTICAL', detachedInfo: null, fillStyleId: 'S:9', fills: [solid(1, 1, 1)], children: [
    { type: 'FRAME', name: 'Lead', detachedInfo: { type: 'local', componentId: '1:2' }, fills: [], children: [] },
    { type: 'TEXT', name: 'Title', textStyleId: 'S:3', fillStyleId: '', fills: [solid(0, 0, 0, { boundVariables: { color: alias } })] },
  ] };
  const h = hygieneOf(comp, 'A list row.');
  assert.deepEqual(h.raw, []);
  assert.deepEqual(h.detached, ['Row/Lead']);
  assert.deepEqual(h.noAutoLayout, []);
});

test('the budget bounds the walk', () => {
  const budget = { n: 2 };
  hygieneOf(restSet, '', budget);
  assert.equal(budget.n, 0);
});

test('findings, the block and the score; a scoped run keeps to its components', () => {
  const values = {
    _updated: 'x',
    chip: { nums: [], colors: [], hygiene: hygieneOf(restSet, '') },
    button: { nums: [], colors: [], hygiene: { raw: [], rawCount: 0, noAutoLayout: [], description: true, detached: [] } },
    legacy: { nums: [], colors: [] },   // swept before the record existed: not counted
  };
  const f = hygieneFindings(values);
  assert.equal(f.length, 7);
  assert.deepEqual(f.slice(-2).map((x) => x.text), ['Size=L has no auto layout', 'no description']);
  assert.deepEqual(hygieneScore(values), { n: 2, clean: 1 });
  const block = hygieneBlock(values);
  assert.equal(block[0], '🎨 Figma file hygiene: 1 of 2 components (5 values with no variable or style · 1 variant with no auto layout · 1 with no description). For whoever keeps the Figma file: code can only match what Figma states. The parity never changes Figma. Advisory.');
  assert.equal(block[1], '     chip: radius 16 on Size=M has no variable or style');
  assert.deepEqual(hygieneBlock(values, { only: ['Button'] }), ['🎨 Figma file hygiene: 1 component, every value bound to a variable or style, every variant in auto layout, each with a description.']);
  assert.deepEqual(hygieneBlock({ legacy: values.legacy }), []);
  const many = { chip: { hygiene: { raw: Array.from({ length: 12 }, (_, i) => ({ at: `v${i}`, field: 'fill', value: '#000000' })), rawCount: 30, noAutoLayout: [], description: true } } };
  const lines = hygieneBlock(many, { max: 10 });
  assert.match(lines[0], /30 values with no variable or style/);
  assert.equal(lines.at(-1), '     and 3 more; run with --hygiene to list them all.');
  assert.equal(hygieneBlock(many, { all: true }).length, 14);
  assert.equal(hygieneBlock(many, { all: true }).at(-1), '     chip: and 18 more values with no variable or style');
});

test('the Plugin API capture in the cookbook carries the engine function, and runs', async () => {
  const md = readFileSync(join(ENGINE, 'cookbook', 'full-audit.md'), 'utf8');
  const start = md.indexOf('function hygieneOf(');
  const end = md.indexOf('\n}\n', start) + 2;
  assert.equal(md.slice(start, end), hygieneOf.toString());
  const snippet = md.slice(md.lastIndexOf('```js\n', start) + 6, md.indexOf('```', start));
  // A small document: a set with one variant, and a standalone component.
  const tree = { type: 'PAGE', children: [
    { type: 'COMPONENT_SET', name: 'Chip', description: '', children: [{ type: 'COMPONENT', name: 'Size=M', width: 40, height: 32, cornerRadius: 16, fills: [solid(1, 1, 1)], children: [] }] },
    { type: 'COMPONENT', name: 'Divider', description: 'A rule.', height: 1, fills: [solid(0, 0, 0, { boundVariables: { color: alias } })], children: [] },
  ] };
  const all = [];
  const link = (n, parent) => { n.parent = parent; all.push(n); for (const c of n.children ?? []) link(c, n); };
  link(tree, null);
  // Each page loaded where it is, never switched to.
  let loaded = 0;
  Object.assign(tree, { loadAsync: async () => { loaded++; }, findAllWithCriteria: ({ types }) => all.filter((n) => n !== tree && types.includes(n.type)) });
  const figma = { root: { children: [tree] }, setCurrentPageAsync: async () => { throw new Error('a capture never switches the page'); } };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const out = JSON.parse(await new AsyncFunction('figma', snippet)(figma));
  assert.equal(loaded, 1);
  assert.deepEqual(Object.keys(out).filter((k) => k !== '_updated'), ['Chip', 'Divider']);   // a variant is part of its set
  assert.deepEqual(out.Chip.nums, [16, 32, 40]);
  assert.deepEqual(out.Chip.hygiene.raw, [{ at: 'Size=M', field: 'fill', value: '#ffffff' }, { at: 'Size=M', field: 'radius', value: 16 }]);
  assert.equal(out.Chip.hygiene.description, false);
  assert.deepEqual(out.Divider.hygiene, { raw: [], rawCount: 0, values: 1, noAutoLayout: [], variants: 0, description: true, binds: { 'VariableID:1:1': { FRAME_FILL: 'Divider' } } });
});

test('a property bound to a variable scoped to other properties, and the variables left on all scopes', () => {
  const v = (id) => ({ type: 'VARIABLE_ALIAS', id });
  // REST and Plugin API alike: node bindings (a text's per-range font size is a list) and a paint's own colour.
  const comp = { type: 'COMPONENT', name: 'Chip', layoutMode: 'HORIZONTAL', cornerRadius: 8, paddingLeft: 8,
    boundVariables: { topLeftRadius: v('V:space'), paddingLeft: v('V:space'), visible: v('V:flag') },
    fills: [solid(1, 1, 1, { boundVariables: { color: v('V:text') } })],
    children: [
      { type: 'TEXT', name: 'Label', textStyleId: 'S:1', boundVariables: { fontSize: [v('V:space')] }, fills: [solid(0, 0, 0, { boundVariables: { color: v('V:text') } })] },
      { type: 'RECTANGLE', name: 'Dot', boundVariables: { fills: [v('V:fill')] }, fills: [solid(1, 0, 0)] },
      { type: 'INSTANCE', name: 'Icon', boundVariables: { width: v('V:space') } },   // its own component's, recorded there
    ] };
  const h = hygieneOf(comp, 'A chip.');
  assert.deepEqual(h.binds, {
    'V:space': { CORNER_RADIUS: 'Chip', GAP: 'Chip', FONT_SIZE: 'Chip/Label' },
    'V:text': { FRAME_FILL: 'Chip', TEXT_FILL: 'Chip/Label' },
    'V:fill': { SHAPE_FILL: 'Chip/Dot' },
  });
  const scopes = {
    'V:space': { name: 'space/200', scopes: ['GAP'] },
    'V:text': { name: 'text/primary', scopes: ['TEXT_FILL'] },
    'V:fill': { name: 'surface/accent', scopes: ['ALL_FILLS'] },
    'V:raw': { name: 'primitives/blue/500', scopes: ['ALL_SCOPES'] },
    'V:raw2': { name: 'primitives/blue/600', scopes: ['ALL_SCOPES'] },
  };
  const values = { chip: { hygiene: h } };
  assert.deepEqual(hygieneFindings(values, { scopes }).map((f) => [f.component, f.kind, f.text]), [
    [null, 'allScopes', '2 variables are offered for every property (all scopes): primitives/blue/500, primitives/blue/600. Scope each to the properties it is for, and a primitive to none, so only the tokens that alias it are offered'],
    ['chip', 'scope', 'the corner radius of Chip is bound to space/200, a variable scoped to gap and padding: bind one scoped to corner radius, or add that scope to space/200'],
    ['chip', 'scope', 'the font size of Chip/Label is bound to space/200, a variable scoped to gap and padding: bind one scoped to font size, or add that scope to space/200'],
    ['chip', 'scope', 'the frame fill of Chip is bound to text/primary, a variable scoped to text fill: bind one scoped to frame fill, or add that scope to text/primary'],
  ]);
  const block = hygieneBlock(values, { scopes });
  assert.equal(block[0], '🎨 Figma file hygiene: 1 of 1 component (3 properties bound outside their variable\'s scope · 2 variables on all scopes). For whoever keeps the Figma file: code can only match what Figma states. The parity never changes Figma. Advisory.');
  assert.match(block[1], /^     2 variables are offered for every property/);
  assert.match(block[2], /^     chip: the corner radius of Chip/);
  assert.deepEqual(hygieneScore(values, { scopes }), { n: 1, clean: 0 });
  // A scoped run keeps to its components; a variable from a library, or none recorded, is not judged.
  assert.equal(hygieneFindings(values, { scopes, only: ['chip'] }).filter((f) => f.kind === 'allScopes').length, 0);
  assert.deepEqual(hygieneFindings(values), []);
  // Only the whole file on all scopes: the block names the variables.
  const clean = { chip: { hygiene: { raw: [], rawCount: 0, noAutoLayout: [], description: true } } };
  assert.match(hygieneBlock(clean, { scopes })[0], /^🎨 Figma file hygiene: the variables \(2 variables on all scopes\)/);
  assert.deepEqual(hygieneScore(clean, { scopes }), { n: 1, clean: 1 });
});

test('REST lists of published components are read by node id, and so is a map', () => {
  assert.deepEqual(byNodeId([{ node_id: '1:2', name: 'Chip' }, { name: 'no id' }]), { '1:2': { node_id: '1:2', name: 'Chip' } });
  assert.deepEqual(byNodeId({ '1:2': { name: 'Chip' } }), { '1:2': { name: 'Chip' } });
  assert.deepEqual(byNodeId(undefined), {});
});

test('the burndown leaves Figma file work out', () => {
  const b = burndown(['Figma file hygiene :: chip: no description', 'Token values :: ❌ [sizing/-] radii/chip → --radii-chip'], ['chip']);
  assert.deepEqual(b.rows.map((r) => [r.name, r.open]), [['chip', 1]]);
  assert.equal(b.loose, 0);
});

test('an instance whose layer spells its component\'s name another way', () => {
  const row = (children) => ({ type: 'COMPONENT', name: 'toolbar', layoutMode: 'HORIZONTAL', children });
  // REST: the component is named by id; a plugin node carries mainComponent (its set, for a variant).
  const rest = row([
    { type: 'INSTANCE', name: 'Button Tertiary', componentId: '9:1' },
    { type: 'INSTANCE', name: 'Save', componentId: '9:1' },            // renamed to its role: a choice
    { type: 'INSTANCE', name: 'buttonTertiary', componentId: '9:1' },  // the component's own name
  ]);
  const h = hygieneOf(rest, 'A toolbar.', { n: Infinity }, { '9:1': 'buttonTertiary' });
  assert.deepEqual(h.renamed, [{ at: 'toolbar/Button Tertiary', layer: 'Button Tertiary', component: 'buttonTertiary' }]);
  const plugin = row([{ type: 'INSTANCE', name: 'Chip', mainComponent: { name: 'Size=M', parent: { type: 'COMPONENT_SET', name: 'chip' } } }]);
  assert.deepEqual(hygieneOf(plugin, 'x').renamed, [{ at: 'toolbar/Chip', layer: 'Chip', component: 'chip' }]);
  // A main component the plugin cannot read (a dynamic page) is not a finding.
  const locked = row([{ type: 'INSTANCE', name: 'Chip', get mainComponent() { throw new Error('use getMainComponentAsync'); } }]);
  assert.equal(hygieneOf(locked, 'x').renamed, undefined);
  const found = hygieneFindings({ toolbar: { hygiene: h } });
  assert.deepEqual(found.map((f) => f.text), ['toolbar/Button Tertiary is an instance of buttonTertiary named "Button Tertiary": an agent reading the file writes "Button Tertiary"; name the layer buttonTertiary, or after its role']);
  assert.match(hygieneBlock({ toolbar: { hygiene: h } })[0], /1 instance named unlike its component/);
});

test('is the Figma file reliable enough to compare, from the share of values bound and of variants in auto layout', () => {
  const h = hygieneOf(restSet, '');
  // Size=M: a fill (bound), a radius (raw), padding and a gap (bound), the label's fill and text (styled): 6.
  // Size=L: a fill (bound; the hidden one not counted), a radius (bound), the label's fill and text (raw), Tail's
  // padding and gap (raw): 6. The instance and the artwork are not counted.
  assert.equal(h.values, 12);
  assert.equal(h.rawCount, 5);
  assert.equal(h.variants, 2);
  const rec = (values, rawCount, variants, loose) => ({ hygiene: { raw: [], rawCount, values, variants, noAutoLayout: Array(loose).fill('v'), description: true } });
  assert.deepEqual(reliability({ a: rec(20, 1, 4, 0), b: rec(10, 0, 2, 0) }), { level: 'reliable', bound: 29 / 30, layout: 1, values: 30, variants: 6, least: [] });
  assert.equal(reliabilityLine(reliability({ a: rec(20, 1, 4, 0) })), null);
  const partly = reliability({ chip: rec(10, 3, 4, 0), card: rec(10, 1, 4, 1) });
  assert.equal(partly.level, 'partly');
  assert.equal(reliabilityLine(partly), '**The Figma file is only partly reliable to compare.** 80% of its values have a variable or style and 88% of its variants use auto layout. Least reliable: chip (70%). The Figma file hygiene block lists what to fix.');
  const poor = reliability({ chip: rec(10, 6, 2, 0), card: rec(10, 2, 2, 0), tag: rec(2, 2, 0, 0) });
  assert.equal(poor.level, 'unreliable');
  assert.match(reliabilityLine(poor), /^\*\*The Figma file is not reliable enough to compare\.\*\* 55% of its values have a variable or style and 100% of its variants use auto layout, so a match or a difference with the code can be chance\. Least reliable: chip \(40%\), card \(80%\)\./);
  // Records from before the counts, and a scoped run's other components, are not counted.
  assert.equal(reliability({ old: { hygiene: { raw: [], rawCount: 3, noAutoLayout: [], description: true } } }), null);
  assert.equal(reliability({ chip: rec(10, 6, 2, 0), card: rec(10, 0, 2, 0) }, { only: ['card'] }).level, 'reliable');
});
