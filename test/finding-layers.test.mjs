// Each finding's layer (a rule, guidance or taste), what each check does with a mistake, and what a run leaves for a
// person (finding-layers.mjs), on the records and gates a run writes (run-diff.mjs) and the rails (gate-strength.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerOf, doesOf, layerCounts, leftForPerson } from '../lib/finding-layers.mjs';
import { findingRecords, gateRecords } from '../lib/run-diff.mjs';
import { railStates } from '../lib/gate-strength.mjs';

test('a check a model answers is guidance, every other a rule; a hold prevents, a failure or a notice catches, the rest advises', () => {
  assert.equal(layerOf('Token values'), 'rule');
  assert.equal(layerOf('Accessibility judgement'), 'guidance');
  assert.equal(doesOf({ strength: 'holds the edit' }), 'prevents');
  assert.equal(doesOf({ strength: 'notices' }), 'catches');
  assert.equal(doesOf({ verdict: 'fails' }), 'catches');
  assert.equal(doesOf({ verdict: 'advisory' }), 'advises');
});

test('each record and each gate says its layer and what it did; each rail what it does', () => {
  const recs = findingRecords(['Token values :: ❌ chip: --chip-bg is #fff, Figma #eee', 'System health :: ⚠️ two buttons nearly the same'], ['chip'], { failing: ['Token values'] });
  assert.deepEqual(recs.map((r) => [r.layer, r.does]), [['rule', 'catches'], ['rule', 'advises']]);
  assert.deepEqual(gateRecords([{ label: 'Token values', pass: false }]).map((g) => [g.layer, g.does]), [['rule', 'catches']]);
  const rails = Object.fromEntries(railStates({}).map((r) => [r.id, r.does]));
  assert.equal(rails.guard, 'prevents');
  assert.equal(rails['edit-check'], 'catches');
  assert.deepEqual(layerCounts(recs), { rule: { fails: 1, advisory: 1 }, guidance: { fails: 0, advisory: 0 } });
});

test('the end of a report says what each layer answered and what is left for a person', () => {
  const lines = leftForPerson({ records: [{ check: 'Token values', verdict: 'fails' }], judged: null, components: ['chip'] });
  assert.deepEqual(lines, [
    '**What each layer answered.**',
    '- Rules, answered by the engine: 1 failing, 0 advice.',
    '- Guidance, read by a model: none asked this run (--judge-a11y reads the words of each component).',
    '- Taste, for a person in the review: how chip looks and reads. No check answers it, and it is worth a look once the rules pass.',
  ]);
  assert.match(leftForPerson({ records: [], judged: 3 })[2], /3 readings by a model/);
  assert.match(leftForPerson({ records: [] })[3], /how the change looks and reads\. No check answers it\.$/);
});
