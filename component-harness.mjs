// component-harness.mjs - the design system's own React components, rendered from their code in a real browser,
// without the project's dev server: each component in each of its Figma variants on one page, so the accessibility
// check can try what a person would (a click, a key, a name read out) on the code that ships.
//
// The project's files are served as they are: its CSS linked, its component files turned into browser modules
// (TypeScript turns the JSX into calls to a small stand-in for React that keeps each component's state between
// renders). A component that needs more than that (a context it reads, a library it imports) is listed as not
// rendered, never guessed. TypeScript comes from the project, else the global npm folder; without it nothing is served.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { projectTypeScriptOnly, withinProject, usableTypeScript, TYPESCRIPT_HINT } from './project-typescript.mjs';
import { textComponentApi } from './component-source.mjs';

// ── The React stand-in: enough for a presentational component, nothing more ──────────────────────────────────
export const REACT_SHIM = `
const BOOL = new Set(['disabled','checked','readonly','required','hidden','selected','multiple','autofocus']);
// An icon drawn in SVG needs its own namespace, or it has no size.
const SVG = new Set(['svg','path','rect','circle','ellipse','line','polyline','polygon','g','use','defs','symbol','mask','clipPath','linearGradient','radialGradient','stop','pattern','foreignObject','tspan']);
const SVGNS = 'http://www.w3.org/2000/svg';
export function createElement(type, props, ...children) {
  props = props || {};
  const kids = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true);
  if (typeof type === 'function') return mount(type, { ...props, children: kids.length <= 1 ? kids[0] : kids });
  if (type === Fragment) { const f = document.createDocumentFragment(); kids.forEach((c) => f.append(c instanceof Node ? c : String(c))); return f; }
  const el = SVG.has(type) ? document.createElementNS(SVGNS, type) : document.createElement(type);
  el.__on = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || v == null || v === false && !k.startsWith('aria-')) continue;
    if (k === 'className' || k === 'class') el.setAttribute('class', String(v));
    else if (el.namespaceURI === SVGNS && !/^on[A-Z]/.test(k)) el.setAttribute(k === 'xlinkHref' ? 'href' : /^(viewBox|preserveAspectRatio|gradientUnits|patternUnits)$/.test(k) ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(v));
    else if (k === 'htmlFor') el.setAttribute('for', String(v));
    else if (k === 'style' && typeof v === 'object') for (const [s, x] of Object.entries(v)) el.style.setProperty(s.startsWith('--') ? s : s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), typeof x === 'number' && !/opacity|weight|index|flex|line/i.test(s) ? x + 'px' : String(x));
    else if (/^on[A-Z]/.test(k)) { const t = k.slice(2).toLowerCase() === 'doubleclick' ? 'dblclick' : k.slice(2).toLowerCase(); el.__on[t] = v; }
    else if (k === 'value' || k === 'defaultValue') el.setAttribute('value', String(v));
    else if (k === 'tabIndex') el.setAttribute('tabindex', String(v));
    else if (BOOL.has(k.toLowerCase())) { if (v) el.setAttribute(k.toLowerCase(), ''); }
    else el.setAttribute(k, v === true ? (k.startsWith('aria-') ? 'true' : '') : String(v));
  }
  // One listener per event type that calls the element's current handler: an update in place swaps the handler.
  for (const t of Object.keys(el.__on)) listen(el, t);
  kids.forEach((c) => el.append(c instanceof Node ? c : String(c)));
  return el;
}
function listen(el, t) { el.__heard = el.__heard || new Set(); if (el.__heard.has(t)) return; el.__heard.add(t); el.addEventListener(t, (e) => { const f = el.__on && el.__on[t]; if (f) f(e); }); }
export const Fragment = Symbol('Fragment');

// Each component keeps its hooks between renders, as React does: a child keeps its place (and its state) when its
// parent renders again. A state change renders the whole tree again and updates the page in place, so an element
// keeps its identity, its focus and anything the page set on it.
let CURRENT = null, IDS = 0;
function mount(type, props) {
  const parent = CURRENT;
  let inst;
  if (parent) { const slot = parent.k++; inst = parent.kids[slot]; if (!inst || inst.type !== type) inst = parent.kids[slot] = { type, hooks: [], kids: [], root: parent.root }; }
  else { inst = { type, hooks: [], kids: [], nodes: [] }; inst.root = inst; }
  inst.props = props;
  const node = build(inst);
  if (!parent) inst.nodes = node.nodeType === 11 ? [...node.childNodes] : [node];
  return node;
}
function build(inst) {
  const prev = CURRENT; CURRENT = inst; inst.i = 0; inst.k = 0;
  let out; try { out = inst.type(inst.props); } finally { CURRENT = prev; }
  return out instanceof Node ? out : document.createTextNode(String(out ?? ''));
}
function update(root) {
  const fresh = build(root);
  const next = fresh.nodeType === 11 ? [...fresh.childNodes] : [fresh];
  const live = root.nodes.filter((n) => n.isConnected);
  if (!live.length) return;
  const parent = live[0].parentNode, after = live[live.length - 1].nextSibling;
  const out = [];
  next.forEach((n, i) => { if (live[i]) out.push(morph(live[i], n)); else { parent.insertBefore(n, after); out.push(n); } });
  live.slice(next.length).forEach((n) => n.remove());
  root.nodes = out;
}
// The live node made to match the fresh one, kept when it is the same kind of element. Returns the node that stays.
function morph(live, fresh) {
  if (live.nodeType !== fresh.nodeType || (live.nodeType === 1 && (live.tagName !== fresh.tagName || live.namespaceURI !== fresh.namespaceURI))) { live.replaceWith(fresh); return fresh; }
  if (live.nodeType !== 1) { if (live.nodeValue !== fresh.nodeValue) live.nodeValue = fresh.nodeValue; return live; }
  for (const a of [...live.attributes]) if (!fresh.hasAttribute(a.name) && !a.name.startsWith('data-dse')) live.removeAttribute(a.name);
  for (const a of [...fresh.attributes]) if (live.getAttribute(a.name) !== a.value) { live.setAttribute(a.name, a.value); if (a.name === 'value' && 'value' in live) live.value = a.value; }
  if ('checked' in live) live.checked = fresh.hasAttribute('checked');
  live.__on = fresh.__on || {};
  for (const t of Object.keys(live.__on)) listen(live, t);
  const lk = [...live.childNodes], fk = [...fresh.childNodes];
  fk.forEach((n, i) => { if (lk[i]) morph(lk[i], n); else live.appendChild(n); });
  lk.slice(fk.length).forEach((n) => n.remove());
  return live;
}
export const useState = (v) => {
  const inst = CURRENT;
  if (!inst) return [typeof v === 'function' ? v() : v, () => {}];
  const i = inst.i++;
  if (!(i in inst.hooks)) inst.hooks[i] = typeof v === 'function' ? v() : v;
  return [inst.hooks[i], (x) => { const nx = typeof x === 'function' ? x(inst.hooks[i]) : x; if (Object.is(nx, inst.hooks[i])) return; inst.hooks[i] = nx; update(inst.root); }];
};
const keep = (make) => { const inst = CURRENT; if (!inst) return make(); const i = inst.i++; if (!(i in inst.hooks)) inst.hooks[i] = make(); return inst.hooks[i]; };
export const useReducer = (r, init) => { const [s, set] = useState(init); return [s, (a) => set((x) => r(x, a))]; };
export const useEffect = () => {}; export const useLayoutEffect = () => {}; export const useRef = (v) => keep(() => ({ current: v ?? null }));
export const useMemo = (f) => f(); export const useCallback = (f) => f; export const useId = () => keep(() => ':r' + (IDS++).toString(36) + ':');
export const forwardRef = (f) => (p) => f(p, null); export const memo = (f) => f;
export const createContext = (v) => ({ Provider: ({ children }) => children, _v: v }); export const useContext = (c) => c?._v;
export default { createElement, Fragment, useState, useReducer, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId, forwardRef, memo, createContext, useContext };
`;

// TypeScript: the project's own, else the global npm folder's. null when neither is there, and one that cannot read
// JSX (version 7) counts as not there, so a project that has it keeps its components read through the global one.
// Only the project's own when DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project (project-typescript.mjs).
const tsCache = new Map();
export function loadTypeScript(ROOT) {
  const key = `${ROOT}|${projectTypeScriptOnly()}`;
  if (tsCache.has(key)) return tsCache.get(key);
  let ts = null;
  const own = () => { const req = createRequire(join(ROOT, 'package.json')); const at = req.resolve('typescript'); if (projectTypeScriptOnly() && !withinProject(ROOT, at)) throw new Error('not the project\'s'); return req(at); };
  const global = () => createRequire(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'noop.js'))('typescript');
  for (const load of projectTypeScriptOnly() ? [own] : [own, global]) {
    try { const got = load(); if (usableTypeScript(got)) { ts = got; break; } } catch { /* not there */ }
  }
  tsCache.set(key, ts);
  return ts;
}

export const CODE_EXT = ['.jsx', '.tsx', '.js', '.ts', '.mjs'];
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.design-system-engine-out|\.claude|contracts|figma-mcp|dist|build)$/.test(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

// One project file as a browser module; its local imports become other modules of the same page.
export function transpile(src, file, ts) {
  const code = src
    .replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.(css|scss))['"];?/gm, (_, n) => `const ${n} = new Proxy({}, { get: (_t, k) => String(k) });`)
    .replace(/^\s*import\s+['"][^'"]+\.(css|scss)['"];?/gm, '')
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+\.(css|scss|svg|png)['"];?/gm, '');
  const out = ts.transpileModule(code, { fileName: file, compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: '__h', jsxFragmentFactory: '__F', target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  return `import { createElement as __h, Fragment as __F } from '/__react.js';\n${out.replace(/from\s+['"](react|react\/jsx-runtime)['"]/g, "from '/__react.js'")}`;
}

// Serve a project: its CSS as is, its code turned into modules, the stand-in for React, and the pages given
// ({ '/__page.html': html | () => html }). Resolves { server, port, close }.
export function serveProject(dir, pages = {}, ts = loadTypeScript(dir)) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/__react.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(REACT_SHIM); }
    if (pages[url] != null) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(typeof pages[url] === 'function' ? pages[url]() : pages[url]); }
    let p = join(dir, url);
    if (!existsSync(p)) { const hit = CODE_EXT.map((e) => p + e).concat(CODE_EXT.map((e) => join(p, 'index' + e))).find(existsSync); if (hit) p = hit; }
    if (!existsSync(p) || !p.startsWith(dir)) { res.writeHead(404); return res.end(); }
    if (CODE_EXT.includes(extname(p))) {
      let js;
      try { js = transpile(readFileSync(p, 'utf8'), p, ts); } catch (e) { res.writeHead(500); return res.end(String(e)); }
      js = js.replace(/(from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g, (m, a, spec) => `${a}'/${relative(dir, resolve(dirname(p), spec))}'`);
      res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js);
    }
    res.writeHead(200, { 'content-type': /\.css$/.test(p) ? 'text/css' : 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, close: () => server.close() })));
}

// The project's stylesheets, as <link>s for a served page.
export const cssLinks = (dir) => walk(dir).filter((p) => /\.css$/.test(p)).map((p) => `<link rel="stylesheet" href="/${relative(dir, p)}">`).join('\n');

// ── What to render: each component in its Figma variants ──────────────────────────────────────────────────────
// A prop as Figma names it and as code writes it (State and state; True as true). Interaction states (Hover, Pressed,
// Focus) are what the browser does, not props, so they are not rendered as variants.
const INTERACTION = /^(hover(ed)?|press(ed)?|active|focus(ed)?|focus-visible|idle|rest|default)$/i;
const clean = (k) => String(k).replace(/#[\d:]+$/, '').trim();
export function propsOf(figma) {
  const out = {};
  for (const [k0, v] of Object.entries(figma)) {
    const k = clean(k0);
    const val = v === 'True' ? true : v === 'False' ? false : v;
    out[k] = val; out[k.charAt(0).toLowerCase() + k.slice(1).replace(/\s+(\w)/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}
// entry: the component-props snapshot's entry. → [{ label, props }], the default first, then each other value of each
// variant prop and each on/off prop flipped, at most `max` (ds-config.json → a11y.maxVariants, 16 by default).
// A state a variant can be in (Disabled, Selected, Loading) starts off in the default case, wherever Figma's default
// variant sits: the component is shown as it is first met, its states as cases of their own.
export const STATE_PROP = /^(is)?(disabled|selected|checked|pressed|error|invalid|loading|readonly|read-?only|active|open|expanded|skeleton)$/i;
// example: the one the design team placed in Figma (figma-examples.mjs): its words and icons (its text properties and
// its instance swaps, by the name of what they show) open every case in place of Figma's placeholders.
export function harnessCases(entry = {}, max = 16, example = null) {
  const defs = Object.entries(entry.properties ?? {});
  const base = {};
  for (const [k, d] of defs) if (d.type !== 'INSTANCE_SWAP') base[k] = d.defaultValue;
  const said = example?.props ?? {};
  for (const [k, d] of defs) {
    const v = said[clean(k)];
    if ((d.type === 'TEXT' || d.type === 'INSTANCE_SWAP') && typeof v === 'string' && v.trim()) base[k] = v;
  }
  for (const [k, d] of defs) {
    const off = (d.variantOptions ?? []).find((o) => /^(false|off|no)$/i.test(String(o)));
    if (d.type === 'VARIANT' && off !== undefined && STATE_PROP.test(clean(k).replace(/\s+/g, ''))) base[k] = off;
  }
  const cases = [{ label: 'default', props: propsOf(base) }];
  for (const [k, d] of defs) {
    if (d.type === 'VARIANT') for (const o of d.variantOptions ?? []) { if (String(o) !== String(base[k]) && !INTERACTION.test(o)) cases.push({ label: `${clean(k)}=${o}`, props: propsOf({ ...base, [k]: o }) }); }
    else if (d.type === 'BOOLEAN') cases.push({ label: `${clean(k)}=${!d.defaultValue}`, props: propsOf({ ...base, [k]: !d.defaultValue }) });
  }
  return cases.slice(0, max);
}

// A property whose value is written only while another one is on (its Code Connect file writes alignment only with
// fullWidth): each of its values drawn with that one on too, so the Playground shows the two together as the component
// draws them, never a value drawn where the code ignores it. base: the default case's props. connect: the Code Connect
// readings (code-connect-map.mjs). → [{ label, props }]
export function decidedCases(entry = {}, base = {}, connect = []) {
  const defs = Object.fromEntries(Object.entries(entry.properties ?? {}).map(([k, d]) => [clean(k), d]));
  const onOff = (d) => d?.type === 'BOOLEAN' || (d?.type === 'VARIANT' && (d.variantOptions ?? []).length === 2 && d.variantOptions.every((o) => /^(true|false)$/i.test(String(o))));
  const out = [], seen = new Set();
  for (const v of (connect ?? []).filter((p) => p.role === 'value' && p.code && !p.event)) {
    const q = defs[clean(v.figma)];
    if (q?.type !== 'VARIANT' || onOff(q)) continue;
    for (const c of connect.filter((p) => p.role === 'condition' && p.code === v.code && p.figma !== v.figma && p.equals == null && !p.unclear)) {
      const d = defs[clean(c.figma)];
      if (!onOff(d)) continue;
      const on = d.type === 'BOOLEAN' ? !c.negated : String(!c.negated);
      if (String(base[clean(c.figma)]) === String(on)) continue;   // on already in every case
      for (const o of q.variantOptions ?? []) {
        const label = `${clean(v.figma)}=${o}, ${clean(c.figma)}=${on}`;
        if (!seen.has(label)) { seen.add(label); out.push({ label, props: propsOf({ ...base, [clean(c.figma)]: on, [clean(v.figma)]: o }) }); }
      }
    }
  }
  return out;
}

// ── A code prop Figma has no prop for ─────────────────────────────────────────────────────────────────────────────
// Which of Figma's props stands for a code prop: the same name, Figma's with what it holds after it (labelContent for
// label, iconContent for icon), or the one Figma name a code name ends with (size for buttonSize). → its key, or null.
const squashName = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
export function figmaPropFor(figmaKeys = [], codeName, codeNames = [codeName]) {
  const c = squashName(codeName);
  const same = figmaKeys.find((k) => squashName(k) === c) ?? figmaKeys.find((k) => squashName(k).replace(/(content|text|value|swap)$/, '') === c);
  if (same) return same;
  const tail = figmaKeys.filter((k) => squashName(k).length > 2 && c.endsWith(squashName(k)) && !codeNames.some((o) => squashName(o) === squashName(k)));
  return new Set(tail.map(squashName)).size === 1 ? tail[0] : null;
}
// What a prop does to how it behaves, never to how it looks (allowEventPropagation, onClick): not a case of its own.
export const TELEPORT_PROP = /disabl\w*teleport|teleport\w*(disabled|off)/i;
export const BEHAVIOUR_PROP = /teleport|propagation|^focus|^on[A-Z]|handler|callback|^emit|event|^v-?model$|^model(value)?$/i;
// The cases the code's own props add to Figma's, for each prop Figma has none for: an on/off one turned the other
// way, each other value its code lists, each from Figma's default case. api: textComponentApi(). → [{ label, props }]
export function codeCases(base = {}, api = {}, max = 8) {
  const names = Object.keys(api.props ?? {}), out = [];
  // A component that teleports itself away (a modal over the window), drawn in place by default: once as it opens,
  // teleported, so the page can open it over the window as a product does.
  for (const p of names) if (TELEPORT_PROP.test(p) && /^boolean$/.test(api.props[p].type ?? '')) out.push({ label: 'opened', props: { ...base, [p]: false } });
  for (const [p, d] of Object.entries(api.props ?? {})) {
    if (BEHAVIOUR_PROP.test(p) || figmaPropFor(Object.keys(base), p, names)) continue;
    if (/^boolean$/.test(d.type ?? '')) { const v = String(d.default) !== 'true'; out.push({ label: `${p}=${v}`, props: { ...base, [p]: v } }); }
    else if ((d.options ?? []).length > 1) for (const o of d.options) if (String(o) !== String(d.default ?? d.options[0])) out.push({ label: `${p}=${o}`, props: { ...base, [p]: o } });
  }
  return out.slice(0, max);
}

// ── What to render when Figma has no variants: the code's own props ─────────────────────────────────────────────────
// api: textComponentApi(file, text) → { props: { name: { default, options } } }; text: the component's source.
// → [{ label, props }]: the default first, then each other value of each option, each on/off prop flipped, each text
// emptied (or set, when it starts empty), each icon set and emptied, at most `max`. kinds (propKinds): what the
// project's other components declare a prop of the same name as, so a bare one (buttonSize: String) draws in their
// options rather than in its own name.
const TEXTY = /^(label|title|text|content|caption|heading|description|placeholder|message|helper(text)?|hint|subtitle|name)$/i;
export function variantsFromCode(api = {}, text = '', max = 16, kinds = {}) {
  const props = Object.entries(api.props ?? {});
  const typed = (p, t) => new RegExp(`\\b${p}\\??\\s*:\\s*(?:${t})\\b|\\b${p}\\s*:\\s*\\{[^}]*type\\s*:\\s*(?:${t})\\b|\\b${p}\\s*:\\s*(?:${t[0].toUpperCase() + t.slice(1)})\\b`, 'i').test(text);
  const isBool = (p, d) => d.default === 'true' || d.default === 'false' || d.default === true || d.default === false || typed(p, 'boolean');
  const value = (p, d) => (isBool(p, d) ? d.default === true || d.default === 'true' : d.default != null ? String(d.default).replace(/^['"`]|['"`]$/g, '') : undefined);
  const base = {};
  for (const [p, d] of props) { const v = value(p, d); if (v !== undefined) base[p] = v; }
  const cases = [{ label: 'default', props: { ...base } }];
  for (const [p, d] of props) {
    if (d.options?.length) { for (const o of d.options) if (String(o) !== String(base[p])) cases.push({ label: `${p}=${o}`, props: { ...base, [p]: o } }); continue; }
    if (isBool(p, d)) { cases.push({ label: `${p}=${!base[p]}`, props: { ...base, [p]: !base[p] } }); continue; }
    if (/icon/i.test(p)) { if (base[p]) cases.push({ label: `${p}=""`, props: { ...base, [p]: '' } }); continue; }
    const words = !TEXTY.test(p) ? comparedWords(text, p) : [];
    const like = words.length ? words : !TEXTY.test(p) && kinds[p]?.options?.length > 1 ? kinds[p].options : null;
    if (like) { for (const o of like) if (String(o) !== String(base[p] ?? kinds[p]?.default ?? like[0])) cases.push({ label: `${p}=${o}`, props: { ...base, [p]: o } }); continue; }
    if (TEXTY.test(p) || typed(p, 'string')) cases.push(base[p] ? { label: `${p}=""`, props: { ...base, [p]: '' } } : { label: `${p}="${p}"`, props: { ...base, [p]: p.charAt(0).toUpperCase() + p.slice(1) } });
  }
  return cases.slice(0, max);
}

// The words a component's code compares a text prop with (props.view === 'month'), then the cases of a switch on it
// (switch (props.view) { case 'day': }): the values it draws, where it lists none, so a case never gives it words of its
// own name it would refuse (a view that is not one). → ['day', 'month', 'year']
export function comparedWords(text = '', p) {
  const src = String(text), out = [];
  const add = (w) => { if (w && !out.includes(w)) out.push(w); };
  const at = `(?:\\bprops\\.|[^.\\w$])${p}\\b`;
  for (const m of src.matchAll(new RegExp(`${at}\\s*[!=]==?\\s*(['"])([\\w-]{1,40})\\1|(['"])([\\w-]{1,40})\\3\\s*[!=]==?\\s*(?:props\\.)?${p}\\b(?!\\s*\\.)`, 'g'))) add(m[2] ?? m[4]);
  for (const m of src.matchAll(new RegExp(`\\bswitch\\s*\\(\\s*(?:props\\.)?${p}\\s*\\)\\s*\\{`, 'g'))) {
    let depth = 1, i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; }
    for (const c of src.slice(start, i).matchAll(/\bcase\s+(['"])([\w-]{1,40})\1\s*:/g)) add(c[2]);
  }
  return out;
}

// The page: every component's cases, each in a box that names it (data-dse-component, data-dse-case). A component
// that fails to load or render is written as such, so the check can say it was not rendered.
// The page's own surface and text colour: the system's, when its CSS names them (--surface-page, --background,
// --text-primary…), so a component without a background of its own is read on the surface it sits on in every mode.
export function pageColours(cssText) {
  const declared = [...new Set([...String(cssText).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];
  const surface = declared.find((v) => /^--(surface|background|bg)(-(page|default|base|primary|app|body))?(-colou?r)?$/i.test(v)) ?? declared.find((v) => /surface.*(page|default|base)|(page|app|body).*(background|surface)/i.test(v)) ?? null;
  const ink = declared.find((v) => /^--(text|ink|content|foreground|fg)(-(primary|default|base|body))?(-colou?r)?$/i.test(v)) ?? null;
  return { surface, ink };
}
export function harnessPage(dir, groups, { lang = 'en' } = {}) {
  const css = walk(dir).filter((p) => /\.css$/.test(p)).map((p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } }).join('\n');
  const { surface, ink } = pageColours(css);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Components</title>${cssLinks(dir)}
<style>body{margin:0;padding:16px;font-family:Inter,system-ui,sans-serif;${surface ? `background:var(${surface});` : ''}${ink ? `color:var(${ink});` : ''}}.dse-case{display:block;margin:0 0 12px}*,*::before,*::after{transition:none!important;animation:none!important}</style></head>
<body><main id="dse-harness"><h1>Components</h1></main>
<script type="module">
import { createElement as h, useState } from '/__react.js';
// The page around each instance, as an app is: a component that is told its state (pressed, selected, open, a value)
// and reports a change through a handler gets the new state back, so a controlled toggle flips as it would in use.
const STATE = ['pressed', 'Pressed', 'selected', 'Selected', 'checked', 'Checked', 'expanded', 'Expanded', 'open', 'Open', 'on', 'On'];
// The state a component of each role is told by its page, even when Figma names no prop for it.
const BY_ROLE = { togglebutton: ['pressed'], toggle: ['pressed'], checkbox: ['checked'], switch: ['checked'], disclosure: ['expanded'], accordion: ['expanded'], tab: ['selected'] };
const VALUE = ['value', 'Value'];
const HANDLERS = ['onClick', 'onChange', 'onToggle', 'onPressedChange', 'onSelectedChange', 'onCheckedChange', 'onExpandedChange', 'onOpenChange', 'onValueChange'];
function Host({ C, props, role }) {
  const [over, setOver] = useState({});
  const extra = Object.fromEntries((BY_ROLE[role] ?? []).filter((k) => !Object.keys(props).some((x) => x.toLowerCase() === k)).map((k) => [k, false]));
  const p = { ...extra, ...props, ...over };
  const has = (k) => Object.prototype.hasOwnProperty.call(props, k) || Object.prototype.hasOwnProperty.call(extra, k);
  const told = STATE.filter(has), valued = VALUE.filter(has);
  if (told.length || valued.length) for (const name of HANDLERS) {
    const own = props[name];
    p[name] = (a, ...rest) => {
      if (typeof own === 'function') own(a, ...rest);
      const v = a && typeof a === 'object' && 'target' in a ? (a.type === 'click' ? undefined : a.target.value) : a;
      const next = {};
      if (typeof v === 'boolean') told.forEach((k) => { next[k] = v; });
      else if (v == null) told.forEach((k) => { const was = p[k]; next[k] = was === 'True' ? 'False' : was === 'False' ? 'True' : !was; });
      if (v != null && typeof v !== 'boolean') valued.forEach((k) => { next[k] = typeof props[k] === 'number' ? Number(v) : String(v); });
      if (Object.keys(next).length) setOver({ ...over, ...next });
    };
  }
  return h(C, p);
}
const GROUPS = ${JSON.stringify(groups).replace(/</g, '\\u003c')};
const main = document.getElementById('dse-harness');
const failed = [];
for (const g of GROUPS) {
  const sec = document.createElement('section'); sec.setAttribute('data-dse-component', g.name); sec.setAttribute('aria-label', g.name); main.append(sec);
  let C = null;
  try {
    const m = await import(g.file);
    const want = String(g.exportName || g.name).toLowerCase();
    const pick = Object.entries(m).find(([k, v]) => typeof v === 'function' && k.toLowerCase() === want) ?? (typeof m.default === 'function' ? ['default', m.default] : Object.entries(m).find(([, v]) => typeof v === 'function'));
    C = pick && pick[1];
  } catch (e) { failed.push({ name: g.name, why: String(e && e.message || e).split('\\n')[0] }); continue; }
  if (!C) { failed.push({ name: g.name, why: 'no component exported' }); continue; }
  for (const c of g.cases) {
    const box = document.createElement('div'); box.className = 'dse-case'; box.setAttribute('data-dse-case', c.label); sec.append(box);
    try { const n = h(Host, { C, props: c.props, role: g.role }); box.append(n instanceof Node ? n : String(n ?? '')); } catch (e) { failed.push({ name: g.name + ' (' + c.label + ')', why: String(e && e.message || e).split('\\n')[0] }); }
  }
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
</script></body></html>`;
}

// The harness for a project: its React components (a .jsx or .tsx file each) with their Figma variants, served.
// names: the components to render. → { url, close, groups, missing: [why] } or null when nothing can be rendered.
export async function startHarness(ROOT, cfg, names, { propsSnap = {}, locate, max = cfg.a11y?.maxVariants ?? 16 } = {}) {
  const ts = loadTypeScript(ROOT);
  if (!ts) return { url: null, why: `no TypeScript to read the components' JSX (${TYPESCRIPT_HINT})` };
  const groups = [], missing = [];
  for (const name of names) {
    const file = locate(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    if (!/\.(jsx|tsx)$/.test(file)) continue;
    // A control whose name comes from the page that uses it (a field, a spinbutton) is given one, as a page would:
    // what is checked is that it can carry it.
    const role = String((propsSnap[name]?.annotations ?? []).map((a) => a?.label ?? '').join(' ').match(/\brole\s*[:=]\s*["']?([a-z][\w-]*)/i)?.[1] ?? '').toLowerCase();
    const named = /^(textbox|textfield|textinput|input|field|searchbox|spinbutton|stepper|numberinput|slider|combobox|listbox|select)$/.test(role);
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    // Figma's variants when it has the component, else the code's own props: every variant, every run.
    let text = ''; try { text = readFileSync(file, 'utf8'); } catch { /* unreadable: the default only */ }
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const cases = (fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(textComponentApi(file, text), text, max)).map((c) => (named ? { ...c, props: { 'aria-label': label, ...c.props } } : c));
    groups.push({ name, file: '/' + relative(ROOT, file), exportName: label, role, cases });
  }
  if (!groups.length) return { url: null, why: 'no React component file (.jsx or .tsx) for the design system\'s components' };
  const srv = await serveProject(ROOT, { '/__dse-harness.html': () => harnessPage(ROOT, groups) }, ts);
  return { url: `http://127.0.0.1:${srv.port}/__dse-harness.html`, close: srv.close, groups, missing };
}
