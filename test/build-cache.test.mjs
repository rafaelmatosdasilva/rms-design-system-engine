import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partCache, keyOf } from '../lib/build-cache.mjs';
import { tempDir } from './helpers.mjs';

// A part of the page's data is taken from the last build only when everything it reads is the same.
test('a kept part is given back for the same inputs, never for different ones', () => {
  const c = partCache(tempDir('build-cache-'));
  assert.equal(c.get('motion', { css: 'a' }), undefined, 'nothing kept yet');
  c.set('motion', { css: 'a', comps: [['chip', '.chip']] }, { motion: { durations: [1] } });
  assert.deepEqual(c.get('motion', { css: 'a', comps: [['chip', '.chip']] }), { motion: { durations: [1] } });
  assert.equal(c.get('motion', { css: 'b', comps: [['chip', '.chip']] }), undefined, 'a sheet changed');
  assert.equal(c.get('motion', { css: 'a', comps: [['chip', '.tag']] }), undefined, 'a component changed');
  assert.notEqual(keyOf({ a: 1 }), keyOf({ a: 2 }));
});
