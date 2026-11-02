import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempDir } from './helpers.mjs';
import { LOCK } from '../lib/auto-build.mjs';
import { roundRunning, waitForRound, ROUND_ENV } from '../lib/run-lock.mjs';

// A run started by hand waits for a round of the watch; the round's own steps, and a lock left by a process that is gone, never.
test('a run started by hand waits for a round of the watch, never for its own round or a lock nobody holds', async () => {
  const root = tempDir('run-lock-'), file = join(root, LOCK);
  mkdirSync(dirname(file), { recursive: true });
  assert.equal(roundRunning(root, { env: {} }), null, 'no lock');
  writeFileSync(file, JSON.stringify({ pid: 4242, at: '2026-11-02T03:00:00.000Z' }));
  assert.deepEqual(roundRunning(root, { env: {}, alive: () => true }), { pid: 4242, at: '2026-11-02T03:00:00.000Z' });
  assert.equal(roundRunning(root, { env: {}, alive: () => false }), null, 'the process is gone');
  assert.equal(roundRunning(root, { env: { [ROUND_ENV]: '4242' }, alive: () => true }), null, "the round's own step");
  const said = [];
  let ticks = 0;
  const w = await waitForRound(root, { env: {}, alive: () => true, log: (l) => said.push(l), pollMs: 1, sleep: async () => { if (++ticks === 3) unlinkSync(file); } });
  assert.equal(ticks, 3);
  assert.equal(w.gave, undefined);
  assert.match(said[0], /^⏳ The background watch is running a round on this project \(process 4242, since 03:00\): waiting for it to end/);
  assert.deepEqual(await waitForRound(root, { env: {} }), { waited: 0 });
});
