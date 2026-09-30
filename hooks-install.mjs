// hooks-install.mjs - puts guard.mjs in a project's Claude Code hooks (idea I55), or takes it out.
//
// Written to <project>/.claude/settings.local.json: per machine (it holds this engine's absolute path) and
// per project (only parity projects get it, never the person's global settings). Other settings and other
// hooks in the file are kept. Idempotent. The file is added to .gitignore when the project has one and
// does not ignore it yet, so a machine path is never committed by accident.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ENGINE = dirname(fileURLToPath(import.meta.url));
const MARK = 'guard.mjs';
const MATCHER = 'Edit|Write|MultiEdit|NotebookEdit|Bash';
const EDIT_MATCHER = 'Edit|Write|MultiEdit';

export function guardCommand(engineDir = ENGINE) {
  return `node "${join(engineDir, 'guard.mjs')}"`;
}

function readSettings(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`${file} is not valid JSON; fix it, then run --install-hooks again`); }
}

// Returns { file, changed, gitignored }.
export function installHooks(ROOT, { engineDir = ENGINE, remove = false } = {}) {
  const file = join(ROOT, '.claude', 'settings.local.json');
  const settings = readSettings(file);
  const before = JSON.stringify(settings);
  settings.hooks = { ...(settings.hooks ?? {}) };
  // PreToolUse holds the never-rules; UserPromptSubmit routes a request made with the command (I56);
  // PostToolUse checks each UI edit when it is made (I62).
  for (const [event, entry] of [['PreToolUse', { matcher: MATCHER }], ['UserPromptSubmit', {}], ['PostToolUse', { matcher: EDIT_MATCHER }]]) {
    const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const others = list.filter((h) => !(h?.hooks ?? []).some((x) => String(x?.command ?? '').includes(MARK)));
    const next = remove ? others : [...others, { ...entry, hooks: [{ type: 'command', command: guardCommand(engineDir) }] }];
    if (next.length) settings.hooks[event] = next; else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  const changed = JSON.stringify(settings) !== before;
  if (changed) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(settings, null, 2) + '\n'); }
  let gitignored = false;
  const gi = join(ROOT, '.gitignore');
  if (!remove && existsSync(gi)) {
    let ignored = false;
    try { execFileSync('git', ['check-ignore', '-q', '.claude/settings.local.json'], { cwd: ROOT, stdio: 'ignore' }); ignored = true; } catch { /* not ignored, or not a repo */ }
    if (!ignored && !/^\.claude\/settings\.local\.json\s*$/m.test(readFileSync(gi, 'utf8'))) {
      const text = readFileSync(gi, 'utf8');
      appendFileSync(gi, `${text.endsWith('\n') || !text ? '' : '\n'}.claude/settings.local.json\n`);
      gitignored = true;
    }
  }
  return { file, changed, gitignored };
}

// Is the guard installed, and does its command point at an engine that exists? For --doctor.
export function hooksStatus(ROOT) {
  const file = join(ROOT, '.claude', 'settings.local.json');
  let s = {};
  try { s = JSON.parse(readFileSync(file, 'utf8')); } catch { return { installed: false, file }; }
  const find = (event) => (s.hooks?.[event] ?? []).flatMap((h) => h?.hooks ?? []).map((x) => String(x?.command ?? '')).find((c) => c.includes(MARK));
  const cmd = find('PreToolUse');
  if (!cmd || !find('UserPromptSubmit') || !find('PostToolUse')) return { installed: false, file, ...(cmd ? { partial: true } : {}) };
  const path = cmd.match(/"([^"]+guard\.mjs)"/)?.[1];
  return { installed: true, file, command: cmd, exists: !!path && existsSync(path) };
}

// A project that installed the hooks before the router or the edit check existed gets them on its next run, so
// an update reaches every project that opted in. Never installs hooks where there were none, never on
// CI, never with "hooks": false. Hooks whose engine is gone (an install moved to its new name) point at this
// one again. Returns true when it upgraded.
export function upgradeHooks(ROOT, cfg = {}, { engineDir = ENGINE, env = process.env } = {}) {
  if (cfg.hooks === false || env.CI) return false;
  const h = hooksStatus(ROOT);
  // Partial (installed before the router or the edit check), or pointing at an engine that moved (the old name).
  if (!h.partial && !(h.installed && h.exists === false)) return false;
  try { installHooks(ROOT, { engineDir }); return true; } catch { return false; }
}
