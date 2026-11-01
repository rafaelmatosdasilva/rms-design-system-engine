// project-typescript.mjs - which TypeScript the engine may use. By default the project's own, else one installed for the
// whole machine (a global npm folder, NODE_PATH, tsc on the PATH), so a project without one still has its JSX and Props
// read. DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project limits it to the project's own: what a run finds then depends on the
// project alone, never on what the machine has installed (the engine's tests set it where they expect no TypeScript).
import { resolve, dirname, join, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

export const projectTypeScriptOnly = () => process.env.DESIGN_SYSTEM_ENGINE_TYPESCRIPT === 'project';

// A TypeScript the engine can actually use: it turns JSX into DOM calls (transpileModule) and reads a Props type by
// syntax (createSourceFile). TypeScript 7 is a rewrite that exposes only its version, so neither is there. Today
// `npm i -g typescript` installs it, which is why "a TypeScript is installed" and "a TypeScript the engine can use"
// stopped being the same thing: without this check a run fails deep inside a transpile, or on a missing ScriptKind,
// with a message that names nothing someone can act on.
export const usableTypeScript = (ts) => Boolean(ts?.transpileModule && ts?.createSourceFile && ts?.JsxEmit && ts?.ScriptTarget && ts?.ModuleKind && ts?.ScriptKind);

// What to say when none was usable, wherever that is reported.
export const TYPESCRIPT_HINT = 'install typescript 5 in the project, or npm i -g typescript@5 (version 7 reads no JSX)';

// A file the project installed: inside node_modules in the project's folder or one above it (a workspace's hoisted
// packages), never a machine-wide folder reached through NODE_PATH.
export function withinProject(ROOT, file) {
  if (!file) return false;
  for (let d = resolve(ROOT); ; d = dirname(d)) {
    if (String(file).startsWith(join(d, 'node_modules') + sep)) return true;
    if (dirname(d) === d) return false;
  }
}

// The machine's global npm folders, the ones `npm root -g` would name and those found without npm: an agent's shell
// often has node but not the PATH a terminal sets up (nvm, Volta, Homebrew only reached from a login profile), and
// asking npm alone then finds no TypeScript although one is installed. In order: npm's own answer, the prefix npm
// was told about, the folder beside the node that runs the engine, the prefix in ~/.npmrc, Volta's package image,
// Homebrew's two folders. Each is a folder that exists, listed once.
export function globalModuleDirs({ env = process.env, execPath = process.execPath, home = env.HOME ?? env.USERPROFILE ?? '', platform = process.platform, npmRoot = askNpm, exists = existsSync, read = (f) => readFileSync(f, 'utf8') } = {}) {
  const win = platform === 'win32';
  const under = (prefix) => (win ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules'));
  const out = [];
  const add = (d) => { if (d && !out.includes(d) && exists(d)) out.push(d); };
  add(npmRoot());
  for (const p of [env.npm_config_prefix, env.NPM_CONFIG_PREFIX]) if (p) add(under(p));
  add(win ? join(dirname(execPath), 'node_modules') : join(dirname(dirname(execPath)), 'lib', 'node_modules'));
  try { const m = read(join(home, '.npmrc')).match(/^\s*prefix\s*=\s*(.+?)\s*$/m); if (m) add(under(m[1].replace(/^~(?=\/|\\|$)/, home))); } catch { /* no ~/.npmrc */ }
  if (home) add(join(home, '.volta', 'tools', 'image', 'packages', 'typescript', win ? '' : 'lib', 'node_modules'));
  if (win && env.APPDATA) add(join(env.APPDATA, 'npm', 'node_modules'));
  if (!win) for (const d of ['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules']) add(d);
  return out;
}

function askNpm() {
  try { return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch { return null; }
}

// The machine's TypeScript the engine can use, from the first global folder that has one; null when none does.
export function machineTypeScript(dirs = globalModuleDirs()) {
  for (const d of dirs) {
    try { const ts = createRequire(join(d, 'noop.js'))('typescript'); if (usableTypeScript(ts)) return ts; } catch { /* not in this one */ }
  }
  return null;
}

// The machine's tsc script in a global folder, run with the node that runs the engine. null when none has one.
export function machineTsc(dirs = globalModuleDirs()) {
  for (const d of dirs) {
    const at = join(d, 'typescript', 'bin', 'tsc');
    if (existsSync(at)) return { cmd: process.execPath, args: [at] };
  }
  return null;
}
