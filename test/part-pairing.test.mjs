// Each named part of a Figma component paired with the class that draws it (part-pairing.mjs), and written into the
// contract's anatomy where the structure contract gives no selector (contract-gen.mjs buildAnatomy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerNames, pairParts } from '../lib/part-pairing.mjs';

const MARKUP = '<template><button class="btn"><span class="btn__icon-leading"/><span class="btn__label">Go</span><i class="badge badge-count"/><span class="icon"/><span class="side-icon"/></button></template>';

test('a part is paired with the one class its name is, or the one that ends in it', () => {
  assert.deepEqual(pairParts(['Label', 'Icon leading', 'Badge', 'Container'], MARKUP), { Label: '.btn__label', 'Icon leading': '.btn__icon-leading', Badge: '.badge' });
  // Two classes end in "icon" (side-icon) but one is it exactly: that one.
  assert.deepEqual(pairParts(['Icon'], MARKUP), { Icon: '.icon' });
  // Two that end in it and none that is it: no pairing, never a guess between two.
  assert.deepEqual(pairParts(['Icon'], '<div class="a-icon"><i class="b-icon"/></div>'), {});
  assert.deepEqual(pairParts(['Label'], ''), {});
});

test('the part names are the layers a person named, never Figma\'s own (Frame 235)', () => {
  const entry = { trees: [{ c: [{ t: 'FRAME', n: 'Content', c: [{ t: 'TEXT', n: 'Label' }, { t: 'FRAME', n: 'Frame 235' }] }, { t: 'INSTANCE', n: 'Icon', c: [{ t: 'VECTOR', n: 'Inner' }] }] }] };
  assert.deepEqual(layerNames(entry).sort(), ['Content', 'Icon', 'Label'], 'an instance is a part, never opened');
});
