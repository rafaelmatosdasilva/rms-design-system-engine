// What each text and icon is drawn on, as the capture records it (paintFacts, taken from the refresh recipe unchanged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeFunctions } from '../lib/figma-capture.mjs';
import { designContrastFindings, unmeasuredOnSurface, designA11yBlock } from '../lib/design-a11y.mjs';

// A small Plugin API: nodes with parents, boxes, findAll and findOne, and variables by id.
function tree(spec, parent = null) {
  const n = { visible: true, fills: [], ...spec, parent };
  n.children = (spec.children ?? []).map((c) => tree(c, n));
  n.findAll = (f) => n.children.flatMap((c) => [...(f(c) ? [c] : []), ...c.findAll(f)]);
  n.findOne = (f) => n.findAll(f)[0] ?? null;
  return n;
}
const fill = (id) => [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id } } }];
const at = (x, y, width, height) => ({ absoluteBoundingBox: { x, y, width, height } });
const VARS = { 'v:text': 'button/label/color', 'v:fill': 'button/background/color', 'v:card': 'card/background/color', 'v:merged': 'tick/color' };
const figma = { variables: { getVariableByIdAsync: async (id) => (VARS[id] ? { name: VARS[id] } : null) } };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const paintFacts = await new AsyncFunction('figma', `${recipeFunctions(undefined, ['prop', 'parseAxes', 'restingVariant', 'paintFacts']).join('\n')}\nreturn paintFacts;`)(figma);

test('a label beside a state instance is drawn on the fill inside it, not on the page', async () => {
  // The button's fill is on the Background inside its StateLayer instance, the layer before the label's frame.
  const set = tree({ type: 'COMPONENT_SET', name: 'buttonBold', children: [
    { type: 'COMPONENT', name: 'size=m, disabled=false', ...at(0, 0, 120, 48), children: [
      { type: 'INSTANCE', name: 'StateLayer', ...at(0, 0, 120, 48), children: [
        { type: 'RECTANGLE', name: 'Shadow', ...at(0, 4, 120, 48), fills: fill('v:card') },
        { type: 'RECTANGLE', name: 'Background', ...at(0, 0, 120, 48), fills: fill('v:fill') },
      ] },
      { type: 'FRAME', name: 'Content', ...at(16, 12, 88, 24), children: [{ type: 'TEXT', name: 'label', ...at(16, 12, 60, 24), fills: fill('v:text') }] },
    ] },
  ] });
  const f = await paintFacts(set);
  assert.deepEqual(f.drawnOn, [{ fg: 'button/label/color', on: 'button/background/color', icon: false }], 'the topmost fill under it, inside the instance');
});

test('what a boolean operation merges is never a backdrop, and a label on nothing is on the surface', async () => {
  const set = tree({ type: 'COMPONENT_SET', name: 'checkboxRound', children: [
    { type: 'COMPONENT', name: 'state=default', ...at(0, 0, 100, 24), children: [
      // A check mark whose merged shapes carry a fill: Figma paints the Union, which has none.
      { type: 'BOOLEAN_OPERATION', name: 'Union', ...at(0, 0, 100, 24), children: [{ type: 'RECTANGLE', name: 'Tick', ...at(0, 0, 100, 24), fills: fill('v:merged') }] },
      { type: 'TEXT', name: 'Label', ...at(32, 0, 60, 24), fills: fill('v:text') },
    ] },
  ] });
  const f = await paintFacts(set);
  assert.deepEqual(f.drawnOn, [{ fg: 'button/label/color', on: 'surface', icon: false }]);
});

test('a colour on the page with no surface known is said to be unmeasured, never passed', () => {
  const vars = { color: { light: { 'checkbox/text/color': '#333333', 'brand/blue/color': '#0037fa' } } };   // no token named as a surface
  const structure = { checkboxRound: { drawnOn: [{ fg: 'checkbox/text/color', on: 'surface' }] } };
  assert.deepEqual(designContrastFindings(vars, structure, { derive: false }), [], 'nothing to measure it against');
  const left = unmeasuredOnSurface(vars, structure);
  assert.deepEqual(left, [{ component: 'checkboxRound', fg: 'checkbox/text/color' }]);
  const lines = designA11yBlock([], { unmeasured: left });
  assert.match(lines.join('\n'), /not everything was measured[\s\S]*1 text and icon colour \(checkboxRound\) sits on nothing[\s\S]*a11y\.surfaces/);
  // Once a surface is named, it is measured, and nothing is left unmeasured.
  assert.deepEqual(unmeasuredOnSurface(vars, structure, { surfaces: { light: [{ token: 'page', value: '#ffffff' }] } }), []);
});
