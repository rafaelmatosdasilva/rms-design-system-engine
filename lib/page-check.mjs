// page-check.mjs - a page written in the system's own framework, held to the system: every component it uses is one
// of the system's, each given only the props, values, events and slots it has, the data it takes, and placed where the
// documentation says it goes. Nothing is invented: a need nothing fits is a gap (data-missing), listed, never built.
//
// Framework-agnostic: Vue single-file components, Svelte, JSX/TSX and HTML with custom elements are read by one markup
// reader, each framework's way of writing a prop, an event, a two-way binding and a slot mapped to the same checks.
//
//   parseMarkup(markup, { syntax })   → the element tree: [{ tag, attrs: [{ kind, name, value, bound }], children, line }]
//   splitSource(file, text)           → { syntax, markup, line, script }
//   pageSystem(ROOT, cfg, catalog)    → the system as a page check reads it (each component's file, props, events,
//                                        slots, fields, and the data the code's own uses give)
//   checkPage(file, text, system, { context }) → { findings: [{ level, line, message }], gaps, used }
//
// Never edits a file. No dependency: the markup reader is the engine's own.

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { docFields, readLiteral, literalBindings, shapeFindings, requiredKeys, UNKNOWN } from './prop-shapes.mjs';
import { insideFindings, ruledOut } from './prototype-context.mjs';
import { nearName } from './ui-catalog.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const camel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

export function syntaxOf(file) {
  const ext = extname(String(file)).toLowerCase();
  return ext === '.vue' ? 'vue' : ext === '.svelte' ? 'svelte' : /^\.(jsx|tsx|js|ts)$/.test(ext) ? 'jsx' : /^\.html?$/.test(ext) ? 'html' : null;
}

// ── Where the markup and the script are ─────────────────────────────────────────
export function splitSource(file, text) {
  const syntax = syntaxOf(file);
  const t = String(text ?? '');
  const lineAt = (i) => t.slice(0, i).split('\n').length;
  const scripts = [...t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  if (syntax === 'vue') {
    // The top-level <template> block, its own nested <template> tags counted.
    const open = /<template\b[^>]*>/i.exec(t);
    if (!open) return { syntax, markup: '', line: 1, script: scripts };
    let d = 1, j = open.index + open[0].length;
    const re = /<\/?template\b[^>]*>/gi;
    re.lastIndex = j;
    let m;
    while ((m = re.exec(t))) { if (m[0][1] === '/') { if (--d === 0) break; } else if (!m[0].endsWith('/>')) d++; }
    return { syntax, markup: t.slice(j, m ? m.index : t.length), line: lineAt(j), script: scripts };
  }
  if (syntax === 'svelte' || syntax === 'html') {
    const markup = t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (x) => x.replace(/[^\n]/g, ' '));
    return { syntax, markup, line: 1, script: scripts };
  }
  return { syntax, markup: t, line: 1, script: t };
}

// ── The markup reader ───────────────────────────────────────────────────────────
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'pre']);

// How each framework writes what a component is given. → { kind: prop|event|model|slot|slotTarget|directive|native, name, value, bound }
function attrKind(raw, value, syntax, hasValue) {
  const bound = value != null && /^\{[\s\S]*\}$/.test(value);
  const inner = bound ? value.slice(1, -1).trim() : value;
  if (syntax === 'vue') {
    if (/^(?::|v-bind:)/.test(raw)) return { kind: 'prop', name: camel(raw.replace(/^(?::|v-bind:)/, '').split('.')[0]), value, bound: true };
    if (/^(?:@|v-on:)/.test(raw)) return { kind: 'event', name: raw.replace(/^(?:@|v-on:)/, '').split('.')[0], value };
    if (/^v-model(?::|$)/.test(raw)) return { kind: 'model', name: camel(raw.split(':')[1]?.split('.')[0] ?? 'modelValue'), value };
    if (/^(?:#|v-slot(?::|$))/.test(raw)) return { kind: 'slot', name: raw.replace(/^(?:#|v-slot:?)/, '').split(/[.=]/)[0] || 'default' };
    if (/^v-/.test(raw)) return { kind: 'directive', name: raw };
  }
  if (syntax === 'svelte') {
    if (/^on:/.test(raw)) return { kind: 'event', name: raw.slice(3).split('|')[0], value };
    if (/^bind:/.test(raw)) return { kind: 'model', name: raw.slice(5), value };
    if (/^(?:let|use|transition|in|out|animate|class|style):/.test(raw)) return { kind: 'directive', name: raw };
    if (raw === 'slot') return { kind: 'slotTarget', name: inner ?? 'default' };
    if (/^\{[\s\S]*\}$/.test(raw)) { const n = raw.slice(1, -1).trim(); return /^[A-Za-z_$][\w$]*$/.test(n) ? { kind: 'prop', name: n, value: raw, bound: true } : { kind: 'directive', name: raw }; }
  }
  if (syntax === 'html') {
    if (/^@/.test(raw)) return { kind: 'event', name: raw.slice(1), value };
    if (/^[.?]/.test(raw)) return { kind: 'prop', name: camel(raw.slice(1)), value, bound: true };
    if (raw === 'slot') return { kind: 'slotTarget', name: inner ?? 'default' };
  }
  if (syntax === 'jsx' && /^\{\s*\.\.\./.test(raw)) return { kind: 'directive', name: raw };
  if (syntax !== 'jsx' && raw === 'slot') return { kind: 'slotTarget', name: inner ?? 'default' };
  return { kind: 'prop', name: syntax === 'jsx' ? raw : camel(raw), value: hasValue ? value : true, bound };
}

export function parseMarkup(markup, { syntax = 'vue', line = 1 } = {}) {
  const s = String(markup ?? '');
  const root = { tag: '#root', attrs: [], children: [], line };
  const stack = [root];
  let i = 0, ln = line;
  const adv = (to) => { for (; i < to; i++) if (s[i] === '\n') ln++; };
  // In JSX a "<" starts a tag only where an element can start: not in a comparison or a type argument.
  // Inside an element's children and outside {…}, a "<" before a name is always a tag (<label>Name<input /></label>).
  let braces = 0;
  const canOpen = (at) => { if (syntax !== 'jsx') return true; if (stack.length > 1 && braces === 0 && stack[stack.length - 1].tag !== '#root') return true; let k = at - 1; while (k >= 0 && /\s/.test(s[k])) k--; return k < 0 || /[(>{},=?:&|\n]/.test(s[k]) || /\breturn$/.test(s.slice(Math.max(0, k - 6), k + 1)); };
  while (i < s.length) {
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i); adv(e < 0 ? s.length : e + 3); continue; }
    if (s[i] === '<' && s[i + 1] === '/') {
      const m = /^<\/\s*([A-Za-z][\w.:-]*)\s*>/.exec(s.slice(i));
      if (m) {
        const at = stack.map((n) => n.tag).lastIndexOf(m[1]);
        if (at > 0) stack.length = at;
        adv(i + m[0].length); continue;
      }
      if (syntax === 'jsx' && s.startsWith('</>', i)) { const at = stack.map((n) => n.tag).lastIndexOf('#fragment'); if (at > 0) stack.length = at; adv(i + 3); continue; }
    }
    if (s[i] === '<' && syntax === 'jsx' && s[i + 1] === '>' && canOpen(i)) { const n = { tag: '#fragment', attrs: [], children: [], line: ln }; stack[stack.length - 1].children.push(n); stack.push(n); adv(i + 2); continue; }
    if (s[i] === '<' && /[A-Za-z]/.test(s[i + 1] ?? '') && canOpen(i)) {
      const nameM = /^<([A-Za-z][\w.:-]*)/.exec(s.slice(i));
      const node = { tag: nameM[1], attrs: [], children: [], line: ln, at: i };
      adv(i + nameM[0].length);
      let selfClosing = false;
      while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) adv(i + 1);
        if (s.startsWith('/>', i)) { selfClosing = true; adv(i + 2); break; }
        if (s[i] === '>') { adv(i + 1); break; }
        // An attribute: its name (a JSX or Svelte spread or shorthand in braces), then its value if it has one.
        let raw = '';
        if (s[i] === '{') { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } raw = s.slice(i, j + 1); adv(j + 1); }
        else { const m = /^[^\s=/>]+/.exec(s.slice(i)); if (!m) { adv(i + 1); continue; } raw = m[0]; adv(i + raw.length); }
        while (i < s.length && /[ \t]/.test(s[i])) adv(i + 1);
        let value = null, hasValue = false;
        if (s[i] === '=') {
          adv(i + 1); while (i < s.length && /\s/.test(s[i])) adv(i + 1);
          hasValue = true;
          const q = s[i];
          if (q === '"' || q === "'") { const e = s.indexOf(q, i + 1); value = s.slice(i + 1, e < 0 ? s.length : e); adv(e < 0 ? s.length : e + 1); }
          else if (q === '{') { let d = 0, j = i; for (; j < s.length; j++) { const ch = s[j]; if (ch === '"' || ch === "'" || ch === '`') { const e = s.indexOf(ch, j + 1); j = e < 0 ? s.length : e; continue; } if (ch === '{') d++; else if (ch === '}' && --d === 0) break; } value = s.slice(i, j + 1); adv(j + 1); }
          else { const m = /^[^\s>]+/.exec(s.slice(i)); value = m ? m[0] : ''; adv(i + value.length); }
        }
        node.attrs.push({ raw, ...attrKind(raw, value, syntax, hasValue), line: ln });
      }
      node.end = i;
      stack[stack.length - 1].children.push(node);
      const lower = node.tag.toLowerCase();
      if (!selfClosing && RAW.has(lower)) { const e = s.toLowerCase().indexOf(`</${lower}`, i); adv(e < 0 ? s.length : e); continue; }
      if (!selfClosing && !VOID.has(lower)) stack.push(node);
      continue;
    }
    if (syntax === 'jsx' && stack.length > 1) { if (s[i] === '{') braces++; else if (s[i] === '}' && braces > 0) braces--; }
    adv(i + 1);
  }
  return root;
}

export function walk(node, fn, parents = []) {
  for (const c of node.children ?? []) { fn(c, parents); walk(c, fn, [...parents, c]); }
}

// ── Imports and where they lead ─────────────────────────────────────────────────
export function importsOf(script) {
  const out = new Map();
  for (const m of String(script ?? '').matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1].trim(), from = m[2];
    const def = /^([A-Za-z_$][\w$]*)/.exec(spec)?.[1];
    if (def && def !== 'type') out.set(def, from);
    for (const n of /\{([^}]*)\}/.exec(spec)?.[1]?.split(',') ?? []) { const [a, b] = n.trim().split(/\s+as\s+/); if (a) out.set((b ?? a).trim(), from); }
  }
  // Vue's defineAsyncComponent(() => import('…')) and React's lazy(() => import('…')).
  for (const m of String(script ?? '').matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:defineAsyncComponent|lazy|React\.lazy)\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)) out.set(m[1], m[2]);
  return out;
}

// The project's import aliases: Vite's resolve.alias, tsconfig/jsconfig paths; @ and ~ for src/ when none is written.
export function aliasesOf(ROOT) {
  const out = [];
  for (const f of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts', 'vue.config.js', 'svelte.config.js', 'nuxt.config.ts']) {
    let t = ''; try { t = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const m of t.matchAll(/['"]?([@~$#][\w/-]*|[A-Za-z][\w-]*)['"]?\s*:\s*(?:fileURLToPath\(\s*new URL\(\s*['"]([^'"]+)['"]|path\.resolve\(\s*__dirname\s*,\s*['"]([^'"]+)['"]|resolve\(\s*__dirname\s*,\s*['"]([^'"]+)['"]|['"](\.{0,2}\/[^'"]+)['"])/g)) {
      const dir = m[2] ?? m[3] ?? m[4] ?? m[5];
      if (/^[@~$#]/.test(m[1]) && dir) out.push({ from: m[1], to: resolve(ROOT, dir) });
    }
  }
  for (const f of ['tsconfig.json', 'jsconfig.json']) {
    let j = null; try { j = JSON.parse(readFileSync(join(ROOT, f), 'utf8').replace(/\/\/[^\n]*/g, '')); } catch { continue; }
    for (const [k, v] of Object.entries(j?.compilerOptions?.paths ?? {})) out.push({ from: k.replace(/\/\*$/, ''), to: resolve(ROOT, j.compilerOptions.baseUrl ?? '.', String(v?.[0] ?? '').replace(/\/\*$/, '')) });
  }
  if (!out.some((a) => a.from === '@')) out.push({ from: '@', to: join(ROOT, 'src') });
  if (!out.some((a) => a.from === '~')) out.push({ from: '~', to: join(ROOT, 'src') });
  return out.sort((a, b) => b.from.length - a.from.length);
}

const EXTS = ['', '.vue', '.svelte', '.tsx', '.jsx', '.ts', '.js', '/index.vue', '/index.tsx', '/index.jsx', '/index.ts', '/index.js'];
export function resolveImport(from, file, { ROOT, aliases }) {
  let base = null;
  if (from.startsWith('.')) base = resolve(dirname(file), from);
  else { const a = aliases.find((x) => from === x.from || from.startsWith(x.from + '/')); if (a) base = join(a.to, from.slice(a.from.length)); }
  if (!base) return { external: true };
  for (const e of EXTS) { const p = base + e; try { if (statSync(p).isFile()) return { file: p }; } catch { /* next */ } }
  return { file: null, wanted: base };
}

// ── The system, as a page check reads it ───────────────────────────────────────
// catalog: contracts/catalog.json. Each component's own file is found as the audit pairs it (component-api), its API read
// from it (props, events, slots), the fields of its list and object props from its doc comment, and what the code's own
// uses give each of those props (the keys every use gives).
export async function pageSystem(ROOT, cfg = {}, _catalog = null, { productFiles = null } = {}) {
  const { textComponentApi, extractEventPayloads, extractSlotProps } = await import('./component-source.mjs');
  const { callName } = await import('./component-api.mjs');
  const found = await componentFilesOf(ROOT, cfg);
  const components = {}, byFile = new Map(), templates = [];
  for (const k of found.list) {
    const abs = resolve(ROOT, k.file);
    if (byFile.has(abs)) continue;
    let text = ''; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    let a = { props: {}, slots: { named: [], default: false }, events: [] };
    try { a = textComponentApi(abs, text); } catch { /* read as having nothing */ }
    const payloads = extractEventPayloads(text), slotProps = extractSlotProps(text);
    const fields = docFields(text);
    const syntax = syntaxOf(k.file);
    // What its own comments say: the words in them, so a check can tell a prop, event or slot no comment names.
    const commentWords = [...new Set([...text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g)].flatMap((m) => m[0].match(/[A-Za-z_$][\w$:-]*/g) ?? []).map((w) => w.toLowerCase()))];
    components[k.name] = {
      name: k.name, file: k.file, tag: callName(k.name, k.file, text).tag ?? null, syntax, aliases: k.aliases ?? [],
      props: a.props ?? {}, events: a.events ?? [], eventPayloads: Object.fromEntries((a.events ?? []).filter((e) => payloads[e]).map((e) => [e, payloads[e]])),
      slots: { named: a.slots?.named ?? [], default: !!a.slots?.default, props: slotProps ?? {} },
      fields: Object.fromEntries(Object.entries(fields).map(([f, v]) => [Object.keys(a.props ?? {}).find((p) => norm(p) === norm(f)) ?? f, v])),
      commentWords,
    };
    byFile.set(abs, k.name);
    if (k.layer === 'templates') templates.push(k.name);
  }
  // The folders the system's components live in: an import into one that names no file is a component that does not exist.
  const roots = new Set();
  for (const f of byFile.keys()) { let d = dirname(f); for (let k = 0; k < 2 && d.startsWith(ROOT) && d !== ROOT; k++, d = dirname(d)) roots.add(d); }
  const aliases = aliasesOf(ROOT);
  // The components the app registers once for every page (app.component('Glyph', …)).
  const globals = new Map();
  for (const f of ['src/main.js', 'src/main.ts', 'src/main.mjs', 'main.js', 'main.ts']) {
    let t = ''; try { t = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    const imp = importsOf(t);
    for (const m of t.matchAll(/\.component\(\s*['"]([\w-]+)['"]\s*,\s*([A-Za-z_$][\w$]*)/g)) { const r = imp.has(m[2]) ? resolveImport(imp.get(m[2]), join(ROOT, f), { ROOT, aliases }) : {}; globals.set(norm(m[1]), r.file ? byFile.get(r.file) ?? m[1] : m[1]); }
  }
  // What the code's own uses give each list or object prop: the data a real page passes.
  const uses = {}, firstUse = {}, importSeen = {};
  let files = productFiles;
  if (!files) { try { files = (await import('./usage-map.mjs')).productFiles(ROOT, cfg); } catch { files = []; } }
  const protoDir = resolve(ROOT, cfg.prototype?.dir ?? 'prototypes');
  for (const f of files) {
    const abs = resolve(ROOT, f.file);
    if (byFile.has(abs) || abs.startsWith(protoDir + '/')) continue;
    const src = splitSource(f.file, f.text);
    if (!src.syntax) continue;
    const imports = importsOf(src.script), bindings = literalBindings(src.script);
    const tree = parseMarkup(src.markup, { syntax: src.syntax, line: src.line });
    // Each system component's import, as the product's code writes it.
    for (const [local, from] of imports) { const r = resolveImport(from, abs, { ROOT, aliases }); const n = r.file && byFile.get(r.file); if (n && !importSeen[n] && /^[A-Z]/.test(local)) importSeen[n] = `import ${local} from '${from}'`; }
    walk(tree, (n) => {
      const name = componentOf(n.tag, { imports, file: abs, ROOT, aliases, byFile, globals, components }).name;
      if (!name) return;
      // The first use of each component in the code, as written: what a card shows an agent.
      if (!firstUse[name] || (firstUse[name].attrs < n.attrs.length && firstUse[name].attrs < 3)) {

        const data = n.attrs.filter((a) => a.kind === 'prop' && a.bound).map((a) => { const t = String(a.value).replace(/^\{([\s\S]*)\}$/, '$1').trim(); return /^[A-Za-z_$][\w$]*$/.test(t) && bindings[t] ? `${t} = ${bindings[t].replace(/\s+/g, ' ').slice(0, 220)}` : null; }).filter(Boolean);
        firstUse[name] = { file: f.file, line: n.line, attrs: n.attrs.length, code: src.markup.slice(n.at, n.end).replace(/\s*\n\s*/g, ' ').slice(0, 400), data, imports: [...imports].filter(([, from]) => !resolveImport(from, abs, { ROOT, aliases }).file || !byFile.has(resolveImport(from, abs, { ROOT, aliases }).file)).filter(([, from]) => !/^vue$|^react$|^svelte/.test(from)).map(([local, from]) => ({ local, from })) };
      }
      for (const a of n.attrs.filter((x) => x.kind === 'prop' && x.bound)) {
        const v = valueOf(a.value, bindings);
        if (v === UNKNOWN || v == null || typeof v !== 'object') continue;
        const k = `${name}\u0000${a.name}`;
        (uses[k] = uses[k] ?? { file: f.file, line: n.line, values: [] }).values.push(v);
      }
    });
  }
  // How the project writes a page: its pages' script style, how many components take a two-way binding.
  const pageFiles = files.filter((f) => !byFile.has(resolve(ROOT, f.file)));
  const style = { setup: pageFiles.filter((f) => /<script\b[^>]*\bsetup\b/.test(f.text)).length, pages: pageFiles.length, twoWay: Object.values(components).filter((c) => c.events.some((e) => /^update:/.test(e))).length };
  return { ROOT, components, byFile, roots, aliases, globals, uses, firstUse, importSeen, style, files, templates, intentLayer: found.IL };
}

// Where the system's components are, without Figma: the intent layer's pages, each naming its component's code file (its
// components and its templates); else the code's own component files. → { list: [{ name, file, layer, aliases }], IL }
const nameOfEntity = (e) => (e.aliases ?? []).find((a) => /^[a-z][A-Za-z0-9]*$/.test(a)) ?? (e.aliases ?? []).find((a) => /^[A-Za-z][A-Za-z0-9]*$/.test(a))
  ?? String(e.name).split(/[^A-Za-z0-9]+/).filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
export async function componentFilesOf(ROOT, cfg = {}) {
  let IL = null;
  try { IL = (await import('./intent-layer.mjs')).readIntentLayer(ROOT, cfg); } catch { /* no intent layer */ }
  const list = [];
  for (const e of IL?.entities ?? []) {
    if (!['components', 'templates'].includes(e.layer) || !e.code) continue;
    const rel = String(e.code).replace(/^\.?\//, '');
    if (existsSync(resolve(ROOT, rel))) list.push({ name: nameOfEntity(e), file: rel, layer: e.layer, aliases: e.aliases ?? [], entity: e });
  }
  if (!list.length) {
    try { for (const k of (await import('./component-source.mjs')).codeComponents(ROOT, cfg)) list.push({ name: k.name, file: k.file, layer: 'components', aliases: [] }); } catch { /* none */ }
  }
  return { list, IL };
}

// What the documentation says, without Figma: each component's intent layer page, and the pages of the other layers as
// the rules (prototype-context.mjs contextFrom, read from the intent layer alone). → the prototype context
export async function pageContext(ROOT, cfg, page) {
  const { contextFrom } = await import('./prototype-context.mjs');
  const { componentIntent } = await import('./intent-layer.mjs');
  const IL = page.intentLayer;
  const names = Object.keys(page.components);
  const catalog = { components: Object.fromEntries(names.map((n) => [n, { description: '', props: {} }])) };
  const intent = { components: {} };
  const byName = new Map((IL?.entities ?? []).filter((e) => ['components', 'templates'].includes(e.layer)).map((e) => [nameOfEntity(e), e]));
  for (const n of names) { const e = byName.get(n); intent.components[n] = { design: { annotations: [] }, code: {}, ...(e ? { intentLayer: componentIntent(e, IL._source) } : {}) }; }
  for (const L of ['system', 'foundations', 'patterns', 'templates', 'pages', 'flows']) intent[L] = { intentLayer: (IL?.entities ?? []).filter((e) => e.layer === L).map((e) => componentIntent(e, IL._source)) };
  const aliases = Object.fromEntries(Object.values(page.components).flatMap((c) => (c.aliases ?? []).map((a) => [a, c.name])));
  // The team's guidelines files (Notion, GitLab or committed), section by section: the team's words, not Figma's.
  const sections = [];
  try {
    const { guidelineFiles } = await import('./intent-gen.mjs');
    const { sectionsOf } = await import('./prototype-context.mjs');
    for (const rel of guidelineFiles(cfg)) { let t = ''; try { t = readFileSync(resolve(ROOT, rel), 'utf8'); } catch { continue; } if (/\.json$/i.test(rel)) { for (const [k, v] of Object.entries(JSON.parse(t) ?? {})) if (typeof v === 'string' && v.trim()) sections.push({ heading: /^_?general$/i.test(k) ? null : k, body: v.trim(), file: rel }); } else for (const x of sectionsOf(t)) sections.push({ ...x, file: rel }); }
  } catch { /* no guidelines */ }
  const ctx = contextFrom(catalog, intent, sections, { aliases });
  const src = IL?._source ?? {};
  const sources = [
    ...[...new Set(sections.map((x) => x.file))].map((f) => ({ what: 'guidelines', detail: f })),
    { what: 'the code', detail: `${names.length} components, each read from its own file: its props, events and slots, and the fields of each list it takes` },
    ...(IL ? [{ what: 'the intent layer', detail: `${IL.entities.length} pages from ${String(src.url ?? src.label ?? 'the intent layer').replace(/^https?:\/\//, '')}${src.ref ? ` @ ${src.ref}` : ''}${src.sha ? ` ${String(src.sha).slice(0, 8)}` : ''} (a line marked Draft is left out)` }] : []),
    { what: 'the product', detail: `${(page.files ?? []).length} pages and screens, read for how each component is used` },
  ];
  return { ...ctx, sources, templates: page.templates ?? [], productScreens: [], screens: [] };
}

// The literal a bound value is: written in place ([{ … }]) or a name the script gives one (tabs, tabs.value, {tabs}).
function valueOf(raw, bindings) {
  const t = String(raw ?? '').trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
  if (/^[[{]/.test(t)) return readLiteral(t);
  const name = /^([A-Za-z_$][\w$]*)(?:\.value)?$/.exec(t)?.[1];
  return name && bindings[name] != null ? readLiteral(bindings[name]) : UNKNOWN;
}

const HTML = new Set('a abbr address article aside audio b bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp section select slot small source span strong sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg path g circle rect line polyline polygon use defs symbol'.split(' '));
const BUILTIN = new Set(['component', 'transition', 'transitiongroup', 'keepalive', 'teleport', 'suspense', 'routerlink', 'routerview', 'nuxtlink', 'nuxtpage', 'slot', 'fragment', 'reactfragment', 'svelteself', 'sveltecomponent', 'sveltewindow', 'sveltehead', 'sveltebody', 'svelteelement', 'sveltefragment', 'sveltedocument', 'svelteoptions']);
const LOOKALIKE = /^(button|input|table|modal|dialog|header|toast|dropdown|card|toolbar|tooltip|popover|select|checkbox|radio|switch|toggle|tab|tabs|badge|chip|tag|avatar|menu|drawer|panel|alert|banner|snackbar)$/;

// What a tag is: the system component it resolves to, an element, a built-in, or a component the system does not have.
function componentOf(tag, { imports, file, ROOT, aliases, byFile, globals, components }) {
  const t = String(tag), key = norm(t);
  if (t === '#fragment' || BUILTIN.has(key) || BUILTIN.has(norm(t.replace(/^svelte:/, 'svelte')))) return { builtin: true };
  // Imported under this name (PascalCase, or kebab-case in a template).
  const local = [...imports.keys()].find((n) => n === t || norm(n) === key);
  if (local) {
    const r = resolveImport(imports.get(local), file, { ROOT, aliases });
    if (r.file && byFile.has(r.file)) return { name: byFile.get(r.file), local };
    return { imported: imports.get(local), resolved: r, local };
  }
  if (globals.has(key)) { const g = globals.get(key); return components[g] ? { name: g } : { builtin: true }; }
  if (HTML.has(t.toLowerCase()) && !/[A-Z]/.test(t)) return { element: true };
  // A custom element: one of the system's by its tag.
  if (t.includes('-')) { const n = Object.values(components).find((c) => c.tag && c.tag.toLowerCase() === t.toLowerCase()); if (n) return { name: n.name }; }
  if (!/[A-Z]/.test(t) && !t.includes('-')) return { element: true };   // an element the list does not have (an SVG one)
  return { unknown: true };
}

// The system's components whose name says a need ("secret field" → secretField, "a grid of rates" → rateGrid): the
// words of the name that say what it is, not the ones every name shares.
const NAME_FILLER = new Set(['input', 'button', 'general', 'primary', 'secondary', 'tertiary', 'quaternary', 'group', 'field', 'item', 'container', 'base', 'main', 'default', 'list', 'card', 'page', 'header', 'template', 'new', 'old', 'v2', 'simple', 'basic', 'panel', 'bar', 'view', 'text', 'title', 'content', 'wrapper', 'layout', 'section', 'row', 'cell', 'body', 'icon', 'label', 'state']);
const nameWords = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !NAME_FILLER.has(w));
export function systemFor(need, components) {
  const words = new Set(String(need).toLowerCase().split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, '')));
  return Object.keys(components ?? {}).filter((n) => { const own = nameWords(n).map((w) => w.replace(/s$/, '')); return own.length && own.every((w) => words.has(w)); });
}

// HTML's global attributes: what any element, a component's root included, takes without a prop.
const GLOBAL_ATTR = /^(class|classname|style|id|key|ref|slot|role|title|tabindex|hidden|lang|dir|draggable|part|is|name|for|htmlfor|aria-.*|data-.*|v-.*)$/i;
const DOM_EVENT = /^(click|dblclick|input|change|focus|blur|focusin|focusout|keydown|keyup|keypress|mousedown|mouseup|mouseenter|mouseleave|mouseover|mouseout|mousemove|pointerdown|pointerup|pointerenter|pointerleave|pointermove|submit|scroll|wheel|contextmenu|touchstart|touchend|touchmove|dragstart|dragend|drop|load|error|animationend|transitionend)$/i;
const SYSTEM_PROP_OF = (c, name) => Object.keys(c.props ?? {}).find((p) => p === name || norm(p) === norm(name));

// ── The check ───────────────────────────────────────────────────────────────────
// context: the prototype context (prototype-context.mjs loadContext): its containment rules, limits, "never" sentences
// and template pages. → { findings: [{ level, line, message, kind }], gaps: [{ need, searched, why, line }], used }
export function checkPage(file, text, system, { context = null } = {}) {
  const findings = [], gaps = [], used = {};
  let cur = {};   // the component being read, and the prop a finding is about
  const add = (level, line, message, kind, extra = {}) => findings.push({ level, line, message, kind, ...cur, ...extra });
  const src = splitSource(file, text);
  if (!src.syntax) return { findings: [{ level: 'error', line: 1, message: `${file}: not a page the check reads (Vue, Svelte, JSX/TSX or HTML)`, kind: 'file' }], gaps, used };
  const abs = resolve(system.ROOT, file);
  const imports = importsOf(src.script), bindings = literalBindings(src.script);
  const tree = parseMarkup(src.markup, { syntax: src.syntax, line: src.line });
  const names = Object.keys(system.components);
  const tagOf = (n) => system.components[n]?.tag ?? n;
  const nodes = [];
  const idOf = new Map();
  let seq = 0;

  walk(tree, (n, parents) => {
    const what = componentOf(n.tag, { imports, file: abs, ROOT: system.ROOT, aliases: system.aliases, byFile: system.byFile, globals: system.globals, components: system.components });
    cur = what.name ? { component: what.name } : {};
    n.system = what.name ?? null;   // for the page's quality review (page-quality.mjs), the same for every framework
    const id = `n${++seq}`;
    idOf.set(n, id);
    const parentId = parents.length ? idOf.get(parents[parents.length - 1]) : null;
    nodes.push({ id, component: what.name ?? '#element', children: [], parent: parentId });
    if (parentId) nodes.find((x) => x.id === parentId).children.push(id);

    const missing = n.attrs.find((a) => /^data-missing$/i.test(a.raw ?? a.name));
    if (missing) {
      const at = (k) => n.attrs.find((a) => new RegExp(`^data-${k}$`, 'i').test(a.raw ?? ''))?.value ?? null;
      gaps.push({ need: String(missing.value ?? ''), searched: at('searched'), why: at('why'), line: n.line });
      if (!missing.value) add('error', n.line, 'data-missing names no need: write the need it stands for', 'gap');
      // A need the system has a component for is not a gap: one whose name says the need, unless the page says it looked
      // at it (data-searched) and why it does not fit (data-why).
      const has = systemFor(String(missing.value ?? ''), system.components).filter((x) => !norm(at('searched') ?? '').includes(norm(x)));
      if (has.length && !at('why')) add('error', n.line, `"${missing.value}" is not missing: the system has ${has.slice(0, 3).join(', ')} (its card: --prototype --catalog --detail ${has[0]}). Use it, or name it in data-searched and say in data-why why it does not fit`, 'gap', { component: has[0] });
      else if (has.length) add('warning', n.line, `"${missing.value}": the system has ${has.slice(0, 3).join(', ')}; the page says why none fits, so it stays a gap for the design team to decide`, 'gap');
      return;
    }

    if (what.unknown) { const guess = nearName(n.tag, names.map(tagOf)); add('error', n.line, `<${n.tag}> is not a component of the system${guess ? ` (did you mean ${guess}?)` : ''}: import the system's component, or write the need as a data-missing box`, 'component'); return; }
    if (what.imported) {
      if (what.resolved.file === null && [...system.roots].some((r) => what.resolved.wanted.startsWith(r + '/'))) { add('error', n.line, `<${n.tag}> is imported from ${what.imported}, which is not a file of the system${nearName(what.imported.split('/').pop(), names.map(tagOf)) ? ` (did you mean ${nearName(what.imported.split('/').pop(), names.map(tagOf))}?)` : ''}`, 'component'); return; }
      const inSystem = what.resolved.file && [...system.roots].some((r) => what.resolved.file.startsWith(r + '/'));
      if (inSystem) return;   // a part of a system component (its cell, its row): the system's own
      const like = names.find((x) => norm(x) === norm(n.tag)) ?? (LOOKALIKE.test(norm(n.tag)) ? n.tag : null);
      add('error', n.line, `<${n.tag}> is a component of its own (from ${what.imported}), not the system's${like ? `; it is named like the system's ${like}: use it` : ''}. A page is made of the system's components; a need nothing fits is a data-missing box`, 'component');
      return;
    }
    if (!what.name) return;
    const c = system.components[what.name];
    used[what.name] = (used[what.name] ?? 0) + 1;
    const given = new Set();
    for (const a of n.attrs) {
      if (a.kind === 'directive' || a.kind === 'slotTarget') continue;
      if (a.kind === 'slot') {
        const ok = a.name === 'default' ? c.slots.default || !c.slots.named.length : c.slots.named.includes(a.name);
        if (!ok && (c.slots.named.length || c.slots.default)) add('error', a.line, `${n.tag} has no slot "${a.name}"${c.slots.named.length ? ` (its slots: ${[...(c.slots.default ? ['default'] : []), ...c.slots.named].join(', ')})` : ''}`, 'slot');
        continue;
      }
      if (a.kind === 'event') {
        if (c.events.some((e) => norm(e) === norm(a.name) || norm(e) === norm(`on${a.name}`))) continue;
        if (DOM_EVENT.test(a.name)) continue;
        const guess = nearName(a.name, c.events);
        add('error', a.line, `${n.tag} emits no "${a.name}"${guess ? ` (did you mean ${guess}?)` : c.events.length ? ` (it emits: ${c.events.join(', ')})` : ' (it emits nothing)'}`, 'event');
        continue;
      }
      if (a.kind === 'model') {
        const p = SYSTEM_PROP_OF(c, a.name);
        const back = c.events.some((e) => norm(e) === norm(`update:${a.name}`) || (src.syntax === 'svelte'));
        if (!p || !back) add('error', a.line, `${n.tag} takes no two-way "${a.name}"${p ? `: it emits no update:${a.name}; give :${a.name} and listen to its event` : ''}`, 'model');
        else given.add(p);
        continue;
      }
      // A prop.
      const nameIs = a.name;
      if (src.syntax === 'jsx' && /^on[A-Z]/.test(nameIs)) {
        if (SYSTEM_PROP_OF(c, nameIs) || c.events.some((e) => norm(e) === norm(nameIs) || norm(`on${e}`) === norm(nameIs)) || DOM_EVENT.test(nameIs.slice(2))) continue;
        add('error', a.line, `${n.tag} has no "${nameIs}"${nearName(nameIs, [...Object.keys(c.props), ...c.events]) ? ` (did you mean ${nearName(nameIs, [...Object.keys(c.props), ...c.events])}?)` : ''}`, 'event');
        continue;
      }
      const p = SYSTEM_PROP_OF(c, nameIs);
      if (!p) {
        if (GLOBAL_ATTR.test(a.raw ?? nameIs) || GLOBAL_ATTR.test(nameIs)) continue;
        const guess = nearName(nameIs, Object.keys(c.props));
        add('error', a.line, `${n.tag} has no prop "${nameIs}"${guess ? ` (did you mean ${guess}?)` : ''}`, 'prop');
        continue;
      }
      given.add(p);
      const def = c.props[p] ?? {};
      const type = String(def.type ?? '').toLowerCase();
      // A value as written: static, or a bound literal ('primary', 2, true).
      const lit = !a.bound ? (a.value === true ? true : a.value) : (() => { const v = readLiteral(String(a.value).replace(/^\{([\s\S]*)\}$/, '$1')); return v === UNKNOWN ? UNKNOWN : v; })();
      if (Array.isArray(def.options) && def.options.length && (typeof lit === 'string' || typeof lit === 'number') && !def.options.map(String).includes(String(lit))) add('error', a.line, `${n.tag} ${p}="${lit}" is not one of ${def.options.join(', ')}`, 'value');
      if (/^bool/.test(type) && !a.bound && typeof a.value === 'string' && /^(false|0|no|off)$/i.test(a.value) && src.syntax !== 'html') add('error', a.line, `${n.tag} ${p}="${a.value}" is the text "${a.value}", which turns it on: write ${src.syntax === 'vue' ? `:${p}="false"` : `${p}={false}`}`, 'value');
      // The data a list or object prop is given, against what it takes.
      if (a.bound && (c.fields[p] || system.uses[`${what.name}\u0000${p}`])) {
        const v = valueOf(a.value, bindings);
        if (v !== UNKNOWN && v != null && typeof v === 'object') {
          const real = system.uses[`${what.name}\u0000${p}`];
          const known = c.fields[p] ? Object.keys(c.fields[p]) : null;
          const required = requiredKeys(real?.values ?? []).filter((k) => !known || known.includes(k));
          for (const f of shapeFindings(v, c.fields[p] ?? null, { required })) {
            if (f.kind === 'unknown' && codeReads(system, c).has(f.key)) continue;   // its code reads it: the comment left it out
            if (f.kind === 'unknown') { const guess = nearName(f.key, f.known); add('error', a.line, `${n.tag} ${p}: "${f.path}${f.key}" is not a field it takes${guess ? ` (did you mean ${guess}?)` : ` (its fields: ${f.known.join(', ')})`}`, 'shape', { prop: p }); }
            else add('error', a.line, `${n.tag} ${p}: item ${f.item + 1} has no "${f.key}", which every use in the code gives (${real.file}:${real.line})`, 'shape', { prop: p });
          }
        }
      }
    }
    for (const [p, def] of Object.entries(c.props)) if (def.required && !given.has(p) && !n.attrs.some((a) => a.kind === 'model' && norm(a.name) === norm(p))) add('error', n.line, `${n.tag} needs "${p}" (required)`, 'prop');
    // Children for a component with nowhere to show them.
    const kids = n.children.filter((k) => k.tag !== 'template' || !k.attrs.some((a) => a.kind === 'slot'));
    if (kids.length && !c.slots.default && !c.slots.named.length && src.syntax !== 'jsx' && !(c.props.children)) add('error', n.line, `${n.tag} has no slot: what is written inside it is not shown`, 'slot');
    for (const k of n.children.filter((x) => x.tag === 'template')) for (const s of k.attrs.filter((a) => a.kind === 'slot')) if (!(s.name === 'default' ? c.slots.default : c.slots.named.includes(s.name)) && (c.slots.named.length || c.slots.default)) add('error', s.line, `${n.tag} has no slot "${s.name}"${c.slots.named.length ? ` (its slots: ${[...(c.slots.default ? ['default'] : []), ...c.slots.named].join(', ')})` : ''}`, 'slot');
    // A label a documented "never" rules out.
    const label = n.attrs.find((a) => a.kind === 'prop' && !a.bound && /^(label|text|title|labelContent)$/i.test(a.name))?.value;
    if (context && typeof label === 'string') for (const r of ruledOut(context.components?.[what.name], label, what.name)) add('warning', n.line, `${n.tag} "${label}": its documentation says "${r.sentence}"; check this use`, 'rule');
  });

  // Where the documentation says a component goes, and how many a page may hold.
  cur = {};
  for (const f of insideFindings(context?.inside ?? [], nodes, ['#element'])) {
    const n = [...idOf].find(([, v]) => v === f.id)?.[0];
    add('error', n?.line ?? 1, f.message, 'rule', { component: nodes.find((x) => x.id === f.id)?.component });
  }
  for (const l of context?.limits ?? []) if ((used[l.component] ?? 0) > l.max) add('error', 1, `${used[l.component]} ${l.component} on this ${l.per}, and the guidelines allow ${l.max}: "${l.sentence}" (${l.from})`, 'rule');
  // The template first, where the documentation has templates: a page made of none starts from no template.
  const templates = context?.templates?.length ? context.templates.filter((t) => names.includes(t)) : templatesOf(context, names);
  if (templates.length && Object.keys(used).length && !templates.some((t) => used[t])) add('error', tree.children[0]?.line ?? 1, `the page starts from no template: the documentation chooses a template first (${templates.join(', ')})`, 'rule');
  return { findings: findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1) || a.line - b.line), gaps, used, syntax: src.syntax, tree, markup: src.markup, script: src.script };
}

// The keys a component's own code reads (row.hint, { cellId }, 'tooltipText'), in its file and the files of its
// folder: a field its doc comment leaves out is still one it takes.
function codeReads(system, c) {
  if (c._reads) return c._reads;
  const out = new Set();
  const dir = dirname(resolve(system.ROOT, c.file));
  const files = [];
  const scan = (d, depth = 0) => { if (depth > 3 || files.length > 300) return; let list = []; try { list = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of list) { const q = join(d, e.name); if (e.isDirectory()) scan(q, depth + 1); else if (/\.(vue|svelte|[jt]sx?|mjs)$/.test(e.name)) files.push(q); } };
  scan(dir);
  for (const f of files) {
    let t = ''; try { t = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of t.matchAll(/(?:\??\.|\[['"])([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
    for (const m of t.matchAll(/\{\s*([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\s*\}\s*=/g)) for (const k of m[1].split(',')) out.add(k.trim());
  }
  c._reads = out;
  return out;
}

// The system's templates: the components the intent layer's template pages are about.
export function templatesOf(context, names) {
  const pages = [...new Set((context?.rules ?? []).filter((r) => /\(templates?,\s*intent layer\)/i.test(r.title)).map((r) => r.title.split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+template$/i, '').trim()))];
  return pages.map((p) => names.find((n) => norm(n) === norm(p)) ?? names.find((n) => norm(n) === norm(`${p}template`))).filter(Boolean);
}

// ── What an agent reads before writing a page ───────────────────────────────────
// How the framework writes an event listener and a two-way binding.
const ON = { vue: (e) => `@${e}`, svelte: (e) => `on:${e}`, jsx: (e) => `on${e[0].toUpperCase()}${e.slice(1)}`, html: (e) => `@${e}` };
// A prop's kind as the code says it: its declared type, else the kind of its default (text, number, true/false).
const typeWord = (d) => String(d?.type ?? (typeof d?.default === 'string' ? 'text' : typeof d?.default === 'number' ? 'number' : typeof d?.default === 'boolean' ? 'boolean' : 'any')).replace(/\s*\|\s*/g, '|');
const fieldWords = (fields, depth = 0) => Object.entries(fields ?? {}).map(([k, v]) => (v.fields && depth < 1 ? `${k}{${fieldWords(v.fields, depth + 1)}}` : k)).join(', ');

// One card per component: how to import it, write it, what it takes (each list's fields), emits and holds, and its first
// use in the code. names: the components to show. → lines
export function usageCards(page, names, { importLine = null } = {}) {
  const out = [];
  for (const name of names) {
    const c = page.components[name];
    if (!c) continue;
    const on = ON[c.syntax] ?? ON.vue;
    const imp = importLine ? importLine(c) : null;
    out.push(`  ${name}${imp ? `  ${imp}` : ''}`);
    const props = Object.entries(c.props).map(([p, d]) => {
      const f = c.fields[p];
      const kind = f ? `${typeWord(d).includes('array') ? 'list' : 'object'} of {${fieldWords(f)}}` : Array.isArray(d.options) && d.options.length ? d.options.join('|') : typeWord(d);
      return `${p}${d.required ? '*' : ''} ${kind}${d.default != null && d.default !== '' && typeof d.default !== 'object' ? ` = ${d.default}` : ''}`;
    });
    if (props.length) out.push(`      props: ${props.join(' · ')}${Object.values(c.props).some((d) => d.required) ? '   (* required)' : ''}`);
    if (c.events.length) out.push(`      events: ${c.events.map((e) => `${on(e)}${c.eventPayloads[e] ? `(${c.eventPayloads[e]})` : ''}`).join(' · ')}`);
    const slots = [...(c.slots.default ? ['default'] : []), ...c.slots.named];
    out.push(`      slots: ${slots.length ? slots.map((x) => `${x}${c.slots.props?.[x] ? ` (gives ${[c.slots.props[x]].flat().join(', ')})` : ''}`).join(' · ') : 'none: nothing goes inside it'}`);
    if (!c.events.some((e) => /^update:/.test(e))) out.push('      no two-way binding: give the value, listen to its event, set the value yourself');
    const u = page.firstUse?.[name];
    if (u) { out.push(`      in the code (${u.file}:${u.line}): ${u.code}`); for (const d of u.data.slice(0, 2)) out.push(`        ${d}`); }
  }
  return out;
}

// How the project writes a page, read from its code. → lines
export function pageConventions(page, { cmd = 'rms-design-system-engine', names = null } = {}) {
  const syntax = Object.values(page.components).map((c) => c.syntax).filter(Boolean).sort((a, b) => Object.values(page.components).filter((c) => c.syntax === b).length - Object.values(page.components).filter((c) => c.syntax === a).length)[0] ?? 'vue';
  const ext = { vue: '.vue', svelte: '.svelte', jsx: '.jsx', html: '.html' }[syntax];
  const alias = page.aliases?.find((a) => existsSync(a.to) && Object.values(page.components).some((c) => resolve(page.ROOT, c.file).startsWith(a.to + '/')));
  const helpers = new Map();
  for (const u of Object.entries(page.firstUse ?? {}).filter(([n]) => !names || names.includes(n)).map(([, u]) => u)) for (const i of u.imports ?? []) if (/[/@~.]/.test(i.from) && !/\.(css|scss|svg|png)$/.test(i.from) && !/^[A-Z]/.test(i.local)) helpers.set(i.from, [...new Set([...(helpers.get(i.from) ?? []), i.local])]);
  return [
    `  a page is ${ext === '.jsx' ? 'a .jsx or .tsx' : `a ${ext}`} file in prototypes/, written as the product's own pages are${syntax === 'vue' && page.style?.setup > page.style.pages / 2 ? ', with <script setup>' : ''}`,
    ...(alias ? [`  imports go through ${alias.from}/ (${relative(page.ROOT, alias.to)}/), as each card writes them${syntax === 'vue' ? ', without the .vue' : ''}`] : []),
    ...(!page.style?.twoWay ? ['  no component takes a two-way binding (v-model / bind:): data goes in by its props and comes back by its events'] : []),
    ...[...helpers].slice(0, 6).map(([from, names]) => `  ${from} already has ${names.join(', ')}: use them, never a copy`),
    `  a need the system has nothing for is <div data-missing="<the need>" data-searched="<what you looked at>" data-why="<why none fits>" />, listed for the design team; never a component, a colour or a size of its own`,
    `  then ${cmd} --prototype prototypes/<Name>${ext}, and fix each ❌ until it says the page is ready`,
  ];
}

// The page system and the rules the check holds a page to, kept for the edit hook (which must answer at once).
export function pageCache(page, context) {
  return {
    at: new Date().toISOString(), ROOT: page.ROOT,
    components: Object.fromEntries(Object.entries(page.components).map(([n, c]) => [n, { ...c, _reads: undefined, commentWords: undefined }])), templates: page.templates ?? [],
    byFile: [...page.byFile], roots: [...page.roots], aliases: page.aliases, globals: [...page.globals], uses: page.uses, firstUse: page.firstUse, importSeen: page.importSeen, style: page.style,
    context: { inside: context?.inside ?? [], limits: context?.limits ?? [], templates: context?.templates ?? [], rules: (context?.rules ?? []).filter((r) => /\(templates?,\s*intent layer\)/i.test(r.title)).map((r) => ({ title: r.title })), components: Object.fromEntries(Object.entries(context?.components ?? {}).map(([n, k]) => [n, { never: k.never ?? [], ...(k.intentLayer ? { intentLayer: { examples: k.intentLayer.examples ?? [] } } : {}) }])) },
  };
}
export function fromCache(j) {
  return { page: { ...j, byFile: new Map(j.byFile), roots: new Set(j.roots), globals: new Map(j.globals) }, context: j.context };
}

// The system components a piece of code imports (an intent layer example: import TabStrip from '@/…/tabs/TabStrip'), by
// where each import leads. → [names]
export function importedComponents(page, text) {
  const out = [];
  for (const [, from] of importsOf(String(text ?? '').replace(/```\w*/g, '\n'))) {
    const r = resolveImport(from, join(page.ROOT, 'src', 'x.js'), { ROOT: page.ROOT, aliases: page.aliases });
    const n = r.file && page.byFile.get(r.file);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// The edit hook: a page written in prototypes/ is held to the system the moment it is written, from the system the last
// --prototype run kept (OUT_DIR/prototypes/page-system.json), so the hook answers at once. → the reason text, or null.
export function pageHookCheck(event, { root, cfg = {}, outDir = '.design-system-engine-out' } = {}) {
  if (cfg.hooks === false || cfg.editCheck === false) return null;
  const file = event?.tool_input?.file_path;
  if (!file || !syntaxOf(file) || /\.json$/i.test(file)) return null;
  const abs = resolve(root, file), dir = resolve(root, cfg.prototype?.dir ?? 'prototypes');
  if (!abs.startsWith(dir + '/')) return null;
  let cache = null;
  try { cache = JSON.parse(readFileSync(join(root, outDir, 'prototypes', 'page-system.json'), 'utf8')); } catch { return null; }
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { return null; }
  const { page, context } = fromCache(cache);
  const r = checkPage(relative(root, abs), text, page, { context });
  recordInventions(root, outDir, relative(root, abs), r, { page, context, by: 'edit' });
  const errors = r.findings.filter((f) => f.level === 'error');
  if (!errors.length) return null;
  return [`rms-design-system-engine checked this page against the design system: ${errors.length} thing${errors.length === 1 ? '' : 's'} the system does not have, or a rule it breaks.`,
    ...errors.map((f) => `  ${relative(root, abs)}:${f.line}  ${f.message}`),
    'Fix them in this file now, from the cards of rms-design-system-engine --prototype --catalog (--detail <name> for one).'].join('\n');
}

// ── Why an agent got it wrong ───────────────────────────────────────────────────
// Each mistake, held against the documentation it had: a gap (its page is missing, shows no example, or the code's
// comment says nothing of what a list takes), or written and not followed. → { gap, need, why }
export function whyOf(f, page, context) {
  const name = f.component;
  if (!name) return { gap: false, need: null, why: f.kind === 'component' ? 'it wrote a component the system does not have' : 'the page' };
  const il = context?.components?.[name]?.intentLayer;
  const c = page.components?.[name];
  if (f.kind === 'rule') return { gap: false, need: null, why: 'the rule is written; the agent did not follow it' };
  if (!il) return { gap: true, need: 'page', why: 'it has no page in the intent layer' };
  if (f.kind === 'shape' && c && f.prop && !c.fields?.[f.prop]) return { gap: true, need: 'fields', why: `the code's comment does not say what ${f.prop} takes` };
  if (!(il.examples ?? []).length) return { gap: true, need: 'example', why: 'its page shows no example of it in use' };
  return { gap: false, need: null, why: 'its page has an example; the agent wrote it otherwise' };
}

// Every check's mistakes, kept: how much agents invent, where, and why. OUT_DIR/prototypes/inventions.json holds each
// run (the page, when, by the command or the edit hook, each mistake with its why) and, per component, the count, the
// kinds and what its documentation lacked. → the record
export function recordInventions(root, outDir, file, result, { page, context, by = 'command', now = new Date().toISOString() } = {}) {
  const path = join(root, outDir, 'prototypes', 'inventions.json');
  let rec = { runs: [] };
  try { rec = JSON.parse(readFileSync(path, 'utf8')); } catch { /* the first */ }
  const items = result.findings.filter((f) => f.level === 'error').map((f) => ({ kind: f.kind, component: f.component ?? null, prop: f.prop ?? null, message: f.message, ...whyOf(f, page, context) }));
  rec.runs = [...(rec.runs ?? []), { at: now, page: file, by, errors: items.length, gaps: result.gaps.length, items }].slice(-300);
  const byComponent = {};
  for (const r of rec.runs) for (const it of r.items) {
    if (!it.component) continue;
    const b = byComponent[it.component] ?? (byComponent[it.component] = { count: 0, kinds: {}, needs: {}, followed: 0, last: [] });
    b.count++; b.kinds[it.kind] = (b.kinds[it.kind] ?? 0) + 1;
    if (it.gap) b.needs[it.need] = { why: it.why, n: (b.needs[it.need]?.n ?? 0) + 1 }; else b.followed++;
    b.last = [{ message: it.message, page: r.page, at: r.at }, ...b.last].slice(0, 5);
  }
  rec.byComponent = byComponent;
  rec.$description = 'What agents got wrong in prototypes, each mistake with why (a gap in the documentation, or written and not followed). Generated by rms-design-system-engine --prototype and the edit hook.';
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(rec, null, 2) + '\n'); } catch { /* the report still says it */ }
  return { rec, items };
}
