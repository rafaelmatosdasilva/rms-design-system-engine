// The Figma build benchmark (test/figma-bench/): the kept requests, run again on every change to the builder or its
// guide, each scored on separate counts and held to its kept result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench, runCase, worse, COUNTS, calibration } from './figma-bench/bench.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), 'figma-bench');
const read = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));

test('no kept request scores worse than its kept result, on any count', async () => {
  const rows = await runBench();
  assert.deepEqual(worse(rows, read('results.json').results), []);
  // Every request is kept, and every kept result is a request's.
  assert.deepEqual(rows.map((r) => r.id).sort(), read('results.json').results.map((r) => r.id).sort());
  for (const r of rows) for (const c of COUNTS) assert.equal(typeof r[c], 'number', `${r.id} ${c}`);
});

test('the counts move when the result does: what was not built, and a layout fault the script says', async () => {
  const system = read('system.json');
  const req = read('requests.json').requests.find((r) => r.id === 'copy');
  // Asked for what it does not build: asked drops.
  assert.equal((await runCase({ ...req, expect: { ...req.expect, variants: 5 } }, system)).asked < 1, true);
  // A layer beyond a box of a fixed size: a layout fault, said by the script.
  const box = await runCase(read('requests.json').requests.find((r) => r.id === 'change-layer-in-a-fixed-box'), system);
  assert.equal(box.layout, 1);
  assert.equal(box.said, 1);
  assert.equal(box.unsaid, 0);
});

test('worse is any count gone the wrong way; a person\'s review is read back from its sheets', () => {
  const kept = [{ id: 'a', runs: 1, asked: 1, untouched: 0, system: 0, layout: 0, unsaid: 0 }];
  assert.deepEqual(worse([{ ...kept[0] }], kept), []);
  assert.deepEqual(worse([{ ...kept[0], asked: 0.5, layout: 1 }], kept), ['a: asked 1 → 0.5', 'a: layout 0 → 1']);
  assert.match(worse([{ id: 'b' }], kept)[0], /no kept result/);
  assert.deepEqual(calibration(join(HERE, 'no-such-folder')), { reviewed: 0, agree: 0 });
});
