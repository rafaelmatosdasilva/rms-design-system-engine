// A pull request that cannot merge, while looking as though it will. Nothing here asks GitHub: the pull requests are
// given in, which is the same shape `gh pr list --json` returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stalled, stallLines, issueBody, ISSUE_TITLE, WAITING_HOURS } from '../lib/merge-stalled.mjs';

const NOW = new Date('2026-11-17T12:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const pr = (n, over = {}) => ({ number: n, title: `Pull request ${n}`, isDraft: false, mergeable: 'MERGEABLE',
  autoMergeRequest: { enabledAt: ago(10) }, createdAt: ago(10), updatedAt: ago(10), statusCheckRollup: [], ...over });

test('the three ways a pull request stops without saying so', () => {
  const list = stalled([
    pr(1, { mergeable: 'CONFLICTING' }),
    pr(2, { statusCheckRollup: [{ name: 'test', conclusion: 'FAILURE' }, { name: 'privacy', conclusion: 'SUCCESS' }] }),
    pr(3, { autoMergeRequest: null }),
    pr(4),
  ], NOW);
  assert.deepEqual(list.map((p) => p.number), [1, 2, 3], 'the fourth is merging itself');
  assert.match(list[0].why, /conflicts with main/);
  assert.match(list[1].why, /^test failed/, 'the check that failed, named, and never the ones that passed');
  assert.match(list[2].why, /auto-merge is off/);
});

// A pull request opened a minute ago has not stalled, it is new: saying so would teach everyone to ignore this.
test('one that has not had time to merge is not stalled', () => {
  assert.deepEqual(stalled([pr(1, { mergeable: 'CONFLICTING', updatedAt: ago(1), createdAt: ago(1) })], NOW), []);
  assert.equal(stalled([pr(1, { mergeable: 'CONFLICTING', updatedAt: ago(WAITING_HOURS), createdAt: ago(48) })], NOW).length, 1, 'once it has waited');
  assert.deepEqual(stalled([pr(1, { isDraft: true, mergeable: 'CONFLICTING' })], NOW), [], 'a draft waits on its author and says so');
  assert.deepEqual(stalled([pr(1, { mergeable: 'UNKNOWN' })], NOW), [], 'GitHub still working it out is not a stall');
  assert.deepEqual(stalled([], NOW), []);
});

test('a check still running, or one that was skipped, is not a failure', () => {
  assert.deepEqual(stalled([pr(1, { statusCheckRollup: [{ name: 'test', status: 'IN_PROGRESS', conclusion: null }] })], NOW), []);
  assert.deepEqual(stalled([pr(1, { statusCheckRollup: [{ name: 'auto-merge', conclusion: 'SKIPPED' }, { name: 'test', conclusion: 'NEUTRAL' }] })], NOW), []);
});

test('what it says names the pull request, what is wrong, and how long it has been', () => {
  const lines = stallLines(stalled([pr(547, { title: 'Every standard the engine pins', mergeable: 'CONFLICTING', updatedAt: ago(60), createdAt: ago(60) })], NOW));
  assert.match(lines[0], /^1 pull request cannot merge, with nothing saying so:/);
  assert.match(lines[1], /\*\*#547\*\* Every standard the engine pins — it conflicts with main.*\(2 days\)/);
  assert.deepEqual(stallLines([]), [], 'nothing stalled says nothing');

  const body = issueBody(lines, 'acme/engine');
  assert.match(body, /rebase the branch onto main, fix what failed, or turn auto-merge on/);
  assert.ok(ISSUE_TITLE.length < 60, 'one issue, found again by its title');
});
