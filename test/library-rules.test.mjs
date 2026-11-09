// Three readings of a Figma library (library-rules.mjs): a property named after the layer it drives, two components
// that do one job, and the team's declared tiers where the style guide can see them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryRules } from '../lib/library-rules.mjs';
import { grammarOf, familyOf, shapeOf, fixOf } from '../lib/construction-grammar.mjs';

const fns = { familyOf, shapeOf };
const comp = (layers, properties) => ({ skeleton: { trees: [{ layout: { dir: 'HORIZONTAL', w: 'HUG', h: 'HUG' }, c: layers }], variants: [['State=Default', 0]] }, props: { properties } });
const B = { type: 'BOOLEAN', defaultValue: true }, T = { type: 'TEXT', defaultValue: 'Go' };
const lib = (entries) => ({ skeleton: Object.fromEntries(entries.map(([n, c]) => [n, c.skeleton])), props: Object.fromEntries(entries.map(([n, c]) => [n, c.props])) });
const rule = (x, id) => libraryRules(x, fns).find((r) => r.id === id);
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component ?? i.where, i.value]);

test('a property says which layer it drives; a nested component nobody renamed is no case', () => {
  const x = lib([
    ['chip', comp([{ t: 'INSTANCE', n: 'Icon', of: { name: 'iconGeneric' }, wired: { visible: 'showIcon' } }, { t: 'TEXT', n: 'Label', wired: { characters: 'labelContent' } }], { 'showIcon#1:0': B, 'labelContent#1:1': T })],
    // A boolean named for something else than the layer it shows.
    ['tag', comp([{ t: 'INSTANCE', n: 'Dot', of: { name: 'dot' }, wired: { visible: 'showExtra' } }, { t: 'TEXT', n: 'Label', wired: { characters: 'labelContent' } }], { 'showExtra#2:0': B, 'labelContent#2:1': T })],
    ['card', comp([{ t: 'TEXT', n: 'Title', wired: { characters: 'titleContent' } }, { t: 'FRAME', n: 'Body', wired: { visible: 'showBody' } }], { 'titleContent#3:0': T, 'showBody#3:1': B })],
    // A button still named buttonTertiary, after its component: the layer has no name of its own to match.
    ['bar', comp([{ t: 'INSTANCE', n: 'buttonTertiary', of: { name: 'buttonTertiary' }, wired: { visible: 'showShareLink' } }, { t: 'TEXT', n: 'Label', wired: { characters: 'labelContent' } }], { 'showShareLink#4:0': B, 'labelContent#4:1': T })],
  ]);
  assert.deepEqual(off(rule(x, 'property-names-say-layer')), [['tag', 'showExtra drives Dot']]);
});

test('two components built the same and given the same properties are a pair to look at, never merged', () => {
  const same = () => comp([{ t: 'TEXT', n: 'Label', wired: { characters: 'labelContent' } }], { 'labelContent#1:0': T, 'Size#1:1': { type: 'VARIANT', variantOptions: ['s', 'm'] } });
  const other = comp([{ t: 'TEXT', n: 'Label' }, { t: 'INSTANCE', n: 'Icon', of: { name: 'icon' } }], { 'labelContent#1:0': T, 'showIcon#1:1': B });
  const x = lib([['badgeInfo', same()], ['badgeNote', same()], ['chip', other]]);
  assert.deepEqual(off(rule(x, 'no-twins')), [['badgeInfo', 'built and given like badgeNote'], ['badgeNote', 'built and given like badgeInfo']]);
});

test('declared tiers, read from the tokens where the style guide sees them; none declared, no rule', () => {
  const t = (name, to) => ({ name, collection: 'Theme', kind: 'COLOR', values: { Light: '#000' }, ...(to ? { aliases: { Light: to } } : {}) });
  const tokens = { tokens: [t('primitive/blue'), t('semantic/action', 'primitive/blue'), t('component/button', 'semantic/action'), t('component/chip', 'primitive/blue')] };
  const tiers = [{ name: 'primitive', match: '^primitive/' }, { name: 'semantic', match: '^semantic/', mayReference: ['primitive'] }, { name: 'component', match: '^component/', mayReference: ['semantic'] }];
  const r = rule({ tokens, tiers }, 'declared-tiers');
  assert.equal(r.area, 'tokens');
  assert.deepEqual(off(r).map(([w]) => w), ['component/chip']);
  assert.match(off(r)[0][1], /component token references a primitive token/);
  assert.equal(rule({ tokens }, 'declared-tiers'), undefined);
});

test('in the grammar: each judged, with what to do', () => {
  const same = () => comp([{ t: 'TEXT', n: 'Label' }], { 'labelContent#1:0': T, 'Size#1:1': { type: 'VARIANT', variantOptions: ['s', 'm'] } });
  const x = lib([['badgeInfo', same()], ['badgeNote', same()], ['chip', comp([{ t: 'FRAME', n: 'Box' }], { 'labelContent#1:0': T, 'showBox#1:1': B })]]);
  const g = grammarOf(x);
  const twins = g.figma.rules.find((r) => r.id === 'no-twins');
  assert.equal(twins.area, 'architecture');
  assert.match(fixOf(twins, twins.toFix[0]).say, /^Look at it beside its twin/);
});
