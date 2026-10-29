// A Figma capture read in several answers (capture-chunks.mjs), each holding what fits, joined in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { effectsCaptureScript } from '../effects-parity.mjs';
import { motionCaptureScript } from '../motion-parity.mjs';
import { startChunks, joinChunk, mergeCapture } from '../capture-chunks.mjs';
import { tempDir } from './helpers.mjs';

// A Figma of two pages of invented components, each with a shadow, one with a transition between its variants.
function fakeFigma() {
  const shadow = (i) => [{ type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: i }, radius: 4, spread: 0 }];
  const variant = (id, name, props, reactions = []) => ({ id, type: 'COMPONENT', name, variantProperties: props, effects: shadow(1), fills: [], children: [], reactions });
  const page = (p, n) => {
    const sets = [], solo = [];
    for (let i = 0; i < n; i++) {
      const a = variant(`${p}:${i}:a`, 'state=rest', { state: 'rest' }, [{ trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', destinationId: `${p}:${i}:b`, transition: { type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } } }] }]);
      const b = variant(`${p}:${i}:b`, 'state=hover', { state: 'hover' });
      const set = { type: 'COMPONENT_SET', name: `tile${p}x${i}`, children: [a, b] };
      a.parent = set; b.parent = set; sets.push(set);
      solo.push({ type: 'COMPONENT', name: `mark${p}x${i}`, effects: shadow(i + 2), fills: [], children: [], parent: null });
    }
    return { loadAsync: async () => {}, findAllWithCriteria: ({ types }) => (types[0] === 'COMPONENT_SET' ? sets : [...sets.flatMap((s) => s.children), ...solo]), findAll: () => [] };
  };
  return { root: { children: [page(0, 12), page(1, 9)] }, variables: { getVariableByIdAsync: async () => null }, getStyleByIdAsync: async () => null, getNodeByIdAsync: async () => null };
}
const run = (script, figma) => new Function('figma', `return (async () => {\n${script}\n})()`)(figma);

for (const [kind, script] of [['effects', effectsCaptureScript], ['motion', (ids, o) => motionCaptureScript(ids, o)]]) {
  test(`${kind}: read in answers that each fit, joined in order, the same as one answer`, async () => {
    const figma = fakeFigma(), dir = tempDir(`chunks-${kind}-`);
    const whole = await run(script(null, { budget: 1e9 }), figma);
    assert.equal(whole.next, null, 'all of it fits in one answer when the budget allows');
    startChunks(dir, kind);
    let start, answers = 0, j;
    do {
      const a = await run(script(null, { start, budget: 1500 }), figma);
      assert.ok(JSON.stringify(a.components).length < 1500 * 2, 'each answer stays near its budget');
      j = joinChunk(dir, kind, JSON.stringify(a), mergeCapture);
      assert.ok(!j.error, j.error);
      start = j.next; answers++;
    } while (!j.done);
    assert.ok(answers > 2, `read in ${answers} answers`);
    assert.deepEqual(Object.keys(j.body.components).sort(), Object.keys(whole.components).sort());
    if (kind === 'motion') assert.deepEqual(j.body.components.tile1x8, JSON.parse(JSON.stringify(whole.components.tile1x8)), 'as saved');
    assert.ok(!existsSync(join(dir, `${kind}-partial.json`)), 'nothing left once all are joined');
  });
}

test('an answer that does not start where the last one stopped is refused; one from a whole-file script is taken whole', async () => {
  const figma = fakeFigma(), dir = tempDir('chunks-order-');
  startChunks(dir, 'effects');
  const first = await run(effectsCaptureScript(null, { budget: 800 }), figma);
  assert.ok(first.next);
  assert.equal(joinChunk(dir, 'effects', JSON.stringify(first), mergeCapture).done, false);
  const again = joinChunk(dir, 'effects', JSON.stringify(first), mergeCapture);
  assert.match(again.error, /starts at page 1, item 1, but the next to join starts at page 1, item \d+/);
  const old = joinChunk(dir, 'effects', JSON.stringify({ components: { a: {} } }), mergeCapture);
  assert.deepEqual(old, { done: true, body: { components: { a: {} } } });
  assert.match(joinChunk(dir, 'effects', '{"x":1}', mergeCapture).error, /no "components"/);
});

test('two answers joined: entries kept, lists of the same component joined, an overlay once', () => {
  const o = { component: 'sheet', transition: { type: 'MOVE_IN' } };
  assert.deepEqual(mergeCapture({ components: { a: [1] }, motion: { a: [{ k: 1 }] }, overlays: [o] }, { components: { a: [2], b: [3] }, motion: {}, overlays: [o], next: null }),
    { components: { a: [1, 2], b: [3] }, motion: { a: [{ k: 1 }] }, overlays: [o], next: null });
});
