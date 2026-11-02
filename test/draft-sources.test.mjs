// draft-sources.mjs - where each drafted line comes from: the code's props it names, a name only Figma has (never a prop
// the code takes), the line it says again. And the drafter keeps no line that writes a Figma property as a prop
// (intent-changes.mjs → draftPlan). An invented system: a save control whose Figma component has a property the code
// does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSource, figmaOnlyNamed, carrierOf, rewriteOf } from '../lib/draft-sources.mjs';
import { docLines } from '../lib/prop-shapes.mjs';
import { factsFrom } from '../lib/intent-truth.mjs';
import { draftPlan, briefOf } from '../lib/intent-changes.mjs';

const facts = factsFrom({ components: { draftSaver: { file: 'src/saver/DraftSaver.vue', props: { state: { options: ['idle', 'saving', 'saved'], from: 'the code' }, savedAt: { type: 'object', from: 'the code' }, showClock: { type: 'boolean', from: 'Figma' } } } } });

test('a line that names a Figma property as a prop is said so; one that calls it Figma\'s is not', () => {
  assert.deepEqual(figmaOnlyNamed('It shows the time only when `showClock` is set with `savedAt`.', facts, 'draftSaver'), ['showClock']);
  assert.deepEqual(figmaOnlyNamed('Figma\'s `showClock` shows the time; in code, give `savedAt`.', facts, 'draftSaver'), []);
  assert.deepEqual(figmaOnlyNamed('Give `savedAt` to show the time.', facts, 'draftSaver'), []);
});

test('a draft\'s source: each prop as the code or Figma has it, and the line it says again', () => {
  const lines = [{ from: 'The intent layer · When to use', text: 'Use `draftSaver` with `showClock` and `savedAt` when the user should see the last save.' }, { from: 'The intent layer · Rules', text: '| A | B | | --- | --- | | many | words | of | a | table | that | is | long |' }];
  const s = draftSource({ where: 'When to use', text: 'Use `draftSaver` with `showClock` and `savedAt` when the user should see when the last save happened.' }, { component: 'draftSaver', facts, lines });
  assert.deepEqual(s.props, [{ name: 'showClock', from: 'Figma' }, { name: 'savedAt', from: 'the code', file: 'src/saver/DraftSaver.vue' }]);
  assert.deepEqual(s.figmaOnly, ['showClock']);
  assert.equal(s.line.from, 'The intent layer · When to use');
  assert.deepEqual(draftSource({ text: 'It does not submit.' }, { component: 'draftSaver', facts, lines }), { props: [] }, 'nothing it says again: no line');
});

test('the drafter is told which props are only Figma\'s, and keeps no line that writes one as a prop', () => {
  assert.deepEqual(briefOf('draftSaver', facts).figmaOnly, ['showClock']);
  const entity = { kind: 'component', layer: 'components', name: 'Draft Saver', file: 'c/draft-saver.json', purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const plan = [{ entity, page: { component: 'draftSaver' }, rewrite: [], need: ['limitations'] }];
  draftPlan(plan, facts, null, { answers: { '0.d': { limitations: ['It shows the time only when `showClock` is set.', 'It shows the time only when `savedAt` is given.'] } } });
  assert.deepEqual(plan[0].drafted.map((d) => d.text), ['It shows the time only when `savedAt` is given.']);
  assert.match(plan[0].dropped[0].why, /`showClock`, a property of the Figma component that the code does not take/);
});

test('where the code carries a property only Figma has: a prop of its name, a field of its name, or what the doc comment says', () => {
  const doc = docLines('/**\n * @savedAt {Object} when it was last saved\n *   - time {String}: shown as a clock\n *     - zone {String} deeper\n * @icon {String} the icon before the label\n */');
  assert.deepEqual(doc, [{ prop: 'savedAt', field: null, says: 'when it was last saved' }, { prop: 'savedAt', field: 'time', says: 'shown as a clock' }, { prop: 'icon', field: null, says: 'the icon before the label' }], 'a field is the first level only');
  const c = { props: { savedAt: { from: 'the code' }, icon: { from: 'the code' }, showClock: { from: 'Figma' }, showIcon: { from: 'Figma' }, hasBadge: { from: 'Figma' } }, doc };
  assert.deepEqual(carrierOf('showIcon', c), { prop: 'icon' }, 'show taken off: the prop of that name');
  assert.deepEqual(carrierOf('showClock', c), { prop: 'savedAt', field: 'time' }, 'the field the comment says shows it');
  assert.equal(carrierOf('hasBadge', c), null, 'nothing in the code says: none');
});

test('the rewrite offered names each Figma property as Figma\'s, with what carries it, and passes the check', () => {
  const f = factsFrom({ components: { draftSaver: { props: { savedAt: { from: 'the code' }, showClock: { from: 'Figma' }, hasBadge: { from: 'Figma' } }, doc: [{ prop: 'savedAt', field: 'time', says: 'shown as a clock' }] } } });
  const text = 'It shows the time only when `showClock` is set. `hasBadge` adds a dot. Give `savedAt` to show it.';
  const r = rewriteOf(text, f, 'draftSaver');
  assert.equal(r, 'It shows the time only when Figma\'s `showClock` (in the code, the `time` field of `savedAt`) is set. Figma\'s `hasBadge` adds a dot. Give `savedAt` to show it.');
  assert.deepEqual(figmaOnlyNamed(r, f, 'draftSaver'), []);
  const s = draftSource({ text }, { component: 'draftSaver', facts: f });
  assert.equal(s.rewrite, r);
  assert.deepEqual(s.carriers, { showClock: { prop: 'savedAt', field: 'time' } });
  assert.equal(draftSource({ text: 'Give `savedAt`.' }, { component: 'draftSaver', facts: f }).rewrite, undefined, 'nothing to mend: no rewrite');
});
