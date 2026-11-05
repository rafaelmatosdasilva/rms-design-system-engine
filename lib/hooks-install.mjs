// hooks-install.mjs - puts guard.mjs in a project's Claude Code hooks, or takes it out.
//
// Written to <project>/.claude/settings.local.json: per machine (it holds this engine's absolute path) and
// per project (only parity projects get it, never the person's global settings). Other settings and other
// hooks in the file are kept. Idempotent. The file is added to .gitignore when the project has one and
// does not ignore it yet, so a machine path is never committed by accident.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, chmodSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));   // the engine's folder: its modules are in lib/
const MARK = 'guard.mjs';
// mcp__.*use_figma: a write to Figma goes through the engine's own script (figma-edits.mjs), once the person said yes.
const MATCHER = 'Edit|Write|MultiEdit|NotebookEdit|Bash|mcp__.*use_figma';
// After the tool ran: a UI edit is checked, and a Figma write the engine made gets its way back written from what the
// run reported (figma-undo.mjs), which only the run itself could see.
const EDIT_MATCHER = 'Edit|Write|MultiEdit|mcp__.*use_figma';

export function guardCommand(engineDir = ENGINE) {
  return `node "${join(engineDir, 'guard.mjs')}"`;
}

function readSettings(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`${file} is not valid JSON; fix it, then run --install-hooks again`); }
}

// ── The project's git hooks: a commit warns, a push refuses (git-check.mjs) ──
// Written into the repository's own hooks folder (.git/hooks): per machine like the settings above, never committed.
// A hooks folder in the working tree (core.hooksPath to a committed folder) and a hook of the project's own are the
// project's files: never written or changed, the line to add to it is said instead.
const GIT_MARK = '# rms-design-system-engine --git-check';
const GIT_HOOKS = { 'pre-commit': 'commit', 'pre-push': 'push' };
const sq = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;
export function gitHookLine(stage, engineDir = ENGINE) {
  return `node ${sq(join(engineDir, 'audit.mjs'))} --git-check ${stage}`;
}
// sub: the project's folder from the top of the repository, where git starts its hooks ('' when it is the top). Never
// an absolute path: worktrees of one repository share its hooks.
function gitHookScript(stage, sub, engineDir) {
  // A commit is never stopped, whatever happens; a push is refused only by the check's own answer. An engine or a node
  // that is gone stops nothing.
  return ['#!/bin/sh', `${GIT_MARK} ${stage}: ${stage === 'commit' ? 'warns about' : 'refuses'} the design system's findings in what the change uses.`,
    '# Written by rms-design-system-engine --install-hooks; --remove-hooks takes it out.',
    `[ -f ${sq(join(engineDir, 'audit.mjs'))} ] && command -v node >/dev/null 2>&1 || exit 0`,
    ...(sub ? [`cd ${sq(sub)} || exit 0`] : []),
    stage === 'commit' ? `${gitHookLine(stage, engineDir)}\nexit 0` : `exec ${gitHookLine(stage, engineDir)}`, ''].join('\n');
}
function gitHooksDir(ROOT) {
  const git = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const dir = git(['rev-parse', '--git-path', 'hooks']), common = git(['rev-parse', '--git-common-dir']), top = git(['rev-parse', '--show-toplevel']);
  if (!dir || !common || !top) return null;
  const abs = resolve(ROOT, dir), base = resolve(ROOT, common), rel = relative(base, abs);
  // git answers with the real path (/private/var on macOS for /var): the project's own is compared the same way.
  let real = ROOT; try { real = realpathSync(ROOT); } catch { /* kept as given */ }
  return { dir: abs, ours: !rel.startsWith('..') && !isAbsolute(rel), sub: relative(top, real).split('\\').join('/') };
}
// → { dir, sub, hooks: { 'pre-commit': 'ours' | 'added' | 'theirs' | 'none', 'pre-push': … }, writable } or null outside a git
// repository. 'added': the project's own hook, with the check's line in it.
export function gitHooksStatus(ROOT) {
  const d = gitHooksDir(ROOT);
  if (!d) return null;
  const hooks = {};
  for (const name of Object.keys(GIT_HOOKS)) {
    const f = join(d.dir, name);
    let text = null; try { text = readFileSync(f, 'utf8'); } catch { /* none */ }
    hooks[name] = text === null ? 'none' : text.includes(GIT_MARK) ? 'ours' : text.includes(`--git-check ${GIT_HOOKS[name]}`) ? 'added' : 'theirs';
  }
  return { dir: d.dir, sub: d.sub, hooks, writable: d.ours };
}
// → { dir, written: [names], kept: [{ name, line }] } (kept: the project's own hook, or a hooks folder it commits), or null.
export function installGitHooks(ROOT, { engineDir = ENGINE, remove = false } = {}) {
  const st = gitHooksStatus(ROOT);
  if (!st) return null;
  const written = [], kept = [];
  for (const [name, stage] of Object.entries(GIT_HOOKS)) {
    const f = join(st.dir, name);
    if (remove) { if (st.hooks[name] === 'ours') { try { unlinkSync(f); written.push(name); } catch { /* gone already */ } } continue; }
    if (st.hooks[name] === 'added') continue;
    if (st.hooks[name] === 'theirs' || !st.writable) { kept.push({ name, line: `${st.sub ? `(cd ${sq(st.sub)} && ` : ''}${gitHookLine(stage, engineDir)}${st.sub ? ')' : ''}${stage === 'push' ? ' || exit 1' : ''}` }); continue; }
    const script = gitHookScript(stage, st.sub, engineDir);
    let now = null; try { now = readFileSync(f, 'utf8'); } catch { /* none */ }
    if (now !== script) { mkdirSync(st.dir, { recursive: true }); writeFileSync(f, script); written.push(name); }
    try { chmodSync(f, 0o755); } catch { /* a file system without modes */ }
  }
  return { dir: st.dir, written, kept };
}

// Returns { file, changed, gitignored, git }.
export function installHooks(ROOT, { engineDir = ENGINE, remove = false } = {}) {
  const file = join(ROOT, '.claude', 'settings.local.json');
  const settings = readSettings(file);
  const before = JSON.stringify(settings);
  settings.hooks = { ...(settings.hooks ?? {}) };
  // PreToolUse holds the never-rules; UserPromptSubmit routes a request made with the command;
  // PostToolUse checks each UI edit when it is made; Stop checks the reply says what the route asked.
  for (const [event, entry] of [['PreToolUse', { matcher: MATCHER }], ['UserPromptSubmit', {}], ['PostToolUse', { matcher: EDIT_MATCHER }], ['Stop', {}]]) {
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
  let git = null;
  try { git = installGitHooks(ROOT, { engineDir, remove }); } catch { /* the Claude Code hooks stand on their own */ }
  return { file, changed: changed || !!git?.written.length, gitignored, git };
}

// Is the guard installed, and does its command point at an engine that exists? For --doctor.
export function hooksStatus(ROOT) {
  const file = join(ROOT, '.claude', 'settings.local.json');
  let s = {};
  try { s = JSON.parse(readFileSync(file, 'utf8')); } catch { return { installed: false, file }; }
  const find = (event) => (s.hooks?.[event] ?? []).flatMap((h) => h?.hooks ?? []).map((x) => String(x?.command ?? '')).find((c) => c.includes(MARK));
  const cmd = find('PreToolUse');
  if (!cmd || !find('UserPromptSubmit') || !find('PostToolUse') || !find('Stop')) return { installed: false, file, ...(cmd ? { partial: true } : {}) };
  // Installed with an earlier matcher: the events are all there, but one of them no longer reaches every tool it has
  // to (use_figma after the run, for the way back). Counts as partial, so the next run installs the current ones.
  const matcher = (event) => (s.hooks?.[event] ?? []).find((h) => (h?.hooks ?? []).some((x) => String(x?.command ?? '').includes(MARK)))?.matcher ?? '';
  if (matcher('PreToolUse') !== MATCHER || matcher('PostToolUse') !== EDIT_MATCHER) return { installed: true, file, partial: true, command: cmd, exists: !!cmd.match(/"([^"]+guard\.mjs)"/)?.[1] && existsSync(cmd.match(/"([^"]+guard\.mjs)"/)[1]) };
  const path = cmd.match(/"([^"]+guard\.mjs)"/)?.[1];
  return { installed: true, file, command: cmd, exists: !!path && existsSync(path) };
}

// A project that installed the hooks before the router, the edit check or the final check existed gets them on its next run, so
// an update reaches every project that opted in. Never installs hooks where there were none, never on
// CI, never with "hooks": false. Hooks whose engine is gone (an install that moved) point at this
// one again. Returns true when it upgraded.
export function upgradeHooks(ROOT, cfg = {}, { engineDir = ENGINE, env = process.env } = {}) {
  if (cfg.hooks === false || env.CI) return false;
  const h = hooksStatus(ROOT);
  // Installed before the git hooks existed: they come in where the repository's own hooks folder has room for them.
  let g = null; try { g = h.installed ? gitHooksStatus(ROOT) : null; } catch { /* not a repository */ }
  const gitMissing = !!g?.writable && Object.values(g.hooks).some((x) => x === 'none');
  // Partial (installed before the router or the edit check), or pointing at an engine that moved.
  if (!h.partial && !(h.installed && h.exists === false) && !gitMissing) return false;
  try { installHooks(ROOT, { engineDir }); return true; } catch { return false; }
}
