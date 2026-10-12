// figma-edits.mjs W2 and W3: the screens' accessibility findings pinned in Figma where they are, and each component's
// accessibility spec as the code gives it, both in their own annotation categories and replaced on each run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewEdits, specEdits, nameSource, statesOf, pinWords, applyScript, editLines, annotationEdits, REVIEW_CATEGORY, SPEC_CATEGORY } from '../figma-edits.mjs';

const SCREENS = [{ id: '10:1', name: 'Start' }, { id: '10:2', name: 'Export' }, { id: '10:3', name: 'Export' }];
const FINDINGS = [
  { screen: 'Start', screenId: '10:1', nodes: ['10:5'], kind: 'contrast', what: '"Cancel"', n: 2, ratio: 3.1, need: 4.5, fg: '#888888', bg: '#ffffff', criterion: '1.4.3', fix: 'darken the text' },
  { screen: 'Start', screenId: '10:1', nodes: ['10:5', '10:6'], kind: 'target', what: 'iconButton', n: 2, size: '16×16', criterion: '2.5.8', fix: 'make it at least 24×24' },
  { screen: 'Start', screenId: '10:1', nodes: [], kind: 'bare', what: '3 texts and icons', n: 1, count: 3, criterion: '1.4.3', fix: 'give the screen its background' },
  { screen: 'Export (10:2)', screenId: '10:2', nodes: [], kind: 'plate', what: '"Title"', n: 1, criterion: '1.4.3', fix: 'put a plate behind it' },
];

test('a finding in words: what is wrong, its WCAG number, the fix', () => {
  assert.equal(pinWords(FINDINGS[0]), '"Cancel" (2 times) is 3.1:1 (#888888 on #ffffff), and needs 4.5:1. WCAG 1.4.3. Fix: darken the text.');
  assert.match(pinWords(FINDINGS[1]), /^iconButton \(2 times\) is drawn 16×16, under 24×24\. WCAG 2\.5\.8\./);
  assert.match(pinWords(FINDINGS[2]), /^3 texts and icons have nothing drawn behind them/);
});

test('review: one pin per layer with all its issues, a summary per screen, what has no layer said in the summary', () => {
  assert.deepEqual(reviewEdits(FINDINGS, []), [], 'no screen read: nothing to pin');
  const [r] = reviewEdits(FINDINGS, SCREENS);
  assert.equal(r.kind, 'review');
  assert.equal(r.category, REVIEW_CATEGORY);
  const [start, ex2, ex3] = r.screens;
  assert.equal(start.count, 3);
  assert.deepEqual(start.pins.map((p) => p.node), ['10:5', '10:6']);
  const both = start.pins[0].label;
  assert.match(both, /^\*\*Accessibility Review\*\*\n/);
  assert.match(both, /"Cancel".*WCAG 1\.4\.3/);
  assert.match(both, /iconButton.*WCAG 2\.5\.8/, 'a layer with two issues lists both');
  assert.match(start.summary, /3 to fix \(contrast 1, target size 1, no surface 1\)\. Each is pinned on its layer\./);
  assert.match(start.summary, /nothing drawn behind them/, 'the screen-wide finding is said in the summary');
  assert.equal(ex2.name, 'Export (10:2)', 'two screens with one name are told apart by their ids');
  assert.equal(ex2.pins.length, 0);
  assert.doesNotMatch(ex2.summary, /pinned on its layer/, 'nothing pinned: the summary does not say so');
  assert.match(ex2.summary, /"Title" sits on an image or a gradient/);
  assert.match(ex3.summary, /nothing to fix/);
  assert.match(r.why, /^4 to fix on 3 screens/);
});

const SNAP = {
  button: { nodeId: '1:1', annotations: [] },
  toggle: { nodeId: '1:2', annotations: [{ label: 'Role: switch' }] },
  field: { nodeId: '1:3', annotations: [{ labelMarkdown: '**Accessibility spec** (from the code, replaced on each run)\nRole: textbox' }] },
  group: { nodeId: '1:4', annotations: [] },
  _meta: {},
};
const VIEW = [
  { name: 'button', markup: '<button class="button" aria-label="Save file" disabled>Save</button>', markupFrom: 'page' },
  { name: 'toggle', markup: '<button class="toggle" aria-pressed="false">Bold</button>', markupFrom: 'jsx' },
  { name: 'field', markup: '<div class="field"><label for="n">Name</label><input id="n" type="text" aria-invalid="false" required></div>', markupFrom: 'page' },
  { name: 'group', markup: '<div class="group"><button>A</button><button>B</button></div>', markupFrom: 'page' },
];

test('what names a component and the states it says, read from its markup', () => {
  assert.equal(nameSource(['<button aria-labelledby="t">x</button>']), 'the element its aria-labelledby points to');
  assert.equal(nameSource(['<button aria-label="Close">x</button>']), 'aria-label ("Close")');
  assert.equal(nameSource(['<label>Name <input></label>']), 'its label');
  assert.equal(nameSource(['<button>Save</button>']), 'its words');
  assert.match(nameSource(['<button title="Close"><svg></svg></button>']), /^only its title/);
  assert.match(nameSource(['<button><svg><path/></svg></button>']), /^nothing yet/);
  assert.deepEqual(statesOf(['<input type="checkbox" checked aria-invalid="true" disabled>']), ['checked', 'invalid (aria-invalid)', 'disabled']);
  assert.deepEqual(statesOf(['<button aria-disabled="true" disabled>x</button>']), ['disabled (aria-disabled)'], 'one word per state');
});

test('specs: role, name, states, keys and what a screen reader says; an open role decision said as one; a composite with no state left out', () => {
  const specs = specEdits(SNAP, VIEW, { heard: { button: ['Save file, button, dimmed'] } });
  assert.deepEqual(specs.map((s) => s.component), ['button', 'toggle', 'field']);
  const [button, toggle, field] = specs;
  assert.equal(button.kind, 'spec');
  assert.equal(button.nodeId, '1:1');
  assert.equal(button.role, 'button');
  assert.match(button.label, /^\*\*Accessibility spec\*\* \(from the code, replaced on each run\)\nRole: button\nName: aria-label \("Save file"\)\nStates: disabled\nKeys: Tab reaches it; Enter and Space press it\n/);
  assert.match(button.label, /A screen reader says: Save file, button, dimmed$/);
  assert.equal(toggle.role, null, 'Figma says switch, the code a toggle button: a decision, not a role to write');
  assert.match(toggle.label, /The role is a decision still open: Figma says switch, the code renders a togglebutton\./);
  assert.match(toggle.label, /States: pressed \(aria-pressed\)/);
  assert.match(toggle.label, /Behaviour: a click and Space flip aria-pressed/);
  assert.match(field.label, /Keys: Tab reaches it; typing writes into it$/);
  assert.doesNotMatch(field.label, /Behaviour:/, 'what the keys line says is not said twice');
  assert.equal(field.role, 'textbox', 'the spec the last run wrote is not read as the person\'s role');
  assert.match(field.label, /Name: its label\nStates: invalid \(aria-invalid\), required/);
  assert.match(field.why, /^a textbox, named by its label, 2 states$/);
  assert.deepEqual(specEdits(SNAP, [{ ...VIEW[0], markupFrom: 'role' }]), [], 'a markup drawn from a role is not the code');
});

test('the run lists the specs and the review, and asks before either is written', () => {
  const edits = [...specEdits(SNAP, VIEW), ...reviewEdits(FINDINGS, SCREENS)];
  const lines = editLines(edits, { fileKey: 'K' }).join('\n');
  assert.doesNotMatch(lines, /Figma states every role/, 'a role the spec states is not reported as already there');
  assert.match(lines, new RegExp(`Accessibility specs from the code \\(3\\), one annotation per component in the category "${SPEC_CATEGORY}"`));
  assert.match(lines, /• button: a button, named by aria-label \("Save file"\), 1 state/);
  assert.match(lines, /Accessibility findings pinned on the screens in Figma \(4 to fix on 3 screens/);
  assert.match(lines, /• Start: 3 to fix, pinned on 2 layers/);
  assert.match(lines, /• Export \(10:2\): 1 to fix, said in the screen's summary \(read the screens again with --figma-a11y/);
  assert.match(lines, /• Export \(10:3\): nothing to fix/);
  assert.match(lines, /NEXT: show the person the 3 accessibility specs and accessibility review above and ask; only when they say yes/);
});

test('an annotation the engine wrote is not listed as one no check reads', () => {
  const snap = { a: { nodeId: '1:1', annotations: [] } };
  const usesOf = () => [{ text: '**Accessibility spec** (from the code)\nRole: button', uses: [] }, { text: '**Accessibility Review**: 1 to fix', uses: [] }, { text: 'button', uses: [] }];
  const [notes] = annotationEdits(snap, usesOf);
  assert.deepEqual(notes.items.map((i) => i.text), ['button']);
});

// A stand-in for the Figma plugin API: nodes with annotations, children, and an annotation category store.
function fakeFigma() {
  const cats = [{ id: 'c0', label: 'Intent' }];
  const node = (id, name, parent, type = 'FRAME') => ({ id, name, type, parent, annotations: [], children: [] });
  const page = { id: '0:1', type: 'PAGE', loadAsync: async () => {} };
  const screen = node('10:1', 'Start', page);
  const a = node('10:5', 'Cancel', screen), b = node('10:6', 'Close', screen), inst = node('10:7', 'Card', screen, 'INSTANCE'), inner = node('10:8', 'Inner', inst);
  screen.children = [a, b, inst]; inst.children = [inner];
  screen.findAll = (f) => [a, b, inst, inner].filter(f);
  const comp = node('1:1', 'button', page, 'COMPONENT_SET');
  comp.annotations = [{ label: 'Keep the label short' }, { labelMarkdown: '**Accessibility spec** (old)\nRole: link', categoryId: 'c1' }];
  const nodes = Object.fromEntries([screen, a, b, inst, inner, comp].map((n) => [n.id, n]));
  const figma = {
    annotations: {
      getAnnotationCategoriesAsync: async () => cats,
      addAnnotationCategoryAsync: async ({ label, color }) => { const c = { id: `c${cats.length + 1}`, label, color }; cats.push(c); return c; },
    },
    getNodeByIdAsync: async (id) => nodes[id] ?? null,
  };
  return { figma, nodes, cats };
}
const run = (script, figma) => new Function('figma', `return (async () => { ${script} })();`)(figma);

test('the script pins the review and writes the specs in their categories, replacing the last run\'s; a second run changes nothing more', async () => {
  const edits = [...reviewEdits(FINDINGS.slice(0, 3), SCREENS.slice(0, 1)), ...specEdits(SNAP, VIEW.slice(0, 1))];
  const script = applyScript(edits);
  const { figma, nodes, cats } = fakeFigma();
  const out = await run(script, figma);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(out.changed, ['Start: review summary and 2 pinned', 'button → accessibility spec']);
  const review = cats.find((c) => c.label === REVIEW_CATEGORY), spec = cats.find((c) => c.label === SPEC_CATEGORY);
  assert.equal(review.color, 'red');
  assert.equal(spec.color, 'blue');
  assert.equal(nodes['10:1'].annotations.length, 1);
  assert.equal(nodes['10:1'].annotations[0].categoryId, review.id);
  assert.match(nodes['10:5'].annotations[0].labelMarkdown, /"Cancel"[\s\S]*iconButton/);
  assert.equal(nodes['10:6'].annotations.length, 1);
  const specs = nodes['1:1'].annotations;
  assert.deepEqual(specs[0], { label: 'Keep the label short' }, 'a person\'s note is kept');
  assert.equal(specs.length, 2, 'the old spec is replaced, not added to');
  assert.match(specs[1].labelMarkdown, /Role: button/);
  assert.equal(specs[1].categoryId, spec.id);
  // The second run: what is fixed clears, nothing is doubled.
  nodes['10:8'].annotations = [{ labelMarkdown: '**Accessibility Review**\nold', categoryId: review.id }];
  await run(applyScript([...reviewEdits([FINDINGS[1]], SCREENS.slice(0, 1)), ...specEdits(SNAP, VIEW.slice(0, 1))]), figma);
  assert.equal(nodes['10:1'].annotations.length, 1);
  assert.match(nodes['10:1'].annotations[0].labelMarkdown, /1 to fix/);
  assert.doesNotMatch(nodes['10:5'].annotations[0].labelMarkdown, /"Cancel"/, 'the fixed contrast cleared');
  assert.equal(nodes['10:8'].annotations.length, 1, 'a node inside an instance is not touched');
  assert.equal(nodes['1:1'].annotations.length, 2);
  assert.equal(cats.length, 3, 'each category made once');
});
