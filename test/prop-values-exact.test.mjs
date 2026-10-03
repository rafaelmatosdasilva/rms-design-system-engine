// I58, the owner's rule: a prop value is in parity only when its name is exactly the same on both sides.
// "L" and "large", or "Large" and "large", still fail; the finding only adds which code value it most likely is.
// The same holds for a prop's own name: Figma "Size" and code "size" are two names, and the finding shows the
// letters that differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from './helpers.mjs';
import { counterpart, rejectedNames, rightFor } from '../prop-vocabulary.mjs';

const GATE = 'component-prop-check.mjs';
const project = (figmaOptions, codeUnion, { figmaProp = 'size', codeProp = 'size' } = {}) => ({
  'ds-config.json': { paths: { snapshotVars: 'figma-vars.snapshot.json' }, componentSrcDirs: ['src'] },
  'figma-component-props.snapshot.json': { Tag: { properties: { [figmaProp]: { type: 'VARIANT', defaultValue: figmaOptions[0], variantOptions: figmaOptions } } } },
  'src/Tag.vue': `<script setup lang="ts">\ndefineProps<{ ${codeProp}?: ${codeUnion.map((v) => `'${v}'`).join(' | ')} }>()\n</script>\n<template><span class="tag"></span></template>\n`,
});

test('the same name on both sides passes', () => {
  const { code, out } = runGate(GATE, project(['small', 'large'], ['small', 'large']));
  assert.equal(code, 0, out);
});

test('a value named differently fails, with the code value it corresponds to as a hint', () => {
  const { code, out } = runGate(GATE, project(['S', 'L'], ['small', 'large']));
  assert.equal(code, 1, out);
  assert.match(out, /Tag\/size: code prop "size" is missing Figma variant option\(s\) "S" \(the code likely names it "small"\), "L" \(the code likely names it "large"\)/);
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

test('a prop name that differs only in letter case fails, and the finding shows the letters', () => {
  const { code, out } = runGate(GATE, project(['small', 'large'], ['small', 'large'], { figmaProp: 'Size' }));
  assert.equal(code, 1, out);
  assert.match(out, /❌ NAME      1/);
  assert.match(out, /Tag\/Size: the code names it "size" \(letter case S → s\)/);
  const two = runGate(GATE, project(['small'], ['small'], { figmaProp: 'Is Open', codeProp: 'isOpen' }));
  assert.match(two.out, /Tag\/Is Open: the code names it "isOpen" \(letter case I → i; spaces or separators\)/);
});

test('a Figma instance swap realized as a code slot follows the same rule: the slot name as written', () => {
  const slotProject = (figmaProp, slotName) => ({
    'ds-config.json': { paths: { snapshotVars: 'figma-vars.snapshot.json' }, componentSrcDirs: ['src'] },
    'figma-component-props.snapshot.json': { Tag: { properties: { [`${figmaProp}#1:2`]: { type: 'INSTANCE_SWAP', defaultValue: '9:9' } } } },
    'src/Tag.vue': `<template><span class="tag"><slot name="${slotName}" /></span></template>\n`,
  });
  const exact = runGate(GATE, slotProject('leadingIcon', 'leadingIcon'));
  assert.equal(exact.code, 0, exact.out);
  const differs = runGate(GATE, slotProject('Leading Icon', 'leadingIcon'));
  assert.equal(differs.code, 1, differs.out);
  assert.match(differs.out, /Tag\/Leading Icon: the code names its slot "leadingIcon" \(letter case L → l; spaces or separators\)/);
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

// A React component's destructured props, every one of them: `{ children, label, … }` used to lose every prop that
// followed a plain one, because each match took the comma the next one starts with.
const reactProject = (authored) => ({
  'ds-config.json': { paths: { snapshotVars: 'figma-vars.snapshot.json' }, componentSrcDirs: ['src'] },
  'figma-component-props.snapshot.json': { Button: { properties: {
    'Label#3:4': { type: 'TEXT', defaultValue: 'Save' }, Disabled: { type: 'BOOLEAN', defaultValue: false } } } },
  'src/Button.jsx': `export function Button({\n  children,\n  label,\n  disabled = false,\n  type = 'button',\n}) {\n  return <button className="button" type={type} disabled={disabled}>{children ?? label}</button>;\n}\n`,
  ...(authored ? { 'contract.authored.json': { components: { Button: { bindings: authored } } } } : {}),
});

test('every destructured React prop is read, so label is found', async () => {
  const { extractReact } = await import('../component-source.mjs');
  assert.deepEqual([...extractReact('function A({ a, b, c = 1, d: e, f })')], ['a', 'b', 'c', 'd', 'f']);
  const { out } = runGate(GATE, reactProject(null));
  assert.doesNotMatch(out, /Figma property "Label" has no code prop/);
  assert.match(out, /Button\/Label: the code names it "label"/);
});

test('a name recorded in contract.authored.json bindings is the agreed one, letter case included', () => {
  const { code, out } = runGate(GATE, reactProject({ Label: { attribute: 'label' }, Disabled: { attribute: 'disabled' } }));
  assert.equal(code, 0, out);
});
