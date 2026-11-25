// The contracts as what a WordPress theme.json can say of them: WordPress's own button, link and headings styled with the
// system's tokens, each other look a style of the Button block, and what has no place said with why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordpressComponents, placeOf } from '../lib/contract-wordpress.mjs';

const variant = (name, options, def) => ({ name, type: 'enum', default: def, options, bindings: { figma: { kind: 'VARIANT', property: name, options } } });
const BUTTON = {
  name: 'button', semantics: { element: 'button' },
  props: [variant('Variant', ['Primary', 'Outline'], 'Primary'), variant('State', ['Default', 'Hover', 'Pressed', 'Disabled'], 'Default')],
  anatomy: { root: { inset: { blockToken: '{padding.xs}', inlineToken: '{padding.m}' }, radiusToken: '{radii.button}', typographyToken: '{typography.m}', height: 32 } },
  tokens: { byVariant: [
    { when: { Variant: 'Primary', State: 'Default' }, paints: [{ token: 'button/bg', field: 'fills' }, { token: 'button/text', field: 'fills', text: true }] },
    { when: { Variant: 'Primary', State: 'Hover' }, paints: [{ token: 'button/bg-hover', field: 'fills' }, { token: 'button/text', field: 'fills', text: true }] },
    { when: { Variant: 'Primary', State: 'Pressed' }, paints: [{ token: 'button/bg-pressed', field: 'fills' }, { token: 'button/text', field: 'fills', text: true }] },
    { when: { Variant: 'Outline', State: 'Default' }, paints: [{ token: 'surface/base', field: 'fills' }, { token: 'button/bg', field: 'strokes' }, { token: 'button/bg', field: 'fills', text: true }] },
  ] },
};
const REFS = { 'padding.xs': 'var:preset|spacing|padding-xs', 'padding.m': 'var:preset|spacing|padding-m', 'radii.button': 'var:preset|border-radius|radii-button',
  'button.bg': 'var:preset|color|button-bg', 'button.bg-hover': 'var:preset|color|button-bg-hover', 'button.bg-pressed': 'var:preset|color|button-bg-pressed',
  'button.text': 'var:preset|color|button-text', 'surface.base': 'var:preset|color|surface-base', 'link.text': 'var:preset|color|link-text' };
const VALUES = { 'typography.m': { fontFamily: 'Acme Sans', fontSize: '14px', fontWeight: 500, lineHeight: 1.43 }, 'heading.size': '28px' };
const dotted = (t) => String(t).replace(/^\{|\}$/g, '').split('/').join('.');
const opts = { refOf: (t) => REFS[dotted(t)] ?? null, valueOf: (t) => VALUES[dotted(t)] ?? null };

test('where WordPress keeps a component: by the element its contract says, else by its name', () => {
  assert.equal(placeOf({ name: 'cta', semantics: { element: 'button' } }), 'button');
  assert.equal(placeOf({ name: 'buttonPrimary' }), 'button');
  assert.equal(placeOf({ name: 'textLink', semantics: { element: 'a' } }), 'link');
  assert.equal(placeOf({ name: 'title', semantics: { element: 'h2' } }), 'h2');
  assert.equal(placeOf({ name: 'card', semantics: { element: 'div' } }), null);
  assert.equal(placeOf({ name: 'buttonGroup', semantics: { element: 'div' } }), null, 'the element said wins over the name');
});

test('the button: WordPress\'s button element, its tokens as the theme\'s presets, each state that changes as its pseudo-class', () => {
  const r = wordpressComponents([BUTTON], opts);
  const b = r.styles.elements.button;
  assert.deepEqual(b.spacing, { padding: { top: 'var:preset|spacing|padding-xs', bottom: 'var:preset|spacing|padding-xs', left: 'var:preset|spacing|padding-m', right: 'var:preset|spacing|padding-m' } });
  assert.deepEqual(b.border, { radius: 'var:preset|border-radius|radii-button' });
  assert.deepEqual(b.typography, { fontFamily: 'Acme Sans', fontSize: '14px', fontWeight: '500', lineHeight: '1.43' }, 'a text style has no preset: its values');
  assert.deepEqual(b.color, { background: 'var:preset|color|button-bg', text: 'var:preset|color|button-text' });
  assert.deepEqual(b[':hover'], { color: { background: 'var:preset|color|button-bg-hover' } }, 'only what changes');
  assert.deepEqual(b[':active'], { color: { background: 'var:preset|color|button-bg-pressed' } }, 'Pressed is :active');
  assert.ok(r.left.some((x) => x.component === 'button' && /State=Disabled: theme\.json has no disabled state/.test(x.why)));
  assert.ok(r.left.some((x) => /its height \(32px\)/.test(x.why)));
});

test('each other look of a button is a style of the Button block, holding what differs', () => {
  const r = wordpressComponents([BUTTON], opts);
  assert.equal(r.variations.length, 1);
  const v = r.variations[0];
  assert.equal(v.file, 'styles/blocks/button-outline.json');
  assert.deepEqual([v.theme.version, v.theme.title, v.theme.slug, v.theme.blockTypes], [3, 'Outline', 'button-outline', ['core/button']]);
  assert.deepEqual(v.theme.styles, { color: { background: 'var:preset|color|surface-base', text: 'var:preset|color|button-bg' }, border: { color: 'var:preset|color|button-bg', style: 'solid' } });
  assert.ok(r.mapped.some((m) => m.as === 'Variant=Outline, a style of the Button block (button-outline)'));
});

test('a second button is a style of the Button block; a link and a heading are their elements; the rest is said', () => {
  const r = wordpressComponents([
    { name: 'iconButton', semantics: { element: 'button' }, props: [], anatomy: { root: { radiusToken: '{radii.button}' } } },
    BUTTON,
    { name: 'textLink', semantics: { element: 'a' }, props: [variant('State', ['Default', 'Hover', 'Visited'], 'Default')], anatomy: { root: {} },
      tokens: { byVariant: [{ when: { State: 'Default' }, paints: [{ token: 'link/text', field: 'fills', text: true }] }, { when: { State: 'Visited' }, paints: [{ token: 'button/bg', field: 'fills', text: true }] }] } },
    { name: 'textLinkMuted', semantics: { element: 'a' }, props: [], tokens: { byVariant: [{ when: {}, paints: [{ token: 'link/text', field: 'fills', text: true }] }] } },
    { name: 'pageTitle', semantics: { element: 'h1' }, props: [], anatomy: { root: { radiusToken: '{radii.button}' } } },
    { name: 'card', semantics: { element: 'div' }, props: [], anatomy: { root: { radiusToken: '{radii.button}' } } },
  ], opts);
  assert.ok(r.styles.elements.button.color, 'the one named button is WordPress\'s button, wherever it sits in the list');
  assert.deepEqual(r.variations.find((v) => v.component === 'iconButton').theme.blockTypes, ['core/button']);
  assert.deepEqual(r.styles.elements.link, { color: { text: 'var:preset|color|link-text' }, ':visited': { color: { text: 'var:preset|color|button-bg' } } });
  assert.deepEqual(r.styles.elements.h1, { border: { radius: 'var:preset|border-radius|radii-button' } });
  assert.ok(r.left.some((x) => x.component === 'textLinkMuted' && x.why === 'WordPress styles one link, and textLink already is it'));
  assert.ok(r.left.some((x) => x.component === 'card' && /no core block or element/.test(x.why)));
});

test('a token the theme has no name for is written as its value, and a component with nothing to write is said', () => {
  const r = wordpressComponents([
    { name: 'button', semantics: { element: 'button' }, props: [], anatomy: { root: { radiusToken: '{heading.size}' } } },
    { name: 'h2Title', semantics: { element: 'h2' }, props: [], anatomy: { root: {} } },
  ], opts);
  assert.equal(r.styles.elements.button.border.radius, '28px');
  assert.ok(r.left.some((x) => x.component === 'h2Title' && /no padding, radius, type style or colour token/.test(x.why)));
  assert.equal(wordpressComponents([], opts).styles, null, 'no contracts: no styles');
});

// WordPress has more places than the button, the link and the headings, and the view knew only those three: every other
// component was left out saying WordPress has no core block or element for it, which was untrue for a divider, a quote,
// a table, a disclosure, a caption and a citation. A team told so does not try. Each place is read from the element
// alone, never the name, and an element WordPress has several places for is left with that reason, never with none.
test('a divider, a quote, a table, a disclosure, a caption and a citation go where WordPress keeps them', () => {
  assert.equal(placeOf({ name: 'divider', semantics: { element: 'hr' } }), 'core/separator');
  assert.equal(placeOf({ name: 'rule', semantics: { element: 'div' }, accessibility: { role: { value: 'separator' } } }), 'core/separator', 'a separator by its role');
  assert.equal(placeOf({ name: 'quote', semantics: { element: 'blockquote' } }), 'core/quote');
  assert.equal(placeOf({ name: 'dataTable', semantics: { element: 'table' } }), 'core/table');
  assert.equal(placeOf({ name: 'disclosure', semantics: { element: 'details' } }), 'core/details');
  assert.equal(placeOf({ name: 'caption', semantics: { element: 'figcaption' } }), 'caption');
  assert.equal(placeOf({ name: 'source', semantics: { element: 'cite' } }), 'cite');
  assert.equal(placeOf({ name: 'quoteCard', semantics: { element: 'div' } }), null, 'a name is never a place: a quote card is not a quote');

  const c = (name, element, extra = {}) => ({ name, semantics: { element }, anatomy: { root: { radiusToken: '{radii.button}' } }, ...extra });
  const r = wordpressComponents([c('divider', 'hr'), c('quote', 'blockquote'), c('dataTable', 'table'), c('disclosure', 'details'),
    c('caption', 'figcaption'), c('source', 'cite'), c('rule', 'div', { accessibility: { role: { value: 'separator' } } })], opts);
  assert.deepEqual(Object.keys(r.styles.blocks).sort(), ['core/details', 'core/quote', 'core/separator', 'core/table']);
  assert.deepEqual(Object.keys(r.styles.elements).sort(), ['caption', 'cite']);
  assert.deepEqual(r.styles.blocks['core/separator'], { border: { radius: 'var:preset|border-radius|radii-button' } }, 'written with the system\'s own token');
  // A second of a block is a style of that block, as a second button is a style of the Button block.
  const rule = r.variations.find((v) => v.component === 'rule');
  assert.deepEqual(rule?.theme.blockTypes, ['core/separator']);
  assert.ok(r.mapped.some((m) => m.component === 'rule' && /a style of the Separator block/.test(m.as)), JSON.stringify(r.mapped));
});

test('what has no place is said truly: one place among several is not none, and a state is only the button\'s and the link\'s', () => {
  const c = (name, element) => ({ name, semantics: { element }, anatomy: { root: { radiusToken: '{radii.button}' } } });
  const r = wordpressComponents([c('codeBlock', 'pre'), c('avatar', 'img'), c('field', 'input')], opts);
  const why = Object.fromEntries(r.left.map((l) => [l.component, l.why]));
  assert.match(why.codeBlock, /the Code block and the Preformatted block for a pre/);
  assert.match(why.avatar, /the Image block and the Avatar block for an img/);
  assert.match(why.field, /no core block or element/, 'a field really has none');
  for (const w of [why.codeBlock, why.avatar]) assert.doesNotMatch(w, /no core block/, 'WordPress has a place for it, so it is never said to have none');

  // A quote with a hover: theme.json takes a state on the button and the link only, and says so rather than drop it.
  const quote = { name: 'quote', semantics: { element: 'blockquote' }, props: [variant('State', ['Default', 'Hover'], 'Default')],
    anatomy: { root: { radiusToken: '{radii.button}' } },
    tokens: { byVariant: [{ when: { State: 'Default' }, paints: [{ token: 'surface/base', field: 'fills' }] }, { when: { State: 'Hover' }, paints: [{ token: 'button/bg', field: 'fills' }] }] } };
  const q = wordpressComponents([quote], opts);
  assert.ok(q.left.some((l) => l.component === 'quote' && /a state only on the button and the link/.test(l.why)), JSON.stringify(q.left));
  assert.ok(!(':hover' in (q.styles.blocks['core/quote'] ?? {})), 'no pseudo-class is written where WordPress would not read it');
});
