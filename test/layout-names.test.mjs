// The code's names for how things are laid out (a stack, a cluster), carried onto Figma's auto-layout frames: a layout
// nobody named on one side is rebuilt by hand, and by guess, on the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPartsOf, layoutFrames, layoutNameRules } from '../lib/layout-names.mjs';
import { grammarOf, fixOf } from '../lib/construction-grammar.mjs';
import { codeGrammarOf } from '../lib/code-grammar.mjs';

const css = `.l-stack { display: flex; flex-direction: column; gap: var(--space-m); }
.l-stack--tight { gap: 4px; }
.o-cluster { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ds-grid { display: grid; gap: 16px; }
.row-label { display: flex; }
.cardTile { display: flex; }`;

test('the code\'s layout parts are its classes named after a layout, each with what it sets', () => {
  const parts = layoutPartsOf([{ file: 'src/layout.css', text: css }]);
  assert.deepEqual(parts.map(({ name, class: c, dir, wrap }) => [name, c, dir, wrap]), [
    ['Stack', 'l-stack', 'VERTICAL', false], ['Cluster', 'o-cluster', 'HORIZONTAL', true], ['Grid', 'ds-grid', 'GRID', false]]);
  assert.equal(parts[0].gap, 'var(--space-m)');
  assert.equal(parts[1].align, 'CENTER');
  // A modifier is the part's (stack--tight), and a class whose last word is no layout's (row-label) is no part.
  assert.ok(!parts.some((p) => /tight|label|cardTile/.test(p.class)));
});

// One component: a vertical frame nobody named, a wrapping row named after the code's part, an instance's own layers.
const tree = { t: 'COMPONENT', n: 'cardTile', layout: { dir: 'VERTICAL', gap: 8 }, c: [
  { t: 'FRAME', n: 'Frame 47', layout: { dir: 'VERTICAL', gap: 8 }, c: [{ t: 'TEXT', n: 'title' }] },
  { t: 'FRAME', n: 'Tag cluster', layout: { dir: 'HORIZONTAL', gap: 8, wrap: true, cross: 'CENTER' }, c: [] },
  { t: 'FRAME', n: 'Plain row', layout: { dir: 'HORIZONTAL', gap: 4 }, c: [] },
  { t: 'INSTANCE', n: 'icon', layout: { dir: 'VERTICAL', gap: 0 } },
] };
const skeleton = { cardTile: { variants: [['State=Default', 0]], trees: [tree], binds: { 'State=Default': { 1: { itemSpacing: 'space/s' } } } } };

test('each auto-layout frame is matched to the part laid out the same way, never the component or an instance', () => {
  const parts = layoutPartsOf([{ file: 'src/layout.css', text: css }]);
  const f = layoutFrames(skeleton, parts).cardTile;
  assert.deepEqual(f.map(({ frame, parts: p, named, gapBound }) => [frame, p, named, gapBound]), [
    ['Frame 47', ['Stack'], false, false],
    ['Tag cluster', ['Cluster'], true, true],
  ], 'a row that does not wrap is no Cluster, and the code has no plain row part');
});

test('the construction check names the frame after the code\'s part, and says the gap is not bound', () => {
  const layouts = layoutPartsOf([{ file: 'src/layout.css', text: css }]);
  const rules = layoutNameRules({ skeleton, layouts });
  const named = rules.find((r) => r.id === 'layouts-named'), gap = rules.find((r) => r.id === 'layout-gap-bound');
  assert.deepEqual(named.items, [{ component: 'cardTile', fits: false, value: "Frame 47 is laid out as the code's Stack (a column)" }]);
  assert.deepEqual(gap.items, [{ component: 'cardTile', fits: false, value: 'Frame 47 (8px)' }]);
  // Three components laid out alike, as a rule needs: the construction check asks the team, or follows its answer.
  const three = { ...skeleton, listRow: skeleton.cardTile, menuItem: skeleton.cardTile };
  const g = grammarOf({ skeleton: three, structure: { cardTile: {}, listRow: {}, menuItem: {} }, layouts }, { answers: { 'layouts-named': true } });
  const r = g.figma.rules.find((x) => x.id === 'layouts-named');
  assert.equal(r.status, 'fix');
  assert.match(fixOf(r, r.toFix[0]).say, /^Name each frame after the code's layout part it is laid out as: Frame 47 is laid out as the code's Stack/);
  // Without the code's parts, there is nothing to name a frame after: no rule.
  assert.ok(!grammarOf({ skeleton: three, structure: { cardTile: {}, listRow: {}, menuItem: {} } }, { answers: { 'layouts-named': true } }).figma.rules.some((x) => x.id === 'layouts-named'));
});

test('the code grammar reads the layout parts from the components\' own styles', () => {
  const g = codeGrammarOf({ components: [{ name: 'cardTile', file: 'src/CardTile.vue', text: '<template><div class="cardTile"></div></template>', styles: [{ file: 'src/layout.css', text: css }], root: '.cardTile' }] });
  assert.deepEqual(g.code.vocabulary.layouts.map((p) => p.name), ['Stack', 'Cluster', 'Grid']);
});
