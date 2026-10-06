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

import { usedClasses } from './class-use.mjs';
import { appDir } from './code-roots.mjs';
import { codeSizeCSS, modeRootCSS } from './styleguide-data.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { OUT_DIR } from './names.mjs';

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
  const outPath = opts.out ? resolve(ROOT, opts.out) : projectOut;
  if (!existsSync(templatePath)) throw new Error('styleguide template not found: ' + templatePath);
  let html = readFileSync(templatePath, 'utf8');
  if (opts.out && outPath !== projectOut) {
    const base = `<base href="${pathToFileURL(dirname(projectOut)).href}/">`;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
  }

  const themeFiles = [cfg.paths?.themeCSS ?? 'src/theme.css'].flat();
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
    return deriveModeCSS(css) + sizeCSS + modeRootCSS(css);
  }

  // ── ICON_SHEET ───────────────────────────────────────────────────────────────
  function iconSheet() {
    const src = sh.iconSource ? resolve(ROOT, sh.iconSource) : (pluginHTML[0] ? resolve(ROOT, pluginHTML[0]) : null);
    if (!src || !existsSync(src)) return '';
    const doc = readFileSync(src, 'utf8');
    const syms = doc.match(/<symbol\b[\s\S]*?<\/symbol>/g) || [];
    if (!syms.length) return '';
    return '<svg id="ds-icon-sheet" width="0" height="0" style="position:absolute" aria-hidden="true">' + syms.join('') + '</svg>';
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
    // A React component the pages do not show: the markup its own JSX returns, as the code capture draws it.
    const jsx = {};
    try {
      const { componentSourceFiles, resolveComponentFile, textReader } = await import('./component-source.mjs');
      const { jsxMarkup } = await import('./jsx-markup.mjs');
      const read = textReader();
      const files = componentSourceFiles(ROOT, cfg).filter((f) => /\.(jsx|tsx|js)$/.test(f));
      for (const name of drawNames) {
        if (name.startsWith('_') || probes[name]) continue;
        const { file } = resolveComponentFile(name, { ROOT, cfg, files, read, classFor: locator.classFor });
        if (!file || !/\.(jsx|tsx|js)$/.test(file)) continue;
        try { const m = jsxMarkup(read(file), locator.classFor(name)); if (m && /^<[a-z]/.test(m)) jsx[name] = m; } catch { /* not readable as JSX */ }
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
    const view = agreedView({ propsSnap, rows, agreedRecord: loadAgreed(ROOT), classFor: (n) => locator.classFor(n), cssText, probes, probeList, unbuilt: [...await inProgressNames(ROOT, cfg)], cfg,
      check, figmaVars: readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, pages, usage, notes: code, icons, title, jsx, alsoNames: [...new Set([...(opts.names ?? []), ...structNames])], themeCss: themeFiles.map(readText).join('\n'),
      // A contract entry named apart from its Figma component (figmaName) maps that component's props too.
      propertyMaps: Object.fromEntries(Object.entries(contract.CONTRACT ?? {}).filter(([, c]) => c?.propertyMap).flatMap(([n, c]) => [[n, c.propertyMap], ...(c.figmaName && c.figmaName !== n && !contract.CONTRACT[c.figmaName]?.propertyMap ? [[c.figmaName, c.propertyMap]] : [])])),
      parts: Object.fromEntries(Object.entries(contract.CONTRACT ?? {}).map(([n, c]) => [n, (c?.children ?? []).filter((k) => k?.name && typeof k.cssSelector === 'string').map((k) => ({ name: k.name, selector: k.cssSelector }))])) });
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
      const { plainDifference, plainAction } = await import('./run-diff.mjs');
      // Each difference said in plain English, with who acts (Figma or the code) and exactly what to do.
      // A finding about accessibility (a text's contrast) is not a difference from Figma: it goes to the component's
      // Accessibility area, the rest to its Parity.
      const { splitFindings } = await import('./styleguide-data.mjs');
      for (const c of view.components) {
        const { parity, a11y } = splitFindings((by.get(c.name) ?? []).map((x) => ({ check: x.check, what: x.what, plain: plainDifference(x.what), ...plainAction(x.what, c.name), new: !!x.new })));
        if (parity.length) c.differences = parity;
        if (a11y.length) c.a11yFindings = a11y;
      }
      view.differences = { total: d.total ?? 0, at: d.at ?? null, file: `${OUT_DIR}/differences.md` };
    } catch { /* no full audit yet: nothing to list */ }
    // When each component last changed: the latest commit on its own CSS rules and its contract and config entries (git
    // blame on their lines), and the day Figma was last read for it (the props snapshot). A line not committed yet says so.
    try {
      const { codeReason } = await import('./change-reason.mjs');
      const { ruleLines, entryLines } = await import('./styleguide-data.mjs');
      const sheets = [...new Set([...themeFiles, ...(ctx?.componentSheets ?? [])])].map((f) => [f, readText(f)]).filter(([, t]) => t);
      // its entries in the contract and config files (structure-contract.mjs, contract.authored.json, ds-config.json)
      const entries = ['structure-contract.mjs', 'contract.authored.json', 'ds-config.json'].map((f) => [f, readText(f)]).filter(([, t]) => t);
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
    for (const c of view.components) {
      const defs = ctx?.propsSnap?.[c.name]?.properties ?? {};
      const slots = Object.entries(defs).filter(([, d]) => d?.type === 'SLOT').map(([k, d]) => {
        const name = k.replace(/#.*$/, ''), st = d.slotSettings ?? {};
        const names = structSnap[c.name]?.slots?.[name] ?? [];
        return { name, description: d.description || '', emptyAtFirst: !!st.displayEmptyByDefault, preferredOnly: !!st.allowPreferredValuesOnly,
          preferred: names, preferredCount: (d.preferredValues ?? []).length, min: st.minChildren ?? null, max: st.maxChildren ?? null };
      });
      if (slots.length) c.slots = slots;
      // Its anatomy: the contract's named parts (the layer each one draws), a part named as a Figma slot marked as one.
      const slotNames = new Set(slots.map((sl) => sl.name.toLowerCase().replace(/[\s_-]+/g, '')));
      const own = (contract.CONTRACT?.[c.name]?.children ?? []).filter((k) => k?.name && typeof k.cssSelector === 'string' && k.cssSelector.trim());
      if (own.length) c.anatomy = own.map((k) => ({ name: k.name, selector: k.cssSelector, ...(slotNames.has(k.name.toLowerCase().replace(/[\s_-]+/g, '')) || /slot/i.test(k.name) ? { slot: true } : {}) }));
    }
    // Its code API, as whoever uses it writes it: the props (each one the code says must be given marked), the events
    // it sends and its slots, read from the component's own file (component-api.mjs). An HTML and CSS system has none.
    if (cfg.frameworkComponents !== false) {
      try {
        const { createApiReader } = await import('./component-api.mjs');
        const { apiView } = await import('./styleguide-data.mjs');
        const nodeIds = Object.fromEntries(Object.entries(ctx?.propsSnap ?? {}).filter(([, e]) => e?.nodeId).map(([n, e]) => [n, e.nodeId]));
        const reader = createApiReader(ROOT, cfg, { classFor: (n) => locator.classFor(n), nodeIds });
        for (const c of view.components) {
          const api = reader.apiFor(c.name);
          const v = api.file && apiView(api, relative(ROOT, api.file));
          if (v) c.api = v;
        }
      } catch { /* no component sources */ }
    }
    // Its accessibility: what its role and Figma's notes ask of it, each with the WCAG criterion, and what the last
    // browser check (the audit's a11y.json) found on it. The page measures the text contrast itself, as it is drawn.
    try {
      const { a11yView } = await import('./styleguide-data.mjs');
      const { contractSemantics, A11Y_GUIDE } = await import('./a11y-check.mjs');
      const { partRolesOf } = await import('./behaviour-contract.mjs');
      const authoredRoles = contractSemantics(ROOT, cfg);
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      const result = readJson(join(OUT_DIR, 'a11y.json'));
      for (const c of view.components) {
        const entry = ctx?.propsSnap?.[c.name] ?? {};
        c.a11y = a11yView({ name: c.name, cls: c.cls, role: c.role ?? authoredRoles[c.name] ?? null, annotations: entry.annotations ?? [], parts: partRolesOf(entry),
          exceptions: authored[c.name]?.behaviourExceptions ?? {}, result, guide: A11Y_GUIDE });
      }
    } catch { /* the page shows what it can measure */ }
    // How to use it: the same four sections on every page, from what Figma, the code and the authored contract say.
    try {
      const { guidanceView } = await import('./styleguide-data.mjs');
      const authored = readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {};
      // What the products get wrong with it, from the last audit: a rule laid over it, a look-alike, a parent overriding it.
      const PRODUCT_MISUSE = /hand-built|look-?alike|Nested components keep|Templates compose/i;
      const seenIn = (c) => (c.differences ?? []).filter((d) => PRODUCT_MISUSE.test(d.check ?? '') || / laid over it /.test(d.what ?? '')).map((d) => d.plain ?? d.what);
      for (const c of view.components) c.guidance = guidanceView({ description: c.description, annotations: c.annotations, note: c.note, authored: authored[c.name]?.guidance, seen: seenIn(c) });
    } catch { /* no guidance */ }
    const { segmentedUi, radioGroupUi, buttonsAsSegmentedUi, standInGaps, fieldUi, buttonUi, cardUi, motionUi, primitiveColours, iconButtonUi } = await import('./styleguide-data.mjs');
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
      const keepColours = [];
      for (const g of view.tokens.colors ?? []) {
        if (/^(primitives|semantic)$/i.test(g.group)) { keepColours.push(g); continue; }
        const stay = [];
        for (const t of g.items) {
          const name = String(t.figma ?? '');
          let own = owners(/^color$/i.test(g.group) ? name.split('/')[0] : g.group);
          if (!own.length) { const users = [...(pointers.get(name) ?? [])]; own = view.components.filter((c) => users.includes(c.name)); }
          if (!own.length) { stay.push(t); continue; }
          for (const c of own) (c.ownTokens ??= { colors: [], sizes: [] }).colors.push(t);
        }
        if (stay.length) keepColours.push({ ...g, items: stay });
      }
      view.tokens.colors = keepColours;
      const iconStrokes = [], general = [];
      for (const t of view.tokens.sizing ?? []) {
        const prefix = t.figma.split('/')[0];
        if (/^typography$/i.test(prefix)) continue;
        if (/^icons?$/i.test(prefix)) { iconStrokes.push(t); continue; }
        const own = owners(prefix);
        if (own.length) { for (const c of own) (c.ownTokens ??= { colors: [], sizes: [] }).sizes.push(t); continue; }
        general.push(t);
      }
      view.tokens.spacing = [...(view.tokens.spacing ?? []), ...general];
      view.tokens.iconStrokes = iconStrokes;
      view.tokens.sizing = [];
    }
    if (view.tokens?.colors) {
      const prim = primitiveColours(readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {}, systemCss, cfg);
      const rest = view.tokens.colors.filter((g) => g.group !== 'primitives');
      view.tokens.colors = [...(prim ? [prim] : []), ...rest.filter((g) => /^semantic/i.test(g.group)), ...rest.filter((g) => !/^semantic/i.test(g.group))];
    }
    // How each component moves (an entry, an exit, an overlay it opens in), so its preview can play it.
    const allCss = [systemCss, ...(ctx?.componentSheets ?? []).map(readText)].join('\n');
    // What uses each token, for the page's "What uses it" view.
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
    } catch { /* none listed */ }
    for (const c of view.components) { const m = motionUi(c.cls, allCss); if (m) c.motion = m; }
    // Each icon as Figma has it (the icon snapshot, keyed by the code's symbol id): its Figma name and its size.
    view.iconFigma = Object.fromEntries(Object.entries(readJson(cfg.paths?.snapshotIcons ?? '') ?? {})
      .filter(([, i]) => i && typeof i === 'object' && (i.name || i.viewBox))
      .map(([id, i]) => [id, { name: i.name ?? '', size: Number(String(i.viewBox ?? '').split(/[\s,]+/)[2]) || null }]));
    // Each control the page needs is the system's own; where it has none, its nearest stand-in (a segmented control:
    // tabs, then a radio group, then its buttons side by side), and the page says so (view.ui.gaps).
    view.ui = { segmented: segmentedUi(view.components) ?? radioGroupUi(view.components, systemCss) ?? buttonsAsSegmentedUi(view.components, systemCss), field: fieldUi(view.components, systemCss), button: buttonUi(view.components, systemCss, sh.ui?.button ?? null), card: cardUi(view.components, systemCss), iconButton: iconButtonUi(view.components, systemCss), overlay: view.components.find((c) => /^overlay$|scrim|backdrop/i.test(c.name) && c.cls && !/^#/.test(c.cls))?.cls ?? null };
    view.ui.gaps = standInGaps(view.ui);
    // Its parity with Figma: each fact the agreed record holds (equal on both sides, since when), its props and tokens,
    // what differs, what the code does not build and what the last audit could not compare (its census). Then how a
    // product brings it in (its import line and its file) and the system's components it is built with.
    try {
      const { parityView, parityRows, importOf, nestedComponents } = await import('./styleguide-data.mjs');
      const checkedAt = new Date().toISOString();   // the token check ran just now, for this page
      const { loadAgreed } = await import('./agreed.mjs');
      const agreedRec = loadAgreed(ROOT);
      const census = readJson(join(OUT_DIR, 'census.json'))?.components ?? {};
      const names = view.components.map((c) => ({ name: c.name, cls: c.cls }));
      // the package a file belongs to (a package.json between it and the project root, the root's own not counted)
      const pkgOf = (file) => {
        for (let d = dirname(file); d && d !== '.' && d !== '/'; d = dirname(d)) {
          const j = readJson(join(d, 'package.json'));
          if (j?.name) return { name: j.name, dir: d };
        }
        return null;
      };
      for (const c of view.components) {
        c.parity = parityView({ name: c.name, agreed: agreedRec, census: census[c.name] ?? null, differences: c.differences ?? [], controls: c.controls ?? [], unbuilt: c.unbuilt ?? [], ownTokens: c.ownTokens ?? null });
        c.parity.rows = parityRows({ name: c.name, propsSnap, controls: c.controls ?? [], unbuilt: c.unbuilt ?? [], codeProps: c.api?.props ?? {}, allTokens: c.allTokens ?? [], check, agreed: agreedRec, propsAt: propsSnap._updated ?? null, checkedAt });
        const text = c.api?.file ? readText(c.api.file) : '';
        const uses = nestedComponents({ name: c.name, cls: c.cls, markup: c.markup ?? '', text, names });
        if (uses.length) c.uses = uses;
        if (c.api?.tag) {
          const imp = importOf({ tag: c.api.tag, syntax: c.api.syntax, file: c.api.file, text, pkg: pkgOf(c.api.file), template: cfg.styleguide?.importFrom ?? null });
          if (imp) c.import = imp;
          if (text && text.length <= 200000) c.source = { file: c.api.file, text };
        }
      }
    } catch { /* the page shows what it has */ }
    // Its links (Figma, its code, the team's documentation) and its changelog: the commits that changed it, each with
    // the release it shipped in and its pull request. The system's own links go on the overview.
    try {
      const { repoUrl, changelogs, commitUrl, prUrl, fileUrl, defaultBranch } = await import('./component-changelog.mjs');
      const { figmaLink, figmaNodeIds } = await import('./figma-link.mjs');
      const { ruleLines, issueLink } = await import('./styleguide-data.mjs');
      const issues = cfg.styleguide?.issues ?? null;   // the tracker's new-issue address, {name} and {title} filled
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
        return { files: hit.map(([f]) => f), pattern: c.cls ? `${/^#/.test(c.cls) ? '' : '\\.'}${c.cls}[^a-zA-Z0-9_-]` : null, at: hit[0] ? [hit[0][0], hit[0][1][0]] : null };
      };
      const found = new Map(view.components.map((c) => [c.name, where(c)]));
      const logs = changelogs(ROOT, view.components.map((c) => ({ name: c.name, ...found.get(c.name) })));
      for (const c of view.components) {
        const w = found.get(c.name);
        c.changelog = (logs[c.name] ?? []).map((r) => ({ ...r, url: commitUrl(repo, r.sha), prUrl: prUrl(repo, r.pr) }));
        const extra = Array.isArray(authored[c.name]?.links) ? authored[c.name].links.filter((l) => l?.url) : [];
        c.links = [
          { label: 'Figma', url: figmaLink(cfg.figmaFileKey, ids[c.name]) },
          { label: 'Code', url: w?.at ? fileUrl(repo, branch, w.at[0], w.at[1]) : null },
          ...(docsUrl ? [{ label: 'Documentation', url: String(docsUrl).replace(/\{name\}/g, encodeURIComponent(c.name)) }] : []),
          ...extra.map((l) => ({ label: String(l.label ?? 'Link'), url: String(l.url) })),
          { label: 'Report an issue', url: issueLink({ template: issues, repo, name: c.name }) },
        ].filter((l) => l.url);
      }
      view.links = [
        { label: 'Figma file', url: cfg.figmaFileKey ? `https://www.figma.com/design/${cfg.figmaFileKey}` : null },
        { label: 'Code repository', url: repo },
        ...(Array.isArray(cfg.styleguide?.links) ? cfg.styleguide.links.filter((l) => l?.url).map((l) => ({ label: String(l.label ?? 'Link'), url: String(l.url) })) : []),
        { label: 'Send feedback', url: cfg.styleguide?.feedback ?? issueLink({ template: issues, repo, name: null }) },
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
    agreedSummary = { components: view.components.length, line: view.notAgreed.line };
    return JSON.stringify(view).replace(/</g, '\\u003c');
  }
  // The component rules outside the theme files: compiled component CSS and each component's own stylesheet.
  // An app page listed as a stylesheet (pluginCSS: ui.src.html) gives only its <style> blocks: its markup and scripts
  // must never land inside the page's <style>.
  async function componentCSS() {
    return (await context()).componentSheets.map((p) => (/\.html?$/i.test(p) ? styleBlocks(readText(p)) : readText(p))).join('\n\n');
  }

  // ── Fill the template ───────────────────────────────────────────────────────────
  const intent = designIntent();
  const { docs, code } = docsMaps(intent);
  let agreedSummary = null, lastView = null, chrome = null;
  // ── CHROME — the page's own look, from the system's tokens (styleguide-data.mjs chromeRoles) ──────────────────────
  async function chromeCSS() {
    if (!lastView) lastView = JSON.parse(await agreed());
    const { chromeRoles, cardUi } = await import('./styleguide-data.mjs');
    const { propsSnap } = await context();
    // The system's icon size: the width most of its icons are drawn at in Figma (their viewBox), else in its icon sheet.
    const boxes = [...Object.values(readJson(cfg.paths?.snapshotIcons ?? '') ?? {}).map((i) => i?.viewBox), ...(iconSheet().match(/viewBox="[^"]+"/g) ?? []).map((v) => v.slice(9, -1))]
      .map((v) => parseFloat(String(v ?? '').trim().split(/[\s,]+/)[2])).filter((n) => n > 0);
    const count = {}; for (const b of boxes) count[b] = (count[b] ?? 0) + 1;
    const size = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const sysCss = themeFiles.map(readText).join('\n');
    chrome = chromeRoles({ tokens: lastView.tokens, themeCss: sysCss, componentNames: Object.keys(propsSnap), icons: { size: size ? Number(size) : null }, override: cfg.styleguide?.chrome, card: cardUi(lastView.components ?? [], sysCss) });
    // The page's own contrast in every mode, for the style guide check to read from the page.
    return chrome.css + (chrome.contrast?.length ? `\n/*sg-contrast:${JSON.stringify(chrome.contrast)}*/` : '');
  }
  // The system's own scripts (ds-config.json → systemScripts): what builds or wires its components at run time (a
  // segmented control made by script, a toggle's click). Inlined after the page's own drawing, each in its own
  // <script>, so the page behaves as the product does and the accessibility check can try its behaviours.
  const systemScripts = () => (Array.isArray(cfg.systemScripts) ? cfg.systemScripts : []).map((p) => {
    try { return `<script data-system-script="${String(p).replace(/"/g, '')}">\n${readFileSync(resolve(ROOT, p), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`; } catch { return `<!-- systemScripts: ${String(p).replace(/--/g, '')} not found -->`; }
  }).join('\n');
  // opts.partsOnly: what the page is made of, without writing it (a prototype draws with the same parts).
  if (opts.partsOnly) return { themeCSS: themeCSS(), componentCSS: await componentCSS(), view: JSON.parse(await agreed()), iconSheet: iconSheet(), scripts: systemScripts() };
  const fills = {
    THEME_CSS: () => themeCSS(),
    COMPONENT_CSS: () => componentCSS(),
    AGREED: () => agreed(),
    CHROME: () => chromeCSS(),
    ICON_SHEET: () => iconSheet(),
    SYSTEM_SCRIPTS: () => systemScripts(),
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

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  return { out: outPath, filled, bytes: html.length, components: agreedSummary?.components ?? Object.keys(intent.components || {}).length, template: engineTemplate ? 'engine' : 'project', notAgreed: agreedSummary?.line ?? null, chrome: chrome ? { missing: chrome.missing, from: chrome.from } : null };
}
