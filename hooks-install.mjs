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
  const pre = Array.isArray(settings.hooks?.PreToolUse) ? settings.hooks.PreToolUse : [];
  const others = pre.filter((h) => !(h?.hooks ?? []).some((x) => String(x?.command ?? '').includes(MARK)));
  const next = remove ? others : [...others, { matcher: MATCHER, hooks: [{ type: 'command', command: guardCommand(engineDir) }] }];
  settings.hooks = { ...(settings.hooks ?? {}), PreToolUse: next };
  if (!next.length) delete settings.hooks.PreToolUse;
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
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
  const cmd = (s.hooks?.PreToolUse ?? []).flatMap((h) => h?.hooks ?? []).map((x) => String(x?.command ?? '')).find((c) => c.includes(MARK));
  if (!cmd) return { installed: false, file };
  const path = cmd.match(/"([^"]+guard\.mjs)"/)?.[1];
  return { installed: true, file, command: cmd, exists: !!path && existsSync(path) };
}
