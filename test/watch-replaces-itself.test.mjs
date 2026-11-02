// A watch that has taken a new engine replaces itself, and never waits for the one it started.
//
// It used to start the new watch with spawnSync and wait for it to finish. A watch never finishes, so the old
// process waited for ever, holding its memory, with the new one running inside it. Every engine update added
// another layer.
//
// Found on a real computer: 69 of them, 66 with a watch for a parent, the oldest alive for twelve hours, all but
// the newest doing nothing. The browser tests that kept failing on a full run and passing alone were being
// starved by them - which is a day of blaming the tests for a bug in the watch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { replaceWatch } from '../lib/watch.mjs';

const harness = (ppid) => {
  const spawned = [], exits = [], logs = [];
  const spawn = (cmd, args, opts) => { spawned.push({ cmd, args, opts }); return { unref: () => {} }; };
  replaceWatch({ argv: ['--watch', '5'], engineDir: '/engine', cwd: '/project', spawn, exit: (c) => exits.push(c), log: (l) => logs.push(l), ppid, execPath: '/node', join });
  return { spawned, exits, logs };
};

test('supervised by a service: it exits, and starts nothing', () => {
  // launchd with KeepAlive (and systemd the same) starts a fresh watch on the new code the moment this one ends.
  // Starting one here as well would leave ours running beside the service's - nesting turned into doubling, which
  // is worse, and is what a careless fix for this would do.
  const { spawned, exits } = harness(1);
  assert.deepEqual(spawned, [], 'a supervised watch started another one');
  assert.deepEqual(exits, [0]);
});

test('run by hand: it hands over to the new one, detached, and goes', () => {
  const { spawned, exits } = harness(4242);
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].args, ['/engine/audit.mjs', '--watch', '5'], 'the new watch runs the same command on the new engine');
  assert.equal(spawned[0].opts.cwd, '/project');
  assert.equal(spawned[0].opts.stdio, 'inherit', 'the new watch takes the terminal');
  assert.equal(spawned[0].opts.detached, true, 'detached, or it dies with the process that is about to exit');
  assert.deepEqual(exits, [0], 'and this one goes, rather than waiting for a process that never ends');
});

test('whichever way, this process always ends: that is the whole point', () => {
  for (const ppid of [1, 2, 99999]) assert.deepEqual(harness(ppid).exits, [0], `a watch with parent ${ppid} stayed alive`);
});
