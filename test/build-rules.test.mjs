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

test('a text style used as its description says: each component it names sets a text in it', async () => {
  const { namedIn } = await import('../lib/build-rules.mjs');
  const text = (style) => ({ trees: [{ c: [{ t: 'TEXT', n: 'Label', styles: { text: style } }] }], variants: [['x', 0]] });
  const skeleton = { chipFilter: text('label/strong'), chipInput: text('label/m'), sideSheetLeft: text('body/m'), sideSheetRight: text('body/m'), statusPill: text('body/m'), panelFooter: text('body/m'), toolbarTop: text('title/l'), toolbarBottom: text('body/m') };
  const names = Object.keys(skeleton);
  // Only what gives examples is read, each phrase's words before its head, a whole name only, one a phrase.
  assert.deepEqual(namedIn('Used for strong labels. For example: Chip Labels, Side Titles, Status Pill Text, Panel Footer Note.', names).map((x) => x.phrase), ['chip', 'status pill', 'panel footer']);
  assert.deepEqual(namedIn('Field and Picker Hints', ['fieldText', 'fieldArea', 'pickerDate', 'pickerTime', 'toolTipTop', 'tooltipBottom']).map((x) => [x.phrase, x.components.length]), [['field', 2], ['picker', 2]]);
  assert.deepEqual(namedIn('Tooltip Words', ['toolTipTop', 'tooltipBottom']).map((x) => [x.phrase, x.components.length]), [['tooltip', 2]], 'toolTip and tooltip are one name');
  assert.deepEqual(namedIn('A plain status pill', ['statusPill']).map((x) => x.phrase), ['status pill'], 'one component\'s name in full, head and all');
  assert.deepEqual(namedIn('Used for large titles and clear page hierarchy.', names), [], 'a description that names no component says nothing');
  const meta = { 'label/strong': { description: 'For example: Chip Labels' }, 'body/m': { description: 'For example: Side Sheet Texts, Panel Footer Text' }, 'title/l': { description: 'For example: Toolbar Titles, Status Pill Titles' } };
  const r = Object.fromEntries(buildRules({ skeleton, vars: { typography: { 'label/strong': {}, 'body/m': {}, 'title/l': {} }, textStyleMeta: meta } }).map((x) => [x.id, x]))['text-style-as-described'];
  assert.equal(r.items.length, 5);
  assert.deepEqual(off(r), [['title/l', 'its description names status pill, and no status pill component sets a text in it (they use body/m)']]);
});
