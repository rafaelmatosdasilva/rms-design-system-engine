// What changed in the contracts from one build to the next (contract-history.mjs): a log for the History page, an entry
// only when something changed, nothing on the first build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { withContractHistory, comparePatterns, patternSlim } from '../lib/contract-history.mjs';

const chip = (props) => ({ name: 'chip', props, states: [] });
const save = (rules) => ({ name: 'Save', kind: 'pattern', components: ['confirmButton'], rules });

test('the first build records, a build that changes nothing adds nothing, a change is logged with what it was', () => {
  const file = join(tempDir('contract-history-'), 'contracts-history.json');
  assert.deepEqual(withContractHistory(file, '2026-11-01T10:00:00Z', { contracts: [chip([{ name: 'size', options: ['s', 'm'] }])], patterns: [save([{ text: 'Show it.', level: 'must' }])] }), [], 'nothing to compare yet');
  assert.deepEqual(withContractHistory(file, '2026-11-02T10:00:00Z', { contracts: [chip([{ name: 'size', options: ['s', 'm'] }])], patterns: [save([{ text: 'Show it.', level: 'must' }])] }), [], 'written again, the same: no entry');
  const log = withContractHistory(file, '2026-11-03T10:00:00Z', { contracts: [chip([])], patterns: [save([{ text: 'Show it.', level: 'must' }, { text: 'Keep it.', level: 'should' }])] });
  assert.equal(log.length, 1);
  const [c, p] = log[0].changes;
  assert.deepEqual([c.name, c.kind, c.change, c.breaking], ['chip', 'component', 'changed', true], 'a prop removed breaks a product');
  assert.deepEqual(c.items.map((x) => [x.what, x.change]), [['prop size', 'removed']]);
  assert.deepEqual([p.name, p.kind, p.items], ['Save', 'pattern', [{ what: 'should rule', change: 'added', detail: 'Keep it.' }]]);
});

test('each build\'s changes keep the person who ran it, or the schedule when nobody did', () => {
  const file = join(tempDir('contract-history-by-'), 'contracts-history.json');
  withContractHistory(file, '2026-11-01T10:00:00Z', { contracts: [chip([{ name: 'size', options: ['s'] }])] });
  const log = withContractHistory(file, '2026-11-02T10:00:00Z', { contracts: [chip([])], by: 'QA Lead' });
  assert.equal(log.at(-1).by, 'QA Lead', 'the person who ran the build');
  const more = withContractHistory(file, '2026-11-03T10:00:00Z', { contracts: [chip([{ name: 'tone', options: ['a'] }])], run: 'schedule' });
  assert.deepEqual([more.at(-1).by, more.at(-1).run], [undefined, 'schedule'], 'a scheduled build names nobody it was not');
});

test('a pattern\'s rules and components compared, at their level', () => {
  const was = { Save: patternSlim(save([{ text: 'Show it.', level: 'should' }])) }, is = { Save: patternSlim(save([{ text: 'Show it.', level: 'must' }])) };
  assert.deepEqual(comparePatterns(was, is)[0].items.map((x) => `${x.what} ${x.change}`), ['must rule added', 'should rule removed'], 'a rule made a must is said');
  assert.deepEqual(comparePatterns({}, is).map((x) => x.change), ['added']);
});
