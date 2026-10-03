// test/skill-evals/build-score.mjs - how a component or screen built from Figma is scored, the same way whoever built
// it (the build evaluation: the Figma MCP alone against the Figma MCP with the skill).
//
// Nothing here reads the engine's own conventions: a component is found by the file the task names, rendered in a
// real browser (TypeScript turns its JSX into DOM calls through a ten-line stand-in for React), and measured. Each
// variant is rendered with its props named and valued as Figma names them (State, state; True, true), states such as
// hover are forced the way a browser applies them, and dark mode is tried every common way (a data-theme attribute,
// a dark class, the colour-scheme media). What it shows is compared with the Figma facts: height, padding, gap,
// radius, colours, border, opacity, type. The code is also read for values the design system does not have.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../../cdp.mjs';

// TypeScript, from the global npm folder, loaded when a build is first transpiled: the scorer's other helpers (the
// prototype scorer imports them) work on a machine that has none.
let tsModule = null;
const tsLib = () => (tsModule ??= createRequire(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'noop.js'))('typescript'));

// ── The React stand-in: enough for a presentational component, nothing more ──────────────────────────────────
const REACT_SHIM = `
const BOOL = new Set(['disabled','checked','readonly','required','hidden','selected','multiple','autofocus']);
export function createElement(type, props, ...children) {
  props = props || {};
  const kids = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true);
  if (typeof type === 'function') return type({ ...props, children: kids.length <= 1 ? kids[0] : kids });
  if (type === Fragment) { const f = document.createDocumentFragment(); kids.forEach((c) => f.append(c instanceof Node ? c : String(c))); return f; }
  const el = document.createElement(type);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || v == null || v === false && !k.startsWith('aria-')) continue;
    if (k === 'className' || k === 'class') el.setAttribute('class', String(v));
    else if (k === 'htmlFor') el.setAttribute('for', String(v));
    else if (k === 'style' && typeof v === 'object') for (const [s, x] of Object.entries(v)) el.style.setProperty(s.startsWith('--') ? s : s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), typeof x === 'number' && !/opacity|weight|index|flex|line/i.test(s) ? x + 'px' : String(x));
    else if (/^on[A-Z]/.test(k)) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'defaultValue') el.setAttribute('value', String(v));
    else if (BOOL.has(k.toLowerCase())) { if (v) el.setAttribute(k.toLowerCase(), ''); }
    else el.setAttribute(k, v === true ? (k.startsWith('aria-') ? 'true' : '') : String(v));
  }
  kids.forEach((c) => el.append(c instanceof Node ? c : String(c)));
  return el;
}
export const Fragment = Symbol('Fragment');
export const useState = (v) => [typeof v === 'function' ? v() : v, () => {}];
export const useEffect = () => {}; export const useLayoutEffect = () => {}; export const useRef = (v) => ({ current: v ?? null });
export const useMemo = (f) => f(); export const useCallback = (f) => f; export const useId = () => 'id' + Math.random().toString(36).slice(2, 8);
export const forwardRef = (f) => (p) => f(p, null); export const memo = (f) => f;
export const createContext = (v) => ({ Provider: ({ children }) => children, _v: v }); export const useContext = (c) => c?._v;
export default { createElement, Fragment, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId, forwardRef, memo, createContext, useContext };
`;

const CODE_EXT = ['.jsx', '.tsx', '.js', '.ts', '.mjs'];
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.design-system-engine-out|\.claude|contracts|figma-mcp)$/.test(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

// Turn one project file into a browser module; its local imports become other modules of the same bundle.
function transpile(src, file) {
  let code = src
    .replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.(css|scss))['"];?/gm, (_, n) => `const ${n} = new Proxy({}, { get: (_t, k) => String(k) });`)
    .replace(/^\s*import\s+['"][^'"]+\.(css|scss)['"];?/gm, '')
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+\.(css|scss|svg|png)['"];?/gm, '');
  const ts = tsLib();
  const out = ts.transpileModule(code, { fileName: file, compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: '__h', jsxFragmentFactory: '__F', target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  return `import { createElement as __h, Fragment as __F } from '/__react.js';\n${out.replace(/from\s+['"](react|react\/jsx-runtime)['"]/g, "from '/__react.js'")}`;
}

// Serve the project: its CSS as is, its code transpiled, the stand-in for React, and a page that renders one case.
function serve(dir) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/__react.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(REACT_SHIM); }
    if (url === '/__page.html') {
      const css = walk(dir).filter((p) => /\.css$/.test(p)).map((p) => `<link rel="stylesheet" href="/${relative(dir, p)}">`).join('\n');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><html><head><meta charset="utf-8">${css}<style>body{margin:0;font-family:Inter,system-ui,sans-serif}*,*::before,*::after{transition:none!important;animation:none!important}</style></head><body><div id="root"></div></body></html>`);
    }
    let p = join(dir, url);
    if (!existsSync(p)) { const hit = CODE_EXT.map((e) => p + e).concat(CODE_EXT.map((e) => join(p, 'index' + e))).find(existsSync); if (hit) p = hit; }
    if (!existsSync(p) || !p.startsWith(dir)) { res.writeHead(404); return res.end(); }
    if (CODE_EXT.includes(extname(p))) {
      let js;
      try { js = transpile(readFileSync(p, 'utf8'), p); } catch (e) { res.writeHead(500); return res.end(String(e)); }
      // Local imports resolve against this file's folder; bare ones other than react cannot load here.
      js = js.replace(/(from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g, (m, a, spec) => `${a}'/${relative(dir, resolve(dirname(p), spec))}'`);
      res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js);
    }
    res.writeHead(200, { 'content-type': /\.css$/.test(p) ? 'text/css' : 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

// What the page measures for the element a case rendered: the root, and the element that holds the label text.
// The component's own element: the root, or the element that carries the component's class when the root is not it
// (a plain wrapper, or a fragment whose first element is a label: the field's input carries .field).
const MEASURE = `(sel, label, cls) => {
  const host = document.querySelector(sel); const top = host && [...host.childNodes].find((n) => n.nodeType === 1);
  if (!top) return null;
  const el = cls && !top.classList.contains(cls) && host.querySelector('.' + cls) || top;
  const cs = getComputedStyle(el);
  const walk = (n) => [n, ...[...n.children].flatMap(walk)];
  const textEl = walk(el).reverse().find((n) => label && n.textContent.trim() === label) || walk(el).reverse().find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) || el;
  const input = el.matches('input,textarea') ? el : el.querySelector('input,textarea');
  const ts = getComputedStyle(input || textEl);
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), ariaPressed: el.getAttribute('aria-pressed'), disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
    height: r.height, width: r.width, paddingTop: cs.paddingTop, paddingLeft: cs.paddingLeft, gap: cs.columnGap, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, opacity: cs.opacity,
    borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle, borderColor: cs.borderTopColor, color: ts.color, fontSize: ts.fontSize, fontWeight: ts.fontWeight, lineHeight: ts.lineHeight,
    children: el.children.length, hasIcon: !!el.querySelector('svg,img,[class*=icon i],[data-icon]'), nodes: walk(el).length + walk(el).flatMap((n) => [...n.childNodes]).filter((c) => c.nodeType === 3 && c.textContent.trim()).length, hasInput: !!input, inputLabelled: !!input && (!!input.getAttribute('aria-label') || !!input.getAttribute('aria-labelledby') || !!input.closest('label') || (!!input.id && !!document.querySelector('label[for="' + input.id + '"]'))),
    rowGap: cs.rowGap, buttons: el.querySelectorAll('button,[role=button]').length + (el.matches('button,[role=button]') ? 1 : 0), inputs: el.querySelectorAll('input,textarea').length, text: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) };
}`;

// Render cases of one exported component and measure each. cases: [{ id, props, pseudo: ['hover'], dark: bool }]
export async function renderCases(dir, file, exportName, cases, { label = null } = {}) {
  const cls = String(exportName).toLowerCase();   // the component's class, as the build sheet and Figma name it
  const chromePath = process.env.CHROME_PATH || findChrome({ playwright: true });
  if (!chromePath) throw new Error('no Chrome to render with');
  const { server, port } = await serve(dir);
  const chrome = await launchChrome(chromePath, { tmpPrefix: 'build-score-' });
  const { send, close } = await connectCDP(chrome.wsUrl);
  const out = {};
  try {
    const { sessionId } = await openPage(send, `http://127.0.0.1:${port}/__page.html`);
    await waitForTrue(send, sessionId, 'location.protocol === "http:" && document.readyState === "complete" && !!document.getElementById("root")', { attempts: 200 });
    await send('DOM.enable', {}, sessionId); await send('CSS.enable', {}, sessionId);
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    // Load the module once; find the component: the named export, the default, or any function export.
    const loaded = await ev(`import('/${relative(dir, file)}').then((m) => { const want = ${JSON.stringify(exportName)}.toLowerCase();
      const pick = Object.entries(m).find(([k, v]) => typeof v === 'function' && k.toLowerCase() === want) ?? (typeof m.default === 'function' ? ['default', m.default] : Object.entries(m).find(([, v]) => typeof v === 'function'));
      window.__C = pick && pick[1]; return pick ? pick[0] : null; }).catch((e) => 'ERROR ' + e.message)`);
    if (!loaded || String(loaded).startsWith('ERROR')) return { error: loaded ?? `no component exported from ${relative(dir, file)}` };
    for (const c of cases) {
      const darkModes = c.dark ? ['data', 'class', 'media'] : [null];
      let m = null;
      for (const dm of darkModes) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dm === 'media' ? 'dark' : 'light' }] }, sessionId);
        await ev(`(() => { const h = document.documentElement; ${dm === 'data' ? "h.setAttribute('data-theme','dark');" : "h.removeAttribute('data-theme');"} h.classList.toggle('dark', ${dm === 'class'}); h.classList.toggle('theme-dark', ${dm === 'class'});
          const root = document.getElementById('root'); root.innerHTML = ''; const host = document.createElement('div'); host.id = 'case'; host.style.display = 'inline-block'; root.append(host);
          try { const node = window.__C(${JSON.stringify(c.props)}); host.append(node instanceof Node ? node : String(node ?? '')); return true; } catch (e) { host.textContent = 'ERROR ' + e.message; return false; } })()`);
        if (c.pseudo?.length) {
          const { root } = await send('DOM.getDocument', { depth: -1 }, sessionId);
          const own = await ev(`(() => { const t = document.querySelector('#case > *'); return !!(t && !t.classList.contains(${JSON.stringify(cls)}) && document.querySelector('#case .' + ${JSON.stringify(cls)})); })()`);
          const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: own ? `#case .${cls}` : '#case > *' }, sessionId);
          if (nodeId) await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: c.pseudo }, sessionId);
        }
        m = await ev(`(${MEASURE})('#case', ${JSON.stringify(label)}, ${JSON.stringify(cls)})`);
        if (!c.dark || (m && c.expectDark && c.expectDark(m))) break;
      }
      out[c.id] = m;
    }
  } finally { close(); chrome.kill(); server.close(); }
  return out;
}

// ── Comparing what rendered with Figma ─────────────────────────────────────────────────────────────────────────
export const rgb = (hex) => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
const px = (v) => (v == null ? NaN : parseFloat(v));
const near = (a, b) => Math.abs(px(a) - b) <= 0.5;

// expect: { height, paddingTop, paddingLeft, gap, radius, bg, color, borderWidth, borderColor, opacity, fontSize, fontWeight, lineHeight }
export function compare(m, expect) {
  if (!m) return ['it did not render'];
  const bad = [];
  for (const [k, v] of Object.entries(expect)) {
    if (v == null) continue;
    const got = m[k];
    const ok = ['bg', 'color', 'borderColor'].includes(k) ? got === rgb(v)
      : k === 'opacity' ? Math.abs(Number(got) - v) < 0.01
      : k === 'fontWeight' ? Number(got) === v
      : near(got, v);
    if (!ok) bad.push(`${k} ${got} (Figma ${['bg', 'color', 'borderColor'].includes(k) ? v : v + (k === 'opacity' || k === 'fontWeight' ? '' : 'px')})`);
  }
  return bad;
}

// Values the code writes that the design system does not have: colours as literals, and variables it never declared.
export function offSystemValues(text, declared) {
  const t = String(text ?? '').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ' ');
  const out = [];
  for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(?:rgb|hsl)a?\([^)]*\)/g)) out.push(m[0]);
  for (const m of t.matchAll(/var\(\s*(--[\w-]+)/g)) if (!declared.has(m[1])) out.push(`var(${m[1]})`);
  for (const m of t.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) if (!declared.has(m[1])) out.push(`${m[1]} (a new variable)`);
  return [...new Set(out)];
}

// The files a run wrote, read back.
export function written(dir, changed) {
  return changed.filter((p) => existsSync(join(dir, p)) && /\.(css|scss|jsx?|tsx?|mjs|html)$/.test(p)).map((p) => ({ path: p, text: readFileSync(join(dir, p), 'utf8') }));
}

// The page's CSS variables, in light and in dark (dark tried every common way). names: ['--x', …]
export async function cssVariables(dir, names, expectDark = null) {
  const chromePath = process.env.CHROME_PATH || findChrome({ playwright: true });
  const { server, port } = await serve(dir);
  const chrome = await launchChrome(chromePath, { tmpPrefix: 'build-score-' });
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, `http://127.0.0.1:${port}/__page.html`);
    await waitForTrue(send, sessionId, 'location.protocol === "http:" && document.readyState === "complete" && !!document.getElementById("root")', { attempts: 200 });
    const read = async (dm) => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dm === 'media' ? 'dark' : 'light' }] }, sessionId);
      const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const h = document.documentElement; ${dm === 'data' ? "h.setAttribute('data-theme','dark');" : "h.removeAttribute('data-theme');"} h.classList.toggle('dark', ${dm === 'class'}); h.classList.toggle('theme-dark', ${dm === 'class'});
        const cs = getComputedStyle(h); return Object.fromEntries(${JSON.stringify(names)}.map((n) => [n, cs.getPropertyValue(n).trim()])); })()` }, sessionId);
      return r.result.value;
    };
    const light = await read(null);
    let dark = null;
    for (const dm of ['data', 'class', 'media']) { dark = await read(dm); if (!expectDark || expectDark(dark)) break; }
    return { light, dark };
  } finally { close(); chrome.kill(); server.close(); }
}
