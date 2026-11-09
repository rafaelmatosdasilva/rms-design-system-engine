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
  assert.deepEqual(nameRules(plain), []);
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
  assert.equal(fixOf(r, r.toFix[0]).say, 'Rename it with the system\'s word: pressed, where the system says press');
});

test('where a state sits, a value off the scale, a surface with nothing for what sits on it', () => {
  const r = Object.fromEntries(nameRules({ tokens: [...system().tokens, t('chip/hover/textColor'),
    t('radius/s', 4), t('radius/m', 8), t('radius/full', 9999), t('space/gap/xl', 18),
    t('card/fillColor/default'), t('card/textColor/default'), t('menu/textColor/rest'), t('menu/fillColor/rest'), t('sheet/fillColor/default')] }).map((x) => [x.id, x]));
  assert.equal(r['token-segment-order'].says, 'A token\'s name puts its state as the last part and its size as the last part');
  assert.deepEqual(off(r['token-segment-order']), [['chip/hover/textColor', 'its state is the part before the last, where most names have it as the last part']]);
  assert.equal(r['token-on-scale'].says, 'A spacing or radius value is a step of the system\'s 4px scale');
  assert.deepEqual(off(r['token-on-scale']), [['space/gap/xl', '18, between 16 and 20']], 'a pill radius (9999) is no step');
  // tag and menu fill with no text beside them in the system tokens, sheet as well; card and menu/rest have theirs.
  assert.ok(off(r['token-on-colour']).some(([w, v]) => w === 'sheet/fillColor' && v === 'no text or icon colour beside it under sheet'));
  assert.ok(!off(r['token-on-colour']).some(([w]) => w === 'card/fillColor' || w === 'menu/fillColor'));
  assert.equal(fixOf({ id: 'token-on-scale' }, { value: '18, between 16 and 20' }).say, 'Give it a value on the system\'s scale: 18, between 16 and 20');
});
