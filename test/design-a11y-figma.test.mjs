// design-a11y.mjs, read from Figma alone before any code exists: each text colour's contrast on the surfaces it is
// drawn on in every mode, a focus ring of 3:1, a 24px target in every variant, a role and a name note where one is
// needed; and every gap handed to the design team's to do list in Figma (figma-edits.mjs designA11yEdits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designA11yFindings, designContrastFindings, designA11yGaps, designA11yBlock, designA11ySheetLines, nameRole, systemSurfaces, wcagOf, readingOrderFindings } from '../lib/design-a11y.mjs';
import { designA11yEdits, applyScript, editLines } from '../lib/figma-edits.mjs';

// Acme, an invented system: a light and a dark mode.
const VARS = { color: {
  light: { 'surface/page/color': '#ffffff', 'surface/raised/color': '#f4f4f4', 'text/body/color': '#1a1a1a', 'text/muted/color': '#9a9a9a',
    'cardTile/background/color': '#ffffff', 'cardTile/text/color': '#777777', 'cardTile/text/disabled/color': '#dddddd',
    'focus/ring/color': '#2050e0', 'focus/faint/color': '#c8d4f8', 'icon/subtle/color': '#c0c0c0' },
  dark: { 'surface/page/color': '#101010', 'surface/raised/color': '#1c1c1c', 'text/body/color': '#f0f0f0', 'text/muted/color': '#808080',
    'cardTile/background/color': '#101010', 'cardTile/text/color': '#9a9a9a', 'cardTile/text/disabled/color': '#333333',
    'focus/ring/color': '#8fb0ff', 'focus/faint/color': '#1a2440', 'icon/subtle/color': '#2a2a2a' },
} };

test('the role a name says, and the surfaces the system defines', () => {
  assert.deepEqual(['iconButton', 'Text field', 'menuItem', 'checkbox', 'buttonGroup', 'fieldLabel', 'cardTile', 'Tab bar'].map(nameRole), ['button', 'textbox', 'menuitem', 'checkbox', null, null, null, null]);
  assert.deepEqual(systemSurfaces(VARS).light.map((s) => s.token), ['surface/page/color', 'surface/raised/color']);
  assert.deepEqual(systemSurfaces(VARS, ['cardTile/background']).dark.map((s) => s.token), ['cardTile/background/color'], 'a11y.surfaces names them');
});

test('contrast from the variables alone: each text on the fill under it and on every surface when nothing is under it, in every mode', () => {
  const structure = {
    cardTile: { drawnOn: [{ fg: 'cardTile/text/color', on: 'cardTile/background/color' }, { fg: 'cardTile/text/disabled/color', on: 'cardTile/background/color' }], fills: ['cardTile/background/color'] },
    linkRow: { drawnOn: [{ fg: 'text/muted/color', on: 'surface' }, { fg: 'icon/subtle/color', on: 'surface', icon: true }] },
  };
  const f = designContrastFindings(VARS, structure);
  const said = Object.fromEntries(f.map((x) => [x.textToken, x]));
  // cardTile's grey on its white is 4.48:1 in light only.
  assert.equal(said['cardTile/text/color'].component, 'cardTile');
  assert.deepEqual(said['cardTile/text/color'].modes, ['light']);
  assert.match(said['cardTile/text/color'].text, /^cardTile\/text\/color on cardTile\/background\/color is 4\.48:1 in light, under 4\.5:1 \(WCAG 1\.4\.3\)$/);
  assert.equal(said['cardTile/text/disabled/color'], undefined, 'a disabled colour owes no contrast');
  // Nothing under it in its component: measured on each surface, the worst said.
  assert.equal(said['text/muted/color'].component, 'linkRow');
  assert.equal(said['text/muted/color'].bg, 'surface/raised/color');
  assert.match(said['text/muted/color'].text, /in every mode, under 4\.5:1/);
  // An icon is held to 3:1.
  assert.equal(said['icon/subtle/color'].threshold, 3);
  assert.equal(wcagOf(said['icon/subtle/color']), 'WCAG 1.4.11 Non-text Contrast (AA)');
  // A see-through fill: what is under it decides, so the pair is left to the rendered check.
  assert.equal(designContrastFindings(VARS, { cardTile: { ...structure.cardTile, fillOpacity: 0.1, colors: { fill: { token: 'cardTile/background/color' } } } }).length, 0);
  // A scoped run keeps its own components.
  assert.deepEqual(designContrastFindings(VARS, structure, { only: ['cardTile'] }).map((x) => x.component), ['cardTile']);
  // A pair the project declares is measured too.
  assert.equal(designContrastFindings(VARS, {}, { authored: [{ text: 'text/muted/color', bg: 'surface/page/color' }] })[0].ratio, 2.81);
});

test('a focus ring Figma draws is held to 3:1 against every surface; the border a component always has is not its ring', () => {
  const props = {
    acmeButton: { annotations: [{ label: 'Role: button' }], properties: { State: { type: 'VARIANT', variantOptions: ['Default', 'Focus'] }, 'Label#1:0': { type: 'TEXT' } } },
    acmeField: { annotations: [{ label: 'Role: textbox' }, { label: 'aria-label: Search' }], properties: { State: { type: 'VARIANT', variantOptions: ['Default', 'Focused'] } } },
  };
  const structure = {
    acmeButton: { h: 32, defaultVariant: 'State=Default', variants: { 'State=Default': { h: 32, colors: { stroke: null } }, 'State=Focus': { h: 32, colors: { stroke: { token: 'focus/faint/color', hex: '#c8d4f8', opacity: 1 } } } } },
    acmeField: { h: 36, defaultVariant: 'State=Default', variants: { 'State=Default': { h: 36, colors: { stroke: { token: 'focus/faint/color' } } }, 'State=Focused': { h: 36, colors: { stroke: { token: 'focus/faint/color' } } } } },
  };
  const f = designA11yFindings(props, structure, { vars: VARS });
  assert.deepEqual(f.map((x) => `${x.component} ${x.kind}`), ['acmeButton focuscontrast']);
  assert.match(f[0].text, /acmeButton's focus ring \(focus\/faint\/color, State=Focus\) is 1\.\d+:1 on surface\/\w+\/color in every mode: under 3:1 it is hard to see/);
  const good = { ...structure, acmeButton: { ...structure.acmeButton, variants: { ...structure.acmeButton.variants, 'State=Focus': { h: 32, colors: { stroke: { token: 'focus/ring/color' } } } } } };
  assert.deepEqual(designA11yFindings(props, good, { vars: VARS }), [], 'a ring at 3:1 or more on every surface');
  assert.deepEqual(designA11yFindings(props, structure), [], 'no variables read: the ring is not measured');
});

test('a target under 24px in any variant or wide, no role note where the name says a control, no name where it shows no words', () => {
  const props = {
    iconButton: { properties: { Size: { type: 'VARIANT', variantOptions: ['S', 'M'] }, State: { type: 'VARIANT', variantOptions: ['Default', 'Focus'] } } },
    closeButton: { annotations: [{ label: 'Role: button' }, { label: 'aria-label: "Close"' }], properties: { State: { type: 'VARIANT', variantOptions: ['Focus'] } } },
    acmeLink: { annotations: [{ label: 'Role: link' }], properties: { State: { type: 'VARIANT', variantOptions: ['Focus'] }, 'Text#2:0': { type: 'TEXT' } } },
    badgeTile: { properties: {} },
  };
  const structure = {
    iconButton: { h: 32, colors: { fill: null, text: null }, defaultVariant: 'Size=M, State=Default', variants: { 'Size=S, State=Default': { h: 20 }, 'Size=M, State=Default': { h: 32 } } },
    closeButton: { h: 32, colors: {}, box: { width: 16, sizing: { h: 'FIXED' } } },
    acmeLink: { h: 20, colors: { text: { token: 'text/body/color' } } },
  };
  const f = designA11yFindings(props, structure);
  assert.deepEqual(f.map((x) => `${x.component} ${x.kind}`), ['iconButton norole', 'iconButton small', 'iconButton noname', 'closeButton small', 'acmeLink small']);
  assert.match(f[0].text, /iconButton has no role note in Figma: its name says a button/);
  assert.match(f[0].fix, /add the annotation "Role: button"/);
  assert.match(f[1].text, /iconButton's Size=S, State=Default is 20px tall/);
  assert.match(f[3].text, /closeButton is 16px wide/);
  assert.match(f[2].fix, /aria-label: "<what it does>"/);
  assert.match(designA11ySheetLines(f, 'iconButton').join('\n'), /an accessible name \(aria-label\).*never invent them/);
});

test('every gap reaches the design team\'s to do list in Figma: its own frame on the to do page, one card each, written afresh after a yes', async () => {
  const props = { iconButton: { nodeId: '9:1', properties: {} } };
  const structure = { iconButton: { h: 20, colors: {}, drawnOn: [{ fg: 'text/muted/color', on: 'surface' }] } };
  const gaps = designA11yGaps({ props, structure, vars: VARS, cfg: {} });
  // cardTile's pair is the system's own (its names pair them), drawn by no component read here.
  assert.deepEqual(gaps.map((g) => `${g.kind} ${g.component}`), ['norole iconButton', 'nofocus iconButton', 'small iconButton', 'noname iconButton', 'contrast null', 'contrast iconButton']);
  const block = designA11yBlock(gaps).join('\n');
  assert.match(block, /^♿ Accessibility in the Figma file: 6 things the design owes/);
  assert.match(block, /• iconButton: text\/muted\/color on surface\/raised\/color is \d\.\d+:1 in every mode/);
  assert.match(block, /\n {3}• cardTile\/text\/color on cardTile\/background\/color is 4\.48:1 in light, under 4\.5:1/);
  assert.match(block, /--figma-edits puts each on the design team's to do list in Figma, written only after a yes/);
  assert.deepEqual(designA11yGaps({ props, structure, vars: VARS, cfg: { designA11y: true, a11y: { surfaces: ['surface/page/color'] } } }).find((g) => g.component === 'iconButton' && g.kind === 'contrast').bg, 'surface/page/color', 'a11y.surfaces says which surfaces');
  assert.deepEqual(designA11yEdits([]), [], 'nothing owed, no frame');
  const edits = designA11yEdits(gaps, wcagOf);
  assert.equal(edits[0].frame, 'Accessibility the design owes');
  assert.deepEqual(edits[0].items.map((i) => i.wcag), ['WCAG 4.1.2 Name, Role, Value (A)', 'WCAG 2.4.7 Focus Visible (AA)', 'WCAG 2.5.8 Target Size (Minimum) (AA)', 'WCAG 4.1.2 Name, Role, Value (A)', 'WCAG 1.4.3 Contrast (Minimum) (AA)', 'WCAG 1.4.3 Contrast (Minimum) (AA)']);
  const lines = editLines(edits).join('\n');
  assert.match(lines, /Accessibility the design owes, listed in Figma on the page "Design system to do", frame "Accessibility the design owes" \(6 gaps in 1 component and the system's colours, read from Figma alone\)/);
  assert.match(lines, /NEXT: show the person the accessibility the design owes above and ask; only when they say yes, run the script/);
  assert.match(editLines(edits, { may: 'no' }).join('\n'), /on the Tasks page, for whoever owns Figma/);
  // The script, run in a fake Figma: the frame on the to do page, one card per gap, the same frame again on a second run.
  const node = (type) => ({ type, name: '', children: [], x: 0, y: 0, appendChild(k) { this.children.push(k); k.parent = this; }, remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); } });
  const doc = { children: [] };
  const fake = { root: doc, getNodeByIdAsync: async () => null, loadFontAsync: async () => {},
    createPage() { const p = node('PAGE'); p.parent = doc; doc.children.push(p); return p; }, createFrame: () => node('FRAME'), createText: () => node('TEXT') };
  const go = () => new Function('figma', `return (async () => { ${applyScript(edits)} })();`)(fake);
  const r = await go();
  assert.equal(r.todo, 'Design system to do › Accessibility the design owes: 6 gaps');
  const frame = doc.children[0].children.find((n) => n.name === 'Accessibility the design owes');
  assert.deepEqual(frame.children.slice(1).map((c) => c.name), ['iconButton', 'iconButton', 'iconButton', 'iconButton', 'The system\'s colours', 'iconButton']);
  assert.match(frame.children[3].children[1].characters, /^iconButton is 20px tall: under 24px a control is easy to miss · fix: make it at least 24×24.* · WCAG 2\.5\.8 Target Size \(Minimum\) \(AA\)$/);
  assert.deepEqual(r.changed, [], 'nothing else in the file is touched');
  await go();
  assert.deepEqual([doc.children.length, doc.children[0].children.length], [1, 1], 'written afresh, not added twice');
});

test('reading order in Figma: words placed by hand in another order than they are seen, once a component; artwork and auto layout never', () => {
  // A card laid out by hand: its layers list the balance first, but the name is drawn above it.
  const tree = (kids) => ({ t: 'COMPONENT', n: 'size=m', c: kids });
  const text = (n) => ({ t: 'TEXT', n });
  const skeleton = {
    cardOffer: { trees: [tree([text('Balance'), text('Name')])], variants: [['size=m', 0], ['size=l', 0]], looks: { 'size=m': { 0: { at: [16, 60, 120, 20] }, 1: { at: [16, 16, 120, 20] } }, 'size=l': { 0: { at: [16, 80, 160, 24] }, 1: { at: [16, 16, 160, 24] } } } },
    cardTidy: { trees: [tree([text('Name'), text('Balance')])], variants: [['size=m', 0]], looks: { 'size=m': { 0: { at: [16, 16, 120, 20] }, 1: { at: [16, 60, 120, 20] } } } },
    chipRow: { trees: [tree([text('Label'), text('Count')])], variants: [['size=m', 0]], looks: { 'size=m': { 0: { at: [8, 4, 40, 16] }, 1: { at: [52, 4, 16, 16] } } } },
    logoMark: { trees: [tree([{ t: 'VECTOR', n: 'Vector 2' }, { t: 'VECTOR', n: 'Vector 1' }])], variants: [['size=m', 0]], looks: { 'size=m': { 0: { at: [20, 0, 8, 8] }, 1: { at: [0, 0, 8, 8] } } } },
    rowAuto: { trees: [tree([text('Second'), text('First')])], variants: [['size=m', 0]] },
    pieLabels: { trees: [tree([text('Slice one'), text('Slice two')])], variants: [['size=m', 0]], looks: { 'size=m': { 0: { at: [400, 160, 180, 28] }, 1: { at: [16, 48, 160, 32] } } } },
  };
  const found = readingOrderFindings(skeleton);
  assert.deepEqual(found.map((f) => f.component), ['cardOffer'], 'once, whatever the variants; a row read left to right, labels round a chart, artwork and auto layout are fine');
  assert.match(found[0].text, /^cardOffer: "Name" is seen before "Balance" but comes after it in the layers \(size=m\)/);
  assert.equal(wcagOf(found[0]), 'WCAG 1.3.2 Meaningful Sequence (A)');
  assert.deepEqual(readingOrderFindings(skeleton, { only: ['cardTidy'] }), []);
  assert.equal(designA11yGaps({ skeleton }).filter((f) => f.kind === 'readorder').length, 1, 'among what the design owes');
});
