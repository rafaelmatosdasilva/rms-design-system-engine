import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { join } from 'node:path';
import * as timing from '../lib/timing.mjs';

// A slow run says where its time went: its phases, each gate script, kept beside the last run's.
test('a run\'s phases and scripts are timed, written beside the last run\'s, and printed slowest first', async () => {
  timing.mark('first');
  await timing.span('waited', () => new Promise((r) => setTimeout(r, 30)));
  timing.script('slow-check.mjs', 5000);
  timing.script('fast-check.mjs', 20);
  const t = timing.timings();
  assert.deepEqual(t.steps.map((s) => s.name), ['first', 'waited']);
  assert.ok(t.steps[1].ms >= 25);
  const root = tempDir('timing-');
  timing.writeTiming(root, 'out', 'audit');
  timing.writeTiming(root, 'out', 'audit');
  const saved = JSON.parse(readFileSync(join(root, 'out', 'timing.json'), 'utf8'));
  assert.ok(saved.audit.now && saved.audit.before, 'the last run is kept beside this one');
  const lines = timing.timingLines(t);
  assert.match(lines[0], /^⏱ {2}\S+ in all\.$/);
  assert.match(lines[2], /slow-check 5\.0s · fast-check 20ms/);
});
