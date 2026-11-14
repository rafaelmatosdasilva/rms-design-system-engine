// Three places where Figma and the code describe the same picture in two correct ways: a part turned (Figma's angle runs
// counter-clockwise, CSS's clockwise), an icon drawn smaller than its box (two sizes, not one), and one font face named
// differently in its file, the CSS and Figma. Each is compared as what it is, never as its two descriptions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareComponents, measuredLine } from '../lib/capture-compare.mjs';
import { faceOf, sameFace, weightOf } from '../lib/font-face.mjs';
import { fontFaces } from '../lib/figma-brands.mjs';
import { shapeExpression } from '../lib/component-capture.mjs';

const maps = () => ({ EXPLICIT: {}, EXPLICIT_SIZING: {}, SKIP_TOKENS: new Set(), NULL_TOKENS: new Set(), KNOWN_NULL: new Set(), SIZING_SKIP: new Map(), TYPO: {} });
const cfg = { figma: { namingConvention: { dropSegments: ['color', 'default'] } } };
const v = (value) => ({ value, confidence: 'verified', rule: '.cardTile' });
const said = (r) => r.differ.map((x) => `${x.component} ${x.field}: ${x.figma} / ${x.code}`).sort();

test('a turned part is compared with its sign flipped, on the circle', () => {
  const code = { components: {
    flipped: { confidence: 'high', props: {}, turns: { chevron: -90 } },        // Figma 90 counter-clockwise = CSS -90
    wrapped: { confidence: 'high', props: {}, turns: { chevron: 270 } },        // -90 and 270 are one turn
    wrong: { confidence: 'high', props: {}, turns: { chevron: 90 } },           // the same number is the other way round
    unnamed: { confidence: 'high', props: {}, turns: {} },                      // no part named for it: not compared
  } };
  const f = { turns: { chevron: 90 } };
  const r = compareComponents(code, { flipped: f, wrapped: f, wrong: f, unnamed: f }, {}, cfg, maps());
  assert.deepEqual(said(r), ['wrong turn (chevron): -90deg / 90deg']);
  assert.match(measuredLine(r.differ[0]), /rotate\(-90deg\)/, 'the line says the angle to write');
});

test('an icon is two sizes: its box and the glyph drawn inside it', () => {
  const code = { components: {
    same: { confidence: 'high', props: {}, icon: { box: [24, 24], glyph: [16, 16] } },
    stretched: { confidence: 'high', props: {}, icon: { box: [24, 24], glyph: [24, 24] } },
    small: { confidence: 'high', props: {}, icon: { box: [16, 16], glyph: [16, 16] } },
  } };
  const f = { iconSize: 24, iconGlyph: [16, 16] };
  const r = compareComponents(code, { same: f, stretched: f, small: f }, {}, cfg, maps());
  assert.deepEqual(said(r), ['small icon size: 24 / 16', 'stretched icon glyph: 16×16 / 24×24']);
});

test('a font face is one face, however its file, the CSS and Figma name it', () => {
  assert.equal(weightOf('SmBld'), 600);
  assert.equal(weightOf('Semi Bold'), 600);
  assert.equal(weightOf('700'), 700);
  assert.deepEqual(faceOf('Inter-SmBld'), { family: 'inter', weight: 600, italic: false });
  assert.deepEqual(faceOf('Inter', 'Semi Bold Italic'), { family: 'inter', weight: 600, italic: true });
  assert.deepEqual(faceOf('Gilt'), { family: 'gilt', weight: null, italic: false }, 'a weight is a whole word, never inside one');
  assert.equal(sameFace({ family: 'Inter', style: 'Semi Bold' }, { family: 'Inter-SmBld', weight: '400' }), true);
  assert.equal(sameFace({ family: 'Inter', style: 'Semi Bold' }, { family: 'Inter', weight: '600' }), true);
  assert.equal(sameFace({ family: 'Inter', style: 'Bold' }, { family: 'Inter SemiBold' }), false);
  assert.equal(sameFace({ family: 'Inter', style: 'Regular' }, { family: 'Roboto' }), false);
  const code = { components: {
    face: { confidence: 'high', instance: { hasText: true }, props: { fontFamily: v('"Inter SmBld", sans-serif'), fontWeight: v('400'), fontSize: v('14px') } },
    other: { confidence: 'high', instance: { hasText: true }, props: { fontFamily: v('Roboto'), fontWeight: v('600'), fontSize: v('14px') } },
  } };
  const text = { fontFamily: 'Inter', fontStyle: 'Semi Bold' };
  const r = compareComponents(code, { face: { text }, other: { text } }, {}, cfg, maps());
  assert.deepEqual(said(r).filter((x) => /font family/.test(x)), ['other font family: Inter Semi Bold / Roboto']);
  // Italic is read from the style when the capture keeps no flag of its own.
  const it = compareComponents({ components: { c: { confidence: 'high', instance: { hasText: true }, props: { fontStyle: v('normal') } } } }, { c: { text: { fontFamily: 'Inter', fontStyle: 'Bold Italic' } } }, {}, cfg, maps());
  assert.deepEqual(said(it), ['c italic: italic / normal']);
});

test('a font file named with a short weight word is embedded at that weight', () => {
  const faces = fontFaces('Inter', [{ name: 'Inter-SmBld.otf', data: Buffer.from('a') }, { name: 'Inter-XBold.otf', data: Buffer.from('b') }, { name: 'Inter-Bold.otf', data: Buffer.from('c') }]);
  assert.deepEqual(faces.map((x) => +/font-weight: (\d+)/.exec(x)[1]).sort(), [600, 700, 800]);
});

test('the browser reads a part\'s turn from its matrix and the icon\'s two boxes', () => {
  const expr = shapeExpression('[data-x]', [{ name: 'chevron', selector: '.chevron' }]);
  assert.doesNotThrow(() => new Function(expr), 'the expression is JavaScript the page runs');
  assert.match(expr, /Math\.atan2\(b, a\)/);
  // Its regular expressions reach the page escaped: a bare ( would read matrix(…) as a group, and every turn as nothing.
  assert.ok(expr.includes('/^matrix\\(([^)]+)\\)/') && expr.includes('[\\d.]+'), 'the escapes survive the template');
  assert.match(expr, /querySelector\('svg'\)/);
});
