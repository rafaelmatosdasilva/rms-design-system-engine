// angular-harness.mjs - the design system's own Angular components, drawn with the project's own Angular in a real
// browser.
//
// An Angular component is drawn only once Angular's compiler has turned its decorators, its template and its styles
// into code, so the project's own compiler (@angular/compiler-cli, the one `ng build` runs) compiles each component
// file ahead of time, with the project's own tsconfig, into a folder of the engine's output. The project's own Vite
// (the one its Angular builder, @angular/build, brings) serves the result, and the page draws each component in each
// of its cases, as react-harness.mjs and lit-harness.mjs do for React and Lit. Nothing of the engine's own is used to
// compile or render, and where there is no Angular, no compiler or no Vite it says so and draws nothing.
//
// Each case is a component created on an element its selector names (`acme-button`, `button[acmeButton]`), its values
// set as inputs by the names a template uses (ref.setInput('size', 'm')), as a team's own templates set them, and what
// a person puts in it projected where its <ng-content> takes it. A library the project imports that ships partly
// compiled (most Angular libraries) is finished in the page by the project's own @angular/compiler.
//
// The page is the one every check already reads: a section per component (`data-dse-component`), a box per case
// (`data-dse-case`), `window.__dseHarnessReady` when it has settled and `window.__dseHarnessFailed` for what could not
// be drawn. Its styles are the ones Angular writes into the page, scoped to each component by its own attributes, so
// the style guide keeps them beside the markup Angular drew.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectModule, globalStyles } from './vue-harness.mjs';
import { styleSpecifier } from './react-harness.mjs';
import { kebab, renderedHarness } from './lit-harness.mjs';

const lit = (v) => JSON.stringify(v).replace(/[<>\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const first = (e) => String(e?.message ?? e).split('\n')[0];

// The folder a package of the project's is installed in, or null.
const packageDir = (from, name) => {
  const dirs = createRequire(join(from, 'package.json')).resolve.paths(name) ?? [];
  const d = dirs.map((x) => join(x, name)).find((x) => existsSync(join(x, 'package.json')));
  return d ?? null;
};

// The project's Angular, the compiler that builds it and the Vite that serves it: { cli, vite, version, has } or { why }.
// Vite is the project's own, or the one its Angular builder installed for its own dev server.
export async function angularBuild(ROOT) {
  if (!projectModule(ROOT, '@angular/core')) {
    return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'))
      ? 'the project\'s packages are not installed (no node_modules), so its own Angular cannot draw its components'
      : 'the project has no Angular installed to draw its components with' };
  }
  const cliUrl = projectModule(ROOT, '@angular/compiler-cli');
  if (!cliUrl) return { why: 'the project has no Angular compiler (@angular/compiler-cli) to compile its components with (its own build tools are used, never the engine\'s)' };
  if (!projectModule(ROOT, '@angular/platform-browser')) return { why: 'the project has no @angular/platform-browser to draw its components in a page with' };
  const builder = packageDir(ROOT, '@angular/build');
  const viteUrl = projectModule(ROOT, 'vite') ?? (builder ? projectModule(builder, 'vite') : null);
  if (!viteUrl) return { why: 'the project has no Vite to serve its compiled Angular components with (none of its own, and no @angular/build that brings one)' };
  const version = JSON.parse(readFileSync(join(packageDir(ROOT, '@angular/core'), 'package.json'), 'utf8')).version;
  const has = (n) => !!packageDir(ROOT, n);
  return { cli: await import(cliUrl), vite: await import(viteUrl), version, has, label: 'Angular compiler and Vite' };
}

// The tsconfig the project's components are compiled with: the library's or the app's own, else the workspace's.
export function projectTsconfig(ROOT) {
  return ['tsconfig.lib.json', 'tsconfig.app.json', 'tsconfig.json'].map((f) => join(ROOT, f)).find((f) => existsSync(f)) ?? null;
}

// Each component file compiled ahead of time by the project's own Angular compiler, into `out`, with its template and
// styles inside it. A stylesheet in Sass is compiled by the project's own Sass, as its builder does.
// → { compiled: { [source file]: compiled file }, errors: [first lines], why? }
export async function compileAngular(ROOT, cli, files, out) {
  const tsconfig = projectTsconfig(ROOT);
  let base = {};
  if (tsconfig) {
    const c = cli.readConfiguration(tsconfig);
    // A tsconfig that cannot be read is said, rather than compiled with a guess at what it meant.
    const bad = (c.errors ?? []).filter((d) => d.category === 1);
    if (bad.length) return { compiled: {}, errors: [], why: `the project's ${relative(ROOT, tsconfig)} could not be read (${first(cli.formatDiagnostics(bad))})` };
    base = c.options;
  }
  rmSync(out, { recursive: true, force: true });
  const options = {
    ...base,
    outDir: out, rootDir: ROOT, noEmit: false, noEmitOnError: false, declaration: false, declarationMap: false, emitDeclarationOnly: false,
    sourceMap: false, inlineSourceMap: false, composite: false, incremental: false, tsBuildInfoFile: undefined,
    // Modules a browser loads, every component compiled in full (a library's own settings may ask for partial).
    module: 7 /* ES2022 */, compilationMode: 'full', skipLibCheck: true,
  };
  const host = cli.createCompilerHost({ options });
  // Its templates and stylesheets read as the Angular CLI's host reads them, so the compiler loads them before it
  // analyses, which it must for a stylesheet it hands back to be compiled.
  host.readResource = (f) => readFileSync(f, 'utf8');
  if (packageDir(ROOT, 'sass')) {
    const sass = await import(projectModule(ROOT, 'sass'));
    const compile = sass.compileString ?? sass.default?.compileString;
    if (compile) host.transformResource = async (data, ctx) => {
      if (ctx.type !== 'style' || !/\.s[ac]ss$/i.test(ctx.resourceFile ?? '')) return null;
      const r = compile(data, { url: pathToFileURL(ctx.resourceFile), loadPaths: [dirname(ctx.resourceFile), ROOT, join(ROOT, 'node_modules')], syntax: /\.sass$/i.test(ctx.resourceFile) ? 'indented' : 'scss', quietDeps: true, silenceDeprecations: ['import'] });
      return { content: r.css };
    };
  }
  let program;
  try {
    program = new cli.NgtscProgram(files, options, host);
    await program.loadNgStructureAsync();
  } catch (e) { return { compiled: {}, errors: [], why: `the project's Angular compiler stopped (${first(e)})` }; }
  const diags = [...program.getTsSyntacticDiagnostics(), ...program.getNgStructuralDiagnostics(), ...program.getNgSemanticDiagnostics()].filter((d) => d.category === 1);
  let emitted;
  try { emitted = program.emit(); } catch (e) { return { compiled: {}, errors: [], why: `the project's Angular compiler stopped (${first(e)})` }; }
  const errors = [...diags, ...(emitted.diagnostics ?? []).filter((d) => d.category === 1)].map((d) => first(cli.formatDiagnostics([d])).replace(/^.*?error /, '')).filter(Boolean);
  const compiled = {};
  for (const f of files) {
    const js = join(out, relative(ROOT, f)).replace(/\.m?ts$/, '.js');
    if (existsSync(js)) compiled[f] = js;
  }
  return { compiled, errors, ...(Object.keys(compiled).length ? {} : { why: `the project's Angular compiler wrote nothing${errors[0] ? ` (${errors[0]})` : ''}` }) };
}

// The packages a compiled file imports by name, read from its import and export lines.
export function bareImports(file) {
  let t; try { t = readFileSync(file, 'utf8'); } catch { return []; }
  return [...t.matchAll(/(?:^|[\s;])(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?['"]([^'"./][^'"]*)['"]/g)].map((m) => m[1]);
}

// The module the page loads: Angular started once, each component created in each of its cases into its own box.
// `zone` is how changes are seen: without zone.js where Angular offers that, else with the project's zone.js.
export function harnessModule(groups = [], styles = [], { compiler = true, zone = 'zoneless' } = {}) {
  return `${compiler ? 'import "@angular/compiler";\n' : ''}${zone === 'zone.js' ? 'import "zone.js";\n' : ''}${styles.map((s) => `import ${lit(styleSpecifier(s))};`).join('\n')}
import * as core from "@angular/core";
import { createApplication } from "@angular/platform-browser";
const GROUPS = ${lit(groups)};
const LOAD = {${[...new Set(groups.map((g) => g.file))].map((f) => `${lit(f)}: () => import(${lit(f)})`).join(', ')}};
const main = document.getElementById('dse-harness');
const failed = [];
const why1 = (e) => String(e && e.message || e).split('\\n')[0];
// The component class a file exports: the one named as the component, else the default, else the only one.
const isComponent = (v) => typeof v === 'function' && !!v.ɵcmp;
const pick = (m, want) => {
  const w = String(want).toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = Object.entries(m).find(([k, v]) => isComponent(v) && [w, w + 'component'].includes(k.toLowerCase()));
  if (named) return named[1];
  if (isComponent(m.default)) return m.default;
  const only = Object.values(m).filter(isComponent);
  return only.length === 1 ? only[0] : null;
};
// The element its selector names: its first selector's tag (a div where it names only attributes) and attributes.
const hostFor = (selector) => {
  const s = String(selector || '').split(',')[0].trim().split(/\\s+/)[0].replace(/:not\\([^)]*\\)/g, '');
  const tag = (/^[a-zA-Z][\\w-]*/.exec(s) || ['div'])[0];
  const el = document.createElement(tag);
  for (const m of s.matchAll(/\\[([\\w-]+)(?:=["']?([^"'\\]]*)["']?)?\\]/g)) el.setAttribute(m[1], m[2] ?? '');
  for (const m of s.matchAll(/\\.([\\w-]+)/g)) el.classList.add(m[1]);
  return el;
};
const settle = () => new Promise((done) => {
  let t = null;
  const fin = () => { mo.disconnect(); clearTimeout(t); done(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); });
  mo.observe(main, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(fin, 400); setTimeout(fin, 8000);
});
const empty = (el) => !(el.shadowRoot && (el.shadowRoot.querySelector('*') || el.shadowRoot.textContent.trim())) && !el.children.length && !el.textContent.trim();
// What Angular reports through its error handler is the case's error, as a thrown one is.
let thrown = null;
const handler = { handleError: (e) => { thrown = thrown || e; } };
addEventListener('error', (e) => { thrown = thrown || e.error || e.message; });
const zoneless = core.provideZonelessChangeDetection || core.provideExperimentalZonelessChangeDetection;
let app = null;
try {
  app = await createApplication({ providers: [...(${zone === 'zoneless'} && zoneless ? [zoneless()] : []), { provide: core.ErrorHandler, useValue: handler }] });
} catch (e) { failed.push({ name: 'Angular', why: 'Angular did not start: ' + why1(e) }); }
const drawn = [];
for (const g of app ? GROUPS : []) {
  const sec = document.createElement('section');
  sec.setAttribute('data-dse-component', g.name);
  sec.setAttribute('aria-label', g.name);
  main.append(sec);
  let C = null;
  try { C = pick(await LOAD[g.file](), g.exportName); }
  catch (e) { failed.push({ name: g.name, why: why1(e) }); continue; }
  if (!C) { failed.push({ name: g.name, why: 'no Angular component class exported' }); continue; }
  const mirror = core.reflectComponentType(C);
  const inputs = new Set((mirror?.inputs ?? []).map((i) => i.templateName));
  for (const c of g.cases) {
    const box = document.createElement('div');
    box.className = 'dse-case';
    box.setAttribute('data-dse-case', c.label);
    sec.append(box);
    const d = { g, c, box, el: null, err: null };
    drawn.push(d);
    try {
      thrown = null;
      const el = hostFor(mirror?.selector || g.tag);
      box.append(el);
      const props = c.props ?? {};
      // What a person puts in it, where its <ng-content> takes it, when the case gives no text of its own.
      const given = Object.keys(props).some((k) => /^(label|text|content|children)$/i.test(k) && inputs.has(k));
      const projectableNodes = (mirror?.ngContentSelectors ?? []).map((s) => (s === '*' && g.content && !given ? [document.createTextNode(g.content)] : []));
      if (projectableNodes.some((n) => n.length)) el.setAttribute('data-dse-content', '');
      const ref = core.createComponent(C, { environmentInjector: app.injector, hostElement: el, projectableNodes });
      // Each value as an input, by the name a template sets it by. A name with a dash is an attribute only (aria-label).
      for (const [k, v] of Object.entries(props)) {
        if (inputs.has(k)) ref.setInput(k, v);
        else if (k.includes('-')) { if (v === true) el.setAttribute(k, ''); else if (v != null && v !== false) el.setAttribute(k, String(v)); }
      }
      app.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
      d.el = el;
      d.ref = ref;
      if (thrown) d.err = thrown;
    } catch (e) { d.err = e; }
  }
}
if (app && app.whenStable) await Promise.race([app.whenStable(), new Promise((r) => setTimeout(r, 4000))]);
await settle();
for (const d of drawn) {
  const at = { name: d.g.name + ' (' + d.c.label + ')', component: d.g.name, case: d.c.label, of: d.g.cases.length };
  if (d.err) failed.push({ ...at, why: why1(d.err) });
  else if (!d.el || empty(d.el)) failed.push({ ...at, nothing: true, why: 'drew nothing with the inputs it was given (a closed overlay, or content it needs and was not given)' });
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
`;
}

export const PAGE = (surface = '#fff', ink = '#111') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Components</title>
<style data-dse-page>body{margin:0;background:${surface};color:${ink};font:14px system-ui,sans-serif}main{padding:16px;display:flex;flex-direction:column;gap:16px}section{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}</style>
</head><body><main id="dse-harness"></main><script type="module" src="/__dse-angular-entry.js"></script></body></html>`;

// The harness for a project: its Angular components in their cases, compiled by its own compiler, drawn by its own
// Angular and served. → { url, close, groups, missing, errors } or { url: null, why }.
export async function startAngularHarness(ROOT, cfg, names = [], { propsSnap = {}, locate, max = cfg.a11y?.maxVariants ?? 16, surface = '#fff', ink = '#111' } = {}) {
  const pb = await angularBuild(ROOT);
  if (pb.why) return { url: null, why: pb.why };
  const { harnessCases, variantsFromCode } = await import('./component-harness.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const { classKind } = await import('./class-components.mjs');
  const wanted = [], missing = [];
  for (const name of names) {
    const file = locate?.(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
    if (classKind(file, text) !== 'angular') continue;
    const api = textComponentApi(file, text);
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const cases = fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(api, text, max);
    const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/-./g, (m) => m[1].toUpperCase());
    const cls = /export\s+(?:default\s+)?class\s+([A-Z]\w*)/.exec(text)?.[1] ?? label;
    wanted.push({ name, source: file, exportName: cls, tag: api.tag ?? null, cases,
      ...(api.slots?.default ? { content: label.replace(/([a-z])([A-Z])/g, '$1 $2') } : {}) });
  }
  if (!wanted.length) return { url: null, why: 'no Angular component file for the design system\'s components' };

  const OUT = cfg.out ?? '.design-system-engine-out';
  const dir = join(ROOT, OUT, 'angular-harness');
  const built = await compileAngular(ROOT, pb.cli, [...new Set(wanted.map((w) => w.source))], join(dir, 'compiled'));
  if (built.why) return { url: null, why: built.why };
  const groups = [];
  for (const w of wanted) {
    const js = built.compiled[w.source];
    if (!js) { missing.push(`${w.name} (the compiler wrote nothing for it)`); continue; }
    const { source, ...g } = w;
    groups.push({ ...g, slug: kebab(w.name), file: '/' + relative(ROOT, js).split(sep).join('/'), from: '/' + relative(ROOT, source).split(sep).join('/') });
  }
  if (!groups.length) return { url: null, why: `the project's Angular compiler wrote none of its components${built.errors[0] ? ` (${built.errors[0]})` : ''}` };

  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  const major = Number(String(pb.version).split('.')[0]);
  // Without zone.js from Angular 18 on, where Angular offers it; before that, the project's own zone.js.
  const zone = major >= 18 ? 'zoneless' : pb.has('zone.js') ? 'zone.js' : 'zoneless';
  writeFileSync(entry, harnessModule(groups, globalStyles(ROOT, cfg), { compiler: pb.has('@angular/compiler'), zone }));

  // Angular, and every package the compiled components import (a library such as Angular Material among them),
  // bundled once before the page loads. A package Vite came across only once the page asked for it would be bundled
  // on its own, Angular's core with it a second time, and two copies of Angular draw nothing.
  const deps = [...new Set(['@angular/core', '@angular/common', '@angular/platform-browser', '@angular/compiler', 'zone.js', ...Object.values(built.compiled).flatMap(bareImports)])]
    .filter((n) => pb.has(n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : n.split('/')[0]));
  let vite;
  try {
    vite = await pb.vite.createServer({
      root: ROOT, configFile: false, logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT, 'vite-cache-angular'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      optimizeDeps: { entries: [], include: deps },
    });
  } catch (e) { return { url: null, why: `the project's Vite did not start (${first(e)})` }; }

  const entryUrl = '/' + relative(ROOT, entry).split(sep).join('/');
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/__dse-angular-harness.html') {
      try { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(await vite.transformIndexHtml(req.url, page)); }
      catch (e) {
        console.error(`the harness page could not be built: ${first(e)}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('the harness page could not be built');
      }
    }
    if (path === '/__dse-angular-entry.js') { req.url = entryUrl; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-angular-harness.html`, close, groups, missing, errors: built.errors };
}

// The styles Angular wrote into the page for its components: every style in the head the page did not start with
// and Vite did not serve. Angular marks them with nothing, a library's unscoped ones (Angular Material's) beside the
// ones it scopes to a component by the attributes it gives it.
const ANGULAR_CSS = `[...document.querySelectorAll('head style')].filter((s) => !s.hasAttribute('data-dse-page') && !s.hasAttribute('data-vite-dev-id')).map((s) => s.textContent).join('\\n')`;

// Each component drawn with the project's own Angular, read back as markup a page can show without running it, with
// the styles Angular scoped to it. → { markup, cases, css, failed, why? }
export async function renderedAngular(ROOT, cfg, names, { propsSnap = {}, locate, chromePath = null, max = 1 } = {}) {
  return renderedHarness(() => startAngularHarness(ROOT, cfg, names, { propsSnap, locate, max }), { chromePath, tmpPrefix: 'dse-angular-', css: ANGULAR_CSS, build: 'Angular compiler' });
}
