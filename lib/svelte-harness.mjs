// svelte-harness.mjs - the design system's own Svelte components, drawn with the project's own Svelte in a real browser.
//
// The engine reads a Svelte component's file (its props, its styles, the element it renders), and that is all a Svelte
// system got: the checks that measure what is drawn (accessibility, behaviours, the style guide's own drawing) need the
// component in a browser. So the project's own Vite and Svelte (its @sveltejs/vite-plugin-svelte, its svelte.config.js)
// build each component file as they do for its own pages, and the page draws each component in each of its cases, as
// vue-harness.mjs, react-harness.mjs and lit-harness.mjs do for theirs. Nothing of the engine's own renders, and where
// the project has no Svelte, no Vite or no Svelte plugin for Vite, it says so and draws nothing.
//
// Svelte 5 mounts a component with mount() and takes its content as a snippet (children); Svelte 3 and 4 make one with
// `new Component({ target, props })`. The page asks the project's own Svelte which it has and does what that one does.
// A SvelteKit project's own Vite config starts its router, so it is never loaded: the components are built with the
// project's Svelte plugin alone, its svelte.config.js read by that plugin as it always is, and $lib pointed at src/lib.
//
// The page is the one every check already reads: a section per component (`data-dse-component`), a box per case
// (`data-dse-case`), `window.__dseHarnessReady` when it has settled and `window.__dseHarnessFailed` for what could not
// be drawn.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';
import { projectModule, globalStyles, runtimeDeps } from './vue-harness.mjs';
import { styleSpecifier } from './react-harness.mjs';
import { renderedHarness, kebab } from './lit-harness.mjs';

// The project's Svelte, the Vite that builds it and its Svelte plugin for Vite: { vite, plugins } or { why }.
export async function svelteBuild(ROOT) {
  if (!projectModule(ROOT, 'svelte')) {
    return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'))
      ? 'the project\'s packages are not installed (no node_modules), so its own Svelte cannot draw its components'
      : 'the project has no Svelte installed to draw its components with' };
  }
  const viteUrl = projectModule(ROOT, 'vite');
  if (!viteUrl) return { why: 'the project has no Vite to build its Svelte components with (its own build tools are used, never the engine\'s)' };
  const pluginUrl = projectModule(ROOT, '@sveltejs/vite-plugin-svelte');
  if (!pluginUrl) return { why: 'the project has no Svelte plugin for Vite (@sveltejs/vite-plugin-svelte) to build its components with' };
  const { svelte } = await import(pluginUrl);
  return { kind: 'vite', label: 'Vite', vite: await import(viteUrl), plugins: [svelte()] };
}

const lit = (v) => JSON.stringify(v).replace(/[<>\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// The module the page loads: each component file imported and mounted, each case into its own box.
export function harnessModule(groups = [], styles = []) {
  return `${styles.map((s) => `import ${lit(styleSpecifier(s))};`).join('\n')}
import * as Svelte from 'svelte';
const GROUPS = ${lit(groups)};
const LOAD = {${[...new Set(groups.map((g) => g.file))].map((f) => `${lit(f)}: () => import(${lit(f)})`).join(', ')}};
const main = document.getElementById('dse-harness');
const failed = [];
const why1 = (e) => String(e && e.message || e).split('\\n')[0];
// Svelte 5 mounts with mount(), and takes its content as a snippet; Svelte 3 and 4 make the component with new.
const mountOne = (C, target, props) => (typeof Svelte.mount === 'function' ? Svelte.mount(C, { target, props }) : new C({ target, props }));
const words = (text) => (typeof Svelte.createRawSnippet === 'function' ? Svelte.createRawSnippet(() => ({ render: () => '<span>' + String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) + '</span>' })) : null);
const settle = () => new Promise((done) => {
  let t = null;
  const fin = () => { mo.disconnect(); clearTimeout(t); done(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); });
  mo.observe(main, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(fin, 400); setTimeout(fin, 8000);
});
const empty = (box) => !box.querySelector('*') && !box.textContent.trim();
const drawn = [];
let thrown = null;
addEventListener('error', (e) => { thrown = e.error || e.message; });
for (const g of GROUPS) {
  const sec = document.createElement('section');
  sec.setAttribute('data-dse-component', g.name);
  sec.setAttribute('aria-label', g.name);
  main.append(sec);
  let C = null;
  try { C = (await LOAD[g.file]()).default; }
  catch (e) { failed.push({ name: g.name, why: why1(e) }); continue; }
  if (typeof C !== 'function') { failed.push({ name: g.name, why: 'its file exports no component' }); continue; }
  for (const c of g.cases) {
    const box = document.createElement('div');
    box.className = 'dse-case';
    box.setAttribute('data-dse-case', c.label);
    sec.append(box);
    const d = { g, c, box, err: null };
    drawn.push(d);
    try {
      thrown = null;
      const props = { ...(c.props ?? {}) };
      // What a person puts in it, where it holds content and the case gives none: its name, so a button says something.
      if (g.content && !Object.keys(props).some((k) => /^(label|text|content|children)$/i.test(k))) { const s = words(g.content); if (s) { props.children = s; box.setAttribute('data-dse-content', ''); } }
      mountOne(C, box, props);
      if (typeof Svelte.flushSync === 'function') Svelte.flushSync();
      if (thrown) d.err = thrown;
    } catch (e) { d.err = e; }
  }
}
await settle();
for (const d of drawn) {
  const at = { name: d.g.name + ' (' + d.c.label + ')', component: d.g.name, case: d.c.label, of: d.g.cases.length };
  if (d.err) failed.push({ ...at, why: why1(d.err) });
  else if (empty(d.box)) failed.push({ ...at, nothing: true, why: 'drew nothing with the props it was given (a closed overlay, or content it needs and was not given)' });
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
`;
}

export const PAGE = (surface = '#fff', ink = '#111') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Components</title>
<style>body{margin:0;background:${surface};color:${ink};font:14px system-ui,sans-serif}main{padding:16px;display:flex;flex-direction:column;gap:16px}section{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}</style>
</head><body><main id="dse-harness"></main><script type="module" src="/__dse-svelte-entry.js"></script></body></html>`;

// The harness for a project: its Svelte components in their cases, drawn by its own Svelte and served.
// → { url, close, groups, missing, build } or { url: null, why }.
export async function startSvelteHarness(ROOT, cfg, names = [], { propsSnap = {}, locate, max = cfg.a11y?.maxVariants ?? 16, surface = '#fff', ink = '#111' } = {}) {
  const { harnessCases, variantsFromCode } = await import('./component-harness.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const groups = [], missing = [];
  for (const name of names) {
    const file = locate?.(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    if (!/\.svelte$/i.test(file)) continue;
    let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const api = textComponentApi(file, text);
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const cases = fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(api, text, max);
    const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/-./g, (m) => m[1].toUpperCase());
    groups.push({ name, slug: kebab(name), file: '/' + relative(ROOT, file).split(sep).join('/'), cases,
      ...(api.slots?.default ? { content: label.replace(/([a-z])([A-Z])/g, '$1 $2') } : {}) });
  }
  if (!groups.length) return { url: null, why: 'no Svelte component file for the design system\'s components' };
  const pb = await svelteBuild(ROOT);
  if (pb.why) return { url: null, why: pb.why };

  const OUT = cfg.out ?? '.design-system-engine-out';
  const dir = join(ROOT, OUT, 'svelte-harness');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  writeFileSync(entry, harnessModule(groups, globalStyles(ROOT, cfg)));

  let vite;
  try {
    vite = await pb.vite.createServer({
      root: ROOT, configFile: false, plugins: pb.plugins,
      logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT, 'vite-cache-svelte'),
      // SvelteKit's own alias for a system's library folder, where a project has one.
      ...(existsSync(join(ROOT, 'src', 'lib')) ? { resolve: { alias: { $lib: join(ROOT, 'src', 'lib') } } } : {}),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // Svelte bundled once before the page loads, so every component shares one copy of it, with the packages the
      // project's own code imports.
      optimizeDeps: { include: runtimeDeps(ROOT) },
    });
  } catch (e) { return { url: null, why: `the project's Vite did not start (${String(e?.message ?? e).split('\n')[0]})` }; }

  const entryUrl = '/' + relative(ROOT, entry).split(sep).join('/');
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/__dse-svelte-harness.html') {
      try { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(await vite.transformIndexHtml(req.url, page)); }
      catch (e) {
        console.error(`the harness page could not be built: ${String(e?.message ?? e).split('\n')[0]}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('the harness page could not be built');
      }
    }
    if (path === '/__dse-svelte-entry.js') { req.url = entryUrl; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-svelte-harness.html`, close, groups, missing, build: pb.label };
}

// Each component drawn with the project's own Svelte, read back as markup a page can show without running it, with the
// styles the project's Svelte scoped to it. → { markup, cases, css, failed, why? }
export async function renderedSvelte(ROOT, cfg, names, { propsSnap = {}, locate, chromePath = null, max = 1 } = {}) {
  return renderedHarness(() => startSvelteHarness(ROOT, cfg, names, { propsSnap, locate, max }), { chromePath, tmpPrefix: 'dse-svelte-', build: 'Vite' });
}
