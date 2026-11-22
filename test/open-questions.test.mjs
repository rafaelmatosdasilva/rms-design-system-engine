// The questions a component's documentation leaves open (open-questions.mjs): what its role raises, what the words
// written about it already answer, and what a person answered, kept as their decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionsFor, writtenOf, openQuestions, questionKey, questionReport } from '../lib/open-questions.mjs';

test('a role raises its own questions, and every component the ones that apply to it', () => {
  const ids = (r) => questionsFor(r).map((q) => q.id);
  assert.deepEqual(ids('combobox'), ['long-label', 'loading', 'empty', 'error', 'focus-on-close', 'typing']);
  assert.deepEqual(ids('dialog'), ['focus-on-close', 'dismiss']);
  assert.ok(ids('tab').includes('activation'));
  assert.deepEqual(ids(null), [], 'no role, nothing to ask');
});

test('what is written answers a question: the team\'s words, a prop, an option or a state', () => {
  const contract = { description: 'A field to pick a country.', intent: { whenToUse: ['Typing filters the list of countries.'] }, props: [{ name: 'loading', options: ['true', 'false'] }], states: ['error'] };
  const w = writtenOf(contract);
  const { open } = openQuestions('picker', 'combobox', w, {});
  assert.deepEqual(open.map((q) => q.id), ['long-label', 'empty', 'focus-on-close'], 'typing, loading and error are answered');
  assert.equal(open[0].key, questionKey('picker', 'long-label'));
  // The engine's own accessibility facts are not the team's words: they answer nothing.
  assert.ok(!writtenOf({ accessibility: { role: { value: 'combobox' }, states: ['invalid'] } }).includes('invalid'));
});

test('a person\'s answer is a decision with who gave it, and the question is no longer open', () => {
  const key = questionKey('dialog', 'focus-on-close');
  const decisions = { [key]: { answer: 'Back to the button that opened it.', said: 'Back to the button that opened it.', by: 'QA', at: '2026-11-22T10:00:00Z' } };
  const q = openQuestions('dialog', 'dialog', '', decisions);
  assert.deepEqual(q.open.map((x) => x.id), ['dismiss']);
  assert.deepEqual(q.decided.map((x) => [x.id, x.answer, x.by]), [['focus-on-close', 'Back to the button that opened it.', 'QA']]);
  const lines = questionReport([['dialog', { role: 'dialog', ...q }]]).join('\n');
  assert.match(lines, /1 open question on 1 component[^]*\? What closes it[^]*\[question:dialog:dismiss\][^]*✓ Where does the focus go when it closes[^]*Back to the button that opened it\. \(QA, 2026-11-22\)/);
  assert.match(questionReport([]).join('\n'), /No open questions/);
});
