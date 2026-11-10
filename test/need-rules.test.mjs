// Whether the library needed a component (need-rules.mjs): one nothing uses, one that is another with an option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needRules } from '../lib/need-rules.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const V = (options) => ({ type: 'VARIANT', defaultValue: options[0], variantOptions: options });
const props = { button: { properties: { 'Size#1:0': V(['small', 'large']) } }, buttonLarge: { properties: {} }, card: { properties: {} }, chip: { properties: {} }, tag: { properties: {} } };
// The card holds a chip; the button and the card are placed on a page; nothing places or holds the tag.
const skeleton = { card: { trees: [{ c: [{ t: 'INSTANCE', n: 'Chip', of: { name: 'chip' } }] }] } };
const examples = { components: { button: [{ props: {}, texts: [], items: [] }], card: [{ props: {}, texts: [], items: [{ component: 'buttonLarge', props: {} }] }] } };
const rules = () => Object.fromEntries(needRules({ props, skeleton, examples }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('a component nothing uses, and one that is another with an option it already has', () => {
  const r = rules();
  assert.deepEqual(off(r['component-used']), [['tag', 'nothing places or holds it']]);
  assert.deepEqual(off(r['no-option-twins']), [['buttonLarge', 'it is button with Size=large, which button already takes']]);
});

test('no examples, no word on what is used: a component nothing holds may still be placed on a page', () => {
  assert.deepEqual(needRules({ props, skeleton }).map((r) => r.id), ['no-option-twins']);
  assert.deepEqual(needRules({}), []);
});

test('in the grammar, with what to do', () => {
  const g = grammarOf({ props, skeleton, examples });
  const r = g.figma.rules.find((x) => x.id === 'component-used');
  assert.equal(r.area, 'architecture');
  assert.match(fixOf(r, r.toFix[0]).say, /^Look at whether the library needs it/);
});
