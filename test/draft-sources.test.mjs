// draft-sources.mjs - where each drafted line comes from: the code's props it names, a name only Figma has (never a prop
// the code takes), the line it says again. And the drafter keeps no line that writes a Figma property as a prop
// (intent-changes.mjs → draftPlan). An invented system: a save control whose Figma component has a property the code
// does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSource, figmaOnlyNamed } from '../lib/draft-sources.mjs';
import { factsFrom } from '../lib/intent-truth.mjs';
import { draftPlan, briefOf, draftPrompt } from '../lib/intent-changes.mjs';

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

test('one draft a part: a second line for the same part is not kept, nor one that says again a line the page has', () => {
  const entity = { kind: 'component', layer: 'components', name: 'Draft Saver', file: 'c/draft-saver.json', purpose: [], whenToUse: ['Use `draftSaver` in a long form so the user can save progress on purpose.'], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const plan = [{ entity, page: { component: 'draftSaver' }, rewrite: [], need: ['whenToUse', 'limitations'] }];
  draftPlan(plan, facts, null, { answers: { '0.d': {
    whenToUse: ['Use `draftSaver` in a long form so the user can save their progress on purpose.', 'Use `draftSaver` when the user needs to see `state` move from `idle` to `saved`.', 'Use `draftSaver` with `savedAt` to show when the last save happened.'],
    limitations: 'It does not submit the form.',
  } } });
  assert.deepEqual(plan[0].drafted.map((d) => [d.where, d.text]), [
    ['When to use', 'Use `draftSaver` when the user needs to see `state` move from `idle` to `saved`.'],
    ['Limitations', 'It does not submit the form.'],
  ], 'one line a part, as one line or the first of a list');
  assert.deepEqual(plan[0].dropped.map((d) => d.why), [
    'the page already says it: "Use `draftSaver` in a long form so the user can save progress on purpose."',
    'When to use has a draft already: one a part',
  ]);
});

test('the drafter is asked for one line a part', () => {
  assert.match(draftPrompt([]), /"whenToUse": "<line>", "whenNotToUse": "<line>"/);
  assert.match(draftPrompt([]), /\(one line each, the most useful one, never a second for the same part; only the parts asked; never a line the page already says\)/);
});
