// the surfaces each text colour can be read on, derived from the token values in every mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableOn, ratio, pairsOf, brokenPairs, wrongPairs, pairLines } from '../token-pairs.mjs';
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
    ['text/default/color  →  var(--text-default)  #15202b', '  also readable on (4.5:1 in every mode): surface/base/color']);
});

// Readable on is the shortlist; the pair is the one the system meant. An agent given only the shortlist picks a
// different grey on every card, which is how a page ends up correct and wrong at once.
const SYSTEM = {
  light: { 'content/on-interactive/color': '#ffffff', 'surface/interactive/color': '#1a5fd0', 'content/on-warning/color': '#ffffff', 'surface/warning/color': '#f4c430', 'icon/on-interactive/color': '#ffffff', 'text/default/color': '#15202b', 'surface/base/color': '#ffffff', 'border/default/color': '#dddddd' },
  dark: { 'content/on-interactive/color': '#ffffff', 'surface/interactive/color': '#1a5fd0', 'content/on-warning/color': '#ffffff', 'surface/warning/color': '#f4c430', 'icon/on-interactive/color': '#ffffff', 'text/default/color': '#e7edf3', 'surface/base/color': '#0e141a', 'border/default/color': '#222222' },
};

test('pairsOf: the names say which surface a colour was made for, the values say what it gives', () => {
  const pairs = pairsOf(SYSTEM);
  const of = (t) => pairs.find((p) => p.text === t);
  assert.equal(of('content/on-interactive/color').surface, 'surface/interactive/color');
  assert.equal(of('content/on-interactive/color').by, 'name');
  assert.equal(of('content/on-interactive/color').ok, true);
  // An icon colour is a colour pair like any other.
  assert.equal(of('icon/on-interactive/color').icon, true);
  assert.equal(of('icon/on-interactive/color').surface, 'surface/interactive/color');
  // Named for each other and failing: kept, with its ratio, never dropped for failing.
  assert.equal(of('content/on-warning/color').ok, false);
  assert.ok(of('content/on-warning/color').ratio < 2);
  assert.deepEqual(brokenPairs(pairs).map((p) => p.text), ['content/on-warning/color']);
  // Nothing in the names, one surface it reads on: its pair by elimination, and said to be so.
  assert.equal(of('text/default/color').by, 'only');
  assert.equal(of('text/default/color').surface, 'surface/base/color');
  // A border is never a surface, and a colour with no pair is simply left out.
  assert.equal(pairs.some((p) => /border/.test(p.surface)), false);
  assert.equal(pairsOf({}).length, 0);
});

test('wrongPairs: a colour put on a surface it was not made for, whether or not it still reads', () => {
  const pairs = pairsOf(SYSTEM);
  const found = wrongPairs([
    { text: 'content/on-interactive/color', surface: 'surface/base/color', where: 'CardTile.vue:12' },
    { text: 'content/on-interactive/color', surface: 'surface/interactive/color', where: 'Button.vue:4' },
  ], pairs, SYSTEM);
  assert.equal(found.length, 1, 'the pair it was made for is no finding');
  assert.equal(found[0].meant, 'surface/interactive/color');
  assert.equal(found[0].where, 'CardTile.vue:12');
  assert.equal(found[0].readable, false, 'white on white: it does not even read');
  assert.ok(found[0].ratio < 1.1);
});

test('pairLines: the pair, its contrast, and the ones the names promise and the values break', () => {
  const lines = pairLines(pairsOf(SYSTEM)).join('\n');
  assert.match(lines, /4 colour pairs the system made/);
  assert.match(lines, /content\/on-interactive\/color on surface\/interactive\/color \(5\.85:1\)/);
  assert.match(lines, /under 4\.5:1/);
  assert.match(lines, /the only surface it reads on; the names do not say so/);
  assert.match(lines, /the names promise and the values break/);
  assert.deepEqual(pairLines([]), []);
});
