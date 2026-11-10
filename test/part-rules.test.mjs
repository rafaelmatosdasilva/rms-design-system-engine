// How a component's parts go together (part-rules.mjs): one name for a part, the order parts sit in, what a family holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partRules } from '../lib/part-rules.mjs';
import { grammarOf, familyOf, fixOf } from '../lib/construction-grammar.mjs';

const icon = (n = 'Icon', of = 'iconGeneric') => ({ t: 'INSTANCE', n, of: { name: of } });
const label = { t: 'TEXT', n: 'Label' };
const comp = (...c) => ({ trees: [{ layout: { dir: 'HORIZONTAL' }, c }], variants: [['Size=s', 0]] });
const library = () => ({ skeleton: {
  buttonPrimary: comp(icon(), label),
  buttonSecondary: comp(icon(), label),
  // The icon named another way; and one after its label.
  buttonGhost: comp(icon('Glyph'), label),
  buttonFlip: comp(label, icon()),
  // A button holding an avatar, which no other button holds.
  buttonUser: comp(icon(), label, icon('Avatar', 'avatarSmall')),
  chip: comp(icon(), label),
} });
const rules = () => Object.fromEntries(partRules(library(), { familyOf }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('a part named another way, and parts in another order', () => {
  const r = rules();
  assert.equal(r['part-one-name'].says, 'An instance of a component is named as most of the library names it (iconGeneric is Icon)');
  assert.deepEqual(off(r['part-one-name']), [['buttonGhost', 'Glyph, where the library names iconGeneric Icon']]);
  assert.match(r['part-order'].says, /family puts them \(icon before label\)$/);
  assert.deepEqual(off(r['part-order']), [['buttonFlip', 'label before icon, where most of its family puts icon first']]);
});

test('a component holding what no other of its family holds', () => {
  assert.deepEqual(off(rules()['family-holds']), [['buttonUser', 'holds avatar, which no other button holds']]);
});

test('never imposed: what no component does is no rule', () => {
  const plain = { skeleton: { a: comp(label), b: comp({ t: 'FRAME', n: 'Box' }), c: comp(label) } };
  assert.deepEqual(partRules(plain, { familyOf }), []);
  assert.deepEqual(partRules({}, { familyOf }), []);
});

test('in the grammar: under architecture, with what to do', () => {
  const g = grammarOf(library());
  const r = g.figma.rules.find((x) => x.id === 'part-one-name');
  assert.equal(r.area, 'architecture');
  assert.equal(fixOf(r, r.toFix[0]).say, 'Rename the part as the library names it: Glyph, where the library names iconGeneric Icon');
});

test('an icon beside a label at another size than most labels of that style have', () => {
  const row = (size) => comp({ t: 'INSTANCE', n: 'Icon', of: { name: `arrow-${size}` } }, { t: 'TEXT', n: 'Label', styles: { text: 'label/m' } });
  const r = partRules({ skeleton: { a: row('m'), b: row('m'), c: row('m'), d: row('s') } }, { familyOf }).find((x) => x.id === 'icon-with-label');
  assert.equal(r.says, 'An icon beside a label is the size most of the library puts beside that text style (m beside label/m)');
  assert.deepEqual(off(r), [['d', 'an s icon beside label/m, where most labels in label/m have an m one']]);
});
