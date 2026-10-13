// vue-harness.mjs - the design system's own Vue components, rendered with the project's own build tools in a real
// browser: each single-file component in each of its variants on one page, so the accessibility check tries what a
// person would (a click, a key, a name read out) on the code that ships, and the style guide draws what it renders.
//
// The project's own build does the work, once its packages are installed, whichever it is: Vite (its config, plugins,
// aliases, the SCSS its components share), Nuxt (its whole app: its modules, auto-imports and components, the page
// replaced by the components), Vue CLI (its webpack config as vue.config.js shapes it) or webpack with vue-loader (its
// webpack.config). A project with no Vite config but Vite and @vitejs/plugin-vue installed gets that plugin, as a new
// Vue project has it. What it lacks is said, never worked around with a build of the engine's.
// The variants are Figma's when it has the component, else the code's own props (component-harness.mjs variantsFromCode).
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { OUT_DIR } from './names.mjs';

// A package of the project, as an ES module it exports for import (its "exports" import entry, else "module" or "main").
function projectModule(ROOT, name) {
  // Its folder in the node_modules the project resolves from (a package need not export its package.json).
  const dirs = createRequire(join(ROOT, 'package.json')).resolve.paths(name) ?? [];
  const pkgFile = dirs.map((d) => join(d, name, 'package.json')).find((f) => existsSync(f));
  if (!pkgFile) return null;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const pick = (x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? pick(x.import ?? x.default ?? x.node) : null);
  const entry = pick(pkg.exports?.['.'] ?? pkg.exports) ?? pkg.module ?? pkg.main ?? 'index.js';
  return pathToFileURL(join(dirname(pkgFile), entry)).href;
}

// The project's Vite and what it renders Vue with: { vite, plugins, config } or { why }.
async function projectVite(ROOT, config) {
  const viteUrl = projectModule(ROOT, 'vite');
  if (!viteUrl) return { why: 'the project has no Vite to build its Vue components with (its own build tools are used, never the engine\'s)' };
  let plugins = [];
  if (!config) {
    const vueUrl = projectModule(ROOT, '@vitejs/plugin-vue');
    if (!vueUrl) return { why: 'the project has no Vite config and no @vitejs/plugin-vue to read its .vue files with' };
    plugins = [(await import(vueUrl)).default()];
  }
  return { kind: 'vite', label: 'Vite', vite: await import(viteUrl), plugins, config };
}

// The project's own build for its Vue components, from its config files and its package.json, in this order: Nuxt
// (nuxt.config), Vite (vite.config), Vue CLI (vue.config.js, or @vue/cli-service), webpack (webpack.config), else Vite
// with @vitejs/plugin-vue installed. → { kind, label, … } or { why }.
export async function projectBuild(ROOT) {
  if (!projectModule(ROOT, 'vue')) return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules')) ? 'the project\'s packages are not installed (no node_modules): install them (npm install, or the project\'s package manager), then run again' : 'the project has no vue package installed' };
  let deps = {};
  try { const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); deps = { ...pkg.dependencies, ...pkg.devDependencies }; } catch { /* no package.json */ }
  const configOf = (base) => ['.ts', '.mts', '.js', '.mjs', '.cjs'].map((e) => base + e).find((f) => existsSync(join(ROOT, f))) ?? null;
  const req = createRequire(join(ROOT, 'package.json'));
  const where = (spec) => { try { return req.resolve(spec); } catch { return null; } };
  const nuxt = configOf('nuxt.config');
  if (nuxt || deps.nuxt) {
    const kit = where('nuxt/kit');
    return kit ? { kind: 'nuxt', label: 'Nuxt', kit: pathToFileURL(kit).href } : { why: `the project is a Nuxt app${nuxt ? ` (${nuxt})` : ''} with no nuxt package installed to build it with` };
  }
  const vite = configOf('vite.config');
  if (vite) return projectVite(ROOT, vite);
  if (configOf('vue.config') || deps['@vue/cli-service']) {
    const cli = where('@vue/cli-service/package.json');
    return cli ? { kind: 'webpack', label: 'Vue CLI', cli: dirname(cli) } : { why: 'the project is a Vue CLI app with no @vue/cli-service installed to build it with' };
  }
  const webpack = configOf('webpack.config');
  if (webpack) return where('webpack') ? { kind: 'webpack', label: 'webpack', config: webpack } : { why: `the project has a ${webpack} but no webpack installed to build it with` };
  if (projectModule(ROOT, 'vite')) return projectVite(ROOT, null);
  return { why: 'the project has no build tool to render its Vue components with (Vite, Nuxt, Vue CLI or webpack: its own are used, never the engine\'s)' };
}

// The global stylesheets the project's own entry loads (src/main.ts importing './styles/main.scss'), and its token CSS.
export function globalStyles(ROOT, cfg = {}) {
  const out = new Set([cfg.paths?.themeCSS].flat().filter((f) => f && !/^https?:/.test(f)).map((f) => '/' + String(f).replace(/^\.?\//, '')));
  for (const entry of ['src/main.ts', 'src/main.js', 'src/main.mts', 'main.ts', 'main.js']) {
    let text = ''; try { text = readFileSync(join(ROOT, entry), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+\.(?:css|scss|sass|less))['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('.')) out.add('/' + relative(ROOT, join(ROOT, dirname(entry), spec)).split('\\').join('/'));
      else out.add(spec);   // a package's stylesheet, or an alias the project's Vite resolves
    }
    break;
  }
  return [...out];
}

// What the project's app gives its components that a component may need to render at all: a Pinia store and a router,
// each when the project's package.json lists it and it is installed (its own copy, never the engine's).
// → { pinia, router } (booleans).
export function appPlugins(ROOT) {
  let deps = {};
  try { const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }; } catch { /* no package.json */ }
  const has = (name) => Boolean(deps[name]) && Boolean(projectModule(ROOT, name));
  return { pinia: has('pinia'), router: has('vue-router') };
}

// The page's module: each component imported by its own path, mounted once per variant in a box that names it
// (data-dse-component, data-dse-case), and given back what it reports, as the page that uses it would: an
// update:<prop> event sets that prop, a toggle's click flips the state it was told. plugins (appPlugins): each instance
// gets a Pinia of its own and a router on a page of its own, from the project's packages, unless the project's app
// (Nuxt's) already gives them.
export function harnessModule(groups, styles = [], plugins = {}) {
  return `${styles.map((s) => `import ${JSON.stringify(s)};`).join('\n')}
import { createApp, h, reactive } from 'vue';
${plugins.pinia ? "import { createPinia } from 'pinia';\n" : ''}${plugins.router ? "import { createRouter, createMemoryHistory } from 'vue-router';\n" : ''}const GROUPS = ${JSON.stringify(groups.map(({ name, role, cases, options }) => ({ name, role, cases, options: options ?? {} }))).replace(/</g, '\\u003c')};
const LOAD = {
${groups.map((g) => `  ${JSON.stringify(g.name)}: () => import(${JSON.stringify(g.file)}),`).join('\n')}
};
const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const STATE = ['pressed', 'selected', 'checked', 'expanded', 'open', 'on', 'modelvalue', 'value'];
const BY_ROLE = { togglebutton: ['pressed'], toggle: ['pressed'], checkbox: ['checked'], switch: ['checked'], disclosure: ['expanded'], accordion: ['expanded'], tab: ['selected'] };
// The props the component declares, each given the variant's value (Figma's names matched to the code's, a value
// written as the code's own option writes it, Success as success; True and False as booleans for a Boolean prop); an
// aria- attribute the page adds falls through to its root.
function fit(C, props, role, options) {
  const decl = Array.isArray(C.props) ? Object.fromEntries(C.props.map((k) => [k, {}])) : (C.props || {});
  const out = {};
  for (const [d, spec] of Object.entries(decl)) {
    const hit = Object.keys(props).find((k) => squash(k) === squash(d));
    const types = [].concat(spec && spec.type || spec || []);
    if (hit !== undefined) {
      let v = props[hit];
      if (types.includes(Boolean) && typeof v === 'string') v = /^(true|yes|on)$/i.test(v);
      const own = (options[d] || []).find((o) => squash(o) === squash(v));
      out[d] = own !== undefined ? own : v;
    }
    else if ((BY_ROLE[role] || []).includes(squash(d))) out[d] = false;
  }
  for (const [k, v] of Object.entries(props)) if (/^aria-/.test(k)) out[k] = v;
  return out;
}
function listeners(C, state) {
  const emits = Array.isArray(C.emits) ? C.emits : Object.keys(C.emits || {});
  const told = Object.keys(state).filter((k) => STATE.includes(squash(k)));
  const apply = (a) => {
    const v = a && typeof a === 'object' && 'target' in a ? (a.type === 'click' ? undefined : a.target.value) : a;
    for (const k of told) {
      if (typeof v === 'boolean') state[k] = v;
      else if (v == null && typeof state[k] === 'boolean') state[k] = !state[k];
      else if (v != null && typeof v !== 'boolean' && !(typeof state[k] === 'boolean')) state[k] = typeof state[k] === 'number' ? Number(v) : v;
    }
  };
  const on = {};
  for (const e of emits) {
    if (e.startsWith('update:')) { const k = Object.keys(state).find((x) => squash(x) === squash(e.slice(7))); if (k) on['onUpdate:' + e.slice(7)] = (v) => { state[k] = v; }; }
    else if (/^(change|toggle|click|input|select)$/.test(e) && !emits.some((x) => x.startsWith('update:'))) on['on' + e[0].toUpperCase() + e.slice(1)] = apply;
  }
  if (!emits.length && told.length) on.onClick = apply;   // a click that reaches its root: the page flips what it told it
  return on;
}
// Inside an app of the project's (Nuxt's), each instance gets what that app gives its own (its plugins, router,
// global components), as it would on one of its pages.
const PARENT = window.__dseParentApp || null;
const inherit = (app) => {
  if (!PARENT) return;
  for (const k of ['provides', 'components', 'directives']) Object.assign(app._context[k], PARENT._context[k]);
  Object.assign(app.config.globalProperties, PARENT.config.globalProperties);
  if (PARENT.$nuxt) app.$nuxt = PARENT.$nuxt;
};
const main = document.getElementById('dse-harness');
const failed = [];
(async () => {
for (const g of GROUPS) {
  const sec = document.createElement('section'); sec.setAttribute('data-dse-component', g.name); sec.setAttribute('aria-label', g.name); main.append(sec);
  let C = null;
  try { C = (await LOAD[g.name]()).default; } catch (e) { failed.push({ name: g.name, why: String(e && e.message || e).split('\\n')[0] }); continue; }
  if (!C) { failed.push({ name: g.name, why: 'no component exported' }); continue; }
  for (const c of g.cases) {
    const box = document.createElement('div'); box.className = 'dse-case'; box.setAttribute('data-dse-case', c.label); sec.append(box);
    const state = reactive(fit(C, c.props, g.role, g.options));
    const app = createApp({ render: () => h(C, { ...state, ...listeners(C, state) }) });
    app.config.errorHandler = (e) => failed.push({ name: g.name + ' (' + c.label + ')', why: String(e && e.message || e).split('\\n')[0] });
    app.config.warnHandler = () => {};
    inherit(app);
${plugins.pinia ? "    if (!app.config.globalProperties.$pinia) app.use(createPinia());\n" : ''}${plugins.router ? "    if (!app.config.globalProperties.$router) app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] }));\n" : ''}    try { app.mount(box); } catch (e) { failed.push({ name: g.name + ' (' + c.label + ')', why: String(e && e.message || e).split('\\n')[0] }); }
  }
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
})();
`;
}

// The page around the module: the system's own surface and text colour (pageColours), no motion.
const PAGE_STYLE = (surface, ink) => `body{margin:0;padding:16px;font-family:Inter,system-ui,sans-serif;${surface ? `background:var(${surface});` : ''}${ink ? `color:var(${ink});` : ''}}.dse-case{display:block;margin:0 0 12px}*,*::before,*::after{transition:none!important;animation:none!important}`;
const PAGE = (surface, ink, { head = '', script = `<script type="module" src="/${OUT_DIR}/vue-harness/entry.js"></script>`, lang = 'en' } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Components</title>
<style data-dse-page>${PAGE_STYLE(surface, ink)}</style>${head}</head>
<body><main id="dse-harness"><h1>Components</h1></main>
${script}</body></html>`;

// The message of an error, its first line.
const why1 = (e) => String(e?.message ?? e).split('\n')[0];

// The harness for a project: its Vue components (a .vue file each) in their variants, served by its own build.
// names: the components to render; locate(name) → its file; read(file) → its text.
// → { url, close (a promise once it has stopped), groups, missing: [why], build: 'Vite' | 'Nuxt' | 'Vue CLI' |
// 'webpack' }, or { url: null, why } when nothing can be rendered.
export async function startVueHarness(ROOT, cfg, names, { propsSnap = {}, locate, read = (f) => readFileSync(f, 'utf8'), max = cfg.a11y?.maxVariants ?? 16 } = {}) {
  const groups = [], missing = [];
  const { harnessCases, variantsFromCode, pageColours } = await import('./component-harness.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  for (const name of names) {
    const file = locate(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    if (!/\.vue$/.test(file)) continue;
    const role = String((propsSnap[name]?.annotations ?? []).map((a) => a?.label ?? '').join(' ').match(/\brole\s*[:=]\s*["']?([a-z][\w-]*)/i)?.[1] ?? '').toLowerCase();
    const named = /^(textbox|textfield|textinput|input|field|searchbox|spinbutton|stepper|numberinput|slider|combobox|listbox|select)$/.test(role);
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    let text = ''; try { text = read(file); } catch { /* unreadable: Figma's variants only */ }
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const api = textComponentApi(file, text);
    const cases = (fromFigma ? harnessCases(propsSnap[name], max) : variantsFromCode(api, text, max)).map((c) => (named ? { ...c, props: { 'aria-label': label, ...c.props } } : c));
    const options = Object.fromEntries(Object.entries(api.props ?? {}).filter(([, d]) => d.options?.length).map(([k, d]) => [k, d.options]));
    groups.push({ name, file: resolve(ROOT, file), role, cases, options, from: fromFigma ? 'figma' : 'code' });
  }
  if (!groups.length) return { url: null, why: 'no Vue component file (.vue) for the design system\'s components' };
  const pb = await projectBuild(ROOT);
  if (!pb.kind) return { url: null, why: pb.why };
  // The page's module beside the engine's other output, where the project's build serves it from.
  const dir = join(ROOT, OUT_DIR, 'vue-harness');
  mkdirSync(dir, { recursive: true });
  const themes = [cfg.paths?.themeCSS].flat().filter((f) => f && !/^https?:/.test(f));
  const css = themes.map((f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
  const colours = pageColours(css);
  const plugins = appPlugins(ROOT);
  const started = pb.kind === 'nuxt' ? await startNuxt(ROOT, pb, dir, groups, cfg, colours, plugins)
    : pb.kind === 'webpack' ? await startWebpack(ROOT, pb, dir, groups, cfg, colours, themes, plugins)
      : await startVite(ROOT, pb, dir, groups, cfg, colours, plugins);
  return started.url ? { ...started, groups, missing, build: pb.label } : { url: null, why: started.why };
}

// Vite: its dev server in middleware mode, the page's module imported by its path from the project's root.
async function startVite(ROOT, pv, dir, groups, cfg, { surface, ink }, plugins = {}) {
  const fromRoot = (f) => '/' + relative(ROOT, f).split(sep).join('/');
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups.map((g) => ({ ...g, file: fromRoot(g.file) })), globalStyles(ROOT, cfg), plugins));
  let vite;
  try {
    vite = await pv.vite.createServer({
      root: ROOT, configFile: pv.config ? join(ROOT, pv.config) : false, plugins: pv.plugins, logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT_DIR, 'vite-cache'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // Only Vue itself (and the Pinia and router the page gives each instance) is bundled ahead, so the page never
      // reloads halfway for a dependency found late, and they share the one Vue.
      optimizeDeps: { noDiscovery: true, include: ['vue', ...(plugins.pinia ? ['pinia'] : []), ...(plugins.router ? ['vue-router'] : [])] },
    });
  } catch (e) { return { why: `the project's Vite did not start (${why1(e)})` }; }
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/__dse-vue-harness.html') {
      try { const html = await vite.transformIndexHtml(req.url, page); res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
      catch (e) { res.writeHead(500); return res.end(String(e)); }
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-vue-harness.html`, close };
}

// Nuxt: the project's whole app in its dev server (its modules, plugins, auto-imports and components, the CSS its
// config names), with the page every route shows replaced by the components' own; client-side only, its build files
// beside the engine's other output.
async function startNuxt(ROOT, pb, dir, groups, cfg, { surface, ink }, plugins = {}) {
  const abs = (s) => (s.startsWith('/') ? join(ROOT, s) : s);
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups, globalStyles(ROOT, cfg).map(abs), plugins));
  const main = join(dir, 'Harness.vue');
  writeFileSync(main, `<script setup>
import { onMounted, getCurrentInstance } from 'vue';
const app = getCurrentInstance().appContext.app;
onMounted(() => { window.__dseParentApp = app; import(${JSON.stringify(join(dir, 'entry.js'))}); });
</script>
<template><main id="dse-harness"><h1>Components</h1></main></template>
<style>${PAGE_STYLE(surface, ink)}</style>
`);
  let nuxt = null, listener = null, kit = null, level;
  // Its build says what it does on the console Nuxt's tools share: quiet for as long as it serves the page.
  const quiet = (on) => { if (!kit?.logger) return; if (on) { level = kit.logger.level; kit.logger.level = -Infinity; } else if (level !== undefined) kit.logger.level = level; };
  try {
    kit = await import(pb.kit);
    quiet(true);
    nuxt = await kit.loadNuxt({ cwd: ROOT, dev: true, ready: false, overrides: {
      // Its types too (Nuxt 4.6 writes them apart from the build, in the project's own .nuxt unless told where).
      ssr: false, logLevel: 'silent', telemetry: false, devtools: { enabled: false }, buildDir: join(ROOT, OUT_DIR, 'nuxt-build'), typesDir: join(ROOT, OUT_DIR, 'nuxt-build'),
      vite: { clearScreen: false, logLevel: 'silent', cacheDir: join(ROOT, OUT_DIR, 'vite-cache'), server: { hmr: false } },
      hooks: { 'app:resolve': (app) => { app.mainComponent = main; } },
    } });
    await nuxt.ready();
    await kit.buildNuxt(nuxt);
    const s = nuxt.server;
    if (typeof s?.listen === 'function') listener = await s.listen(0, { hostname: '127.0.0.1', showURL: false, open: false, qr: false, public: false });
    else if (typeof s?.handler === 'function' || typeof s?.fetch === 'function') {
      const handle = typeof s.handler === 'function' ? s.handler : fetchHandler(s.fetch);
      const http = createServer((req, res) => handle(req, res));
      await new Promise((r) => http.listen(0, '127.0.0.1', r));
      listener = { url: `http://127.0.0.1:${http.address().port}/`, close: () => new Promise((r) => http.close(r)) };
    } else throw new Error('its dev server has no way to listen the engine knows');
  } catch (e) { try { await nuxt?.close(); } catch { /* not started */ } quiet(false); return { why: `the project's Nuxt did not start (${why1(e)})` }; }
  const close = () => Promise.allSettled([listener.close?.(), nuxt.close()]).then(() => quiet(false));
  return { url: String(listener.url).replace(/\/?$/, '/'), close };
}

// A server that answers with fetch (a Request in, a Response out), as a Node request handler.
function fetchHandler(fetch) {
  return async (req, res) => {
    try {
      const r = await fetch(new Request(`http://${req.headers.host ?? '127.0.0.1'}${req.url}`, { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  };
}

// Webpack, as Vue CLI resolves it (vue.config.js applied) or as the project's webpack.config says: the components
// built once with it, its loaders and plugins (vue-loader, its SCSS), into a folder of the engine's output, then served
// with the page. The token CSS is the page's own stylesheet, so what the build adds can be told from it.
const NOT_FOR_A_PAGE = /^(HtmlWebpackPlugin|HtmlPlugin|CopyPlugin|CopyWebpackPlugin|FriendlyErrorsWebpackPlugin|ESLintWebpackPlugin|ESLintPlugin|ForkTsCheckerWebpackPlugin|ProgressPlugin|PreloadPlugin|PreloadWebpackPlugin|BundleAnalyzerPlugin|HotModuleReplacementPlugin|WorkboxPlugin|GenerateSW|InjectManifest)$/;
const usesVueLoader = (config) => JSON.stringify(config?.module?.rules ?? [], (k, v) => (v instanceof RegExp ? String(v) : typeof v === 'function' ? undefined : v)).includes('vue-loader');
async function startWebpack(ROOT, pb, dir, groups, cfg, { surface, ink }, themes, plugins = {}) {
  const plainTheme = new Set(themes.filter((f) => /\.css$/i.test(f)).map((f) => '/' + String(f).replace(/^\.?\//, '')));
  const styles = globalStyles(ROOT, cfg).filter((s) => !plainTheme.has(s)).map((s) => (s.startsWith('/') ? join(ROOT, s) : s));
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups, styles, plugins));
  const env = { ...process.env };
  const restore = () => { for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k]; Object.assign(process.env, env); delete process.VUE_CLI_SERVICE; };
  let config, webpack;
  try {
    if (pb.cli) {
      const r = createRequire(join(pb.cli, 'package.json'));
      const Service = r('./lib/Service');
      const service = new Service(ROOT);
      await service.init('development');
      config = service.resolveWebpackConfig();
      webpack = r('webpack');
    } else {
      const file = join(ROOT, pb.config);
      let c;
      try { c = createRequire(file)(file); } catch (e) { if (!/ERR_REQUIRE_ESM|Cannot use import statement|import\.meta|ERR_REQUIRE_ASYNC_MODULE/.test(String(e?.code ?? '') + why1(e))) throw e; c = await import(pathToFileURL(file).href); }
      c = c?.default ?? c;
      if (typeof c === 'function') c = await c({}, { mode: 'development' });
      if (Array.isArray(c)) c = c.find((x) => usesVueLoader(x) && x.target !== 'node') ?? c[0];
      config = c;
      webpack = createRequire(join(ROOT, 'package.json'))('webpack');
    }
  } catch (e) { restore(); return { why: `the project's ${pb.label} config could not be read (${why1(e)})` }; }
  if (!usesVueLoader(config)) { restore(); return { why: `the project's ${pb.label} config has no vue-loader rule for its .vue files` }; }
  const out = join(dir, 'dist');
  const output = { ...(config.output ?? {}), path: out, publicPath: '/dist/', filename: '[name].js', chunkFilename: 'chunk-[id].js', clean: true };
  for (const k of ['library', 'libraryTarget', 'libraryExport', 'module']) delete output[k];
  let stats;
  try {
    const compiler = webpack({
      ...config, mode: 'development', context: ROOT, entry: { 'dse-harness': join(dir, 'entry.js') }, output, devtool: false, watch: false, cache: false,
      devServer: undefined, stats: 'errors-only', infrastructureLogging: { level: 'none' }, performance: { hints: false },
      optimization: { ...(config.optimization ?? {}), splitChunks: false, runtimeChunk: false, minimize: false },
      plugins: (config.plugins ?? []).filter((p) => !NOT_FOR_A_PAGE.test(p?.constructor?.name ?? '')),
    });
    stats = await new Promise((done, fail) => compiler.run((err, st) => (err ? fail(err) : compiler.close(() => done(st)))));
  } catch (e) { return { why: `the project's ${pb.label} build did not run (${why1(e)})` }; }
  finally { restore(); }
  const info = stats.toJson({ all: false, entrypoints: true, errors: true });
  const assets = (info.entrypoints?.['dse-harness']?.assets ?? []).map((a) => (typeof a === 'string' ? a : a.name));
  if (!assets.some((a) => /\.js$/.test(a))) return { why: `the project's ${pb.label} build failed (${String(info.errors?.[0]?.message ?? info.errors?.[0] ?? 'no script written').split('\n')[0]})` };
  const page = PAGE(surface, ink, {
    head: [...plainTheme].map((f) => `<link rel="stylesheet" href="${f}" data-dse-theme>`).join('') + assets.filter((a) => /\.css$/.test(a)).map((a) => `<link rel="stylesheet" href="/dist/${a}">`).join(''),
    script: assets.filter((a) => /\.js$/.test(a)).map((a) => `<script src="/dist/${a}"></script>`).join(''),
  });
  // The page, the build's files and the project's own (the token CSS and what it links to), nothing outside it.
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };
  const http = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/__dse-vue-harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
    const file = path.startsWith('/dist/') ? resolve(out, '.' + path.slice(5)) : resolve(ROOT, '.' + path);
    if (!(file.startsWith(out + sep) || file.startsWith(resolve(ROOT) + sep)) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    try { const body = readFileSync(file); res.writeHead(200, { 'content-type': TYPES[(file.match(/\.\w+$/) ?? [''])[0].toLowerCase()] ?? 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${http.address().port}/__dse-vue-harness.html`, close: () => { try { http.close(); } catch { /* closed */ } } };
}

// What each Vue component renders, by default and in each of its variants (max: how many, the default first), and the
// CSS the project's build gives it (its <style> blocks, SCSS compiled, scoped ones with their data-v attribute), read
// from the harness page in Chrome, so the style guide draws the component as it ships. The project's token CSS
// (themeCSS) is left out: the page has it already.
// → { markup: { name: html }, cases: { name: [{ label, props, markup }] }, css, failed: [{ name, why }], build }, or
// { markup: {}, cases: {}, css: '', why } when it cannot render.
export async function renderedVue(ROOT, cfg, names, { propsSnap = {}, locate, read, chromePath = null, max = 1 } = {}) {
  const none = (why) => ({ markup: {}, cases: {}, css: '', failed: [], why });
  if (typeof WebSocket === 'undefined') return none('Node 22 or later is needed to drive Chrome');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return none('Chrome not found (set CHROME_PATH)');
  const h = await startVueHarness(ROOT, cfg, names, { propsSnap, locate, read, max });
  if (!h.url) return none(h.why);
  const theme = [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => String(f).replace(/^\.?\//, ''));
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-vue-' });
    cdp = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }))) return none('the page of its components did not finish within a minute');
    // The build's own stylesheets: Vite's and Nuxt's carry the file they come from; webpack's are every one the page
    // did not bring itself.
    const expr = `(() => {
      const THEME = ${JSON.stringify(theme)}, VITE = ${JSON.stringify(h.build !== 'Vue CLI' && h.build !== 'webpack')};
      const html = (b) => b.innerHTML.replace(/<!--[\\s\\S]*?-->/g, '').trim();
      const cases = Object.fromEntries([...document.querySelectorAll('[data-dse-component]')].map((s) => [s.getAttribute('data-dse-component'), [...s.querySelectorAll('[data-dse-case]')].map((b) => ({ label: b.getAttribute('data-dse-case'), markup: html(b) })).filter((c) => /^<[a-z]/.test(c.markup))]));
      const own = (s) => {
        if (s.hasAttribute('data-dse-page') || s.hasAttribute('data-dse-theme')) return false;
        const id = s.getAttribute('data-vite-dev-id');
        if (!VITE) return true;
        return !!id && !/\\/vue-harness\\//.test(id) && !THEME.some((t) => id.endsWith('/' + t));
      };
      const css = [...document.querySelectorAll('style, link[rel="stylesheet"]')].filter(own).map((s) => (s.tagName === 'STYLE' ? s.textContent : [...((s.sheet && s.sheet.cssRules) || [])].map((r) => r.cssText).join('\\n'))).join('\\n');
      return JSON.stringify({ cases, css, failed: window.__dseHarnessFailed || [] });
    })()`;
    const r = JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? '{}');
    const props = Object.fromEntries(h.groups.map((g) => [g.name, Object.fromEntries(g.cases.map((c) => [c.label, c.props]))]));
    const cases = Object.fromEntries(Object.entries(r.cases ?? {}).filter(([, l]) => l.length).map(([n, l]) => [n, l.map((c) => ({ ...c, props: props[n]?.[c.label] ?? {} }))]));
    // The first case is the default: what the component renders with nothing set.
    const markup = Object.fromEntries(Object.entries(cases).filter(([n, l]) => l[0].label === h.groups.find((g) => g.name === n)?.cases[0]?.label).map(([n, l]) => [n, l[0].markup]));
    return { markup, cases, css: String(r.css ?? '').replace(/\/\*# sourceMappingURL=[^*]*\*\/\s*/g, ''), failed: r.failed ?? [], build: h.build };
  } catch (e) { return none(why1(e)); }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } await h.close(); }
}
