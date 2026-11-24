// has-code.mjs - whether a folder holds a code project: a package manifest, or any stylesheet, page or script of its
// own. Read only, with no effect on import, so setup (project-dir.mjs) and the router (route.mjs) ask the same question
// and get the same answer: a folder with no code is set up from Figma (--build), never taken for one that has some.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The file, in the folder an engine ran from, that says where its project is (project-dir.mjs): not the project's code.
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

