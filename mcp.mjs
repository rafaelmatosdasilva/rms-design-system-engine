#!/usr/bin/env node
// mcp.mjs - the engine's answers over MCP, for an agent with no shell (a prototyping tool, a chat assistant).
//
//   node <engine>/mcp.mjs [--project=<folder>]      (stdio; an MCP client starts it, for example
//   claude mcp add design-system -- node <engine>/mcp.mjs --project=<folder>)
//
// Each tool runs the same command an agent with a terminal runs (query.mjs, ui-check.mjs, prototype.mjs --catalog,
// the audit's summary) in the project's folder and hands back the text it printed, so nothing is written twice and the
// two never drift. Only the commands that text says to run next are said as this server's tools (forMcp), since an
// agent here has no shell; one no tool runs is said to need a terminal. The command line stays first where there is a
// terminal. Each does what its command does, no more: a query or the catalog with no catalog yet builds it once, and
// the catalog brings the intent layer up to date first, as they do at the terminal. No tool changes the project's code or design file.
//
// The project: --project, else DESIGN_SYSTEM_ENGINE_PROJECT, else the folder it starts in; a folder with no
// ds-config.json that remembers its project (.design-system-engine-project) answers for that one, as the audit does.
// MCP over stdio is JSON-RPC 2.0, one message a line: initialize, tools/list and tools/call are answered, ping too.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { envVar, OUT_DIR, SKILL } from './names.mjs';

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

// What an answer says to run, said as this server's tools: the command line's text is the answer, and an agent with no
// shell reads `rms-design-system-engine --query chip` as the query tool with terms chip. A command no tool runs (the
// audit, --component, --recipe) is left as written, with one line saying it needs a terminal.
const ESC = SKILL.replace(/[-]/g, '\\-');
const CALL = (verb) => (verb === 'run ' ? 'call ' : verb === 'Run ' ? 'Call ' : verb === 'then ' ? 'then call ' : verb);
export function forMcp(text) {
  let t = String(text ?? '');
  // The catalog, with what it takes: the request, the answers given, the cards asked for in full.
  t = t.replace(new RegExp(`(\\b[Rr]un |\\bthen )?${ESC} --prototype --catalog((?: --(?:for "[^"]*"|answered|detail [^\\s,;)]+))*)`, 'g'), (_, verb = '', opts) => {
    const args = [];
    const f = opts.match(/--for ("[^"]*")/); if (f) args.push(`for: ${f[1]}`);
    if (/--answered/.test(opts)) args.push('answered: true');
    const d = opts.match(/--detail ([^\s,;)]+)/); if (d) args.push(`detail: ${d[1]}`);
    return `${CALL(verb)}the catalog tool${args.length ? ` (${args.join(', ')})` : ''}`;
  });
  // A page or a generated UI checked: --check-ui, and --prototype on a file (the format --check-ui reads, or a page).
  t = t.replace(new RegExp(`(\\b[Rr]un |\\bthen )?${ESC} --(?:check-ui|prototype) (?!--)([^\\s,;)]*[^\\s,;.)])`, 'g'), (_, verb = '', file) => `${CALL(verb)}the check_ui tool (file: ${file})`);
  // A query: every term when the command ends its line (the closest names asked again), else its first term.
  t = t.replace(new RegExp(`(\\b[Rr]un |\\bthen )?${ESC} --query ((?:[^\\s,;)<.]+ ?)+)$`, 'gm'), (_, verb = '', terms) => `${CALL(verb)}the query tool (terms: ${terms.trim().split(/\s+/).join(', ')})`);
  t = t.replace(new RegExp(`(\\b[Rr]un |\\bthen )?${ESC} --query (<[^>]+>|[^\\s,;)<]+?)(?=[\\s,;)]|\\.(?:\\s|$)|$)`, 'gm'), (_, verb = '', term) => `${CALL(verb)}the query tool (terms: ${term})`);
  t = t.replace(new RegExp(`(\\b[Rr]un |\\bthen )?${ESC} --summary\\b`, 'g'), (_, verb = '') => `${CALL(verb)}the summary tool`);
  if (new RegExp(`${ESC}\\b`).test(t)) t = `${t.replace(/\s+$/, '')}\n\n(Through MCP: this server's tools are query, catalog, check_ui and summary. A command above that none of them runs (${SKILL} …) needs a terminal: ask the person to run it, and never say it ran.)`;
  return t;
}

const strings = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String).filter((s) => s.trim());

// The tools: what each asks for, and the command that answers it. run(args) → [script, ...argv].
export const TOOLS = [
  {
    name: 'query',
    description: 'Look up components or tokens of the design system by name: a component\'s selector, code file, props with their values and defaults as the code writes them, slots, what not to put in it and what to use instead, where it is used; a token\'s CSS variable, its value in each mode, and for a text colour the surfaces it can be read on. Ask before writing a name: a guessed name is how generated code drifts. Several terms answer in one call; a term with no match lists the closest names.',
    inputSchema: { type: 'object', properties: { terms: { type: 'array', items: { type: 'string' }, description: 'Component or token names, CSS variables or selectors, as many as needed.' } }, required: ['terms'] },
    run: (a) => (strings(a.terms).length ? ['query.mjs', ...strings(a.terms)] : null),
    missing: 'name at least one component or token in terms',
  },
  {
    name: 'catalog',
    description: 'Everything UI built with this design system may use: its components with their props and when to use each, its templates and patterns, and the tokens, in the order to reach for them. Read it once before building a screen. On a large system, give the request in for: it shows in full what the request needs, and first asks what the system cannot decide from it.',
    inputSchema: { type: 'object', properties: {
      for: { type: 'string', description: 'The request the screen is for, in the person\'s words (with their answers, once asked).' },
      answered: { type: 'boolean', description: 'true once the questions the catalog asked first are answered in for.' },
      detail: { type: 'array', items: { type: 'string' }, description: 'Components or rules to show in full.' },
    } },
    run: (a) => ['prototype.mjs', '--catalog', ...(strings(a.for).length ? ['--for', strings(a.for)[0]] : []), ...(a.answered === true ? ['--answered'] : []), ...(strings(a.detail).length ? ['--detail', strings(a.detail).join(',')] : [])],
  },
  {
    name: 'check_ui',
    description: 'Check UI generated with the design system against its catalog: components that do not exist, props or values they do not take, raw values where a token exists. Each finding names the rule it breaks. The file is JSON, a nested tree { "component": "<name>", "props": { "<prop>": "<value>" }, "children": [ … ] } or a flat list { "root": "<id>", "components": [ { "id": "<id>", "component": "<name>", "children": ["<id>"], "<prop>": "<value>" } ] }, each name and value written as query gives it; a page file (HTML, JSX, Vue) gets the check every edit gets.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Path to the generated UI (JSON) or the page, relative to the project folder.' } }, required: ['file'] },
    run: (a) => (strings(a.file).length ? ['ui-check.mjs', strings(a.file)[0]] : null),
    missing: 'give the generated UI file in file',
  },
  {
    name: 'summary',
    description: 'The last audit\'s summary of the design system: what matches between Figma and the code, what does not, what is open, and what to do next.',
    inputSchema: { type: 'object', properties: {} },
    read: (dir) => { const f = join(dir, OUT_DIR, 'summary.md'); return existsSync(f) ? readFileSync(f, 'utf8') : null; },
    missing: 'no summary yet: the audit has not run in this project. It runs in a terminal, so ask the person to run it there once.',
  },
];

// One tool call → { content: [{ type: 'text', text }], isError }.
export function callTool(name, args = {}, { dir = projectDir(), spawn = spawnSync } = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  const out = (text, isError = false) => ({ content: [{ type: 'text', text: forMcp(String(text ?? '').trim()).trim() || '(no answer)' }], isError });
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
