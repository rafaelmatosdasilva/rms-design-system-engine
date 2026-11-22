// lit-harness.mjs - the design system's own Lit components, drawn with the project's own Lit in a real browser.
//
// A Lit component is a custom element: a class the browser draws once its tag is defined. The project's own Vite
// builds each component file (its TypeScript, its decorators, its imports) as it does for its own pages, and the page
// draws each component in each of its cases, as react-harness.mjs and vue-harness.mjs do for React and Vue. Nothing of
// the engine's own is used to render, and where there is no Lit or no Vite it says so and draws nothing.
//
// What a Lit component takes is a property, never only an attribute, so each case's values are set as properties
// (el.size = 'm'), which is how a team's own code sets them. The tag is the one the component defines for itself
// (@customElement, customElements.define); a file that leaves the definition to another (a library that registers its
// components in a file of their own) is defined here under the tag it is known by, or a tag of the harness's own.
//
// The page is the one every check already reads: a section per component (`data-dse-component`), a box per case
// (`data-dse-case`), `window.__dseHarnessReady` when it has settled and `window.__dseHarnessFailed` for what could not
// be drawn. A component draws into its shadow root, which the browser checks read through (axe and the engine's own
// read open shadow roots), and the style guide keeps it as a declarative shadow root, its styles inside it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';
import { projectModule, globalStyles, runtimeDeps } from './vue-harness.mjs';
import { styleSpecifier } from './react-harness.mjs';

// The project's Lit and the Vite that builds it: { vite, plugins, config } or { why }. Lit needs no plugin of Vite's:
// Vite reads TypeScript and its decorators as the project's tsconfig says.
export async function litBuild(ROOT) {
  if (!projectModule(ROOT, 'lit') && !projectModule(ROOT, 'lit-element')) {
    return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'))
      ? 'the project\'s packages are not installed (no node_modules), so its own Lit cannot draw its components'
      : 'the project has no Lit installed to draw its components with' };
  }
  const viteUrl = projectModule(ROOT, 'vite');
  if (!viteUrl) return { why: 'the project has no Vite to build its Lit components with (its own build tools are used, never the engine\'s)' };
  const config = ['.ts', '.mts', '.js', '.mjs', '.cjs'].map((e) => 'vite.config' + e).find((f) => existsSync(join(ROOT, f))) ?? null;
  return { kind: 'vite', label: 'Vite', vite: await import(viteUrl), plugins: [], config };
}

const lit = (v) => JSON.stringify(v).replace(/[<>\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '');

// The module the page loads: each component file imported, its element defined, each case drawn into its own box.
export function harnessModule(groups = [], styles = []) {
  return `${styles.map((s) => `import ${lit(styleSpecifier(s))};`).join('\n')}
const GROUPS = ${lit(groups)};
const LOAD = {${[...new Set(groups.map((g) => g.file))].map((f) => `${lit(f)}: () => import(${lit(f)})`).join(', ')}};
const main = document.getElementById('dse-harness');
const failed = [];
const why1 = (e) => String(e && e.message || e).split('\\n')[0];
// The element class a file exports: the one named as the component, else the default, else the only one.
const isElement = (v) => typeof v === 'function' && v.prototype instanceof HTMLElement;
const pick = (m, want) => {
  const named = Object.entries(m).find(([k, v]) => isElement(v) && k.toLowerCase() === String(want).toLowerCase().replace(/-/g, ''));
  if (named) return named[1];
  if (isElement(m.default)) return m.default;
  const only = Object.values(m).filter(isElement);
  return only.length === 1 ? only[0] : null;
};
// The tag it is drawn as: the one it defined for itself, else the one it is known by, defined here, else the harness's.
const tagFor = (C, g, i) => {
  const own = customElements.getName ? customElements.getName(C) : null;
  if (own) return own;
  for (const t of [g.tag, 'dse-' + g.slug + '-' + i]) {
    if (!t || !/^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(t)) continue;
    const there = customElements.get(t);
    if (there === C) return t;
    if (!there) { try { customElements.define(t, C); return t; } catch { /* taken, or the class is defined elsewhere */ } }
  }
  return null;
};
const settle = () => new Promise((done) => {
  let t = null;
  const fin = () => { mo.disconnect(); clearTimeout(t); done(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); });
  mo.observe(main, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(fin, 400); setTimeout(fin, 8000);
});
// Drawn: its shadow root holds an element or text, or what it was given shows in its own light.
const empty = (el) => !(el.shadowRoot && (el.shadowRoot.querySelector('*') || el.shadowRoot.textContent.trim())) && !el.children.length && !el.textContent.trim();
const drawn = [];
let thrown = null;
addEventListener('error', (e) => { thrown = e.error || e.message; });
for (const [i, g] of GROUPS.entries()) {
  const sec = document.createElement('section');
  sec.setAttribute('data-dse-component', g.name);
  sec.setAttribute('aria-label', g.name);
  main.append(sec);
  let C = null;
  try { C = pick(await LOAD[g.file](), g.exportName); }
  catch (e) { failed.push({ name: g.name, why: why1(e) }); continue; }
  if (!C) { failed.push({ name: g.name, why: 'no custom element class exported' }); continue; }
  const tag = tagFor(C, g, i);
  if (!tag) { failed.push({ name: g.name, why: 'its element could not be defined' }); continue; }
  for (const c of g.cases) {
    const box = document.createElement('div');
    box.className = 'dse-case';
    box.setAttribute('data-dse-case', c.label);
    sec.append(box);
    const d = { g, c, box, el: null, err: null };
    drawn.push(d);
    try {
      thrown = null;
      const el = document.createElement(tag);
      // Each value as a property, as Lit reads it. A name with a dash is an attribute only (aria-label).
      for (const [k, v] of Object.entries(c.props ?? {})) { if (k.includes('-')) { if (v === true) el.setAttribute(k, ''); else if (v != null && v !== false) el.setAttribute(k, String(v)); } else el[k] = v; }
      // What a person puts in it, where it holds content and the case gives none: its name, so a button says something.
      if (g.content && !Object.keys(c.props ?? {}).some((k) => /^(label|text|content|children)$/i.test(k))) { el.textContent = g.content; el.setAttribute('data-dse-content', ''); }
      box.append(el);
      d.el = el;
      if (el.updateComplete) await Promise.race([el.updateComplete, new Promise((r) => setTimeout(r, 2000))]);
      if (thrown) d.err = thrown;
    } catch (e) { d.err = e; }
  }
}
await settle();
for (const d of drawn) {
  const at = { name: d.g.name + ' (' + d.c.label + ')', component: d.g.name, case: d.c.label, of: d.g.cases.length };
  if (d.err) failed.push({ ...at, why: why1(d.err) });
  else if (!d.el || empty(d.el)) failed.push({ ...at, nothing: true, why: 'drew nothing with the properties it was given (a closed overlay, or content it needs and was not given)' });
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
`;
}

export const PAGE = (surface = '#fff', ink = '#111') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Components</title>
<style>body{margin:0;background:${surface};color:${ink};font:14px system-ui,sans-serif}main{padding:16px;display:flex;flex-direction:column;gap:16px}section{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}</style>
</head><body><main id="dse-harness"></main><script type="module" src="/__dse-lit-entry.js"></script></body></html>`;

// The tag a component is known by when its own file does not define it: the file beside it that registers it
// (Button.define('acme-button'), customElements.define('acme-button', Button)) after importing it.
export function registeredTag(file, stem) {
  const dir = file.replace(/[\\/][^\\/]+$/, '');
  const base = stem.replace(/\.component$/, '');
  for (const f of ['ts', 'js'].map((e) => join(dir, `${base}.${e}`))) {
    if (f === file || !existsSync(f)) continue;
    let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
    const m = /\.define\s*\(\s*['"]([a-z][a-z0-9]*-[a-z0-9-]*)['"]/.exec(t);
    if (m) return m[1];
  }
  return null;
}

// The harness for a project: its Lit components in their cases, drawn by its own Lit and served.
// → { url, close, groups, missing } or { url: null, why }.
export async function startLitHarness(ROOT, cfg, names = [], { propsSnap = {}, locate, max = cfg.a11y?.maxVariants ?? 16, surface = '#fff', ink = '#111' } = {}) {
  const pb = await litBuild(ROOT);
  if (pb.why) return { url: null, why: pb.why };
  const { harnessCases, variantsFromCode } = await import('./component-harness.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const { classKind } = await import('./class-components.mjs');
  const groups = [], missing = [];
  for (const name of names) {
    const file = locate?.(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
    if (classKind(file, text) !== 'lit') continue;
    const api = textComponentApi(file, text);
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const cases = fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(api, text, max);
    const stem = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/-./g, (m) => m[1].toUpperCase());
    groups.push({ name, slug: kebab(name), file: '/' + relative(ROOT, file).split(sep).join('/'), exportName: label, tag: api.tag ?? registeredTag(file, stem), cases,
      ...(api.slots?.default ? { content: label.replace(/([a-z])([A-Z])/g, '$1 $2') } : {}) });
  }
  if (!groups.length) return { url: null, why: 'no Lit component file for the design system\'s components' };

  const OUT = cfg.out ?? '.design-system-engine-out';
  const dir = join(ROOT, OUT, 'lit-harness');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  writeFileSync(entry, harnessModule(groups, globalStyles(ROOT, cfg)));

  let vite;
  try {
    vite = await pb.vite.createServer({
      root: ROOT, configFile: pb.config ? join(ROOT, pb.config) : false, plugins: pb.plugins,
      logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT, 'vite-cache-lit'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // Lit bundled once before the page loads, so every component shares one copy of it, with the packages the
      // project's own code imports.
      optimizeDeps: { include: [...(projectModule(ROOT, 'lit') ? ['lit'] : []), ...runtimeDeps(ROOT)] },
    });
  } catch (e) { return { url: null, why: `the project's Vite did not start (${String(e?.message ?? e).split('\n')[0]})` }; }

  const entryUrl = '/' + relative(ROOT, entry).split(sep).join('/');
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/__dse-lit-harness.html') {
      try { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(await vite.transformIndexHtml(req.url, page)); }
      catch (e) {
        console.error(`the harness page could not be built: ${String(e?.message ?? e).split('\n')[0]}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('the harness page could not be built');
      }
    }
    if (path === '/__dse-lit-entry.js') { req.url = entryUrl; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-lit-harness.html`, close, groups, missing };
}

// Each component drawn with the project's own Lit, read back as markup a page can show without running it: the host
// element with its shadow root kept as a declarative one (<template shadowrootmode="open">), the styles Lit adopted
// into it written inside it, so the style guide draws each case as Lit drew it. → { markup, cases, css, failed, why? }
export async function renderedLit(ROOT, cfg, names, { propsSnap = {}, locate, chromePath = null, max = 1 } = {}) {
  const none = (why) => ({ markup: {}, cases: {}, css: '', failed: [], why });
  if (typeof WebSocket === 'undefined') return none('Node 22 or later is needed to drive Chrome');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return none('Chrome not found (set CHROME_PATH)');
  const h = await startLitHarness(ROOT, cfg, names, { propsSnap, locate, max });
  if (!h.url) return none(h.why);
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-lit-' });
    cdp = await connectCDP(browser.wsUrl);
    const thrown = [];
    cdp.on('Runtime.exceptionThrown', (p) => thrown.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? ''));
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }))) {
      const first = thrown.map((t) => String(t).split('\n')[0]).filter(Boolean)[0];
      return none(`the page of its components did not finish within a minute${first ? ` (it threw: ${first.slice(0, 200)})` : ''}`);
    }
    const expr = `(() => {
      // Every open shadow root under a box, its adopted styles written into it as a <style>, so the markup carries them.
      const roots = (n, out = []) => { for (const e of n.querySelectorAll('*')) if (e.shadowRoot) { out.push(e.shadowRoot); roots(e.shadowRoot, out); } return out; };
      for (const r of roots(document.getElementById('dse-harness'))) {
        if (r.querySelector(':scope > style[data-dse-adopted]')) continue;
        const css = [...(r.adoptedStyleSheets || [])].map((s) => [...s.cssRules].map((x) => x.cssText).join('\\n')).join('\\n');
        if (css) { const st = document.createElement('style'); st.setAttribute('data-dse-adopted', ''); st.textContent = css; r.prepend(st); }
      }
      const html = (b) => (b.getHTML ? b.getHTML({ shadowRoots: roots(b) }) : b.innerHTML).replace(/<!--[\\s\\S]*?-->/g, '').trim();
      const cases = Object.fromEntries([...document.querySelectorAll('[data-dse-component]')].map((s) => [s.getAttribute('data-dse-component'), [...s.querySelectorAll('[data-dse-case]')].map((b) => ({ label: b.getAttribute('data-dse-case'), markup: html(b) })).filter((c) => c.markup)]));
      const css = [...document.querySelectorAll('style')].filter((s) => { const id = s.getAttribute('data-vite-dev-id'); return !!id && !/\\/lit-harness\\//.test(id); }).map((s) => s.textContent).join('\\n');
      return JSON.stringify({ cases, css, failed: window.__dseHarnessFailed || [] });
    })()`;
    const r = JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? '{}');
    const props = Object.fromEntries(h.groups.map((g) => [g.name, Object.fromEntries(g.cases.map((c) => [c.label, c.props]))]));
    const cases = Object.fromEntries(Object.entries(r.cases ?? {}).filter(([, l]) => l.length).map(([n, l]) => [n, l.map((c) => ({ ...c, props: props[n]?.[c.label] ?? {} }))]));
    const markup = Object.fromEntries(Object.entries(cases).filter(([n, l]) => l[0].label === h.groups.find((g) => g.name === n)?.cases[0]?.label).map(([n, l]) => [n, l[0].markup]));
    return { markup, cases, css: String(r.css ?? '').replace(/\/\*# sourceMappingURL=[^*]*\*\/\s*/g, ''), failed: r.failed ?? [], build: 'Vite' };
  } catch (e) { return none(String(e?.message ?? e).split('\n')[0]); }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } await h.close(); }
}
