// main-red.mjs - main's own suite failing, told apart from the red runs that mean nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ISSUE_TITLE, RED_HOURS, RED_RUNS, SUMMARY_JOB, issueBody, lines, red, stuck } from '../lib/main-red.mjs';

const wf = readFileSync(new URL('../.github/workflows/main-red.yml', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');

const NOW = new Date('2026-11-24T12:00:00Z');
// Newest first, as GitHub lists them. `ago` is hours before NOW.
const at = (ago) => new Date(NOW.getTime() - ago * 3600000).toISOString();
const ok = (ago) => ({ status: 'completed', conclusion: 'success', createdAt: at(ago), failed: [] });
const bad = (ago, failed = ['suite 4/4', SUMMARY_JOB]) => ({ status: 'completed', conclusion: 'failure', createdAt: at(ago), failed });

test('one red run never speaks, however long it has stood: one red run is usually nothing', () => {
  assert.equal(red([bad(1), ok(2), ok(3)], NOW), null);
  assert.equal(red([bad(100), ok(200)], NOW), null, 'not even after days, because nothing says it is real');
});

test('two red runs wait, then speak once nothing green has come for long enough', () => {
  const soon = [bad(1), bad(2), ok(3)];
  assert.equal(red(soon, NOW), null, 'two in a row, minutes old, is not yet a story');
  const stood = [bad(RED_HOURS), bad(RED_HOURS + 1), ok(RED_HOURS + 2)];
  assert.ok(red(stood, NOW), 'a red main stops the merges, so the runs stop coming: time has to say it too');
});

test('three red runs in a row speak at once, without waiting on the clock', () => {
  const state = red([bad(0.1), bad(0.2), bad(0.3), ok(1)], NOW);
  assert.ok(state);
  assert.equal(state.runs, RED_RUNS);
});

test('a green run ends it, and the streak is only what came after that green', () => {
  assert.equal(red([ok(0.1), bad(0.2), bad(0.3), bad(0.4)], NOW), null, 'main is green now, whatever came before');
  const state = red([bad(0.1), bad(0.2), bad(0.3), ok(0.4), bad(0.5), bad(0.6)], NOW);
  assert.equal(state.runs, 3, 'the older failures are another story, already over');
});

// Main's own history, 23-24 November 2026: four runs failed alone and were green again on the next one, and one
// breakage failed four in a row. The flakes must stay quiet and the breakage must not.
test('main\'s own history: every lone flake stays quiet, and the real breakage speaks on its third run', () => {
  const history = [ok(0), bad(0.3, ['playwright windows-latest', SUMMARY_JOB]), ok(1), ok(2),
    bad(2.5, ['playwright windows-latest', SUMMARY_JOB]), ok(3), bad(4, ['suite 4/4', SUMMARY_JOB]), ok(5)];
  for (let i = 0; i < history.length; i++) {
    const window = history.slice(i);
    if (window[0].conclusion !== 'failure') continue;
    assert.equal(red(window, new Date(Date.parse(window[0].createdAt) + 60000)), null,
      `a run that was green again next time spoke: ${window[0].createdAt}`);
  }
  // The breakage: the browsers on Windows went first, then a quarter of the suite twice.
  const broken = [bad(0.1, ['suite 4/4', SUMMARY_JOB]), bad(0.2, ['suite 4/4', SUMMARY_JOB]),
    bad(0.3, ['playwright windows-latest', SUMMARY_JOB]), ok(1)];
  const state = red(broken, NOW);
  assert.ok(state, 'four in a row is not a flake');
  assert.equal(state.runs, 3);
});

test('each job is given the number of runs it failed in, never a verdict on which is flaking', () => {
  const state = red([bad(0.1, ['suite 4/4', SUMMARY_JOB]), bad(0.2, ['suite 4/4', SUMMARY_JOB]),
    bad(0.3, ['playwright windows-latest', SUMMARY_JOB])], NOW);
  assert.deepEqual(state.jobs, [
    { name: SUMMARY_JOB, failed: 3 },
    { name: 'suite 4/4', failed: 2 },
    { name: 'playwright windows-latest', failed: 1 },
  ]);
  // A streak that opens with a flake would otherwise show the real cause as the intermittent one.
  const said = lines(state, null).join('\n');
  assert.match(said, /`suite 4\/4` in 2/);
  assert.match(said, /`playwright windows-latest` in 1/);
  assert.equal(/flaking|flake/.test(said), false, 'the counts say it without having to be right about it');
});

test('the required check is named last, because on its own it says only that something failed', () => {
  const state = red([bad(0.1), bad(0.2), bad(0.3)], NOW);
  assert.equal(state.jobs.at(-1).name, SUMMARY_JOB, 'after the jobs that actually failed');
  assert.match(lines(state, null).join('\n'), new RegExp(`\`${SUMMARY_JOB}\` in 3 — the check the ruleset requires`));
});

test('a run still going, or cancelled, neither extends a streak nor breaks one', () => {
  const going = { status: 'in_progress', conclusion: null, createdAt: at(0.1), failed: [] };
  const cancelled = { status: 'completed', conclusion: 'cancelled', createdAt: at(0.2), failed: [] };
  const state = red([going, bad(0.3), cancelled, bad(0.4), bad(0.5), ok(1)], NOW);
  assert.equal(state.runs, 3, 'the three failures are a streak; what was never decided is left out');
});

test('a run that starts and never finishes is said too, since it reports nothing at all', () => {
  const going = (ago) => ({ status: 'in_progress', conclusion: null, createdAt: at(ago), url: 'u', failed: [] });
  assert.equal(stuck([going(1), ok(2)], NOW), null, 'a run in progress is how every run begins');
  const wedged = stuck([going(RED_HOURS + 1), ok(RED_HOURS + 2)], NOW);
  assert.ok(wedged);
  assert.match(lines(null, wedged).join('\n'), /without finishing/);
  assert.equal(stuck([ok(0.1)], NOW), null, 'a finished run is not stuck');
});

test('nothing to say is said as nothing, so the issue closes instead of lingering', () => {
  assert.deepEqual(lines(null, null), []);
  assert.equal(red([], NOW), null, 'no runs at all is not a claim that main is broken');
});

test('the issue says why it is open, and that one red run would not have opened it', () => {
  const body = issueBody(lines(red([bad(0.1), bad(0.2), bad(0.3)], NOW), null), 'owner/repo');
  assert.match(body, /not opened for a single red run/);
  assert.match(body, /closes itself when a run on main goes green/);
  assert.match(body, /main-red\.yml/);
  assert.match(body, /owner\/repo/);
});

test('it is asked when the suite finishes on main, and daily, and may open an issue and nothing else', () => {
  assert.match(wf, /workflow_run:\n {4}workflows: \[Tests\]\n {4}branches: \[main\]/);
  assert.match(tests, /^name: Tests$/m, 'the name it waits on is the name that workflow has');
  assert.match(wf, /schedule:\n(?: *#.*\n)* *- cron: '\d+ \d+ \* \* \*'/, 'a red main stops the merges, so it asks daily too');
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /^permissions:\n {2}contents: read$/m, 'nothing is granted to the whole workflow');
  assert.match(wf, /permissions:\n {6}contents: read\n {6}issues: write/);
  assert.equal(wf.includes('contents: write'), false, 'it writes no code, only an issue');
  assert.match(wf, /uses: actions\/checkout@[0-9a-f]{40} #/, 'every action is pinned by digest');
  assert.match(wf, /uses: actions\/setup-node@[0-9a-f]{40} #/);
  assert.match(wf, /persist-credentials: false/);
  assert.match(wf, /run: node lib\/main-red\.mjs check/);
});

test('the thresholds are tunable, and sit where main\'s own history put them', () => {
  assert.ok(RED_RUNS >= 2 && RED_RUNS <= 5, `${RED_RUNS} runs`);
  assert.ok(RED_HOURS >= 2 && RED_HOURS <= 24, `${RED_HOURS} hours`);
  // Driven by the arguments, so the floor can be moved without touching the reasoning.
  assert.ok(red([bad(0.1), bad(0.2)], NOW, { redRuns: 2 }), 'a lower floor speaks sooner');
  assert.equal(red([bad(0.1), bad(0.2), bad(0.3)], NOW, { redRuns: 4 }), null, 'a higher one waits');
  assert.equal(ISSUE_TITLE, 'main is failing');
});
