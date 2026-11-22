// test/skill-evals/codex.mjs - the skill evaluation's runs in OpenAI Codex (`codex exec`), not only in Claude Code.
//
// What a Codex user gets is what docs/setup.md sets up: the engine's section in AGENTS.md (--agent-rules --write) and
// the engine's command on the PATH. So the agents variant writes that section into the project before its first
// commit, and each run is one `codex exec --json` in a fresh CODEX_HOME holding only the login. Its events are turned
// into the stream-json events every scorer already reads (context(), cliOf(), infraFailure()), as the Agent SDK's are,
// so the tasks and their checks are the same ones Claude's runs are held to.
//
// Codex runs no hook it has not been told to trust, and the trust is kept per project in its own config, by a
// fingerprint it does not document: in a fresh CODEX_HOME the guard and the router never run (seen in Codex CLI
// 0.171.0, at project and user level alike, with no word said). So these runs measure the guide in AGENTS.md alone;
// the guard in Codex is held to what Codex really sends by test/codex-recorded.test.mjs.
import { existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { envVar } from '../../lib/names.mjs';
import { writeRules, rulesSection } from '../../lib/agent-rules.mjs';
import { codexSkillText, SKILL_NAME } from '../../lib/codex-skill.mjs';
import { onPath } from '../../lib/project-bin.mjs';

// The CLI, where the person put it: DESIGN_SYSTEM_ENGINE_EVAL_CODEX, else the PATH. → an absolute path, or null.
export function findCodex({ env = process.env, exists = existsSync, which = whichBin } = {}) {
  const named = envVar(env, 'EVAL_CODEX');
  if (named) return exists(named) ? named : null;
  return which('codex');
}
// Found by the engine itself (project-bin.mjs onPath), since Windows has no `which`.
const whichBin = (name) => onPath(name);
export const CODEX = findCodex();
export function codexVersion(cli = CODEX, run = execFileSync) {
  if (!cli) return null;
  try { return run(cli, ['--version'], { encoding: 'utf8' }).trim().replace(/^codex-cli\s+/, ''); } catch { return null; }
}

// The guide a Codex user reads: the section --agent-rules --write puts in AGENTS.md, written before the project's
// first commit so it is the project's own and never read as the run's change.
// The engine keeps its Codex skill out of these runs, so the section is all the guide they have.
export const AGENTS_VARIANT = { name: 'agents', ref: 'working tree', text: rulesSection(), prefix: '', install: () => {}, rules: (dir) => writeRules(dir, 'AGENTS.md'), env: { DESIGN_SYSTEM_ENGINE_NO_CODEX_SKILL: '1' } };

// What install.sh gives a Codex user: the engine's own guide as a Codex skill (lib/codex-skill.mjs), the same guide Claude
// Code reads, asked for the way Codex asks for a skill, by its name first.
// With the engine's hooks too, as a person has them once they trusted them (docs/setup.md): the project gets a .codex
// folder before its first commit, so the engine's --install-hooks writes .codex/hooks.json beside Claude Code's, and
// each turn runs them (hooks: true, codexArgs).
export const CODEX_SKILL_VARIANT = {
  name: 'codex-skill', ref: 'working tree', text: codexSkillText(), prefix: `$${SKILL_NAME} `, hooks: true,
  install: (home) => { const dir = join(home, '.codex', 'skills', SKILL_NAME); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), codexSkillText()); },
  rules: (dir) => mkdirSync(join(dir, '.codex'), { recursive: true }),
};

// The login a run uses: the person's own Codex login, copied into the run's fresh CODEX_HOME (inside its throwaway
// HOME, removed with it). Nothing else of the person's Codex comes along: no config, no trusted projects, no skills.
export const CODEX_LOGIN = join(envVar(process.env, 'EVAL_CODEX_HOME') ?? join(homedir(), '.codex'), 'auth.json');
export function codexHome(home, login = CODEX_LOGIN) {
  const dir = join(home, '.codex');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(login)) throw new Error(`no Codex login at ${login}: run \`codex login\` once`);
  copyFileSync(login, join(dir, 'auth.json'));
  chmodSync(join(dir, 'auth.json'), 0o600);
  return dir;
}

// One turn's command line. The sandbox lets the run write its project and its HOME (where the engine keeps its pinned
// tools and the browser its profile), as a person's own Codex would. Inside it Chrome cannot start and the network is
// off, so an engine command run there measures nothing in a browser; a person approves running it outside the sandbox
// when Codex asks, and --approve-for-me hands that request to Codex's own automatic review, the headless stand-in for
// that person; it is the workspace-write sandbox itself, and Codex refuses -s beside it.
//
// hooks: the project's .codex/hooks.json runs, as it does for a person who trusted the project and its hooks once.
// Codex keeps that trust in its own config by a fingerprint it does not document, so a run trusts its throwaway project
// (--trust, saved in the run's own throwaway CODEX_HOME) and runs its hooks without a stored fingerprint
// (--dangerously-bypass-hook-trust, which Codex names for automation that vets its hook sources: these projects hold
// only the engine's own hooks, written by --install-hooks). The owner asked for the full evaluation, hooks included,
// 21 November 2026. Never used outside these throwaway runs.
export function codexArgs({ prompt, model = null, resume = null, home, hooks = false }) {
  // A later turn (`exec resume`) takes no sandbox, approval or writable-folder options: the session keeps the ones it
  // started with, and Codex refuses them there (a two-turn task never ran its second turn).
  const shared = ['--json', '--skip-git-repo-check', ...(hooks ? ['--trust', '--dangerously-bypass-hook-trust'] : []), ...(model ? ['-m', model] : [])];
  return resume ? ['exec', 'resume', ...shared, resume, prompt] : ['exec', ...shared, '--approve-for-me', '--add-dir', home, prompt];
}

// The command Codex ran, as the agent wrote it: Codex wraps each in the user's shell (`/bin/zsh -lc '…'`).
export function unwrap(command) {
  const s = String(command ?? '');
  const m = /^\/\S*\/(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(s);
  if (!m) return /^\/\S*\/(?:ba|z)?sh\s+-l?c\s+(\S+)$/.exec(s)?.[1] ?? s;   // a one-word command, unquoted
  return m[1] === "'" ? m[2].replace(/'\\''/g, "'") : m[2].replace(/\\(["\\$`])/g, '$1');
}

// Codex's events as Claude Code's stream-json: a command is a Bash call and its result, a patch an Edit of each file it
// touched, an MCP call that server's tool, the agent's words its text, and the end of the turn its result. Codex on a
// ChatGPT plan names no cost, so a run's cost is 0 and its tokens say what it spent.
export function toStreamJson(codexEvents, { version = null } = {}) {
  const out = [];
  let session = null, last = '', calls = 0, failed = null;
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  for (const e of codexEvents) {
    if (e.type === 'thread.started') { session = e.thread_id; out.push({ type: 'system', subtype: 'init', session_id: session, claude_code_version: version ? `codex ${version}` : 'codex', skills: [] }); continue; }
    if (e.type === 'turn.completed') { const u = e.usage ?? {}; usage.input_tokens += (u.input_tokens ?? 0) - (u.cached_input_tokens ?? 0); usage.cache_read_input_tokens += u.cached_input_tokens ?? 0; usage.output_tokens += (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0); continue; }
    if (e.type === 'turn.failed' || e.type === 'error') { failed = String(e.error?.message ?? e.message ?? 'Codex reported an error'); continue; }
    if (e.type !== 'item.completed') continue;
    const it = e.item ?? {}, id = String(it.id ?? `item_${out.length}`);
    const call = (name, input, result, isError = false) => {
      calls++;
      out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id, name, input }] } });
      out.push({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content: String(result ?? ''), is_error: !!isError }] } });
    };
    if (it.type === 'agent_message') { last = String(it.text ?? ''); out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text: last }] } }); }
    else if (it.type === 'command_execution') call('Bash', { command: unwrap(it.command) }, it.aggregated_output, it.exit_code !== 0 || it.status === 'failed' || it.status === 'declined');
    else if (it.type === 'file_change') for (const c of it.changes ?? []) call(c.kind === 'add' ? 'Write' : 'Edit', { file_path: c.path }, it.status ?? '', it.status === 'failed');
    else if (it.type === 'mcp_tool_call') call(`mcp__${it.server}__${it.tool}`, it.arguments ?? {}, typeof it.result === 'string' ? it.result : JSON.stringify(it.result?.content ?? it.result ?? it.error ?? ''), !!it.error || it.status === 'failed');
  }
  out.push({ type: 'result', subtype: failed ? 'error' : 'success', is_error: !!failed, result: failed ?? last, session_id: session, total_cost_usd: 0, num_turns: calls, usage, ...(failed ? { api_error_status: /usage limit|rate limit|429|quota/i.test(failed) ? 429 : null } : {}) });
  return out;
}

// One headless turn in Codex. Resolves as runClaude does: { events, sessionId, cost, error, infra, limit, stderr }.
export function runCodex({ cwd, home, env, prompt, variantEnv = {}, hooks = false, model = null, resume = null, timeoutMs = 15 * 60 * 1000, cli = CODEX, version = null }) {
  return new Promise((resolve) => {
    if (!cli) { resolve({ events: [], sessionId: null, cost: 0, error: 'no codex on this machine', infra: 'no codex on this machine', limit: null, stderr: '' }); return; }
    const child = spawn(cli, codexArgs({ prompt, model, resume, home, hooks }), { cwd, env: { ...env, ...variantEnv, CODEX_HOME: join(home, '.codex') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      clearTimeout(timer);
      const raw = out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const events = toStreamJson(raw, { version });
      const result = events.at(-1);
      const started = raw.some((e) => e.type === 'thread.started');
      // Refused, never scored: Codex that never started (no login, no network), or a usage limit.
      // Started, then called nothing and said next to nothing: the turn never ran (one run read 14k tokens and wrote 49),
      // so it says nothing about the guide, as a Claude run that spent nothing and called nothing (lib.mjs infraFailure).
      // A short answer with no command is still an answer (toggle-note asks how to add a note in Figma, which needs no
      // engine run): only a turn with no command and next to no words is one that never ran.
      const idle = started && result.num_turns === 0 && (result.usage?.output_tokens ?? 0) < 100 && String(result.result ?? '').trim().length < 40;
      const infra = timedOut ? null : !started ? `Codex never started: ${err.trim().split('\n').slice(-3).join(' ').slice(0, 200)}` : result.api_error_status ? `Codex refused the run: ${result.result.slice(0, 200)}` : idle ? `Codex called nothing and said next to nothing: ${result.result.slice(0, 200)}` : null;
      resolve({ events, sessionId: result.session_id, cost: 0, error: timedOut ? `timed out after ${timeoutMs / 60000} min` : result.is_error && !infra ? result.result : null, infra, limit: timedOut ? 'timed out' : null, stderr: err.slice(-2000) });
    });
  });
}
