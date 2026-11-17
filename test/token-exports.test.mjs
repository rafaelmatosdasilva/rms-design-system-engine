// The same tokens in the shape a team's own pipeline reads. One dictionary, three views of it: what is tested here
// is that nothing is invented on the way, and that what cannot cross is said rather than dropped quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleDictionary, tokensStudio, studioType, leaves, withOtherModes, exportLines } from '../lib/token-exports.mjs';

const DICT = {
  $description: 'Design-system tokens (W3C DTCG). Auto-generated — do not edit by hand.',
  color: { brand: { primary: { $type: 'color', $value: '#2b5cff', $description: 'The brand blue.', $extensions: { 'rms.modes': { dark: '#88a9ff' } } },
    muted: { $type: 'color', $value: '#6b7280', $deprecated: 'Use color.brand.primary instead.' } } },
  spacing: { s: { $type: 'dimension', $value: '8px' } },
  radius: { m: { $type: 'dimension', $value: '6px' } },
  sizing: { icon: { $type: 'dimension', $value: '16px' } },
  typography: { body: { $type: 'typography', $value: { fontFamily: 'Inter', fontSize: '14px' } } },
};

test('every token is found once, and what the format owns is not one', () => {
  const found = [...leaves(DICT)].map((l) => l.path.join('.'));
  assert.deepEqual(found, ['color.brand.primary', 'color.brand.muted', 'spacing.s', 'radius.m', 'sizing.icon', 'typography.body']);
  assert.ok(!found.some((p) => p.startsWith('$')), '$description is the dictionary\'s own, never a token');
  assert.deepEqual([...leaves({})], []);
});

test('Style Dictionary: the same tree, in the words it has always used', () => {
  const sd = styleDictionary(DICT);
  assert.deepEqual(sd.color.brand.primary, { value: '#2b5cff', type: 'color', comment: 'The brand blue.' });
  assert.deepEqual(sd.spacing.s, { value: '8px', type: 'dimension' });
  assert.deepEqual(sd.color.brand.muted.deprecated, 'Use color.brand.primary instead.', 'why it went, as the dictionary says it');
  assert.equal(sd.$description, undefined, 'the dictionary\'s own description is not a token');
  assert.deepEqual(sd.typography.body.value, { fontFamily: 'Inter', fontSize: '14px' }, 'a composite crosses whole');
});

// A pipeline given `sizing` for a radius builds the wrong thing, and nothing says so: the group a dimension sits in
// is what tells them apart, and Tokens Studio has a type for each.
test('Tokens Studio: a dimension is typed by the group it sits in, never all as one', () => {
  const ts = tokensStudio(DICT);
  assert.deepEqual(ts.global.spacing.s, { value: '8px', type: 'spacing' });
  assert.deepEqual(ts.global.radius.m, { value: '6px', type: 'borderRadius' });
  assert.deepEqual(ts.global.sizing.icon, { value: '16px', type: 'sizing' });
  assert.equal(ts.global.color.brand.primary.type, 'color');
  assert.equal(ts.global.typography.body.type, 'typography');
  assert.deepEqual(ts.$metadata, { tokenSetOrder: ['global'] }, 'a set has a name, or the format reads it as having lost one');
  assert.equal(tokensStudio(DICT, { set: 'acme' }).acme.spacing.s.value, '8px');
});

test('a type the engine does not emit keeps its own word rather than a guess at theirs', () => {
  assert.equal(studioType('color'), 'color');
  assert.equal(studioType('dimension', 'spacing.s'), 'spacing');
  assert.equal(studioType('dimension', 'anything.else'), 'sizing', 'a dimension with no group that says otherwise');
  assert.equal(studioType('duration', 'motion.fast'), 'duration', 'one this does not map stays as it is');
  assert.equal(studioType(undefined, 'x'), null);
});

// Neither format has a place for a second mode. Dropping them quietly would hand a team a dark theme that is light.
test('what cannot cross is counted and said, never dropped in silence', () => {
  assert.equal(withOtherModes(DICT), 1);
  assert.equal(withOtherModes({ a: { $type: 'color', $value: '#000', $extensions: { 'rms.modes': {} } } }), 0, 'an empty one carries nothing');

  const said = exportLines({ styleDictionaryFile: 'out/style-dictionary.tokens.json', tokensStudioFile: 'out/tokens-studio.json', count: 6, modes: 1 }).join('\n');
  assert.match(said, /6 tokens for Style Dictionary → out\/style-dictionary\.tokens\.json/);
  assert.match(said, /6 tokens for Tokens Studio → out\/tokens-studio\.json/);
  assert.match(said, /1 of them have a value in another mode, which neither format carries/);
  assert.deepEqual(exportLines({}), [], 'asked for neither, it says nothing');
});
