// A suite run that failed only because a job never got a machine is run again once (unstarted.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unstartedOnly, run } from '../lib/unstarted.mjs';

const job = (name, conclusion, steps = 3) => ({ name, conclusion, steps: Array.from({ length: steps }, (_, i) => ({ number: i + 1 })) });
// The run of 24 November 2026: every quarter and two Playwright jobs passed, the macOS one never started.
const NO_MACHINE = [job('suite 1/4', 'success'), job('suite 2/4', 'success'), job('playwright ubuntu-latest', 'success'),
  job('playwright macos-latest', 'cancelled', 0), job('test', 'failure'), job('badge', 'skipped', 0)];

test('a run red only for a job that never got a machine is run again', () => {
  assert.deepEqual(unstartedOnly(NO_MACHINE), { rerun: true, unstarted: ['playwright macos-latest'], failed: [] });
});

test('a job that ran and failed is a result: never run again, even beside one that never started', () => {
  const v = unstartedOnly([...NO_MACHINE, job('suite 3/4', 'failure')]);
  assert.equal(v.rerun, false);
  assert.deepEqual(v.failed, ['suite 3/4']);
  assert.equal(unstartedOnly([job('playwright windows-latest', 'cancelled', 5), job('test', 'failure')]).rerun, false, 'cancelled after it started is not a missing machine');
  assert.equal(unstartedOnly([job('suite 1/4', 'success'), job('test', 'success')]).rerun, false, 'a green run has nothing to run');
});

test('once only: on its second attempt a run that still got no machine stays red', () => {
  const asked = [];
  assert.equal(run(1, 1, { jobs: NO_MACHINE, rerun: (id) => asked.push(id) }).ran, true);
  assert.equal(run(1, 2, { jobs: NO_MACHINE, rerun: (id) => asked.push(id) }).ran, false);
  assert.deepEqual(asked, [1]);
});

test('the workflow runs it after the suite fails, on the first attempt only, with the right to run jobs again', () => {
  const wf = readFileSync(new URL('../.github/workflows/rerun-unstarted.yml', import.meta.url), 'utf8');
  assert.match(wf, /workflows: \[Tests\]/);
  assert.match(wf, /conclusion == 'failure' && github\.event\.workflow_run\.run_attempt == 1/);
  assert.match(wf, /actions: write/);
  assert.match(wf, /node lib\/unstarted\.mjs/);
});
