import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempDir } from './helpers.mjs';
import { LOCK } from '../lib/auto-build.mjs';
import { roundRunning, waitForRound, ROUND_ENV, ancestorsOf, roundRead } from '../lib/run-lock.mjs';

// A run started by hand waits for a round of the watch; the round's own steps, and a lock left by a process that is gone, never.
test('a run started by hand waits for a round of the watch, never for its own round or a lock nobody holds', async () => {
  const root = tempDir('run-lock-'), file = join(root, LOCK);
  mkdirSync(dirname(file), { recursive: true });
  assert.equal(roundRunning(root, { env: {} }), null, 'no lock');
  writeFileSync(file, JSON.stringify({ pid: 4242, at: '2026-11-02T03:00:00.000Z' }));
  assert.deepEqual(roundRunning(root, { env: {}, alive: () => true, ancestors: () => [7, 1] }), { pid: 4242, at: '2026-11-02T03:00:00.000Z' });
  // A step of a round an older engine started carries nothing in its environment: the round among its parents is enough.
  assert.equal(roundRunning(root, { env: {}, alive: () => true, ancestors: () => [9, 4242] }), null);
  assert.deepEqual(ancestorsOf(30, { ps: () => '  30  20\n  20  10\n  10   1\n   1   0' }), [20, 10]);
  assert.equal(roundRunning(root, { env: {}, alive: () => false }), null, 'the process is gone');
  assert.equal(roundRunning(root, { env: { [ROUND_ENV]: '4242' }, alive: () => true }), null, "the round's own step");
  const said = [];
  let ticks = 0;
  const w = await waitForRound(root, { env: {}, alive: () => true, ancestors: () => [], log: (l) => said.push(l), pollMs: 1, sleep: async () => { if (++ticks === 3) unlinkSync(file); } });
  assert.equal(ticks, 3);
  assert.equal(w.gave, undefined);
  assert.match(said[0], /^⏳ The background watch is running a round on this project \(process 4242, since 03:00\): waiting for it to end/);
  assert.deepEqual(await waitForRound(root, { env: {} }), { waited: 0 });
});

// The profile, the stores and the READMEs are read once in a watch round, by its first step; a new round reads them again.
test('a watch round reads from GitLab once: its first step marks it, the next steps skip it, the next round reads again', () => {
  const root = tempDir('round-read-'), lock = join(root, LOCK);
  mkdirSync(dirname(lock), { recursive: true });
  const env = { [ROUND_ENV]: '4242' };
  assert.equal(roundRead(root, { env: {}, fresh: true }).done, false, 'not in a round: always read');
  writeFileSync(lock, JSON.stringify({ pid: 4242, at: '2026-11-02T08:00:00.000Z' }));
  const first = roundRead(root, { env, fresh: true });
  assert.equal(first.done, false);
  first.mark();
  assert.equal(roundRead(root, { env, fresh: true }).done, true, 'a later step of the same round');
  assert.equal(roundRead(root, { env: {}, fresh: true }).done, false, 'a run by hand reads');
  writeFileSync(lock, JSON.stringify({ pid: 4242, at: '2026-11-02T09:00:00.000Z' }));
  assert.equal(roundRead(root, { env, fresh: true }).done, false, 'the next round reads again');
  // Within one process, the answer stays the one it first gave: the first step still reads what it reads later on.
  const root2 = tempDir('round-read-2-');
  mkdirSync(dirname(join(root2, LOCK)), { recursive: true });
  writeFileSync(join(root2, LOCK), JSON.stringify({ pid: 7, at: '2026-11-02T10:00:00.000Z' }));
  const env2 = { [ROUND_ENV]: '7' };
  const firstAsk = roundRead(root2, { env: env2 });
  firstAsk.mark();
  assert.equal(roundRead(root2, { env: env2 }).done, false, 'asked again in the same process: as it first answered');
});
