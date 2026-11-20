// react-harness.mjs - the design system's own React components, drawn with the project's own React.
//
// The engine has always been able to draw a React component, through a small stand-in that turns JSX into DOM
// (component-harness.mjs). It is enough for a presentational component and honest about being no more: the hooks,
// the context, the portals and the effects that real React runs are not run, so a component that needs any of them
// is listed as not drawn. A design system's components need them all the time - a disclosure keeps state, a field
// reads a form's context, a menu renders through a portal - so the checks saw a partial system and said so.
//
// This draws them with the React the project itself has installed, built by the project's own Vite, exactly as
// vue-harness.mjs draws Vue with the project's Vue. Nothing of the engine's own is used to render, and where there
// is no React or no Vite the stand-in is still there, unchanged, as the smaller thing that works.
//
// The page it serves is the one every check already reads: a section per component (`data-dse-component`), a box per
// case (`data-dse-case`), `window.__dseHarnessReady` when it has settled and `window.__dseHarnessFailed` for what
// could not be drawn. So parity, accessibility, the playground and the interaction checks need no change at all -
// what changes is that what they are reading is really React.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';
import { projectModule, globalStyles, runtimeDeps } from './vue-harness.mjs';

// The project's Vite and what it reads JSX with: { vite, plugins, config } or { why }. React's Vite plugin comes in
// two builds (the Babel one and the SWC one) and either will do - the project's choice, never the engine's.
export async function reactBuild(ROOT) {
  if (!projectModule(ROOT, 'react')) {
    return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'))
      ? 'the project\'s packages are not installed (no node_modules), so its own React cannot draw its components'
      : 'the project has no React installed, so its components are drawn by the stand-in instead' };
  }
  if (!projectModule(ROOT, 'react-dom')) return { why: 'the project has React but no react-dom to draw it into a page with' };
  const viteUrl = projectModule(ROOT, 'vite');
  if (!viteUrl) return { why: 'the project has no Vite to build its React components with (its own build tools are used, never the engine\'s)' };
  const config = ['.ts', '.mts', '.js', '.mjs', '.cjs'].map((e) => 'vite.config' + e).find((f) => existsSync(join(ROOT, f))) ?? null;
  let plugins = [];
  if (!config) {
    const url = projectModule(ROOT, '@vitejs/plugin-react') ?? projectModule(ROOT, '@vitejs/plugin-react-swc');
    if (!url) return { why: 'the project has no Vite config and no React plugin for Vite to read its JSX with' };
    plugins = [(await import(url)).default()];
  }
  return { kind: 'vite', label: 'Vite', vite: await import(viteUrl), plugins, config };
}

// The module the page loads: the project's React, its components, each case drawn into its own box. Every marker is
// the one the checks already read, so nothing downstream knows the difference.
// A stylesheet inside a package is asked for by the package's own name, which is how the build resolves it: a
// published design system keeps its tokens in one (found on a real system, where /node_modules/... answered 404 and
// the page then drew nothing at all). A stylesheet of the project's own keeps the path it has.
export const styleSpecifier = (s) => String(s).replace(/^\/?node_modules\//, '');

export function harnessModule(groups = [], styles = []) {
  return `${styles.map((s) => `import ${JSON.stringify(styleSpecifier(s))};`).join('\n')}
import { createElement, StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
const GROUPS = ${JSON.stringify(groups).replace(/</g, '\\u003c')};
// Each file imported by a literal path, so the build resolves it as the components' own imports are resolved: a
// path it cannot see (an ignored dynamic import) loads a second copy of the module, and a part then reads a context
// its parent never provided (found by the test, where a list's item threw inside its own list).
const LOAD = {${[...new Set(groups.flatMap((g) => [g.file, g.parent?.file].filter(Boolean)))].map((f) => `${JSON.stringify(f)}: () => import(${JSON.stringify(f)})`).join(', ')}};
const main = document.getElementById('dse-harness');
const failed = [];
// A component is taken by the name it is exported under, else the default, else the only function the file exports -
// the same reading the stand-in does, so a project that drew before draws now.
// React draws more than functions: forwardRef and memo give an object, and a design system's components are full of
// both (found on a real system, where every component with a ref came back as "no component exported").
const drawable = (v) => typeof v === 'function' || (v && typeof v === 'object' && typeof v.$$typeof === 'symbol');
const pick = (m, want) => {
  const named = Object.entries(m).find(([k, v]) => drawable(v) && k.toLowerCase() === String(want).toLowerCase());
  if (named) return named[1];
  if (drawable(m.default)) return m.default;
  const only = Object.entries(m).filter(([, v]) => drawable(v));
  return only.length === 1 ? only[0][1] : null;
};
const why1 = (e) => String(e && e.message || e).split('\\n')[0];
// React throws while it draws, after render() has returned, so a try around render() never sees it: a boundary
// around each case catches what the component threw and says it, rather than leaving an empty box and no reason.
class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { this.props.onError(err); }
  render() { return this.state.err ? null : this.props.children; }
}
// The page is ready once nothing has changed in it for a moment: React draws after this turn and an effect after
// that, which is how the Vue harness waits too (an effect that fetches, an icon that arrives late).
const settle = () => new Promise((done) => {
  let t = null;
  const fin = () => { mo.disconnect(); clearTimeout(t); done(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); });
  mo.observe(main, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(fin, 400); setTimeout(fin, 8000);
});
const empty = (box) => !box.querySelector('*') && !box.textContent.trim();
const drawn = [];
for (const g of GROUPS) {
  const sec = document.createElement('section');
  sec.setAttribute('data-dse-component', g.name);
  sec.setAttribute('aria-label', g.name);
  main.append(sec);
  let C = null, P = null;
  try { C = pick(await LOAD[g.file](), g.exportName || g.name); }
  catch (e) { failed.push({ name: g.name, why: why1(e) }); continue; }
  if (!C) { failed.push({ name: g.name, why: 'no component exported' }); continue; }
  // The component it is a part of (an autocomplete's option, a list's item), to draw it inside when it cannot draw
  // on its own: the part is written for its parent's context, and outside it throws or draws nothing.
  if (g.parent) { try { P = pick(await LOAD[g.parent.file](), g.parent.exportName); } catch { P = null; } }
  for (const c of g.cases) {
    const box = document.createElement('div');
    box.className = 'dse-case';
    box.setAttribute('data-dse-case', c.label);
    sec.append(box);
    // Each case gets its own root: one that throws takes its own box and not the page, and what it threw is said
    // rather than left as a blank space (the stand-in's own rule).
    const d = { g, c, box, C, P, err: null, root: null };
    drawn.push(d);
    const draw = (el) => { d.err = null; d.root = createRoot(box); d.root.render(createElement(StrictMode, null, createElement(Boundary, { onError: (e) => { d.err = e; } }, el))); };
    try { draw(createElement(C, { ...c.props })); } catch (e) { d.err = e; }
  }
}
await settle();
// A part that threw or drew nothing on its own is drawn again inside its parent, and said to be.
const again = drawn.filter((d) => d.P && (d.err || empty(d.box)));
for (const d of again) {
  d.first = d.err ? why1(d.err) : null;
  try { d.root?.unmount(); } catch { /* gone */ }
  d.err = null;
  try {
    d.root = createRoot(d.box);
    d.root.render(createElement(StrictMode, null, createElement(Boundary, { onError: (e) => { d.err = e; } }, createElement(d.P, null, createElement(d.C, { ...d.c.props })))));
    d.box.setAttribute('data-dse-inside', d.g.parent.name);
  } catch (e) { d.err = e; }
}
if (again.length) await settle();
for (const d of drawn) {
  const at = { name: d.g.name + ' (' + d.c.label + ')', component: d.g.name, case: d.c.label, of: d.g.cases.length };
  if (d.err) { d.box.removeAttribute('data-dse-inside'); failed.push({ ...at, why: why1(d.err) }); }
  else if (empty(d.box)) { d.box.removeAttribute('data-dse-inside'); failed.push({ ...at, nothing: true, why: d.g.parent ? 'drew nothing, on its own or inside ' + d.g.parent.name : 'drew nothing with the props it was given (a closed overlay, or content it needs and was not given)' }); }
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
`;
}

export const PAGE = (surface = '#fff', ink = '#111') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Components</title>
<style>body{margin:0;background:${surface};color:${ink};font:14px system-ui,sans-serif}main{padding:16px;display:flex;flex-direction:column;gap:16px}section{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}</style>
</head><body><main id="dse-harness"></main><script type="module" src="/__dse-react-entry.js"></script></body></html>`;

// The component a part belongs to, by the way React systems name their compound parts: an option of an autocomplete
// is AutocompleteOption, an item of an action list ActionListItem. The longest other name the part's own begins
// with, at a word's start. → name | null
export function partOf(name, names = []) {
  const n = String(name);
  return names.filter((p) => p !== n && p.length < n.length && n.toLowerCase().startsWith(p.toLowerCase()) && /[A-Z0-9_.]/.test(n.charAt(p.length)))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

// The harness for a project: its React components with their variants, drawn by its own React and served.
// → { url, close, groups, missing } or { url: null, why }.
export async function startReactHarness(ROOT, cfg, names = [], { propsSnap = {}, locate, max = cfg.a11y?.maxVariants ?? 16, surface = '#fff', ink = '#111' } = {}) {
  const pb = await reactBuild(ROOT);
  if (pb.why) return { url: null, why: pb.why };
  const { harnessCases, variantsFromCode } = await import('./component-harness.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const groups = [], missing = [];
  for (const name of names) {
    const file = locate?.(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    if (!/\.(jsx|tsx)$/.test(file)) continue;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    let text = ''; try { text = readFileSync(file, 'utf8'); } catch { /* unreadable: the default case only */ }
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const cases = fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(textComponentApi(file, text), text, max);
    const parent = partOf(name, names);
    const parentFile = parent ? locate?.(parent) : null;
    groups.push({ name, file: '/' + relative(ROOT, file).split(sep).join('/'), exportName: label, cases,
      ...(parentFile && /\.(jsx|tsx)$/.test(parentFile) ? { parent: { name: parent, file: '/' + relative(ROOT, parentFile).split(sep).join('/'), exportName: parent.charAt(0).toUpperCase() + parent.slice(1) } } : {}) });
  }
  if (!groups.length) return { url: null, why: 'no React component file (.jsx or .tsx) for the design system\'s components' };

  const OUT = cfg.out ?? '.design-system-engine-out';
  const dir = join(ROOT, OUT, 'react-harness');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  writeFileSync(entry, harnessModule(groups, globalStyles(ROOT, cfg)));

  let vite;
  try {
    vite = await pb.vite.createServer({
      root: ROOT, configFile: pb.config ? join(ROOT, pb.config) : false, plugins: pb.plugins,
      logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT, 'vite-cache-react'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // React and react-dom are bundled before the page loads, so every component shares one React: two copies is
      // the oldest way to make hooks throw, and it would read as the components being broken. Every package the
      // project's own code imports is bundled with them: a CommonJS one (react-is, found on a real system) has no
      // named exports until it is converted, and a component that imports one cannot be drawn at all.
      // Vite finds the rest itself: a CommonJS package a *dependency* imports (react-is, on a real system) is in no
      // project's own source, so a list built by reading src/ can never hold it, and without converting it the
      // component that needs it does not draw at all.
      optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', ...runtimeDeps(ROOT)] },
      // A build-time flag React libraries are written against and every bundler replaces. The project's own config
      // defines it where it has one; without that, a component that mentions it throws before it draws - found on a
      // real system whose components all say __DEV__. It is given the value a built library ships with, never a
      // guess at what the project wants: what is checked is the component as it is published.
      define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
    });
  } catch (e) { return { url: null, why: `the project's Vite did not start (${String(e?.message ?? e).split('\n')[0]})` }; }

  const entryUrl = '/' + relative(ROOT, entry).split(sep).join('/');
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/__dse-react-harness.html') {
      // What went wrong is said to whoever started the run, never written into the page: an exception's text in a
      // response is read as HTML by the browser, and its stack says more about this computer than a page should.
      try { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(await vite.transformIndexHtml(req.url, page)); }
      catch (e) {
        console.error(`the harness page could not be built: ${String(e?.message ?? e).split('\n')[0]}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('the harness page could not be built');
      }
    }
    if (path === '/__dse-react-entry.js') { req.url = entryUrl; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-react-harness.html`, close, groups, missing };
}

// Each component drawn with the project's own React, read back as markup and CSS for a page that shows it without
// running it: the style guide and its Playground, which draw every variant as React drew it, as renderedVue
// (vue-harness.mjs) does for Vue. The stand-in's markup, read from the JSX, is what stays where this cannot run.
// → { markup: { name: html }, cases: { name: [{ label, markup, props }] }, css, failed, why? }
export async function renderedReact(ROOT, cfg, names, { propsSnap = {}, locate, chromePath = null, max = 1 } = {}) {
  const none = (why) => ({ markup: {}, cases: {}, css: '', failed: [], why });
  if (typeof WebSocket === 'undefined') return none('Node 22 or later is needed to drive Chrome');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return none('Chrome not found (set CHROME_PATH)');
  const h = await startReactHarness(ROOT, cfg, names, { propsSnap, locate, max });
  if (!h.url) return none(h.why);
  const theme = [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => String(f).replace(/^\.?\//, ''));
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-react-' });
    cdp = await connectCDP(browser.wsUrl);
    const thrown = [];
    cdp.on('Runtime.exceptionThrown', (p) => thrown.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? ''));
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }))) {
      const first = thrown.map((t) => String(t).split('\n')[0]).filter(Boolean)[0];
      return none(`the page of its components did not finish within a minute${first ? ` (it threw: ${first.slice(0, 200)})` : ''}`);
    }
    // Each case's box as React left it, and the stylesheets the components brought (Vite names the file each came from):
    // never the harness's own, nor the theme the page already carries.
    const expr = `(() => {
      const THEME = ${JSON.stringify(theme)};
      const html = (b) => b.innerHTML.replace(/<!--[\\s\\S]*?-->/g, '').trim();
      for (const i of document.querySelectorAll('input')) { if (i.indeterminate) i.setAttribute('data-dse-indeterminate', ''); }
      const cases = Object.fromEntries([...document.querySelectorAll('[data-dse-component]')].map((s) => [s.getAttribute('data-dse-component'), [...s.querySelectorAll('[data-dse-case]')].map((b) => ({ label: b.getAttribute('data-dse-case'), markup: html(b) })).filter((c) => c.markup)]));
      const own = (s) => { const id = s.getAttribute('data-vite-dev-id'); return !!id && !/\\/react-harness\\//.test(id) && !THEME.some((t) => id.endsWith('/' + t)); };
      const css = [...document.querySelectorAll('style')].filter(own).map((s) => s.textContent).join('\\n');
      return JSON.stringify({ cases, css, failed: window.__dseHarnessFailed || [] });
    })()`;
    const r = JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? '{}');
    const props = Object.fromEntries(h.groups.map((g) => [g.name, Object.fromEntries(g.cases.map((c) => [c.label, c.props]))]));
    const cases = Object.fromEntries(Object.entries(r.cases ?? {}).filter(([, l]) => l.length).map(([n, l]) => [n, l.map((c) => ({ ...c, props: props[n]?.[c.label] ?? {} }))]));
    // The first case is the default: what the component draws with nothing set.
    const markup = Object.fromEntries(Object.entries(cases).filter(([n, l]) => l[0].label === h.groups.find((g) => g.name === n)?.cases[0]?.label).map(([n, l]) => [n, l[0].markup]));
    return { markup, cases, css: String(r.css ?? '').replace(/\/\*# sourceMappingURL=[^*]*\*\/\s*/g, ''), failed: r.failed ?? [], build: 'Vite' };
  } catch (e) { return none(String(e?.message ?? e).split('\n')[0]); }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } await h.close(); }
}
