// One element, said once: a contract's semantics.element is always accessibility.element's value (the authored one,
// else the element the code's markup starts with), so a reader of either field reads the same answer. The authored
// role (semantics.aria.role) is accessibility's role too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts } from '../lib/contract-gen.mjs';
import { accessibilityOf } from '../lib/contract-code.mjs';

const project = () => makeFixture({
  'vars.json': { light: {} },
  'struct.json': { components: { cardTile: { nodeId: '1:1', h: 40 }, tabTile: { nodeId: '1:2', h: 40 }, chipTile: { nodeId: '1:3', h: 24 } } },
  'props.json': { cardTile: { nodeId: '1:1', properties: {} }, tabTile: { nodeId: '1:2', properties: {} }, chipTile: { nodeId: '1:3', properties: {} } },
  'src/components/CardTile.vue': '<template><div class="card-tile"><slot /></div></template>\n',
  'src/components/TabTile.vue': '<template><button class="tab-tile"><slot /></button></template>\n',
  'src/components/ChipTile.vue': '<template><span class="chip-tile"><slot /></span></template>\n',
});
const cfg = {
  paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' },
  componentFiles: { cardTile: 'src/components/CardTile.vue', tabTile: 'src/components/TabTile.vue', chipTile: 'src/components/ChipTile.vue' },
  contracts: { gitignore: false },
};

test('semantics.element and accessibility.element never disagree', async () => {
  const dir = project();
  await generateContracts(dir, cfg, { force: true });
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  authored.components.tabTile = { semantics: { aria: { role: 'tab' } } };
  authored.components.chipTile = { semantics: { element: 'button' } };
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored));
  const r = await generateContracts(dir, cfg, { force: true });
  assert.deepEqual(r.invalid, [], JSON.stringify(r.invalid));
  const read = (n) => JSON.parse(readFileSync(join(r.outDir, `${n}.contract.json`), 'utf8'));
  for (const n of ['cardTile', 'tabTile', 'chipTile']) {
    const c = read(n);
    assert.equal(c.semantics.element, c.accessibility?.element?.value ?? null, `${n}: ${JSON.stringify([c.semantics, c.accessibility])}`);
  }
  // Nothing authored: the code's element, said in both, with where it was read.
  assert.deepEqual([read('cardTile').semantics, read('cardTile').accessibility.element], [{ element: 'div', aria: {} }, { value: 'div', from: 'code' }]);
  assert.equal(read('cardTile').usage?.element, 'div');
  // A role authored without an element: the code's element, and the authored role in accessibility too.
  assert.deepEqual(read('tabTile').semantics, { aria: { role: 'tab' }, element: 'button' });
  // and where the code's own markup gives another role, that is kept beside it, never lost
  assert.deepEqual(read('tabTile').accessibility.role, { value: 'tab', from: 'authored', differs: [{ from: 'code', value: 'button' }] });
  // An authored element wins over the code's, in both.
  assert.deepEqual([read('chipTile').semantics.element, read('chipTile').accessibility.element], ['button', { value: 'button', from: 'authored' }]);
});

test('the authored role, written as semantics.aria.role, is accessibility\'s role', () => {
  assert.deepEqual(accessibilityOf('<template><div role="group" /></template>', { authored: { aria: { role: 'tablist' } } }).role, { value: 'tablist', from: 'authored' });
  assert.deepEqual(accessibilityOf('<template><div role="group" /></template>', {}).role, { value: 'group', from: 'code' });
});
