// Property tests: the value readers every comparison rests on, held to what must be true for any input, with
// fast-check generating the inputs (test/property.js). A failure prints the smallest input that breaks the property.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, MISSING, byte, hexColor, decimal, css } from './property.js';
import { parseColor, colorHex, sameColor, sameHex, lengthPx, timeMs, sameValue, bezierOf, sameEasing } from '../css-values.mjs';
import { hexToRgb } from '../contrast-check.mjs';
import { tokenToVar, varToToken, DEFAULT_NAMING } from '../naming-convention.mjs';

const RUNS = { numRuns: 500 };

test('a colour reader never throws, and reads any text as null or four channels in range', { skip: MISSING }, () => {
  const colourish = fc.oneof(
    fc.string(),
    fc.constantFrom('#', 'rgb(', 'hsl(', 'oklch(', 'color(srgb ').chain((p) => fc.string().map((s) => p + s + ')')),
  );
  fc.assert(fc.property(colourish, (s) => {
    const c = parseColor(s);
    if (c === null) return true;
    return c.length === 4 && c.every(Number.isFinite) && c[3] >= 0 && c[3] <= 1;
  }), RUNS);
});

test('a hex colour written any way reads back as the same canonical hex', { skip: MISSING }, () => {
  fc.assert(fc.property(hexColor(), ({ r, g, b, a, text }) => {
    const want = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('') + (a == null || a === 255 ? '' : a.toString(16).padStart(2, '0'));
    assert.equal(colorHex(text), want);
    assert.equal(sameHex(text, text.toLowerCase()), true);
  }), RUNS);
});

test('rgb() and hex say the same colour, and both readers agree on its channels', { skip: MISSING }, () => {
  fc.assert(fc.property(byte(), byte(), byte(), (r, g, b) => {
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
    assert.equal(sameColor(`rgb(${r}, ${g}, ${b})`, hex), true);
    assert.equal(sameColor(`rgb(${r} ${g} ${b} / 1)`, hex), true);
    assert.deepEqual(hexToRgb(hex), { r, g, b });
    assert.deepEqual(parseColor(hex), [r, g, b, 1]);
  }), RUNS);
});

test('a length reads the same in px, rem and inside calc()', { skip: MISSING }, () => {
  fc.assert(fc.property(decimal(0, 500), decimal(0, 500), (a, b) => {
    assert.ok(Math.abs(lengthPx(`${css(a)}px`) - a) < 1e-3);
    assert.ok(Math.abs(lengthPx(`${css(a / 16)}rem`) - a) < 1e-2);
    assert.ok(Math.abs(lengthPx(`calc(${css(a)}px + ${css(b)}px)`) - (a + b)) < 1e-3);
    assert.ok(Math.abs(lengthPx(`calc(${css(a)}px - ${css(b)}px)`) - (a - b)) < 1e-3);
  }), RUNS);
});

test('a duration reads the same in s and ms', { skip: MISSING }, () => {
  fc.assert(fc.property(decimal(0, 60), (s) => {
    assert.ok(Math.abs(timeMs(`${css(s)}s`) - timeMs(`${css(s * 1000)}ms`)) < 1e-2);
  }), RUNS);
});

test('comparing two values is reflexive and symmetric', { skip: MISSING }, () => {
  const value = fc.oneof(
    hexColor().map((h) => h.text),
    decimal(0, 200).map((n) => `${css(n)}px`),
    decimal(0, 20).map((n) => `${css(n)}rem`),
    decimal(0, 5).map((n) => `${css(n)}s`),
    fc.string(),
  );
  fc.assert(fc.property(value, value, (a, b) => {
    assert.equal(sameValue(a, a), true);
    assert.equal(sameValue(a, b), sameValue(b, a));
  }), RUNS);
});

test('an easing curve reads back its four numbers, written loosely or not', { skip: MISSING }, () => {
  fc.assert(fc.property(fc.array(decimal(-2, 2), { minLength: 4, maxLength: 4 }), (n) => {
    const tight = `cubic-bezier(${n.map(css).join(',')})`;
    const loose = `cubic-bezier( ${n.map(css).join(' , ')} )`;
    assert.deepEqual(bezierOf(tight), n.map((x) => +css(x)));
    assert.equal(sameEasing(tight, loose), true);
  }), RUNS);
});

test('a token path and its CSS variable turn back into each other', { skip: MISSING }, () => {
  const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,11}$/);
  fc.assert(fc.property(fc.array(segment, { minLength: 1, maxLength: 6 }), (segs) => {
    const path = segs.join('/');
    const v = tokenToVar(path, DEFAULT_NAMING, { raw: true });
    assert.equal(v, '--' + segs.join('-'));
    assert.equal(varToToken(v, DEFAULT_NAMING), path);
  }), RUNS);
});
