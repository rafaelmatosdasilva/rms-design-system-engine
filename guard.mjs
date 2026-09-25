#!/usr/bin/env node
// guard.mjs - the skill's never-rules as a Claude Code PreToolUse hook (idea I55), so they hold every time
// instead of depending on an agent remembering a paragraph.
//
// Installed per project by `rms-figma-code-parity --install-hooks` (and by --init), in
// .claude/settings.local.json. It reads the tool call Claude Code is about to make (JSON on stdin) and:
//   • denies editing a Figma snapshot by hand: they come from the capture, never from a hand edit;
//   • asks the person before editing ds-config.json, committing, pushing, or applying the hand-back patch.
// Anything else, or any project without a ds-config.json, or one with "hooks": false, passes untouched.
// The engine's own writes (node … audit.mjs, rms-figma-code-parity) are never blocked.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

const SNAPSHOT = /figma-[\w.-]*\.snapshot\.json/;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// { decision: 'deny' | 'ask', reason } or null to pass.
export function judge(event, { cfg = {} } = {}) {
  if (cfg.hooks === false) return null;
  const tool = event?.tool_name, input = event?.tool_input ?? {};
  const snapshotPaths = new Set(Object.entries(cfg.paths ?? {}).filter(([k, v]) => /^snapshot|Snapshot$/.test(k) && typeof v === 'string').map(([, v]) => basename(v)));
  const isSnapshot = (p) => SNAPSHOT.test(basename(String(p ?? ''))) || snapshotPaths.has(basename(String(p ?? '')));
  if (EDIT_TOOLS.has(tool)) {
    const file = input.file_path ?? input.notebook_path ?? input.path;
    if (isSnapshot(file)) return { decision: 'deny', reason: `${basename(file)} is written by the Figma capture, never by hand (a hand edit fakes a refresh). Refresh it with the capture (rms-figma-code-parity --recipe refresh-figma), or leave it stale and say so.` };
    if (basename(String(file ?? '')) === 'ds-config.json') return { decision: 'ask', reason: 'ds-config.json is the project\'s parity setup. Confirm this edit is what you asked for (guidelines links go through rms-figma-code-parity --guidelines, never a hand edit).' };
    return null;
  }
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '');
    const engine = /^\s*(node\s+\S*audit\.mjs|rms-figma-code-parity|rms-parity)\b/.test(cmd);
    if (!engine && SNAPSHOT.test(cmd) && (/(>|>>)\s*\S*figma-[\w.-]*\.snapshot\.json/.test(cmd) || /\b(sed\s+(-[a-zA-Z]*i|--in-place)|perl\s+-[a-zA-Z]*i|tee)\b/.test(cmd) || /\b(cp|mv)\s+\S+\s+\S*figma-[\w.-]*\.snapshot\.json/.test(cmd))) {
      return { decision: 'deny', reason: 'Figma snapshots are written by the capture, never by a shell edit. Refresh them with the capture (rms-figma-code-parity --recipe refresh-figma).' };
    }
    if (/\bgit\b[^|;&\n]*\spush\b/.test(cmd)) return { decision: 'ask', reason: 'Pushing sends the work to the remote. Confirm the person asked for a push.' };
    if (/\bgit\b[^|;&\n]*\scommit\b/.test(cmd)) return { decision: 'ask', reason: 'Committing records the change. Confirm the person asked for a commit.' };
    if (/\bgit\b[^|;&\n]*\sapply\b/.test(cmd) && /handback|code-changes\.diff/.test(cmd)) return { decision: 'ask', reason: 'The hand-back patch is only applied when the person asks. Confirm they did.' };
  }
  return null;
}

export function hookOutput(verdict) {
  if (!verdict) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: verdict.decision, permissionDecisionReason: `rms-figma-code-parity: ${verdict.reason}` } });
}

// As a hook: stdin → stdout, always exit 0 (a broken guard must never block work; --doctor reports it).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard.mjs')) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no input */ }
  try {
    const event = JSON.parse(raw || '{}');
    const root = resolve(event.cwd ?? process.cwd());
    const cfgPath = join(root, 'ds-config.json');
    if (existsSync(cfgPath)) {
      let cfg = {};
      try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* a broken config still gets the default rules */ }
      const out = hookOutput(judge(event, { cfg }));
      if (out) process.stdout.write(out);
    }
  } catch { /* pass */ }
  process.exit(0);
}
