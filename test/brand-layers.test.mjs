// How each brand is layered over the brand it extends (brand-layers.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandLayering, brandLayerLines } from '../brand-layers.mjs';

// Acme over the system's Theme, Retail over Acme: Figma's extended collections as figma-brands.mjs reads them.
const snap = { collections: [
  { name: 'Acme', parent: 'Theme', root: 'Theme', overrides: {
    'primitives/blue500': { Light: '#0055ff' },
    'tagFilter/avatar/radius/all': { Light: 40, Dark: 40 },
  } },
  { name: 'Retail Styling', parent: 'Acme', root: 'Theme', overrides: {
    'primitives/blue500': { Light: '#0055ff', Dark: '#3377ff' },   // Light is what Acme already sets
    'topBar/shadow/display': { Light: false },                 // a component's own variable: a brand may set any
  } },
] };

test('a value a brand sets as it inherits it is listed as pinned; which variables a brand sets never is', () => {
  const rows = brandLayering(snap);
  const acme = rows.find((r) => r.brand === 'Acme'), retail = rows.find((r) => r.brand === 'Retail');
  assert.deepEqual(acme.same, [], 'a brand over the system\'s own collections is not compared');
  assert.equal(retail.parent, 'Acme');
  assert.deepEqual(retail.same, [{ variable: 'primitives/blue500', mode: 'Light' }], 'only the mode it inherits as it is');
  const lines = brandLayerLines(rows);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^1 brand sets values it inherits as they are from the brand it extends, which pins them/);
  assert.match(lines[1], /^   · Retail \(over Acme\): 1 \(primitives\/blue500 Light\)$/);
  assert.doesNotMatch(lines.join('\n'), /topBar|tagFilter/, 'a component\'s own variable is the brand\'s to set');
});

test('nothing pinned, no brands: nothing to say', () => {
  assert.deepEqual(brandLayerLines(brandLayering({ collections: [snap.collections[0]] })), []);
  assert.deepEqual(brandLayerLines(brandLayering({ collections: [] })), []);
});
