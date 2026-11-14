// build-cache.mjs - a part of the style guide's data kept between builds under what it was worked out from.
//
// A watch round builds the page twice (once for its audit to measure on, once after it), and most rounds change one
// thing: a part whose inputs are the same as last time gives the same, so it is taken from here instead of being
// worked out again. Only a part that reads nothing the audit writes is kept; its key is every input it reads.
//
//   partCache(ROOT) → { get(part, inputs), set(part, inputs, value) }: get answers undefined when the inputs differ
//   sourcesKey(ROOT, cfg) → what the components' own build reads (every script, style and build file of the project,
//     by name, size and time): what the engine writes is left out, so its runs never change it
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';

export const keyOf = (inputs) => createHash('sha256').update(JSON.stringify(inputs ?? null)).digest('hex').slice(0, 32);

export function partCache(ROOT) {
  const dir = join(ROOT, OUT_DIR, 'build-cache');
  const file = (part) => join(dir, `${String(part).replace(/[^\w-]/g, '-')}.json`);
  return {
    get(part, inputs) {
      try { const j = JSON.parse(readFileSync(file(part), 'utf8')); return j.key === keyOf(inputs) ? j.value : undefined; } catch { return undefined; }
    },
    set(part, inputs, value) {
      try { mkdirSync(dir, { recursive: true }); writeFileSync(file(part), JSON.stringify({ key: keyOf(inputs), value })); } catch { /* worked out again next time */ }
    },
  };
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.nuxt', '.output', '.cache', '.vite']);
const BUILT_FROM = /\.(vue|[cm]?[jt]sx?|css|scss|sass|less|svelte)$|^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|(vite|webpack|nuxt|tailwind|postcss|babel)\.config\.[cm]?[jt]s)$/;
export function sourcesKey(ROOT, cfg = {}) {
  const out = OUT_DIR.split('/')[0];
  const sg = cfg?.styleguide?.out ? relative(ROOT, resolve(ROOT, dirname(cfg.styleguide.out))) : null;
  const rows = [];
  const walk = (dir) => {
    let names = []; try { names = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      const rel = dir ? `${dir}/${d.name}` : d.name;
      if (d.isDirectory()) { if (!SKIP.has(d.name) && rel !== out && rel !== sg) walk(rel); }
      else if (d.isFile() && BUILT_FROM.test(d.name)) { try { const st = statSync(join(ROOT, rel)); rows.push(`${rel}\0${st.size}\0${Math.round(st.mtimeMs)}`); } catch { /* gone */ } }
    }
  };
  walk('');
  // The Showroom's screens kept outside the project (paths.showroom elsewhere: a demo's own screens) are drawn by its
  // build too, so they are part of what it reads; outside the project, nothing above saw them, and a screen changed
  // there was drawn as it was before.
  const shown = resolve(ROOT, cfg?.paths?.showroom ?? 'showroom'), relShown = relative(ROOT, shown);
  if (relShown.startsWith('..') || isAbsolute(relShown)) {
    const outside = (abs, label) => {
      let names = []; try { names = readdirSync(abs, { withFileTypes: true }); } catch { return; }
      for (const d of names) {
        const p = join(abs, d.name), l = label + '/' + d.name;
        if (d.isDirectory()) { if (!SKIP.has(d.name)) outside(p, l); }
        else if (d.isFile()) { try { const st = statSync(p); rows.push(`${l}\0${st.size}\0${Math.round(st.mtimeMs)}`); } catch { /* gone */ } }
      }
    };
    outside(shown, 'showroom@' + shown);
  }
  return keyOf(rows.sort());
}
