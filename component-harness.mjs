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
import { projectTypeScriptOnly, withinProject } from './project-typescript.mjs';

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

// TypeScript: the project's own, else the global npm folder's. null when neither is there. Only the project's own when
// DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project (project-typescript.mjs).
const tsCache = new Map();
export function loadTypeScript(ROOT) {
  const key = `${ROOT}|${projectTypeScriptOnly()}`;
  if (tsCache.has(key)) return tsCache.get(key);
  let ts = null;
  const own = () => { const req = createRequire(join(ROOT, 'package.json')); const at = req.resolve('typescript'); if (projectTypeScriptOnly() && !withinProject(ROOT, at)) throw new Error('not the project\'s'); return req(at); };
  const global = () => createRequire(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'noop.js'))('typescript');
  for (const load of projectTypeScriptOnly() ? [own] : [own, global]) {
    try { ts = load(); break; } catch { /* not there */ }
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
// variant prop and each on/off prop flipped, at most `max`.
export function harnessCases(entry = {}, max = 8) {
  const defs = Object.entries(entry.properties ?? {});
  const base = {};
  for (const [k, d] of defs) if (d.type !== 'INSTANCE_SWAP') base[k] = d.defaultValue;
  const cases = [{ label: 'default', props: propsOf(base) }];
  for (const [k, d] of defs) {
    if (d.type === 'VARIANT') for (const o of d.variantOptions ?? []) { if (String(o) !== String(d.defaultValue) && !INTERACTION.test(o)) cases.push({ label: `${clean(k)}=${o}`, props: propsOf({ ...base, [k]: o }) }); }
    else if (d.type === 'BOOLEAN') cases.push({ label: `${clean(k)}=${!d.defaultValue}`, props: propsOf({ ...base, [k]: !d.defaultValue }) });
  }
  return cases.slice(0, max);
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
export async function startHarness(ROOT, cfg, names, { propsSnap = {}, locate } = {}) {
  const ts = loadTypeScript(ROOT);
  if (!ts) return { url: null, why: 'no TypeScript to read the components\' JSX (the project\'s own, or a global one: npm i -g typescript)' };
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
    const cases = harnessCases(propsSnap[name]).map((c) => (named ? { ...c, props: { 'aria-label': label, ...c.props } } : c));
    groups.push({ name, file: '/' + relative(ROOT, file), exportName: label, role, cases });
  }
  if (!groups.length) return { url: null, why: 'no React component file (.jsx or .tsx) for the design system\'s components' };
  const srv = await serveProject(ROOT, { '/__dse-harness.html': () => harnessPage(ROOT, groups) }, ts);
  return { url: `http://127.0.0.1:${srv.port}/__dse-harness.html`, close: srv.close, groups, missing };
}
