// Figma's anatomy of a component held against the code's (anatomy-parity.mjs): a part shown on a condition on one side
// only, a part's text by hand where Figma sets a text style, the corners, the shadow's layers and the wrap, each said
// with the part and the line to patch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAnatomies } from '../lib/anatomy-parity.mjs';
import { measuredLine } from '../lib/capture-compare.mjs';

const tree = (extra = {}) => ({ t: 'FRAME', n: 'acmeChip', layout: { dir: 'HORIZONTAL', wrap: false }, effects: 2, ...extra, c: [
  { t: 'INSTANCE', n: 'Icon', wired: { visible: 'showIcon#1:0' }, of: { name: 'icon' } },
  { t: 'TEXT', n: 'Label', styles: { text: 'label/strong' } },
  { t: 'TEXT', n: 'Count' },
] });
const skeleton = () => ({ acmeChip: {
  variants: [['state=default', 0], ['state=busy', 1]],
  trees: [tree(), tree({ c: [{ t: 'TEXT', n: 'Label', styles: { text: 'label/strong' } }] })],
  binds: { 'state=default': { '': { topLeftRadius: 'radius/m', topRightRadius: 'radius/m', bottomRightRadius: 'radius/m', bottomLeftRadius: 'radius/m' } } },
} });
const anatomy = () => ({ acmeChip: {
  parts: [
    { class: 'acme-chip__icon', optional: false, order: 1, at: 'src/Chip.vue:3' },
    { class: 'acme-chip__label', optional: true, order: 2, at: 'src/Chip.vue:4' },
    { class: 'acme-chip__count', optional: false, order: 3, at: 'src/Chip.vue:5' },
  ],
  text: [{ part: 'acme-chip__label', prop: 'font-size', value: '13px', token: false, at: 'src/Chip.vue:20' }],
  radius: { shared: false, perCorner: true, tokens: ['--radius-m'], values: ['var(--radius-m) 0 0 var(--radius-m)'], at: 'src/Chip.vue:12' },
  shadows: [{ selector: '.acme-chip', part: null, off: false, layers: [{}], at: 'src/Chip.vue:13' }],
  wrap: { wrap: 'wrap', at: 'src/Chip.vue:11' },
} });
const paired = { acmeChip: { Icon: '.acme-chip__icon', Label: '.acme-chip__label', Count: '.acme-chip__count' } };
const run = () => compareAnatomies({ skeleton: skeleton(), structure: { acmeChip: { defaultVariant: 'state=default' } }, anatomy: anatomy(), paired });

test('each difference in how the component is put together, with the part and the line', () => {
  const r = run();
  const by = Object.fromEntries(r.differ.map((d) => [`${d.part ?? ''}|${d.field}`, d]));
  assert.equal(by['Icon|shown'].figma, 'shown when showIcon is on');
  assert.equal(by['Icon|shown'].code, 'always rendered');
  assert.equal(by['Icon|shown'].at, 'src/Chip.vue:3');
  assert.equal(by['Label|shown'].code, 'rendered on a condition', 'Figma shows the label in every variant');
  assert.equal(by['Label|text style'].code, 'font-size: 13px by hand');
  assert.equal(by['Label|text style'].at, 'src/Chip.vue:20');
  assert.match(by['|corners'].figma, /one variable for all four \(radius\/m\)/);
  assert.deepEqual([by['|shadow layers'].figma, by['|shadow layers'].code], [2, 1]);
  assert.deepEqual([by['|wrap'].figma, by['|wrap'].code], ['one line', 'wraps']);
  assert.ok(!by['Count|shown'], 'a part shown in some variants only and always in the markup may be hidden by a class: not held to a condition');
  assert.equal(measuredLine(by['Icon|shown']), 'acmeChip › Icon shown: Figma shown when showIcon is on, the code writes always rendered  (src/Chip.vue:3)');
  assert.ok(r.differ.every((d) => d.kind === 'anatomy'));
  assert.equal(r.facts.length, r.match + r.differ.length);
});

test('what agrees adds no difference, and a part nothing pairs is never held to an element', () => {
  const a = anatomy().acmeChip;
  a.parts[0].optional = true; a.parts[1].optional = false;
  a.text[0].token = true; a.radius = { shared: true, tokens: ['--radius-m'], values: ['var(--radius-m)'], at: 'x' };
  a.shadows[0].layers = [{}, {}]; a.wrap.wrap = 'nowrap';
  const r = compareAnatomies({ skeleton: skeleton(), structure: {}, anatomy: { acmeChip: a }, paired: { acmeChip: { Icon: '.acme-chip__icon', Label: '.acme-chip__label' } } });
  assert.deepEqual(r.differ, []);
  assert.ok(!r.facts.some((f) => /Count/.test(f.key)));
  assert.deepEqual(compareAnatomies({ skeleton: {}, anatomy: anatomy(), paired }).facts, [], 'no skeleton: nothing to hold together');
});
