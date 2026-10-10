// Where the project is. The engine works on the folder it runs in, unless told another: `--project=<folder>` or
// `--project=<git link>` (cloned beside where it runs, once). The answer is remembered in the folder it ran from
// (.design-system-engine-project), so every later run there goes to the same project without being told again.
// Imported for its effect, before anything reads the working folder.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

export const POINTER = '.design-system-engine-project';
const CODE_EXT = /\.(css|scss|sass|less|html|js|jsx|ts|tsx|mjs|vue|svelte)$/i;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.design-system-engine-out']);

// A folder holds a code project when it has a package manifest or any stylesheet, page or script of its own.
export function hasCode(dir) {
  if (['package.json', 'pnpm-workspace.yaml', 'composer.json', 'Gemfile', 'pubspec.yaml'].some((f) => existsSync(join(dir, f)))) return true;
  let seen = 0;
  const walk = (d, depth) => {
    if (depth > 4 || seen > 3000) return false;
    let names; try { names = readdirSync(d); } catch { return false; }
    for (const n of names) {
      if (SKIP.has(n) || n === POINTER) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      seen++;
      if (st.isDirectory()) { if (!n.startsWith('.') && walk(p, depth + 1)) return true; }
      else if (CODE_EXT.test(n)) return true;
    }
    return false;
  };
  return walk(dir, 0);
}

const OWNER_REPO = /^[A-Za-z0-9][\w-]*\/[\w.-]+$/;   // acme/ui-kit: a GitHub repository
const isGitLink = (v) => /^(https?:\/\/|git@|ssh:\/\/)/i.test(v) || (OWNER_REPO.test(v) && !existsSync(v));

// → the project folder for a --project answer: a folder as it is; a git link cloned beside where the engine runs
// (owner/repo means GitHub), or the clone already there.
export function projectFor(value, from = process.cwd(), { git = (args, cwd) => spawnSync('git', args, { cwd, stdio: 'inherit' }) } = {}) {
  const v = String(value).trim().replace(/^~(?=\/|$)/, homedir());
  if (!isGitLink(v)) return { dir: resolve(from, v) };
  const url = OWNER_REPO.test(v) ? `https://github.com/${v}.git` : v;
  const name = basename(url.replace(/\.git$/, '').replace(/[:/]+$/, '')).replace(/[^\w.-]/g, '') || 'project';
  const dir = join(from, name);
  if (existsSync(join(dir, '.git'))) return { dir, url };
  const r = git(['clone', url, dir], from);
  if (r.status !== 0) return { dir: null, url, error: `could not clone ${url}` };
  return { dir, url, cloned: true };
}

function arg(flag) { const hit = process.argv.slice(2).filter((a) => a === flag || a.startsWith(flag + '=')).pop(); if (!hit) return null; if (hit.includes('=')) return hit.slice(flag.length + 1); const i = process.argv.lastIndexOf(hit); return process.argv[i + 1] ?? null; }

// The effect: move to the project before the engine reads its folder.
export const PROJECT_FROM = process.cwd();
const asked = arg('--project');
// Whether the person has said where the code is: told now (--project, `.` for this folder) or remembered from before.
export let PROJECT_GIVEN = Boolean(asked);
if (asked) {
  const p = projectFor(asked, PROJECT_FROM);
  if (!p.dir || !existsSync(p.dir)) { console.error(`❌ No project at ${asked}${p.error ? `: ${p.error}` : ''}.\nNEXT: ask the person where their code is (a folder on this computer or a git link), then run again with --project=<it>`); process.exit(2); }
  if (p.cloned) console.log(`⬇  Cloned ${p.url} into ${p.dir}`);
  if (resolve(p.dir) !== resolve(PROJECT_FROM)) { try { writeFileSync(join(PROJECT_FROM, POINTER), resolve(p.dir) + '\n'); } catch { /* read-only: not remembered */ } }
  process.chdir(p.dir);
} else if (!existsSync(join(PROJECT_FROM, 'ds-config.json')) && existsSync(join(PROJECT_FROM, POINTER))) {
  const dir = readFileSync(join(PROJECT_FROM, POINTER), 'utf8').trim();
  if (dir && existsSync(dir)) { process.chdir(dir); PROJECT_GIVEN = true; console.error(`📁 Project: ${dir}`); }
}
