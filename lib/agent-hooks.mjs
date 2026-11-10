// agent-hooks.mjs - the guard in Cursor and in OpenAI Codex, not only in Claude Code.
//
// guard.mjs speaks Claude Code's hook protocol. Codex speaks nearly the same one (event names, PreToolUse's
// hookSpecificOutput, Stop's decision and reason), with its own edit tool (apply_patch, a patch of one or more files)
// and no "ask" answer. Cursor speaks its own: lower-case events, a permission field to print, a stop that sends the
// agent back with a follow-up message, and no transcript the guard can read. This module turns each tool's event into
// the one guard.mjs already judges, and each verdict back into what that tool reads. The rules stay in one place.
//
//   normalize(tool, event, { root })  → [{ kind, event }]   kind: 'prompt' | 'pre' | 'post' | 'stop' | 'reply' | 'none'
//   encode(tool, kind, payload)       → the text to print on stdout ('' for nothing)
//   remember / recall                 the person's latest message and the agent's latest reply, kept per project for
//                                     the tools that give no transcript to read them from
//
// Sources: Cursor's hooks (cursor.com/docs/agent/hooks) and Codex's (its hooks documentation), read 10 November 2026.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from './names.mjs';

export const TOOLS = ['claude', 'cursor', 'codex'];
// Which tool a hook runs in: said by the command the engine installed (guard.mjs --tool cursor), never guessed.
export const toolArg = (argv = process.argv) => { const i = argv.indexOf('--tool'); const t = i >= 0 ? argv[i + 1] : null; return TOOLS.includes(t) ? t : 'claude'; };

// ── What the person said last, and what the agent replied last: Cursor and Codex give no transcript the guard reads ──
const stateFile = (root) => join(root, OUT_DIR, 'agent-turn.json');
export function remember(root, patch) {
  let s = {}; try { s = JSON.parse(readFileSync(stateFile(root), 'utf8')); } catch { /* first */ }
  try { mkdirSync(join(root, OUT_DIR), { recursive: true }); writeFileSync(stateFile(root), JSON.stringify({ ...s, ...patch, at: new Date().toISOString() }, null, 2) + '\n'); } catch { /* a help, never a blocker */ }
}
export function recall(root) { try { return JSON.parse(readFileSync(stateFile(root), 'utf8')); } catch { return {}; } }

// The files a Codex patch touches, and the lines it adds to each: what guard.mjs reads from an edit.
export function patchFiles(patch) {
  const out = [];
  let cur = null;
  for (const line of String(patch ?? '').split('\n')) {
    const m = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (m) { cur = { file_path: m[2].trim(), added: [], kind: m[1] }; out.push(cur); continue; }
    const mv = /^\*\*\* Move to: (.+)$/.exec(line);
    if (mv && cur) { cur.file_path = mv[1].trim(); continue; }
    if (cur && line.startsWith('+') && !line.startsWith('+++')) cur.added.push(line.slice(1));
  }
  return out.map((f) => ({ file_path: f.file_path, new_string: f.added.join('\n'), content: f.added.join('\n'), deleted: f.kind === 'Delete' }));
}

// One tool's event as the Claude Code events guard.mjs judges. A Codex patch of three files is three edits.
export function normalize(tool, e = {}, { root = process.cwd() } = {}) {
  if (tool === 'cursor') {
    const base = { cwd: e.workspace_roots?.[0] ?? e.cwd ?? root, session_id: e.conversation_id, prompt_id: e.generation_id };
    switch (e.hook_event_name) {
      case 'beforeSubmitPrompt': return [{ kind: 'prompt', event: { ...base, hook_event_name: 'UserPromptSubmit', prompt: e.prompt ?? '' } }];
      case 'beforeShellExecution': return [{ kind: 'pre', event: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: e.command ?? '' } } }];
      case 'beforeMCPExecution': {
        let input = {}; try { input = typeof e.tool_input === 'string' ? JSON.parse(e.tool_input) : (e.tool_input ?? {}); } catch { /* as given */ }
        return [{ kind: 'pre', event: { ...base, hook_event_name: 'PreToolUse', tool_name: `mcp__${e.mcp_server_name ?? 'server'}__${e.tool_name ?? ''}`, tool_input: input } }];
      }
      case 'preToolUse': {
        if (!/^(Write|Delete)$/.test(String(e.tool_name ?? ''))) return [{ kind: 'none' }];   // the shell is judged before it runs (beforeShellExecution), where Cursor honours "ask"
        const i = e.tool_input ?? {};
        return [{ kind: 'pre', event: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: i.file_path ?? i.path ?? i.target_file, content: i.contents ?? i.content ?? i.new_string ?? '' } } }];
      }
      case 'postToolUse': {
        if (String(e.tool_name ?? '') !== 'Write') return [{ kind: 'none' }];
        const i = e.tool_input ?? {};
        return [{ kind: 'post', event: { ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: i.file_path ?? i.path ?? i.target_file, content: i.contents ?? i.content ?? '' } } }];
      }
      case 'afterAgentResponse': return [{ kind: 'reply', text: e.text ?? '' }];
      case 'stop': return [{ kind: 'stop', event: { ...base, hook_event_name: 'Stop', stop_hook_active: (e.loop_count ?? 0) > 0 } }];
      default: return [{ kind: 'none' }];
    }
  }
  if (tool === 'codex') {
    if (e.hook_event_name === 'PreToolUse' || e.hook_event_name === 'PostToolUse') {
      const kind = e.hook_event_name === 'PreToolUse' ? 'pre' : 'post';
      if (e.tool_name === 'apply_patch') {
        const files = patchFiles(e.tool_input?.command ?? e.tool_input?.patch ?? '');
        return files.length ? files.map((f) => ({ kind, event: { ...e, tool_name: 'Edit', tool_input: f } })) : [{ kind: 'none' }];
      }
      return [{ kind, event: e }];
    }
    if (e.hook_event_name === 'UserPromptSubmit') return [{ kind: 'prompt', event: e }];
    if (e.hook_event_name === 'Stop') return [{ kind: 'stop', event: e }];
    return [{ kind: 'none' }];
  }
  const k = { UserPromptSubmit: 'prompt', PreToolUse: 'pre', PostToolUse: 'post', Stop: 'stop' }[e.hook_event_name] ?? 'none';
  return [{ kind: k, event: e }];
}

// The strictest of several verdicts (a patch of three files): deny over ask over nothing.
export const strictest = (vs) => vs.filter(Boolean).sort((a, b) => (a.decision === 'deny' ? 0 : 1) - (b.decision === 'deny' ? 0 : 1))[0] ?? null;

// A verdict where the tool cannot ask the person (Codex; Cursor before a file edit): held, with what to do to go on.
const askToDeny = (v) => (v?.decision === 'ask' ? { decision: 'deny', reason: `${v.reason} Ask the person first; once they ask for this change in their own words, try again.` } : v);

// What each tool reads back. payload: a verdict ({ decision, reason }) for 'pre', the context text for 'prompt' and
// 'post', the reason to go back for 'stop'.
export function encode(tool, kind, payload) {
  const said = (r) => `rms-design-system-engine: ${r}`;
  if (tool === 'cursor') {
    if (kind === 'pre') {
      // Cursor reads a permission hook's stdout as JSON every time: an empty answer would block the action.
      if (!payload) return JSON.stringify({ permission: 'allow' });
      return JSON.stringify({ permission: payload.decision, user_message: said(payload.reason), agent_message: said(payload.reason) });
    }
    if (kind === 'pre-file') {   // before a file edit Cursor does not honour "ask": held instead, with how to go on
      const v = askToDeny(payload);
      return JSON.stringify(v ? { permission: v.decision, user_message: said(v.reason), agent_message: said(v.reason) } : { permission: 'allow' });
    }
    if (kind === 'prompt') return JSON.stringify({ continue: true });   // Cursor adds nothing to the prompt: AGENTS.md routes the request
    if (kind === 'post') return payload ? JSON.stringify({ additional_context: payload }) : '';
    if (kind === 'stop') return payload ? JSON.stringify({ followup_message: payload }) : '';
    return '';
  }
  if (tool === 'codex') {
    if (kind === 'pre') { const v = askToDeny(payload); return v ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: v.decision, permissionDecisionReason: said(v.reason) } }) : ''; }
    if (kind === 'prompt') return payload ?? '';   // plain text on stdout is added as context for the turn
    if (kind === 'post') return payload ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: payload } }) : '';
    if (kind === 'stop') return payload ? JSON.stringify({ decision: 'block', reason: payload }) : '';
    return '';
  }
  return '';   // Claude Code: guard.mjs writes its own outputs, as it always has
}
