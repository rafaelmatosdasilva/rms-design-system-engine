// I14: the surfaces each text colour can be read on, derived from the token values in every mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableOn, ratio } from '../token-pairs.mjs';
import { flattenTokens, answer, answerLines } from '../query.mjs';

test('a text colour is readable on a surface only when it meets 4.5:1 in every mode', () => {
  const colors = {
    light: { 'text/default/color': '#15202b', 'text/muted/color': '#9aa3ad', 'surface/base/color': '#ffffff', 'surface/raised/color': '#0e141a', 'border/default/color': '#ffffff', 'overlay/color': '#00000080' },
    dark: { 'text/default/color': '#e7edf3', 'text/muted/color': '#5b6470', 'surface/base/color': '#0e141a', 'surface/raised/color': '#0e141a', 'border/default/color': '#0e141a', 'overlay/color': '#00000080' },
  };
  assert.deepEqual(readableOn(colors), { 'text/default/color': ['surface/base/color'] });   // raised fails in light; muted fails both; a border is no surface; see-through is left out
  assert.ok(Math.abs(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 1e-9);
});

test('the tokens file carries the list, and --query shows it', () => {
  const tokens = flattenTokens({ text: { default: { color: { $type: 'color', $value: '#15202b', $extensions: { 'com.rms.design-system-engine': { readableOn: ['surface/base/color'] } } } } } });
  assert.deepEqual(answerLines(answer('text/default', { tokens, varOf: () => '--text-default' })),
    ['text/default/color  →  var(--text-default)  #15202b', '  readable on (4.5:1 in every mode): surface/base/color']);
});
