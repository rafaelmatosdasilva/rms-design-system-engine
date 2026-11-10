// The setup page's snippets for other AI tools (docs/setup.md, In other AI tools): each config is valid, starts the
// engine's own MCP server, and names the tools that server really lists, so a snippet can never point at something gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(ENGINE, 'docs', 'setup.md'), 'utf8');
const section = page.slice(page.indexOf('## In other AI tools'), page.indexOf('## The files it creates'));
const blocks = (lang) => [...section.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);

test('the section is on the page and in its list', () => {
  assert.ok(section.length > 200, 'the section is there');
  assert.match(page, /- \[In other AI tools\]\(#in-other-ai-tools\)/, 'listed under On this page');
  for (const anchor of ['the-hooks-keep-the-rules', 'from-the-terminal']) assert.match(page, new RegExp(`\\n#+ ${anchor.replace(/-/g, '[ -]')}`, 'i'), `#${anchor} is a heading on the page`);
});

test('every config is valid and starts the engine\'s own MCP server', () => {
  const json = blocks('json').map((b) => JSON.parse(b));
  assert.equal(json.length, 2, 'the shared mcpServers format, and VS Code\'s');
  const servers = json.map((j) => (j.mcpServers ?? j.servers)['design-system']);
  for (const s of servers) {
    assert.equal(s.command, 'node');
    assert.deepEqual(s.args, ['<engine>/mcp.mjs', '--project=<project>']);
  }
  assert.equal(servers[1].type, 'stdio', 'VS Code names the transport');
  const [toml] = blocks('toml');
  assert.match(toml, /^\[mcp_servers\.design-system\]\ncommand = "node"\nargs = \["<engine>\/mcp\.mjs", "--project=<project>"\]\n$/, 'Codex');
  assert.ok(existsSync(join(ENGINE, 'mcp.mjs')), 'mcp.mjs is at the install folder\'s root, where the snippets point');
  const cmd = blocks('bash').find((b) => /claude mcp add/.test(b));   // the section's other bash block sets up Cursor and Codex
  assert.match(cmd, /^claude mcp add design-system -- node ~\/\.claude\/skills\/rms-design-system-engine\/mcp\.mjs --project="\$PWD"\n$/);
});

test('the tools it names are the ones the server lists', async () => {
  const named = ['query', 'catalog', 'check_ui', 'summary'];
  for (const n of named) assert.match(section, new RegExp('`' + n + '`'), `${n} is named`);
  const child = spawn(process.execPath, [join(ENGINE, 'mcp.mjs'), `--project=${ENGINE}`], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = [];
  child.stdout.setEncoding('utf8');
  let buf = '';
  const got = new Promise((done) => child.stdout.on('data', (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); for (const l of parts) if (l.trim()) { lines.push(JSON.parse(l)); if (lines.some((x) => x.id === 2)) done(); } }));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await Promise.race([got, new Promise((_, no) => setTimeout(() => no(new Error('no answer from the MCP server')), 15000))]);
  child.kill();
  const listed = lines.find((x) => x.id === 2).result.tools.map((t) => t.name).sort();
  assert.deepEqual(listed, named.slice().sort(), 'the page names exactly what the server lists');
});
