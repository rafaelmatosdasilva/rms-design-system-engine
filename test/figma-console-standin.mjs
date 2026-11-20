#!/usr/bin/env node
// test/figma-console-standin.mjs - a stand-in for Figma Console MCP, for the console bridge's tests: an MCP server on
// stdio (newline-delimited JSON-RPC) whose figma_execute runs the code it is given on the stand-in Figma file
// (test/figma-standin.mjs: its variables and its components) and answers in the shape the real server does
// ({ success, result, error, fileContext }). Everything is made up.
//
// STANDIN_WAIT_CALLS=N: the first N figma_execute calls answer as the real server does while the Desktop Bridge plugin
// has not found it yet. STANDIN_FILE_KEY: the one file connected, so a call for another fileKey fails as it does there.
// STANDIN_LOG: a file each call's fileKey and code length are appended to.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { largeVarsFile, asFigma, largeComponentsFile, asComponentsFigma } from './figma-standin.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
// One file holding both stand-ins: the variables' file and the components' page, a variable looked up in either.
export function standinFigma(components = 12) {
  const vars = asFigma(largeVarsFile()), comps = asComponentsFigma(largeComponentsFile(11, components));
  return { ...comps, ...vars, variables: { ...vars.variables, getVariableByIdAsync: async (id) => (await vars.variables.getVariableByIdAsync(id)) ?? comps.variables.getVariableByIdAsync(id) } };
}
export const runOn = (figma) => async (code) => new AsyncFunction('figma', code)(figma);
if (process.argv[1] !== fileURLToPath(import.meta.url)) { /* imported by a test: no server */ } else serve();

function serve() {
const figma = standinFigma(Number(process.env.STANDIN_COMPONENTS ?? 12));
let waits = Number(process.env.STANDIN_WAIT_CALLS ?? 0);
const fileKey = process.env.STANDIN_FILE_KEY || null;

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const text = (o, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(o) }], ...(isError ? { isError: true } : {}) });

async function execute({ code, fileKey: key }) {
  if (process.env.STANDIN_LOG) appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ key: key ?? null, length: code.length }) + '\n');
  if (waits > 0) { waits--; return text({ error: 'No Figma Desktop Bridge plugin connected', message: 'Failed to execute code in Figma plugin context', hint: 'Make sure the Desktop Bridge plugin is running in Figma' }, true); }
  if (key && fileKey && key !== fileKey) return text({ error: `File ${key} is not connected`, message: 'Failed to execute code in Figma plugin context' }, true);
  try {
    const result = await new AsyncFunction('figma', code)(figma);
    return text({ success: true, result, fileContext: { fileKey, fileName: 'Acme' }, timestamp: Date.now() });
  } catch (e) { return text({ success: false, error: e.message, fileContext: { fileKey } }); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0;) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    if (m.id == null) continue;   // a notification
    if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'figma-console-mcp', version: '0.0.0-standin' } } });
    else if (m.method === 'tools/call' && m.params.name === 'figma_execute') send({ id: m.id, result: await execute(m.params.arguments) });
    else send({ id: m.id, error: { code: -32601, message: `no ${m.method} ${m.params?.name ?? ''}`.trim() } });
  }
});
process.stdin.on('end', () => process.exit(0));
process.stderr.write('[figma-console-mcp stand-in] ready on stdio\n');
}
