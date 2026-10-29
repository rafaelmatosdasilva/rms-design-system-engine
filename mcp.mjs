#!/usr/bin/env node
// mcp.mjs - the engine's answers over MCP, for an agent with no shell (a prototyping tool, a chat assistant).
//
//   node <engine>/mcp.mjs [--project=<folder>]      (stdio; an MCP client starts it, for example
//   claude mcp add design-system -- node <engine>/mcp.mjs --project=<folder>)
//
// Each tool runs the same command an agent with a terminal runs (query.mjs, ui-check.mjs, prototype.mjs --catalog,
// the audit's summary) in the project's folder and hands back what it printed, so nothing is written twice and the two
// never drift. The command line stays first where there is a terminal. Each does what its command does, no more: a
// query or the catalog with no catalog yet builds it once, and the catalog brings the intent layer up to date first,
// as they do at the terminal. No tool changes the project's code or design file.
//
// The project: --project, else DESIGN_SYSTEM_ENGINE_PROJECT, else the folder it starts in; a folder with no
// ds-config.json that remembers its project (.design-system-engine-project) answers for that one, as the audit does.
// MCP over stdio is JSON-RPC 2.0, one message a line: initialize, tools/list and tools/call are answered, ping too.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { envVar, OUT_DIR } from './names.mjs';

const ENGINE = dirname(fileURLToPath(import.meta.url));
const POINTER = '.design-system-engine-project';
export const PROTOCOL = '2025-06-18';

// The project folder the answers are about.
export function projectDir(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const given = argv.find((a) => a.startsWith('--project='))?.slice(10) ?? envVar(env, 'PROJECT') ?? null;
  const dir = resolve(cwd, given ?? '.');
  if (!existsSync(join(dir, 'ds-config.json')) && existsSync(join(dir, POINTER))) {
    const to = readFileSync(join(dir, POINTER), 'utf8').trim();
    if (to && existsSync(to)) return to;
  }
  return dir;
}

const strings = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String).filter((s) => s.trim());

// The tools: what each asks for, and the command that answers it. run(args) → [script, ...argv].
export const TOOLS = [
  {
    name: 'query',
    description: 'Look up components or tokens of the design system by name: a component\'s selector, code file, props with their values and defaults as the code writes them, slots, what not to put in it and what to use instead, where it is used; a token\'s CSS variable, its value in each mode, and for a text colour the surfaces it can be read on. Ask before writing a name: a guessed name is how generated code drifts. Several terms answer in one call; a term with no match lists the closest names.',
    inputSchema: { type: 'object', properties: { terms: { type: 'array', items: { type: 'string' }, description: 'Component or token names, CSS variables or selectors, as many as needed.' } }, required: ['terms'] },
    run: (a) => (strings(a.terms).length ? ['query.mjs', ...strings(a.terms), '--json'] : null),
    missing: 'name at least one component or token in terms',
  },
  {
    name: 'catalog',
    description: 'Everything UI built with this design system may use: its components with their props and when to use each, its templates and patterns, and the tokens, in the order to reach for them. Read it once before building a screen.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ['prototype.mjs', '--catalog'],
  },
  {
    name: 'check_ui',
    description: 'Check UI generated with the design system (a JSON file of the components it uses and their props, the shape the catalog gives) against the catalog: components that do not exist, props or values they do not take, raw values where a token exists. Each finding names the rule and the fix.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Path to the generated UI JSON, relative to the project folder.' } }, required: ['file'] },
    run: (a) => (strings(a.file).length ? ['ui-check.mjs', strings(a.file)[0], '--json'] : null),
    missing: 'give the generated UI file in file',
  },
  {
    name: 'summary',
    description: 'The last audit\'s summary of the design system: what matches between Figma and the code, what does not, what is open, and what to do next.',
    inputSchema: { type: 'object', properties: {} },
    read: (dir) => { const f = join(dir, OUT_DIR, 'summary.md'); return existsSync(f) ? readFileSync(f, 'utf8') : null; },
    missing: 'no summary yet: the audit has not run in this project (run rms-design-system-engine there once)',
  },
];

// One tool call → { content: [{ type: 'text', text }], isError }.
export function callTool(name, args = {}, { dir = projectDir(), spawn = spawnSync } = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  const out = (text, isError = false) => ({ content: [{ type: 'text', text: String(text ?? '').trim() || '(no answer)' }], isError });
  if (!tool) return out(`no tool named ${name}: the tools are ${TOOLS.map((t) => t.name).join(', ')}`, true);
  if (tool.read) { const t = tool.read(dir); return t == null ? out(tool.missing, true) : out(t); }
  const cmd = tool.run(args ?? {});
  if (!cmd) return out(tool.missing, true);
  const [script, ...argv] = cmd;
  const r = spawn(process.execPath, [join(ENGINE, script), ...argv], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  if (r.error) return out(`could not run ${script}: ${r.error.message}`, true);
  // Found nothing (exit 1) is an answer, not a failure: the closest names are in it. Anything worse is an error.
  return out([r.stdout, r.status > 1 ? r.stderr : ''].filter(Boolean).join('\n'), r.status > 1);
}

// One JSON-RPC message → its answer, or null for a notification.
export function handle(msg, ctx = {}) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'not a JSON-RPC 2.0 request');
  const notification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: msg.params?.protocolVersion ?? PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'rms-design-system-engine', version: '1.0.0' },
        instructions: 'Answers about this design system: query a component or token before writing its name, read the catalog before building a screen, check generated UI with check_ui.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': return reply(callTool(msg.params?.name, msg.params?.arguments, ctx));
    default: return notification ? null : fail(-32601, `no method ${msg.method}`);
  }
}

// The server: one message a line on stdin, each answer a line on stdout. Nothing else is ever written to stdout.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctx = { dir: projectDir() };
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'not JSON' } }) + '\n'); return; }
    const out = handle(msg, ctx);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
}
