// test/skill-evals/reading.mjs - how a result is read, so a number means what it says. Three ways an evaluation
// lied to whoever read it, each learned the hard way and each a test here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, kindOf, engineFell, byTask, movedTasks, readingLine } from './skill-evals/reading.mjs';
import { DEV } from './skill-evals/tasks.mjs';
import { HELDOUT } from './skill-evals/heldout.mjs';

const runs = (task, pass, n = 3, kind) => Array.from({ length: n }, (_, i) => ({ task, run: i, pass: typeof pass === 'function' ? pass(i) : pass, ...(kind ? { kind } : {}) }));

test('a task guards something or measures something, and guarding is the default', () => {
  assert.deepEqual(KINDS, ['regression', 'capability']);
  assert.equal(kindOf({}), 'regression', 'a task with nothing said about it must always pass');
  assert.equal(kindOf({ kind: 'capability' }), 'capability');
  assert.equal(kindOf({ kind: 'whatever' }), 'regression', 'a word nobody defined is not a way out of passing');
  // Every task the engine ships with guards something it already does.
  for (const t of [...DEV, ...HELDOUT]) assert.equal(kindOf(t), 'regression', `${t.id} is not marked`);
});

test('a run that reached an engine that fell over is the engine\'s failure, not the agent\'s', () => {
  // The loud way: a stack.
  assert.match(engineFell({ engine: [{ command: 'rms --styleguide', result: 'oops\n    at generateStyleguide (/x/styleguide-gen.mjs:12:3)' }] }).said, /at generateStyleguide/);
  // The quiet way: a name that is not in scope, caught and printed as a note while the work never happened.
  const quiet = engineFell({ engine: [{ command: 'rms-design-system-engine --figma-edits', result: '❌ Figma edits not listed: cfg is not defined' }] });
  assert.equal(quiet.said, 'is not defined');
  assert.match(quiet.command, /--figma-edits/);
  // An engine that fails on purpose is the engine working: a difference found, a token missing, a refusal.
  assert.equal(engineFell({ engine: [{ command: 'rms', result: '❌ [13] Structure — chip is 36px, Figma says 32px' }] }), null);
  assert.equal(engineFell({ engine: [{ command: 'rms --refresh-figma', result: '❌ no Figma token: put it in .env' }] }), null);
  assert.equal(engineFell({}), null);
});

test('a count that moved by one is a task that passes sometimes, not a difference', () => {
  const before = [...runs('figma-roles', true), ...runs('new-ui-saved', true, 10)];
  // One run of ten: noise, and said to be noise.
  const nudged = [...runs('figma-roles', true), ...runs('new-ui-saved', (i) => i > 0, 10)];
  const r = movedTasks(before, nudged);
  assert.deepEqual(r.moved, []);
  assert.equal(r.noise, 1);
  assert.match(readingLine(before, nudged), /no task changed state; 1 run moved inside tasks that pass sometimes, which is noise, not a difference\./);
  // Every run of a task failing where every run passed: that is a difference, whatever the total says.
  const broke = [...runs('figma-roles', false), ...runs('new-ui-saved', true, 10)];
  assert.deepEqual(movedTasks(before, broke).moved.map((m) => `${m.task}:${m.way}:${m.from}→${m.to}`), ['figma-roles:broke:3/3→0/3']);
  assert.match(readingLine(before, broke), /went from passing every run to failing every run \(figma-roles\), 1 of them a regression that must never come back/);
  // And the other way round is worth saying too.
  assert.match(readingLine(broke, before), /went the other way \(figma-roles\)/);
  assert.equal(readingLine(before, before), 'no task changed state, and no run moved: the same result.');
});

test('a task only one side ran is named, never counted as a change', () => {
  const before = runs('old-task', true);
  const after = [...runs('old-task', true), ...runs('new-task', true)];
  const r = movedTasks(before, after);
  assert.deepEqual(r.newly, ['new-task']);
  assert.deepEqual(r.moved, []);
  assert.deepEqual(movedTasks(after, before).gone, ['new-task']);
  // Counting by task, with each task's kind kept.
  const t = byTask([...runs('a', true), ...runs('b', (i) => i < 1, 3, 'capability')]);
  assert.deepEqual([...t.values()].map((x) => `${x.task} ${x.pass}/${x.runs} ${x.kind}`), ['a 3/3 regression', 'b 1/3 capability']);
});

// And the entry a person reads: the two counts that are not failures, and the sentence that says what moved.
test('the RESULTS entry counts a fallen engine apart and says what actually changed', async () => {
  const { runStats, resultsEntry } = await import('./skill-evals/record.mjs');
  const row = (task, pass, run, extra = {}) => ({ task, run, pass, usage: { cost: 0.05, input: 120000 }, engineHash: 'abc1234', project: 'p1', ...extra });
  const beforeRows = [row('figma-roles', true, 0), row('figma-roles', true, 1), row('audit-chip', true, 0)];
  const afterRows = [row('figma-roles', false, 0, { fell: { said: 'is not defined', command: 'rms --figma-edits' } }), row('figma-roles', false, 1, { fell: { said: 'is not defined', command: 'rms --figma-edits' } }), row('audit-chip', true, 0)];
  const now = { 'claude-haiku-4-5-20251001': runStats(afterRows) }, before = { 'claude-haiku-4-5-20251001': runStats(beforeRows) };
  assert.equal(now['claude-haiku-4-5-20251001'].fell, 2);
  const entry = resultsEntry({ title: 't', what: 'something', guideSet: 'aaaaaaaaaaaa', now, before, name: 'rec' });
  assert.match(entry, /\| Runs that reached an engine that fell over \| 0 \| 2 \|/);
  assert.match(entry, /2 runs reached an engine that fell over .*this measures the engine, not the guide\. Fix it and measure again\./);
  assert.match(entry, /figma-roles/);
  // With nothing fallen, the row is not there at all: a count of zero is one more number to read past.
  const clean = resultsEntry({ title: 't', what: 'x', guideSet: 'a'.repeat(12), now: { m: runStats(beforeRows) }, before: {}, name: 'rec' });
  assert.doesNotMatch(clean, /fell over/);
});
