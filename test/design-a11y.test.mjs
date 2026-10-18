// design-a11y.mjs: accessibility the Figma file owes, read from the snapshots every project has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designA11yFindings, designA11ySheetLines, designA11yBlock, annotatedRole } from '../design-a11y.mjs';

const props = {
  button: { annotations: [{ label: 'Role: button' }], properties: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Focus'] } } },
  chip: { annotations: [{ label: 'Role: togglebutton' }], properties: { Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] } } },
  field: { annotations: [{ label: 'Role: textbox' }], properties: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Error'] } } },
  field2: { annotations: [{ label: 'Role: textbox' }], properties: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Focused', 'Error'] }, 'Error message#2:1': { type: 'TEXT', defaultValue: 'Required' } } },
  tag: { properties: {} },
  pill: { annotations: [{ label: 'Role: button' }], properties: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Focus'] } } },
};
const structure = { pill: { h: 20 }, field: { variants: { 'State=Default': { layers: ['Input'] }, 'State=Error': { layers: ['Input'] } }, defaultVariant: 'State=Default' } };

test('an interactive component with no focus state, an error with no message, a control under 24px; a component with no role is left alone', () => {
  assert.equal(annotatedRole(props.chip), 'togglebutton');
  const f = designA11yFindings(props, structure);
  assert.deepEqual(f.map((x) => `${x.component} ${x.kind}`), ['chip nofocus', 'field nofocus', 'field colouronly', 'pill small']);
  assert.match(designA11yBlock(f).join('\n'), /chip, field have no focus state in Figma/);
  assert.deepEqual(designA11yFindings(props, structure, { only: ['pill'] }).map((x) => x.kind), ['small']);
});

test('the build sheet writes a focus ring meanwhile and leaves the message\'s words to the person', () => {
  const lines = designA11ySheetLines(designA11yFindings(props, structure), 'field');
  assert.match(lines[0], /a visible focus ring on :focus-visible/);
  assert.match(lines[1], /never invent its words/);
  assert.deepEqual(designA11ySheetLines(designA11yFindings(props, structure), 'button'), []);
});
