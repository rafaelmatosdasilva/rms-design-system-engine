// The same tokens in the shape a team's own pipeline reads. One dictionary, several views of it: what is tested here
// is that nothing is invented on the way, and that what cannot cross is said rather than dropped quietly. Every name
// below is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleDictionary, tokensStudio, studioType, leaves, withOtherModes, exportLines, fromVariables, wordpressTheme, wordpressFiles, mergeTheme, screenModes, resolveValue, modesOf, NS } from '../lib/token-exports.mjs';

const DICT = {
  $description: 'Design-system tokens (W3C DTCG). Auto-generated — do not edit by hand.',
  color: { brand: { primary: { $type: 'color', $value: '#2b5cff', $description: 'The brand blue.', $extensions: { [NS]: { modes: { light: '#2b5cff', dark: '#88a9ff' }, figmaId: 'VariableID:1:2' } } },
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
  assert.deepEqual(ts.$metadata.tokenSetOrder[0], 'global', 'a set has a name, or the format reads it as having lost one');
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
  assert.equal(withOtherModes({ a: { $type: 'color', $value: '#000', $extensions: { [NS]: { modes: {} } } } }), 0, 'an empty one carries nothing');
  // What the engine keeps beside a token (its Figma id, the surfaces it reads on) is no mode: once it was counted as one.
  assert.equal(withOtherModes({ a: { $type: 'color', $value: '#000', $extensions: { [NS]: { figmaId: 'VariableID:9:9', readableOn: ['surface'] } } } }), 0);

  const said = exportLines({ styleDictionaryFile: 'out/style-dictionary.tokens.json', tokensStudioFile: 'out/tokens-studio.json', count: 6, modes: 1 }).join('\n');
  assert.match(said, /6 tokens for Style Dictionary → out\/style-dictionary\.tokens\.json/);
  assert.match(said, /6 tokens for Tokens Studio → out\/tokens-studio\.json, every mode a set of its own/);
  assert.match(said, /1 of them have a value in another mode, which Style Dictionary's file does not carry/);
  assert.doesNotMatch(exportLines({ tokensStudioFile: 't.json', count: 6, modes: 1 }).join('\n'), /does not carry/, 'Tokens Studio carries them');
  assert.deepEqual(exportLines({}), [], 'asked for neither, it says nothing');
});

// Tokens Studio keeps Figma's modes as sets and themes: a collection's first mode in its own set, another mode's set
// holding only what differs in it, and a theme per mode choosing them, grouped by the collection.
test('Tokens Studio: every mode crosses, as a set over the collection\'s own and a theme that chooses it', () => {
  const ts = tokensStudio(DICT);
  assert.deepEqual(ts.global.color.brand.primary, { value: '#2b5cff', type: 'color', description: 'The brand blue.' });
  assert.deepEqual(ts['global/dark'], { color: { brand: { primary: { value: '#88a9ff', type: 'color', description: 'The brand blue.' } } } }, 'only what differs in the other mode');
  assert.deepEqual(ts.$metadata.tokenSetOrder, ['global', 'global/dark']);
  assert.deepEqual(ts.$themes, [
    { id: 'global-light', name: 'light', group: 'global', selectedTokenSets: { global: 'enabled' } },
    { id: 'global-dark', name: 'dark', group: 'global', selectedTokenSets: { global: 'enabled', 'global/dark': 'enabled' } },
  ]);
  const plain = tokensStudio({ spacing: { s: { $type: 'dimension', $value: { value: 8, unit: 'px' } } } });
  assert.equal(plain.$themes, undefined, 'no modes, no themes');
  assert.deepEqual(plain.global.spacing.s, { value: '8px', type: 'spacing' });
});

// The style guide's list of Figma's variables, as styleguide-data.mjs allVariables gives it.
const VARS = [
  { figma: 'blue/500', var: '--blue-500', type: 'colour', collection: 'Primitives', modes: ['Value'], values: ['#2b5cff'] },
  { figma: 'blue/200', var: '--blue-200', type: 'colour', collection: 'Primitives', modes: ['Value'], values: ['#88a9ff'] },
  { figma: 'brand/fill', var: '--brand-fill', type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#2b5cff', '#88a9ff'], aliases: ['blue/500', 'blue/200'], description: 'The brand fill.' },
  { figma: 'surface/base', var: null, type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#ffffff', '#ffffff'] },
  { figma: 'spacing/gap/s', var: '--spacing-gap-s', type: 'spacing', collection: 'Size', modes: ['Value'], values: ['4px'] },
  { figma: 'corner/radius/m', var: '--corner-radius-m', type: 'radius', collection: 'Size', modes: ['Value'], values: ['8px'] },
  { figma: 'type/body/size', var: '--type-body-size', type: 'typography', collection: 'Size', modes: ['Phone', 'Desktop'], values: ['14px', '16px'] },
  { figma: 'type/body/weight', var: null, type: 'typography', collection: 'Size', modes: ['Value'], values: ['600'] },
  { figma: 'type/family/sans', var: null, type: 'typography', collection: 'Size', modes: ['Value'], values: ['Acme Sans'] },
  { figma: 'motion/fast/duration', var: null, type: 'motion', collection: 'Motion', modes: ['Value'], values: ['200ms'] },
  { figma: 'motion/fast/easing', var: null, type: 'motion', collection: 'Motion', modes: ['Value'], values: ['cubic-bezier(0.4, 0, 0.2, 1)'] },
  { figma: 'card/shadow/display', var: null, type: 'boolean', collection: 'Theme', modes: ['Light', 'Dark'], values: ['true', 'false'] },
  { figma: 'layer/modal', var: null, type: 'number', collection: 'Size', modes: ['Value'], values: ['40'] },
  { figma: 'blue', var: null, type: 'colour', collection: 'Other', modes: ['Value'], values: ['#0000ff'] },
];

test('the dictionary from Figma\'s variables: DTCG\'s official shapes, an alias as its reference, every mode kept', () => {
  const { tokens, dropped } = fromVariables(VARS, { name: 'Acme DS' });
  assert.match(tokens.$description, /Acme DS tokens \(W3C DTCG 2025\.10\)/);
  assert.deepEqual(tokens.blue['500'].$value, { colorSpace: 'srgb', components: [0.1686, 0.3608, 1], hex: '#2b5cff' });
  const fill = tokens.brand.fill;
  assert.equal(fill.$type, 'color');
  assert.equal(fill.$value, '{blue.500}', 'an alias is the token it points at, as DTCG writes a reference');
  assert.equal(fill.$description, 'The brand fill.');
  assert.deepEqual(fill.$extensions[NS], { collection: 'Theme', styles: 'colour', code: '--brand-fill', modes: { Light: '{blue.500}', Dark: '{blue.200}' } });
  assert.equal(modesOf(tokens.surface.base), null, 'the same value in every mode is one value');
  assert.deepEqual(tokens.spacing.gap.s.$value, { value: 4, unit: 'px' });
  assert.equal(tokens.spacing.gap.s.$type, 'dimension');
  assert.deepEqual(tokens.type.body.size.$extensions[NS].modes, { Phone: { value: 14, unit: 'px' }, Desktop: { value: 16, unit: 'px' } });
  assert.deepEqual([tokens.type.body.weight.$type, tokens.type.body.weight.$value], ['fontWeight', 600]);
  assert.deepEqual([tokens.type.family.sans.$type, tokens.type.family.sans.$value], ['fontFamily', 'Acme Sans']);
  assert.deepEqual([tokens.motion.fast.duration.$type, tokens.motion.fast.duration.$value], ['duration', { value: 200, unit: 'ms' }]);
  assert.deepEqual([tokens.motion.fast.easing.$type, tokens.motion.fast.easing.$value], ['cubicBezier', [0.4, 0, 0.2, 1]]);
  assert.equal(tokens.card.shadow.display.$type, undefined, 'DTCG has no type for a yes or no: none is guessed');
  assert.deepEqual(tokens.card.shadow.display.$extensions[NS].modes, { Light: true, Dark: false });
  assert.deepEqual([tokens.layer.modal.$type, tokens.layer.modal.$value], ['number', 40]);
  assert.deepEqual(dropped, ['blue'], 'a token where a group already is cannot be written, and is named');
  assert.equal(resolveValue(tokens, fill.$value), tokens.blue['500'].$value);
  assert.equal(resolveValue(tokens, '{blue.200}'), tokens.blue['200'].$value);
});

test('Tokens Studio from Figma\'s variables: a set per collection, a theme per mode', () => {
  const ts = tokensStudio(fromVariables(VARS).tokens);
  assert.deepEqual(ts.$metadata.tokenSetOrder, ['Primitives', 'Theme', 'Theme/Dark', 'Size', 'Size/Desktop', 'Motion']);
  assert.deepEqual(ts.Theme.brand.fill, { value: '{blue.500}', type: 'color', description: 'The brand fill.' }, 'Tokens Studio reads the reference itself');
  assert.equal(ts['Theme/Dark'].brand.fill.value, '{blue.200}');
  assert.equal(ts['Theme/Dark'].surface, undefined, 'what is the same in both modes is not repeated');
  assert.deepEqual(ts.$themes.map((t) => `${t.group}:${t.name}`), ['Theme:Light', 'Theme:Dark', 'Size:Phone', 'Size:Desktop']);
  assert.deepEqual(ts.Size.type.body.weight, { value: 600, type: 'fontWeights' });
  assert.deepEqual(ts.Size.type.family.sans, { value: 'Acme Sans', type: 'fontFamilies' });
});

// WordPress's presets are closed lists: what has no home in them goes under settings.custom, never dropped.
test('WordPress theme.json: the presets it has, the rest under custom, the code\'s names as slugs, values resolved', () => {
  const { tokens } = fromVariables(VARS);
  const { theme, modes, fluid } = wordpressTheme(tokens, { name: 'Acme DS' });
  assert.equal(theme.$schema, 'https://schemas.wp.org/trunk/theme.json');
  assert.equal(theme.version, 3);
  assert.equal(theme.title, 'Acme DS');
  const palette = theme.settings.color.palette;
  assert.deepEqual(palette.find((p) => p.slug === 'brand-fill'), { slug: 'brand-fill', color: '#2b5cff', name: 'brand fill' }, 'its reference read to the colour, the code\'s name its slug');
  assert.ok(palette.some((p) => p.slug === 'surface-base' && p.color === '#ffffff'), 'no code name: its path');
  assert.deepEqual(theme.settings.spacing.spacingSizes, [{ slug: 'spacing-gap-s', size: '4px', name: 'spacing gap s' }]);
  assert.deepEqual(theme.settings.border.radiusSizes, [{ slug: 'corner-radius-m', size: '8px', name: 'corner radius m' }], 'a radius is a preset the editor offers (WordPress 6.9)');
  assert.deepEqual(theme.settings.typography.fontFamilies, [{ slug: 'type-family-sans', fontFamily: 'Acme Sans', name: 'type family sans' }]);
  assert.equal(theme.settings.custom.corner, undefined, 'a radius is no longer under custom');
  assert.equal(theme.settings.custom.motion.fast.duration, '200ms');
  assert.equal(theme.settings.custom.type.body.weight, 600);
  assert.equal(fluid, 1);
  assert.equal(modes, 2, 'what this one file does not carry is said: the two tokens with a Dark value');
  assert.equal(theme.settings.color.defaultPalette, undefined, 'nothing the system does not say, such as turning WordPress\'s own palette off');
});

test('WordPress: a font size whose modes are screen widths is fluid, from the narrowest to the widest, and the rest say they are not', () => {
  const { tokens } = fromVariables([...VARS, { figma: 'type/caption/size', var: null, type: 'typography', collection: 'Size', modes: ['Value'], values: ['12px'] }]);
  const { theme } = wordpressTheme(tokens);
  assert.equal(theme.settings.typography.fluid, true);
  assert.deepEqual(theme.settings.typography.fontSizes, [
    { slug: 'type-body-size', size: '16px', name: 'type body size', fluid: { min: '14px', max: '16px' } },
    { slug: 'type-caption-size', size: '12px', name: 'type caption size', fluid: false },
  ], 'fluid on scales every size that does not say otherwise');
  assert.deepEqual(screenModes(tokens.type.body.size), ['Phone', 'Desktop']);
  assert.deepEqual(screenModes({ $value: 1, $extensions: { [NS]: { modes: { '1440': 2, '375': 1 } } } }), ['375', '1440'], 'pixels, narrowest first');
  assert.equal(screenModes(tokens.brand.fill), null, 'Light and Dark are looks, not screens');
});

test('WordPress: each other mode a site switches to is a style variation, holding what differs in it, whole lists', () => {
  const { tokens } = fromVariables([...VARS, { figma: 'brand/line', var: null, type: 'colour', collection: 'Brand', modes: ['Acme', 'Bolt'], values: ['#000000', '#ff0000'] }]);
  const { theme, variations, fluid, left } = wordpressFiles(tokens, { name: 'Acme DS' });
  assert.equal(theme.title, 'Acme DS');
  assert.deepEqual(variations.map((v) => [v.file, v.mode, v.theme.title]), [['styles/dark.json', 'Dark', 'Dark'], ['styles/bolt.json', 'Bolt', 'Bolt']], 'a variation per other mode, of every collection; screens are none');
  const dark = variations[0].theme;
  assert.equal(dark.version, 3);
  const palette = dark.settings.color.palette;
  assert.equal(palette.length, theme.settings.color.palette.length, 'the whole palette, since a variation\'s list replaces the theme\'s');
  assert.equal(palette.find((p) => p.slug === 'brand-fill').color, '#88a9ff', 'its reference read in that mode');
  assert.equal(palette.find((p) => p.slug === 'blue-500').color, '#2b5cff', 'a token with one value keeps it');
  assert.equal(dark.settings.spacing, undefined, 'what does not differ is not there');
  assert.deepEqual(dark.settings.custom, { card: { shadow: { display: false } } }, 'custom holds only what differs, since it is merged key by key');
  assert.equal(variations[1].theme.settings.color.palette.find((p) => p.slug === 'brand-line').color, '#ff0000');
  assert.deepEqual([fluid, left], [1, 0]);
});

test('WordPress: a theme\'s own theme.json takes the system\'s presets and keeps everything else it has', () => {
  const { theme: ours } = wordpressTheme(fromVariables(VARS).tokens);
  const theirs = {
    $schema: 'https://schemas.wp.org/trunk/theme.json', version: 3, title: 'Their theme',
    settings: { appearanceTools: true, layout: { contentSize: '720px' },
      color: { palette: [{ slug: 'brand-fill', color: '#000000', name: 'Brand' }, { slug: 'only-ours', color: '#ff00ff', name: 'Only the theme' }] },
      typography: { fontFamilies: [{ slug: 'type-family-sans', fontFamily: 'Old Sans', name: 'Sans', fontFace: [{ fontFamily: 'Acme Sans', src: ['file:./fonts/acme.woff2'] }] }], fontSizes: [{ slug: 'huge', size: '48px', name: 'Huge' }] },
      custom: { theirs: 'kept', motion: { fast: { duration: '100ms' } } } },
    styles: { color: { background: 'var(--wp--preset--color--only-ours)' } },
  };
  const before = structuredClone(theirs);
  const m = mergeTheme(theirs, ours);
  assert.deepEqual(theirs, before, 'nothing is changed in place');
  const t = m.theme;
  assert.equal(t.title, 'Their theme');
  assert.deepEqual([t.settings.appearanceTools, t.settings.layout, t.styles], [true, { contentSize: '720px' }, theirs.styles], 'what the system does not own is left as it is');
  assert.deepEqual(t.settings.color.palette[0], { slug: 'brand-fill', color: '#2b5cff', name: 'Brand' }, 'the value is the system\'s, the name the theme gave it stays');
  assert.equal(t.settings.color.palette[1].slug, 'only-ours', 'a preset only the theme has stays where it was');
  assert.deepEqual(t.settings.typography.fontFamilies[0].fontFace, theirs.settings.typography.fontFamilies[0].fontFace, 'a font\'s files are kept');
  assert.equal(t.settings.typography.fontFamilies[0].fontFamily, 'Acme Sans');
  assert.deepEqual(t.settings.typography.fontSizes.find((f) => f.slug === 'huge'), { slug: 'huge', size: '48px', name: 'Huge', fluid: false }, 'with fluid turned on, the theme\'s own size keeps its size');
  assert.equal(t.settings.typography.fluid, true);
  assert.deepEqual([t.settings.custom.theirs, t.settings.custom.motion.fast.duration], ['kept', '200ms']);
  assert.ok(m.changed.includes('palette brand-fill') && m.changed.includes('custom motion.fast.duration'));
  assert.ok(m.added.includes('radiusSizes corner-radius-m'));
  assert.deepEqual(m.onlyTheirs, ['palette only-ours', 'fontSizes huge']);
  const fresh = mergeTheme(null, { ...ours, title: 'Acme DS' });
  assert.deepEqual([fresh.theme.$schema, fresh.theme.version, fresh.theme.title], ['https://schemas.wp.org/trunk/theme.json', 3, 'Acme DS'], 'no theme.json yet: the system\'s whole');
});

test('WordPress: a key that would reach a prototype, from Figma or from the theme, is never written', () => {
  const ours = { settings: { custom: JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"x": 1}}, "ok": {"toString": "1px"}}') } };
  const theirs = JSON.parse('{"settings": {"custom": {"__proto__": {"polluted": "theirs"}}}}');
  const m = mergeTheme(theirs, ours);
  assert.equal(({}).polluted, undefined, 'Object.prototype is untouched');
  assert.equal(Object.getPrototypeOf(m.theme.settings.custom), Object.prototype, 'the custom object keeps its own prototype');
  assert.deepEqual(m.theme.settings.custom.ok, { toString: '1px' }, 'a key the prototype has is still a key of its own');
  assert.ok(m.added.includes('custom ok.toString'));
  const made = fromVariables([{ figma: '__proto__/polluted', var: null, type: 'number', collection: 'X', modes: ['Value'], values: ['1'] }, { figma: 'toString', var: null, type: 'number', collection: 'X', modes: ['Value'], values: ['2'] }]);
  assert.equal(({}).polluted, undefined, 'a Figma variable named __proto__/x reaches no prototype');
  assert.deepEqual(made.dropped, ['__proto__/polluted'], 'it is named, as every token that cannot be written is');
  assert.equal(made.tokens.toString.$value, 2, 'a name the prototype has is a token like any other');
  assert.equal(wordpressTheme(made.tokens).theme.settings.custom.toString, 2);
});

test('WordPress: a theme\'s own styles keep what the system does not write, and take what it does', () => {
  const theirs = { version: 3, styles: { color: { background: '#fff' }, elements: { button: { color: { background: '#000' }, shadow: 'none', ':hover': { color: { background: '#111' } } }, link: { typography: { textDecoration: 'none' } } } } };
  const ours = { styles: { elements: { button: { color: { background: 'var:preset|color|button-bg' }, border: { radius: 'var:preset|border-radius|radii-button' } } } } };
  const m = mergeTheme(theirs, ours);
  assert.deepEqual(m.theme.styles.elements.button, { color: { background: 'var:preset|color|button-bg' }, shadow: 'none', ':hover': { color: { background: '#111' } }, border: { radius: 'var:preset|border-radius|radii-button' } });
  assert.deepEqual([m.theme.styles.color, m.theme.styles.elements.link], [{ background: '#fff' }, { typography: { textDecoration: 'none' } }]);
  assert.deepEqual([m.changed, m.added], [['styles elements.button.color'], ['styles elements.button.border']]);
  const fresh = mergeTheme(null, { $schema: 'x', version: 3, title: 'Outline', slug: 'button-outline', blockTypes: ['core/button'], styles: { color: { text: 'red' } } });
  assert.deepEqual([fresh.theme.slug, fresh.theme.blockTypes, fresh.theme.styles], ['button-outline', ['core/button'], { color: { text: 'red' } }], 'a new block style keeps what makes it one');
});
