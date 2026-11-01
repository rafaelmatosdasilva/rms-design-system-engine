// template-composition.mjs - what each template is made of, in Figma and in its code.
//
// A template (ds-config.json templates[]: { name, nodeId, file? }) is a page frame in Figma composed of the system's
// components. Its snapshot (figma-templates.snapshot.json) lists, in Figma's order, the components each frame places at
// its top level. This finds each template's code file and says, for every component Figma composes, whether that file
// uses it. The gate (template-composition-check.mjs) and the style guide's Templates page both read it, so they agree.
//
//   templatesSnapshot(ROOT, cfg)                  → { file, templates: { name: { name, nodeId, components } } } | null
//   templateComposition(ROOT, cfg, { inProgress, snapshot }) → [{ name, nodeId, file, inProgress, parts, order }]
//     parts: [{ name, state: 'used' | 'missing' | 'exempt' | 'in-progress' | 'not-compared' }], in Figma's order
//       (not-compared: the template has no code file to look in)
//     file: the template's code file, relative to ROOT, or null when none is found
//     order: { figma, code } when the code uses the components it shares with Figma in another order, else null
//
// Reads only. A component is used when its base selector, its JSX tag or its import name appears in the file: the same
// detection as the sub-component gate, so it never depends on Code Connect.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, basename, relative, resolve, dirname } from 'node:path';
import { codeRoots } from './code-roots.mjs';
import { ENGINE_DIRS } from './names.mjs';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// The templates snapshot: paths.snapshotTemplates, else the project root, else beside the structure snapshot.
export function templatesSnapshot(ROOT, cfg = {}) {
  const structDir = dirname(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'));
  const file = [cfg.paths?.snapshotTemplates, 'figma-templates.snapshot.json', join(structDir, 'figma-templates.snapshot.json')]
    .filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync);
  if (!file) return null;
  const snap = readJson(file);
  return snap ? { file, templates: snap.templates ?? {} } : { file, templates: null };
}

const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', ...ENGINE_DIRS]);
const CODE_EXT = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js', '.svelte']);
function walk(dir, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); }
    else if (CODE_EXT.has(extname(e.name)) && !/\.(test|spec|stories)\./.test(e.name)) out.push(p);
  }
}

function declaredNames(text) {
  const out = [];
  for (const m of text.matchAll(/\bname\s*:\s*['"`]([A-Za-z0-9_-]+)['"`]/g)) out.push(m[1]);
  for (const m of text.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) out.push(m[1]);
  return out;
}

export function templateComposition(ROOT, cfg = {}, { inProgress = new Set(), snapshot = templatesSnapshot(ROOT, cfg)?.templates ?? {} } = {}) {
  const exceptions = new Set(cfg.knownTemplateExceptions ?? []);   // "Template/Component"
  const componentFiles = cfg.componentFiles ?? {};
  const selectors = cfg.componentSelectors ?? {};
  const templateFiles = Object.fromEntries((cfg.templates ?? []).filter((t) => t?.name && t.file).map((t) => [t.name, t.file]));
  const selNorm = (name) => norm(selectors[name] ?? ('.' + name.charAt(0).toLowerCase() + name.slice(1)));

  // Every component name a file may use: the configured selectors and every component any template composes.
  const universe = new Set(Object.keys(selectors));
  for (const t of Object.values(snapshot)) for (const c of (t?.components ?? [])) universe.add(c);
  const uni = [...universe].map((n) => ({ name: n, selNorm: selNorm(n) }));

  // The code files: templateSrcDirs, else componentSrcDirs, else the usual folders, else the whole project.
  let files = null;
  const codeFiles = () => {
    if (files) return files;
    files = [];
    for (const d of (cfg.templateSrcDirs ?? cfg.componentSrcDirs ?? ['src', 'components', 'app', 'lib', 'packages']).map((d) => join(ROOT, d))) if (existsSync(d)) walk(d, files);
    if (!files.length) walk(ROOT, files);
    for (const root of codeRoots(ROOT).slice(1)) walk(root, files);   // sibling folders the config names
    return files;
  };
  const texts = new Map();
  const read = (f) => { if (!texts.has(f)) { try { texts.set(f, readFileSync(f, 'utf8')); } catch { texts.set(f, ''); } } return texts.get(f); };

  // A template's code file: the one configured, else the one file named like it, declaring it or holding its selector.
  const resolveFile = (name) => {
    const explicit = templateFiles[name] ?? componentFiles[name];
    if (explicit) { const p = join(ROOT, explicit); return existsSync(p) ? p : null; }
    const nn = norm(name), sn = selNorm(name);
    const bySel = [], byName = [], byBase = [];
    for (const f of codeFiles()) {
      const t = read(f), tn = norm(t);
      if (sn.length >= 4 && tn.includes(sn)) bySel.push(f);
      if (declaredNames(t).some((d) => norm(d) === nn)) byName.push(f);
      if (norm(basename(f, extname(f))) === nn) byBase.push(f);
    }
    const pick = byBase.length === 1 ? byBase : byName.length === 1 ? byName : bySel;
    return pick.length === 1 ? pick[0] : null;
  };
  const usedIn = (file) => {
    const t = read(file), tn = norm(t), used = new Set();
    for (const u of uni) {
      if (u.selNorm.length >= 4 && tn.includes(u.selNorm)) { used.add(u.name); continue; }
      if (new RegExp(`<${esc(u.name)}\\b|\\b${esc(u.name)}\\b\\s*(?:from|,|})`).test(t)) used.add(u.name);
    }
    return used;
  };

  const out = [];
  for (const [name, entry] of Object.entries(snapshot)) {
    if (name.startsWith('_') || !entry) continue;
    const nodeId = entry.nodeId ?? (cfg.templates ?? []).find((t) => t?.name === name)?.nodeId ?? null;
    const composed = (entry.components ?? []).filter((c) => c !== name);
    if (inProgress.has(name)) { out.push({ name, nodeId, file: null, inProgress: true, parts: composed.map((c) => ({ name: c, state: 'in-progress' })), order: null }); continue; }
    const abs = composed.some((c) => !inProgress.has(c)) ? resolveFile(name) : null;
    const used = abs ? usedIn(abs) : new Set();
    const parts = composed.map((c) => ({ name: c, state: inProgress.has(c) ? 'in-progress' : exceptions.has(`${name}/${c}`) ? 'exempt' : !abs ? 'not-compared' : used.has(c) ? 'used' : 'missing' }));
    // The order the code places the components it shares with Figma: the first place each one's selector or name is
    // written. Said, never failed: a different order can be a layout that drifted or only the order of its imports.
    let order = null;
    const inOrder = parts.filter((p) => p.state === 'used').map((p) => p.name);
    if (abs && inOrder.length >= 2) {
      const t = read(abs);
      const firstIdx = (comp) => {
        const sel = selectors[comp] ?? ('.' + comp.charAt(0).toLowerCase() + comp.slice(1));
        const cand = [sel.length >= 3 ? t.toLowerCase().indexOf(sel.toLowerCase()) : -1, t.indexOf(comp)].filter((i) => i >= 0);
        return cand.length ? Math.min(...cand) : Number.MAX_SAFE_INTEGER;
      };
      const code = [...inOrder].sort((a, b) => firstIdx(a) - firstIdx(b));
      if (code.join('>') !== inOrder.join('>')) order = { figma: inOrder, code };
    }
    out.push({ name, nodeId, file: abs ? relative(ROOT, abs) : null, inProgress: false, parts, order });
  }
  return out;
}
