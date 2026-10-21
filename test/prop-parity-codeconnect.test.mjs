// Gate 14 reads the project's own Code Connect file the way it is written: a property that only decides whether an
// attribute is written is that attribute's condition, not a missing prop; a Figma value written another way in the code
// (Small → sm) is compared through that map; a true/false the code holds the other way round (showCaption ↔ hideCaption)
// is compared inverted; and a Vue Boolean given no default is false, so a Figma default of true is a real difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from './helpers.mjs';
import { invertsValue, flipBoolean } from '../prop-binding.mjs';

const GATE = 'component-prop-check.mjs';
const project = ({ outlinedDefault = true } = {}) => ({
  'ds-config.json': { paths: { snapshotVars: 'figma-vars.snapshot.json' }, componentSrcDirs: ['src'] },
  'figma-component-props.snapshot.json': { tileOne: { properties: {
    size: { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small', 'Large'] },
    showCaption: { type: 'BOOLEAN', defaultValue: true },
    showIcon: { type: 'BOOLEAN', defaultValue: true },
    outlined: { type: 'BOOLEAN', defaultValue: outlinedDefault },
    tint: { type: 'BOOLEAN', defaultValue: false },
  } } },
  'src/Tile.vue': `<script setup lang="ts">\ndefineProps<{ size?: 'sm' | 'lg'; hideCaption?: boolean; icon?: string; outlined?: boolean }>()\n</script>\n<template><div class="tile-one"></div></template>\n`,
  'src/Tile.figma.js': `// url=https://www.figma.com/design/AbC/tileOne?node-id=10-20
import figma from 'figma'
const size = figma.selectedInstance.getEnum('size', { Small: 'sm', Large: 'lg' })
const showCaption = figma.selectedInstance.getBoolean('showCaption')
const showIcon = figma.selectedInstance.getBoolean('showIcon')
const outlined = figma.selectedInstance.getBoolean('outlined')
const tint = figma.selectedInstance.getBoolean('tint')
export default {
  example: figma.html\`
<tile-one
  size="\${size}"
  :hideCaption="\${!showCaption}"
  \${showIcon ? 'icon="star"' : ''}
  \${outlined ? 'outlined' : ''}
/>\`,
  imports: ["import Tile from './Tile'"],
}`,
});

test('a condition is a match, a value map and an inverted pair compare equal, a Vue Boolean defaults to false', () => {
  const { code, out } = runGate(GATE, project());
  assert.equal(code, 1, out);
  assert.match(out, /✅ OK        4\n❌ MISSING   1 /, "size, showCaption, showIcon (a condition of icon) and outlined pair; tint is the one missing");
  assert.doesNotMatch(out, /tileOne\/size: (default differs|code prop)/, 'Small is written sm');
  assert.doesNotMatch(out, /tileOne\/showCaption: default differs/, 'showCaption on is hideCaption false');
  assert.match(out, /tileOne\/outlined: default differs - Figma "true" vs code "outlined=false"/);
  assert.doesNotMatch(out, /"showIcon" has no code prop/);
  assert.match(out, /tileOne: Figma property "tint" has no code prop .* its Code Connect file reads it but writes no attribute/);
  const same = runGate(GATE, project({ outlinedDefault: false }));
  assert.doesNotMatch(same.out, /outlined: default differs/);
});

test('a pair is inverted by the project\'s word, its Code Connect file, or names that say opposite things', () => {
  assert.equal(invertsValue('showCaption', 'hideCaption'), true);
  assert.equal(invertsValue('Show caption#1:2', 'noCaption'), true);
  assert.equal(invertsValue('showCaption', 'hasCaption'), false);
  assert.equal(invertsValue('notchWidth', 'showTile'), false, '"notch" is not "no"');
  assert.equal(invertsValue('captionWords', 'muted', { codeConnectProps: [{ figma: 'captionWords', code: 'muted', role: 'value', negated: true }] }), true);
  assert.equal(invertsValue('showCaption', 'hideCaption', { authored: { negated: false } }), false, 'the project\'s word wins');
  assert.equal(flipBoolean(true), 'false'); assert.equal(flipBoolean('False'), 'true'); assert.equal(flipBoolean('x'), 'x');
});
