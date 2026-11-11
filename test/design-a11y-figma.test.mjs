// design-a11y.mjs, read from Figma alone before any code exists: each text colour's contrast on the surfaces it is
// drawn on in every mode, a focus ring of 3:1, a 24px target in every variant, a role and a name note where one is
// needed; and every gap handed to the design team's to do list in Figma (figma-edits.mjs designA11yEdits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designA11yFindings, designContrastFindings, designA11yGaps, designA11yBlock, designA11ySheetLines, nameRole, systemSurfaces, wcagOf, readingOrderFindings, edgeFindings, adviceFindings } from '../lib/design-a11y.mjs';
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
  // A system that names the type first: the kind after it does not hide the control. A group, a part or a row of them is not one.
  assert.deepEqual(['buttonBold', 'tabUnderline', 'fieldPlain', 'checkboxRound', 'iconButtonGhost', 'stepperCompact'].map(nameRole), ['button', 'tab', 'textbox', 'checkbox', 'button', 'spinbutton']);
  assert.deepEqual(['checkboxStack', 'linkListLabel', 'tabBar', 'cardOffer', 'Layout/Header'].map(nameRole), [null, null, null, null, null]);
  // A row of what opens to pick from is what is picked; a path's last part names it; a segmented control is a radio group.
  assert.deepEqual(['dropdownPickerRow', 'selectFlagRow', 'menuRow', 'nav/TabCompact', 'segmentedButtonCompact'].map(nameRole), ['option', 'option', 'menuitem', 'tab', 'radiogroup']);
  assert.deepEqual(systemSurfaces(VARS).light.map((s) => s.token), ['surface/page/color', 'surface/raised/color']);
  assert.deepEqual(systemSurfaces(VARS, ['cardTile/background']).dark.map((s) => s.token), ['cardTile/background/color'], 'a11y.surfaces names them');
  assert.deepEqual(systemSurfaces({ color: { light: { 'base/appBackground/color': '#ffffff', 'base/appBackground/text/color': '#111111', 'cardTile/background/color': '#eeeeee' } } }).light.map((s) => s.token), ['base/appBackground/color'], 'an app\'s own background is one; its text is not, nor a component\'s own background');
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
  assert.deepEqual(gaps.filter((g) => !g.advice).map((g) => `${g.kind} ${g.component}`), ['norole iconButton', 'nofocus iconButton', 'small iconButton', 'noname iconButton', 'contrast null', 'contrast iconButton']);
  assert.deepEqual(gaps.filter((g) => g.advice).map((g) => `${g.kind} ${g.component}`), ['states iconButton', 'a11ynote iconButton'], 'advice, apart');
  const block = designA11yBlock(gaps).join('\n');
  assert.match(block, /\n {3}Advice, not a WCAG failure \(what the code needs to be told\):\n {3}• a control with no hover, pressed, disabled or error state: iconButton/);
  assert.match(block, /^♿ Accessibility in the Figma file: 6 things the design owes/);
  assert.match(block, /• iconButton: text\/muted\/color on surface\/raised\/color is \d\.\d+:1 in every mode/);
  assert.match(block, /\n {3}• cardTile\/text\/color on cardTile\/background\/color is 4\.48:1 in light, under 4\.5:1/);
  assert.match(block, /--figma-edits puts each on the design team's to do list in Figma, written only after a yes/);
  assert.deepEqual(designA11yGaps({ props, structure, vars: VARS, cfg: { designA11y: true, a11y: { surfaces: ['surface/page/color'] } } }).find((g) => g.component === 'iconButton' && g.kind === 'contrast').bg, 'surface/page/color', 'a11y.surfaces says which surfaces');
  assert.deepEqual(designA11yEdits([]), [], 'nothing owed, no frame');
  const edits = designA11yEdits(gaps, wcagOf);
  assert.equal(edits[0].frame, 'Accessibility the design owes');
  assert.equal(edits[1].frame, 'Advice for the Figma file', 'advice in a frame of its own');
  assert.ok(edits[1].items.every((i) => i.wcag === null));
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

test('once the browser measured the code, what Tab reaches there is a control in Figma, whatever its name says', () => {
  const props = { actionList: { properties: {} }, 'nav/TabCompact': { properties: { State: { type: 'VARIANT', variantOptions: ['Default', 'Focus'] } } }, buttonDecor: { properties: {} }, linkPlain: { properties: {} },
    cardTile: { properties: {} } };
  const measured = { actionList: { role: 'button', focusable: true, own: true }, TabCompact: { role: 'tab', focusable: true, own: true }, buttonDecor: { role: null, focusable: false, own: true }, cardTile: { role: null, focusable: true, own: true } };
  const f = designA11yFindings(props, {}, { measured });
  const of = (kind) => f.filter((x) => x.kind === kind).map((x) => x.component).sort();
  assert.deepEqual(of('nofocus'), ['actionList', 'buttonDecor', 'cardTile', 'linkPlain'], 'a list the code makes a button, a card Tab reaches; a link never measured goes by its name; a path matched by its last part has its focus state');
  assert.ok(f.some((x) => x.component === 'buttonDecor' && x.kind === 'nofocus'), 'a measurement that found no tab stop says nothing: its name still says a button');
  assert.match(f.find((x) => x.kind === 'norole' && x.component === 'actionList').text, /the code makes it a button, and nothing in Figma says so/);
  assert.match(f.find((x) => x.kind === 'norole' && x.component === 'cardTile').text, /the code makes it something Tab reaches/);
  assert.equal(f.find((x) => x.kind === 'norole' && x.component === 'cardTile').fix, 'add a "Role:" annotation with the role it has');
  // A dialog's facts are its first button's: the code says nothing of the dialog itself, nor do facts saved before own.
  const held = designA11yFindings({ modalPlain: { properties: {} }, cardOld: { properties: {} } }, {}, { measured: { modalPlain: { role: 'button', focusable: true, own: false }, cardOld: { role: 'button', focusable: true } } });
  assert.deepEqual(held, [], 'neither is a control');
});

test('a field, a checkbox or a switch is found by its edge: its best layer 3:1 against what is behind it, in every mode; a button needs none', () => {
  const edges = (list, [variant] = ['state=default']) => [{ variant, n: 1, list }];
  const structure = {
    // Its box fades into the page in light mode only.
    checkboxPlain: { edges: edges([{ fill: 'text/muted/color', on: 'surface/page/color' }]) },
    // A pale fill, but a dark border: one edge that shows is enough.
    textField: { edges: edges([{ fill: 'surface/raised/color', on: 'surface/page/color' }, { stroke: 'text/body/color', on: 'surface/raised/color' }]) },
    // On nothing of its own: held to every surface, in every mode; its track drawn at 30%.
    switchToggle: { edges: edges([{ fill: 'text/body/color', on: 'surface', o: 0.3 }], ['on=true']) },
    // Words of its own: no edge asked of it, however faint.
    buttonGhost: { edges: edges([{ fill: 'surface/raised/color', on: 'surface/page/color' }]) },
    // A colour with no variable is measured as it is.
    radioDot: { edges: edges([{ stroke: '#5a5a5a', on: '#ffffff' }]) },
  };
  const f = edgeFindings({}, structure, { vars: VARS });
  assert.deepEqual(f.map((x) => [x.component, x.ratio, x.modes]).sort(), [['checkboxPlain', 2.81, ['light']], ['switchToggle', 1.91, ['light', 'dark']]]);
  assert.match(f.find((x) => x.component === 'switchToggle').text, /^switchToggle's edge is 1\.91:1 against what is behind it in every mode \(on=true\), under 3:1, so the control is hard to find \(WCAG 1\.4\.11\)$/);
  assert.equal(wcagOf(f[0]), 'WCAG 1.4.11 Non-text Contrast (AA)');
  // The code's role or a note can make one a control its name does not say; nothing measured, nothing said.
  assert.equal(edgeFindings({ pinCells: { annotations: [{ label: 'Role: textbox' }] } }, { pinCells: structure.checkboxPlain }, { vars: VARS }).length, 1);
  assert.deepEqual(edgeFindings({}, structure, { vars: null }), []);
  assert.ok(designA11yGaps({ structure, vars: VARS }).some((x) => x.kind === 'boundary' && x.component === 'checkboxPlain'), 'among what the Figma file owes');
});

test('a word that names only an input holds whatever role the code gives; one that names other things too holds only when the code confirms an input', () => {
  const faint = [{ variants: ['state=default'], list: [{ fill: 'surface/raised/color', on: 'surface/page/color' }] }];
  const structure = { checkboxPlain: { edges: faint }, menuToggle: { edges: faint }, dropdownTagChip: { edges: faint }, dropdownPlain: { edges: faint }, priceField: { edges: faint },
    stepperSteps: { edges: faint }, stepperCount: { edges: faint } };
  const measured = { checkboxPlain: { role: 'button', focusable: true, own: true }, menuToggle: { role: 'button', focusable: true, own: true }, dropdownTagChip: { role: 'button', focusable: true, own: true },
    dropdownPlain: { role: null, focusable: false, own: true }, priceField: { role: 'textbox', focusable: false, own: true }, stepperSteps: { role: null, focusable: false, own: true } };
  assert.deepEqual(edgeFindings({}, structure, { vars: VARS, measured }).map((x) => x.component).sort(), ['checkboxPlain', 'dropdownPlain', 'priceField'], 'a field the code confirms holds; a stepper or a toggle the code does not confirm is not asked');
});

test('advice, apart from WCAG: an image with no note, a disabled variant that says nowhere why, a control with states missing, one with no accessibility note', () => {
  const T = (n, extra = {}) => ({ t: 'TEXT', n, ...extra });
  const skeleton = {
    promoTile: { trees: [{ t: 'COMPONENT', n: 'x', c: [{ t: 'RECTANGLE', n: 'Photo', img: true }, { t: 'RECTANGLE', n: 'Logo', img: true }, { t: 'INSTANCE', n: 'Avatar', c: [{ t: 'RECTANGLE', n: 'Face', img: true }] }] }],
      variants: [['state=default', 0]], looks: { 'state=default': { 1: { notes: ['accessibility'] } } } },
    saveAction: { trees: [{ t: 'COMPONENT', n: 'x', c: [T('Label')] }, { t: 'COMPONENT', n: 'x', c: [T('Label'), T('Helper')] }],
      variants: [['state=default', 0], ['state=disabled', 0], ['state=lockedDisabled', 0], ['state=disabledExplained', 1]], looks: { 'state=lockedDisabled': { '': { notes: ['note'] } } } },
  };
  const props = {
    buttonPlain: { properties: { State: { type: 'VARIANT', variantOptions: ['Default', 'Hover', 'Pressed', 'Disabled'] } }, description: 'Keyboard: Enter and Space press it.' },
    checkboxPlain: { properties: { State: { type: 'VARIANT', variantOptions: ['Default', 'Hover'] } }, annotations: [{ label: 'Role: checkbox' }] },
    cardTile: { properties: {} },
  };
  const f = adviceFindings(props, skeleton);
  const of = (kind) => f.filter((x) => x.kind === kind);
  assert.ok(f.every((x) => x.advice), 'each marked advice');
  assert.deepEqual(of('imagenote').map((x) => x.text), ['promoTile: an image has no note (Photo), so the code is never told what it says, or that it is decorative'], 'the noted logo is told; the avatar\'s face is its own component\'s');
  assert.match(of('disablednote')[0].text, /^saveAction: its disabled variant says nowhere why it is disabled \(state=disabled\)$/, 'one with a note or a helper text says why');
  assert.deepEqual(of('states').map((x) => [x.component, x.text.match(/no (.*) state/)[1]]), [['checkboxPlain', 'pressed, disabled, error']], 'a button with them all; a checkbox takes input, so an error state too; a card is no control');
  assert.deepEqual(of('a11ynote').map((x) => x.component), [], 'a description that speaks of the keyboard, or a note, is enough');
  assert.deepEqual(adviceFindings({ buttonBare: { properties: {} } }, {}).filter((x) => x.kind === 'a11ynote').map((x) => x.component), ['buttonBare']);
});

test('a component drawn hovered, pressed or disabled is something a person operates, whatever its name; a part named as one is not', () => {
  const st = (...o) => ({ properties: { State: { type: 'VARIANT', variantOptions: ['Default', ...o] } } });
  const f = designA11yFindings({ menuEntry: st('Hover', 'Pressed'), tileSelectable: st('Pressed'), rowBackground: st('Hover'), promoTile: st('Selected') }, {});
  const comps = [...new Set(f.map((x) => x.component))].sort();
  assert.deepEqual(comps, ['menuEntry', 'tileSelectable'], 'a background is a part; selected alone is a state, not a sign it is operated');
  assert.match(f.find((x) => x.kind === 'norole' && x.component === 'menuEntry').text, /its hovered, pressed or disabled states say a person operates it/);
  assert.ok(designA11yFindings({ choiceTile: st('Disabled') }, {}).some((x) => x.component === 'choiceTile'), 'only a control is disabled');
  assert.deepEqual(['fieldSearchBar', 'columnSorting'].map(nameRole), ['searchbox', 'button']);
});

test('a component that holds a button is no button, a stepper needs the code to be a control, a spacer never is, and a list item drawn disabled is one', () => {
  const st = (...o) => ({ properties: { State: { type: 'VARIANT', variantOptions: ['Default', ...o] } } });
  const props = { dialogLink: st(), priceField: st(), stepperSteps: st(), 'grid/Cell/radio(spacer)': st(), choiceListItem: st('Disabled'), labelBackground: st('Disabled') };
  const measured = { dialogLink: { role: 'button', focusable: true, own: false }, priceField: { role: 'textbox', focusable: false, own: false } };
  const comps = [...new Set(designA11yFindings(props, {}, { measured }).map((x) => x.component))].sort();
  assert.deepEqual(comps, ['choiceListItem', 'priceField'], 'a field\'s wrapper is the field it holds; a part drawn disabled is still a part');
});
