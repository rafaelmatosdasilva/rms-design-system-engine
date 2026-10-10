// setup-facts.mjs - what a project's own files already say, read by first-time setup so its first run checks what is
// there instead of reporting setup's guesses: the naming its token CSS follows, where the Figma snapshots live (beside
// the token CSS, every one of them), the system's own scripts, the products checked out beside it, and the frames and
// screens a captured screen snapshot already names. Pure reads; setup (audit.mjs --init) writes the config.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { resolveNamingSpec, tokenToVar } from './naming-convention.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// The Figma token names a variables snapshot holds: colour tokens per mode, sizing tokens (flat or per mode).
export function figmaTokenNames(figmaVars) {
  const names = new Set();
  const take = (group) => {
    if (!group || typeof group !== 'object') return;
    for (const [k, v] of Object.entries(group)) {
      if (k.startsWith('_')) continue;
      if (k.includes('/')) names.add(k);
      else if (v && typeof v === 'object') for (const t of Object.keys(v)) if (t.includes('/')) names.add(t);   // a mode's tokens
    }
  };
  take(figmaVars?.color);
  take(figmaVars?.sizing);
  return [...names];
}

// The naming the token CSS follows. The engine's default turns a Figma `iconText` segment into `text` (one system's
// early habit); a CSS that keeps `iconText`, or splits camelCase, is read as it is written: each way is tried on the
// Figma tokens the snapshot has, and the one that finds the most of them declared wins, the default on a tie.
// base: the namingConvention setup already chose (the Tailwind preset). Returns { naming, found, of } where naming is
// what to add to figma.namingConvention ({} when the default fits best).
const WAYS = [{}, { iconTextAlias: false }, { case: 'kebab' }, { iconTextAlias: false, case: 'kebab' }];
export function namingFromCode(themeText, figmaVars, base = {}) {
  const declared = new Set([...String(themeText).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const tokens = figmaTokenNames(figmaVars);
  if (!tokens.length || !declared.size) return { naming: {}, found: 0, of: tokens.length };
  let best = null;
  for (const way of WAYS) {
    const spec = resolveNamingSpec({ figma: { namingConvention: { ...base, ...way } } });
    const found = tokens.filter((t) => declared.has(tokenToVar(t, spec))).length;
    if (!best || found > best.found) best = { naming: way, found };
  }
  return { ...best, of: tokens.length };
}

// Every Figma snapshot the engine reads, beside the token CSS: captures write there and every check reads there, so a
// snapshot is never written to one place and looked for in another.
export const SNAPSHOT_FILES = {
  snapshotVars: 'figma-vars.snapshot.json',
  snapshotStructure: 'figma-structure.snapshot.json',
  compPropsSnapshot: 'figma-component-props.snapshot.json',
  snapshotFrameGeometry: 'figma-frame-geometry.snapshot.json',
  snapshotIcons: 'figma-icons.snapshot.json',
  snapshotScreenComponents: 'figma-screen-components.snapshot.json',
};
export function snapshotPaths(cssDir) {
  return Object.fromEntries(Object.entries(SNAPSHOT_FILES).map(([k, f]) => [k, join(cssDir, f).replace(/\\/g, '/')]));
}

// The system's own scripts: a plain script beside the token CSS that wires its components in the page (it reaches the
// document), never a test, a config or a framework's component. The ones that hold an icon sheet (<symbol>) are where
// its icons are defined too.
export function systemScripts(root, cssDir) {
  const dir = join(root, cssDir);
  let files = [];
  try { files = readdirSync(dir); } catch { return { scripts: [], iconSources: [] }; }
  const scripts = [], iconSources = [];
  for (const f of files.sort()) {
    if (!/\.m?js$/.test(f) || /\.(test|spec|config|stories)\.m?js$/.test(f)) continue;
    const rel = join(cssDir, f).replace(/\\/g, '/');
    const text = readText(join(dir, f));
    if (!/\bdocument\.|\baddEventListener\(/.test(text) || /from\s+['"]react['"]|require\(['"]react['"]\)/.test(text)) continue;
    scripts.push(rel);
    if (/<symbol\b/.test(text)) iconSources.push(rel);
  }
  return { scripts, iconSources };
}

// The products checked out beside the system: a folder next to this one whose package.json depends on the system's
// package (by its name, or by its repository). Each is keyed by its folder's name without the prefix every product
// folder shares, or by the product a captured screen names when the folder's name ends with it, and its UI source
// (ui.src.html) is read as product code. A product the system lists (products.json) that is not checked out beside it
// is said, so the person can clone it.
export function productsBeside(root, { screenKeys = [] } = {}) {
  const pkg = readJson(join(root, 'package.json')) ?? {};
  const name = pkg.name ?? null;
  const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
  const gitConfig = readText(join(root, '.git', 'config'));
  const remote = /url\s*=\s*(\S+)/.exec(gitConfig)?.[1] ?? '';
  const repo = (/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote) ?? /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(repoUrl) ?? /^github:([\w.-]+\/[\w.-]+)/.exec(repoUrl))?.[1] ?? null;
  const here = resolve(root);
  const parent = dirname(here);
  const found = [];
  let entries = [];
  try { entries = readdirSync(parent); } catch { /* no parent to read */ }
  for (const d of entries.sort()) {
    const dir = join(parent, d);
    if (dir === here) continue;
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    const p = readJson(join(dir, 'package.json'));
    if (!p) continue;
    const deps = { ...p.dependencies, ...p.devDependencies, ...p.peerDependencies };
    const uses = Object.entries(deps).some(([k, v]) => (name && k === name) || (repo && String(v).toLowerCase().includes(repo.toLowerCase())));
    if (uses) found.push(d);
  }
  // The prefix every product folder shares (rms-figma-…), when there are two or more, is not part of a product's name.
  let prefix = '';
  if (found.length > 1) {
    prefix = found.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
    prefix = prefix.slice(0, prefix.lastIndexOf('-') + 1);
  }
  const products = found.map((d) => {
    const key = screenKeys.find((k) => d === k || d.endsWith(`-${k}`)) ?? (d.slice(prefix.length) || d);
    const ui = ['ui.src.html', 'src/ui.src.html'].map((f) => `../${d}/${f}`).find((f) => existsSync(join(root, f))) ?? null;
    return { key, dir: `../${d}`, ui };
  });
  // Listed by the system and not beside it: said, never guessed.
  const listed = (readJson(join(root, 'products.json'))?.products ?? []).map((x) => String(x.repo ?? '')).filter(Boolean);
  const missing = listed.filter((r) => !found.includes(r.split('/').pop()));
  return { products, missing };
}

// The frames and screens a captured screen snapshot already names, as the config writes them ({ name, nodeId, plugin }):
// each product's whole screen (the shortest name of the ones it has) is a frame, its finer views (a dialog, a step)
// are screens. A snapshot captured before setup ran is the only way setup knows them without Figma.
export function framesFromSnapshot(snapshot) {
  const list = Object.entries(snapshot?.screens ?? {}).map(([id, s]) => ({ name: s?.name ?? id, nodeId: String(id).replace(/:/g, '-'), ...(s?.plugin ? { plugin: s.plugin } : {}) }));
  const frames = [], screens = [];
  const byPlugin = new Map();
  for (const s of list) { if (!s.plugin) { screens.push(s); continue; } (byPlugin.get(s.plugin) ?? byPlugin.set(s.plugin, []).get(s.plugin)).push(s); }
  for (const group of byPlugin.values()) {
    const whole = group.reduce((a, b) => (b.name.length < a.name.length ? b : a));
    frames.push(whole);
    for (const s of group) if (s !== whole) screens.push(s);
  }
  return { frames, screens };
}

// Everything above for one project, from its token CSS: what setup adds to the config, and what it says.
export function repoFacts(root, { themeCSS, figmaVars = null, naming = {} } = {}) {
  const firstTheme = [themeCSS].flat()[0];
  const cssDir = dirname(firstTheme);
  const themeText = [themeCSS].flat().map((f) => readText(join(root, f))).join('\n');
  const snaps = snapshotPaths(cssDir);
  const vars = figmaVars ?? readJson(join(root, snaps.snapshotVars));
  const screenSnap = readJson(join(root, snaps.snapshotScreenComponents));
  const { frames, screens } = framesFromSnapshot(screenSnap);
  const screenKeys = [...new Set([...frames, ...screens].map((s) => s.plugin).filter(Boolean))];
  return {
    snapshots: snaps,
    naming: namingFromCode(themeText, vars, naming),
    ...systemScripts(root, cssDir),
    ...productsBeside(root, { screenKeys }),
    frames,
    screens,
  };
}

