// A contract for each pattern and flow of the intent layer (pattern-contract.mjs): the components it names, its rules at
// their level, and where it is written, never as a component's contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternContracts, patternFileOf, PATTERN_SUFFIX } from '../lib/pattern-contract.mjs';

const save = { layer: 'patterns', name: 'Save', id: 'pattern-save', file: 'specs/dsds/patterns/save.dsds.json', purpose: ['Save a long form.'],
  whenToUse: ['Use `ConfirmButton` in a long form.'], whenNotToUse: ['Not for `UnknownThing`.'], mistakes: ['Do not use it as a loader.'],
  rules: [{ text: '`ConfirmButton` must show saved feedback.', level: 'must' }, { text: 'Keep it visible.', level: 'should' }] };

test('a pattern\'s contract: the components it names, its rules at their level, from its page', () => {
  const [{ rel, contract }] = patternContracts([save], ['confirmButton', 'cardTile']);
  assert.equal(rel, 'patterns/save.pattern.json');
  assert.deepEqual(contract.components, ['confirmButton'], 'only names the system has, in its own spelling');
  assert.deepEqual(contract.rules, [{ text: '`ConfirmButton` must show saved feedback.', level: 'must', components: ['confirmButton'] }, { text: 'Keep it visible.', level: 'should' }]);
  assert.equal(contract.kind, 'pattern');
  assert.equal(contract.from, save.file);
  assert.ok(contract['x-design-system-engine'], 'the engine\'s own file, so a later run may replace it');
});

test('a flow is written too; a component, a template or a page is not', () => {
  const flow = { ...save, layer: 'flows', name: 'Settings', file: 'specs/dsds/flows/settings.dsds.json' };
  const rels = patternContracts([flow, { ...save, layer: 'components' }, { ...save, layer: 'templates' }, { ...save, layer: 'pages' }], []).map((x) => x.rel);
  assert.deepEqual(rels, ['flows/settings.pattern.json']);
  assert.equal(patternFileOf({ layer: 'components', file: 'x.dsds.json' }), null);
});

test('never named as a component\'s contract: every reader of the folder takes a .contract.json for a component', () => {
  assert.equal(PATTERN_SUFFIX.endsWith('.contract.json'), false);
});
