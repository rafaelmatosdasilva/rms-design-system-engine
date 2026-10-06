// One way of writing names across the system: the style most property names and options follow, and each written otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsOf, stylesOf, inStyle, dominantStyle, namingFindings, namingLine } from '../naming-consistency.mjs';
import { plainAction, plainDifference, componentOf } from '../run-diff.mjs';

test('a name is read for its words and its style; a single word fits every style that writes it so', () => {
  assert.deepEqual(wordsOf('Show dividerLine Top'), ['show', 'divider', 'line', 'top']);
  assert.deepEqual(wordsOf('label-content#12:3'), ['label', 'content']);
  assert.deepEqual(stylesOf('Show Icon'), ['title']);
  assert.deepEqual(stylesOf('show-icon'), ['kebab']);
  assert.deepEqual(stylesOf('iconContent'), ['camel']);
  assert.deepEqual(stylesOf('LabelContent'), ['pascal']);
  assert.deepEqual(stylesOf('label content'), ['lowerWords']);
  assert.deepEqual(stylesOf('Label'), ['title', 'pascal']);
  assert.deepEqual(stylesOf('show-Icon'), [], 'mixed fits none');
  assert.equal(inStyle('show-Icon', 'title'), 'Show Icon');
  assert.equal(inStyle('Show CloseButton', 'kebab'), 'show-close-button');
  assert.deepEqual(dominantStyle(['Show Icon', 'Label Content', 'show-icon', 'State']), { style: 'title', count: 3, of: 4 });
});

test('every property and option written otherwise is named, with its rename into the style most of the system follows', () => {
  const snap = { components: {
    buttonPrimary: { properties: { 'label-content#1:2': { type: 'TEXT' }, 'Show Icon': { type: 'BOOLEAN' }, State: { type: 'VARIANT', variantOptions: ['Default', 'hover'] } } },
    badge: { properties: { 'Label Content': {}, 'Show Label': {}, Type: { type: 'VARIANT', variantOptions: ['Positive', 'Negative'] } } },
    toast: { properties: { 'Label Content': {}, Type: { type: 'VARIANT', variantOptions: ['Sucess', 'Error'] } } },
    alert: { properties: { Type: { type: 'VARIANT', variantOptions: ['Success', 'Warning'] } } },
  } };
  const r = namingFindings(snap);
  assert.equal(r.props.style, 'title');
  assert.deepEqual(r.findings.map((f) => [f.component, f.kind, f.name, f.want]), [
    ['buttonPrimary', 'property', 'label-content', 'Label Content'],
    ['buttonPrimary', 'option', 'hover', 'Hover'],
    ['toast', 'option', 'Sucess', 'Success'],
  ]);
  assert.match(namingLine(r.findings[0]), /^buttonPrimary property "label-content" is named differently from the rest of the system: rename it "Label Content" in Figma \(\d+ of the system's \d+ property names are Title Case words\)$/);
  assert.match(r.findings[2].why, /misspelling of "success"/);
  assert.deepEqual(namingFindings({ a: { properties: { x: {} } } }).findings, [], 'too few names to say what the system does');
});

test('a naming difference reads plainly, belongs to its component, and the Figma file owns it', () => {
  const what = 'buttonPrimary option "hover" of State is named differently from the rest of the system: rename it "Hover" in Figma (31 of the system\'s 52 options are Title Case words)';
  assert.equal(componentOf(`Component props match Figma :: ⚠️  ${what}`, ['buttonPrimary', 'badge']), 'buttonPrimary');
  assert.match(plainDifference(what), /^In Figma, the option "hover" of State is written differently from the rest of the system: 31 of/);
  assert.deepEqual(plainAction(what, 'buttonPrimary'), { who: 'figma', todo: 'In Figma, rename the option "hover" of buttonPrimary\'s State to "Hover". Then tell me to update the code\'s contract to the new name.' });
});

test('where the system could be simpler: one component in several copies, a prop with nothing to choose, a component no product uses', async () => {
  const { simplifyView } = await import('../styleguide-data.mjs');
  const btn = (name, extra) => ({ name, controls: [{ label: 'Label Content', type: 'TEXT' }, { label: 'Show Icon', type: 'BOOLEAN' }, extra], usage: [{ key: 'app' }] });
  const comps = [
    btn('buttonPrimary', { label: 'Disabled', type: 'BOOLEAN' }), btn('buttonSecondary', { label: 'State', type: 'VARIANT', options: [{ label: 'Default' }, { label: 'Hover' }] }),
    { name: 'buttonMenu', controls: [{ label: 'Item Title Content', type: 'TEXT' }, { label: 'Show Tooltip', type: 'BOOLEAN' }, { label: 'Selected', type: 'BOOLEAN' }], usage: [{ key: 'app' }] },
    { name: 'badge', controls: [{ label: 'Tone', type: 'VARIANT', options: [{ label: 'Neutral' }] }], usage: [] },
  ];
  const r = simplifyView(comps, { products: true });
  assert.deepEqual(r.map((x) => [x.kind, x.components.join()]), [['family', 'buttonPrimary,buttonSecondary'], ['one-option', 'badge'], ['unused', 'badge']]);
  assert.match(r[0].say, /one button with a Type option \(Primary, Secondary\)/);
  assert.deepEqual(simplifyView(comps, { products: false }).map((x) => x.kind), ['family', 'one-option'], 'unused only when the products were read');
});
