// A component's spec drawn in Figma beside its component set, from its contract alone (spec-frames.mjs), through the
// hand-back (figma-edits.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { specOf, fingerprint } from '../lib/spec-frames.mjs';
import { specFrameEdits, applyScript, editLines } from '../lib/figma-edits.mjs';

const contract = {
  name: 'acmeButton', figmaNodeId: '1:2',
  props: [
    { name: 'size', type: 'enum', default: 'm', options: ['s', 'm', 'l'] },
    { name: 'icon', type: 'instance', default: '84:12' },
  ],
  anatomy: {
    root: { height: 40, typographyToken: '{typography.s/strong}' },
    Label: { selector: '.label', typographyToken: '{typography.s/strong}' },
    Icon: { selector: '.icon' },
    acmeButton: { selector: '.acme-button' },
    Content: { gapToken: '{spacing.gap.s}', inset: { blockToken: '{spacing.padding.s}', inlineToken: '{spacing.padding.m}' } },
  },
  states: [{ name: 'hover' }, { name: 'disabled' }],
  tokens: { used: ['acme/button/background/color', 'acme/button/label/color'] },
  accessibility: { element: { value: 'button' }, role: { value: 'button' }, name: { value: 'its words' }, keyboard: { value: ['Enter', 'Space'] } },
};

test('the spec says only what the contract holds', () => {
  const s = specOf(contract, { sizes: { 'size=m': { paddingPx: [8, 8, 8, 8], gapPx: 4, radiusPx: [0, 0, 0, 0], fontSize: 14 } } });
  assert.equal(s.title, 'acmeButton · spec');
  assert.equal(s.nodeId, '1:2');
  // Each part numbered; the root is said once, and an entry named as the component itself is no part.
  assert.deepEqual(s.parts.map((p) => `${p.n} ${p.name}`), ['1 Label', '2 Icon', '3 Content']);
  const sec = Object.fromEntries(s.sections.map((x) => [x.title, x.lines]));
  assert.deepEqual(Object.keys(sec), ['Anatomy', 'Properties', 'States', 'Tokens', 'Sizes', 'Accessibility']);
  assert.ok(sec.Anatomy.includes('Height 40px'));
  assert.ok(sec.Anatomy.some((l) => /^3 {2}Content · gap: spacing\.gap\.s · inset block: spacing\.padding\.s/.test(l)));
  // An option list with its default; a swap's node id is no default anyone reads.
  assert.deepEqual(sec.Properties, ['size (enum): s | m | l, default m', 'icon (instance)']);
  assert.deepEqual(sec.States, ['hover · disabled']);
  assert.deepEqual(sec.Sizes, ['size=m: padding 8, gap 4, radius 0, text 14']);
  assert.deepEqual(sec.Accessibility, ['Element: button', 'Role: button', 'Named by: its words', 'Keys: Enter, Space']);
});

test('a changed contract is a changed spec; an unchanged one is the same', () => {
  assert.equal(fingerprint(contract), fingerprint(JSON.parse(JSON.stringify(contract))));
  assert.notEqual(fingerprint(contract), fingerprint({ ...contract, states: [{ name: 'hover' }] }));
  // A contract with no Figma node has nowhere to be drawn.
  assert.equal(specOf({ ...contract, figmaNodeId: null }), null);
});

test('the hand-back draws each spec beside its set, leaves a current one, and keeps the way back', () => {
  const edits = specFrameEdits([specOf(contract)]);
  assert.equal(edits[0].kind, 'specframes');
  const script = applyScript(edits);
  // A frame drawn from the contract as it is now is left as it is.
  assert.match(script, /getSharedPluginData\('rms_dse', 'spec'\) === s\.fingerprint\) \{ current\+\+; continue; \}/);
  assert.match(script, /setSharedPluginData\('rms_dse', 'spec', s\.fingerprint\)/);
  // A part with no layer of its name is said, never marked at a guess.
  assert.match(script, /unplaced\.push\(s\.component \+ ' › ' \+ p\.name\)/);
  assert.match(script, /U\.made\(box, s\.title\)/);
  assert.match(script, /U\.remade\(s\.title/);
  assert.match(editLines(edits).join('\n'), /acmeButton: Anatomy, Properties, States, Tokens, Accessibility, 3 parts marked/);
  assert.deepEqual(specFrameEdits([]), []);
});
