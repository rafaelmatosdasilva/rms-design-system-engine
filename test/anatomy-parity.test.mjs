// Figma's anatomy and the code's held against each other (anatomy-parity.mjs): the corners, one variable for all four or
// each its own, and each part shown always or on a condition. Each difference names the part and the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figmaAnatomy, anatomyFindings, conditionalClasses } from '../lib/anatomy-parity.mjs';
import { anatomyOf } from '../lib/code-grammar.mjs';

// A Figma component: its corners bound to variables, and named layers, some shown by a property.
const entry = (corners, layers) => ({
  binds: { 'size=m': { '': Object.fromEntries(['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].map((k, i) => [k, corners[i]]).filter(([, v]) => v)) } },
  trees: [{ t: 'COMPONENT', c: layers }],
});
const layer = (n, wired = null, c = []) => ({ t: 'FRAME', n, ...(wired ? { wired: { visible: wired } } : {}), c });

const vue = (template, css) => ({ file: 'src/Chip.vue', text: `<template>\n${template}\n</template>\n<style>\n${css}\n</style>\n` });
const read = ({ file, text }) => anatomyOf({ file, text, styles: [{ file, text: text.split('<style>')[1].split('</style>')[0], roots: ['chip'] }], root: 'chip' });

test('Figma\'s side: one variable for all four corners, or each its own; a name two layers share with different wiring is no part', () => {
  assert.deepEqual(figmaAnatomy(entry(['r/all', 'r/all', 'r/all', 'r/all'], [])).corners, { shared: true, vars: ['r/all'] });
  assert.deepEqual(figmaAnatomy(entry(['r/tl', 'r/tr', 'r/br', 'r/bl'], [])).corners, { shared: false, vars: ['r/tl', 'r/tr', 'r/br', 'r/bl'] });
  assert.equal(figmaAnatomy(entry([], [])).corners, null, 'no corner bound: nothing to compare');
  const parts = figmaAnatomy(entry([], [layer('Icon', 'showIcon'), layer('Label'), layer('Group', null, [layer('Label', 'showHint')])])).parts;
  assert.deepEqual(parts.Icon, { wired: 'showIcon' });
  assert.equal(parts.Label, undefined, 'Label is shown by a property in one place and always in another: says nothing of one part');
});

test('a part is conditional when it, or anything around it, carries a condition', () => {
  const m = conditionalClasses('src/Chip.vue', '<template><div class="chip"><div v-if="x" class="wrap"><span class="label">a</span></div><i class="icon"/><b v-show="y" class="hint">h</b></div></template>');
  assert.equal(m.get('label'), true, 'inside a v-if');
  assert.equal(m.get('wrap'), true);
  assert.equal(m.get('icon'), false, 'a self-closing tag closes nothing around it');
  assert.equal(m.get('hint'), true);
  assert.equal(conditionalClasses('src/Chip.jsx', '<div className="chip">{hint && <span className="hint">h</span>}<span className="label">l</span></div>').get('hint'), true, 'after && in JSX');
});

test('each difference names the part and the line: shown by a property against always, always against on a condition, corners one against apart', () => {
  const code = vue('<div class="chip">\n  <span v-if="label" class="label">{{ label }}</span>\n  <base-icon class="icon"/>\n</div>', '.chip { border-radius: 4px 8px 4px 8px; }');
  const found = anatomyFindings({ name: 'chip', file: code.file, text: code.text, anatomy: read(code),
    entry: entry(['r/all', 'r/all', 'r/all', 'r/all'], [layer('Label'), layer('Icon', 'showIcon'), layer('icon', 'showIcon')]) });
  const says = Object.fromEntries(found.map((f) => [f.part ?? '(corners)', f.message]));
  assert.match(says.Label, /^chip › Label: it is always shown in Figma and on a condition in the code\. .*\(src\/Chip\.vue:3\)\.$/);
  assert.match(says.Icon ?? says.icon, /shown by a property in Figma and always in the code\. Figma shows it by its "showIcon" property; the code always renders it \(src\/Chip\.vue:4\)/);
  assert.equal(found.filter((f) => /showIcon/.test(f.message)).length, 1, 'two Figma layers paired with one class: one finding');
  assert.match(says['(corners)'], /its corners are one in Figma and apart in the code\. Figma binds all four to r\/all; the code sets each corner on its own/);
});

test('what both sides build alike, or one side does not say, is never a finding', () => {
  const code = vue('<div class="chip">\n  <span v-if="label" class="label">{{ label }}</span>\n  <span class="note">n</span>\n</div>', '.chip { border-radius: var(--chip-radius); }');
  const found = anatomyFindings({ name: 'chip', file: code.file, text: code.text, anatomy: read(code),
    entry: entry(['r/all', 'r/all', 'r/all', 'r/all'], [layer('Label', 'showLabel'), layer('Note'), layer('Badge')]) });
  assert.deepEqual(found, [], 'Label shown by a property and on a condition, Note always on both, Badge in Figma only, corners one on both');
});
