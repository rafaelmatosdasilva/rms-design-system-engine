// I23: the Figma file's own hygiene, recorded by the component-values sweep and listed as advice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hygieneOf, hygieneFindings, hygieneBlock, hygieneScore } from '../figma-hygiene.mjs';
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

test('the Plugin API capture in the cookbook carries the engine function, and runs', () => {
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
  const figma = { root: { findAll: (pred) => all.filter(pred) } };
  const out = JSON.parse(new Function('figma', snippet)(figma));
  assert.deepEqual(Object.keys(out).filter((k) => k !== '_updated'), ['Chip', 'Divider']);   // a variant is part of its set
  assert.deepEqual(out.Chip.nums, [16, 32, 40]);
  assert.deepEqual(out.Chip.hygiene.raw, [{ at: 'Size=M', field: 'fill', value: '#ffffff' }, { at: 'Size=M', field: 'radius', value: 16 }]);
  assert.equal(out.Chip.hygiene.description, false);
  assert.deepEqual(out.Divider.hygiene, { raw: [], rawCount: 0, noAutoLayout: [], description: true });
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

test('I69: an instance whose layer spells its component\'s name another way', () => {
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
