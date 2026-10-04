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

import { appDir } from './code-roots.mjs';
import { codeSizeCSS, modeRootCSS } from './styleguide-data.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
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
    // Usage label per app: ds-config.json → styleguide.plugins [{ key, match }] (a short label and a
    // path fragment), else each configured app (paths.plugins) with a short label made from its name.
    // Each product: { key, match, name?, href? } (styleguide.plugins); its full name, else the app's name in words.
    const words = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const PLUGS = ((cfg.styleguide?.plugins) || appLabels(cfg.paths?.plugins ?? []).map(([n, key]) => ({ key, match: n }))).map((g) => ({ ...g, name: g.name ?? words(g.match ?? g.key) }));
    const sources = pluginHTML.concat(pluginCSS).map((p) => ({ p, m: PLUGS.find((g) => p.includes(g.match)), txt: (() => { const abs = resolve(ROOT, p); return existsSync(abs) ? readFileSync(abs, 'utf8') : ''; })() })).filter((s) => s.m);
    const usage = {};
    for (const name of Object.keys(intent.components || {})) {
      const cls = intent.components[name].class || ('.' + name);
      const bare = cls.replace(/^\./, '');
      const found = new Set();
      for (const s of sources) if (s.txt.includes(cls) || s.txt.includes('"' + bare) || s.txt.includes(bare + ' ')) found.add(s.m.key);
      usage[name] = [...found].map((key) => { const g = PLUGS.find((x) => x.key === key); return { key, name: g?.name ?? key, ...(typeof g?.href === 'string' && /^https?:\/\//.test(g.href) ? { href: g.href } : {}) }; });
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
      for (const c of view.components) { const list = by.get(c.name); if (list?.length) c.differences = list.map((x) => ({ check: x.check, what: x.what, plain: plainDifference(x.what), ...plainAction(x.what, c.name), new: !!x.new })); }
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
    }
    const { segmentedUi, fieldUi, buttonUi, cardUi, motionUi, primitiveColours, iconButtonUi } = await import('./styleguide-data.mjs');
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
    for (const c of view.components) { const m = motionUi(c.cls, allCss); if (m) c.motion = m; }
    // Each icon as Figma has it (the icon snapshot, keyed by the code's symbol id): its Figma name and its size.
    view.iconFigma = Object.fromEntries(Object.entries(readJson(cfg.paths?.snapshotIcons ?? '') ?? {})
      .filter(([, i]) => i && typeof i === 'object' && (i.name || i.viewBox))
      .map(([id, i]) => [id, { name: i.name ?? '', size: Number(String(i.viewBox ?? '').split(/[\s,]+/)[2]) || null }]));
    view.ui = { segmented: segmentedUi(view.components), field: fieldUi(view.components, systemCss), button: buttonUi(view.components, systemCss, sh.ui?.button ?? null), card: cardUi(view.components, systemCss), iconButton: iconButtonUi(view.components, systemCss), overlay: view.components.find((c) => /^overlay$|scrim|backdrop/i.test(c.name) && c.cls && !/^#/.test(c.cls))?.cls ?? null };
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
    const { chromeRoles } = await import('./styleguide-data.mjs');
    const { propsSnap } = await context();
    // The system's icon size: the width most of its icons are drawn at in Figma (their viewBox), else in its icon sheet.
    const boxes = [...Object.values(readJson(cfg.paths?.snapshotIcons ?? '') ?? {}).map((i) => i?.viewBox), ...(iconSheet().match(/viewBox="[^"]+"/g) ?? []).map((v) => v.slice(9, -1))]
      .map((v) => parseFloat(String(v ?? '').trim().split(/[\s,]+/)[2])).filter((n) => n > 0);
    const count = {}; for (const b of boxes) count[b] = (count[b] ?? 0) + 1;
    const size = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    chrome = chromeRoles({ tokens: lastView.tokens, themeCss: themeFiles.map(readText).join('\n'), componentNames: Object.keys(propsSnap), icons: { size: size ? Number(size) : null }, override: cfg.styleguide?.chrome });
    return chrome.css;
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
