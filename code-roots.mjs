// code-roots.mjs - every folder a project's code lives in: the project itself, then the folders ds-config.json names
// outside it. A design system whose products live in sibling repositories (checked out beside it) names them in
// pluginDirs ({ "gallery": "../gallery-app" }) or codeRoots (["../some-app"]); every source scan then
// reads their code as the project's own, so a variable or a class only a product uses is not "unused", and a hard-coded
// value in a product is still found. Folders inside the project are already walked; a missing folder is skipped.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { ENGINE_DIRS } from './names.mjs';

const cache = new Map();

export function codeRoots(ROOT, cfg = null) {
  const root = resolve(ROOT);
  if (!cfg && cache.has(root)) return cache.get(root);
  let c = cfg;
  if (!c) { try { c = JSON.parse(readFileSync(resolve(root, 'ds-config.json'), 'utf8')); } catch { c = {}; } }
  const outside = (p) => { const r = relative(root, p); return r === '..' || r.startsWith(`..${'/'}`) || r.startsWith('..\\') || isAbsolute(r); };
  const extra = [...(Array.isArray(c.codeRoots) ? c.codeRoots : []), ...Object.values(c.pluginDirs ?? {})]
    .filter((p) => typeof p === 'string' && p).map((p) => resolve(root, p)).filter((p) => outside(p) && existsSync(p));
  const roots = [root, ...new Set(extra)];
  if (!cfg) cache.set(root, roots);
  return roots;
}

// The folder an app of the design system lives in: ds-config.json pluginDirs names it (a sibling repository, a folder
// of its own), else apps/<app>.
export function appDir(cfg, app) {
  const d = cfg?.pluginDirs?.[app];
  return typeof d === 'string' && d ? d.replace(/\/+$/, '') : `apps/${app}`;
}

// Every UI source file of every root (styles, markup, scripts, Vue and Svelte), as { file (from ROOT), text }: no
// dependencies, builds, tests, stories, minified files, the engine's own output or the style guide app.
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', 'out', ...ENGINE_DIRS.map((d) => d.split('/')[0])]);
const UI = /\.(html?|jsx|tsx|js|ts|mjs|vue|svelte|css|scss|less)$/i;
export function sourceFiles(ROOT, cfg = null) {
  const out = [];
  const walk = (dir) => {
    let list = [];
    try { list = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.') && !/apps[\/]style-?guide$/.test(p)) walk(p); }
      else if (UI.test(p) && !/\.(test|spec|stories)\./.test(p) && !/\.min\./.test(p)) { try { out.push({ file: relative(ROOT, p), text: readFileSync(p, 'utf8') }); } catch { /* unreadable */ } }
    }
  };
  for (const r of codeRoots(ROOT, cfg)) walk(r);
  return out;
}

// The names a token should never carry (F6): each product's (products.json, pluginDirs, the folders codeRoots names),
// the brands ds-config.json declares (brands), and the system's own package scope (@acme/ds → acme).
export function brandNames(ROOT, cfg = {}) {
  const read = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
  const products = read('products.json');
  const list = [...(Array.isArray(products?.products) ? products.products : Array.isArray(products) ? products : []).flatMap((p) => [p?.name, String(p?.repo ?? '').split('/').pop()]),
    ...Object.keys(cfg.pluginDirs ?? {}), ...[cfg.brands ?? []].flat()];
  const scope = /^@([^/]+)\//.exec(read('package.json')?.name ?? '');
  if (scope) list.push(scope[1]);
  return [...new Set(list.filter((x) => typeof x === 'string' && x.trim()))];
}
