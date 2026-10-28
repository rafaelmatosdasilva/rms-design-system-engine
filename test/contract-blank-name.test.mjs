// A Figma component with no name (only spaces) gets no contract named by nothing: it is listed apart, by its node, for the
// design team to name, and a " .contract.json" an older run wrote is taken out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts } from '../contract-gen.mjs';

test('a component Figma gives no name is listed by its node, never written as " .contract.json"', async () => {
  const dir = makeFixture({
    'vars.json': { light: {} },
    'struct.json': { components: { chip: { nodeId: '1:1', h: 32 }, ' ': { nodeId: '7:7', h: 20 } } },
    'props.json': { chip: { nodeId: '1:1', properties: {} }, ' ': { nodeId: '7:7', properties: {} } },
  });
  const cfg = { paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' }, contracts: { gitignore: false } };
  mkdirSync(join(dir, 'contracts'), { recursive: true });
  writeFileSync(join(dir, 'contracts', ' .contract.json'), '{}');
  const r = await generateContracts(dir, cfg, { force: true });
  const files = readdirSync(r.outDir).filter((f) => f.endsWith('.contract.json'));
  assert.ok(files.includes('chip.contract.json'), files.join(', '));
  assert.ok(!files.some((f) => !f.replace(/\.contract\.json$/, '').trim()), `a contract named by nothing: ${files.join(', ')}`);
  assert.ok(!existsSync(join(dir, 'contracts', ' .contract.json')));
  assert.deepEqual(r.skipped.filter((s) => !s.name), [{ name: '', why: 'no name in Figma: name it there (node 7:7)' }]);
});
