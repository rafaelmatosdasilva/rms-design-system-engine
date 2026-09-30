// I58, the owner's rule: a prop value is in parity only when its name is exactly the same on both sides.
// "L" and "large", or "Large" and "large", still fail; the finding only adds which code value it most likely is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from './helpers.mjs';
import { counterpart, rejectedNames, rightFor } from '../prop-vocabulary.mjs';

const GATE = 'component-prop-check.mjs';
const project = (figmaOptions, codeUnion) => ({
  'ds-config.json': { paths: { snapshotVars: 'figma-vars.snapshot.json' }, componentSrcDirs: ['src'] },
  'figma-component-props.snapshot.json': { Tag: { properties: { Size: { type: 'VARIANT', defaultValue: figmaOptions[0], variantOptions: figmaOptions } } } },
  'src/Tag.vue': `<script setup lang="ts">\ndefineProps<{ size?: ${codeUnion.map((v) => `'${v}'`).join(' | ')} }>()\n</script>\n<template><span class="tag"></span></template>\n`,
});

test('the same name on both sides passes', () => {
  const { code, out } = runGate(GATE, project(['small', 'large'], ['small', 'large']));
  assert.equal(code, 0, out);
});

test('a value named differently fails, with the code value it corresponds to as a hint', () => {
  const { code, out } = runGate(GATE, project(['S', 'L'], ['small', 'large']));
  assert.equal(code, 1, out);
  assert.match(out, /Tag\/Size: code prop "size" is missing Figma variant option\(s\) "S" \(the code likely names it "small"\), "L" \(the code likely names it "large"\)/);
});

test('the code\'s values are read as written, so Primary matches Primary', () => {
  const { code, out } = runGate(GATE, project(['Primary', 'Secondary'], ['Primary', 'Secondary']));
  assert.equal(code, 0, out);
});

test('letter case is part of the name', () => {
  const { code, out } = runGate(GATE, project(['Small', 'Large'], ['small', 'large']));
  assert.equal(code, 1, out);
  assert.match(out, /"Large" \(the code writes it "large"\)/);
});

test('the vocabulary: counterparts by meaning, never for the same name; rejected names never include a right one', () => {
  assert.equal(counterpart('L', ['small', 'large']), 'large');
  assert.equal(counterpart('Error', ['danger', 'info']), 'danger');
  assert.equal(counterpart('large', ['small', 'large']), null);   // the same name is not a counterpart
  assert.equal(counterpart('purple', ['danger']), null);
  const r = rejectedNames({ figma: ['M', 'L'], code: ['medium', 'large'] });
  assert.equal(r.M, 'medium'); assert.equal(r.lg, 'large');
  assert.ok(!('large' in r) && !('medium' in r));
  assert.equal(rightFor(r, 'LG'), 'large');
});
