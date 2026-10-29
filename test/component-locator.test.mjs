// component-locator.mjs — the one answer to "which elements are component X", shared by every gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { createLocator, loadLocator, leadingToken } from '../component-locator.mjs';

test('resolution order: componentSelectors, then the contract selector map, then a selector-like name, then the convention', () => {
  const L = createLocator(
    { componentSelectors: { Tooltip: '#tooltip', segmentedControl: '.segmented button' } },
    { contractSelectors: { segmentedControl: { main: '.never-used' }, checkBox: { main: '.checkbox' } } },
  );
  assert.equal(L.selectorFor('Tooltip'), '#tooltip');
  assert.equal(L.sourceOf('Tooltip'), 'componentSelectors');
  assert.equal(L.selectorFor('segmentedControl'), '.segmented button');           // config beats the contract
  assert.equal(L.classFor('segmentedControl'), '.segmented');                     // leading token of a compound selector
  assert.equal(L.selectorFor('checkBox'), '.checkbox');                           // the contract, not ".checkBox"
  assert.equal(L.sourceOf('checkBox'), 'contract');
  assert.equal(L.selectorFor('.appWindow'), '.appWindow');                        // already a selector, never "..appWindow"
  assert.equal(L.selectorFor('ButtonSecondary'), '.buttonSecondary');             // the convention
  assert.equal(L.sourceOf('ButtonSecondary'), 'convention');
});

test('leadingToken picks the first class or id', () => {
  assert.equal(leadingToken('.a-b c .d'), '.a-b');
  assert.equal(leadingToken('#x > .y'), '#x');
  assert.equal(leadingToken('button'), null);
});

test('loadLocator reads COMPONENT_CSS_SELECTORS from the project contract, and survives a missing one', async () => {
  const dir = makeFixture({ 'ds-config.json': {} });
  assert.equal((await loadLocator(dir, {})).selectorFor('card'), '.card');
  writeFileSync(join(dir, 'structure-contract.mjs'), "export const COMPONENT_CSS_SELECTORS = { card: { main: '.card-box' } };\n");
  assert.equal((await loadLocator(dir, {})).selectorFor('card'), '.card-box');
});

test('with no Figma data and no contract, the class comes from the component\'s own code before the convention', async () => {
  const { codeRootClasses } = await import('../component-locator.mjs');
  const dir = makeFixture({
    'ds-config.json': {},
    // The name in another spelling, on the first element of the template.
    'src/components/library/buttons/Primary.vue': '<template>\n  <button\n  class="button-primary"\n  :disabled="disabled">\n  </button>\n</template>\n',
    // A class of its own: found by its folder and file (buttons/Secondary.vue is buttonSecondary).
    'src/components/library/buttons/Secondary.vue': '<!-- the secondary button -->\n<template>\n  <button class="button-secondary-container"></button>\n</template>\n',
    // The convention's own class in the code: the convention stays.
    'src/components/Card.vue': '<template><div class="card"></div></template>',
    'src/components/card-box/index.vue': '<template><section class="card-box"></section></template>',
    // React: the first className.
    'src/components/IconButton.tsx': 'export function IconButton() { return <button className="icon-button">x</button>; }',
    // A root with no static class tells nothing.
    'src/components/inputs/General.vue': '<template><component :is="x" /></template>',
  });
  const L = await loadLocator(dir, {});
  assert.deepEqual([L.selectorFor('ButtonPrimary'), L.sourceOf('ButtonPrimary')], ['.button-primary', 'code']);
  assert.equal(L.selectorFor('buttonSecondary'), '.button-secondary-container');
  assert.deepEqual([L.selectorFor('card'), L.sourceOf('card')], ['.card', 'convention']);
  assert.equal(L.selectorFor('IconButton'), '.icon-button');
  assert.deepEqual([L.selectorFor('inputPlain'), L.sourceOf('inputPlain')], ['.inputPlain', 'convention']);
  // Config and contract still come first.
  assert.equal((await loadLocator(dir, { componentSelectors: { ButtonPrimary: '.bp' } })).selectorFor('ButtonPrimary'), '.bp');
  assert.equal(codeRootClasses([]).byName.size, 0);
});

test('a root past a wrapper with no class, and a name nested deeper than the code\'s folders, still find the code\'s class', async () => {
  const dir = makeFixture({
    'ds-config.json': {},
    // A transition, or another component around it (a hint), with no class of its own: its first child draws.
    'src/components/library/panels/Bar.vue': '<template>\n  <transition name="slide" appear>\n    <div v-if="on" class="panel-bar-wrapper"></div>\n  </transition>\n</template>\n',
    'src/components/library/navigation/TileWide.vue': '<template>\n  <!-- hint -->\n  <hint-box :label="hint">\n    <button class="tile-wide-container"></button>\n  </hint-box>\n</template>\n',
    // Figma nests it deeper than the folders do: grid/Slot/toggle is grids/body/slots/Toggle.vue.
    'src/components/library/grids/body/slots/Toggle.vue': '<template><label class="slot-toggle"></label></template>',
  });
  const L = await loadLocator(dir, {});
  assert.deepEqual([L.selectorFor('panelBar'), L.sourceOf('panelBar')], ['.panel-bar-wrapper', 'code']);
  assert.equal(L.selectorFor('navigation/TileWide'), '.tile-wide-container', 'a name with a slash, by its folder and file');
  assert.equal(L.selectorFor('grid/Slot/toggle'), '.slot-toggle', 'its last two parts, as the folder and file spell them');
  assert.deepEqual([L.selectorFor('grid/Slot/missing'), L.sourceOf('grid/Slot/missing')], ['.grid/Slot/missing', 'convention'], 'no file: the convention, for the check to find another way');
});
