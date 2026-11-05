// The published library's list is read against the file as it is now, so an entry Figma keeps from an earlier
// publish is not reported as a component the snapshot is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { libraryInventory, libraryNodeIds } from '../lib/library-inventory.mjs';
import { fixtureProject, bareEnv, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const sets = [{ name: 'buttonPrimary', node_id: '1:1' }, { name: 'panelGroup', node_id: '1:2' }];
const components = [
  { name: 'promoTile', node_id: '9:9' },                                                              // published alone, now a variant
  { name: 'iconClose', node_id: '2:1' },
  { name: 'size=m', node_id: '1:3', containing_frame: { containingStateGroup: { name: 'buttonPrimary' } } },
];

test('without the file, the library list stands as it is', () => {
  assert.deepEqual([...libraryInventory(sets, components, null)].sort(), ['buttonPrimary', 'iconClose', 'panelGroup', 'promoTile']);
});

test('an entry that is now a variant of another component is not one of the system', () => {
  const live = { '1:1': { type: 'COMPONENT_SET', name: 'buttonPrimary' }, '1:2': { type: 'COMPONENT_SET', name: 'panelGroup' },
    '9:9': { type: 'COMPONENT', name: 'state=rest' }, '2:1': { type: 'COMPONENT', name: 'iconClose' } };
  assert.deepEqual([...libraryInventory(sets, components, live)].sort(), ['buttonPrimary', 'iconClose', 'panelGroup']);
});

test('a node gone from the file is dropped, and a renamed one counts by its name now', () => {
  const live = { '1:1': { type: 'COMPONENT_SET', name: 'buttonMain' }, '1:2': null, '9:9': { type: 'COMPONENT', name: '.promoTile' }, '2:1': { type: 'COMPONENT', name: 'iconClose' } };
  assert.deepEqual([...libraryInventory(sets, components, live)].sort(), ['buttonMain', 'iconClose']);
});

test('an entry the file did not answer for keeps its library name', () => {
  assert.deepEqual([...libraryInventory(sets, components, { '1:1': { type: 'COMPONENT_SET', name: 'buttonPrimary' } })].sort(), ['buttonPrimary', 'iconClose', 'panelGroup', 'promoTile']);
});

test('the ids to read skip variants and come in groups', () => {
  assert.deepEqual(libraryNodeIds(sets, components), [['1:1', '1:2', '9:9', '2:1']]);
  assert.deepEqual(libraryNodeIds(sets, components, 3), [['1:1', '1:2', '9:9'], ['2:1']]);
});

// Gate [1] and the frame geometry snapshot: only frames listed in ds-config.json write it, so with none listed its
// absence is not a reason for the gate to fail.
test('the data gate asks for the frame geometry only when frames are listed', { timeout: budget(300000) }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'frames-');
  const cfgPath = join(dir, 'ds-config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const gate1 = (frames) => {
    writeFileSync(cfgPath, JSON.stringify({ ...cfg, frames, paths: { ...cfg.paths, snapshotFrameGeometry: 'src/figma-frame-geometry.snapshot.json' } }));
    const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--only', '1'], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: budget(240000) });
    return (r.stdout ?? '') + (r.stderr ?? '');
  };
  assert.doesNotMatch(gate1([]), /figma-frame-geometry/);
  assert.match(gate1([{ name: 'Gallery', nodeId: '1:1' }]), /figma-frame-geometry\.snapshot\.json missing or unstamped/);
});
