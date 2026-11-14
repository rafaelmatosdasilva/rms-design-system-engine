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

test('never a fault: a layer placed outside on purpose, a group\'s layers, a cover image a frame crops', () => {
  const one = (c, looks, clip = false) => layoutFaults({ variants: [['state=default', 0]], trees: [{ t: 'COMPONENT', n: 'acmeTab', clip, c }], looks: { 'state=default': looks } });
  // A tooltip placed by hand beside a tab that does not clip: where it was put on purpose.
  assert.deepEqual(one([{ t: 'INSTANCE', n: 'tooltip', absolute: true }], { '': { box: [56, 56] }, 0: { at: [56, 8, 43, 40] } }), []);
  // The same, cut off by a frame that clips: a fault however it was placed.
  assert.equal(one([{ t: 'INSTANCE', n: 'tooltip', absolute: true }], { '': { box: [56, 56] }, 0: { at: [56, 8, 43, 40] } }, true)[0].kind, 'clipped');
  // A group is as large as what it holds, its layers placed by its parent: nothing is beyond it.
  assert.deepEqual(layoutFaults({ variants: [['x', 0]], trees: [{ t: 'COMPONENT', n: 'crumbs', c: [{ t: 'GROUP', n: 'level2', c: [{ t: 'INSTANCE', n: 'Divider' }] }] }], looks: { x: { 0: { box: [52, 16] }, '0.0': { at: [91, 0, 16, 16] } } } }), []);
  // An image larger than its frame on every side, the frame clipping it: a cover, cropped on purpose.
  assert.deepEqual(one([{ t: 'INSTANCE', n: 'Cover' }], { '': { box: [480, 225] }, 0: { at: [-38, -2, 544, 229] } }, true), []);
  assert.deepEqual(one([{ t: 'FRAME', n: 'Photo', img: true }], { '': { box: [100, 100] }, 0: { at: [20, -10, 60, 40] } }, true), [], 'an image a frame crops');
});
