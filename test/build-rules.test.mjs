// What a component is built with, layer by layer, and what the text styles say of themselves (build-rules.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRules } from '../lib/build-rules.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const R = (v) => Object.fromEntries(['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].map((k) => [k, v]));
const comp = (binds, looks = {}) => ({ trees: [{ c: [{ t: 'FRAME', n: 'Box', c: [{ t: 'TEXT', n: 'Label', styles: { text: 'body/m' } }] }] }], variants: [['State=default', 0]], binds: { 'State=default': binds }, looks: { 'State=default': looks } });
const border = (align = 'INSIDE') => ({ border: { w: 1, align } });
const library = () => ({ skeleton: {
  a: comp({ '': R('radius/m'), 0: { strokeWeight: 'border/thin', opacity: 'opacity/muted' } }, { 0: { ...border(), opacity: 0.5 } }),
  b: comp({ '': R('radius/m'), 0: { strokeWeight: 'border/thin' } }, { 0: border() }),
  c: comp({ '': R('radius/s'), 0: { strokeWeight: 'border/thin' } }, { 0: border() }),
  // Two corners on another variable, a border typed in and outside, an opacity typed in.
  d: comp({ '': { ...R('radius/m'), topLeftRadius: 'radius/l' } }, { 0: { ...border('OUTSIDE'), opacity: 0.4 } }),
} });
const vars = { typography: { 'body/m': {}, 'body/s': {}, 'title/l': {}, 'title/m': {} }, textStyleMeta: { 'body/m': { description: 'Running text' }, 'body/s': { description: 'Captions' }, 'title/l': { description: 'Page titles' } } };
const rules = (x = library(), v = vars) => Object.fromEntries(buildRules({ ...x, vars: v }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component ?? i.where, i.value]);

test('corners on one variable, an opacity and a border weight bound, a border where most sit', () => {
  const r = rules();
  assert.deepEqual(off(r['corners-one-variable']), [['d', 'the component: its corners bind radius/l, radius/m']]);
  assert.deepEqual(off(r['opacity-bound']), [['d', 'Box at 40%']]);
  assert.deepEqual(off(r['border-bound']), [['d', 'Box, 1px']]);
  assert.equal(r['border-align'].says, 'A border sits inside its layer, as most do');
  assert.deepEqual(off(r['border-align']), [['d', 'Box\'s sits outside']]);
});

test('a text style with no description, and one no component uses', () => {
  const r = rules();
  assert.deepEqual(off(r['text-style-described']), [['title/m', 'no description']]);
  assert.deepEqual(off(r['text-style-used']), ['body/s', 'title/l', 'title/m'].map((s) => [s, 'no component uses it']));
});

test('never imposed: what nothing does is no rule', () => {
  const plain = { skeleton: { a: { trees: [{ c: [] }], variants: [['x', 0]] } } };
  assert.deepEqual(buildRules({ ...plain, vars: { typography: { a: {}, b: {}, c: {} } } }), []);
  assert.deepEqual(buildRules({}), []);
  // Every border on one side is no question to ask.
  assert.equal(rules({ skeleton: { a: library().skeleton.a, b: library().skeleton.b, c: library().skeleton.c } })['border-align'], undefined);
});

test('in the grammar, with what to do', () => {
  const g = grammarOf({ ...library(), textStyles: vars });
  const r = g.figma.rules.find((x) => x.id === 'border-bound');
  assert.equal(r.area, 'variables');
  assert.equal(fixOf(r, r.toFix[0]).say, 'Bind its border\'s weight to a variable: Box, 1px');
  assert.equal(g.figma.rules.find((x) => x.id === 'opacity-bound'), undefined, 'two components with an opacity are too few for a rule');
  assert.ok(g.figma.rules.some((x) => x.id === 'text-style-described' && x.area === 'documentation'));
});
