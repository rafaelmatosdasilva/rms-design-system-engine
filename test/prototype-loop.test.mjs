// prototype-progress.mjs and prototype-loop.mjs - is it actually getting better, and the whole loop on one screen.
// Nothing is measured in either: every number comes from a file an earlier run wrote. So the tests are about what a
// person is told, and above all about what they are told when there is not enough to say anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressOf, progressLines, ENOUGH, MOVED } from '../lib/prototype-progress.mjs';
import { STEPS, loopState, loopLines } from '../lib/prototype-loop.mjs';

// n runs of a page, each with `err` mistakes of which `gap` were the documentation's fault.
const runs = (n, err, gap, from = 0) => Array.from({ length: n }, (_, i) => ({
  at: new Date(Date.UTC(2026, 9, 1, from + i)).toISOString(), page: `p${i % 3}`, errors: err,
  items: Array.from({ length: err }, (_, k) => ({ gap: k < gap, need: k < gap ? 'example' : null })),
}));

test('too few runs to say which way it is going says exactly that, and draws no trend', () => {
  const p = progressOf({ runs: runs(3, 4, 2) });
  assert.equal(p.enough, false);
  assert.equal(p.early, undefined, 'no early and late at all, rather than early and late of two runs each');
  assert.match(p.say, /Too few to say which way it is going: 12 is where early and late start meaning anything\./);
  assert.equal(ENOUGH, 6);
  // And nothing at all before the first check.
  assert.equal(progressOf({}).say, 'no page has been checked yet.');
  assert.deepEqual(progressLines(progressOf({})), []);
});

test('early against late, as mistakes a page, so the number is comparable however many pages were drawn', () => {
  const p = progressOf({ runs: [...runs(6, 6, 4), ...runs(6, 2, 1, 6)] });
  assert.equal(p.enough, true);
  assert.deepEqual([p.early.perPage, p.late.perPage], [6, 2]);
  assert.equal(p.way, 'better');
  assert.match(p.say, /2 mistakes a page over the last 6 checks, against 6 over the first 6: 67% fewer\./);
  // The share the documentation owed is the half a person can act on, and watching it fall is the loop working.
  assert.match(progressLines(p)[1], /50% of them were things the documentation did not say, against 67% early on: writing what was missing is working\./);
  assert.match(progressLines(p)[2], /Read from 12 checks of 3 pages/);
});

test('a difference too small to be a difference is said to be the same number twice', () => {
  const same = progressOf({ runs: [...runs(6, 4, 2), ...runs(6, 4, 2, 6)] });
  assert.equal(same.way, 'same');
  assert.match(same.say, /the same number said twice\./);
  // Just inside the noise is still noise; well outside it is not.
  const small = progressOf({ runs: [...runs(6, 10, 5), ...runs(6, 9, 4, 6)] });
  assert.equal(small.way, 'same', `moved ${small.change}, under ${MOVED}`);
  assert.equal(progressOf({ runs: [...runs(6, 10, 5), ...runs(6, 14, 7, 6)] }).way, 'worse');
});

test('the loop on a project where nothing has been run says what to run, never a zero', () => {
  const state = loopState({});
  assert.deepEqual(state.map((s) => s.step), STEPS);
  // Every step that has nothing says what to run: a zero and "not yet" look the same and mean opposite things.
  assert.equal(state.filter((s) => s.next).length, 4, JSON.stringify(state.map((s) => [s.step, s.next])));
  assert.match(state[0].said, /No page has been drawn yet and none of the product's own pages could be read/);
  // Pages read with nothing shared between them yet is not the same as no pages, and does not read as "0 patterns".
  assert.match(loopState({ pages: 2, conventions: { page: {}, intents: {} } })[0].said, /2 pages read, and nothing shared between them yet/);
  assert.match(state[1].said, /No page has been checked yet/);
  assert.equal(state.some((s) => /\b0 \w/.test(s.said)), false, 'no step shows a zero');
  const lines = loopLines(state).join('\n');
  assert.match(lines, /^🔁 The prototype loop, as it stands here\./m);
  assert.match(lines, /^ {5}→ rms-design-system-engine --prototype <page>$/m);
});

test('the loop on a project that has been round it: each step with its own number', () => {
  const state = loopState({
    // A convention is a leaf with a value, never the group holding it: counting the groups said "0 patterns" on a
    // project that had plenty.
    conventions: { page: { padding: { value: '24px' }, gap: { value: '16px' } }, intents: { save: { label: { value: 'Save' } } }, frame: [] }, pages: 4,
    inventions: { runs: [...runs(6, 6, 4), ...runs(6, 2, 1, 6)] },
    coverage: { components: { chip: { missing: [{ kind: 'prop' }, { kind: 'event' }] } } },
    cards: new Set(['chip', 'button']), autoFix: true,
  });
  const said = Object.fromEntries(state.map((s) => [s.step, s.said]));
  assert.match(said.patterns, /3 patterns read from 4 pages already made/);
  assert.match(said.mistakes, /48 mistakes across 12 checks: 30 the documentation did not say, 18 written and not followed\./);
  assert.match(said.written, /written into the intent layer on every run; what is still owed: example/);
  assert.match(said.review, /2 things an agent cannot learn from the documentation/);
  assert.match(said.better, /67% fewer/);
  assert.match(said.reading, /2 components had their cards read/);
  // A project whose intent layer is not written by itself is told how to write it.
  const byHand = loopState({ inventions: { runs: runs(6, 2, 1) }, autoFix: false });
  assert.match(byHand.find((s) => s.step === 'written').next, /--intent-changes/);
  // One component reads as one component.
  assert.match(loopState({ cards: new Set(['chip']) }).find((s) => s.step === 'reading').said, /1 component had its card read .* what it says\./);
});
