// What the file's own evidence says of a component (use-rules.mjs): preferred components on a swap or slot, a default
// most uses change, and the case its words are written in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useRules } from '../lib/use-rules.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const V = (options, def = options[0]) => ({ type: 'VARIANT', defaultValue: def, variantOptions: options });
const props = {
  button: { properties: { 'State#1:0': V(['disabled', 'default'], 'disabled'), 'Size#1:1': V(['s', 'm'], 's') } },
  card: { properties: { 'Size#2:0': V(['s', 'm']) } },
  chip: { properties: {} },
  tab: { properties: {} },
};
const skeleton = {
  card: { trees: [{}], swaps: { 'Content#2:1': { type: 'SLOT', preferred: ['chip'] } } },
  sheet: { trees: [{}], swaps: { 'Body#3:0': { type: 'SLOT' } } },
  dialog: { trees: [{}], swaps: { 'Icon#4:0': { type: 'INSTANCE_SWAP', default: 'icon', preferred: ['icon'] } } },
  menu: { trees: [{}], swaps: { 'Leading#5:0': { type: 'INSTANCE_SWAP', default: 'icon', preferred: ['icon'] } } },
};
// Buttons used enabled everywhere, in their own examples and inside a card's; words in Sentence case but the tab's.
const use = (p, texts = []) => ({ props: p, texts, items: [] });
const examples = { components: {
  button: [use({ State: 'default', Size: 's' }, ['Send money'])],
  card: [{ props: { Size: 's' }, texts: ['Your account'], items: [{ component: 'button', ...use({ State: 'default', Size: 's' }, ['Pay now']) }, { component: 'button', ...use({ State: 'default', Size: 'm' }, ['Pay later']) }] }],
  chip: [use({}, ['New items']), use({}, ['Two words'])],
  tab: [use({}, ['Home Page']), use({}, ['My Account'])],
} };
const rules = () => Object.fromEntries(useRules({ props, skeleton, examples }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('a swap or slot that prefers nothing, a default its uses all change, words in another case', () => {
  const r = rules();
  assert.deepEqual(off(r['swap-preferred']), [['sheet', 'Body prefers nothing']]);
  assert.deepEqual(off(r['default-in-use']), [['button', 'State starts on disabled, where 3 of 3 uses change it, most to default']], 'its uses inside a card count; Size starts on what most take');
  assert.equal(r['words-case'].says, 'A component\'s words are written in Sentence case, as most are');
  assert.deepEqual(off(r['words-case']), [['tab', 'its examples are in Title Case']]);
});

test('never imposed: no examples, no rule from them', () => {
  const r = useRules({ props, skeleton, examples: null });
  assert.deepEqual(r.map((x) => x.id), ['swap-preferred']);
  assert.deepEqual(useRules({}), []);
});

test('in the grammar, with what to do', () => {
  const g = grammarOf({ props, skeleton, examples });
  const r = g.figma.rules.find((x) => x.id === 'swap-preferred');
  assert.equal(r.area, 'wiring');
  assert.equal(fixOf(r, r.toFix[0]).say, 'List the components it prefers: Body prefers nothing');
  assert.ok(g.figma.rules.some((x) => x.id === 'words-case' && x.area === 'content'));
});
