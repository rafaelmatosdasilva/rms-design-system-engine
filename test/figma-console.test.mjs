// Figma read through a console bridge (Figma Console MCP), where the project configures it: found in the project's MCP
// config, started as its own process over stdio, waited on until its Desktop Bridge plugin answers, and used as the
// capture's runner, so the snapshots are the ones every other route writes. A stand-in server on stdio
// (test/figma-console-standin.mjs) runs the code on the stand-in Figma file, through the real protocol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFigmaConsole, stdioMcp, executeAnswer, figmaConsoleRunner, figmaConsoleAnswers, figmaConsoleOff } from '../lib/figma-console.mjs';
import { chooseFigmaSource, refreshFromFigmaConsole, consoleLine } from '../lib/figma-source.mjs';
import { captureWithFigmaCli } from '../lib/figma-capture.mjs';
import { standinFigma, runOn } from './figma-console-standin.mjs';
import { tempDir } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDIN = join(HERE, 'figma-console-standin.mjs');
const cfg = {
  figma: { colorCollection: 'Theme', sizingCollection: 'Sizing', primitivePrefix: 'primitives/', modes: [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }] },
  paths: { snapshotVars: 'src/figma-vars.snapshot.json', snapshotStructure: 'src/figma-structure.snapshot.json', compPropsSnapshot: 'src/figma-component-props.snapshot.json' },
};
const project = (mcp, more = {}) => {
  const d = tempDir('console-');
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ ...cfg, ...more }));
  if (mcp) { mkdirSync(dirname(join(d, mcp.file)), { recursive: true }); writeFileSync(join(d, mcp.file), JSON.stringify(mcp.body)); }
  return d;
};
const standinEntry = (env = {}) => ({ command: process.execPath, args: [STANDIN, '--figma-console-mcp'], env });
const fast = { pause: async () => {} };

test('the server is found in the project\'s MCP config by its package, a stdio entry only, never one by URL or another server', () => {
  const at = (files) => (p) => { const k = Object.keys(files).find((f) => p.endsWith(f)); if (!k) throw new Error('none'); return JSON.stringify(files[k]); };
  const npx = { command: 'npx', args: ['-y', 'figma-console-mcp@latest'], env: { ENABLE_MCP_APPS: 'false' } };
  assert.deepEqual(findFigmaConsole('/p', { read: at({ '/.mcp.json': { mcpServers: { figma: { command: 'npx', args: ['figma-developer-mcp'] }, 'figma-console': npx } } }) }),
    { file: '.mcp.json', name: 'figma-console', command: 'npx', args: ['-y', 'figma-console-mcp@latest'], env: { ENABLE_MCP_APPS: 'false' } });
  assert.equal(findFigmaConsole('/p', { read: at({ '/.vscode/mcp.json': { servers: { c: { command: 'figma-console-mcp' } } } }) })?.file, '.vscode/mcp.json', 'VS Code names its list servers');
  assert.equal(findFigmaConsole('/p', { read: at({ '/.mcp.json': { mcpServers: { c: { type: 'http', url: 'http://localhost:3845/figma-console-mcp' } } } }) }), null, 'a server some other process runs is not started here');
  assert.equal(findFigmaConsole('/p', { read: at({ '/.mcp.json': { mcpServers: { other: { command: 'node', args: ['mcp.mjs'] } } } }) }), null);
  assert.equal(findFigmaConsole('/p', { read: at({}) }), null, 'no MCP config at all');
  assert.equal(figmaConsoleOff({ DESIGN_SYSTEM_ENGINE_FIGMA_CONSOLE: 'none' }), true);
});

test('figma_execute\'s answer is the text the script returned, as figma-cli prints it, and its failure says why', () => {
  assert.equal(executeAnswer({ text: JSON.stringify({ success: true, result: { a: 1 } }) }), '{"a":1}');
  assert.equal(executeAnswer({ text: JSON.stringify({ success: true, result: '{"z":"x"}' }) }), '{"z":"x"}', 'a string is the answer as it is');
  assert.equal(executeAnswer({ text: JSON.stringify({ success: true, result: 1 }) }), '1');
  const err = executeAnswer({ text: JSON.stringify({ error: 'Execution timed out after 5000ms', hint: 'Wait for it to finish' }), isError: true });
  assert.ok(err instanceof Error);
  assert.match(err.message, /figma_execute failed: Execution timed out after 5000ms \(Wait for it to finish\)/);
  assert.match(executeAnswer({ text: JSON.stringify({ success: false, error: 'figma is not defined' }) }).message, /figma is not defined/);
  assert.match(executeAnswer({ text: 'gateway down', isError: true }).message, /gateway down/);
});

test('the client speaks MCP over stdio: one server, many calls, and a server that stops says what it printed', async () => {
  const mcp = await stdioMcp(standinEntry());
  const one = await mcp.call('figma_execute', { code: 'return 1' });
  assert.equal(executeAnswer(one), '1');
  const two = await mcp.call('figma_execute', { code: 'return (await figma.variables.getLocalVariableCollectionsAsync()).map((c) => c.name)' });
  assert.deepEqual(JSON.parse(executeAnswer(two)), (await standinFigma().variables.getLocalVariableCollectionsAsync()).map((c) => c.name));
  mcp.close();
  await assert.rejects(stdioMcp({ command: process.execPath, args: ['-e', 'process.stderr.write("cannot bind any port in 9223-9232\\n"); process.exit(3)'] }), /stopped \(exit 3\): cannot bind any port in 9223-9232/);
  await assert.rejects(stdioMcp({ command: '/nowhere/figma-console-mcp' }), /did not start/);
});

test('the runner waits for the Desktop Bridge plugin to find the server, runs in the design system\'s file, and says when the plugin never comes', async () => {
  const log = join(tempDir('console-log-'), 'calls.jsonl');
  const r = await figmaConsoleRunner('/p', { figmaFileKey: 'KEY1' }, { server: standinEntry({ STANDIN_WAIT_CALLS: '3', STANDIN_FILE_KEY: 'KEY1', STANDIN_LOG: log }), connect: (s) => stdioMcp(s), ...fast });
  assert.equal(await r.run('return 6 * 7'), '42');
  r.close();
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(calls.length, 5, 'three while the plugin had not found it, one that answered, then the script');
  assert.ok(calls.every((c) => c.key === 'KEY1'), 'every call names the design system\'s file, so another file open in Figma is never read');
  // The file named is not the one open in Figma: the wait ends and says so.
  await assert.rejects(figmaConsoleRunner('/p', { figmaFileKey: 'OTHER' }, { server: standinEntry({ STANDIN_FILE_KEY: 'KEY1' }), connect: (s) => stdioMcp(s), waitMs: 0, ...fast }),
    /Desktop Bridge plugin did not answer in 0 s \(is it open in Figma Desktop on the design system's file\?\): figma_execute failed: File OTHER is not connected/);
  await assert.rejects(figmaConsoleRunner('/p', {}, { server: null }), /not configured in this project/);
});

test('the route: figma-cli first, then the console bridge where the project configures it and its plugin answers, then the API, then the session\'s Figma tool', async () => {
  const base = { which: () => null, answers: async () => false, safe: async () => false, env: {}, mtime: () => null };
  const c = { figmaFileKey: 'abc' };
  const yes = async () => ({ ok: true, why: 'Figma Console MCP is configured in .mcp.json and its Desktop Bridge plugin answers' });
  assert.equal((await chooseFigmaSource('/p', c, { ...base, consoleBridge: yes })).route, 'figma-console');
  assert.equal((await chooseFigmaSource('/p', c, { ...base, consoleBridge: yes, which: () => '/bin/figma-cli', answers: async () => true })).route, 'figma-cli', 'figma-cli answering is asked first');
  assert.equal((await chooseFigmaSource('/p', c, { ...base, consoleBridge: yes, env: { FIGMA_TOKEN: 't' } })).route, 'figma-console', 'the bridge reads every mode and scope the API cannot');
  const no = await chooseFigmaSource('/p', c, { ...base, consoleBridge: async () => ({ ok: false, why: 'the Desktop Bridge plugin did not answer in 15 s' }) });
  assert.deepEqual([no.route, /Figma Console MCP not reached \(the Desktop Bridge plugin did not answer in 15 s\)/.test(no.why)], ['mcp', true], 'configured but not answering: the next route, and why');
  // Not configured, or switched off: never started.
  let started = 0;
  const runner = async () => { started++; return { close() {} }; };
  assert.deepEqual(await figmaConsoleAnswers('/p', {}, { server: null, runner }), { ok: false });
  assert.deepEqual(await figmaConsoleAnswers('/p', {}, { server: standinEntry(), runner, env: { DESIGN_SYSTEM_ENGINE_FIGMA_CONSOLE: 'none' } }), { ok: false });
  assert.equal(started, 0);
  assert.equal((await figmaConsoleAnswers('/p', {}, { server: { ...standinEntry(), file: '.mcp.json' }, runner })).ok, true);
});

test('a refresh through the console bridge writes the very snapshots a run of the same scripts through figma-cli writes, in one server for both reads', async () => {
  const viaConsole = project({ file: '.mcp.json', body: { mcpServers: { 'figma-console': standinEntry() } } });
  const r = await refreshFromFigmaConsole(viaConsole, cfg);
  assert.equal(r.captured.ok, true, r.captured.error);
  assert.equal(r.capturedComponents.ok, true, r.capturedComponents.error);
  assert.equal(r.server.file, '.mcp.json');
  const line = consoleLine(r);
  assert.equal(line.ok, true);
  assert.match(line.line, /^Figma read through Figma Console MCP \(\.mcp\.json\)\nFigma's variables, text styles and effect styles read through Figma Console MCP in \d+ checked chunks → /);
  assert.match(line.line, /Figma's components read through Figma Console MCP in \d+ checked chunks?: 12 components/);
  // The same scripts on the same file, through a runner that is not the bridge.
  const viaCli = project(null);
  const file = runOn(standinFigma()), run = async (code) => JSON.stringify(await file(code));
  assert.equal((await captureWithFigmaCli(viaCli, cfg, { run })).ok, true);
  assert.equal((await captureWithFigmaCli(viaCli, cfg, { run, kind: 'components' })).ok, true);
  const strip = (o) => JSON.stringify(o, (k, v) => (['_updated', '_built', '_source'].includes(k) ? undefined : v));
  for (const p of [cfg.paths.snapshotVars, cfg.paths.snapshotStructure, cfg.paths.compPropsSnapshot]) {
    assert.ok(existsSync(join(viaConsole, p)), `${p} written through the bridge`);
    assert.equal(strip(JSON.parse(readFileSync(join(viaConsole, p), 'utf8'))), strip(JSON.parse(readFileSync(join(viaCli, p), 'utf8'))), `${p}: the same whichever route read it`);
  }
  assert.match(JSON.parse(readFileSync(join(viaConsole, cfg.paths.snapshotVars), 'utf8'))._source, /^Figma Console MCP, read in \d+ checked chunks/);
});

test('a read the bridge cannot finish keeps the snapshots already saved and says so, and the server is stopped either way', async () => {
  let closed = 0;
  const runner = async () => ({ server: { file: '.mcp.json' }, run: async () => { throw new Error('figma_execute failed: Execution timed out after 120000ms'); }, close: () => { closed++; } });
  const r = await refreshFromFigmaConsole(project(null), cfg, { runner });
  assert.equal(closed, 1);
  const line = consoleLine(r);
  assert.equal(line.ok, false);
  assert.match(line.line, /were not read through Figma Console MCP \(figma_execute failed: Execution timed out after 120000ms\); the ones already saved are kept/);
  assert.match(line.line, /full structure was not read through Figma Console MCP \(.*\); the snapshots already saved are kept/);
});
