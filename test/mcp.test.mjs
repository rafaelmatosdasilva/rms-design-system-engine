// The engine's answers over MCP (mcp.mjs): the same commands, through JSON-RPC on stdio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { handle, callTool, projectDir, TOOLS, forMcp } from '../mcp.mjs';
import { makeFixture, budget } from './helpers.mjs';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'mcp.mjs');
const catalog = { components: { badge: { selector: '.hb-badge', props: { tone: { type: 'enum', values: ['neutral', 'danger'], default: 'neutral', codeName: 'tone' } } } } };
const project = () => makeFixture({ 'ds-config.json': { figma: { namingConvention: { prefix: '--hb-' } } }, 'contracts/catalog.json': catalog, 'contracts/tokens.json': { radius: { control: { $type: 'dimension', $value: '6px' } } } });

// One server, the messages sent a line each; resolves with every answer once it closes.
function talk(dir, messages, args = []) {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [SERVER, ...args], { cwd: dir, env: { ...process.env, DESIGN_SYSTEM_ENGINE_QUERY_NO_AUDIT: '1' } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', fail);
    p.on('close', () => done(out.split('\n').filter(Boolean).map((l) => JSON.parse(l))));
    for (const m of messages) p.stdin.write(JSON.stringify(m) + '\n');
    p.stdin.end();
  });
}

test('MCP: it says what it is and lists its tools, each with a schema', () => {
  const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'a notification gets no answer');
  const list = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools;
  assert.deepEqual(list.map((t) => t.name), ['query', 'catalog', 'check_ui', 'summary']);
  for (const t of list) assert.equal(t.inputSchema.type, 'object');
  assert.equal(handle({ jsonrpc: '2.0', id: 3, method: 'nope' }).error.code, -32601);
  assert.equal(handle({ id: 4, method: 'x' }).error.code, -32600);
});

test('MCP: a query answers with the text --query prints, a name it lacks is an answer and not an error', { timeout: budget(60000) }, async () => {
  const dir = project();
  const [, found, none, bad] = await talk(dir, [   // the notification gets no answer
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'query', arguments: { terms: ['badge', '--hb-radius-control'] } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'query', arguments: { terms: ['bdage'] } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'query', arguments: { terms: [] } } },
  ]);
  assert.equal(found.result.isError, false);
  const text = found.result.content[0].text;
  assert.throws(() => JSON.parse(text), 'the command line\'s text, not its --json');
  assert.match(text, /badge\s+\(\.hb-badge\)/);
  assert.match(text, /tone: neutral \| danger/);
  assert.match(text, /var\(--hb-radius-control\)\s+6px/);
  assert.match(text, /NEXT: .*the check_ui tool \(file: <file>\)/, 'its NEXT line names the tool, not the shell command');
  assert.doesNotMatch(text, /rms-design-system-engine --/);
  assert.equal(none.result.isError, false, 'not found: the closest names are the answer');
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /name at least one/);
});

test('MCP: the summary is the last audit\'s, and says so when there is none; an unknown tool is an error', () => {
  const dir = project();
  assert.equal(callTool('summary', {}, { dir }).isError, true);
  mkdirSync(join(dir, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(dir, '.design-system-engine-out', 'summary.md'), '# Parity result\n');
  assert.deepEqual(callTool('summary', {}, { dir }), { content: [{ type: 'text', text: '# Parity result' }], isError: false });
  assert.match(callTool('draw', {}, { dir }).content[0].text, /no tool named draw: the tools are query, catalog, check_ui, summary/);
  assert.equal(TOOLS.find((t) => t.name === 'check_ui').run({}), null, 'no file: nothing is run');
});

test('MCP: the project is the one named, else the folder, else the one the folder remembers', () => {
  const dir = project(), from = makeFixture({ 'x.txt': '' });
  writeFileSync(join(from, '.design-system-engine-project'), dir + '\n');
  assert.equal(projectDir([`--project=${dir}`], {}, '/'), dir);
  assert.equal(projectDir([], { DESIGN_SYSTEM_ENGINE_PROJECT: dir }, '/'), dir);
  assert.equal(projectDir([], {}, from), dir, 'a folder with no setup follows the one it remembers');
  assert.equal(projectDir([], {}, dir), dir);
});

test('MCP: what an answer says to run is said as the tools, and a command no tool runs needs a terminal', () => {
  const C = 'rms-design-system-engine';
  assert.equal(forMcp(`NEXT: ask again with the closest name: ${C} --query cardTile acmeBadge`), 'NEXT: ask again with the closest name: the query tool (terms: cardTile, acmeBadge)');
  assert.equal(forMcp(`Write it with what the code has (${C} --query <name>), and say so`), 'Write it with what the code has (the query tool (terms: <name>)), and say so');
  assert.equal(forMcp(`${C} --query <a word of its name> lists the components that hold it.`), 'the query tool (terms: <a word of its name>) lists the components that hold it.');
  assert.equal(forMcp(`then check it with ${C} --check-ui <file>`), 'then check it with the check_ui tool (file: <file>)');
  assert.equal(forMcp(`NEXT: write prototypes/AcmeHome.jsx, then run ${C} --prototype prototypes/AcmeHome.jsx and fix each line.`), 'NEXT: write prototypes/AcmeHome.jsx, then call the check_ui tool (file: prototypes/AcmeHome.jsx) and fix each line.');
  assert.equal(forMcp(`  then ${C} --prototype prototypes/<Name>.vue, and fix each one`), '  then call the check_ui tool (file: prototypes/<Name>.vue), and fix each one');
  assert.equal(forMcp(`then run ${C} --prototype --catalog --for "<the request>" --answered, and write`), 'then call the catalog tool (for: "<the request>", answered: true), and write');
  assert.equal(forMcp(`what its card in ${C} --prototype --catalog --detail cardTile lists`), 'what its card in the catalog tool (detail: cardTile) lists');
  assert.equal(forMcp(`then ${C} --summary.`), 'then call the summary tool.');
  assert.equal(forMcp('nothing to run'), 'nothing to run');
  const left = forMcp(`run ${C} --query cardTile for what it needs, then run ${C} --component cardTile until it passes.`);
  assert.match(left, /^call the query tool \(terms: cardTile\) for what it needs, then run rms-design-system-engine --component cardTile until it passes\./);
  assert.match(left, /\n\n\(Through MCP: .*query, catalog, check_ui and summary\. .*needs a terminal: ask the person to run it, and never say it ran\.\)$/);
});

test('MCP: the catalog takes the request, its answers and the cards to show in full, as --catalog does', () => {
  const run = TOOLS.find((t) => t.name === 'catalog').run;
  assert.deepEqual(run({}), ['prototype.mjs', '--catalog']);
  assert.deepEqual(run({ for: 'an Acme order page', answered: true, detail: ['cardTile', 'badge'] }), ['prototype.mjs', '--catalog', '--for', 'an Acme order page', '--answered', '--detail', 'cardTile,badge']);
  assert.deepEqual(TOOLS.find((t) => t.name === 'check_ui').run({ file: 'ui/acme.json' }), ['ui-check.mjs', 'ui/acme.json'], 'the check\'s text, which names each rule');
  assert.match(callTool('summary', {}, { dir: project() }).content[0].text, /ask the person to run it there once/);
});
