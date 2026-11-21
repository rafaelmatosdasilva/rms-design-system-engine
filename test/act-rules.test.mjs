// The engine's own checks against the W3C's ACT Rules cases (act-rules.mjs): how a case is judged, how a rule holds,
// and that every mapped rule stands for kinds the engine really raises. The cases themselves run in their own
// workflow (.github/workflows/act-rules.yml), since each is a full run of the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, summarise, mappedCases, RULES, KNOWN, ACT_COMMIT } from '../lib/act-rules.mjs';
import { WCAG22 } from '../lib/wcag21.mjs';

test('a case agrees when the engine raises a rule\'s kind exactly where the W3C expects a failure', () => {
  assert.equal(judge('failed', ['contrast', 'bypass'], ['contrast']), 'agree');
  assert.equal(judge('failed', ['bypass'], ['contrast']), 'disagree', 'a failure missed');
  assert.equal(judge('passed', ['contrast'], ['contrast']), 'disagree', 'a pass flagged');
  assert.equal(judge('inapplicable', ['heading'], ['contrast']), 'agree', 'other kinds on the page do not count');
  // One kind with several problems in it: only the finding in the rule's own words counts.
  assert.equal(judge('inapplicable', [{ kind: 'aria', said: 'div (aria-hidden="yes" takes true or false)' }], ['aria'], /on something Tab reaches/), 'agree');
  assert.equal(judge('failed', [{ kind: 'aria', said: 'button (aria-hidden="true" on something Tab reaches)' }], ['aria'], /on something Tab reaches/), 'agree');
});

test('a rule holds when every case agrees or is known with why, and the rest are said', () => {
  const r = (id, ruleId, verdict) => ({ testcaseId: id, ruleId, expected: 'failed', raised: [], verdict, url: 'u' });
  const sum = summarise([r('a', 'afw4f7', 'agree'), r('b', 'afw4f7', 'agree'), r('c', '97a4e1', 'agree'), r('d', '97a4e1', 'disagree')]);
  assert.deepEqual(sum.map((s) => [s.rule, s.holds, s.agree, s.cases, s.disagree.map((d) => d.id)]), [['97a4e1', false, 1, 2, ['d']], ['afw4f7', true, 2, 2, []]]);
});

test('only the rules a check stands for are run, and every kind they name is one the engine raises', () => {
  const cases = [{ ruleId: 'afw4f7' }, { ruleId: '0va7u6' }, { ruleId: '97a4e1' }];
  assert.deepEqual(mappedCases(cases).map((c) => c.ruleId), ['afw4f7', '97a4e1']);
  assert.deepEqual(mappedCases(cases, ['97a4e1']).map((c) => c.ruleId), ['97a4e1']);
  const kinds = new Set(WCAG22.flatMap((c) => [...(c.kinds ?? []), ...(c.pageKinds ?? [])]));
  for (const [id, r] of Object.entries(RULES)) for (const k of r.kinds) assert.ok(kinds.has(k), `${id} names ${k}, which no criterion lists`);
  for (const [id, why] of Object.entries(KNOWN)) assert.ok(String(why).length > 20, `${id} says why it is known`);
  assert.match(ACT_COMMIT, /^[0-9a-f]{40}$/);
});
