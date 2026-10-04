// code-roots.mjs - every folder a project's code lives in: the project itself, then the folders ds-config.json names
// outside it. A design system whose products live in sibling repositories (checked out beside it) names them in
// pluginDirs ({ "gallery": "../gallery-app" }) or codeRoots (["../some-app"]); every source scan then
// reads their code as the project's own, so a variable or a class only a product uses is not "unused", and a hard-coded
// value in a product is still found. Folders inside the project are already walked; a missing folder is skipped.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

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
