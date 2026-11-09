// How a shadow changes between variants, a slot or a swap for one kind of content, and the gap between two parts
// (shape-rules.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeRules } from '../lib/shape-rules.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const layer = (more = {}) => ({ t: 'FRAME', n: 'Box', ...more });
// Two variants: the shadow on the frame's own effect, or on a layer shown in one and hidden in the other.
const byEffect = () => ({ trees: [{ c: [layer({ effects: 1, styles: { effect: 'shadow/s' } })] }, { c: [layer({ effects: 1, styles: { effect: 'shadow/l' } })] }], variants: [['State=default', 0], ['State=hover', 1]] });
const byLayer = () => ({ trees: [{ c: [layer({ n: 'Shadow', effects: 1 })] }, { c: [layer({ n: 'Shadow', effects: 1, hidden: true })] }], variants: [['State=default', 0], ['State=hover', 1]] });
const swaps = (type) => ({ 'Icon#1:0': { type } });
// A row of an icon and a label, its gap bound per size.
const row = (gap) => ({ trees: [{ c: [{ t: 'FRAME', n: 'Row', c: [{ t: 'INSTANCE', n: 'Icon' }, { t: 'TEXT', n: 'Label' }] }] }], variants: [['Size=m', 0]], binds: { 'Size=m': { 0: { itemSpacing: gap } } } });
const library = () => ({ skeleton: {
  cardA: { ...byEffect(), swaps: swaps('INSTANCE_SWAP') },
  cardB: { ...byEffect(), swaps: swaps('INSTANCE_SWAP') },
  cardC: { ...byEffect(), swaps: swaps('INSTANCE_SWAP') },
  // Its shadow on a layer shown and hidden, its icon a slot.
  cardD: { ...byLayer(), swaps: swaps('SLOT') },
  chipA: row('space/xs'), chipB: row('space/xs'), chipC: row('space/xs'),
  // Its icon and label spaced another way.
  chipD: row('space/m'),
} });
const rules = () => Object.fromEntries(shapeRules(library()).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('a shadow changed another way, a slot where most are swaps, a gap on another variable', () => {
  const r = rules();
  assert.equal(r['shadow-one-way'].says, 'A shadow changes between variants by its own effect, as most do');
  assert.deepEqual(off(r['shadow-one-way']), [['cardD', 'it changes a shadow layer shown and hidden']]);
  assert.deepEqual(off(r['slot-or-swap']), [['cardD', 'Icon is a slot, where most Icon properties are instance swaps']]);
  assert.deepEqual(off(r['part-gap']), [['chipD', 'icon and label at m are spaced by space/m, where most are by space/xs']]);
});

test('never imposed: what nothing does is no rule', () => {
  assert.deepEqual(shapeRules({ skeleton: { a: row('x'), b: { trees: [{}], variants: [] } } }), []);
  assert.deepEqual(shapeRules({}), []);
});

test('in the grammar, with what to do', () => {
  const g = grammarOf(library());
  const r = g.figma.rules.find((x) => x.id === 'part-gap');
  assert.equal(r.area, 'variables');
  assert.equal(fixOf(r, r.toFix[0]).say, 'Bind the gap most frames use between these parts: icon and label at m are spaced by space/m, where most are by space/xs');
});

test('a hover shown another way: a state layer where most change the frame\'s fill', () => {
  const byFill = () => ({ trees: [{ c: [] }], variants: [['State=default', 0], ['State=hover', 0]], binds: { 'State=default': { '': { fills: 'button/fill' } }, 'State=hover': { '': { fills: 'button/fill/hover' } } } });
  const byLayer = { trees: [{ c: [{ t: 'FRAME', n: 'stateLayer', hidden: true }] }, { c: [{ t: 'FRAME', n: 'stateLayer' }] }], variants: [['State=default', 0], ['State=hover', 1]] };
  const r = shapeRules({ skeleton: { a: byFill(), b: byFill(), c: byFill(), d: byLayer } }).find((x) => x.id === 'state-one-way');
  assert.equal(r.says, 'A hover or press shows by its frame\'s fill, as most components show it');
  assert.deepEqual(off(r), [['d', 'it shows by a layer shown over it']]);
});
