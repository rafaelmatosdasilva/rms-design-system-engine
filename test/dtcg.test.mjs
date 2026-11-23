import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DTCG_VERSION, colorValue, dimensionValue, typographyValue, tokenText } from '../lib/dtcg.mjs';
import { styleDictionary } from '../lib/token-exports.mjs';

test('the official version, 2025.10, is the one written', () => {
  assert.equal(DTCG_VERSION, '2025.10');
});

test('a colour is its colour space, components and hex fallback, with an alpha when it is see-through', () => {
  assert.deepEqual(colorValue('#0a84ff'), { colorSpace: 'srgb', components: [0.0392, 0.5176, 1], hex: '#0a84ff' });
  assert.deepEqual(colorValue('#fff'), { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' });
  assert.deepEqual(colorValue('#00000080'), { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.502, hex: '#000000' });
  assert.deepEqual(colorValue('rgba(255, 0, 0, 0.5)'), { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5, hex: '#ff0000' });
  assert.deepEqual(colorValue('transparent'), { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#000000' });
  // A reference stays a reference, and what CSS spells another way is kept as written rather than guessed.
  assert.equal(colorValue('{color.blue}'), '{color.blue}');
  assert.equal(colorValue('color-mix(in srgb, red, blue)'), 'color-mix(in srgb, red, blue)');
});

test('a dimension is a number and px or rem, and a unit DTCG has no place for is kept as written', () => {
  assert.deepEqual(dimensionValue('24px'), { value: 24, unit: 'px' });
  assert.deepEqual(dimensionValue('1.5rem'), { value: 1.5, unit: 'rem' });
  assert.deepEqual(dimensionValue('0'), { value: 0, unit: 'px' });
  assert.deepEqual(dimensionValue(8), { value: 8, unit: 'px' });
  assert.equal(dimensionValue('50%'), '50%');
});

test('a line height in px is a multiple of the font size, as 2025.10 reads it, and the weight a number', () => {
  assert.deepEqual(typographyValue({ size: '16px', weight: '600', lh: '24px' }), { fontSize: { value: 16, unit: 'px' }, fontWeight: 600, lineHeight: 1.5 });
  assert.deepEqual(typographyValue({ size: '1rem', weight: 400, lh: '24px' }).lineHeight, { value: 24, unit: 'px' }, 'nothing to divide by: kept as given');
});

test('whatever the engine shows reads the value back as CSS writes it', () => {
  assert.equal(tokenText(colorValue('#0a84ff')), '#0a84ff');
  assert.equal(tokenText(colorValue('#00000080')), '#00000080');
  assert.equal(tokenText(dimensionValue('24px')), '24px');
  assert.deepEqual(tokenText(typographyValue({ size: '16px', weight: '600', lh: '24px' })), { fontSize: '16px', fontWeight: 600, lineHeight: 1.5 });
  assert.equal(tokenText('#abc'), '#abc');
  assert.equal(tokenText({ colorSpace: 'oklch', components: [0.7, 0.1, 200] }), 'color(oklch 0.7 0.1 200)');
  // Another tool's export carries the text its format has always held.
  assert.deepEqual(styleDictionary({ radii: { button: { $type: 'dimension', $value: { value: 24, unit: 'px' } } } }), { radii: { button: { value: '24px', type: 'dimension' } } });
});
