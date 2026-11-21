// test/skill-evals/terminal.mjs - the skill evaluation's runs in a terminal, with no agent at all (run.mjs --agent terminal).
//
// What a person in a terminal has is the engine's command and their own words: `rms-design-system-engine "<request>"`
// routes the request, runs each step its NEXT line names and stops where the person decides (lib/terminal-session.mjs).
// No guide is read and no model runs, so the run costs nothing and its tokens are 0. Each step the session ran is a
// Bash call of the engine's command and its output that call's result, and what the session said after the last step
// is its text: the stream-json events every scorer already reads, as Codex's and Cursor's are (codex.mjs, cursor.mjs),
// so the tasks and their checks are the same ones the agents are held to. With no terminal to ask in, a question takes
// its default, as a script running the command would have it.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ENGINE } from './lib.mjs';

export const TERMINAL_VARIANT = { name: 'terminal', ref: 'working tree', text: '', prefix: '', install: () => {} };

export function terminalVersion() {
  try { return `terminal ${JSON.parse(readFileSync(join(ENGINE, 'package.json'), 'utf8')).version}`; } catch { return 'terminal'; }
}

// The session's output as stream-json: each "$ rms-design-system-engine …" line starts a step, the lines up to the next
// step are its output, and the session's closing words (Your call, Next outside the engine, the Figma how-to) are left
// out of the last step's. The text is all of it, as the person read it. → events.
export function toStreamJson(output, { code = 0, session = 'terminal', version = 'terminal' } = {}) {
  const out = [{ type: 'system', subtype: 'init', session_id: session, claude_code_version: version, skills: [] }];
  const lines = String(output ?? '').split('\n');
  const steps = [];
  let before = [];
  for (const l of lines) {
    const m = /^\$ (rms-design-system-engine\b.*|node .*audit\.mjs\b.*)$/.exec(l);
    if (m) steps.push({ command: m[1], lines: [] });
    else if (steps.length) steps.at(-1).lines.push(l);
    else before.push(l);
  }
  // The closing words: the last step's lines from its last blank-line-led "Your call" / "Next, outside" / Figma how-to on.
  let closing = '';
  const last = steps.at(-1);
  if (last) {
    const at = last.lines.findLastIndex((l) => /^(Your call:|Next, outside the engine:|This step reads Figma|Stopped:)/.test(l));
    if (at >= 0) { closing = last.lines.slice(at).join('\n').trim(); last.lines = last.lines.slice(0, at); }
  }
  steps.forEach((s, i) => {
    const id = `step_${i + 1}`;
    out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command: s.command } }] } });
    out.push({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content: s.lines.join('\n').trim(), is_error: false }] } });
  });
  // A person in a terminal reads everything the session printed, not one closing message: that is the reply.
  const text = String(output ?? '').trim();
  out.push({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text }] } });
  out.push({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: session, total_cost_usd: 0, num_turns: steps.length, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }, exit_code: code });
  return out;
}

// One turn: the request typed in the task's project. A later turn of the same task is a new command, as a person types
// one (a terminal keeps no conversation). → what runClaude returns.
export function runTerminal({ cwd, env, prompt, timeoutMs = 15 * 60 * 1000, version = terminalVersion(), engine = ENGINE }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(engine, 'lib', 'audit.mjs'), prompt], { cwd, env: { ...env, DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const events = toStreamJson(out, { code: code ?? 1, version });
      resolve({ events, sessionId: 'terminal', cost: 0, error: timedOut ? `timed out after ${timeoutMs / 60000} min` : null, infra: null, limit: null, stderr: err });
    });
  });
}
