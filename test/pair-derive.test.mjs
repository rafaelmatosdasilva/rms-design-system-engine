// pair-derive.mjs - derive text/bg contrast pairs from token names (I14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveContrastPairs } from '../pair-derive.mjs';

test('pairs text with the background sharing its qualifier (state or variant)', () => {
  const pairs = deriveContrastPairs([
    'badge/label/negative/color', 'badge/background/negative/color',
    'badge/label/positive/color', 'badge/background/positive/color',
    'menuList/text/hover/color', 'menuList/background/hover/color',
  ]);
  const by = (t) => pairs.find((p) => p.text === t);
  assert.equal(by('badge/label/negative/color').bg, 'badge/background/negative/color');
  assert.equal(by('badge/label/positive/color').bg, 'badge/background/positive/color');
  assert.equal(by('menuList/text/hover/color').bg, 'menuList/background/hover/color');
});

test('falls back to the default / only background when the qualifier has no match', () => {
  const pairs = deriveContrastPairs([
    'buttonSecondary/text/color', 'buttonSecondary/background/default/color',
    'buttonPrimary/iconText/color', 'buttonPrimary/background/color',
  ]);
  assert.equal(pairs.find((p) => p.text === 'buttonSecondary/text/color').bg, 'buttonSecondary/background/default/color');
  assert.equal(pairs.find((p) => p.text === 'buttonPrimary/iconText/color').bg, 'buttonPrimary/background/color');
});

test('icon/stroke roles are non-text (large = 3:1); text/label are normal (4.5)', () => {
  const pairs = deriveContrastPairs([
    'badge/icon/neutral/color', 'badge/label/neutral/color', 'badge/background/neutral/color',
  ]);
  assert.equal(pairs.find((p) => p.text === 'badge/icon/neutral/color').large, true);
  assert.equal(pairs.find((p) => p.text === 'badge/label/neutral/color').large, false);
});

test('skips components with no background, non-color tokens, and dedupes', () => {
  const pairs = deriveContrastPairs([
    'tooltip/text/color',                 // no tooltip background -> skipped (never invent the surface)
    'panel/padding/lr',                   // not a /color token -> ignored
    'card/text/color', 'card/background/color',
    'card/text/color', 'card/background/color',   // duplicate input -> one pair
  ]);
  assert.ok(!pairs.some((p) => p.text === 'tooltip/text/color'));
  assert.equal(pairs.filter((p) => p.text === 'card/text/color').length, 1);
  assert.deepEqual(deriveContrastPairs([]), []);
});

test('drawnOn: a name-derived pair Figma never draws together is left out; what Figma draws on a token is paired', async () => {
  const { applyDrawnOn } = await import('../pair-derive.mjs');
  const derived = deriveContrastPairs(['check/text/selected/color', 'check/background/selected/color', 'chip/label/color', 'chip/background/color']);
  const structure = {
    checkBox: { drawnOn: [{ fg: 'check/text/selected/color', on: 'surface', icon: false }], fills: ['check/background/selected/color'] },   // beside its own box
    chip: { drawnOn: [{ fg: 'chip/label/color', on: 'surface', icon: false }] },     // its background is a parent's: kept
    toast: { drawnOn: [{ fg: 'toast/title/color', on: 'toast/fill/color', icon: false }, { fg: 'toast/icon/color', on: 'toast/fill/color', icon: true }] },
  };
  const r = applyDrawnOn(derived, structure);
  assert.deepEqual(r.apart.map((p) => p.text), ['check/text/selected/color']);
  assert.deepEqual(r.pairs.map((p) => [p.text, p.bg, p.large]), [
    ['chip/label/color', 'chip/background/color', false],
    ['toast/title/color', 'toast/fill/color', false],
    ['toast/icon/color', 'toast/fill/color', true],
  ]);
  assert.equal(r.added, 2);
  assert.deepEqual(applyDrawnOn(derived, {}).pairs, derived);              // no drawnOn: the names alone
});
