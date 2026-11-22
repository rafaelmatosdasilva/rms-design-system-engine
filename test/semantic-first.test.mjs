// The token named for a value written by hand is the semantic one before a primitive, in the edit check, the census and
// the fixes alike (token-match.mjs semanticFirst).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanticFirst } from '../lib/token-match.mjs';
import { themeSizes } from '../lib/edit-check.mjs';
import { censusTokens, censusText } from '../lib/raw-census.mjs';

test('a semantic token before a primitive, each kind in the theme\'s own order', () => {
  assert.deepEqual(semanticFirst(['--blue-500', '--action-bg', '--link-color', '--palette-blue']), ['--action-bg', '--link-color', '--blue-500', '--palette-blue']);
});

test('the census and the edit check\'s sizes name the semantic token first', () => {
  const theme = ':root { --blue-500: #3366ff; --action-bg: #3366ff; --space-4: 16px; --gap-card: 16px; }';
  const tokens = censusTokens(theme);
  assert.deepEqual(tokens.colours.get('#3366ff'), ['--action-bg', '--blue-500']);
  const f = censusText('.card { color: #3366ff; }', tokens);
  assert.match(f[0].text, /use var\(--action-bg\) \(or var\(--blue-500\)\)/);
  assert.deepEqual(themeSizes(theme).spacing.get(16), ['--gap-card', '--space-4']);
});
