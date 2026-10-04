// workaround-check.mjs - a workaround built around a component is a missing API (idea I59).
//
// When a screen places its own control over a design-system component to do what the component cannot
// (a clear button over a text field, action buttons laid over a list row), the screen is not wrong: the
// component is missing a slot or a prop for it. Documentation does not fix that; the fix lives in the
// component. So these are reported to the design-system side, never as the screen's mistake.
//
// Read from the code alone, framework-light and advisory:
//   • an action (a <button>, a link, role="button", a class named …-btn or …-button, or a design-system
//     component whose name says button) whose CSS positions it absolutely;
//   • laid over a host: its parent or a sibling in the markup, an ancestor in its own CSS selector
//     (.row .row-btn), or the element its class is named after (search-clear → search-input);
//   • the host is a design-system component (by its class, or a class written beside one) or a text field.
// A component's own source file is never read as a screen: a component may position its own parts.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { codeRoots } from './code-roots.mjs';
import { join, relative, extname } from 'node:path';
import { ENGINE_DIRS } from './names.mjs';

const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.next', '.nuxt', 'coverage', ...ENGINE_DIRS, 'contracts', 'storybook-static', 'vendor', 'test', 'tests', '__tests__']);
const MARKUP = new Set(['.html', '.htm', '.vue', '.jsx', '.tsx', '.svelte']);
const STYLE = new Set(['.css', '.scss', '.less']);
const FIELD = /^(input|textarea)$/i;
const TEXT_TYPES = /^(text|search|email|password|number|tel|url)$/i;

const classesOf = (attrs) => (/\bclass(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/.exec(attrs)?.[1] ?? '').split(/\s+/).filter((c) => /^[A-Za-z_][\w-]*$/.test(c));
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

// CSS rules → [{ selectors: [...], decls }] (comments removed, @-rule bodies flattened).
function cssRules(text) {
  const css = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  for (const m of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (head && !head.startsWith('@')) out.push({ selectors: head.split(',').map((s) => s.trim()).filter(Boolean), decls: m[2] });
  }
  return out;
}
const subjectOf = (sel) => sel.replace(/::?[\w-]+(\([^)]*\))?/g, '').trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
const classTokens = (compound) => [...(compound ?? '').matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

// The facts the check needs, from style text and markup text. Pure, for tests.
//   styles: [text], markup: [{ file, text }], dsClasses: Map(class → component name), ownFiles: Set(file)
export function workaroundFindings({ styles = [], markup = [], dsClasses = new Map(), ownFiles = new Set() } = {}) {
  // 1. Classes positioned absolutely, and the ancestor classes their selectors name.
  const absolute = new Set(), ancestors = new Map();   // class → Set(ancestor classes)
  for (const r of styles.flatMap(cssRules)) {
    const positioned = /(^|[;\s])position\s*:\s*absolute\b/i.test(r.decls);
    for (const sel of r.selectors) {
      const parts = subjectOf(sel);
      const subject = classTokens(parts.at(-1));
      if (positioned) subject.forEach((c) => absolute.add(c));
      for (const c of subject) for (const a of parts.slice(0, -1).flatMap(classTokens)) (ancestors.get(c) ?? ancestors.set(c, new Set()).get(c)).add(a);
    }
  }
  // 2. Class lists in markup and in quoted strings (JS that builds markup), and which classes are fields.
  const lists = [], fieldClasses = new Set();
  for (const { text } of markup) {
    for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
      const cls = classesOf(m[2]);
      if (cls.length) lists.push(cls);
      if (FIELD.test(m[1]) && (!/\btype\s*=/.test(m[2]) || TEXT_TYPES.test(/\btype\s*=\s*["']?([\w-]+)/.exec(m[2])?.[1] ?? ''))) cls.forEach((c) => fieldClasses.add(c));
    }
    for (const m of text.matchAll(/(["'])([A-Za-z_][\w-]*(?:\s+[A-Za-z_][\w-]*)+)\1/g)) lists.push(m[2].split(/\s+/));
  }
  const dsOf = (cls) => {
    if (dsClasses.has(cls)) return dsClasses.get(cls);
    for (const l of lists) if (l.includes(cls)) for (const c of l) if (dsClasses.has(c)) return dsClasses.get(c);
    return null;
  };
  const known = new Set(lists.flat());
  const hostOf = (cls) => (dsOf(cls) ? { kind: 'component', name: dsOf(cls), via: cls } : fieldClasses.has(cls) ? { kind: 'field', name: cls, via: cls } : null);

  // 3. Actions positioned absolutely, and the host each one is laid over.
  const found = new Map();   // key → finding
  for (const { file, text } of markup) {
    if (ownFiles.has(file)) continue;
    const stack = [];
    for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>/g)) {
      const [, close, tag, attrs, selfClose] = m;
      if (close) { const i = stack.map((e) => e.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
      const cls = classesOf(attrs);
      const parent = stack.at(-1);
      const el = { tag, cls, children: [] };
      parent?.children.push(el);
      const action = /^(button|a)$/i.test(tag) && (tag.toLowerCase() !== 'a' || /\bhref\s*=/.test(attrs))
        || /\brole\s*=\s*["']button["']/.test(attrs)
        || cls.some((c) => /(^|[-_])(btn|button)$/i.test(c));
      const positioned = cls.filter((c) => absolute.has(c));
      // A design-system component placed in another (a menu, a close button in a modal) is the system's own
      // composition, not a workaround: only a control the screen built itself counts.
      if (action && positioned.length && !cls.some((c) => dsOf(c))) {
        // Most explicit first: the control's own selector names what it sits in, then the element its class is
        // named after, then the markup around it (least sure where JavaScript builds the markup).
        const candidates = [
          ...positioned.flatMap((c) => [...(ancestors.get(c) ?? [])]),
          ...positioned.flatMap((c) => [...known].filter((k) => k !== c && k.length >= 3 && c.startsWith(k.replace(/-(wrap|input|field|item|row)$/, '') + '-'))),
          ...(parent?.cls ?? []),
          ...(parent?.children ?? []).filter((s) => s !== el).flatMap((s) => s.cls),
        ];
        const siblingField = (parent?.children ?? []).find((s) => s !== el && FIELD.test(s.tag));
        let host = candidates.filter((c) => !c.startsWith('\u0000') && !cls.includes(c)).map(hostOf).find(Boolean) ?? null;
        if (!host && siblingField) host = { kind: 'field', name: siblingField.cls[0] ?? siblingField.tag, via: siblingField.cls[0] ?? siblingField.tag };
        if (host && !(host.kind === 'component' && cls.some((c) => dsClasses.get(c) === host.name))) {
          const key = `${host.kind}|${host.name}|${positioned[0]}`;
          if (!found.has(key)) found.set(key, { file: relative('.', file) === file ? file : file, line: lineAt(text, m.index), action: positioned[0], host });
        }
      }
      if (!selfClose && !/^(input|img|br|hr|meta|link|source|use|path)$/i.test(tag)) stack.push(el);
    }
  }
  return [...found.values()];
}

// Grouped by host: one line per component or field, with the actions laid over it.
export function workaroundLines(findings) {
  const by = new Map();
  for (const f of findings) {
    const k = `${f.host.kind}|${f.host.name}`;
    (by.get(k) ?? by.set(k, []).get(k)).push(f);
  }
  return [...by.values()].map((fs) => {
    const h = fs[0].host, where = `${fs[0].file}:${fs[0].line}`;
    const actions = fs.map((f) => `.${f.action}`).join(', ');
    return h.kind === 'component'
      ? `${h.name}: ${actions} laid over it (${where}). The component may be missing a slot or prop for ${fs.length === 1 ? 'this action' : 'these actions'}.`
      : `a text field (.${h.name}): ${actions} laid over it (${where}). The design system's field may be missing this action.`;
  });
}

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

// The whole project. `locator` gives each component's class; `componentFiles` are components' own sources.
export function projectWorkarounds(ROOT, { names = [], classFor = () => null, componentFiles = {}, excludeDirs = [], excludeFiles = [] } = {}) {
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const skipName = (f) => excludeFiles.some((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(f.split('/').pop()));
  // A built file with its source beside it (ui.html from ui.src.html) is read once, from the source.
  const built = (f) => /\.html?$/i.test(f) && existsSync(f.replace(/\.(html?)$/i, '.src.$1'));
  const markupFiles = walk(ROOT, MARKUP).filter((f) => !built(f) && !skipName(f) && !relative(ROOT, f).split('/').some((d) => excludeDirs.includes(d)));
  const styleFiles = walk(ROOT, STYLE);
  const styles = [...styleFiles.map(read), ...markupFiles.map((f) => [...read(f).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'))];
  const dsClasses = new Map();
  for (const n of names) { const c = String(classFor(n) ?? '').replace(/^\./, ''); if (/^[A-Za-z_][\w-]*$/.test(c)) dsClasses.set(c, n); }
  const own = new Set(Object.values(componentFiles).flat().map((p) => relative(ROOT, join(ROOT, p))));
  const markup = markupFiles.map((f) => ({ file: relative(ROOT, f), text: read(f) }));
  return workaroundFindings({ styles, markup, dsClasses, ownFiles: own });
}
