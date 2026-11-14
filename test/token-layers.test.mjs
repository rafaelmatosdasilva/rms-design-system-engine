// How a system layers its tokens, read from its own aliases (token-layers.mjs), and the rules the grammar mines from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenLayers, tokenRules } from '../lib/token-layers.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';

const tok = (collection, name, to) => ({ name, collection, kind: 'COLOR', values: { Light: '#000' }, ...(to ? { aliases: { Light: to } } : {}) });
// Primitives hold values; Semantic points at them; Component points at Semantic, and one component token skips it.
const system = () => ({
  collections: [{ name: 'Primitives', modes: ['Light'] }, { name: 'Semantic', modes: ['Light'] }, { name: 'Component', modes: ['Light'] }],
  tokens: [
    tok('Primitives', 'primitives/blue/500'), tok('Primitives', 'primitives/blue/700'), tok('Primitives', 'primitives/gray/100'), tok('Primitives', 'primitives/gray/900'),
    tok('Semantic', 'semantic/action/default', 'primitives/blue/500'), tok('Semantic', 'semantic/action/hover', 'primitives/blue/700'),
    tok('Semantic', 'semantic/surface', 'primitives/gray/100'), tok('Semantic', 'semantic/text', 'primitives/gray/900'),
    // Two that point at each other, and one in Semantic named as a primitive.
    tok('Semantic', 'semantic/loop/a', 'semantic/loop/b'), tok('Semantic', 'semantic/loop/b', 'semantic/loop/a'), tok('Semantic', 'primitives/oops'),
    tok('Component', 'button/bg', 'semantic/action/default'), tok('Component', 'button/bg-hover', 'semantic/action/hover'),
    tok('Component', 'card/bg', 'semantic/surface'), tok('Component', 'chip/text', 'primitives/gray/900'),
  ],
});

test('the layers come from where the aliases go: a base, what sits on it, and what sits on that', () => {
  const { collections } = tokenLayers(system());
  const at = Object.fromEntries(collections.map((c) => [c.name, [c.layer, c.through]]));
  assert.deepEqual(at, { Primitives: [1, null], Semantic: [2, 'Primitives'], Component: [3, 'Semantic'] });
});

test('a token that skips its layer, a chain longer than the system\'s or back on itself, a name from another collection', () => {
  const rules = Object.fromEntries(tokenRules(system()).map((r) => [r.id, r]));
  const off = (id) => rules[id].items.filter((i) => !i.fits);
  assert.equal(rules['token-layer-component'].says, 'A Component token points at a Semantic token');
  assert.deepEqual(off('token-layer-component'), [{ where: 'chip/text', value: 'primitives/gray/900 (Primitives, past it)', fits: false }]);
  assert.equal(off('token-layer-semantic').length, 0, 'a Semantic token pointing at another Semantic token stays in its layer');
  assert.match(rules['token-alias-chains'].says, /in 2 steps or fewer, and never comes back on itself/);
  assert.deepEqual(off('token-alias-chains').map((i) => [i.where, i.value]), [['semantic/loop/a', 'comes back on itself'], ['semantic/loop/b', 'comes back on itself']]);
  assert.deepEqual(off('token-name-collection').map((i) => [i.where, i.value]), [['primitives/oops', 'in Semantic, named like Primitives (primitives/…)']]);
});

test('never imposed: a system whose tokens point at nothing has no layers and no rule', () => {
  const flat = { collections: [{ name: 'Tokens', modes: ['Light'] }], tokens: ['a', 'b', 'c', 'd'].map((n) => tok('Tokens', `color/${n}`)) };
  // No layer and nothing to fix: the one rule left is where the category word sits, which every name already does.
  assert.deepEqual(tokenRules(flat).map((r) => [r.id, r.items.every((i) => i.fits)]), [['token-category-order', true]]);
  assert.deepEqual(tokenRules(null), []);
});

test('in the grammar: a token is a place, under Tokens, with what to do', () => {
  const g = grammarOf({ tokens: system() });
  const r = g.figma.rules.find((x) => x.id === 'token-layer-component');
  assert.equal(r.area, 'tokens');
  assert.deepEqual(r.toFix, [{ where: 'chip/text', value: 'primitives/gray/900 (Primitives, past it)' }], 'where, never a component');
  assert.equal(r.status, 'decide', 'three of four: the team decides');
  assert.equal(fixOf(r, r.toFix[0]).say, 'Point it at a Semantic token instead of primitives/gray/900 (Primitives, past it)');
  assert.equal(g.figma.rules.find((x) => x.id === 'token-layer-semantic').status, 'rule', 'every Semantic token follows it');
  assert.ok(!grammarOf({}).figma.rules.some((x) => x.id.startsWith('token-')), 'no tokens given: no token rule');
});

test('layers kept inside one collection as groups of names are read as layers; one group a component is not', () => {
  // One Theme collection, layered by name: primitives/…, semantic/… on them, and a component group on semantic.
  const theme = (name, to) => tok('Theme', name, to);
  const inOne = { collections: [{ name: 'Theme', modes: ['Light'] }], tokens: [
    theme('primitives/a'), theme('primitives/b'), theme('primitives/c'),
    theme('semantic/x', 'primitives/a'), theme('semantic/y', 'primitives/b'), theme('semantic/z', 'semantic/x'),
    theme('card/bg', 'semantic/x'), theme('card/fg', 'semantic/y'), theme('card/edge', 'primitives/c'),
  ] };
  const layers = Object.fromEntries(tokenLayers(inOne).collections.map((c) => [c.label, [c.layer, c.through && c.through.split(' › ')[1]]]));
  assert.deepEqual(layers, { primitives: [1, null], semantic: [2, 'primitives'], card: [3, 'semantic'] });
  const card = tokenRules(inOne).find((r) => r.says === 'A card token points at a semantic token');
  assert.deepEqual(card.items.filter((i) => !i.fits).map((i) => i.where), ['card/edge'], 'named by its group, as the system names it');
  // Many small groups, one per component: one layer that names its components, never thirty layers.
  const perComponent = { collections: [{ name: 'Sizes', modes: ['M'] }], tokens: ['button', 'chip', 'card', 'tab', 'tag', 'menu', 'list', 'modal'].flatMap((c, i) => [tok('Sizes', `${c}/height`), tok('Sizes', `${c}/gap`, i ? 'button/height' : null)]) };
  assert.deepEqual(tokenLayers(perComponent).collections.map((c) => c.name), ['Sizes']);
});

// The two ways a reference points the wrong way that the layers alone let through: a base token pointing up at a
// layer that sits on it, and a component token pointing across at another component's.
test('a reference points down its layers: never up from the base, never across at another component\'s', () => {
  const s = system();
  s.tokens.push(tok('Primitives', 'primitives/brand', 'semantic/action/default'), tok('Component', 'chip/bg', 'card/bg'), tok('Semantic', 'semantic/text/muted', 'semantic/surface'));
  const rules = Object.fromEntries(tokenRules(s, { components: ['Button', 'Card', 'Chip'] }).map((r) => [r.id, r]));
  const off = (id) => rules[id].items.filter((i) => !i.fits).map((i) => [i.where, i.value]);
  assert.equal(rules['token-base-primitives'].says, 'A Primitives token points at no token of a layer above it');
  assert.deepEqual(off('token-base-primitives'), [['primitives/brand', 'semantic/action/default (Semantic, up)']]);
  assert.deepEqual(off('token-layer-component'), [['chip/text', 'primitives/gray/900 (Primitives, past it)'], ['chip/bg', 'card/bg (Component, another component\'s)']]);
  assert.equal(off('token-layer-semantic').length, 0, 'one semantic group pointing at another is no component\'s');
  // Without the library's component names nothing is read as a component's.
  assert.deepEqual(Object.fromEntries(tokenRules(s).map((r) => [r.id, r]))['token-layer-component'].items.filter((i) => !i.fits).map((i) => i.where), ['chip/text']);
  const g = grammarOf({ tokens: s, structure: { Button: {}, Card: {}, Chip: {} } });
  const base = g.figma.rules.find((x) => x.id === 'token-base-primitives');
  assert.match(fixOf(base, base.toFix[0]).say, /^Give it its value here, and point the layer above at it, instead of semantic\/action\/default/);
});
