// figma-console.mjs - Figma read through a console bridge: Figma Console MCP (the figma-console-mcp package, MIT),
// when the project has it configured.
//
// That server runs code in Figma's plugin context through its Desktop Bridge plugin (figma_execute) and answers with
// what the code returned. The capture takes a runner, run(code) → the text the script gave back, so this is one more
// runner and nothing else: the engine starts the server the project names in its MCP config, as its own short-lived
// process over stdio, waits for the Desktop Bridge plugin to find it (the plugin probes ports 9223-9232 every few
// seconds, so a second server beside the one the agent's session runs is picked up on its own), runs each capture
// script unchanged and stops the server. No API token, no figma-cli and no copying chunk by chunk. Only reads: every
// script it runs is one of the engine's own read-only capture scripts.
//
// Used only where the project names the server (.mcp.json, .cursor/mcp.json or .vscode/mcp.json), never installed or
// fetched by the engine. DESIGN_SYSTEM_ENGINE_FIGMA_CONSOLE=none switches it off, as DESIGN_SYSTEM_ENGINE_FIGMA_CLI does
// figma-cli.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn as spawnChild } from 'node:child_process';

export const CONSOLE_PACKAGE = 'figma-console-mcp';
export const MCP_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'];
export const figmaConsoleOff = (env = process.env) => env.DESIGN_SYSTEM_ENGINE_FIGMA_CONSOLE === 'none';

// The server's entry in the project's MCP config: { file, name, command, args, env } or null. A stdio entry only (a
// command to start): an entry by URL is a server some other process runs, which this read does not reach.
export function findFigmaConsole(ROOT, { read = (p) => readFileSync(p, 'utf8') } = {}) {
  for (const file of MCP_FILES) {
    let cfg;
    try { cfg = JSON.parse(read(join(ROOT, file))); } catch { continue; }
    const servers = cfg?.mcpServers ?? cfg?.servers ?? {};
    for (const [name, s] of Object.entries(servers)) {
      if (!s || typeof s.command !== 'string') continue;
      const args = Array.isArray(s.args) ? s.args.map(String) : [];
      if (![s.command, ...args].some((a) => a.includes(CONSOLE_PACKAGE))) continue;
      return { file, name, command: s.command, args, env: s.env && typeof s.env === 'object' ? s.env : {} };
    }
  }
  return null;
}

// A small MCP client over stdio (newline-delimited JSON-RPC, as the protocol's stdio transport is). → { call(tool,
// args) → the tool's text, close() }. The server's own log goes to its stderr and is kept for the error.
export async function stdioMcp({ command, args = [], env = {}, cwd }, { spawn = spawnChild, initTimeoutMs = 60000 } = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', err = '', next = 1, gone = null;
  const waiting = new Map();
  const fail = (why) => { gone = why; for (const w of waiting.values()) w.reject(new Error(why)); waiting.clear(); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      const w = m.id != null && waiting.get(m.id);
      if (!w) continue;
      waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message ?? JSON.stringify(m.error))); else w.resolve(m.result);
    }
  });
  child.stderr?.setEncoding?.('utf8');
  child.stderr?.on('data', (d) => { err = (err + d).slice(-4000); });
  const lastErr = () => err.trim().split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0];
  child.on('error', (e) => fail(`${command} did not start: ${e.message}`));
  child.on('exit', (code) => fail(`${command} stopped (exit ${code})${lastErr() ? `: ${lastErr()}` : ''}`));
  const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  const request = (method, params, timeoutMs) => new Promise((resolve, reject) => {
    if (gone) { reject(new Error(gone)); return; }
    const id = next++;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} got no answer in ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    send({ id, method, params });
  });
  const close = () => { try { child.stdin.end(); } catch { /* closed */ } try { child.kill(); } catch { /* gone */ } };
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rms-design-system-engine', version: '1' } }, initTimeoutMs);
  } catch (e) { close(); throw e; }
  send({ method: 'notifications/initialized' });
  return {
    async call(name, args, timeoutMs = 330000) {
      const r = await request('tools/call', { name, arguments: args }, timeoutMs);
      const text = (r?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
      return { text, isError: !!r?.isError };
    },
    close,
  };
}

// What figma_execute's answer holds → the text the script gave back, as figma-cli prints it, or an Error.
export function executeAnswer({ text, isError }) {
  let a = null;
  try { a = JSON.parse(text); } catch { /* not JSON */ }
  if (isError || !a || a.success === false || a.error) {
    const why = a?.error ?? (String(text ?? '').trim() || 'no answer');
    return new Error(`figma_execute failed: ${why}${a?.hint ? ` (${a.hint})` : ''}`);
  }
  return typeof a.result === 'string' ? a.result : JSON.stringify(a.result ?? null);
}

// The runner: starts the server, waits for the Desktop Bridge plugin to answer, and runs each script with
// figma_execute in the design system's file (figmaFileKey, when ds-config names it, so another file open in Figma is
// never read). → { run(code) → text, close(), file }. waitMs: how long the plugin has to find the server. timeout: each
// script's, the most the server allows (300 s): Figma cannot stop a script once it runs, and one read of a real file's
// components took over 120 s, so a shorter limit only ends a read that would have finished.
export async function figmaConsoleRunner(ROOT, cfg = {}, { server = findFigmaConsole(ROOT), connect = (s) => stdioMcp({ ...s, cwd: ROOT }), waitMs = 30000, pause = (ms) => new Promise((r) => setTimeout(r, ms)), timeout = 300000 } = {}) {
  if (!server) throw new Error(`Figma Console MCP is not configured in this project (${MCP_FILES.join(', ')})`);
  const mcp = await connect(server);
  const fileKey = cfg.figmaFileKey || undefined;
  const exec = async (code, ms) => executeAnswer(await mcp.call('figma_execute', { code, timeout: ms, ...(fileKey ? { fileKey } : {}) }, ms + 30000));
  // The plugin finds a new server on its next probe (every 3 s with none connected, 10 s with one): asked again until then.
  try {
    for (const start = Date.now(); ;) {
      const r = await exec('return 1', 10000);
      if (!(r instanceof Error) && r.trim() === '1') break;
      if (Date.now() - start >= waitMs) {
        const why = r instanceof Error ? r.message : `it answered ${r}`;
        throw new Error(`the Desktop Bridge plugin did not answer in ${Math.round(waitMs / 1000)} s (is it open in Figma Desktop${fileKey ? ' on the design system\'s file' : ''}?): ${why}`);
      }
      await pause(2000);
    }
  } catch (e) { mcp.close(); throw e; }
  return {
    server,
    async run(code) { const r = await exec(code, timeout); if (r instanceof Error) throw r; return r; },
    close: () => mcp.close(),
  };
}

// Whether the bridge answers: configured, switched on, and the plugin reachable. → { ok, why }.
export async function figmaConsoleAnswers(ROOT, cfg = {}, { env = process.env, server = findFigmaConsole(ROOT), runner = (s) => figmaConsoleRunner(ROOT, cfg, { server: s, waitMs: 15000 }) } = {}) {
  if (figmaConsoleOff(env) || !server) return { ok: false };
  try { const r = await runner(server); r.close(); return { ok: true, why: `Figma Console MCP is configured in ${server.file} and its Desktop Bridge plugin answers` }; }
  catch (e) { return { ok: false, why: String(e.message).split('\n')[0] }; }
}
