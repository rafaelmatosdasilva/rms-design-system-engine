// A value written by hand, matched to the system's token, and the fix ready for a yes (token-match.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestColour, nearestSize, matchLine, figmaMatches, bindOps, codeFixes, deltaE } from '../lib/token-match.mjs';

test('a colour: the semantic token before the primitive when both hold it, else the nearest by how it looks', () => {
  const entries = [['--blue-500', '#3366ff'], ['--action-bg', '#3366ff'], ['--grey-100', '#f2f2f2']];
  assert.deepEqual(nearestColour('#3366FF', entries), { name: '--action-bg', hex: '#3366ff', delta: 0, exact: true });
  const near = nearestColour('#f0f0f0', entries);
  assert.equal(near.name, '--grey-100');
  assert.equal(near.exact, false);
  assert.ok(near.delta > 0 && near.delta < 4);
  assert.equal(nearestColour('#ff0000', entries), null, 'visibly another colour: none offered');
  assert.equal(deltaE('#000000', '#000000'), 0);
  assert.equal(matchLine(near), `the nearest is --grey-100 (#f2f2f2, ΔE ${near.delta})`);
  assert.equal(matchLine(null), 'the system has no token near it');
});

test('a size: the token that holds it, else the nearest with the difference', () => {
  const entries = [['space/m', 16], ['radii/chip', 8], ['space/s', 8]];
  assert.deepEqual(nearestSize(8, entries), { name: 'radii/chip', px: 8, diff: 0, exact: true });
  assert.deepEqual(nearestSize(14, entries), { name: 'space/m', px: 16, diff: 2, exact: false });
  assert.equal(matchLine(nearestSize(14, entries)), 'the nearest is space/m (16px, +2px)');
});

test('Figma\'s values with no variable are matched, and the exact ones become bindings --figma-change takes', () => {
  const values = { chip: { hygiene: { raw: [{ at: 'Size=M, State=Default/Label', field: 'fill', value: '#3366ff' }, { at: 'Size=M, State=Default', field: 'radius', value: 7 }, { at: 'Size=M, State=Default', field: 'opacity', value: 0.5 }] } }, _meta: {} };
  const vars = { color: { light: { 'action/bg': '#3366ff', 'blue/500': '#3366ff' } }, sizing: { 'radii/chip': '8' } };
  const m = figmaMatches(values, vars);
  assert.deepEqual(m.map((x) => [x.field, x.match?.name, x.match?.exact]), [['fill', 'action/bg', true], ['radius', 'radii/chip', false]]);
  assert.deepEqual(bindOps(m), { chip: [{ op: 'bind', layer: 'Label', field: 'fill', variable: 'action/bg', where: { Size: 'M', State: 'Default' } }] });
});

test('the code\'s fix is a patch that writes each exact token where its value was', async () => {
  const files = [{ file: 'src/card.css', text: '.card {\n  color: #3366ff;\n  border-color: #f0f0f0;\n}\n', findings: [{ line: 2, value: '#3366ff', token: 'var(--action-bg)' }, { line: 3, value: '#f0f0f0', token: null }] }];
  const { patch, count } = await codeFixes(files);
  assert.equal(count, 1, 'a nearest one is left for the person');
  assert.match(patch, /^--- a\/src\/card\.css\n\+\+\+ b\/src\/card\.css\n/);
  assert.match(patch, /-  color: #3366ff;\n\+  color: var\(--action-bg\);/);
  assert.doesNotMatch(patch, /\+  border-color/);
});

test('a value read on a node is bound by that node, so a layer that shares its name is never bound in its place', async () => {
  const values = { chip: { hygiene: { raw: [{ at: 'Size=M/Label', field: 'fill', value: '#3366ff', node: '12:34' }] } } };
  const m = figmaMatches(values, { color: { light: { 'action/bg': '#3366ff' } } });
  assert.deepEqual(bindOps(m), { chip: [{ op: 'bind', layer: 'Label', field: 'fill', variable: 'action/bg', where: { Size: 'M' }, node: '12:34' }] });
  const ops = await import('../lib/figma-ops.mjs');
  const src = (await import('node:fs')).readFileSync(new URL('../lib/figma-ops.mjs', import.meta.url), 'utf8');
  assert.match(src, /getNodeByIdAsync\(o\.node\)/, 'the script binds the node it names');
  assert.ok(ops.OPS.includes('bind'));
});

test('the capture keeps a value\'s node only where its path is shared by another layer', async () => {
  const { hygieneOf } = await import('../lib/figma-hygiene.mjs');
  const dot = (id, r) => ({ type: 'RECTANGLE', id, name: 'Dot', visible: true, fills: [{ type: 'SOLID', visible: true, color: { r, g: 0, b: 0 } }], strokes: [], boundVariables: {} });
  const root = { type: 'COMPONENT', id: '1:1', name: 'chip', visible: true, fills: [], strokes: [], boundVariables: {}, children: [dot('1:2', 1), dot('1:3', 0.5), { ...dot('1:4', 0.2), name: 'Ring' }] };
  const h = hygieneOf(root, '');
  const fills = h.raw.filter((r) => r.field === 'fill');
  assert.deepEqual(fills.map((r) => [r.at, r.node ?? null]), [['chip/Dot', '1:2'], ['chip/Dot', '1:3'], ['chip/Ring', null]]);
});
