// What a component's boxes say in Figma (layout-faults.mjs): text over text or an icon, a part cut off by a frame that
// clips, a part outside its parent, each named with its layer and variant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFaults, layoutRules, faultLine } from '../lib/layout-faults.mjs';
import { grammarOf } from '../lib/construction-grammar.mjs';
import { captureWaits } from '../lib/capture-waits.mjs';

const entry = (looks, clip = false) => ({
  variants: [['size=s', 0]],
  trees: [{ t: 'COMPONENT', n: 'acmeChip', clip, c: [{ t: 'INSTANCE', n: 'Icon' }, { t: 'TEXT', n: 'Label' }, { t: 'VECTOR', n: 'Swirl' }, { t: 'TEXT', n: 'Hint', hidden: true }] }],
  looks: { 'size=s': looks },
});
const fine = { '': { box: [120, 32] }, 0: { at: [8, 8, 16, 16] }, 1: { at: [28, 8, 80, 16] }, 2: { at: [-40, -40, 400, 400] }, 3: { at: [0, 0, 300, 300] } };

test('a component whose parts fit their box and keep apart has no fault, whatever its artwork and hidden layers do', () => {
  assert.deepEqual(layoutFaults(entry(fine)), []);
});

test('text over an icon, a part cut off by a frame that clips, a part outside a frame that does not', () => {
  const over = layoutFaults(entry({ ...fine, 1: { at: [20, 8, 80, 16] } }));
  assert.deepEqual(over.map(faultLine), ['Label overlaps Icon by 4px (size=s)']);
  const cut = layoutFaults(entry({ ...fine, 1: { at: [28, 8, 100, 16] } }, true));
  assert.deepEqual(cut.map(faultLine), ['Label is cut off by 8px (size=s)']);
  const out = layoutFaults(entry({ ...fine, 1: { at: [28, 8, 100, 16] } }, false));
  assert.deepEqual(out.map(faultLine), ['Label sits 8px outside its parent (size=s)']);
});

test('a rule of the grammar, always to fix, said only once the capture keeps boxes', () => {
  const ok = (n) => entry(fine);
  const skeleton = { a: ok(), b: ok(), c: ok(), d: entry({ ...fine, 1: { at: [20, 8, 80, 16] } }), _keeps: ['binds', 'looks', 'exposed', 'notes', 'boxes'] };
  const r = grammarOf({ skeleton }).figma.rules.find((x) => x.id === 'layout-faults');
  assert.equal(r.status, 'fix');
  assert.deepEqual(r.toFix.map((t) => [t.component, t.value]), [['d', 'Label overlaps Icon by 4px (size=s)']]);
  const half = { a: ok(), b: entry({ ...fine, 1: { at: [20, 8, 80, 16] } }), c: entry({ ...fine, 1: { at: [20, 8, 80, 16] } }) };
  assert.equal(grammarOf({ skeleton: half }).figma.rules.find((x) => x.id === 'layout-faults').status, 'fix', 'a fault is never a question for the team');
  // A capture with no boxes: the rule waits for a fresh read, and says so.
  assert.deepEqual(layoutRules({ skeleton: { a: { variants: [['x', 0]], trees: [{ c: [] }] } } }), []);
  assert.ok(captureWaits({ a: { trees: [{}] }, _keeps: ['binds', 'looks', 'exposed', 'notes'] }).some((w) => w.rules.includes('layout-faults')));
});
