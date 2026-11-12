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

test('a part whose class says nothing of its name pairs by its layer\'s node id, or by the component it is', async () => {
  const { pairedHow, partFacts } = await import('../lib/part-pairing.mjs');
  const markup = '<div class="card"><h3 class="ttl" data-figma-node="12:34">Hi</h3><span class="icon"></span><span class="tag"></span><span class="tag"></span></div>';
  const classFor = (n) => `.${n.toLowerCase()}`;
  assert.deepEqual(pairedHow(['Heading', 'Lead', 'Chips'], markup, { ids: { Heading: '12:34' }, instances: { Lead: 'Icon', Chips: 'Tag' }, classFor }), {
    Heading: { selector: '[data-figma-node="12:34"]', by: 'id' },
    Lead: { selector: '.icon', by: 'component' },
  }, 'a component whose class the file puts on two elements is not paired');
  // Two parts that are the same component: neither, never a guess between two.
  assert.deepEqual(pairedHow(['Lead', 'Trail'], markup, { instances: { Lead: 'Icon', Trail: 'Icon' }, classFor }), {});
  // The name still wins: a class that is the part's name is the part's, whatever else the file says.
  assert.equal(pairedHow(['Label'], '<b class="label" data-figma-node="1:1"></b>', { ids: { Label: '1:1' } }).Label.by, 'name');
});

test('what Figma says of each part: its node id, the component an instance is, the one text style it is set in', async () => {
  const { partFacts } = await import('../lib/part-pairing.mjs');
  const entry = { trees: [
    { c: [{ t: 'TEXT', n: 'Label', id: '1:1', styles: { text: 'label/strong' } }, { t: 'INSTANCE', n: 'Lead', id: '1:2', of: { name: 'Icon' } }, { t: 'FRAME', n: 'Body', id: '1:3', c: [{ t: 'TEXT', n: 'A', styles: { text: 'caption/regular' } }, { t: 'TEXT', n: 'B', styles: { text: 'caption/regular' } }] }] },
    { c: [{ t: 'TEXT', n: 'Label', id: '1:1', styles: { text: 'label/large' } }] },
  ] };
  const f = partFacts(entry);
  assert.deepEqual(f.instances, { Lead: 'Icon' });
  assert.equal(f.ids.Label, '1:1');
  assert.equal(f.styles.Body, 'caption/regular', 'a frame whose texts share one style is set in it');
  assert.ok(!('Label' in f.styles), 'a part set in two styles across its variants is set in none');
});
