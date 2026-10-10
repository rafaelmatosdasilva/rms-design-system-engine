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
  assert.deepEqual([L.selectorFor('inputGeneral'), L.sourceOf('inputGeneral')], ['.inputGeneral', 'convention']);
  // Config and contract still come first.
  assert.equal((await loadLocator(dir, { componentSelectors: { ButtonPrimary: '.bp' } })).selectorFor('ButtonPrimary'), '.bp');
  assert.equal(codeRootClasses([]).byName.size, 0);
});
