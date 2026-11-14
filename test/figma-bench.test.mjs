// The Figma build benchmark (test/figma-bench/): the kept requests, run again on every change to the builder or its
// guide, each scored on separate counts and held to its kept result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench, runCase, worse, COUNTS, calibration, capturesOf, systemOfCaptures, requestsOf } from './figma-bench/bench.mjs';
import { systemScript, requestScript } from './figma-bench/review-figma.mjs';
import { opsScript } from '../lib/figma-ops.mjs';

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
  const kept = [{ id: 'a', runs: 1, asked: 1, sense: 1, asks: 1, untouched: 0, system: 0, rules: 0, layout: 0, unsaid: 0 }];
  assert.deepEqual(worse([{ ...kept[0] }], kept), []);
  assert.deepEqual(worse([{ ...kept[0], asked: 0.5, layout: 1 }], kept), ['a: asked 1 → 0.5', 'a: layout 0 → 1']);
  assert.match(worse([{ id: 'b' }], kept)[0], /no kept result/);
  assert.deepEqual(calibration(join(HERE, 'no-such-folder')), { reviewed: 0, agree: 0 });
});

test('sense: a larger step that is not larger scores 0, and a boolean named for a part drives that part', async () => {
  const system = read('system.json');
  const smaller = await runCase({ id: 'xl-smaller', kind: 'change', target: 'chip', ask: 'add xl to size like l',
    answers: [{ op: 'addOption', axis: 'size', option: 'xl', like: 'l' }, { op: 'bind', layer: '', field: 'height', variable: 'spacing/s', where: { size: 'xl' } }],
    expect: { component: 'chip', bigger: { axis: 'size', option: 'xl', than: 'l' } } }, system);
  assert.equal(smaller.sense, 0, 'an xl that is not larger than l makes no sense');
  const right = await runCase(read('requests.json').requests.find((r) => r.id === 'change-option'), system);
  assert.equal(right.sense, 1);
  assert.equal(right.asks, 1, 'the builder asked what xl changes before it was answered');
  const badge = await runCase(read('requests.json').requests.find((r) => r.id === 'change-property'), system);
  assert.equal(badge.sense, 1);
});

test('own words: what the builder asks is scored, and nothing is built while a question is open', async () => {
  const system = read('system.json');
  const size = await runCase(read('requests.json').requests.find((r) => r.id === 'own-words-size'), system);
  assert.equal(size.asks, 1);
  assert.equal(size.ops, 0, 'nothing built on a guess');
  const wrong = await runCase({ id: 'x', kind: 'change', target: 'chip', ask: 'add a size xl to the chip', expect: { asks: ['what colour'] } }, system);
  assert.equal(wrong.asks, 0, 'a question it should have asked and did not');
});

test('a library of a team\'s own: its requests drawn from its components and variables, run on a stand-in of it, held to its rules', async () => {
  const captures = capturesOf(read('system.json'));
  const system = systemOfCaptures({ captures });
  assert.deepEqual(Object.keys(system.components).sort(), Object.keys(captures.skeleton).sort());
  const reqs = requestsOf(captures);
  assert.ok(reqs.some((r) => r.id === 'step-chip' && /add xl to size like l/.test(r.ask)), JSON.stringify(reqs.map((r) => r.id)));
  assert.ok(reqs.some((r) => r.id.startsWith('part-missing-') && r.expect.asks[0] === 'has no badge'));
  assert.ok(reqs.some((r) => r.id.startsWith('variable-')));
  for (const r of reqs) {
    const row = await runCase(r, system, { captures });
    assert.equal(row.runs, 1, `${r.id}: ${row.error ?? row.missing ?? ''}`);
    for (const c of COUNTS) assert.equal(typeof row[c], 'number', `${r.id} ${c}`);
  }
});

test('the review sheet\'s results are built in Figma: scripts that parse, each under the tool\'s limit, the engine\'s own script inside', async () => {
  const system = read('system.json');
  const req = read('requests.json').requests.find((r) => r.id === 'change-property');
  const row = await runCase(req, system);
  const sys = systemScript(system), one = requestScript(1, req, row.plan, opsScript(row.plan.ops, { target: '__AFTER__', nodes: {} }));
  const AsyncFn = Object.getPrototypeOf(async () => {}).constructor;
  for (const s of [sys, one]) { new AsyncFn('figma', s); assert.ok(s.length < 50000); }
  assert.match(one, /const nodes = __NODES__;\nconst changed = \[\], skipped = \[\], missing = \[\], faults = \[\];/, 'only the nodes line is replaced');
  assert.match(one, /let set = target;/);
  assert.match(one, /With ' \+ k\.split\('#'\)\[0\] \+ ' on'/, 'a new boolean is shown on, to be seen');
  assert.match(sys, /surface\|background/, 'colours by role, so what is drawn can be read');
});
