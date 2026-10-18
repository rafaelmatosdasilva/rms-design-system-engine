// allVariables (styleguide-data.mjs): every token Figma has, for the Tokens page. Every name below is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allVariables } from '../styleguide-data.mjs';

const snap = {
  _collections: { color: 'Theme', colorModes: ['Light', 'Dark'], sizing: ['Theme'] },
  color: { light: { 'brand/fill': '#112233', 'card/border/color': '#cccccc' }, dark: { 'brand/fill': '#445566', 'card/border/color': '#333333' } },
  sizing: { 'spacing/gap/s': '4px', 'card/shadow/blur': '8px', 'type/body/size': '14px', 'corner/radius/m': '8px', 'viewport/min': '360px' },
  booleans: { 'card/shadow/display': 'true' },
  motion: { 'modal/enter/duration': '200ms' },
  modeVariants: {
    Theme: { modes: [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }], vars: { 'card/shadow/display': { kind: 'boolean', values: { light: 'true', dark: 'false' } } } },
    Breakpoint: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'viewport/min': { kind: 'scalar', values: { desktop: '1280px', phone: '360px' } } } },
  },
};

test('every token Figma has, its type by its name first, its modes and values, the code\'s name when the code declares it', () => {
  const all = allVariables(snap, ':root { --brand-fill: #112233; }');
  const of = (n) => all.find((x) => x.figma === n);
  assert.deepEqual(of('brand/fill'), { figma: 'brand/fill', var: '--brand-fill', type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#112233', '#445566'] });
  assert.equal(of('card/border/color').type, 'border', 'a border by its name, whatever its value');
  assert.equal(of('card/shadow/blur').type, 'shadow');
  assert.equal(of('type/body/size').type, 'typography');
  assert.equal(of('corner/radius/m').type, 'radius');
  assert.deepEqual([of('card/shadow/display').modes, of('card/shadow/display').values], [['Light', 'Dark'], ['true', 'false']], 'a boolean in each mode');
  assert.deepEqual([of('viewport/min').collection, of('viewport/min').values], ['Breakpoint', ['1280px', '360px']]);
  assert.deepEqual([of('spacing/gap/s').collection, of('spacing/gap/s').modes], [null, ['Value']], 'a collection only when Figma\'s data names it, never guessed');
  const kept = allVariables({ ...snap, _collections: { ...snap._collections, of: { 'spacing/gap/s': 'Theme' } } }, '');
  assert.deepEqual([kept.find((x) => x.figma === 'spacing/gap/s').modes, kept.find((x) => x.figma === 'spacing/gap/s').values], [['Light', 'Dark'], ['4px', '4px']], 'its collection kept: its modes, the same value in each');
  assert.equal(of('modal/enter/duration').type, 'motion');
  assert.equal(of('spacing/gap/s').var, null, 'the code does not declare it');
});

test('Figma\'s tokens from the capture: each in its own collection, every mode, its alias, nothing guessed', async () => {
  const { tokensFromItems } = await import('../figma-capture.mjs');
  const items = [
    { k: 'collection', id: 'c1', v: { id: 'c1', name: 'Theme', modes: [{ modeId: 'l', name: 'Light' }, { modeId: 'd', name: 'Dark' }] } },
    { k: 'collection', id: 'c2', v: { id: 'c2', name: 'Breakpoint', modes: [{ modeId: 'p', name: 'Phone' }, { modeId: 'w', name: 'Desktop' }] } },
    { k: 'var', id: 'v1', v: { id: 'v1', name: 'edge/left', resolvedType: 'FLOAT', variableCollectionId: 'c1', valuesByMode: { l: 1, d: 1 }, scopes: ['STROKE_FLOAT'] } },
    { k: 'var', id: 'v2', v: { id: 'v2', name: 'edge/top', resolvedType: 'FLOAT', variableCollectionId: 'c1', valuesByMode: { l: { type: 'VARIABLE_ALIAS', id: 'v1' }, d: { type: 'VARIABLE_ALIAS', id: 'v1' } } } },
    { k: 'var', id: 'v3', v: { id: 'v3', name: 'tile/minHeight', resolvedType: 'FLOAT', variableCollectionId: 'c2', valuesByMode: { p: 168, w: 168 } } },
  ];
  const t = tokensFromItems(items);
  assert.deepEqual(t.collections, [{ name: 'Theme', modes: ['Light', 'Dark'] }, { name: 'Breakpoint', modes: ['Phone', 'Desktop'] }]);
  const of = (n) => t.tokens.find((x) => x.name === n);
  assert.deepEqual(of('edge/top'), { name: 'edge/top', collection: 'Theme', kind: 'FLOAT', values: { Light: '1px', Dark: '1px' }, aliases: { Light: 'edge/left', Dark: 'edge/left' } });
  assert.deepEqual([of('tile/minHeight').collection, of('tile/minHeight').values], ['Breakpoint', { Phone: '168px', Desktop: '168px' }], 'in the collection Figma keeps it in');
  const page = allVariables({ figmaTokens: t }, '');
  assert.deepEqual(page.find((x) => x.figma === 'edge/top').aliases, ['edge/left', 'edge/left']);
  assert.equal(page.find((x) => x.figma === 'edge/left').type, 'border', 'what it styles: Figma\'s scope first');
});
