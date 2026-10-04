// primitives.mjs - a raw element styled like a design-system primitive (idea I42).
//
// Composition code is where a system leaks: a <span> given the body text style and the secondary text colour is
// the system's <Text size="medium" color="secondary">, written by hand. No token check sees it (its values are the
// system's own variables) and no component check sees it (there is no component tag). The library owner declares
// the table, never inferred:
//
//   "primitives": [
//     { "component": "Text", "props": { "size": "medium", "color": "secondary" },
//       "when": { "font": "var(--body-medium)", "color": "var(--text-secondary)" } },
//     { "component": "Stack", "props": { "direction": "column" },
//       "when": { "display": "flex", "flex-direction": "column" } },
//     { "component": "Text", "props": { "size": "small" }, "when": { "class": ["text-sm", "text-muted"] } }
//   ]
//
// An element matches an entry when every condition holds: each CSS property has that value in the element's own
// style (its style attribute, a JSX style object, or a rule of one of its classes), and each listed class is on
// it. A variable matches with or without a fallback (var(--x, #333) is var(--x)). The entry with the most
// conditions wins, so a more specific primitive beats a looser one. Only plain HTML elements are read: a
// component tag (<Text>, <ds-text>) is already the system.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { codeRoots } from './code-roots.mjs';
import { join, extname, relative } from 'node:path';
import { ENGINE_DIRS } from './names.mjs';

const RAW = /^(div|span|p|section|article|header|footer|aside|main|nav|ul|ol|li|label|h[1-6]|strong|em|small|a)$/;
const MARKUP = new Set(['.html', '.htm', '.vue', '.jsx', '.tsx', '.svelte']);
const STYLE = new Set(['.css', '.scss', '.less']);
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.next', '.nuxt', 'coverage', ...ENGINE_DIRS, 'contracts', 'storybook-static', 'vendor', 'test', 'tests', '__tests__']);

const kebab = (k) => String(k).trim().replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).toLowerCase();
// A value as the table and the code both write it: lower case, single spaces, var() without its fallback.
export function normValue(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s*!important$/, '').replace(/var\(\s*(--[\w-]+)\s*(,[^()]*(\([^()]*\))?[^()]*)?\)/g, 'var($1)').replace(/\s+/g, ' ');
}

// The owner's table, checked: each entry needs a component and at least one condition.
export function primitiveTable(cfg = {}) {
  return (Array.isArray(cfg.primitives) ? cfg.primitives : [])
    .filter((p) => p && typeof p.component === 'string' && p.component && p.when && typeof p.when === 'object')
    .map((p) => {
      const decls = new Map(), classes = [];
      for (const [k, v] of Object.entries(p.when)) {
        if (k === 'class') classes.push(...[v].flat().map(String).filter(Boolean));
        else decls.set(kebab(k), normValue(v));
      }
      return { component: p.component, props: p.props && typeof p.props === 'object' ? p.props : {}, decls, classes };
    })
    .filter((p) => p.decls.size || p.classes.length);
}

// The tag to write: <Text size="medium" color="secondary">.
export function primitiveTag(p) {
  const props = Object.entries(p.props).map(([k, v]) => (v === true ? k : `${k}=${JSON.stringify(String(v))}`));
  return `<${p.component}${props.length ? ` ${props.join(' ')}` : ''}>`;
}

// A declaration block (CSS text or a style attribute) → Map(property → value).
export function declsOf(text) {
  const out = new Map();
  for (const part of String(text ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out.set(kebab(part.slice(0, i)), normValue(part.slice(i + 1)));
  }
  return out;
}

// A JSX style object's text ({ fontSize: 14, color: 'var(--x)' }) → Map(property → value).
export function jsxDeclsOf(text) {
  const out = new Map();
  for (const m of String(text ?? '').matchAll(/([A-Za-z-]+)\s*:\s*("[^"]*"|'[^']*'|`[^`]*`|[\w.#%-]+)/g)) {
    const v = m[2].replace(/^["'`]|["'`]$/g, '');
    out.set(kebab(m[1]), normValue(/^\d+(\.\d+)?$/.test(v) && !/^(font-weight|line-height|opacity|z-index|flex|flex-grow|flex-shrink|order)$/.test(kebab(m[1])) ? `${v}px` : v));
  }
  return out;
}

// Rules of single classes in style text (.title { … }) → Map(class → Map(property → value)). A selector with more
// than a class (a descendant, a state, an element) is the context's, not the element's own style.
export function classRulesOf(text) {
  const rules = new Map();
  const css = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    for (const sel of m[1].split(',').map((s) => s.trim())) {
      const c = /^\.([A-Za-z_][\w-]*)$/.exec(sel)?.[1];
      if (!c) continue;
      const into = rules.get(c) ?? rules.set(c, new Map()).get(c);
      for (const [k, v] of declsOf(m[2])) into.set(k, v);
    }
  }
  return rules;
}

// The primitive an element is, from its own declarations and classes: the matching entry with most conditions.
export function primitiveOf({ decls = new Map(), classes = [] }, table) {
  let best = null, size = 0;
  for (const p of table) {
    const ok = [...p.decls].every(([k, v]) => decls.get(k) === v) && p.classes.every((c) => classes.includes(c));
    const n = p.decls.size + p.classes.length;
    if (ok && n > size) { best = p; size = n; }
  }
  return best;
}

const lineAt = (text, i) => text.slice(0, i).split('\n').length;

// The plain elements in markup text that are a primitive: [{ line, tag, primitive }].
//   rules: class rules from the project's style text (classRulesOf), merged with the file's own <style> blocks.
export function primitiveFindings(text, table, { rules = new Map() } = {}) {
  if (!table.length) return [];
  const src = String(text ?? '');
  const own = classRulesOf([...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'));
  const out = [];
  for (const m of src.matchAll(/<([a-z][a-z0-9]*)\b((?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g)) {
    const [, tag, attrs] = m;
    if (!RAW.test(tag)) continue;
    const classes = (/\bclass(?:Name)?\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean);
    const decls = new Map();
    for (const c of classes) for (const [k, v] of own.get(c) ?? rules.get(c) ?? []) decls.set(k, v);
    const inline = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\{([\s\S]*?)\}\})/.exec(attrs);
    if (inline) for (const [k, v] of inline[3] != null ? jsxDeclsOf(inline[3]) : declsOf(inline[1] ?? inline[2])) decls.set(k, v);
    if (!decls.size && !classes.length) continue;
    const primitive = primitiveOf({ decls, classes }, table);
    if (primitive) out.push({ line: lineAt(src, m.index), tag, primitive });
  }
  return out;
}

// One line per finding: the element, where, and the tag to write instead.
export const primitiveLine = (f, file = '') => `<${f.tag}>${file ? ` ${file}:${f.line}` : ` line ${f.line}`} is ${primitiveTag(f.primitive)}, written by hand: use the component.`;

function walk(ROOT, exts, limit = 4000) {
  const files = [];
  const go = (dir, depth) => {
    if (files.length >= limit || depth > 8) return;
    let names; try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (SKIP_DIR.has(n) || n.startsWith('.')) continue;
      const abs = join(dir, n);
      let st; try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) go(abs, depth + 1);
      else if (exts.has(extname(n).toLowerCase()) && st.size < 1024 * 1024) files.push(abs);
    }
  };
  for (const root of codeRoots(ROOT)) go(root, 0);
  return files;
}

// The project's class rules, from its style sheets (for the edit check and the audit).
export function projectClassRules(ROOT) {
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  return classRulesOf(walk(ROOT, STYLE).map(read).join('\n'));
}

// The whole project: [{ file, line, tag, primitive }]. Components' own sources are the primitives themselves.
export function projectPrimitives(ROOT, cfg = {}) {
  const table = primitiveTable(cfg);
  if (!table.length) return [];
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const own = new Set(Object.values(cfg.componentFiles ?? {}).flat().map((p) => relative(ROOT, join(ROOT, p))));
  const excludeDirs = cfg.scanExcludeDirs ?? [];
  const built = (f) => /\.html?$/i.test(f) && existsSync(f.replace(/\.(html?)$/i, '.src.$1'));
  const rules = projectClassRules(ROOT);
  const out = [];
  for (const abs of walk(ROOT, MARKUP)) {
    const file = relative(ROOT, abs);
    if (built(abs) || own.has(file) || file.split('/').some((d) => excludeDirs.includes(d))) continue;
    for (const f of primitiveFindings(read(abs), table, { rules })) out.push({ file, ...f });
  }
  return out;
}

// The table as agents read it (llms.txt): what to write instead of a styled element.
export function primitiveGuideLines(cfg = {}) {
  return primitiveTable(cfg).map((p) => {
    const when = [...[...p.decls].map(([k, v]) => `${k}: ${v}`), ...p.classes.map((c) => `class ${c}`)].join(', ');
    return `- ${primitiveTag(p)} for an element styled with ${when}`;
  });
}
