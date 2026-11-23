import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessOf, harnessLines, harnessSummary, ciJobs, onPathOf } from '../lib/harness.mjs';
import { makeFixture } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const state = (layers) => Object.fromEntries(layers.map((l) => [l.layer, l.state]));
const on = { installed: true, exists: true, command: 'node "/e/guard.mjs"' };
const ours = { hooks: { 'pre-commit': 'ours', 'pre-push': 'ours' } };

test('a project with nothing switched on says each layer off, in the order it runs, with what turns it on', () => {
  const dir = makeFixture({ 'ds-config.json': {} });
  const layers = harnessOf(dir, {}, { engineDir: '/e' });
  assert.deepEqual(layers.map((l) => l.layer), ['Looks before it builds', 'A way to ask', 'Each edit checked', 'A second judge', 'A gate a person approves']);
  assert.deepEqual(state(layers), { 'Looks before it builds': 'off', 'A way to ask': 'on', 'Each edit checked': 'off', 'A second judge': 'off', 'A gate a person approves': 'off' });
  const text = harnessLines(layers).join('\n');
  assert.match(text, /turn it on: rms-design-system-engine --install-hooks/);
  assert.match(text, /"args": \["\/e\/mcp\.mjs", "--project=\."\]/);
  assert.match(text, /Set it up in CI, GitHub's or GitLab's \(\/e\/docs\/documentation\.md\)/);
  assert.match(text, /NEXT: rms-design-system-engine \(one run writes them\)/);
});

test('a project that switched on only the MCP server is told the layers that hold an agent are missing', () => {
  const dir = makeFixture({ '.mcp.json': { mcpServers: { ds: { command: 'node', args: ['/e/mcp.mjs'] } } } });
  const layers = harnessOf(dir, {}, { engineDir: '/e' });
  const ask = layers.find((l) => l.layer === 'A way to ask');
  assert.ok(ask.parts[1].on);
  assert.match(ask.parts[1].what, /\.mcp\.json/);
  assert.equal(harnessSummary(layers).ok, true);
  assert.match(harnessSummary(layers).what, /Agent harness: 1 of 5 layers on \(rms-design-system-engine --harness says which/);
});

test('every layer on: the hooks in each tool here, the git hooks, the contracts, a model, the pull request job', () => {
  const dir = makeFixture({
    'contracts/catalog.json': {}, 'contracts/llms.txt': 'x',
    '.cursor/hooks.json': { version: 1, hooks: { stop: [{ command: 'node "/e/guard.mjs" --tool cursor' }] } },
    '.github/workflows/ds.yml': 'jobs:\n  ds:\n    steps:\n      - run: node ../engine/audit.mjs --contract-changes\n',
    '.github/workflows/other.yml': 'jobs: {}\n',
  });
  assert.deepEqual(ciJobs(dir), ['.github/workflows/ds.yml']);
  const layers = harnessOf(dir, {}, { engineDir: '/e', hooks: on, gitHooks: ours, onPath: (c) => c === 'claude' });
  assert.deepEqual(state(layers), { 'Looks before it builds': 'on', 'A way to ask': 'on', 'Each edit checked': 'on', 'A second judge': 'when asked', 'A gate a person approves': 'on' });
  assert.match(harnessLines(layers).at(-1), /every layer is on/);
  assert.equal(harnessSummary(layers).what, 'Agent harness: 5 of 5 layers on');
});

test('half a layer is partly on, an older install says so, and "hooks": false is named as the reason', () => {
  const dir = makeFixture({ '.codex/config.toml': '' });
  const partly = harnessOf(dir, {}, { hooks: on, gitHooks: { hooks: { 'pre-commit': 'ours', 'pre-push': 'theirs' } } });
  const edits = partly.find((l) => l.layer === 'Each edit checked');
  assert.equal(edits.state, 'partly');
  assert.ok(edits.parts.some((p) => /^Codex/.test(p.what) && !p.on && /--tool codex/.test(p.fix)));
  assert.match(edits.parts.find((p) => /^git/.test(p.what)).fix, /the project's own pre-push/);
  const old = harnessOf(dir, {}, { hooks: { installed: true, partial: true } });
  assert.match(old.find((l) => l.layer === 'Each edit checked').parts[0].fix, /installed by an earlier version/);
  const offByChoice = harnessOf(dir, { hooks: false }, {});
  assert.match(offByChoice[0].parts[1].fix, /"hooks": false: take it out/);
  // The team's own model command is the one looked for.
  const own = harnessOf(dir, { changeJudgment: { cmd: 'mymodel --json' } }, { onPath: (c) => /^mymodel/.test(c) });
  assert.equal(own.find((l) => l.layer === 'A second judge').state, 'when asked');
  assert.equal(typeof onPathOf({ PATH: '' })('node'), 'boolean');
});

test('--harness reads the project here and changes nothing', () => {
  const dir = makeFixture({ 'ds-config.json': {}, 'contracts/catalog.json': {}, 'contracts/llms.txt': 'x' });
  const r = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--harness', '--json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  assert.equal(r.status, 0, r.stderr);
  const { layers } = JSON.parse(r.stdout);
  assert.equal(layers[0].parts[0].on, true);
  const text = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--harness'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  assert.match(text.stdout, /Agent harness {2}· {2}each layer that keeps an agent inside the system, in the order it runs/);
});
