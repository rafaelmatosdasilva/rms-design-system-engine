// The engine's own files of a GitLab mirror kept in a folder of their own (workspace.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { workspaceDir, engineFiles, openWorkspace } from '../workspace.mjs';
import { STATE_FILE } from '../gitlab-source.mjs';
import { tempDir } from './helpers.mjs';

const P = { host: 'gitlab.acme.test', path: 'team/design-store' };
const put = (dir, rel, text = rel) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
// A mirror: what GitLab sent (listed in its state) and what the engine wrote beside it.
function mirror(dir, mine = {}) {
  const gitlab = ['package.json', 'src/Card.vue'];
  for (const f of gitlab) put(dir, f);
  writeFileSync(join(dir, STATE_FILE), JSON.stringify({ origin: 'https://gitlab.acme.test', host: P.host, path: P.path, files: gitlab }));
  for (const [rel, text] of Object.entries(mine)) put(dir, rel, text);
  return dir;
}

test('the workspace: none unless a setting asks, per host and project, never outside its folder', () => {
  assert.equal(workspaceDir(P, {}), null);
  assert.equal(workspaceDir(P, { DESIGN_SYSTEM_ENGINE_WORKSPACE: '  ' }), null, 'blank is not a setting');
  assert.equal(workspaceDir(P, { DESIGN_SYSTEM_ENGINE_WORKSPACE: '/srv/ws' }), join('/srv/ws', 'gitlab.acme.test', 'design-store'));
  assert.equal(workspaceDir(P, { DESIGN_SYSTEM_ENGINE_WORKSPACE: '~/ws' }), join(homedir(), 'ws', 'gitlab.acme.test', 'design-store'));
  const hostile = workspaceDir({ host: '../../etc', path: 'a/../../b' }, { DESIGN_SYSTEM_ENGINE_WORKSPACE: '/srv/ws' });
  assert.ok(hostile.startsWith('/srv/ws/') && !hostile.split('/').includes('..'), hostile);
});

test('the engine\'s files are what GitLab did not put there, its packages, state and harness page left out', () => {
  const dir = mirror(tempDir('ws-files-'), { 'ds-config.json': '{}', '.design-system-engine-out/a11y.json': '{}', '.design-system-engine-out/vue-harness/entry.js': 'x', 'node_modules/vue/index.js': 'x', 'src/figma-vars.snapshot.json': '{}' });
  assert.deepEqual(engineFiles(dir), ['.design-system-engine-out/a11y.json', 'ds-config.json', 'src/figma-vars.snapshot.json']);
});

test('with no setting nothing moves', () => {
  const dir = mirror(tempDir('ws-none-'), { 'ds-config.json': '{}' });
  assert.equal(openWorkspace(P, dir, { env: {} }), null);
});

test('the first run moves the mirror\'s setup in; each run puts it into the mirror and takes back what it wrote', () => {
  const root = tempDir('ws-run-'), env = { DESIGN_SYSTEM_ENGINE_WORKSPACE: join(root, 'ws') };
  const dir = mirror(join(root, 'mirror'), { 'ds-config.json': '{"a":1}', 'contracts/card.contract.json': '{}', 'old.md': 'old' });
  const run = openWorkspace(P, dir, { from: root, env });
  const ws = workspaceDir(P, env);
  assert.equal(run.dir, ws);
  assert.match(run.note, /3 files moved in/);
  assert.equal(readFileSync(join(ws, 'ds-config.json'), 'utf8'), '{"a":1}');
  assert.ok(!existsSync(join(ws, 'package.json')) && !existsSync(join(ws, STATE_FILE)), 'nothing of GitLab\'s');
  // The run writes, adds and deletes in the mirror; when it ends, the workspace has the same.
  writeFileSync(join(dir, 'ds-config.json'), '{"a":2}');
  utimesSync(join(dir, 'ds-config.json'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  put(dir, '.design-system-engine-out/handback/figma-changes.md', 'to do');
  rmSync(join(dir, 'old.md'));
  assert.deepEqual(run.close(), { copied: 2, removed: 1 });
  assert.equal(readFileSync(join(ws, 'ds-config.json'), 'utf8'), '{"a":2}');
  assert.equal(readFileSync(join(ws, '.design-system-engine-out/handback/figma-changes.md'), 'utf8'), 'to do');
  assert.ok(!existsSync(join(ws, 'old.md')));
  assert.equal(run.close(), null, 'taken back once');
});

test('a mirror that moved, or was dropped, gets its setup back from the workspace or the mirror beside the work', () => {
  const root = tempDir('ws-moved-'), env = { DESIGN_SYSTEM_ENGINE_WORKSPACE: join(root, 'ws') };
  mirror(join(root, 'design-store'), { 'ds-config.json': '{"kept":true}' });         // the mirror beside the work, from before
  const cache = mirror(join(root, 'cache', 'design-store'));                         // a fresh one where the setting now keeps it
  const first = openWorkspace(P, cache, { from: root, env });
  assert.match(first.note, /1 file moved in/);
  assert.equal(readFileSync(join(cache, 'ds-config.json'), 'utf8'), '{"kept":true}', 'put into the new mirror');
  first.close();
  rmSync(cache, { recursive: true });                                                // the cache is cleared
  const again = mirror(cache);
  const second = openWorkspace(P, again, { from: root, env });
  assert.doesNotMatch(second.note, /moved in/);
  assert.equal(readFileSync(join(again, 'ds-config.json'), 'utf8'), '{"kept":true}');
  second.close();
});

test('a run that stopped before taking its files back loses nothing: the newer copy in the mirror is kept', () => {
  const root = tempDir('ws-stopped-'), env = { DESIGN_SYSTEM_ENGINE_WORKSPACE: join(root, 'ws') };
  const dir = mirror(join(root, 'mirror'), { 'ds-config.json': 'first' });
  openWorkspace(P, dir, { from: root, env });                                        // never closed
  writeFileSync(join(dir, 'ds-config.json'), 'written by the stopped run');
  utimesSync(join(dir, 'ds-config.json'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const next = openWorkspace(P, dir, { from: root, env });
  assert.equal(readFileSync(join(dir, 'ds-config.json'), 'utf8'), 'written by the stopped run', 'the older workspace copy does not overwrite it');
  next.close();
  assert.equal(readFileSync(join(workspaceDir(P, env), 'ds-config.json'), 'utf8'), 'written by the stopped run');
});
