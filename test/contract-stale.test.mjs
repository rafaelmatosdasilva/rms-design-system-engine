// A contract the engine wrote on an earlier run, for a component this run no longer writes (gone, renamed, or a file
// from before the contract format had a name), is taken out on a run of every component: left there, readers took it
// for a component with no name. A run of some components, and a contract written by hand, leave such files alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts } from '../contract-gen.mjs';

// What the engine wrote before contract format 1: an id, no name, no schemaVersion.
const OLD = { $schema: './contract.schema.json', id: 'rms.oldTile', version: '0.1.0', description: 'oldTile — captured from Figma by rms-design-system-engine.', props: [], anatomy: { root: {} }, 'x-design-system-engine': { note: 'Generated LOCAL view (rms-design-system-engine).' } };

const project = () => {
  const dir = makeFixture({
    'vars.json': { light: {} },
    'struct.json': { components: { cardTile: { nodeId: '1:1', h: 40 } } },
    'props.json': { cardTile: { nodeId: '1:1', properties: {} } },
  });
  mkdirSync(join(dir, 'contracts'), { recursive: true });
  writeFileSync(join(dir, 'contracts', 'oldTile.contract.json'), JSON.stringify(OLD));
  writeFileSync(join(dir, 'contracts', 'renamedTile.contract.json'), JSON.stringify({ ...OLD, schemaVersion: 1, id: 'rms.renamedTile', name: 'renamedTile' }));
  writeFileSync(join(dir, 'contracts', 'handTile.contract.json'), JSON.stringify({ id: 'acme.handTile', name: 'handTile' }));
  return dir;
};
const cfg = (extra = {}) => ({ paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' }, contracts: { gitignore: false, ...extra } });

test('a run of every component takes out the contracts it wrote before for components it no longer has', async () => {
  const dir = project();
  const r = await generateContracts(dir, cfg(), { force: true });
  assert.deepEqual(r.removed.sort(), ['oldTile.contract.json', 'renamedTile.contract.json']);
  const files = readdirSync(r.outDir).filter((f) => f.endsWith('.contract.json')).sort();
  assert.deepEqual(files, ['cardTile.contract.json', 'handTile.contract.json'], 'one written by hand stays');
  for (const f of files) {
    const c = JSON.parse(readFileSync(join(r.outDir, f), 'utf8'));
    assert.ok(typeof c.name === 'string' && c.name && c.id, `${f} has a name and an id`);
  }
});

test('a run of some components leaves the others\' contracts alone', async () => {
  const dir = project();
  const r = await generateContracts(dir, cfg({ only: ['cardTile'] }), { force: true });
  assert.deepEqual(r.removed, []);
  assert.ok(existsSync(join(r.outDir, 'oldTile.contract.json')));
});
