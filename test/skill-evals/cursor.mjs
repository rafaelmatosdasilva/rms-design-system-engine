// test/skill-evals/cursor.mjs - the skill evaluation's runs in Cursor's agent (`cursor-agent -p`), beside Codex's.
//
// What a Cursor user gets is what docs/setup.md sets up: the engine's section in AGENTS.md (--agent-rules --write),
// the guard as Cursor's own hooks (--install-hooks --tool cursor, in .cursor/hooks.json) and the engine's command on
// the PATH. So the cursor variant writes both into the project before its first commit, and each run is one
// `cursor-agent -p --output-format stream-json` in a fresh HOME holding only the person's Cursor login. Its events are
// turned into the stream-json events every scorer already reads (context(), cliOf(), infraFailure()), as Codex's are
// (codex.mjs), so the tasks and their checks are the same ones Claude's and Codex's runs are held to.
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { envVar } from '../../lib/names.mjs';
import { AGENTS_VARIANT } from './codex.mjs';
import { ENGINE } from './lib.mjs';

// The CLI, where the person put it: DESIGN_SYSTEM_ENGINE_EVAL_CURSOR, else the PATH, else where Cursor's installer
// puts it (~/.local/bin, which a run's own PATH leaves out). → an absolute path, or null.
export function findCursor({ env = process.env, exists = existsSync, which = whichBin } = {}) {
  const named = envVar(env, 'EVAL_CURSOR');
  if (named) return exists(named) ? named : null;
  const onPath = which('cursor-agent');
  if (onPath) return onPath;
  const installed = join(homedir(), '.local', 'bin', 'cursor-agent');
  return exists(installed) ? installed : null;
}
function whichBin(name) { try { return execFileSync('which', [name], { encoding: 'utf8' }).trim() || null; } catch { return null; } }
export const CURSOR = findCursor();
export function cursorVersion(cli = CURSOR, run = execFileSync) {
  if (!cli) return null;
  try { return run(cli, ['--version'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

// The guide and the guard a Cursor user has: the AGENTS.md section, and the engine's hooks in .cursor/hooks.json. Both
// before the first commit, so they are the project's own; a project the task left without ds-config.json gets no hooks,
// as makeProject gives Claude's runs none there.
export const CURSOR_VARIANT = {
  ...AGENTS_VARIANT,
  name: 'cursor',
  rules: (dir) => {
    AGENTS_VARIANT.rules(dir);
    if (existsSync(join(dir, 'ds-config.json'))) execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--install-hooks', '--tool', 'cursor'], { cwd: dir, stdio: 'ignore' });
  },
};

// The login a run uses: the person's own, copied into the run's fresh HOME (removed with it). Cursor keeps its CLI
// settings and login in ~/.cursor/cli-config.json; nothing else of the person's Cursor comes along (no rules, no MCP
// servers, no trusted workspaces). DESIGN_SYSTEM_ENGINE_EVAL_CURSOR_API_KEY, when set, is passed as CURSOR_API_KEY instead.
export const CURSOR_LOGIN = join(envVar(process.env, 'EVAL_CURSOR_HOME') ?? join(homedir(), '.cursor'), 'cli-config.json');
export function cursorHome(home, login = CURSOR_LOGIN, env = process.env) {
  const dir = join(home, '.cursor');
  mkdirSync(dir, { recursive: true });
  if (envVar(env, 'EVAL_CURSOR_API_KEY')) return dir;
  if (!existsSync(login)) throw new Error(`no Cursor login at ${login}: run \`cursor-agent login\` once`);
  copyFileSync(login, join(dir, 'cli-config.json'));
  chmodSync(join(dir, 'cli-config.json'), 0o600);
  return dir;
}

// One turn's command line. --force is the headless stand-in for the person who approves each command, as Claude's runs
// allow their tools and Codex's hand each request to its own review; --trust trusts the throwaway project, as a person
// does once for theirs. Nothing else of Cursor's own setup is changed.
export function cursorArgs({ prompt, model = null, resume = null }) {
  return ['-p', '--output-format', 'stream-json', '--force', '--trust', ...(model ? ['--model', model] : []), ...(resume ? ['--resume', resume] : []), prompt];
}

// Cursor's tool calls by the names Claude Code's scorers read. Each is `<kind>ToolCall` with its args and, once done,
// its result ({ success } or { failure | error | rejected }).
const NAMES = { shell: 'Bash', read: 'Read', write: 'Write', edit: 'Edit', strReplace: 'Edit', multiEdit: 'Edit', delete: 'Edit', grep: 'Grep', glob: 'Glob', ls: 'Glob' };
function toolOf(tc = {}) {
  const key = Object.keys(tc).find((k) => /ToolCall$/.test(k));
  if (!key) {
    const fn = tc.function ?? {};
    let input = {}; try { input = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments ?? {}); } catch { /* as given */ }
    return { name: String(fn.name ?? 'unknown'), input, result: null };
  }
  const kind = key.replace(/ToolCall$/, ''), call = tc[key] ?? {}, a = call.args ?? {};
  if (kind === 'mcp') return { name: `mcp__${a.providerIdentifier ?? a.serverName ?? 'server'}__${a.toolName ?? a.name ?? ''}`, input: a.args ?? {}, result: call.result };
  const path = a.path ?? a.filePath ?? a.targetFile ?? a.file_path;
  const name = NAMES[kind] ?? kind;
  const input = name === 'Bash' ? { command: String(a.command ?? '') }
    : name === 'Write' ? { file_path: path, content: a.fileText ?? a.contents ?? a.content ?? '' }
    : name === 'Edit' ? { file_path: path, new_string: a.newString ?? a.new_string ?? '', ...(kind === 'delete' ? { deleted: true } : {}) }
    : name === 'Grep' || name === 'Glob' ? { pattern: a.pattern ?? a.globPattern ?? '', path }
    : name === 'Read' ? { file_path: path } : a;
  return { name, input, result: call.result };
}
// What a call returned, as the text a scorer reads, and whether it failed. A shell's output is its stdout and stderr,
// the way Claude Code's Bash result carries both.
function resultOf(r) {
  if (!r) return { text: '', isError: false };
  const bad = r.failure ?? r.error ?? r.rejected;
  const ok = r.success ?? (bad ? null : r);
  const v = ok ?? bad ?? {};
  const text = typeof v === 'string' ? v : [v.stdout, v.stderr].some((s) => s != null) ? [v.stdout, v.stderr].filter(Boolean).join('\n')
    : v.content ?? v.output ?? v.message ?? v.reason ?? JSON.stringify(v);
  const exit = v.exitCode ?? v.exit_code;
  return { text: String(text ?? ''), isError: !!bad || (exit != null && exit !== 0) };
}

// Cursor's events as Claude Code's stream-json. Its assistant and result events are already that shape; its tool calls
// are one `tool_call` event when started and one when completed, turned here into a tool_use and its tool_result.
export function toStreamJson(cursorEvents, { version = null } = {}) {
  const out = [];
  let session = null, last = '', calls = 0, result = null;
  for (const e of cursorEvents) {
    session = e.session_id ?? session;
    if (e.type === 'system' && e.subtype === 'init') { out.push({ type: 'system', subtype: 'init', session_id: session, model: e.model ?? null, claude_code_version: version ? `cursor ${version}` : 'cursor', skills: [] }); continue; }
    if (e.type === 'assistant') {
      const text = (e.message?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (text) { last = text; out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text }] } }); }
      continue;
    }
    if (e.type === 'tool_call' && e.subtype === 'completed') {
      const { name, input, result: r } = toolOf(e.tool_call);
      const { text, isError } = resultOf(r);
      const id = String(e.call_id ?? `call_${calls}`);
      calls++;
      out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id, name, input }] } });
      out.push({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } });
      continue;
    }
    if (e.type === 'result') result = e;
  }
  const u = result?.usage ?? {};
  const failed = !result ? null : result.is_error ? String(result.result ?? result.error ?? 'Cursor reported an error') : null;
  out.push({
    type: 'result', subtype: failed ? 'error' : 'success', is_error: !!failed, result: failed ?? (String(result?.result ?? '') || last), session_id: session,
    total_cost_usd: 0, num_turns: calls, duration_ms: result?.duration_ms ?? 0,
    usage: { input_tokens: u.inputTokens ?? u.input_tokens ?? 0, output_tokens: u.outputTokens ?? u.output_tokens ?? 0, cache_read_input_tokens: u.cacheReadTokens ?? u.cache_read_input_tokens ?? 0 },
    ...(failed ? { api_error_status: /usage limit|rate limit|429|quota|out of (fast )?requests/i.test(failed) ? 429 : null } : {}),
  });
  return out;
}

// One headless turn in Cursor. Resolves as runClaude does: { events, sessionId, cost, error, infra, limit, stderr }.
export function runCursor({ cwd, home, env, prompt, model = null, resume = null, timeoutMs = 15 * 60 * 1000, cli = CURSOR, version = null }) {
  return new Promise((resolve) => {
    if (!cli) { resolve({ events: [], sessionId: null, cost: 0, error: 'no cursor-agent on this machine', infra: 'no cursor-agent on this machine', limit: null, stderr: '' }); return; }
    const key = envVar(process.env, 'EVAL_CURSOR_API_KEY');
    const child = spawn(cli, cursorArgs({ prompt, model, resume }), { cwd, env: { ...env, ...(key ? { CURSOR_API_KEY: key } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      clearTimeout(timer);
      const raw = out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const events = toStreamJson(raw, { version });
      const result = events.at(-1);
      const started = raw.some((e) => e.type === 'system' && e.subtype === 'init');
      // Refused, never scored: Cursor that never started (no login, no network), a usage limit, or a turn that called
      // nothing and said next to nothing, as Codex's and Claude's are (codex.mjs, lib.mjs infraFailure).
      const idle = started && result.num_turns === 0 && !result.is_error && result.result.length < 40;
      const infra = timedOut ? null : !started ? `Cursor never started: ${(err.trim() || out.trim()).split('\n').slice(-3).join(' ').slice(0, 200)}` : result.api_error_status ? `Cursor refused the run: ${result.result.slice(0, 200)}` : idle ? `Cursor called nothing and said next to nothing: ${result.result.slice(0, 200)}` : null;
      resolve({ events, sessionId: result.session_id, cost: 0, error: timedOut ? `timed out after ${timeoutMs / 60000} min` : result.is_error && !infra ? result.result : null, infra, limit: timedOut ? 'timed out' : null, stderr: err.slice(-2000) });
    });
  });
}
