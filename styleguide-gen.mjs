// styleguide-gen.mjs — generate the living styleguide HTML from the design system.
//
// The styleguide is a GENERATED VIEW over canonical sources — nothing is hand-kept.
// A template (structure + per-component render patterns, DS-specific, private)
// carries `{{markers}}`; this generator fills each marker with data gathered LIVE
// from Figma + code, then writes the HTML. Because it only ever renders what the
// DS actually contains, the styleguide can never drift from — or invent — anything
// the system doesn't have (the same guarantee the docs-truth gate checks).
//
// Sources gathered:
//   • THEME_CSS  — paths.themeCSS (the real tokens), with its dark @media guarded
//                  to :root:not([data-color]) so the manual mode toggle wins.
//   • ICON_SHEET — the DS icon <symbol> set, from a built plugin ui.html.
//   • USAGE      — which plugins use each component (scanned from plugin source).
//   • DOCS_CODE  — per-component code notes, from the design-intent layer.
//   • DOCS       — Figma component descriptions/annotations, from design-intent.
//
// Config (ds-config.json → styleguide):
//   { template: "<path to .template.html>", out: "<path to write index.html>",
//     iconSource: "<plugin ui.html to lift the icon sheet from>" }
//
// Exit 0 on success. Never throws into the audit — callers wrap it.

import { buildStamp, mayWrite, stampMeta } from './stamp.mjs';
import { usedClasses } from './class-use.mjs';
import { appDir } from './code-roots.mjs';
import { codeSizeCSS, modeRootCSS, scopeView, attrModeCSS, colourAttrMode, modeScopes } from './styleguide-data.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync, rmSync } from 'fs';
import { findIconFolder, folderSymbols } from './icon-folder.mjs';
import { join, dirname, resolve, relative, basename } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { OUT_DIR } from './names.mjs';
import { storesOf, THEMES_DIR } from './stores.mjs';
import { writeStyleguide } from './styleguide-files.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
// The engine's own template, used when the project has none (ds-config.json → styleguide.template wins).
export const ENGINE_TEMPLATE = join(ENGINE_DIR, 'templates', 'styleguide.template.html');

// ── DS-derived colour-mode CSS ────────────────────────────────────────────────
// The DS expresses colour mode ONLY as @media (prefers-color-scheme: dark). The
// styleguide needs a MANUAL, per-component toggle, so we derive [data-color] rules
// straight from those @media blocks - nothing is hand-copied and no value is
// invented. Each @media block is ALSO gated to :root:not([data-color]) so the
// manual toggle always wins over the OS preference (and a per-component override
// wins over the global one, because [data-color] custom properties inherit from
// the nearest scope). Colour vars are chosen by transitive closure over the
// dark-overridden primitives, which excludes the size/typography axes so a
// colour scope never fights the [data-size] axis.
function _matchBlock(s, openIdx) {
  let d = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return { body: s.slice(openIdx + 1, i), end: i }; }
  }
  return { body: s.slice(openIdx + 1), end: s.length };
}
function _declMap(body) {
  const m = {};
  body.replace(/\/\*[\s\S]*?\*\//g, '').split(';').forEach((d) => {
    const c = d.indexOf(':'); if (c < 0) return;
    const k = d.slice(0, c).trim(), v = d.slice(c + 1).trim();
    if (k.startsWith('--')) m[k] = v;
  });
  return m;
}
function _balanceCSS(s) {
  // Make CSS brace-balanced by DROPPING stray top-level `}` (a DS token file may
  // carry an orphan brace) and closing any unclosed blocks. String- and comment-
  // aware (a `content: "}"` or a brace in a comment must not count). Unlike a
  // trailing-strip, this removes the stray close AT ITS POSITION, so a mid-file
  // orphan does not cost a real closing brace of the last rule.
  let out = '', depth = 0, inC = false, inS = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inC) { out += c; if (c === '*' && n === '/') { out += n; i++; inC = false; } continue; }
    if (inS) { out += c; if (c === inS) inS = null; continue; }
    if (c === '/' && n === '*') { out += c + n; i++; inC = true; continue; }
    if (c === '"' || c === "'") { out += c; inS = c; continue; }
    if (c === '{') { depth++; out += c; continue; }
    if (c === '}') { if (depth === 0) continue; depth--; out += c; continue; } // drop stray top-level close
    out += c;
  }
  if (depth > 0) out += '\n' + '}'.repeat(depth);   // close any still-open blocks
  return out;
}
function _mediaRules(inner) {
  const clean = inner.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf('{', i); if (open < 0) break;
    const sel = clean.slice(i, open).trim();
    const { body, end } = _matchBlock(clean, open);
    if (sel) out.push({ sel, body: body.trim() });
    i = end + 1;
  }
  return out;
}
export function deriveModeCSS(raw) {
  const rootHead = raw.search(/:root\s*\{/);
  if (rootHead < 0) return raw;
  const baseMap = _declMap(_matchBlock(raw, raw.indexOf('{', rootHead)).body);
  const baseOrder = Object.keys(baseMap);

  const darkMap = {}; const compRules = [];
  let out = '', last = 0;
  const re = /@media\s*\(prefers-color-scheme:\s*dark\)\s*/g; let m;
  while ((m = re.exec(raw))) {
    const open = raw.indexOf('{', m.index);
    const { body, end } = _matchBlock(raw, open);
    const gated = _mediaRules(body).map((r) => {
      const sel = r.sel === ':root' ? ':root:not([data-color])' : ':root:not([data-color]) ' + r.sel;
      if (r.sel === ':root') Object.assign(darkMap, _declMap(r.body));
      else compRules.push(r);
      return '    ' + sel + ' { ' + r.body + ' }';
    }).join('\n');
    out += raw.slice(last, m.index) + '@media (prefers-color-scheme: dark) {\n' + gated + '\n  }';
    last = end + 1; re.lastIndex = end + 1;
  }
  out += raw.slice(last);

  // The DS token file must inject as BALANCED CSS: the manual [data-color] blocks
  // we append have to sit at the top level. A DS file can carry an orphan brace
  // (harmless standalone - the browser discards a stray top-level `}` - but when
  // content follows, an unmatched brace swallows the next rule). Normalise it.
  out = _balanceCSS(out);

  // transitive closure: dark-overridden primitives + everything referencing them
  const color = new Set(Object.keys(darkMap));
  for (let grew = true; grew; ) {
    grew = false;
    for (const k of baseOrder) {
      if (color.has(k)) continue;
      const refs = [...String(baseMap[k]).matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((x) => x[1]);
      if (refs.some((r) => color.has(r))) { color.add(k); grew = true; }
    }
  }
  const order = baseOrder.filter((k) => color.has(k)).concat([...color].filter((k) => !(k in baseMap)));
  const light = order.map((k) => '    ' + k + ': ' + (baseMap[k] ?? darkMap[k]) + ';').join('\n');
  const dark  = order.map((k) => '    ' + k + ': ' + (darkMap[k] ?? baseMap[k]) + ';').join('\n');
  const comp  = compRules.map((r) => '  [data-color="dark"] ' + r.sel + ' { ' + r.body + ' }').join('\n');

  return out +
    '\n\n  /* == Manual colour-mode toggle - generated from the DS @media blocks (no hand-copied values) == */\n' +
    '  [data-color="light"] {\n' + light + '\n  }\n' +
    '  [data-color="dark"] {\n' + dark + '\n  }\n' +
    (comp ? comp + '\n' : '');
}

// Short usage labels for app names: the initials of a name with two or more words ("order-history"
// → "OH"), the name itself for one word. If two apps would share a label, every app keeps its full name.
export function appLabels(names) {
  const words = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_\-./]+/).filter(Boolean);
  const short = names.map((n) => { const w = words(n); return [n, w.length >= 2 ? w.map((x) => x[0].toUpperCase()).join('') : String(n)]; });
  const clash = new Set(short.map(([, k]) => k)).size < short.length;
  return clash ? names.map((n) => [n, String(n)]) : short;
}

// A stylesheet the system's CSS imports by its address (its webfont: @import url('https://fonts.googleapis.com/…')) is
// ignored by a browser anywhere but at the very top of a stylesheet, and the page puts the system's CSS after rules of
// its own: each one is linked from the page's head instead, once, so its components are drawn in their own font.
// Only inside the page's <style> blocks: the same words in the page's data (a component's source shown) stay.
export function hoistImports(html) {
  const urls = [];
  const out = String(html).replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (all, open, body, close) => open + body.replace(/@import\s+(?:url\(\s*)?(['"]?)(https?:\/\/[^'")\s]+)\1\s*\)?[^;{}]*;/g, (m, q, url) => { if (!urls.includes(url)) urls.push(url); return ''; }) + close);
  if (!urls.length) return out;
  const links = urls.map((u) => `<link rel="stylesheet" href="${u.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`).join('\n');
  return /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => `${h}\n${links}`) : links + out;
}

// The CSS inside an HTML page's <style> blocks.
export function styleBlocks(html) {
  return [...String(html ?? '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

export async function generateStyleguide(ROOT, cfg, opts = {}) {
  const sh = cfg.styleguide || {};
  const ownDefault = resolve(ROOT, 'apps/styleguide/styleguide.template.html');
  const templatePath = sh.template ? resolve(ROOT, sh.template) : existsSync(ownDefault) ? ownDefault : ENGINE_TEMPLATE;
  const engineTemplate = templatePath === ENGINE_TEMPLATE;
  const projectOut = resolve(ROOT, sh.out || (engineTemplate ? `${OUT_DIR}/styleguide/index.html` : 'apps/styleguide/index.html'));
  // opts.out writes the page somewhere else (the code capture keeps a private copy in .design-system-engine-out);
  // a <base> then keeps the template's relative links pointing where the project's page would be.
  // A page for some components only (opts.only) goes beside the whole system's, named after them, so neither replaces the other.
  const outPath = opts.out ? resolve(ROOT, opts.out) : opts.only?.length ? join(dirname(projectOut), `${opts.only.map((n) => String(n).replace(/[^\w-]+/g, '-')).join('+')}.html`) : projectOut;
  if (!existsSync(templatePath)) throw new Error('styleguide template not found: ' + templatePath);
  let html = readFileSync(templatePath, 'utf8');
  if (opts.out && outPath !== projectOut) {
    const base = `<base href="${pathToFileURL(dirname(projectOut)).href}/">`;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
  }

  const themeFiles = [cfg.paths?.themeCSS ?? 'src/theme.css'].flat();
  // What the project's own build renders for its Vue components (vue-harness.mjs renderedVue): their CSS, and how many.
  let vueCss = '', vueRender = null;
  const VUE_CSS_MARK = '/*design-system-engine:vue-css*/';
  const pluginCSS = (cfg.paths?.pluginCSS ?? []).flat();
  const pluginHTML = (cfg.paths?.plugins ?? []).flat();

  // ── THEME_CSS ────────────────────────────────────────────────────────────────
  function themeCSS() {
    const css = themeFiles.map((p) => { const abs = resolve(ROOT, p); return existsSync(abs) ? readFileSync(abs, 'utf8') : ''; }).join('\n\n');
    // Derive the manual [data-color] mode blocks straight from the DS @media
    // rules (gating each block so the toggle wins). Nothing hand-copied.
    // Then append the [data-size] axis from the DS sizing-collection modes
    // (snapshot modeVariants); empty when sizing was captured single-mode.
    let sizeCSS = '';
    try {
      const snapPath = cfg.paths?.snapshotVars ? resolve(ROOT, cfg.paths.snapshotVars) : null;
      if (snapPath && existsSync(snapPath)) sizeCSS = codeSizeCSS(JSON.parse(readFileSync(snapPath, 'utf8')).modeVariants, css);
    } catch {}
    return deriveModeCSS(css) + sizeCSS + attrModeCSS(css, colourAttrMode(cfg)) + modeRootCSS(css, modeScopes(cfg));
  }

  // ── ICON_SHEET ───────────────────────────────────────────────────────────────
  // The system's icons as one <symbol> sheet: a built page's own sheet (styleguide.iconSource, else the first app's
  // page), or a folder of SVG files, one icon each (styleguide.iconSource naming a folder, else the one named icon or
  // icons the code keeps them in: icon-folder.mjs), each icon named by its path in it (m/alert-m.svg → m-alert-m).
  let iconSheetCache = null;
  function iconSheet() {
    if (iconSheetCache != null) return iconSheetCache;
    const wrap = (syms) => (syms.length ? '<svg id="ds-icon-sheet" width="0" height="0" style="position:absolute" aria-hidden="true">' + syms.join('') + '</svg>' : '');
    const named = sh.iconSource ? resolve(ROOT, sh.iconSource) : null;
    if (named && existsSync(named) && statSync(named).isDirectory()) return (iconSheetCache = wrap(folderSymbols(ROOT, relative(ROOT, named)).map((x) => x.symbol)));
    const src = named ?? (pluginHTML[0] ? resolve(ROOT, pluginHTML[0]) : null);
    const syms = src && existsSync(src) ? readFileSync(src, 'utf8').match(/<symbol\b[\s\S]*?<\/symbol>/g) || [] : [];
    if (syms.length || named) return (iconSheetCache = wrap(syms));
    const folder = findIconFolder(ROOT);
    return (iconSheetCache = folder ? wrap(folderSymbols(ROOT, folder).map((x) => x.symbol)) : '');
  }

  // ── design-intent (notes) ──────────────────────────────────────────────────────
  function designIntent() {
    const p = resolve(ROOT, (cfg.docs?.out) || join(dirname(themeFiles[0] || 'src/theme.css'), 'design-intent.json'));
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { components: {} }; }
  }
  function docsMaps(intent) {
    const comps = intent.components || {};
    const docs = {}, code = {};
    for (const [name, def] of Object.entries(comps)) {
      const d = def.design || {};
      const desc = d.description || (d.annotations && d.annotations[0]);
      if (desc) docs[name] = String(desc).replace(/\s+/g, ' ').trim();
      const c = def.code || {};
      let note = (c.note || '').trim();
      if (!note && c.cssComment) note = String(c.cssComment).replace(/[─—]+/g, ' ').replace(/\s+/g, ' ').trim();
      // Strip hardcoded pixel dimensions — docs describe with tokens, not values.
      note = note.replace(/\b\d+\s*[×x]\s*\d+\b/g, '').replace(/\bh=\d+[^,;)]*\)?/g, '').replace(/\b\d+px\b/g, '').replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').trim();
      if (note && note.length > 20) code[name.toLowerCase()] = note;
    }
    return { docs, code };
  }

  // ── USAGE — which plugins use each component ────────────────────────────────────
  function usageMap(intent) {
    // The components each product screen uses in Figma (Gate [10] reads the same file).
    let screenComponents = {};
    try { screenComponents = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotScreenComponents ?? 'figma-screen-components.snapshot.json'), 'utf8')); } catch { /* not captured */ }
    // Usage label per app: ds-config.json → styleguide.plugins [{ key, match }] (a short label and a
    // path fragment), else each configured app (paths.plugins) with a short label made from its name.
    // Each product: { key, match, name?, href? } (styleguide.plugins); its full name, else the app's name in words.
    const words = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const PLUGS = ((cfg.styleguide?.plugins) || appLabels(cfg.paths?.plugins ?? []).map(([n, key]) => ({ key, match: n }))).map((g) => ({ ...g, name: g.name ?? words(g.match ?? g.key) }));
    const sources = pluginHTML.concat(pluginCSS).map((p) => ({ p, m: PLUGS.find((g) => p.includes(g.match)), txt: (() => { const abs = resolve(ROOT, p); return existsSync(abs) ? readFileSync(abs, 'utf8') : ''; })() })).filter((s) => s.m);
    const usage = {};
    for (const name of Object.keys(intent.components || {})) {
      const cls = intent.components[name].class || ('.' + name);
      const bare = (String(cls).match(/[.#]?([A-Za-z][\w-]*)/) ?? [])[1] ?? name;   // its first class (or id): what an element carries
      const found = new Set();
      for (const s of sources) if ((s.used ??= usedClasses(s.txt)).has(bare)) found.add(s.m.key);   // put on an element, never a word in a comment
      // A product whose screen uses it in Figma while its code never does: listed too, said so (built by hand there).
      const inFigma = new Set();
      for (const scr of Object.values(screenComponents.screens ?? {})) {
        if (!(scr?.components ?? {})[name]) continue;
        const g = PLUGS.find((x) => x.match && String(scr.plugin ?? '').includes(x.match)) ?? PLUGS.find((x) => x.key === scr.plugin);
        if (g && !found.has(g.key)) inFigma.add(g.key);
      }
      usage[name] = [...found, ...inFigma].map((key) => { const g = PLUGS.find((x) => x.key === key); return { key, name: g?.name ?? key, ...(typeof g?.href === 'string' && /^https?:\/\//.test(g.href) ? { href: g.href } : {}), ...(inFigma.has(key) ? { figmaOnly: true } : {}) }; });
    }
    return usage;
  }

  // What the agreed view and the component CSS share: the locator, Figma's props, and every stylesheet that holds a
  // component's rules (the theme, pluginCSS, and a component's own file, as build mode finds them).
  const readJson = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
  const readText = (p) => { const abs = resolve(ROOT, p); return !/^https?:/.test(p) && existsSync(abs) ? readFileSync(abs, 'utf8') : ''; };
  let ctx = null;
  async function context() {
    if (ctx) return ctx;
    const { loadLocator } = await import('./component-locator.mjs');
    const { componentStylesheets } = await import('./build-list.mjs');
    const locator = await loadLocator(ROOT, cfg);
    const propsSnap = readJson(cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json') ?? {};
    const names = Object.keys(propsSnap).filter((n) => !n.startsWith('_'));
    const ownSheets = componentStylesheets(ROOT, cfg, names.map((n) => locator.classFor(n)));
    const componentSheets = [...pluginCSS, ...ownSheets];
    ctx = { locator, propsSnap, componentSheets, cssText: [...themeFiles, ...componentSheets].map(readText).join('\n') };
    return ctx;
  }

  // ── AGREED — what Figma and the code agree on (styleguide-data.mjs) ──────────────────
  async function agreed() {
    const { agreedView } = await import('./styleguide-data.mjs');
    const { loadAgreed } = await import('./agreed.mjs');
    const { inProgressNames } = await import('./in-progress.mjs');
    const { locator, propsSnap, cssText } = await context();
    // Gate [15]'s per-prop rows: run it, read its result, and leave the project as it was.
    const resultFile = join(ROOT, 'component-prop-result.json');
    const had = existsSync(resultFile);
    spawnSync(process.execPath, [join(ENGINE_DIR, 'component-prop-check.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const rows = readJson('component-prop-result.json')?.rows ?? [];
    if (!had) { try { unlinkSync(resultFile); } catch { /* not written */ } }
    let contract = {};
    const cp = resolve(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs');
    if (existsSync(cp)) { try { contract = await import(pathToFileURL(cp).href); } catch { /* optional */ } }
    const probeBySelector = new Map();
    for (const a of [...(contract.RENDERED_ASSERTIONS ?? []), ...(contract.CROSS_PLUGIN_CONSISTENCY ?? [])]) if (a?.probe && a.selector) probeBySelector.set(a.selector.replace(/\s+/g, ' ').trim(), a.probe);
    const probes = {};
    // Every component Figma has: those with props, and those without (a divider line), from the structure snapshot.
    const structNames = Object.keys(readJson(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json')?.components ?? {});
    const drawNames = [...new Set([...Object.keys(propsSnap), ...(opts.names ?? []), ...structNames])];
    for (const name of drawNames) { const sel = locator.selectorFor(name); const p = sel && probeBySelector.get(String(sel).replace(/\s+/g, ' ').trim()); if (p) probes[name] = p; }
    // A component the pages do not show: the markup its own source renders, as the code capture draws it (what a React
    // component returns, a Vue component's template).
    const jsx = {};
    const vueRenders = {};   // a Vue component's every variant as its build renders it: [{ props, markup }]
    const vueLists = {};   // the lists its build was given (a bar's tabs), for its code
    const showroom = [];   // the Showroom's screens, each as the project's build draws it
    let showroomLive = null, showroomLiveWhy = null;   // the same screens built to run on the page
    const fileOf = {};   // each component's own file, read for the components it nests (a scoped page)
    // The components the code has that Figma does not list (every one, before Figma's data is captured): each with its
    // file, the props its code declares and the markup its source renders (codeComponents). Which file is which
    // Figma component is the shared pairing's answer (component-pairing.mjs), so a file paired with one, or proposed for
    // one, is not listed as the code's alone.
    const codeOnly = [];
    const figmaHas = Object.keys(propsSnap).some((n) => !n.startsWith('_'));
    const pairing = locator.pairing?.() ?? null;
    try {
      const { componentSourceFiles, resolveComponentFile, textReader, codeComponents, textComponentApi } = await import('./component-source.mjs');
      const { jsxMarkup } = await import('./jsx-markup.mjs');
      const { vueMarkup } = await import('./vue-markup.mjs');
      const read = textReader();
      const sourceMarkup = (file, cls) => { try { const m = /\.vue$/.test(file) ? vueMarkup(read(file), cls) : jsxMarkup(read(file), cls); return m && /^<[a-z]/.test(m) ? m : null; } catch { return null; } };
      const files = componentSourceFiles(ROOT, cfg).filter((f) => /\.(jsx|tsx|js|vue)$/.test(f));
      const covered = new Set();
      const vueFiles = {};   // a Vue component's file, to draw it from what the project's own build renders
      for (const name of drawNames) {
        if (name.startsWith('_')) continue;
        const { file } = resolveComponentFile(name, { ROOT, cfg, files, read, classFor: locator.classFor, pairing });
        if (file) { covered.add(resolve(file)); fileOf[name] = file; }
        if (file && /\.vue$/.test(file) && !probes[name]) vueFiles[name] = resolve(ROOT, file);
        if (probes[name] || !file || !/\.(jsx|tsx|js|vue)$/.test(file)) continue;
        const m = sourceMarkup(file, locator.classFor(name));
        if (m) jsx[name] = m;
      }
      const squash = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      const figmaClasses = new Set(drawNames.map((n) => String(locator.classFor(n) ?? '').replace(/^\./, '')).filter(Boolean));
      const figmaNames = new Set(drawNames.map(squash));
      for (const k of codeComponents(ROOT, cfg, read)) {
        const abs = resolve(ROOT, k.file);
        if ((pairing?.inLibrary && !pairing.inLibrary(abs)) || covered.has(abs) || pairing?.claimed(abs) || figmaClasses.has(k.cls) || figmaNames.has(squash(k.name))) continue;   // the docs site's and the helpers' components are not the library's
        const api = textComponentApi(abs, read(abs));
        const props = Object.entries(api?.props ?? {}).map(([prop, d]) => ({ name: prop, ...(d.default != null ? { default: String(d.default) } : {}), ...(d.options ? { options: [...d.options] } : {}), ...(d.required ? { required: true } : {}) }));
        codeOnly.push({ ...k, props, markup: sourceMarkup(abs, k.cls), from: /\.vue$/.test(k.file) ? 'vue' : 'jsx' });
        fileOf[k.name] = abs;
        // Drawn from its build, as Figma's are, unless styleguide.showCodeOnly: false leaves it off the pages.
        if (/\.vue$/.test(k.file) && (!figmaHas || cfg.styleguide?.showCodeOnly !== false)) vueFiles[k.name] = abs;
      }
      // A Vue component drawn from what the project's own build renders (Vite, Nuxt, Vue CLI or webpack), its SCSS
      // compiled (vue-harness.mjs), once its packages are installed; the markup read from its template stays when it
      // cannot be rendered.
      // ds-config.json → styleguide.renderVue: false keeps the template read.
      // A page for one component (opts.only) renders only it and what it nests, followed in turn, read from their
      // sources before anything is rendered.
      let toRender = Object.keys(vueFiles);
      if (opts.only?.length && toRender.length) {
        const { nestedComponents, scopeView } = await import('./styleguide-data.mjs');
        const own = (n) => codeOnly.find((k) => k.name === n);
        const all = [...new Set([...drawNames.filter((n) => !n.startsWith('_')), ...codeOnly.map((k) => k.name)])].map((n) => ({ name: n, cls: String(own(n)?.cls ?? locator.classFor(n) ?? '').replace(/^\./, '') || null, markup: jsx[n] ?? own(n)?.markup ?? '' }));
        const tags = Object.fromEntries(Object.entries(fileOf).map(([n, f]) => [n, [basename(f).replace(/\.\w+$/, '')]]));
        const kept = new Set(scopeView(all, opts.only, (c, names) => nestedComponents({ name: c.name, cls: c.cls, markup: c.markup, text: fileOf[c.name] ? read(resolve(ROOT, fileOf[c.name])) : '', names, tags })).components.map((c) => c.name));
        toRender = toRender.filter((n) => kept.has(n));
      }
      // The Showroom's screens (paths.showroom, else showroom/): whole pages written with the system's own components,
      // each drawn by the project's build beside them, with what it lacks listed in its <Screen>.json.
      const showroomDir = resolve(ROOT, cfg.paths?.showroom ?? 'showroom');
      const screenFiles = {};
      if (!opts.only?.length) { try { for (const f of readdirSync(showroomDir)) if (/\.vue$/.test(f)) screenFiles[`showroom:${f.replace(/\.vue$/, '')}`] = relative(ROOT, join(showroomDir, f)); } catch { /* no showroom */ } }
      if ((toRender.length || Object.keys(screenFiles).length) && cfg.styleguide?.renderVue !== false) {
        const { renderedVue } = await import('./vue-harness.mjs');
        // Every variant it has (Figma's, else its own props'), so the Playground draws each as it renders.
        const r = await renderedVue(ROOT, cfg, [...toRender, ...Object.keys(screenFiles)], { propsSnap, read, locate: (n) => vueFiles[n] ?? screenFiles[n] ?? null, max: cfg.a11y?.maxVariants ?? 16 });
        for (const [key, file] of Object.entries(screenFiles)) {
          const drawn = r.cases?.[key]?.[0]?.markup;
          let meta = {}; try { meta = JSON.parse(readFileSync(join(ROOT, file.replace(/\.vue$/, '.json')), 'utf8')); } catch { /* none */ }
          showroom.push({ key: key.slice(9), file, markup: drawn ?? null, why: drawn ? null : (r.failed ?? []).find((x) => x.name.startsWith(key))?.why ?? r.why ?? 'not drawn', ...meta });
          delete r.markup[key]; delete r.cases[key];
        }
        // The screens built to run on the page (showroom-bundle.mjs): mounted where their drawing is, so they work.
        // Off unless asked (styleguide.showroomLive): it carries the whole app's code (some 3MB), so the page draws the screens.
        if (Object.keys(screenFiles).length && cfg.styleguide?.showroomLive === true) {
          try {
            const { showroomBundle } = await import('./showroom-bundle.mjs');
            const b = await showroomBundle(ROOT, Object.fromEntries(Object.entries(screenFiles).map(([k, f]) => [k.slice(9), f])), cfg);
            if (b.js) showroomLive = { js: b.js, css: b.css }; else showroomLiveWhy = b.why;
          } catch (e) { showroomLiveWhy = String(e.message).split('\n')[0]; }
        }
        const holds = (m, cls) => !cls || new RegExp(`class="[^"]*(?<![\\w-])${String(cls).replace(/^\./, '').replace(/[^\w-]/g, '')}(?![\\w-])`).test(m.slice(0, m.indexOf('>') + 1));
        for (const [name, m] of Object.entries(r.markup)) {
          const own = codeOnly.find((k) => k.name === name);
          if (own) { if (holds(m, own.cls)) { own.markup = m; own.from = 'vue-build'; } }
          // Its own file drawn by its own build is the component, whatever class its root carries (an input's wrapper);
          // a file from the project's pages (src/views, a docs page that shows it) is the component only when its root
          // carries the component's class.
          else if (!/(^|[\\/])(views|pages|stories|docs|examples?|playground)[\\/]/i.test(vueFiles[name] ?? '') || holds(m, locator.classFor(name))) {
            jsx[name] = m;
            const each = (r.cases[name] ?? []).filter((c) => /^<[a-z]/i.test(c.markup.trim()));
            if (r.lists?.[name]) vueLists[name] = r.lists[name];
            if (new Set(each.map((c) => c.markup)).size > 1) vueRenders[name] = each.map((c) => ({ label: c.label, props: c.props, markup: c.markup }));
          }
        }
        vueCss = r.css;
        vueRender = { rendered: Object.keys(r.markup).length, of: toRender.length, why: r.why ?? null, failed: r.failed, build: r.build ?? null };
      }
    } catch { /* no component sources */ }
    // The token check's own result: each token equal to Figma, with its CSS variable. Run it, read it, tidy up.
    const checkFile = join(ROOT, 'design-system-engine-check-result.json');
    const hadCheck = existsSync(checkFile);
    spawnSync(process.execPath, [join(ENGINE_DIR, 'parity-check.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const check = readJson('design-system-engine-check-result.json');
    if (!hadCheck) { try { unlinkSync(checkFile); } catch { /* not written */ } }
    // The project's own pages, where a component's real markup is (static HTML only).
    // An app named in paths.plugins renders at apps/<app>/ui.html (built) or ui.src.html, as the code capture reads it.
    const appPages = pluginHTML.flatMap((p, i) => (/\.html?$/i.test(p) ? [p] : (() => { const src = /\.src\.html$/.test(pluginCSS[i] ?? '') ? pluginCSS[i] : null; return src ? [src.replace(/\.src\.html$/, '.html'), src] : [`${appDir(cfg, p)}/ui.html`, `${appDir(cfg, p)}/ui.src.html`]; })()));
    const pageFiles = [...appPages, ...(cfg.codeReading?.pages ?? [])].filter((p) => /\.html?$/i.test(p) && !/^https?:/.test(p));
    const pages = pageFiles.map(readText).filter(Boolean);
    const usage = (cfg.paths?.plugins ?? []).length ? usageMap(intent) : {};
    const icons = (iconSheet().match(/<symbol\b[^>]*\bid\s*=\s*["']([^"']+)["']/g) ?? []).map((m) => m.match(/id\s*=\s*["']([^"']+)["']/)[1]);
    let title = cfg.name ?? '';
    if (!title) { try { title = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name ?? ''; } catch { /* no package.json */ } }
    const probeList = [...new Set([...probeBySelector.values()])];
    // The category of each Figma note (Accessibility, Intent…): only the notes that are requirements state a role or
    // a duty; the rest is design intent for the agents (annotation-categories.mjs).
    const { loadCategories, requirementEntry, noteIsTodo } = await import('./annotation-categories.mjs');
    const cats = loadCategories(ROOT, cfg);
    const pairingNow = locator.pairing?.() ?? null;
    const view = agreedView({ fileState: pairingNow ? (n) => pairingNow.pairOf(n).status : null, cats, propsSnap, rows, agreedRecord: loadAgreed(ROOT), classFor: (n) => locator.classFor(n), cssText, probes, probeList, unbuilt: [...await inProgressNames(ROOT, cfg)], cfg,
      check, figmaVars: readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, pages, usage, notes: code, icons, title, jsx, renders: vueRenders, codeOnly, alsoNames: [...new Set([...(opts.names ?? []), ...structNames])], themeCss: themeFiles.map(readText).join('\n'),
      // A contract entry named apart from its Figma component (figmaName) maps that component's props too.
      propertyMaps: Object.fromEntries(Object.entries(contract.CONTRACT ?? {}).filter(([, c]) => c?.propertyMap).flatMap(([n, c]) => [[n, c.propertyMap], ...(c.figmaName && c.figmaName !== n && !contract.CONTRACT[c.figmaName]?.propertyMap ? [[c.figmaName, c.propertyMap]] : [])])),
      // An option heard on a part (heardOn: the field disabled inside its wrapper), set with the option's look.
      heardOn: Object.fromEntries(Object.entries(contract.CONTRACT ?? {}).filter(([, c]) => c?.heardOn).flatMap(([n, c]) => [[n, c.heardOn], ...(c.figmaName && c.figmaName !== n ? [[c.figmaName, c.heardOn]] : [])])),
      parts: Object.fromEntries(Object.entries(contract.CONTRACT ?? {}).map(([n, c]) => [n, (c?.children ?? []).filter((k) => k?.name && typeof k.cssSelector === 'string').map((k) => ({ name: k.name, selector: k.cssSelector }))])) });
    // opts.only: a page for the components asked for and the ones they nest, each nested one followed in turn.
    // Everything after this reads, measures and dates only those; the page's own controls still come from the whole
    // system (view.ui), so it looks as the full page does.
    if (opts.only?.length) {
      const { nestedComponents } = await import('./styleguide-data.mjs');
      Object.defineProperty(view, 'allComponents', { value: view.components, enumerable: false });   // not written to the page
      const tags = Object.fromEntries(Object.entries(fileOf).map(([n, f]) => [n, [basename(f).replace(/\.\w+$/, '')]]));   // HbBadge.vue → <HbBadge>
      Object.assign(view, scopeView(view.components, opts.only, (c, names) => nestedComponents({ name: c.name, cls: c.cls, markup: c.markup ?? '', text: fileOf[c.name] ? readText(fileOf[c.name]) : '', names, tags })));
      // One asked for that only the code has, once Figma's components are captured, is not on the page: a task on the
      // whole system's Status page, said so apart from a name the system lacks.
      const squash = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      const codeAlone = (a) => (view.notInFigma ?? []).find((k) => squash(k.name) === squash(a));
      const alone = view.scope.missing.filter(codeAlone).map((a) => codeAlone(a).name);
      if (alone.length) Object.assign(view.scope, { missing: view.scope.missing.filter((a) => !codeAlone(a)), notInFigma: alone });
      delete view.notInFigma;   // the whole system's tasks, on its own page
    }
    // "In use": the approved pictures of the system's own frames (Gate [2]'s references), embedded, six at most.
    const refsDir = resolve(ROOT, cfg.visualRefs ?? '.design-system-engine-refs');
    view.screens = (cfg.frames ?? []).filter((f) => f?.nodeId).map((f) => ({ f, file: join(refsDir, `${String(f.nodeId).replace(/[:\/]/g, '-')}.png`) }))
      .filter(({ file }) => existsSync(file) && readFileSync(file).length <= 2_000_000).slice(0, 6)
      .map(({ f, file }) => ({ src: `data:image/png;base64,${readFileSync(file).toString('base64')}`, caption: f.name ?? f.nodeId }));
    // The one list of differences the last full audit wrote: each component shows its own open ones.
    try {
      const { OUT_DIR } = await import('./names.mjs');
      const d = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'differences.json'), 'utf8'));
      const by = new Map((d.groups ?? []).map((g) => [g.component, g.items ?? []]));
      // The differences the team decided to keep, with why, who and when: shown on the component as kept, never open.
      const keptBy = new Map();
      for (const k of d.kept ?? []) if (k.component) (keptBy.get(k.component) ?? keptBy.set(k.component, []).get(k.component)).push(k);
      const { plainDifference, plainAction } = await import('./run-diff.mjs');
      // Each difference said in plain English, with who acts (Figma or the code) and exactly what to do.
      // A finding about accessibility (a text's contrast) is not a difference from Figma: it goes to the component's
      // Accessibility area, the rest to its Parity.
      const { splitFindings } = await import('./styleguide-data.mjs');
      for (const c of view.components) {
        const { parity, a11y } = splitFindings((by.get(c.name) ?? []).map((x) => ({ check: x.check, what: x.what, plain: plainDifference(x.what), ...plainAction(x.what, c.name), new: !!x.new })));
        if (parity.length) c.differences = parity;
        const kept = (keptBy.get(c.name) ?? []).map((k) => ({ check: k.check, what: k.what, plain: plainDifference(k.what), reason: k.reason, by: k.by ?? null, at: k.at ?? null, ...(k.truth ? { truth: k.truth } : {}), ...(k.review ? { review: k.review } : {}), ...(k.due ? { due: true } : {}) }));
        if (kept.length) c.kept = kept;
        if (a11y.length) c.a11yFindings = a11y;
        // A product that draws its own version of it (Gate [10]) is in its Used in too, said so, so a product never
        // reads as not using it when it shows one of its own.
        for (const x of by.get(c.name) ?? []) {
          const m = /^[\w-]+: (.+?) draws its own instead of using it \((.+) in (.+)\)$/.exec(x.what ?? '');
          if (!m) continue;
          const g = (cfg.styleguide?.plugins ?? []).find((p) => p.name === m[1] || m[3].includes(p.match ?? '\u0000'));
          const key = g?.key ?? m[1];
          c.usage = (c.usage ?? []).filter((u) => (u.key ?? u) !== key).concat([{ key, name: g?.name ?? m[1], ...(typeof g?.href === 'string' && /^https?:\/\//.test(g.href) ? { href: g.href } : {}), ownInstead: m[2] }]);
        }
      }
      view.differences = { total: d.total ?? 0, kept: (d.kept ?? []).length, at: d.at ?? null, file: `${OUT_DIR}/differences.md` };
    } catch { /* no full audit yet: nothing to list */ }
    // When each component last changed: the latest commit on its own CSS rules and its contract and config entries (git
    // blame on their lines), and the day Figma was last read for it (the props snapshot). A line not committed yet says so.
    try {
      const { codeReason, prefetchReasons } = await import('./change-reason.mjs');
      const { ruleLines, entryLines } = await import('./styleguide-data.mjs');
      const sheets = [...new Set([...themeFiles, ...(ctx?.componentSheets ?? [])])].map((f) => [f, readText(f)]).filter(([, t]) => t);
      // its entries in the contract and config files (structure-contract.mjs, contract.authored.json, ds-config.json)
      const entries = ['structure-contract.mjs', 'contract.authored.json', 'ds-config.json'].map((f) => [f, readText(f)]).filter(([, t]) => t);
      prefetchReasons(ROOT, [...sheets, ...entries].map(([f]) => `${f}:1`));   // read from GitLab: every file in one go
      const figmaRead = String(ctx?.propsSnap?._updated ?? '') || null;   // the date and time of the read
      for (const c of view.components) {
        let latest = null, uncommitted = false;
        const at = [...sheets.flatMap(([f, t]) => ruleLines(t, c.cls).map((l) => `${f}:${l}`)), ...entries.flatMap(([f, t]) => entryLines(t, c.name).map((l) => `${f}:${l}`))];
        for (const a of at) {
          const r = codeReason(ROOT, a);
          if (r?.uncommitted) uncommitted = true;
          else if (r?.time && (!latest || r.time > latest.time)) latest = r;
        }
        if (latest || uncommitted || figmaRead) c.updated = { ...(latest ? { code: latest } : {}), ...(uncommitted ? { uncommitted: true } : {}), ...(figmaRead ? { figmaRead } : {}) };
      }
    } catch { /* outside git: no dates */ }
    // Figma's annotations, as documentation: those on the component (props snapshot) and those inside it that the
    // contract records (an annotation on a variant's Actions frame), each once.
    for (const c of view.components) {
      const fromFigma = (ctx?.propsSnap?.[c.name]?.annotations ?? []).map((a) => String(a?.label ?? a?.labelMarkdown ?? a ?? '').trim());
      const inside = Object.keys(contract.CONTRACT?.[c.name]?.annotations ?? {});
      const all = [...new Set([...fromFigma, ...inside].filter(Boolean))];
      if (all.length) c.annotations = all;
    }
    // A component whose code selector names it inside another (.segmented-control button): its view draws one.
    // The parent itself (the segmented control, whose class is the selector's first part) stays whole.
    const camel = (k) => k.replace(/^\./, '').replace(/[-_]+(\w)/g, (m, ch) => ch.toUpperCase()).toLowerCase();
    for (const c of view.components) {
      const sel = String(locator.selectorFor?.(c.name) ?? '').trim(); if (!/\s/.test(sel)) continue;
      const parts = sel.split(/\s+/);
      if (camel(parts[0]) === c.name.toLowerCase()) continue;
      c.only = parts.pop();
    }
    // Its slots, as documentation: each one's name and how Figma lets it be filled (empty at first, only its preferred
    // components, at least or at most so many), the preferred components named when the structure snapshot has them.
    const structSnap = readJson(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json')?.components ?? {};
    // Each component's height in Figma (its default variant), so the page can read how round a radius is on it (the
    // radius against half the height): the Identity page's shape analysis.
    view.figmaHeights = Object.fromEntries(Object.entries(structSnap).filter(([n, c]) => n && !/^[_.]/.test(n) && Number(c?.h) > 0).map(([n, c]) => [n, Math.round(Number(c.h))]));
    // Each component's shape as Figma draws it, for systems that name no radius token per component: the radius variable
    // bound on its frame (or its radius in px) and whether its default variant has a border.
    view.figmaShapes = Object.fromEntries(Object.entries(structSnap).filter(([n, c]) => n && !/^[_.]/.test(n) && c && typeof c === 'object').map(([n, c]) => [n, {
      h: Number(c.h) > 0 ? Math.round(Number(c.h)) : null,
      rVar: typeof c.innerRadiusVar === 'string' ? c.innerRadiusVar : typeof c.radiusVar === 'string' ? c.radiusVar : null,
      rPx: Number.isFinite(Number(c.radiusPx)) && c.radiusPx !== null ? Number(c.radiusPx) : null,
      stroke: typeof c.strokeOnDefault === 'boolean' ? c.strokeOnDefault : null,
    }]));
    for (const c of view.components) {
      const defs = ctx?.propsSnap?.[c.name]?.properties ?? {};
      const slots = Object.entries(defs).filter(([, d]) => d?.type === 'SLOT').map(([k, d]) => {
        const name = k.replace(/#.*$/, ''), st = d.slotSettings ?? {};
        const names = structSnap[c.name]?.slots?.[name] ?? [];
        return { name, description: d.description || '', emptyAtFirst: !!st.displayEmptyByDefault, preferredOnly: !!st.allowPreferredValuesOnly,
          preferred: names, preferredCount: (d.preferredValues ?? []).length, min: st.minChildren ?? null, max: st.maxChildren ?? null };
      });
      if (slots.length) c.slots = slots;
      // Its width in Figma when Figma fixes it (a dialog 480 wide): the Playground draws it that wide, where a centred
      // stage would shrink one the code lets grow to fill its place.
      const box = structSnap[c.name]?.box;
      if (box?.sizing?.h === 'FIXED' && box.width > 0) c.figmaWidth = Math.round(box.width);
      // Its anatomy: the contract's named parts (the layer each one draws), a part named as a Figma slot marked as one.
      const slotNames = new Set(slots.map((sl) => sl.name.toLowerCase().replace(/[\s_-]+/g, '')));
      const own = (contract.CONTRACT?.[c.name]?.children ?? []).filter((k) => k?.name && typeof k.cssSelector === 'string' && k.cssSelector.trim());
      if (own.length) c.anatomy = own.map((k) => ({ name: k.name, selector: k.cssSelector, ...(slotNames.has(k.name.toLowerCase().replace(/[\s_-]+/g, '')) || /slot/i.test(k.name) ? { slot: true } : {}) }));
    }
    const liveApi = new Map();   // each component's API as its file says it now, for its contract's drift below
    // Its code API, as whoever uses it writes it: the props (each one the code says must be given marked), the events
    // it sends and its slots, read from the component's own file (component-api.mjs). An HTML and CSS system has none.
    if (cfg.frameworkComponents !== false) {
      try {
        const { createApiReader } = await import('./component-api.mjs');
        const { apiView, codeControls } = await import('./styleguide-data.mjs');
        const nodeIds = Object.fromEntries(Object.entries(ctx?.propsSnap ?? {}).filter(([, e]) => e?.nodeId).map(([n, e]) => [n, e.nodeId]));
        const reader = createApiReader(ROOT, cfg, { classFor: (n) => locator.classFor(n), nodeIds });
        // The project's own Code Connect: which Figma property each code prop is, and a badge on each it connects.
        const { codeConnectMaps, codeConnectFor } = await import('./code-connect-map.mjs');
        const ccMaps = codeConnectMaps(ROOT, { include: readJson('figma.config.json')?.codeConnect?.include ?? null });
        const { bestExample } = await import('./figma-examples.mjs');
        const examples = readJson(cfg.paths?.snapshotExamples ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-examples.snapshot.json'));
        for (const c of view.components) {
          const cc = codeConnectFor(ccMaps, c.name, nodeIds[c.name]);
          if (cc) c.codeConnect = { file: cc.file, props: cc.props };
          const api = reader.apiFor(c.name);
          liveApi.set(c.name, api);
          const v = api.file && apiView(api, relative(ROOT, api.file));
          // The Vue transition it enters and leaves with (<transition name="slide">), so its Playground can play both.
          if (api.file) { const t = /<transition\b[^>]*?\bname\s*=\s*["']([\w-]+)["']/i.exec(readText(api.file)) ?? (/<transition\b/i.test(readText(api.file)) ? [null, 'v'] : null); if (t) c.vueTransition = t[1]; }
          if (v) c.api = v;
          if (vueLists[c.name]) c.codeLists = vueLists[c.name];
          // What only its API takes is a Playground control too, when its own build drew each case of it.
          if (v && c.renders) c.controls = [...(c.controls ?? []), ...codeControls(c.controls ?? [], v, ctx?.propsSnap?.[c.name]?.properties ?? {}, c.codeConnect?.props ?? [])];
          // A value its Code Connect writes only while another prop is on (alignment with fullWidth): its control says so.
          if (cc) for (const k of c.controls ?? []) {
            const codes = cc.props.filter((p) => p.role === 'value' && p.code && String(p.figma).toLowerCase() === String(k.label).toLowerCase()).map((p) => p.code);
            const by = cc.props.filter((p) => p.role === 'condition' && codes.includes(p.code) && p.figma !== k.label && p.equals == null && !p.unclear && !p.event);
            if (by.length) k.onlyWith = [...new Map(by.map((p) => [p.figma, { label: p.figma, on: !p.negated }])).values()];
          }
          // Its text controls open on the words of the example its build drew (figma-examples.mjs), as the drawing does.
          const ex = bestExample(examples, c.name, ctx?.propsSnap?.[c.name]);
          if (ex && c.renders) for (const k of c.controls ?? []) if (k.type === 'TEXT' && typeof ex.props?.[k.label] === 'string' && ex.props[k.label].trim()) k.default = ex.props[k.label];
        }
      } catch { /* no component sources */ }
    }
    // Its accessibility: what its role and Figma's notes ask of it, each with the WCAG criterion, and what the last
    // browser check (the audit's a11y.json) found on it. The page measures the text contrast itself, as it is drawn.
    try {
      const { a11yView, staticRole } = await import('./styleguide-data.mjs');
      const { contractSemantics, A11Y_GUIDE, annotationUses } = await import('./a11y-check.mjs');
      const { partRolesOf } = await import('./behaviour-contract.mjs');
      const { annotationWording } = await import('./figma-edits.mjs');
      const authoredRoles = contractSemantics(ROOT, cfg);
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      const result = readJson(join(OUT_DIR, 'a11y.json'));
      for (const c of view.components) {
        const all = ctx?.propsSnap?.[c.name] ?? {};
        const entry = requirementEntry(all, cats, cfg);   // its duties come only from the notes that are requirements
        c.a11y = a11yView({ name: c.name, cls: c.cls, role: c.role ?? authoredRoles[c.name] ?? null, roleFrom: c.role ? 'figma' : authoredRoles[c.name] ? 'contract' : null,
          annotations: entry.annotations ?? [], parts: partRolesOf(entry), exceptions: authored[c.name]?.behaviourExceptions ?? {}, result, guide: A11Y_GUIDE, notes: annotationUses(all, { cats, cfg }) });
        // No role said anywhere, and a plain element at its root: none is its role, read from the code.
        if (!c.a11y.role) { const s = staticRole(c.markup); if (s) c.a11y.staticRole = s; }
      }
      // WCAG 2.2 at level A and AA: every criterion, how the engine covers it, in plain words, and what the checks
      // found (the page runs the in-page checks itself on every variant, wcag-page.js). What the code does (shortcuts,
      // timers, gestures, device motion) is read here, each finding given to the component its file or its code names.
      const { WCAG22, WCAG21_GUIDE } = await import('./wcag21.mjs');
      const { staticA11y } = await import('./a11y-static.mjs');
      const { wcagStatics } = await import('./styleguide-data.mjs');
      const st = cfg.a11yStatic === false ? null : staticA11y(ROOT);
      const statics = st ? wcagStatics(st.findings, view.components) : {};
      for (const c of view.components) if (c.a11y) { c.a11y.static = statics[c.name] ?? []; c.a11y.audited = result && !c.a11y.checked?.notRead ? { at: result.checkedAt ?? null, ran: result.ran ?? [] } : null; }
      // What a person checked by hand: each criterion with who and when, current while the component is as it was.
      const ck = await import('./checked.mjs');
      const checks = ck.readChecked(ROOT);
      if (checks.length) for (const c of view.components) if (c.a11y) { const own = ck.checksFor(checks, c.name, ck.componentSignature(ROOT, cfg, c.name, c.cls)); if (Object.keys(own).length) c.a11y.confirmed = own; }
      // Where its accessibility is read from, each source with what it holds and what uses it: each Figma annotation
      // (annotationUses), the team's guidelines (a Notion or GitLab page fetched into a file, or a committed one: the
      // agents read the section named after it as design intent, no check reads it), the authored contract, its code,
      // the browser.
      const intentNow = designIntent();
      const glFiles = intentNow.guidelines?._sources ?? [];
      const A11Y_WORDS = /\b(role|aria|keyboard|screen ?reader|focus|escape|tab key|contrast|label|alt text|announce|accessib|wcag)/i;
      const glWhere = (f) => (/notion/i.test(f) ? `Notion, fetched into ${f}` : /gitlab/i.test(f) ? `GitLab, fetched into ${f}` : f);
      for (const c of view.components) {
        if (!c.a11y) continue;
        const src = [];
        for (const n of c.a11y.notes ?? []) {
          // A note in a design-intent category is never rewritten for a check; one no check reads is work to do only
          // when it states accessibility (its category, else a wording a check reads).
          const intent = n.kind && n.kind !== 'accessibility';
          const wording = n.uses.length || intent ? null : annotationWording(n.text, n.layer ?? null);
          const todo = !n.uses.length && noteIsTodo(n.kind ?? null, wording);
          src.push({ st: n.uses.length ? 'done' : 'agents', from: n.layer ? `Figma annotation on its "${n.layer}" layer` : 'Figma annotation', what: n.text, used: n.uses, ...(n.kind ? { kind: n.kind } : {}), ...(wording ? { wording } : {}), ...(todo ? { todo: true } : {}) });
        }
        if (!(c.a11y.notes ?? []).length) src.push({ st: 'none', from: 'Figma annotations', what: 'None on it.', used: [] });
        const gl = intentNow.components?.[c.name]?.guidelines;
        if (glFiles.length) {
          const lines = gl ? gl.split('\n').map((l) => l.trim()).filter((l) => l && A11Y_WORDS.test(l)) : [];
          src.push({ st: !gl ? 'none' : 'agents', from: `Guidelines (${glFiles.map(glWhere).join('; ')})`, what: !gl ? 'No section named after it.' : lines.length ? lines.slice(0, 4).join(' ') : 'A section named after it, with nothing about accessibility.', used: [] });
        }
        if (authoredRoles[c.name]) src.push({ st: c.a11y.roleFrom === 'contract' ? 'done' : 'agents', from: 'contract.authored.json (semantics)', what: `Role ${authoredRoles[c.name]}.`, used: c.a11y.roleFrom === 'contract' ? ['its role: what that role owes is tried in the browser'] : ['nothing for now: Figma states its role, which comes first'] });
        const ex = Object.keys(authored[c.name]?.behaviourExceptions ?? {});
        if (ex.length) src.push({ st: 'done', from: 'contract.authored.json (behaviourExceptions)', what: ex.join(', '), used: ['what is not asked of it, each with its reason'] });
        if (st) src.push({ st: 'done', from: 'Read from the code', what: `The scripts, the markup and the CSS of the project (${st.files.scripts ?? 0} scripts).`, used: [`single-key shortcuts, short timers, gestures and device motion${(statics[c.name] ?? []).length ? `: ${(statics[c.name] ?? []).length} found on it` : ', none found on it'}`] });
        src.push({ st: 'done', from: 'Tested now', what: 'The component as drawn here, in every variant.', used: ['the checks marked Tried in the browser on every variant'] });
        src.push(result ? { st: c.a11y.checked?.notRead ? 'none' : 'done', from: result.checkedAt ? `Tested on ${new Date(result.checkedAt).getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date(result.checkedAt).getMonth()]} (${(result.target ?? []).join(', ') || 'its page'})` : `Tested at the last audit (${(result.target ?? []).join(', ') || 'its page'})`, what: result.checkedAt ? `Run ${result.checkedAt.slice(0, 16).replace('T', ' ')}.` : 'Its last run.', used: c.a11y.checked?.notRead ? [`nothing: ${c.a11y.checked.why ?? 'it was not drawn on the page the audit opened'}`] : ['real key presses, zoom, text spacing, reflow, a keyboard trap, and what Figma\'s annotations state'] }
          : { st: 'none', from: 'Not tested yet', what: 'The audit has not run yet.', used: [] });
        c.a11y.sources = src;
      }
      const say = (g) => ({ one: g.title(1), many: g.title(7).replace(/^7 /, '{n} '), fix: g.fix });
      view.wcag21 = { criteria: WCAG22, guide: Object.fromEntries(Object.entries(WCAG21_GUIDE).map(([k, g]) => [k, say(g)])), staticRan: !!st };
    } catch { /* the page shows what it can measure */ }
    // How to use it: the same four sections on every page, from what Figma, the code and the authored contract say.
    try {
      const { guidanceView } = await import('./styleguide-data.mjs');
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      // What the products get wrong with it, from the last audit: a rule laid over it, a look-alike, a parent overriding it.
      const PRODUCT_MISUSE = /hand-built|look-?alike|Nested components keep|Templates compose/i;
      const seenIn = (c) => (c.differences ?? []).filter((d) => PRODUCT_MISUSE.test(d.check ?? '') || / laid over it /.test(d.what ?? '')).map((d) => d.plain ?? d.what);
      const ilNow = designIntent().components ?? {};
      const hasLayer = !!(cfg.intentLayer || cfg.stores?.intentLayer);
      // What of its notes (Figma's annotations, the code's notes) no agent is given, with why, what to do and whether to
      // remove it: the same choice the prototype context makes (prototype-context.mjs → notesOf).
      const { notesOf, intentText } = await import('./prototype-context.mjs');
      for (const c of view.components) {
        const left = notesOf(ilNow[c.name] ?? {}, intentText(c.description) || intentText(ilNow[c.name]?.design?.description) || null).left;
        if (left.length) c.notesLeft = left;
      }
      // Its intent-layer page, read from the layer's snapshot itself, so a style guide built on its own (--styleguide)
      // has it without the design intent being written again.
      const ilMod = await import('./intent-layer.mjs');
      // Read again where it lives first (GitLab): nothing is fetched while its commit has not moved, and when it cannot be
      // read the copy kept is used and said, never silently.
      if (hasLayer && !opts.offline) { try { for (const r of await ilMod.syncSources(ROOT, cfg)) if (r.line) console.log('   ' + r.line); } catch (e) { console.log('   ⚠️  Intent layer: ' + String(e.message).split('\n')[0]); } }
      // intentLayer.autoFix "commit": the layer's fixes committed before the guide reads it (once a run, with the audit).
      if (hasLayer && !opts.offline) { try { const fixed = await (await import('./intent-changes.mjs')).autoFix(ROOT, cfg); if (fixed) console.log('   ' + fixed); } catch { /* the guide is built from the layer as read */ } }
      const ilSnap = ilMod.readIntentLayer(ROOT, cfg);
      const ilMatch = ilSnap ? ilMod.matchComponents(view.components.map((c) => c.name), ilSnap.entities, ilMod.codeFilesOf(ROOT, cfg)) : new Map();
      // What the system contradicts on each page (intent-truth.mjs): left out of its documentation, and said.
      const ilWrong = (await import('./intent-truth.mjs')).checkedLayer(ROOT, cfg, ilSnap);
      for (const c of view.components) {
        const il = ilMatch.has(c.name) ? ilMod.componentIntent(ilMatch.get(c.name), ilSnap._source, ilWrong(ilMatch.get(c.name))) : ilSnap ? null : (ilNow[c.name]?.intentLayer ?? null);
        // The intent layer merged into its documentation, each line under its source (Figma, the code, the intent layer,
        // the contract); the Documentation page reviews every page of it apart.
        if (!il && hasLayer) c.intentLayer = { none: true };
        if (il) c.intentLayer = { source: il.source ?? 'the intent layer', file: il.file, url: il.url, purpose: il.purpose ?? null, status: il.status ?? null, whenToUse: il.whenToUse ?? null, whenNotToUse: il.whenNotToUse ?? null, mistakes: il.mistakes ?? null, limitations: il.limitations ?? null, rules: il.rules ?? null, sections: il.sections ?? null, facts: il.facts ?? null, repeated: il.repeated ?? 0 };
        c.guidance = guidanceView({ description: c.description, annotations: c.annotations, note: c.note, authored: authored[c.name]?.guidance, seen: seenIn(c), intentLayer: il });
      }
    } catch { /* no guidance */ }
    // The intent layer: every page, what the agents get from it and where, what they do not and why (intent-layer.mjs).
    try {
      const il = await import('./intent-layer.mjs');
      const snap = il.readIntentLayer(ROOT, cfg);
      if (snap) {
        // The components the agents get (the design intent's: Figma's, or with no Figma data the code's), not only the
        // ones this page shows, so the page and the audit judge each page alike.
        const from = il.namesFrom(ROOT, cfg);
        const truth = await import('./intent-truth.mjs');
        // The layer checked, each of the team's decisions proposed an answer, and the answers given applied
        // (intent-proposals.mjs): a row the team has settled is no longer asked of them.
        const decided = await (await import('./intent-proposals.mjs')).decidedLayer(ROOT, cfg);
        const report = decided.report, wrongOf = decided.wrongOf;
        const counts = report.pages.reduce((t, p) => (t[p.action] = (t[p.action] ?? 0) + 1, t), {});
        const src = snap._source ?? {};
        view.intentLayer = { source: { url: src.url ?? null, ref: src.ref ?? null, sha: src.sha ?? null, committedAt: src.committedAt ?? null, fetchedAt: src.fetchedAt ?? null }, counts: report.counts, actions: Object.fromEntries(il.ACTIONS.map(([k]) => [k, counts[k] ?? 0])), actionLabels: il.ACTIONS, wrongKinds: truth.KINDS, namesFrom: from, repeated: snap.boilerplate ?? 0, pages: report.pages.map((p, i) => ({ ...p, reads: il.agentText(snap.entities[i], src, wrongOf(snap.entities[i])) })),
          noPage: decided.noPage, addProposals: decided.addProposals };
        // What else the agents read about each component, beside its intent-layer page, each with where it comes
        // from: Figma's description and annotations, the code's own note. And the spec a page is written from, when
        // the layer has one by its name (the page's own file else), so a line can be changed where it is written.
        const compBy = new Map(view.components.map((c) => [c.name, c]));
        const otherSources = (name) => {
          const c = compBy.get(name); if (!c) return [];
          const paras = (t) => String(t ?? '').split(/\n\s*\n|\r?\n(?=\s*[-*•])/).map((x) => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
          return [['Figma description', paras(c.description)], ['Figma annotation', (c.annotations ?? []).map(String).filter(Boolean)], ['Code', paras(c.note)]].filter(([, l]) => l.length).map(([source, lines]) => ({ source, lines }));
        };
        const layerFiles = new Set((await import('./doc-source-dsds.mjs')).readSnapshot(ROOT, cfg)?.layerFiles ?? []);
        const kebab = (x) => String(x ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const dedupe = (n) => { const w = String(n).split(/\s+/); for (let k = Math.floor(w.length / 2); k > 0; k--) if (w.slice(-k).join(' ') === w.slice(-2 * k, -k).join(' ')) return w.slice(0, -k).join(' '); return n; };
        const specOf = (p) => {
          const code = String(p.code ?? '').split('/').pop().replace(/\.[^.]+$/, '');
          for (const f of [kebab(p.name), kebab(dedupe(p.name)), kebab(code)].filter(Boolean)) for (const d of ['specs/components', 'specs/templates', 'specs/patterns', 'specs/foundations']) if (layerFiles.has(`${d}/${f}.md`)) return `${d}/${f}.md`;
          return null;
        };
        for (const p of view.intentLayer.pages) { const sp = p.spec ? null : specOf(p); if (sp) { p.spec = sp; if (p.url && p.file && p.url.includes(p.file)) p.specUrl = p.url.replace(p.file, sp); } if (p.component) { const o = otherSources(p.component); if (o.length) p.others = o; } }
        view.intentLayer.noPageOthers = Object.fromEntries(decided.noPage.map((n) => [n, otherSources(n)]).filter(([, o]) => o.length));
      }
    } catch { /* no intent layer */ }
    // For agents: what an agent can take from the team's guidance for each component, its guidelines section and
    // Figma's words, rated ready, partial or thin, with what to add; the last extraction test's share when one ran.
    try {
      const gr = await import('./guidance-rating.mjs');
      const { ingestGuidelines } = await import('./intent-gen.mjs');
      const { facts, props } = gr.readFacts(ROOT, cfg);
      if (Object.keys(facts.components).length) {
        const gl = ingestGuidelines(ROOT, cfg);
        // Figma's words and, when there is one, each component's intent-layer page: wherever the team wrote it.
        const ilm = await import('./intent-layer.mjs');
        const ilSnap = ilm.readIntentLayer(ROOT, cfg);
        const words = gr.figmaWords(props);
        for (const [n, t] of Object.entries(ilm.intentWords(ilSnap, Object.keys(facts.components), ilm.codeFilesOf(ROOT, cfg)))) words[n] = [words[n], t].filter(Boolean).join('\n');
        const rating = gr.rateGuidance(gr.sectionsFrom(gl, facts, words), facts);
        const last = readJson(join(OUT_DIR, 'guidance-rating.json'));
        const extracted = Object.fromEntries((last?.components ?? []).filter((x) => typeof x.extracted === 'number').map((x) => [x.name, x.extracted]));
        // A name it calls unknown counts only when the content check also finds it nowhere in the system (its code,
        // Figma, its files): the same answer as the Documentation page's.
        let truth = null; try { const it = await import('./intent-truth.mjs'); const f = it.systemFacts(ROOT, cfg, { record: false }); truth = (n) => it.inSystem(f, n); } catch { /* the rating's own answer */ }
        if (truth) for (const r of rating.components) { const known = (r.unknown ?? []).filter(truth); r.unknown = (r.unknown ?? []).filter((n) => !known.includes(n)); r.add = (r.add ?? []).filter((x) => !known.some((n) => x.startsWith('`' + n + '`'))); }
        const byName = new Map(rating.components.map((r) => [r.name, r]));
        for (const c of view.components) {
          const r = byName.get(c.name); if (!r) continue;
          c.agentRating = { cls: r.cls, pieces: r.pieces, unknown: r.unknown, add: r.add, from: [...gl.sources, 'Figma', ...(ilSnap ? ['the intent layer'] : [])], ...(c.name in extracted ? { extracted: extracted[c.name] } : {}) };
        }
        view.agentRating = { cls: rating.cls, ready: rating.ready, partial: rating.partial, thin: rating.thin, total: rating.total };
      }
    } catch { /* no rating */ }
    // What agents got wrong in prototypes (page-check.mjs): each component's mistakes and what its documentation lacked,
    // so the gap shows where the team writes, not only in the agent's reply.
    try {
      const inv = readJson(join(ROOT, OUT_DIR, 'prototypes', 'inventions.json'))?.byComponent ?? {};
      const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      const byKey = new Map(Object.entries(inv).map(([n, b]) => [key(n), b]));
      for (const c of view.components) { const b = byKey.get(key(c.name)); if (b?.count) c.inventions = b; }
      // What an agent cannot learn about it from its documentation (--prototype --coverage).
      const cov = readJson(join(ROOT, OUT_DIR, 'prototypes', 'doc-coverage.json'))?.components ?? {};
      const covKey = new Map(Object.entries(cov).map(([n, b]) => [key(n), b]));
      for (const c of view.components) { const b = covKey.get(key(c.name)); if (b?.missing?.length) c.docCoverage = b.missing.filter((m) => !['page', 'purpose', 'example'].includes(m.kind)); }
      // Needs its page names for which agents picked another component (--prototype --scenarios).
      const conf = readJson(join(ROOT, OUT_DIR, 'prototypes', 'stress.json'))?.scenarios?.confusions ?? {};
      const confKey = new Map(Object.entries(conf).map(([n, b]) => [key(n), b]));
      for (const c of view.components) { const b = confKey.get(key(c.name)); if (b?.length) c.confusions = b; }
      const ownless = new Set((readJson(join(ROOT, OUT_DIR, 'prototypes', 'stress.json'))?.scenarios?.ownless ?? []).map(key));
      for (const c of view.components) if (ownless.has(key(c.name))) c.noOwnUse = true;
    } catch { /* no prototype checked yet */ }
    // Its properties: in its contract. The one everybody reads is in the team's intent layer (published there with
    // --contracts-out through a merge request): its Contract button opens it on GitLab, and its Documentation says what it
    // lists and whether that still matches the code and Figma (shared-contracts.mjs). With none published yet, the
    // engine's local one is named, as a task to publish. { file, href?, shared?, props: [names], drift? }
    try {
      const shared = (await import('./intent-layer.mjs')).readIntentLayer(ROOT, cfg)?.contracts ?? [];
      const { sharedContractFor, contractDrift } = await import('./shared-contracts.mjs');
      const dir = cfg.contracts?.out ? resolve(ROOT, cfg.contracts.out) : join(ROOT, 'contracts');
      for (const c of view.components) {
        const api = liveApi.get(c.name);
        const read = !!api?.file;
        const k = sharedContractFor(shared, c.name, read ? relative(ROOT, api.file) : null);
        if (k) {
          const figma = k.name === c.name && ctx?.propsSnap?.[c.name]?.properties ? Object.keys(ctx.propsSnap[c.name].properties) : null;
          const drift = contractDrift(k, { codeProps: read ? Object.keys(api.props ?? {}) : null, events: read ? api.events ?? [] : null, slots: read ? [...(api.slots?.default ? ['default'] : []), ...(api.slots?.named ?? [])] : null, figmaProps: figma });
          c.contract = { file: k.file, ...(k.url ? { href: k.url } : {}), shared: true, props: k.props, ...(drift.length ? { drift } : {}) };
          continue;
        }
        const file = join(dir, c.name + '.contract.json');
        const local = readJson(file); if (!local || !Array.isArray(local.props)) continue;
        c.contract = { file: relative(ROOT, file), props: local.props.map((p) => p?.name).filter(Boolean) };
      }
      // The copies an older build put beside the guide are gone: the Contract button opens the shared file.
      const beside = join(dirname(projectOut), 'contracts');
      try { if (existsSync(beside) && readdirSync(beside).every((f) => f.endsWith('.contract.json'))) rmSync(beside, { recursive: true }); } catch { /* kept */ }
    } catch { /* no contracts */ }
    const { segmentedUi, tabsUi, standInGaps, fieldUi, buttonUi, cardUi, motionUi, primitiveColours, iconButtonUi, tipUi } = await import('./styleguide-data.mjs');
    const systemCss = themeFiles.map(readText).join('\n');
    // The colours in the order a reader meets them: the primitive ramp (when the theme carries Figma's values for it in
    // every mode), the semantic roles, then each component's own.
    // What belongs to one component is shown in that component, not in the foundations: a colour group or a size
    // named after it (badge/…, button/… for every button) goes to the component's own view. Icon strokes go to the
    // icons, the text sizes stay with the text styles, and the rest of the sizes join the spacing.
    if (view.tokens) {
      const owners = (prefix) => view.components.filter((c) => { const a = c.name.toLowerCase(), b = String(prefix).toLowerCase(); return a === b || a.startsWith(b); });
      // Which tokens point at which (the vars snapshot's alias chains), so a group named after no component (window
      // chrome colours only some components' tokens point at) is shown in those components.
      const aliasSnap = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json')?.aliases ?? {};
      const pointers = new Map();   // a token's name → the component names whose tokens point at it
      for (const modeAliases of Object.values(aliasSnap)) for (const [from, chain] of Object.entries(modeAliases ?? {})) {
        const by = owners(from.split('/')[0]).map((c) => c.name);
        if (!by.length) continue;
        for (const to of [].concat(chain ?? [])) { const k = String(to).replace(/\/color$/, ''); (pointers.get(k) ?? pointers.set(k, new Set()).get(k)); by.forEach((n) => pointers.get(k).add(n)); }
      }
      // A token named after a component anywhere in its name (advanced/buttonPrimary/…) is that component's.
      const sq = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      const named = (name) => { const parts = String(name).split('/').slice(1).map(sq); return view.components.filter((c) => parts.includes(sq(c.name))); };
      // The foundations are the system's shared layers (primitives, semantic, base); everything else is a component's.
      const FOUNDATION = /^(primitives?|semantics?|base|core|global|foundations?)$/i;
      const layered = (view.tokens.colors ?? []).some((g) => FOUNDATION.test(g.group));
      const keepColours = [];
      for (const g of view.tokens.colors ?? []) {
        if (FOUNDATION.test(g.group) || /^(primitives|semantic)$/i.test(g.group)) { keepColours.push(g); continue; }
        const stay = [];
        for (const t of g.items) {
          const name = String(t.figma ?? '');
          let own = owners(/^color$/i.test(g.group) ? name.split('/')[0] : g.group);
          if (!own.length) own = named(name);
          if (!own.length) { const users = [...(pointers.get(name) ?? [])]; own = view.components.filter((c) => users.includes(c.name)); }
          if (!own.length) { stay.push(t); continue; }
          for (const c of own) (c.ownTokens ??= { colors: [], sizes: [] }).colors.push(t);
        }
        if (stay.length && !layered) keepColours.push({ ...g, items: stay });
      }
      view.tokens.colors = keepColours;
      // The same for the spacing and the radii: a component's own size goes to it, the shared ones stay.
      // With the system in layers, a foundation lists its shared ones only (spacing/…, radius/…, base/…, semantic/…).
      const SHARED = /^(primitives?|semantics?|base|core|global|foundations?|spacing|space|radius|radii|corner|sizes?|sizing)$/i;
      for (const k of ['spacing', 'radii']) view.tokens[k] = (view.tokens[k] ?? []).filter((t) => {
        const own = named(t.figma);
        if (!layered) return true;   // a system not in layers keeps every size in its foundations, as before
        if (own.length) { for (const c of own) (c.ownTokens ??= { colors: [], sizes: [] }).sizes.push(t); return false; }
        return SHARED.test(String(t.figma).split('/')[0]);
      });
      const iconStrokes = [], general = [];
      for (const t of view.tokens.sizing ?? []) {
        const prefix = t.figma.split('/')[0];
        if (/^typography$/i.test(prefix)) continue;
        if (/^icons?$/i.test(prefix)) { iconStrokes.push(t); continue; }
        const own = owners(prefix).length ? owners(prefix) : named(t.figma);
        if (own.length) { for (const c of own) (c.ownTokens ??= { colors: [], sizes: [] }).sizes.push(t); continue; }
        if (layered && !SHARED.test(prefix)) continue;   // a component's own size, named for no component on the page
        general.push(t);
      }
      view.tokens.spacing = [...(view.tokens.spacing ?? []), ...general];
      view.tokens.iconStrokes = iconStrokes;
      view.tokens.sizing = [];
    }
    // Every variable Figma has, in each of its modes, for the Tokens page (allVariables, styleguide-data.mjs).
    try { const { allVariables } = await import('./styleguide-data.mjs'); const av = allVariables(readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, systemCss, readJson(cfg.figmaCli?.designJson ?? 'design.json')); if (av.length) view.allVars = av; } catch { /* the page lists the agreed tokens */ }
    // Each token's Figma collection, when the capture kept it (Tokens page); else the page groups by its name's first part.
    {
      const of = (readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {})._collections?.of ?? null;
      const mark = (t) => { if (t && t.figma && of?.[t.figma]) t.collection = of[t.figma]; };
      if (of && view.tokens) {
        for (const g of view.tokens.colors ?? []) for (const t of g.items ?? []) mark(t);
        for (const k of ['spacing', 'radii', 'iconStrokes']) for (const t of view.tokens[k] ?? []) mark(t);
        for (const st of view.tokens.typography ?? []) for (const k of ['size', 'weight', 'lh', 'ls', 'textTransform']) mark(st[k]);
      }
    }
    if (view.tokens?.colors) {
      const prim = primitiveColours(readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, systemCss, cfg);
      // The ramp read from Figma's values when the snapshot carries them; else the primitives the token check agreed.
      const agreedPrim = view.tokens.colors.find((g) => /^primitives?$/i.test(g.group)) ?? null;
      const rest = view.tokens.colors.filter((g) => !/^primitives?$/i.test(g.group));
      const ramp = prim ?? agreedPrim;
      view.tokens.colors = [...(ramp ? [ramp] : []), ...rest.filter((g) => /^semantic/i.test(g.group)), ...rest.filter((g) => !/^semantic/i.test(g.group))];
    }
    // How each component moves (an entry, an exit, an overlay it opens in), so its preview can play it.
    const allCss = [systemCss, ...(ctx?.componentSheets ?? []).map(readText)].join('\n');
    // What uses each token, for the page's "What uses it" view.
    // When the page was built: a row read then (its code, the team's notes, a stand-in) says so in its Updated column.
    view.builtAt = new Date().toISOString();
    // What it was built from: the code commit, the Figma version and the engine, also in the page's <head>.
    view.built = buildStamp(ROOT, { vars: readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), at: view.builtAt });
    try { const { tokenUses } = await import('./styleguide-data.mjs'); view.tokenUses = tokenUses(allCss, view.components); } catch { /* none listed */ }
    // Every token each component is drawn with (its parts and states too, seen in this variant or not), by Figma's name.
    try {
      const { allComponentTokens } = await import('./styleguide-data.mjs');
      const named = new Map(), put = (t) => { if (t?.var && t.figma && !named.has(t.var)) named.set(t.var, t.figma); };
      const T = view.tokens ?? {};
      for (const g of T.colors ?? []) (g.items ?? []).forEach(put);
      for (const k of ['spacing', 'radii', 'sizing', 'iconStrokes', 'shadows']) (T[k] ?? []).forEach(put);
      for (const t of T.typography ?? []) for (const k of ['size', 'weight', 'lh', 'family', 'tracking']) put(t[k]);
      for (const c of view.components) for (const t of [...(c.ownTokens?.colors ?? []), ...(c.ownTokens?.sizes ?? [])]) put(t);
      const classes = view.components.map((c) => c.cls).filter((x) => x && !/^#/.test(x));
      for (const c of view.components) {
        if (!c.cls) continue;
        const own = allComponentTokens(allCss, c.cls, classes);
        // The tokens named after it that its rules reach only through another token stay listed too.
        for (const t of [...(c.ownTokens?.colors ?? []), ...(c.ownTokens?.sizes ?? [])]) if (!own.some((e) => e.var === t.var)) own.push({ var: t.var, props: [] });
        if (own.length) c.allTokens = own.map((e) => ({ var: e.var, figma: named.get(e.var) ?? null, props: e.props }));
      }
      // What each component's tokens say they are for (Figma's variable descriptions, and a text style's own), for its
      // Documentation: an agent reads them to pick the right token, so a token with none is a line to write.
      const said = (await import('./styleguide-data.mjs')).tokenDescriptions(readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {});
      // Every Figma variable named after a component (advanced/buttonPromo/shadow/X) is that component's too, the
      // code using it or not.
      const vsnap = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {};
      // Every variable Figma has, of every kind: colours (by mode), sizes, and its switches, words, timings and effects.
      const allNames = [...new Set([...Object.values(vsnap.color ?? {}).flatMap((m) => Object.keys(m ?? {})), ...['sizing', 'booleans', 'strings', 'motion', 'effects'].flatMap((k) => Object.keys(vsnap[k] ?? {}))])];
      const sqz = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      // A token belongs to every component that uses it: in its code, named after it, bound on its Figma component (the
      // structure snapshot names each variable a component's parts use), and what each of those points at (its alias
      // chain, primitives aside). A description written once in Figma then shows on every one of them.
      const prim = cfg.figma?.primitivePrefix ?? 'primitives/';
      const bare = (n) => String(n).replace(/\/colou?r$/, '');
      const known = new Set(allNames.map(bare));
      const struct = readJson(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json')?.components ?? {};
      const boundBy = (entry) => { const out = new Set(); const walk = (o) => { if (typeof o === 'string') { if (known.has(bare(o))) out.add(bare(o)); } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v); }; walk(entry); return out; };
      const chain = new Map();
      for (const m of Object.values(vsnap.aliases ?? {})) for (const [n, to] of Object.entries(m ?? {})) for (const t of to ?? []) if (!String(t).startsWith(prim)) { if (!chain.has(bare(n))) chain.set(bare(n), new Set()); chain.get(bare(n)).add(bare(t)); }
      const tokensOf = (name, extra = []) => {
        // Named after it: its name (navigation/TabMobile too, part by part) among the first segments of the token's path.
        const want = String(name).split('/').map(sqz).filter(Boolean);
        // Or its family's: a token group its name starts with, at a word (tooltip for tooltipOpen, card for cardTop).
        const head = String(name).split('/')[0];
        const family = (g) => g.length >= 4 && head.length > g.length && head.startsWith(g) && /^[A-Z0-9]/.test(head.slice(g.length));
        const mine = allNames.filter((n) => { const raw = n.split('/'), seg = raw.map(sqz); return [0, 1].some((i) => (want.length && want.every((w, k) => seg[i + k] === w)) || family(raw[i] ?? '')); }).map(bare);
        const set = new Set([...extra, ...mine, ...boundBy(struct[name])].filter(Boolean).map(bare));
        for (const n of [...set]) for (const t of chain.get(n) ?? []) set.add(t);
        return [...set].filter((n) => !n.startsWith(prim)).sort();
      };
      const used = new Set(), namesOf = new Map();
      for (const c of view.components) {
        const names = tokensOf(c.name, [...(c.allTokens ?? []).map((t) => t.figma), ...[...(c.ownTokens?.colors ?? []), ...(c.ownTokens?.sizes ?? [])].map((t) => t.figma)]);
        namesOf.set(c.name, names);
        names.forEach((n) => used.add(n));
        if (!names.length) continue;
        c.tokenDocs = { total: names.length, described: names.filter(said).map((n) => ({ figma: n, description: said(n) })), missing: names.filter((n) => !said(n)) };
      }
      // A Figma component with no page of its own (one the code does not have, or one to confirm): its tokens too, for
      // its row on the Status page.
      const onPage = new Set(view.components.map((c) => c.name));
      for (const name of Object.keys(struct)) {
        if (onPage.has(name) || name.startsWith('_')) continue;
        const names = tokensOf(name);
        namesOf.set(name, names);
        names.forEach((n) => used.add(n));
        const missing = names.filter((n) => !said(n));
        if (missing.length) (view.pagelessTokens ??= {})[name] = { total: names.length, missing };
      }
      // Which components use each token, by its Figma name (without /color): the same reach as above (its code, its name,
      // its Figma bindings, the aliases), and the primitives those point at too, for the Tokens page's "Used by"; the
      // Figma components with no page of their own too (listed, unlinked).
      const chainAll = new Map();
      for (const m of Object.values(vsnap.aliases ?? {})) for (const [n, to] of Object.entries(m ?? {})) for (const t of to ?? []) { if (!chainAll.has(bare(n))) chainAll.set(bare(n), new Set()); chainAll.get(bare(n)).add(bare(t)); }
      // The code's own aliases too (--a: var(--b)), sizes and radii among them, which the colour aliases above do not hold.
      const cssRefs = new Map(), byVar = new Map();
      for (const m of String(allCss).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:([^;{}]*)/g)) for (const v of m[2].matchAll(/var\(\s*(--[\w-]+)/g)) { if (!cssRefs.has(m[1])) cssRefs.set(m[1], new Set()); cssRefs.get(m[1]).add(v[1]); }
      const varOfName = (n) => '--' + String(n).replace(/\//g, '-');
      for (const n of allNames) { byVar.set(varOfName(n), bare(n)); byVar.set(varOfName(bare(n)), bare(n)); }
      const next = (n) => { const out = new Set(chainAll.get(n) ?? []); for (const v of [varOfName(n), varOfName(n + '/color')]) for (const r of cssRefs.get(v) ?? []) if (byVar.has(r)) out.add(byVar.get(r)); return out; };
      const usesBy = {};
      for (const [cname, cnames] of namesOf) {
        const set = new Set(cnames), queue = [...set];
        while (queue.length) for (const t of next(queue.shift())) if (!set.has(t)) { set.add(t); queue.push(t); }
        for (const n of set) (usesBy[n] ??= []).push(cname);
      }
      view.tokenUsesFigma = usesBy;
      // A token the code writes anywhere is used, whichever file writes it and however it spells it (the convention's
      // short name, or the whole path with its /default and /color).
      const { sourceFiles } = await import('./code-roots.mjs');
      const written = new Set();
      for (const text of [allCss, vueCss, ...sourceFiles(ROOT, cfg).map((f) => f.text)]) for (const m of String(text).matchAll(/var\(\s*--([\w-]+)/g)) written.add(sqz(m[1]));
      const spellings = (n) => { const p = String(n).split('/'); const out = [p.join('')]; if (p.at(-1) === 'default') out.push(p.slice(0, -1).join('')); const nd = p.filter((x) => x !== 'default'); out.push(nd.join(''), nd.join('') + 'color', p.join('') + 'color'); return out.map(sqz); };
      for (const n of known) if (!used.has(n) && !n.startsWith(prim) && spellings(n).some((x) => written.has(x))) used.add(n);
      // A token a brand sets its own value for, or one a brand points at, is the brand's to show or hide: used, whether
      // or not this brand's components bind it (a white-label system keeps tokens for brands to come).
      const brandFile = readJson(cfg.paths?.snapshotBrands ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-brands.snapshot.json'));
      for (const b of brandFile?.collections ?? []) for (const [n, modes] of Object.entries(b?.overrides ?? {})) {
        used.add(bare(n));
        for (const v of Object.values(modes ?? {})) if (v && typeof v === 'object' && v.alias) used.add(bare(v.alias));
      }
      view.usedTokens = [...used];
      view.notUsedYet = [...known].filter((n) => !n.startsWith(prim) && !used.has(n)).sort();
    } catch { /* none listed */ }
    for (const c of view.components) { const m = motionUi(c.cls, allCss); if (m) c.motion = m; }
    // Each icon as Figma has it (the icon snapshot, keyed by the code's symbol id): its Figma name and its size.
    // With its stroke when the capture read one (an icon drawn as a line in Figma: its weight, its cap, its join), in an
    // entry's own `stroke` or in the snapshot's `strokes`, keyed by the Figma name.
    const iconSnap = readJson(cfg.paths?.snapshotIcons ?? '') ?? {};
    const strokeOf = (s) => (s && Number(s.weight) > 0 ? { weight: Number(s.weight), cap: String(s.cap ?? '').toLowerCase() || null, join: String(s.join ?? '').toLowerCase() || null } : null);
    view.iconFigma = Object.fromEntries(Object.entries(iconSnap)
      .filter(([, i]) => i && typeof i === 'object' && (i.name || i.viewBox))
      .map(([id, i]) => [id, { name: i.name ?? '', size: Number(String(i.viewBox ?? '').split(/[\s,]+/)[2]) || null, ...(strokeOf(i.stroke) ? { stroke: strokeOf(i.stroke) } : {}) }]));
    for (const [name, st] of Object.entries(iconSnap.strokes ?? {})) {
      const id = Object.keys(view.iconFigma).find((k) => view.iconFigma[k].name === name) ?? name;
      if (strokeOf(st)) view.iconFigma[id] = { ...(view.iconFigma[id] ?? { name, size: null }), stroke: strokeOf(st) };
    }
    // The page's own controls (its tabs, segmented control, buttons, fields, cards, tooltips, icon buttons, overlay) are
    // the template's, at the template's sizes, never the system's components: the page is the frame, the system what it
    // shows. Every pick is the template's default (view.ui empty).
    view.ui = { segmented: null, tabs: null, field: null, button: null, card: null, iconButton: null, tip: null, overlay: null, gaps: [] };
    if (showroom.length) view.showroom = showroom;
    // The system's logo at the top of the menu (styleguide.logo, an SVG in the project), in place of its name: its white
    // or black drawn in the page's text colour, so it follows the page's light and dark; its other colours kept.
    if (cfg.styleguide?.version) view.version = String(cfg.styleguide.version);   // the system's version, when the team sets it (else its changelog's newest release)
    if (cfg.styleguide?.logo) {
      try {
        const raw = readFileSync(resolve(ROOT, cfg.styleguide.logo), 'utf8');
        const svg = raw.replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<script[\s\S]*?<\/script>|\son\w+="[^"]*"/gi, '')
          .replace(/(fill|stroke)="(white|#fff|#ffffff|black|#000|#000000)"/gi, '$1="currentColor"').trim();
        if (/^<svg[\s>]/i.test(svg)) view.logo = { svg };
      } catch { /* no logo: the system's name stays */ }
    }
    if (showroomLive) view.showroomLive = showroomLive; else if (showroomLiveWhy) view.showroomLiveWhy = showroomLiveWhy;
    // The system's brands (Figma's extended collections, --figma-brands): each a skin the page puts on what it shows of
    // the system (every preview, the Showroom), never on the page around them. The code is the same; only the variables
    // differ, declared again on the previews for the brand chosen, with every variable that points at one of them.
    try {
      const brandSnap = readJson(cfg.paths?.snapshotBrands ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-brands.snapshot.json'));
      if (brandSnap?.collections?.length) {
        const { brandList, brandCss } = await import('./figma-brands.mjs');
        const { tokenToVar, resolveNamingSpec } = await import('./naming-convention.mjs');
        const spec = resolveNamingSpec(cfg), toVar = (n) => (String(n).startsWith('--') ? n : tokenToVar(n, spec));
        const varsSnap = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {};
        // The code's own value of each variable in each mode (its :root block, then the mode's own block), so a brand is
        // drawn on the library's values where they differ from the code's (onLibrary).
        const { onLibrary } = await import('./figma-brands.mjs');
        const blocks = [...systemCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@;]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), Object.fromEntries([...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1], d[2].trim()]))]);
        const allModes = [...(cfg.figma?.modes ?? []), ...(cfg.figma?.collections ?? []).flatMap((c) => c.modes ?? [])];
        const modeDecls = (name) => {
          const m = allModes.find((x) => String(x.name).toLowerCase() === String(name).toLowerCase());
          const root = Object.assign({}, ...blocks.filter(([sel]) => /^:root$/.test(sel)).map(([, d]) => d));
          if (!m || (m.cssSelector ?? 'root') === 'root') return root;
          const at = /^data:([\w-]+)=(.+)$/.exec(m.cssSelector ?? '');
          if (!at) return root;
          const attr = `[${at[1].startsWith('data-') ? at[1] : 'data-' + at[1]}="${at[2]}"]`;
          return Object.assign(root, ...blocks.filter(([sel]) => sel.split(',').some((x) => x.trim().replace(/^:root/, '') === attr)).map(([, d]) => d));
        };
        const declsOf = {};
        const codeValue = (n, mode) => {
          const d = (declsOf[mode] ??= modeDecls(mode));
          let v = d[toVar(n)], hops = 0;
          while (v && /^var\((--[\w-]+)\)$/.test(v) && hops++ < 12) v = d[/^var\((--[\w-]+)\)$/.exec(v)[1]];
          return v ?? null;
        };
        const list = brandList(onLibrary(brandSnap, codeValue));
        // Each attribute axis of the page (colour, size), its modes by Figma's names: the root one where no attribute is
        // set (or set to it on purpose), each other one where its attribute is.
        const rootLabels = new Set([...(cfg.figma?.modes ?? []), ...(cfg.figma?.collections ?? []).flatMap((c) => c.modes ?? [])].filter((m) => (m.cssSelector ?? 'root') === 'root').map((m) => String(m.name).toLowerCase()));
        const keyOfMode = (label) => [...(cfg.figma?.modes ?? []), ...(cfg.figma?.collections ?? []).flatMap((c) => c.modes ?? [])].find((m) => String(m.name).toLowerCase() === String(label).toLowerCase())?.snapshotKey ?? String(label).toLowerCase();
        const axes = (view.modes ?? []).filter((a) => a.attr && !a.classes).map((a) => {
          const root = a.values.find((v) => v.value === '') ?? a.values.find((v) => rootLabels.has(String(v.label).toLowerCase())) ?? a.values[0];
          return { attr: a.attr, baseValue: root.value || null, modes: a.values.map((v) => ({ name: v.label, key: keyOfMode(v.label), attr: v === root ? null : a.attr, value: v.value })) };
        });
        // A number Figma keeps without a unit is a size in pixels, unless it is a weight, an opacity or a ratio.
        const unit = (v, name) => (typeof v === 'number' ? (/^(\w*weight|opacity|appearance|alpha|ratio|z-?index|scale|flex\w*|order|count|\w*display)$/i.test(String(name).split('/').pop()) ? String(v) : `${v}px`) : typeof v === 'boolean' ? String(v) : v);
        const scope = '.sg-layout, .pg-preview, .pg-frame, .pg-frame-stage, .pg-variants, .pg-offstage, .pg-anat-wrap, .sg-thumb, .sg-showroom, .type-list, .sg-type-family, .sg-overlay-host';   // .sg-layout: the guide around them takes the brand's colours, corners and family too (the page re-maps those roles)
        // The system's own variables (each group's parts) and its value of one in a mode, so a layer a brand switches off
        // (a border's or a shadow's display set to false) draws nothing.
        const names = [...new Set([...Object.values(varsSnap.color ?? {}).flatMap((m) => Object.keys(m ?? {})), ...Object.keys(varsSnap.sizing ?? {}), ...list.flatMap((b) => Object.keys(b.overrides))])];
        const baseValue = (v, key) => varsSnap.color?.[key]?.[v] ?? varsSnap.sizing?.[v] ?? null;
        // Brands kept as stylesheets name each variable as the code does (--primitives-green): back to Figma's name where
        // the system has one, so what points at it is written again too.
        const fromCss = new Map(names.map((n) => [toVar(n), n]));
        const named = (k) => (String(k).startsWith('--') ? fromCss.get(k) ?? k : k);
        const rename = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, by]) => [named(k), Object.fromEntries(Object.entries(by ?? {}).map(([m, v]) => [m, v && typeof v === 'object' && 'alias' in v ? { ...v, alias: named(v.alias) } : v]))]));
        for (const b of list) { b.overrides = rename(b.overrides); b.ownOverrides = rename(b.ownOverrides); }
        // The links between variables as the library has them (base/border/top points at base/border/left), over the
        // system's own, so a brand that changes one changes what points at it, as Figma does.
        const links = JSON.parse(JSON.stringify(varsSnap.aliases ?? {}));
        for (const c of brandSnap.collections ?? []) for (const [n, by] of Object.entries(c.library ?? {})) for (const [m, x] of Object.entries(by ?? {})) {
          const key = keyOfMode(m);
          if (x && typeof x === 'object' && x.alias) (links[key] ??= {})[n] = [x.alias];
        }
        const declared = new Set([...systemCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
        const css = brandCss(list, { axes, aliases: links, toVar, scope, unit, names, baseValue, exists: (n) => declared.has(toVar(n)) });
        // What a brand overrides that the code has no variable for: said, so a name that differs is found.
        const known = new Set([...systemCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
        const unknown = [...new Set(list.flatMap((b) => Object.keys(b.overrides)))].filter((n) => !known.has(toVar(n)));
        // The families a brand draws in (a fontFamily it overrides, in any mode), so the page can load or name them.
        const fontsOf = (b) => [...new Set(Object.entries(b.overrides).filter(([n]) => /font-?family$/i.test(n)).flatMap(([, by]) => Object.values(by ?? {})).filter((v) => typeof v === 'string').map((v) => v.split(',')[0].trim().replace(/^["']|["']$/g, '')))];
        // Each brand's family the project keeps the files of (paths.fonts, else fonts/), embedded so the page draws it on
        // any computer; one it does not keep is loaded from Google Fonts, or named, by the page.
        const { fontFaces } = await import('./figma-brands.mjs');
        const fontDir = resolve(ROOT, cfg.paths?.fonts ?? 'fonts');
        const fontFiles = []; const walkFonts = (d) => { let ns = []; try { ns = readdirSync(d); } catch { return; } for (const n of ns) { const p = join(d, n); try { if (statSync(p).isDirectory()) walkFonts(p); else if (/\.(woff2?|otf|ttf)$/i.test(n)) fontFiles.push({ name: n, data: readFileSync(p) }); } catch {} } };
        walkFonts(fontDir);
        const families = [...new Set(list.flatMap((b) => fontsOf(b)))];
        const facesOf = new Map(families.map((f) => [f, fontFaces(f, fontFiles)]));   // each family's files read once
        view.brands = { file: brandSnap._file ?? null, embedded: families.filter((f) => facesOf.get(f).length), faces: [...facesOf.values()].flat().join('\n'), read: brandSnap._read ?? null, list: list.map((b) => ({ key: b.key, name: b.name, parent: b.parent, own: b.own, overrides: Object.keys(b.overrides).length, fonts: fontsOf(b) })), css, unknown };
      }
    } catch (e) { view.brandsError = String(e.message).split('\n')[0]; }
    // What the tokens owe, rows of the Status page under The system: descriptions to write in Figma and tokens equal
    // in every mode, a decision each. A token one component uses is the system's own choice, not a task.
    if (cfg.systemHealth !== false && !opts.only?.length) try {
      const { tokenTodos } = await import('./system-advice.mjs');
      // A token in the code that points at one declared nowhere (the system's code and its products'), with the commit
      // that removed it when the history has one.
      const { danglingCodeAliases } = await import('./system-advice.mjs');
      const { sourceFiles } = await import('./code-roots.mjs');
      let asked = 0;
      const removed = (t) => {
        if (asked++ >= 30) return null;
        const r = spawnSync('git', ['log', `-S${t}:`, '-1', '--format=%h %as'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
        const [sha, date] = String(r.stdout ?? '').trim().split(' ');
        return r.status === 0 && sha ? { sha, date } : null;
      };
      const dangling = danglingCodeAliases(sourceFiles(ROOT, cfg), { removed });
      const { brandNames } = await import('./code-roots.mjs');
      view.handFonts = (await import('./system-advice.mjs')).handWrittenFamilies(systemCss).filter((h) => !/monospace|mono\b/i.test(h.value));
      view.systemTodo = tokenTodos({ vars: readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, dangling, css: systemCss, usedTokens: view.usedTokens ? new Set(view.usedTokens) : null, codeNames: (view.notInFigma ?? []).map((k) => k.name), componentTokens: new Set((view.allComponents ?? view.components).flatMap((c) => [...(c.tokenDocs?.missing ?? []), ...(c.tokenDocs?.described ?? []).map((d) => d.figma)])), brands: brandNames(ROOT, cfg), components: (view.allComponents ?? view.components).map((c) => c.name), primitivePrefix: cfg.figma?.primitivePrefix ?? 'primitives/' });
      // What goes wrong only when two modes are on together, from the last audit's reading in the browser.
      const { comboTodos } = await import('./mode-combos.mjs');
      view.systemTodo.push(...comboTodos(readJson(join(OUT_DIR, 'mode-combinations.json'))));
      // What the browser check found on each product's own page, checked as a whole.
      const { productA11yTodos } = await import('./a11y-check.mjs');
      view.systemTodo.push(...productA11yTodos(readJson(join(OUT_DIR, 'a11y.json'))));
      // Where a product's page is laid out otherwise than its designed screens.
      const { screenTodos } = await import('./screen-parity.mjs');
      view.systemTodo.push(...screenTodos(readJson(join(OUT_DIR, 'screens.json'))));
    } catch { /* advice: the page builds without it */ }
    // Which code file is each Figma component (component-pairing.mjs): a pair on one sign only is a proposal, never
    // applied, and a component only in Figma with files near its name names them. Each is a decision on the Status page:
    // confirm it, or pin it in ds-config.json → componentFiles.
    if (!opts.only?.length) try {
      const { pairingTasks } = await import('./component-pairing.mjs');
      const { inProgressNames } = await import('./in-progress.mjs');
      const pr = (await context()).locator.pairing?.();
      if (pr) for (const t of pairingTasks(pr, { ROOT, skip: new Set(await inProgressNames(ROOT, cfg)) })) (view.systemTodo ??= []).push({ who: 'both', area: 'Parity', type: 'Component pairing', kind: 'Pairing', pairing: t.name, match: t.kind, say: t.say, todo: t.todo });
    } catch { /* advice: the page builds without it */ }
    // The text styles the token check found differing from the code, the family when it does, and the styles it could not
    // compare in full: a decision each on the Status page (the Typography page leaves those styles off).
    if (!opts.only?.length) try {
      const { typographyTodos } = await import('./styleguide-data.mjs');
      const tt = typographyTodos(check ?? {}, readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {});
      if (tt.length) view.systemTodo = [...(view.systemTodo ?? []), ...tt];
    } catch { /* the page builds without it */ }
    // Its parity with Figma: each fact the agreed record holds (equal on both sides, since when), its props and tokens,
    // what differs, what the code does not build and what the last audit could not compare (its census). Then how a
    // product brings it in (its import line and its file) and the system's components it is built with.
    try {
      const { parityView, parityRows, importOf, stylesheetImport, scriptUses, nestedComponents } = await import('./styleguide-data.mjs');
      const checkedAt = new Date().toISOString();   // the token check ran just now, for this page
      const { loadAgreed } = await import('./agreed.mjs');
      const agreedRec = loadAgreed(ROOT);
      const census = readJson(join(OUT_DIR, 'census.json'))?.components ?? {};
      const names = view.components.map((c) => ({ name: c.name, cls: c.cls }));
      const fileTags = Object.fromEntries(Object.entries(fileOf).map(([n, f]) => [n, [basename(f).replace(/\.\w+$/, '')]]));
      // the package a file belongs to (a package.json between it and the project root, the root's own not counted)
      const pkgOf = (file) => {
        for (let d = dirname(file); d && d !== '.' && d !== '/'; d = dirname(d)) {
          const j = readJson(join(d, 'package.json'));
          if (j?.name) return { name: j.name, dir: d };
        }
        return null;
      };
      // A component of CSS classes as a product brings it in, read from the code: the stylesheet that holds its rule, by
      // the name its package's exports give it (the project's own package counts), and the functions of the system's own
      // script that build or drive it (systemScripts), each by the name the script gives it.
      const pkgFor = (file) => {
        const p = pkgOf(file);
        if (p) return { ...p, exports: readJson(join(p.dir, 'package.json'))?.exports ?? null };
        const j = readJson('package.json');
        return j?.name ? { name: j.name, dir: '.', exports: j.exports ?? null } : null;
      };
      const ownSheets = [...new Set([...themeFiles, ...(ctx?.componentSheets ?? [])])].filter((f) => !String(f).startsWith('..') && existsSync(resolve(ROOT, f))).map((f) => [f, readText(f)]).filter(([, t]) => t);
      const scripts = (Array.isArray(cfg.systemScripts) ? cfg.systemScripts : []).map((f) => [f, readText(f)]).filter(([, t]) => t);
      const { ruleLines: rulesOf } = await import('./styleguide-data.mjs');
      const cssImport = (c) => {
        const file = (c.cls && ownSheets.find(([, t]) => rulesOf(t, c.cls).length)?.[0]) || themeFiles.find((f) => existsSync(resolve(ROOT, f)));
        const imp = file ? stylesheetImport({ file, pkg: pkgFor(file) }) : null;
        if (!imp) return null;
        const uses = scripts.flatMap(([f, t]) => { const fns = scriptUses({ text: t, cls: c.cls, name: c.name }); if (!fns.length) return []; const from = stylesheetImport({ file: f, pkg: pkgFor(f) }).from; return [fns.every((x) => x.exported) ? { line: `import { ${fns.map((x) => x.name).join(', ')} } from '${from}';`, from, module: true } : { line: fns.map((x) => `${x.name}(${x.args})`).join('; '), from, module: false }]; });
        return uses.length ? { ...imp, uses } : imp;
      };
      // Each component as Figma draws it (its bound variables), so a value row can say where it is and what sets it.
      const structAll = readJson(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json')?.components ?? {};
      for (const c of view.components) {
        c.parity = parityView({ name: c.name, agreed: agreedRec, census: census[c.name] ?? null, differences: c.differences ?? [], controls: c.controls ?? [], unbuilt: c.unbuilt ?? [], ownTokens: c.ownTokens ?? null });
        c.parity.rows = parityRows({ name: c.name, propsSnap, controls: c.controls ?? [], unbuilt: c.unbuilt ?? [], codeProps: c.api?.props ?? {}, allTokens: c.allTokens ?? [], check, agreed: agreedRec, propsAt: propsSnap._updated ?? null, checkedAt, slotParts: (c.anatomy ?? []).filter((x) => x.slot), structure: structAll[c.name] ?? null, rootClass: c.cls ?? null });
        const text = c.api?.file ? readText(c.api.file) : '';
        const uses = nestedComponents({ name: c.name, cls: c.cls, markup: c.markup ?? '', text, names, tags: fileTags, files: fileOf });
        if (uses.length) c.uses = uses;
        if (c.api?.tag) {
          const imp = importOf({ tag: c.api.tag, syntax: c.api.syntax, file: c.api.file, text, pkg: pkgOf(c.api.file), template: cfg.styleguide?.importFrom ?? null });
          if (imp) c.import = imp;
          if (text && text.length <= 200000) c.source = { file: c.api.file, text };
        }
        // A component that is CSS classes: a product brings it in with the system's stylesheet.
        if (!c.import && (!c.api?.tag || c.api.syntax === 'html')) { const own = cssImport(c); if (own) c.import = own; }
      }
    } catch { /* the page shows what it has */ }
    // Its links (Figma, its code, the team's documentation) and its changelog: the commits that changed it, each with
    // the release it shipped in and its pull request. The system's own links go on the overview.
    try {
      const { repoUrl, changelogs, figmaChangelogs, commitUrl, prUrl, fileUrl, defaultBranch, ticketOf, releaseLog } = await import('./component-changelog.mjs');
      const { figmaLink, figmaNodeIds } = await import('./figma-link.mjs');
      const { ruleLines } = await import('./styleguide-data.mjs');
      const repo = repoUrl(ROOT), branch = cfg.styleguide?.branch ?? defaultBranch(ROOT), ids = figmaNodeIds(ROOT, cfg);
      // Only the project's own files: a product's stylesheet beside it (../a-product) has its own history and repository.
      const inRepo = (f) => !/^\.\.?[\/]|^\//.test(String(f).replace(/^\.\//, '')) && !String(f).startsWith('..');
      const sheets = [...new Set([...themeFiles, ...(ctx?.componentSheets ?? [])])].filter(inRepo).map((f) => [f, readText(f)]).filter(([, t]) => t);
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      const docsUrl = cfg.styleguide?.componentDocs;   // "https://wiki.example.com/components/{name}"
      const where = (c) => {
        const own = c.source?.file ?? c.api?.file;
        if (own && inRepo(own)) return { files: [own], at: [own, null] };
        const hit = c.cls ? sheets.map(([f, t]) => [f, ruleLines(t, c.cls)]).filter(([, l]) => l.length) : [];
        // Its own rules as line ranges, followed back through history: a change inside a rule counts, not only one to
        // the line that names its class.
        const ranges = hit.flatMap(([f, lines]) => lines.reduce((acc, l) => { const last = acc[acc.length - 1]; if (last && l === last[2] + 1) last[2] = l; else acc.push([f, l, l]); return acc; }, []));
        return { files: hit.map(([f]) => f), ranges, pattern: c.cls ? `${/^#/.test(c.cls) ? '' : '\\.'}${c.cls}[^a-zA-Z0-9_-]` : null, at: hit[0] ? [hit[0][0], hit[0][1][0]] : null };
      };
      const found = new Map(view.components.map((c) => [c.name, where(c)]));
      const logs = changelogs(ROOT, view.components.map((c) => ({ name: c.name, ...found.get(c.name) })));
      // Each read of Figma that changed what it says of a component, from the snapshots the project commits.
      const figmaLogs = figmaChangelogs(ROOT, { props: cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json', vars: cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json' }, view.components.map((c) => c.name));
      for (const c of view.components) {
        const w = found.get(c.name);
        // Each commit with the ticket it was made for (the team's own unit of work), so the changelog groups by it.
        c.changelog = (logs[c.name] ?? []).map((r) => ({ ...r, url: commitUrl(repo, r.sha), prUrl: prUrl(repo, r.pr), ...(ticketOf(r.subject, cfg, ROOT) ?? {}) }));
        c.figmaLog = (figmaLogs[c.name] ?? []).map((r) => ({ ...r, url: commitUrl(repo, r.sha) }));
        const extra = Array.isArray(authored[c.name]?.links) ? authored[c.name].links.filter((l) => l?.url) : [];
        c.links = [
          { label: 'Figma', url: figmaLink(cfg.figmaFileKey, ids[c.name]) },
          { label: 'Code', url: w?.at ? fileUrl(repo, branch, w.at[0], w.at[1]) : null },
          // Its page in the intent layer, and its contract there: straight to each.
          { label: 'Intent layer', url: c.intentLayer?.url ?? null },
          { label: 'Contract', url: c.contract?.href ?? null },
          ...(docsUrl ? [{ label: 'Documentation', url: String(docsUrl).replace(/\{name\}/g, encodeURIComponent(c.name)) }] : []),
          ...extra.map((l) => ({ label: String(l.label ?? 'Link'), url: String(l.url) })),
        ].filter((l) => l.url);
      }
      // Everything the developers did, release by release, whatever it changed: the Changelog page lists it all, each
      // commit with the components it changed (from their changelogs) when it changed any.
      view.releaseLog = releaseLog(ROOT).map((g) => ({ ...g, commits: g.commits.map((r) => ({ ...r, url: commitUrl(repo, r.sha), ...(ticketOf(r.subject, cfg, ROOT) ?? {}) })) }));
      view.links = [
        { label: 'Figma file', url: cfg.figmaFileKey ? `https://www.figma.com/design/${cfg.figmaFileKey}` : null },
        { label: 'Code repository', url: repo },
        ...(Array.isArray(cfg.styleguide?.links) ? cfg.styleguide.links.filter((l) => l?.url).map((l) => ({ label: String(l.label ?? 'Link'), url: String(l.url) })) : []),
      ].filter((l) => l.url);
    } catch { /* no links, no changelog */ }
    // How ready each one is (a status the team gave it) and how much of its own file the tests cover, when the
    // project's tests write a coverage summary (styleguide.coverage, else coverage/coverage-summary.json).
    try {
      const { statusView, coverageOf } = await import('./styleguide-data.mjs');
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      const summary = readJson(cfg.styleguide?.coverage ?? 'coverage/coverage-summary.json');
      for (const c of view.components) {
        const st = statusView({ description: c.description, annotations: c.annotations, note: c.note, authored: authored[c.name]?.status ?? null, text: c.source?.text ?? '' });
        if (st) c.status = st;
        const cov = coverageOf(summary, c.source?.file ?? c.api?.file);
        if (cov) c.coverage = cov;
      }
      if (cfg.styleguide?.groups) view.groups = cfg.styleguide.groups;
    } catch { /* no status, no coverage */ }
    // How much each area weighs in the Health page's one number (styleguide.health.weights); the page's own otherwise.
    if (cfg.styleguide?.health?.weights && typeof cfg.styleguide.health.weights === 'object') view.healthWeights = cfg.styleguide.health.weights;
    // What the system retired that is still in use: each deprecated component on its own page and in its To do
    // rows, product by product; each retired token in the system's To do, a swap or a decision.
    if (!opts.only?.length) try {
      const { projectMigrations, migrationView } = await import('./migrations.mjs');
      const { codeSnapshotPath } = await import('./names.mjs');
      const { steps } = await projectMigrations(ROOT, cfg);
      if (steps.length) {
        const mv = migrationView(steps, { dir: join(dirname(codeSnapshotPath(cfg)), 'handback') });
        if (mv.tokens.length) view.systemTodo = [...(view.systemTodo ?? []), ...mv.tokens];
        for (const c of new Set([...(view.allComponents ?? []), ...view.components])) if (mv.components[c.name]) c.migration = mv.components[c.name];
      }
    } catch { /* the page builds without it */ }
    // Where the code draws a shadow, a blur, a fill, clipping or blending otherwise than Figma, from the last audit.
    try {
      const fx = readJson(join(OUT_DIR, 'effects.json'));
      for (const c of new Set([...(view.allComponents ?? []), ...view.components])) { const own = (fx?.findings ?? []).filter((f) => f.component === c.name); if (own.length) c.effectDiffs = own; }
    } catch { /* no effects read */ }
    // Each Showroom screen's components: the system's own ones its file imports (@/… is the project's src/), so a
    // component's Used in names the screens built with it, and each screen the components it is built with.
    if (showroom.length) {
      const strip = (f) => String(f ?? '').replace(/\\/g, '/').replace(/\.(vue|jsx?|tsx?)$/, '');
      const byFile = new Map();
      for (const c of new Set([...(view.allComponents ?? []), ...view.components])) { const f = strip(c.source?.file ?? c.api?.file); if (f) byFile.set(f, c.name); }
      for (const s of showroom) {
        let text = ''; try { text = readFileSync(join(ROOT, s.file), 'utf8'); } catch { /* not read */ }
        const specs = [...text.matchAll(/import\s+[\w${}\s,*]+\s+from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((x) => x.startsWith('@/') || x.startsWith('src/'));
        s.uses = [...new Set(specs.map((x) => byFile.get(strip(x.replace(/^@\//, 'src/')))).filter(Boolean))].sort();
      }
    }
    // Where the code moves otherwise than Figma's prototype, read again from the code as it is now (the last audit's
    // when it cannot be): rows of its Parity area, and what the motion page and each Motion area say the code does.
    let motionFound = [];
    try { const { projectMotion } = await import('./motion-parity.mjs'); const r = await projectMotion(ROOT, cfg); motionFound = r ? r.findings : readJson(join(OUT_DIR, 'motion.json'))?.findings ?? []; } catch { motionFound = readJson(join(OUT_DIR, 'motion.json'))?.findings ?? []; }
    for (const c of new Set([...(view.allComponents ?? []), ...view.components])) { const own = motionFound.filter((f) => f.component === c.name); if (own.length) c.motionDiffs = own; }
    // The foundations' motion page: the system's durations and easings, what it does for a person who asks for less
    // motion, each transition Figma's prototype animates, with what the code does for it, and how each component moves
    // on its own.
    if (!opts.only?.length) try {
      const { motionTokens, motionTodos } = await import('./styleguide-data.mjs');
      const { prototypeTransitions } = await import('./motion-parity.mjs');
      const snapMotion = readJson(cfg.paths?.snapshotMotion ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-motion.snapshot.json'));
      const findings = motionFound;
      // The theme, the system's own stylesheets and its components' (each component sheet, and the CSS its Vue build
      // compiles from each .vue file's <style>): a hover's transition or a modal's opening is in them.
      const sheets = [...new Set([...themeFiles, ...pluginCSS, ...((await context()).componentSheets ?? [])])].filter((f) => f && !/^https?:/.test(f) && !/\.html?$/i.test(f));
      const files = [...sheets.map((file) => ({ file, text: readText(file) })), ...(vueCss ? [{ file: 'its Vue components, as their build compiles them', text: vueCss }] : [])].filter((f) => f.text);
      let m = await motionTokens(allCss, { figmaVars: readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, cfg, files, transitions: snapMotion ? prototypeTransitions(snapMotion, findings) : [] });
      // How each component moves on its own: its loop, its opening and its closing, the code's beside Figma's.
      const { componentMotionRows, motionSpec, motionOverview } = await import('./motion-components.mjs');
      const every = view.allComponents ?? view.components, clsOf = new Map(every.map((c) => [c.name, c.cls]));
      // A Vue component's own scope mark, from its drawn markup's first element: its scoped rules are its own.
      const scopeOf = (c) => (String(c?.markup ?? '').match(/data-v-([0-9a-f]{6,})/i) ?? [])[1] ?? null;
      const known = new Set(every.map(scopeOf).filter(Boolean).map((x) => x.toLowerCase())), scopes = new Map(every.map((c) => [c.name, { own: scopeOf(c), known }]));
      // Its Motion area: everything that moves in it, in one table, the code's beside Figma's, with where each comes from;
      // a component shown in an overlay read with the overlay it opens in (.modal for .modal-card, its backdrop too).
      const moves = [];
      for (const c of new Set([...every, ...view.components])) { const t = motionSpec(snapMotion, files, c.motion?.overlay?.container ?? c.cls, c.name, scopes.get(c.name) ?? { own: scopeOf(c), known }); if (t.length) { c.moves = t; for (const r of t) moves.push({ component: c.name, ...r }); } }
      const rows = componentMotionRows(snapMotion, files, (n) => clsOf.get(n) ?? null, every.map((c) => c.name), (n) => scopes.get(n) ?? null);
      if (rows.length || moves.length) m = { ...(m ?? { durations: [], easings: [], reduced: null, transitions: [], figmaHas: false }), components: rows, moves: moves.sort((a, b) => a.component.localeCompare(b.component)) };
      // The motion page's one table: every motion grouped by what it is for and its timing, with the components using it.
      if (m) m.overview = motionOverview(m.moves ?? [], m);
      if (m) view.motion = m;
      // Motion the code has and Figma has no variables for: a row of the system's To do.
      const mt = motionTodos(m, view.components.map((c) => c.name));   // each tied to the component its tokens are named after
      if (mt.length) view.systemTodo = [...(view.systemTodo ?? []), ...mt];
    } catch { /* the page builds without it */ }
    // A class a product styles almost as the system styles one of its components: a decision in that component's
    // To do rows, to use the component (a new option if it needs one) or to add the new one to the system on purpose.
    if (!opts.only?.length && cfg.systemHealth !== false) try {
      const { productCopies } = await import('./system-advice.mjs');
      const { sourceFiles } = await import('./code-roots.mjs');
      const { rootOf } = await import('./migrations.mjs');
      const every = [...new Set([...(view.allComponents ?? []), ...view.components])];
      const files = sourceFiles(ROOT, cfg), products = {};
      for (const f of files) { const r = rootOf(f.file); if (r !== '.') (products[r] ??= []).push(f); }
      const sheets = files.filter((f) => rootOf(f.file) === '.' && /\.(css|scss|less)$/i.test(f.file)).map((f) => f.text).join('\n');
      const classes = Object.fromEntries(every.filter((c) => c.cls && /^[\w-]+$/.test(c.cls)).map((c) => [c.name, `.${c.cls}`]));
      for (const x of productCopies(products, sheets, classes)) {
        const c = every.find((k) => k.name === x.like);
        if (c) (c.copies ??= []).push({ product: basename(x.product), file: x.file.slice(x.product.length + 1), line: x.line, cls: x.cls, same: x.same, of: x.of, differ: x.differ });
      }
    } catch { /* the page builds without it */ }
    // Figma beside the code: each variant's Figma image (refs, else the Figma API with FIGMA_TOKEN), in the page, up to
    // styleguide.figmaImagesMB in all (8 by default, each component's default first); styleguide.figmaImages: false for none.
    if (cfg.styleguide?.figmaImages !== false) {
      try {
        const { figmaVariantImages } = await import('./visual-diff.mjs');
        const { variantOf } = await import('./styleguide-data.mjs');
        const version = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json')?._figmaVersion ?? null;
        let budget = (Number(cfg.styleguide?.figmaImagesMB) || 8) * 1024 * 1024;
        for (const c of view.components) {
          const r = await figmaVariantImages(ROOT, cfg, c.name, { nodeId: ctx?.propsSnap?.[c.name]?.nodeId ?? null, version });
          const shots = [];
          for (const im of r.images) {
            const v = variantOf(im.variant);
            if (im.variant && !v) continue;   // a file not named as a variant (Size=L.png) is not one
            const b = readFileSync(im.file);
            if (b.length > budget || b.length < 24) break;
            budget -= b.length;
            // Exported at 2x: drawn at half its pixels, its size in CSS pixels as the code's.
            shots.push({ variant: v, src: `data:image/png;base64,${b.toString('base64')}`, w: b.readUInt32BE(16) / (im.scale ?? 2), h: b.readUInt32BE(20) / (im.scale ?? 2) });
          }
          if (shots.length) c.figmaShots = shots;
        }
        // Do and Don't, for each one's Usage: the pictures its references hold and the Figma frames its contract names.
        const { exampleImages } = await import('./visual-diff.mjs');
        const authoredAll = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
        for (const c of view.components) {
          const ex = [];
          for (const im of await exampleImages(ROOT, cfg, c.name, { authored: authoredAll[c.name]?.examples })) {
            const b = readFileSync(im.file);
            if (b.length > budget || b.length < 24) break;
            budget -= b.length;
            ex.push({ kind: im.kind, caption: im.caption, src: `data:image/png;base64,${b.toString('base64')}`, w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 });
          }
          if (ex.length) c.examples = ex;
        }
      } catch { /* no Figma images */ }
    }
    // Each product's own page, pictured as it opens, with where each component sits on it (product-shots.mjs), for the
    // "Used in" area. A product that gives a picture of its own (styleguide.plugins[].image) is shown with that one.
    if ((cfg.paths?.plugins ?? []).length && cfg.styleguide?.productShots !== false) {
      try {
        const { productShots } = await import('./product-shots.mjs');
        const plugs = cfg.styleguide?.plugins ?? appLabels(cfg.paths?.plugins ?? []).map(([n, key]) => ({ key, match: n }));
        const used = new Set(view.components.flatMap((c) => (c.usage ?? []).map((u) => u.key ?? u)));
        const products = plugs.filter((g) => used.has(g.key)).map((g) => ({ key: g.key, image: g.image ?? null,
          page: appPages.find((p) => p.includes(g.match ?? g.key) && !/\.src\.html$/.test(p) && existsSync(resolve(ROOT, p))) ?? appPages.find((p) => p.includes(g.match ?? g.key) && existsSync(resolve(ROOT, p))) ?? null }));
        const shots = await productShots(ROOT, products, view.components.map((c) => ({ name: c.name, cls: c.cls })));
        if (Object.keys(shots).length) view.products = shots;
        // How many times each component appears in each product's own code (its class, in its source page).
        const srcOf = (g) => readText(appPages.find((p) => p.includes(g.match ?? g.key) && /\.src\.html$/.test(p)) ?? appPages.find((p) => p.includes(g.match ?? g.key)) ?? '');
        const texts = Object.fromEntries(plugs.filter((g) => used.has(g.key)).map((g) => [g.key, srcOf(g)]));
        for (const c of view.components) {
          if (!c.cls || !/^[\w-]+$/.test(c.cls)) continue;
          const re = new RegExp(`(?<![\\w-])${c.cls}(?![\\w-])`, 'g');
          for (const u of c.usage ?? []) { const t = texts[u.key ?? u]; const n = t ? (t.match(re) ?? []).length : 0; if (n && typeof u === 'object') u.places = n; }
        }
      } catch { /* no pictures: the cards show the names */ }
    }
    lastView = view;
    agreedSummary = { components: view.components.length, codeOnly: view.codeOnly ?? 0, notInFigma: view.notInFigma?.length ?? 0, line: view.notAgreed.line, ...(view.scope ? { scope: view.scope } : {}) };
    return JSON.stringify(view).replace(/</g, '\\u003c');
  }
  // The component rules outside the theme files: compiled component CSS and each component's own stylesheet.
  // An app page listed as a stylesheet (pluginCSS: ui.src.html) gives only its <style> blocks: its markup and scripts
  // must never land inside the page's <style>.
  // The CSS the project's build gives its Vue components (their <style> blocks) goes where VUE_CSS_MARK is, once the
  // components are drawn: the page's component CSS is filled before its data.
  async function componentCSS() {
    return (await context()).componentSheets.map((p) => (/\.html?$/i.test(p) ? styleBlocks(readText(p)) : readText(p))).join('\n\n') + `\n${VUE_CSS_MARK}`;
  }

  // ── Fill the template ───────────────────────────────────────────────────────────
  const intent = designIntent();
  const { docs, code } = docsMaps(intent);
  let agreedSummary = null, lastView = null, chrome = null;
  // ── CHROME — the page's own look, from the system's tokens (styleguide-data.mjs chromeRoles) ──────────────────────
  async function chromeCSS() {
    if (!lastView) lastView = JSON.parse(await agreed());
    const { chromeRoles, cardUi, modeScopes } = await import('./styleguide-data.mjs');
    const { propsSnap } = await context();
    // The system's icon size: the width most of its icons are drawn at in Figma (their viewBox), else in its icon sheet.
    const boxes = [...Object.values(readJson(cfg.paths?.snapshotIcons ?? '') ?? {}).map((i) => i?.viewBox), ...(iconSheet().match(/viewBox="[^"]+"/g) ?? []).map((v) => v.slice(9, -1))]
      .map((v) => parseFloat(String(v ?? '').trim().split(/[\s,]+/)[2])).filter((n) => n > 0);
    const count = {}; for (const b of boxes) count[b] = (count[b] ?? 0) + 1;
    const size = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const sysCss = themeFiles.map(readText).join('\n');
    chrome = chromeRoles({ tokens: lastView.tokens, themeCss: sysCss, componentNames: Object.keys(propsSnap), icons: { size: size ? Number(size) : null }, override: cfg.styleguide?.chrome, scopes: modeScopes(cfg), card: cardUi(lastView.allComponents ?? lastView.components ?? [], sysCss) });
    // The page's own contrast in every mode, for the style guide check to read from the page.
    return chrome.css + (chrome.contrast?.length ? `\n/*sg-contrast:${JSON.stringify(chrome.contrast)}*/` : '');
  }
  // The system's own scripts (ds-config.json → systemScripts): what builds or wires its components at run time (a
  // segmented control made by script, a toggle's click). Inlined after the page's own drawing, each in its own
  // <script>, so the page behaves as the product does and the accessibility check can try its behaviours.
  const systemScripts = () => (Array.isArray(cfg.systemScripts) ? cfg.systemScripts : []).map((p) => {
    try { return `<script data-system-script="${String(p).replace(/"/g, '')}">\n${readFileSync(resolve(ROOT, p), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`; } catch { return `<!-- systemScripts: ${String(p).replace(/--/g, '')} not found -->`; }
  }).join('\n');
  // Modules (ds-config.json → styleguide.modules): folders kept outside the system and the engine, each with a module.js,
  // an optional module.css and optional data per system (data/<system>/*.json), inlined last so each builds on the page's
  // own helpers (window.SG): a button, a panel.
  // An entry is a folder, or { path, data }: data names a folder of its own (kept apart from the module and from the
  // system's project) whose <system>/ subfolder holds the module's data; without it, the module's own data/ folder.
  const home = (p) => resolve(ROOT, String(p).replace(/^~(?=$|\/)/, homedir()));
  const modules = () => (Array.isArray(cfg.styleguide?.modules) ? cfg.styleguide.modules : []).map((entry) => {
    const p = entry && typeof entry === 'object' ? entry.path : entry;
    const dir = home(p);
    const read = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return null; } };
    const js = read('module.js'), css = read('module.css'), name = basename(dir).replace(/[^\w-]/g, '');
    if (js == null) return '<!-- styleguide.modules: a folder with no module.js -->';
    // Its data for this system: the JSON files in <data>/<system>/ (the system's name as a slug), never in the system's
    // project; the page reads them as SG.moduleData['<module>'].
    const sys = String(cfg.name || 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system';
    const dataDir = join(entry && typeof entry === 'object' && entry.data ? home(entry.data) : join(dir, 'data'), sys);
    // The team's themes store (stores.themes), read into the engine's own folder on each run, comes first; the person's
    // own folder adds what it lacks. A theme is one by its id, else by its file name.
    const dirs = [...(storesOf(cfg).themes?.read ? [join(ROOT, THEMES_DIR)] : []), dataDir];
    const readDir = (d) => { try { return readdirSync(d).filter((f) => /\.json$/i.test(f)).sort().map((f) => { try { return { file: f, ...JSON.parse(readFileSync(join(d, f), 'utf8')) }; } catch { return null; } }).filter(Boolean); } catch { return []; } };
    const data = [], seen = new Set();
    for (const d of dirs) for (const x of readDir(d)) { const k = x.id ? `id:${x.id}` : `file:${x.file}`; if (!seen.has(k)) { seen.add(k); data.push(x); } }
    const dataTag = `<script data-sg-module-data="${name}">\n(window.SG.moduleData = window.SG.moduleData || {})[${JSON.stringify(name)}] = { system: ${JSON.stringify(sys)}, files: ${JSON.stringify(data).replace(/<\/script/gi, '<\\/script')} };\n</script>\n`;
    return dataTag + (css ? `<style data-sg-module="${name}">\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>\n` : '') + `<script data-sg-module="${name}">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  }).join('\n');
  // opts.partsOnly: what the page is made of, without writing it (a prototype draws with the same parts).
  if (opts.partsOnly) {
    const componentCss = await componentCSS();
    // The system's own CSS (its theme and the sheets in its repository), apart from the products' pages it also reads:
    // what a prototype's copy of a component may keep.
    const systemCss = [...new Set([...themeFiles, ...((await context()).componentSheets ?? [])])].filter((f) => !String(f).startsWith('..') && existsSync(resolve(ROOT, f))).map((f) => (/\.html?$/i.test(f) ? styleBlocks(readText(f)) : readText(f))).join('\n');
    const view = JSON.parse(await agreed());
    return { themeCSS: themeCSS(), componentCSS: componentCss.split(VUE_CSS_MARK).join(vueCss), systemCSS: systemCss, view, iconSheet: iconSheet(), scripts: systemScripts() };
  }
  const fills = {
    THEME_CSS: () => themeCSS(),
    COMPONENT_CSS: () => componentCSS(),
    AGREED: () => agreed(),
    CHROME: () => chromeCSS(),
    ICON_SHEET: () => iconSheet(),
    SYSTEM_SCRIPTS: () => systemScripts(),
    MODULES: () => modules(),
    // The WCAG 2.2 checks the page runs on every variant (wcag-page.js).
    WCAG_PAGE: async () => (await import('./wcag21.mjs')).WCAG_PAGE_SOURCE.replace(/<\/script/gi, '<\\/script'),
    USAGE: () => JSON.stringify(usageMap(intent)),
    DOCS_CODE: () => JSON.stringify(code),
    DOCS: () => JSON.stringify(docs),
  };
  const filled = [];
  for (const [key, fn] of Object.entries(fills)) {
    // Wrapped forms FIRST — a bare `{{KEY}}` is a substring of `<!--{{KEY}}-->`
    // and `/*{{KEY}}*/`, so replacing it first would leave the fill inside a
    // comment. Replacing the wrapped form removes the wrapper entirely.
    const markers = [`<!--{{${key}}}-->`, `/*{{${key}}}*/`, `{{${key}}}`];
    let hit = false, value = null;
    for (const m of markers) if (html.includes(m)) { if (value === null) value = await fn(); html = html.split(m).join(value); hit = true; }
    if (hit) filled.push(key);
  }

  html = html.split(VUE_CSS_MARK).join(vueCss);
  // The page's own title is the system's name (ds-config.json name, else package.json's), in the file itself, so a tab,
  // a bookmark or a link preview names the system before any script runs.
  const sysName = cfg.name || (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name ?? ''; } catch { return ''; } })();
  if (sysName) html = html.replace(/<title>Living style guide<\/title>/i, `<title>${String(sysName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')} · Living style guide</title>`);
  html = hoistImports(html);
  // The fonts it links from a font service, written into the page, so it draws in them on any computer (offline, or
  // behind a firewall that blocks the service); one that cannot be read keeps its link.
  let fontsEmbedded = null;
  try {
    const { embedRemoteFonts, missingFamilies, serviceFonts, localFonts, fontsourceFonts } = await import('./font-embed.mjs');
    const { codeRoots } = await import('./code-roots.mjs');
    const cacheDir = join(ROOT, OUT_DIR, 'fonts');
    const intoHead = (x) => { html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => `${h}\n${x}`) : x + html; };
    // Every family the page names that nothing loads (each theme's and brand's font, the code's own body font set but
    // never imported) is looked for wherever it is, so the page draws in it everywhere: the system's own font files
    // first (any folder of its code), then the font services (Google Fonts, then Fontsource).
    const own = await localFonts(missingFamilies(html), codeRoots(ROOT, cfg));
    if (own.faces.length) intoHead(`<style data-font-from="project">\n${own.faces.join('\n')}\n</style>`);
    const named = await serviceFonts(own.missing, { cacheDir });
    if (named.found.length) intoHead(named.found.map((f) => `<link rel="stylesheet" href="${f.url.replace(/&/g, '&amp;')}">`).join('\n'));
    const open = await fontsourceFonts(named.missing.map((m) => m.family), { cacheDir });
    if (open.faces.length) intoHead(`<style data-font-from="fontsource">\n${open.faces.join('\n')}\n</style>`);
    fontsEmbedded = await embedRemoteFonts(html, { cacheDir });
    fontsEmbedded.missing = open.missing.map((family) => ({ family, why: 'not in the system\'s files nor on a font service' }));
    html = fontsEmbedded.html;
    // A family found nowhere is said, so its files can be added to the system (a licensed font kept in its fonts folder).
    if (open.missing.length) console.log(`  ⚠ Fonts found nowhere (not in the system's files nor on a font service): ${open.missing.join(', ')}. Add their files to the system's fonts folder.`);
  } catch { /* the links stay */ }
  // An older run never replaces a page built from newer inputs. The code capture's own copy (opts.out) is always
  // the code as it is now.
  const built = buildStamp(ROOT, { vars: (() => { try { return JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8')); } catch { return null; } })() });
  const may = opts.out ? { ok: true } : mayWrite(outPath, built, { ROOT, label: relative(ROOT, outPath) });
  if (!may.ok) return { out: outPath, kept: may.line, filled, bytes: 0, components: 0 };
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, (m) => `${stampMeta(built)}\n${m}`) : html.replace(/<head>/i, (m) => `${m}\n${stampMeta(built)}`);
  // The page and the files it links beside it (its styles, code, fonts and data: styleguide-files.mjs). The code
  // capture's own copy (opts.out), read through a <base> pointing elsewhere, stays one file.
  const written = writeStyleguide(outPath, html, { split: !opts.out });
  return { out: outPath, files: written.files, fontsEmbedded: fontsEmbedded ? { embedded: fontsEmbedded.embedded.length, kept: fontsEmbedded.kept, missing: fontsEmbedded.missing } : null, filled, bytes: written.bytes, components: agreedSummary?.components ?? Object.keys(intent.components || {}).length, codeOnly: agreedSummary?.codeOnly ?? 0, notInFigma: agreedSummary?.notInFigma ?? 0, scope: agreedSummary?.scope ?? null, template: engineTemplate ? 'engine' : 'project', notAgreed: agreedSummary?.line ?? null, vue: vueRender, chrome: chrome ? { missing: chrome.missing, from: chrome.from } : null };
}
