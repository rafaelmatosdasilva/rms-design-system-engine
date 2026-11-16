// The grammar of a system's token names, mined from the names themselves (token-grammar.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameRules } from '../lib/token-grammar.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const t = (name, value = '#000') => ({ name, collection: 'Theme', kind: typeof value === 'number' ? 'FLOAT' : 'COLOR', values: { Light: typeof value === 'number' ? `${value}px` : value } });
const system = () => ({ tokens: [
  // camelCase, one part written another way.
  t('button/textColor/default'), t('button/textColor/hover'), t('button/textColor/press'),
  t('chip/textColor/default'), t('chip/textColor/hover'), t('chip/textColor/press'),
  t('card/borderColor/default'), t('card/borderColor/hover'), t('card/borderColor/press'),
  t('tag/fillColor/default'), t('tag/fillColor/hover'), t('tag/fillColor/press'),
  t('menu/fillColor/default'), t('menu/fillColor/hover'), t('menu/fillColor/press'),
  // A role spelled pressed, and missing its hover.
  t('link/textColor/default'), t('link/textColor/pressed'),
  t('tab/text-color/default'),
  // Sizes on s, m, l, one in words; and one set out of order.
  t('space/gap/s', 4), t('space/gap/m', 8), t('space/gap/l', 16),
  t('space/inset/s', 4), t('space/inset/m', 12), t('space/inset/l', 8),
  t('space/stack/medium', 8), t('space/stack/large', 16),
] });
const rules = () => Object.fromEntries(nameRules(system()).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.where, i.value]);

test('a name in another case, an idea named two ways, a size on another scale', () => {
  const r = rules();
  assert.equal(r['token-name-case'].says, 'A token\'s name is written in camelCase');
  assert.deepEqual(off(r['token-name-case']), [['tab/text-color/default', 'text-color']]);
  assert.match(r['token-one-name'].says, /press, never pressed/);
  assert.deepEqual(off(r['token-one-name']), [['link/textColor/pressed', 'pressed, where the system says press']]);
  assert.match(r['token-one-scale'].says, /^Sizes are named on one scale: xxs, xs, s, m, l/);
  assert.deepEqual(off(r['token-one-scale']), [['space/stack/medium', 'medium (a word)'], ['space/stack/large', 'large (a word)']]);
});

test('a set of sizes out of order, and an interactive role without the states most have', () => {
  const r = rules();
  assert.deepEqual(off(r['token-scale-order']), [['space/inset/*', 'm 12 > l 8']]);
  assert.equal(r['token-states'].says, 'An interactive role has the states most have: hover, press');
  assert.deepEqual(off(r['token-states']), [['link/textColor/*', 'no hover, no press']], 'pressed is not press: the one-name rule says which');
});

test('never imposed: what no name does is no rule', () => {
  const plain = { tokens: ['color/a', 'color/b', 'color/c', 'color/d'].map((n) => t(n)) };
  // Only where the category word sits, which every name already does: a rule with nothing to fix.
  assert.deepEqual(nameRules(plain).map((r) => [r.id, r.items.every((i) => i.fits)]), [['token-category-order', true]]);
  assert.deepEqual(nameRules(null), []);
  // A selected and an unselected colour answer no hover: never held to the interactive states.
  const sel = { tokens: [...system().tokens, t('row/fill/default'), t('row/fill/selected')] };
  assert.ok(!off(nameRules(sel).find((x) => x.id === 'token-states')).some(([w]) => w.startsWith('row/')));
});

test('in the grammar: under Tokens, a token a place, with what to do', () => {
  const g = grammarOf({ tokens: system() });
  const r = g.figma.rules.find((x) => x.id === 'token-one-name');
  assert.equal(r.area, 'tokens');
  assert.deepEqual(r.toFix, [{ where: 'link/textColor/pressed', value: 'pressed, where the system says press' }]);
  assert.equal(fixOf(r, r.toFix[0]).say, 'Rename it to link/textColor/press', 'the whole name it takes');
});

test('where a state sits, a value off the scale, a surface with nothing for what sits on it', () => {
  const r = Object.fromEntries(nameRules({ tokens: [...system().tokens, t('chip/hover/textColor'),
    t('radius/s', 4), t('radius/m', 8), t('radius/full', 9999), t('space/gap/xl', 18),
    t('card/fillColor/default'), t('card/textColor/default'), t('menu/textColor/rest'), t('menu/fillColor/rest'), t('sheet/fillColor/default')] }).map((x) => [x.id, x]));
  // One short sentence for its title; where each part goes, with a name that does, is its panel's (places).
  assert.equal(r['token-segment-order'].says, 'A state and a size each sit in the same place in every token\'s name');
  assert.deepEqual(r['token-segment-order'].places.map((p) => [p.what, p.at]), [['A state', 'The last part'], ['A size', 'The last part']]);
  assert.ok(r['token-segment-order'].places.every((p) => p.example && r['token-segment-order'].items.some((i) => i.fits && i.where === p.example)), 'each with a name of the system that follows it');
  assert.deepEqual(off(r['token-segment-order']), [['chip/hover/textColor', 'its state is the part before the last, where most names have it as the last part']]);
  // Its fix is the whole name it takes, as a rename.
  const seg = r['token-segment-order'].items.find((i) => !i.fits);
  assert.equal(seg.to, 'chip/textColor/hover');
  assert.deepEqual(fixOf({ id: 'token-segment-order' }, seg), { what: null, from: 'chip/hover/textColor', to: 'chip/textColor/hover', say: 'Rename it to chip/textColor/hover' });
  assert.equal(r['token-on-scale'].says, 'A spacing or radius value is a step of the system\'s 4px scale');
  assert.deepEqual(off(r['token-on-scale']), [['space/gap/xl', '18, between 16 and 20']], 'a pill radius (9999) is no step');
  // tag and menu fill with no text beside them in the system tokens, sheet as well; card and menu/rest have theirs.
  assert.ok(off(r['token-on-colour']).some(([w, v]) => w === 'sheet/fillColor' && v === 'no text or icon colour beside it under sheet'));
  assert.ok(!off(r['token-on-colour']).some(([w]) => w === 'card/fillColor' || w === 'menu/fillColor'));
  assert.equal(fixOf({ id: 'token-on-scale' }, { value: '18, between 16 and 20' }).say, 'Give it a value on the system\'s scale: 18, between 16 and 20');
});

test('a category word where most names do not put it', () => {
  const r = nameRules({ tokens: ['button/fill/color', 'chip/fill/color', 'card/fill/color', 'color/tag/fill', 'radius/s', 'radius/m', 'radius/l'].map((n) => t(n)) }).find((x) => x.id === 'token-category-order');
  assert.equal(r.says, 'Each kind of token puts its kind\'s word in the same place in its name');
  assert.deepEqual(r.places, [{ what: 'color', at: 'The last part', example: 'button/fill/color' }, { what: 'radius', at: 'The part before the last', example: 'radius/s' }]);
  assert.deepEqual(off(r), [['color/tag/fill', 'color is part 3 from the end, where most names have it as the last part']]);
  assert.equal(fixOf({ id: 'token-category-order' }, r.items.find((i) => !i.fits)).say, 'Rename it to tag/fill/color');
});

test('a state before what a colour is for, where most names put it after', () => {
  const r = nameRules({ tokens: ['button/background/hover', 'chip/background/hover', 'card/text/hover', 'tag/hover/background'].map((n) => t(n)) }).find((x) => x.id === 'token-property-order');
  assert.equal(r.says, 'What a colour is for comes before its state in every token\'s name');
  assert.deepEqual(r.places, [{ what: 'What it is for, then its state', at: 'background/hover', example: 'button/background/hover' }]);
  assert.deepEqual(off(r), [['tag/hover/background', 'its state comes before what it is for']]);
  assert.equal(fixOf({ id: 'token-property-order' }, r.items.find((i) => !i.fits)).say, 'Rename it to tag/background/hover');
});

test('a variant before what a colour is for, where most names put it after', () => {
  const r = nameRules({ tokens: ['button/text/primary', 'chip/text/negative', 'card/background/brand', 'tag/positive/text'].map((n) => t(n)) }).find((x) => x.id === 'token-variant-order');
  assert.equal(r.says, 'What a colour is for comes before its variant in every token\'s name');
  assert.deepEqual(off(r), [['tag/positive/text', 'its variant comes before what it is for']]);
  assert.equal(fixOf({ id: 'token-variant-order' }, r.items.find((i) => !i.fits)).say, 'Rename it to tag/text/positive');
});
