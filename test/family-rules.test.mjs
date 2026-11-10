// A family's components built alike (family-rules.mjs): the variant grid, an axis's options and default, the order of
// the properties, how the frame sizes, the states most of the family answers and how its text fits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyRules } from '../lib/family-rules.mjs';
import { grammarOf, familyOf, fixOf } from '../lib/construction-grammar.mjs';

const V = (options, def = options[0]) => ({ type: 'VARIANT', defaultValue: def, variantOptions: options });
const B = { type: 'BOOLEAN', defaultValue: true };
// Every combination of a component's axes as variants, unless some are left out.
const grid = (axes, leaveOut = []) => {
  let combos = [[]];
  for (const [k, opts] of Object.entries(axes)) combos = combos.flatMap((c) => opts.map((o) => [...c, `${k}=${o}`]));
  return combos.map((c) => c.join(', ')).filter((vn) => !leaveOut.includes(vn)).map((vn) => [vn, 0]);
};
const tree = (w, h, text) => ({ layout: { dir: 'HORIZONTAL', w, h }, c: [{ t: 'TEXT', n: 'Label', ...(text ? { text } : {}) }] });
const comp = ({ size = ['s', 'm'], sizeDefault, states = ['default', 'hover', 'press'], order = ['showIcon', 'label'], w = 'HUG', text = { resize: 'WIDTH_AND_HEIGHT' }, leaveOut = [] } = {}) => ({
  props: { properties: { Size: V(size, sizeDefault), State: V(states), ...Object.fromEntries(order.map((k) => [`${k}#1:0`, k === 'label' ? { type: 'TEXT', defaultValue: 'Go' } : B])) } },
  skeleton: { trees: [tree(w, 'HUG', text)], variants: grid({ Size: size, State: states }, leaveOut) },
});
const family = () => {
  const c = {
    buttonPrimary: comp(),
    buttonSecondary: comp(),
    buttonTertiary: comp(),
    // Another scale, another default, the properties the other way round, a fill, no press, a text that truncates.
    buttonGhost: comp({ size: ['s', 'm', 'l'], states: ['default', 'hover'], order: ['label', 'showIcon'], w: 'FILL', text: { truncate: 'ENDING', maxLines: 1 } }),
    buttonQuiet: comp({ sizeDefault: 'm', leaveOut: ['Size=m, State=press'] }),
  };
  return { props: Object.fromEntries(Object.entries(c).map(([n, x]) => [n, x.props])), skeleton: Object.fromEntries(Object.entries(c).map(([n, x]) => [n, x.skeleton])) };
};
const rules = () => Object.fromEntries(familyRules(family(), { familyOf }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('the variant grid, an axis\'s options, the option a family starts on', () => {
  const r = rules();
  assert.deepEqual(off(r['variant-grid']), [['buttonQuiet', 'size=m, state=press']]);
  assert.deepEqual(off(r['family-axis-options']), [['buttonGhost', 'size: l, m, s, where its family takes m, s']]);
  assert.deepEqual(off(r['family-defaults']), [['buttonQuiet', 'size starts on m, where its family starts on s']]);
});

test('the order of the properties, how the frame sizes, the states, how the text fits', () => {
  const r = rules();
  assert.deepEqual(off(r['family-property-order']), [['buttonGhost', 'Size, State, label, showIcon, where its family lists Size, State, showIcon, label']]);
  assert.deepEqual(off(r['family-sizing']), [['buttonGhost', 'sizes fill × hug, where its family sizes hug × hug']]);
  assert.deepEqual(off(r['family-states']), [['buttonGhost', 'no press, which its family has']]);
  assert.deepEqual(off(r['family-text-fit']), [['buttonGhost', 'its text is fixed, truncates at 1 line, where its family\'s is width and height, wraps']]);
});

test('a state axis is each component\'s own; a family of two, and a capture that keeps no text fit, say nothing', () => {
  // A calendar button with a selected state, beside buttons without: never a family-options finding.
  const f = family();
  f.props.buttonPrimary.properties.State = V(['default', 'hover', 'press', 'selected']);
  assert.ok(!off(familyRules(f, { familyOf }).find((x) => x.id === 'family-axis-options')).some(([n]) => n === 'buttonPrimary'));
  const two = { props: { chipA: comp().props, chipB: comp({ w: 'FILL' }).props }, skeleton: { chipA: comp().skeleton, chipB: comp({ w: 'FILL' }).skeleton } };
  assert.equal(familyRules(two, { familyOf }).some((x) => x.id.startsWith('family-')), false);
  const old = family();
  for (const s of Object.values(old.skeleton)) delete s.trees[0].c[0].text;
  assert.equal(familyRules(old, { familyOf }).some((x) => x.id === 'family-text-fit'), false);
});

test('in the grammar: under Properties, with what to do', () => {
  const g = grammarOf(family());
  const r = g.figma.rules.find((x) => x.id === 'family-axis-options');
  assert.equal(r.area, 'architecture');
  assert.match(fixOf(r, r.toFix[0]).say, /^Give the axis the options its family takes: size: l, m, s/);
});

test('alike in a family: content aligned another way, another part filling the frame, padding on other variables', () => {
  // Four cards built from a title and a body; one centred, one whose title fills, one padded on another variable.
  const card = ({ main = 'MIN', grow = 'Body', pad = 'space/m' } = {}) => ({
    trees: [{ layout: { dir: 'VERTICAL', main, cross: 'MIN' }, c: [{ t: 'TEXT', n: 'Title', ...(grow === 'Title' ? { grow: 1 } : {}) }, { t: 'FRAME', n: 'Body', ...(grow === 'Body' ? { grow: 1 } : {}) }] }],
    variants: [['Size=m', 0]], binds: { 'Size=m': { '': { paddingTop: pad, paddingRight: pad, paddingBottom: pad, paddingLeft: pad } } },
  });
  const skeleton = { cardA: card(), cardB: card(), cardC: card({ main: 'CENTER' }), cardD: card({ grow: 'Title' }), cardE: card({ pad: 'space/l' }),
    // A card built from other parts is no case for the others.
    cardList: { trees: [{ layout: { dir: 'VERTICAL', main: 'MAX' }, c: [{ t: 'FRAME', n: 'Rows' }] }], variants: [['Size=m', 0]] } };
  const r = Object.fromEntries(familyRules({ skeleton, props: {} }, { familyOf }).map((x) => [x.id, x]));
  assert.deepEqual(off(r['family-align']), [['cardC', 'its content is aligned centre along, start across, where its family\'s is start along, start across']]);
  assert.deepEqual(off(r['family-stretch']), [['cardD', 'title fills its frame, where in its family body does']]);
  assert.deepEqual(off(r['family-padding']), [['cardE', 'its padding at m is space/l space/l space/l space/l, where its family\'s is space/m space/m space/m space/m']]);
  assert.equal(fixOf({ id: 'family-align' }, { value: 'x' }).say, 'Align its content as its family does: x');
});

test('alike in a family: a minimum the others do not set', () => {
  const chip = (limits) => ({ trees: [{ ...(limits ? { limits } : {}), c: [{ t: 'TEXT', n: 'Label' }] }], variants: [['Size=m', 0]] });
  const skeleton = { chipA: chip({ minHeight: 32 }), chipB: chip({ minHeight: 32 }), chipC: chip({ minHeight: 32 }), chipD: chip({ minHeight: 40 }) };
  const r = familyRules({ skeleton, props: {} }, { familyOf }).find((x) => x.id === 'family-limits');
  assert.deepEqual(off(r), [['chipD', 'its limits at m are min height 40, where its family\'s are min height 32']]);
});

test('alike in a family: another size step, a part shown another way, a property that changes something else', () => {
  // Buttons of an icon and a label at two sizes; Size changes the padding on most.
  const tree = (pad, { iconHidden = false, wired = true, style = 'label/m' } = {}) => ({ layout: { dir: 'HORIZONTAL', pad, gap: 8 },
    c: [{ t: 'INSTANCE', n: 'Icon', ...(iconHidden ? { hidden: true } : {}), ...(wired ? { wired: { visible: 'showIcon' } } : {}) }, { t: 'TEXT', n: 'Label', styles: { text: style } }] });
  const button = ({ m = [8, 16, 8, 16], wired = true, sStyle = 'label/m' } = {}) => ({
    trees: [tree([4, 8, 4, 8], { wired, style: sStyle }), tree(m, { wired }), tree(m, { wired, iconHidden: !wired })],
    variants: [['Size=s, State=default', 0], ['Size=m, State=default', 1], ['Size=m, State=hover', 2]],
  });
  const skeleton = { buttonA: button(), buttonB: button(), buttonC: button(),
    buttonD: button({ m: [10, 16, 10, 16] }), buttonE: button({ wired: false }), buttonF: button({ sStyle: 'label/s' }) };
  const r = Object.fromEntries(familyRules({ skeleton, props: {} }, { familyOf }).map((x) => [x.id, x]));
  assert.deepEqual(off(r['family-size-steps']), [['buttonD', 'at m its padding 10 16 10 16, gap 8, where its family\'s padding 8 16 8 16, gap 8']]);
  assert.deepEqual(off(r['family-parts-shown']), [['buttonE', 'icon is shown by a variant, where in its family it is shown by a yes/no property']]);
  assert.deepEqual(off(r['family-property-changes']), [['buttonF', 'Size changes label: text style, the frame: padding, where across its family it changes the frame: padding']]);
});

test('alike in a family: a fill bound to a shared token where the others bind their own', () => {
  const card = (fill) => ({ trees: [{ c: [{ t: 'TEXT', n: 'Title' }] }], variants: [['Type=primary', 0]], binds: { 'Type=primary': { '': fill ? { fills: fill } : {} } } });
  const skeleton = { cardA: card('card/background/primary'), cardB: card('card/background/secondary'), cardC: card('cardC/fill'), cardD: card('surface/default') };
  const r = familyRules({ skeleton, props: {} }, { familyOf }).find((x) => x.id === 'family-fill');
  assert.deepEqual(off(r), [['cardD', 'its frame binds a shared fill token, where its family\'s bind a fill token of its own']]);
});
