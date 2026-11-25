// react-app-context.mjs - what a React system's own app gives its components, given to them in the harness too.
//
// The React harness (react-harness.mjs) drew each component bare, with its stories' args only. A design system's
// components often need what their app wraps them in - a theme provider, a router, a store - or a list to draw, and
// drawn bare they threw or drew nothing, so part of the system went unchecked. Vue's harness has long given its
// components what the project's app installs and the data its own pages pass them (vue-harness.mjs: appPlugins,
// pageSamples); this does the same for React.
//
// Providers. The elements the project's own code wraps its app in, read as text from where it writes them: its entry
// (createRoot(…).render(<Provider><App/></Provider>), src/main.jsx or src/index.jsx), a Next.js layout or _app (around
// {children} or <Component/>), and its Storybook preview's decorators (around <Story/>). Each provider is written into a
// small module of the engine's (wrap.js, beside the harness page) that imports it from where the project imports it and
// gives it the props the project gives it. A provider whose props use a name that is neither imported there nor a
// plain declaration in that file is left out and said: never guessed at. Page elements (a <div>, <html>), React's own
// StrictMode and Fragment are not providers.
//
// Samples. The lists and objects the project's own pages pass a component (<Table rows={people}/> with
// const people = [...], or rows={[...]} written in place), read as literals and never run, with the same reader Vue's
// pages are read with (literalAt, plainValue). A case that sets none of these props gets them.
//
//   appProviders(ROOT)              → { providers: [{ name, from }], left: [{ name, from, why }], wrap(dir) → file | null }
//   reactPageSamples(ROOT)          → { file: { prop: value } }
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { literalAt, plainValue } from './vue-harness.mjs';
import { slashed } from './shown-path.mjs';

const EXT = ['.tsx', '.jsx', '.ts', '.js'];
const firstOf = (ROOT, bases) => bases.flatMap((b) => EXT.map((e) => b + e)).find((f) => existsSync(join(ROOT, f))) ?? null;
const ENTRIES = ['src/main', 'src/index', 'src/app/layout', 'app/layout', 'src/pages/_app', 'pages/_app'];
const PREVIEW = ['.storybook/preview'];
// The element each place wraps: the app, the page's children, the story.
const INNER = /^(App|Component|Story)$|^\{\s*children\s*\}$/;
const NOT_A_PROVIDER = /^(React\.)?(StrictMode|Fragment|Suspense)$|^[a-z]/;

// The opening tags around the inner element, outermost first, read from the JSX text: [{ name, attrs: [{ name, value
// (code), spread, literal }] }] up to <App/>, <Component/>, <Story/> or {children}. Strings and braces are matched,
// never run. → [] when no wrap is found.
export function wrappersIn(src) {
  const out = [];
  let i = 0;
  const skipSpace = () => { while (/\s/.test(src[i] ?? '')) i++; };
  const braced = () => {   // from a {, to its match: the code inside
    let depth = 0, q = null; const start = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { i++; return src.slice(start + 1, i - 1).trim(); }
    }
    return null;
  };
  const findInner = () => {
    const m = /<(App|Component|Story)\b[^>]*\/?>|\{\s*children\s*\}/.exec(src);
    return m ? m.index : -1;
  };
  const end = findInner();
  if (end < 0) return [];
  // Walk back from the inner element to the opening tags still open around it.
  const before = src.slice(0, end);
  const stack = [];
  const tagRe = /<\/?([A-Za-z][\w.]*)([^<>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(before))) {
    const [all, name, , selfClose] = m;
    if (all.startsWith('</')) { const k = stack.map((t) => t.name).lastIndexOf(name); if (k >= 0) stack.splice(k); continue; }
    if (selfClose) continue;
    stack.push({ name, at: m.index });
  }
  for (const t of stack) {
    i = t.at + 1 + t.name.length;
    const attrs = [];
    for (;;) {
      skipSpace();
      if (src[i] === '>' || src[i] === undefined) break;
      if (src[i] === '{') { const code = braced(); if (code?.startsWith('...')) attrs.push({ spread: code.slice(3).trim() }); continue; }
      const a = /^([A-Za-z_$][\w$:-]*)/.exec(src.slice(i));
      if (!a) break;
      i += a[1].length; skipSpace();
      if (src[i] !== '=') { attrs.push({ name: a[1], literal: true }); continue; }
      i++; skipSpace();
      if (src[i] === '{') attrs.push({ name: a[1], value: braced() });
      else if (src[i] === '"' || src[i] === "'") { const q = src[i]; const j = src.indexOf(q, i + 1); attrs.push({ name: a[1], literal: src.slice(i + 1, j) }); i = j + 1; }
      else break;
    }
    out.push({ name: t.name, attrs });
  }
  return out;
}

// The names a piece of code starts from (theme in theme.palette, store in createStore(reducer)): what it needs in scope.
// An object's own keys ({ accent: … }) are not names it needs, so they go before the names are read.
const ROOTS = (code) => [...new Set([...String(code).replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1').matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))]
  .filter((n) => !/^(true|false|null|undefined|new|typeof|this|return|function|const|let|var|Math|JSON|Object|Array|String|Number|Boolean|Date|window|document)$/.test(n));

// What a file binds each name to: an import (its source and how it is imported) or a top-level declaration's text.
function bindings(src) {
  const out = {};
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/g)) {
    const [, what, from] = m;
    const def = /^([A-Za-z_$][\w$]*)\s*(,|$)/.exec(what.trim());
    if (def) out[def[1]] = { from, kind: 'default' };
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(what);
    if (ns) out[ns[1]] = { from, kind: 'namespace' };
    const named = /\{([^}]*)\}/.exec(what);
    if (named) for (const part of named[1].split(',')) { const p = part.trim().replace(/^type\s+/, ''); if (!p) continue; const [orig, local] = p.split(/\s+as\s+/); out[(local ?? orig).trim()] = { from, kind: 'named', orig: orig.trim() }; }
  }
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/gm)) {
    // The declaration's text, to its end: the statement's last character at depth 0.
    let i = m.index + m[0].length, depth = 0, q = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
      else if ((ch === ';' || ch === '\n') && depth === 0 && !/[,(=+\-*/.?:&|]\s*$/.test(src.slice(m.index + m[0].length, i))) break;
    }
    out[m[1]] ??= { decl: src.slice(m.index, i).replace(/^export\s+/, '').trim() };
  }
  return out;
}

// A provider's tag and props as code, with every name they need brought in: the imports (a relative one made absolute
// from the file it was written in) and the plain declarations they lean on. → { code, imports: Set, decls: [] } | { why }
function providerCode(w, file, binds, ROOT, spec = (abs) => abs) {
  const imports = new Map(), decls = [], seen = new Set();
  const need = (name, depth = 0) => {
    if (seen.has(name)) return null; seen.add(name);
    const b = binds[name];
    if (!b) return `${name} is not imported in ${slashed(relative(ROOT, file))} nor declared there`;
    if (b.from) {
      const from = b.from.startsWith('.') ? spec(resolve(dirname(file), b.from)) : b.from;
      imports.set(name, b.kind === 'default' ? `import ${name} from ${JSON.stringify(from)};` : b.kind === 'namespace' ? `import * as ${name} from ${JSON.stringify(from)};` : `import { ${b.orig === name ? name : `${b.orig} as ${name}`} } from ${JSON.stringify(from)};`);
      return null;
    }
    if (/<\s*[A-Za-z/>]/.test(b.decl)) return `${name} is written with JSX in ${slashed(relative(ROOT, file))}`;
    if (depth > 4) return `${name} leans on too many other names`;
    for (const n of ROOTS(b.decl.replace(/^(const|let|var)\s+[A-Za-z_$][\w$]*\s*=/, ''))) { const why = need(n, depth + 1); if (why) return why; }
    decls.push(b.decl.endsWith(';') ? b.decl : `${b.decl};`);
    return null;
  };
  const tagRoot = w.name.split('.')[0];
  const whyTag = need(tagRoot);
  if (whyTag) return { why: whyTag };
  const props = [];
  for (const a of w.attrs) {
    if (a.spread) { for (const n of ROOTS(a.spread)) { const why = need(n); if (why) return { why }; } props.push(`...(${a.spread})`); continue; }
    if (a.literal === true) { props.push(`${JSON.stringify(a.name)}: true`); continue; }
    if (typeof a.literal === 'string') { props.push(`${JSON.stringify(a.name)}: ${JSON.stringify(a.literal)}`); continue; }
    if (/<\s*[A-Za-z/>]/.test(a.value)) return { why: `its ${a.name} is written with JSX` };
    for (const n of ROOTS(a.value)) { const why = need(n); if (why) return { why }; }
    props.push(`${JSON.stringify(a.name)}: (${a.value})`);
  }
  return { tag: w.name, props: `{ ${props.join(', ')} }`, imports, decls };
}

// spec: how a path of the project's is written for its build (Vite serves from the root, webpack takes it whole).
export function appProviders(ROOT, { spec = (abs) => abs.split(sep).join('/') } = {}) {
  const providers = [], left = [], parts = [];
  for (const rel of [firstOf(ROOT, ENTRIES), firstOf(ROOT, PREVIEW)].filter(Boolean)) {
    const file = join(ROOT, rel);
    let src; try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const binds = bindings(src);
    for (const w of wrappersIn(src)) {
      if (NOT_A_PROVIDER.test(w.name) || INNER.test(w.name)) continue;
      if (providers.some((p) => p.name === w.name)) continue;
      const c = providerCode(w, file, binds, ROOT, spec);
      if (c.why) { left.push({ name: w.name, from: rel, why: c.why }); continue; }
      providers.push({ name: w.name, from: rel });
      parts.push(c);
    }
  }
  const wrap = (dir) => {
    if (!parts.length) return null;
    const imports = [...new Set(parts.flatMap((p) => [...p.imports.values()]))];
    const decls = [...new Set(parts.flatMap((p) => p.decls))];
    const body = parts.reduceRight((inner, p) => `createElement(${p.tag}, ${p.props}, ${inner})`, 'children');
    const file = join(dir, 'wrap.js');
    writeFileSync(file, `// The providers the project's own app wraps its components in (react-app-context.mjs), so a component that needs\n// them draws here as it does there.\nimport { createElement } from 'react';\n${imports.join('\n')}\n${decls.join('\n')}\nexport default function DseAppWrap({ children }) { return ${body}; }\n`);
    return file;
  };
  return { providers, left, wrap };
}

// The lists and objects the project's own pages pass each component, by the component's file. → { file: { prop: value } }
export function reactPageSamples(ROOT) {
  const out = {}, files = [];
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|tests?|__tests__)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(jsx|tsx)$/.test(e.name) && !/\.(test|spec|stories)\.[jt]sx$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['src', 'app', 'pages']) walk(join(ROOT, d));
  // The app's entry wraps the app, it is no page: what it passes are its providers' props (appProviders reads those).
  const entries = new Set(ENTRIES.flatMap((b) => EXT.map((e) => join(ROOT, b + e))));
  for (const f of files) {
    if (entries.has(f)) continue;
    let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
    const binds = bindings(src);
    for (const [local, b] of Object.entries(binds)) {
      if (!b.from?.startsWith('.') || !/^[A-Z]/.test(local)) continue;
      const base = resolve(dirname(f), b.from);
      const target = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => join(base, 'index' + e))].find((x) => existsSync(x) && /\.[jt]sx?$/.test(x));
      if (!target) continue;
      for (const t of src.matchAll(new RegExp(`<${local}\\b`, 'g'))) {
        let i = t.index + t[0].length;
        // Each prop written as {…}, read to its matching brace.
        for (;;) {
          const a = /^\s*([A-Za-z_$][\w$]*)\s*=\s*\{/.exec(src.slice(i));
          if (!a) { const next = /^\s*(?:[A-Za-z_$][\w$-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)/.exec(src.slice(i)); if (next && next[0].trim()) { i += next[0].length; continue; } break; }
          const prop = a[1], open = i + a[0].length - 1;
          const code = literalAt(src, open);
          if (!code) break;
          i = open + code.length;
          const inner = code.slice(1, -1).trim();
          let value;
          if (/^[[{]/.test(inner)) value = plainValue(inner);
          else if (/^[A-Za-z_$][\w$]*$/.test(inner)) {
            const d = binds[inner]?.decl && /=\s*([[{])/.exec(binds[inner].decl);
            if (d) value = plainValue(literalAt(binds[inner].decl, binds[inner].decl.indexOf(d[1], d.index)) ?? '');
          }
          if (value !== undefined && typeof value === 'object' && (Array.isArray(value) ? value.length : Object.keys(value).length) && (out[target] ??= {})[prop] === undefined) out[target][prop] = value;
        }
      }
    }
  }
  return out;
}
