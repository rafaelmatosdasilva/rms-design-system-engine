// vue-harness.mjs - the design system's own Vue components, rendered with the project's own build tools in a real
// browser: each single-file component in each of its variants on one page, so the accessibility check tries what a
// person would (a click, a key, a name read out) on the code that ships, and the style guide draws what it renders.
//
// The project's own Vite does the work, once its packages are installed: its config (plugins, aliases, the SCSS its
// components share), its Vue, its Sass. A project with no Vite config but Vite and @vitejs/plugin-vue installed gets
// that plugin, as a new Vue project has it. What it lacks is said, never worked around with a build of the engine's.
// The variants are Figma's when it has the component, else the code's own props (component-harness.mjs variantsFromCode).
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
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
export async function projectVite(ROOT) {
  const viteUrl = projectModule(ROOT, 'vite');
  if (!projectModule(ROOT, 'vue')) return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules')) ? 'the project\'s packages are not installed (no node_modules): install them (npm install, or the project\'s package manager), then run again' : 'the project has no vue package installed' };
  if (!viteUrl) return { why: 'the project has no Vite to build its Vue components with (its own build tools are used, never the engine\'s)' };
  const config = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'].find((f) => existsSync(join(ROOT, f))) ?? null;
  let plugins = [];
  if (!config) {
    const vueUrl = projectModule(ROOT, '@vitejs/plugin-vue');
    if (!vueUrl) return { why: 'the project has no Vite config and no @vitejs/plugin-vue to read its .vue files with' };
    plugins = [(await import(vueUrl)).default()];
  }
  return { vite: await import(viteUrl), plugins, config };
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

// The page's module: each component imported by its own path, mounted once per variant in a box that names it
// (data-dse-component, data-dse-case), and given back what it reports, as the page that uses it would: an
// update:<prop> event sets that prop, a toggle's click flips the state it was told.
export function harnessModule(groups, styles = []) {
  return `${styles.map((s) => `import ${JSON.stringify(s)};`).join('\n')}
import { createApp, h, reactive } from 'vue';
const GROUPS = ${JSON.stringify(groups.map(({ name, role, cases, options }) => ({ name, role, cases, options: options ?? {} }))).replace(/</g, '\\u003c')};
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
const main = document.getElementById('dse-harness');
const failed = [];
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
    try { app.mount(box); } catch (e) { failed.push({ name: g.name + ' (' + c.label + ')', why: String(e && e.message || e).split('\\n')[0] }); }
  }
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
`;
}

// The page around the module: the system's own surface and text colour (pageColours), no motion.
const PAGE = (surface, ink, lang = 'en') => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Components</title>
<style>body{margin:0;padding:16px;font-family:Inter,system-ui,sans-serif;${surface ? `background:var(${surface});` : ''}${ink ? `color:var(${ink});` : ''}}.dse-case{display:block;margin:0 0 12px}*,*::before,*::after{transition:none!important;animation:none!important}</style></head>
<body><main id="dse-harness"><h1>Components</h1></main>
<script type="module" src="/${OUT_DIR}/vue-harness/entry.js"></script></body></html>`;

// The harness for a project: its Vue components (a .vue file each) in their variants, served by its own Vite.
// names: the components to render; locate(name) → its file; read(file) → its text.
// → { url, close, groups, missing: [why] }, or { url: null, why } when nothing can be rendered.
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
    groups.push({ name, file: '/' + relative(ROOT, file).split('\\').join('/'), role, cases, options, from: fromFigma ? 'figma' : 'code' });
  }
  if (!groups.length) return { url: null, why: 'no Vue component file (.vue) for the design system\'s components' };
  const pv = await projectVite(ROOT);
  if (!pv.vite) return { url: null, why: pv.why };
  // The page's module beside the engine's other output, where the project's Vite serves it from.
  const dir = join(ROOT, OUT_DIR, 'vue-harness');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups, globalStyles(ROOT, cfg)));
  const css = [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
  const { surface, ink } = pageColours(css);
  let vite;
  try {
    vite = await pv.vite.createServer({
      root: ROOT, configFile: pv.config ? join(ROOT, pv.config) : false, plugins: pv.plugins, logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT_DIR, 'vite-cache'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // Only Vue itself is bundled ahead, so the page never reloads halfway for a dependency found late.
      optimizeDeps: { noDiscovery: true, include: ['vue'] },
    });
  } catch (e) { return { url: null, why: `the project's Vite did not start (${String(e?.message ?? e).split('\n')[0]})` }; }
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/__dse-vue-harness.html') {
      try { const html = await vite.transformIndexHtml(req.url, page); res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
      catch (e) { res.writeHead(500); return res.end(String(e)); }
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-vue-harness.html`, close, groups, missing };
}

// What each Vue component renders by default, and the CSS the project's build gives it (its <style> blocks, SCSS
// compiled, scoped ones with their data-v attribute), read from the harness page in Chrome, so the style guide draws
// the component as it ships. The project's token CSS (themeCSS) is left out: the page has it already.
// → { markup: { name: html }, css, failed: [{ name, why }] }, or { markup: {}, css: '', why } when it cannot render.
export async function renderedVue(ROOT, cfg, names, { propsSnap = {}, locate, read, chromePath = null } = {}) {
  const none = (why) => ({ markup: {}, css: '', failed: [], why });
  if (typeof WebSocket === 'undefined') return none('Node 22 or later is needed to drive Chrome');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return none('Chrome not found (set CHROME_PATH)');
  const h = await startVueHarness(ROOT, cfg, names, { propsSnap, locate, read, max: 1 });
  if (!h.url) return none(h.why);
  const theme = [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => String(f).replace(/^\.?\//, ''));
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-vue-' });
    cdp = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 600, intervalMs: 50, tolerateErrors: true }))) return none('the page of its components did not finish within 30s');
    const expr = `JSON.stringify({
      markup: Object.fromEntries([...document.querySelectorAll('[data-dse-component]')].map((s) => { const b = s.querySelector('[data-dse-case]'); return [s.getAttribute('data-dse-component'), b ? b.innerHTML.replace(/<!--[\\s\\S]*?-->/g, '').trim() : '']; }).filter(([, m]) => /^<[a-z]/.test(m))),
      css: [...document.querySelectorAll('style[data-vite-dev-id]')].filter((s) => !${JSON.stringify(theme)}.some((t) => s.getAttribute('data-vite-dev-id').endsWith('/' + t))).map((s) => s.textContent).join('\\n'),
      failed: window.__dseHarnessFailed || [] })`;
    const r = JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? '{}');
    return { markup: r.markup ?? {}, css: r.css ?? '', failed: r.failed ?? [] };
  } catch (e) { return none(String(e?.message ?? e).split('\n')[0]); }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } h.close(); }
}
