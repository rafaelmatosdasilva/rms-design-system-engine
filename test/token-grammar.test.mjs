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
