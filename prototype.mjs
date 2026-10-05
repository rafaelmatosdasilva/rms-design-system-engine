// prototype.mjs - draw a prototype from the design system's own components, and list what the system lacks.
// Run from project root:  rms-design-system-engine --prototype <composition.json> [--json]
//
// The composition is the format --check-ui reads (a nested { component, props, children } tree or an A2UI-style flat
// list). It may only use the catalog's components with their own options, plus the engine's neutral layout pieces
// (prototype-pieces.mjs). It is checked first; a composition with errors is not drawn. A valid one is drawn with the
// components' own markup and CSS, in every mode the system has, as one page under .design-system-engine-out/prototypes/.
// What the system lacks (a Missing box, a stand-in, the engine's layout, a component not built yet) goes on the gaps
// list, kept for every prototype in prototypes/gaps.json, the most needed first.
//
// Exit 0 = drawn. Exit 1 = the composition breaks a rule (nothing drawn). Exit 2 = no input, no catalog.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULES, catalogTable } from './ui-catalog.mjs';
import { checkPrototype, systemScales, nodesOf, mergeGaps, groupLayout, gapLine, pieceCatalog } from './prototype-pieces.mjs';
import { OUT_DIR, SKILL as CLI, envVar } from './names.mjs';
import { loadContext, purposeLines, ruleLines, usesAgainstPurpose, requestFocus, focusLines, cut } from './prototype-context.mjs';
import { pageFacts, deriveConventions, consistencyFindings, consistencyLine } from './product-conventions.mjs';
import { splitStates, applyState, statesOwed, stateFindings, normaliseValues } from './prototype-states.mjs';
import { linksOf, flowGraph, teamFlows, flowFindings } from './prototype-flows.mjs';
import { screenFor, renderPrototype, compareWithScreen, screenLines, owedFromScreen, interactionLines, screenWidths, fitLines } from './prototype-render.mjs';
import { visualLines } from './prototype-visual.mjs';

const ENGINE = dirname(fileURLToPath(import.meta.url));
export const PROTOTYPE_TEMPLATE = join(ENGINE, 'templates', 'prototype.template.html');

// The nested tree the page draws, from either form.
export function treeOf(ui) {
  const { root, nodes } = nodesOf(ui);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const build = (id) => { const n = byId.get(id); return n ? { id: n.id, component: n.component, props: n.props, children: (n.children ?? []).map((k) => build(typeof k === 'object' ? k.id : k)).filter(Boolean) } : null; };
  return build(root);
}

// The page itself: the engine's template filled with the system's CSS, its icons and the prototype.
// catalog: each component's text and on/off options, drawn by the part their name points to when the code has no prop
// of that name.
// The families the design sets its text in (Figma's text styles, else the system's own), when the machine may not
// have them: loaded from Google Fonts, so the drawing reads as the design does. A generic or system family is skipped;
// ds-config.json → prototypeFonts: false turns it off (an offline machine falls back to the system's stack).
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica( neue)?|arial|sf pro[\w ]*|inherit|initial)$/i;
export function fontLinks(scales = {}) {
  const fams = new Set();
  for (const f of [scales.family, ...(scales.text ?? []).map((t) => t.family)]) {
    const first = String(f ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first && !/^var\(/.test(first) && !GENERIC.test(first)) fams.add(first);
  }
  return [...fams].slice(0, 3).map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700&amp;display=swap" data-pt-font>`).join('\n');
}

export function prototypePage({ name, tree, states = [], parts, scales, gaps, note = '', catalog = { components: {} }, fonts = true }) {
  const opts = (n, type) => Object.fromEntries(Object.entries(catalog.components?.[n]?.props ?? {}).filter(([, e]) => e.type === type).map(([k, e]) => [k, typeof e.default === 'string' ? e.default : '']));
  // The classes the system's CSS adds to a component's own class (.node.node-selected): what an option value can turn on.
  // The theme's rules count as much as the components' own sheets: a system often writes its states there.
  const css = `${parts.themeCSS ?? ''}\n${parts.componentCSS ?? ''}`.replace(/\/\*[\s\S]*?\*\//g, '');
  const modsOf = (cls) => { if (!cls) return []; const out = new Set(); for (const m of css.matchAll(new RegExp(`\\.${cls.replace(/[^\w-]/g, '')}((?:\\.[A-Za-z][\\w-]*)+)`, 'g'))) for (const k of m[1].split('.').filter(Boolean)) out.add(k); return [...out]; };
  // The variables each of those classes' rules use (.badge.high { color: var(--semantic-negative) }): an option whose
  // value names none of the classes can still name the colour one of them uses.
  const modVarsOf = (cls, mods) => Object.fromEntries(mods.map((k) => { const vars = new Set(); const sel = new RegExp(`\\.${cls.replace(/[^\w-]/g, '')}\\.${k.replace(/[^\w-]/g, '')}(?![\\w-])`); for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (sel.test(r[1])) for (const v of r[2].matchAll(/var\(\s*(--[\w-]+)/g)) vars.add(v[1]); return [k, [...vars]]; }).filter(([, v]) => v.length));
  const drawable = Object.fromEntries((parts.view.components ?? []).map((c) => { const mods = modsOf(c.cls); return [c.name, { name: c.name, cls: c.cls, role: c.role, markup: c.markup, markups: c.markups, controls: c.controls, textProps: opts(c.name, 'text'), boolProps: opts(c.name, 'boolean'), enumProps: opts(c.name, 'enum'), slotProps: opts(c.name, 'slot'), mods, modVars: modVarsOf(c.cls ?? '', mods), ...(c.motion ? { motion: c.motion } : {}) }]; }));
  const data = { name, tree, states, components: drawable, scales, modes: parts.view.modes ?? [], pieces: ['Page', 'Stack', 'Row', 'Columns', 'Text', 'Missing'].filter((p) => !drawable[p]), gaps, note };
  return readFileSync(PROTOTYPE_TEMPLATE, 'utf8')
    .split('/*{{THEME_CSS}}*/').join(parts.themeCSS ?? '')
    .split('/*{{COMPONENT_CSS}}*/').join(parts.componentCSS ?? '')
    .split('<!--{{ICON_SHEET}}-->').join(parts.iconSheet ?? '')
    .split('/*{{PROTOTYPE}}*/').join(JSON.stringify(data).replace(/</g, '\\u003c'))
    .split('<!--{{SYSTEM_SCRIPTS}}-->').join(parts.scripts ?? '')
    .replace('</head>', `${fonts ? fontLinks(scales) : ''}\n</head>`);
}

// Every Figma colour the code has a variable for, added to the colour scale, so a surface or a text colour a designed
// screen binds to one is drawn with the code's variable, as building the screen would: the variable the naming rule
// gives it (agreed or not); else the one whose comment names it (--bg: …; /* semantic/surface/elevationMedium */);
// else, for a colour Figma makes from another (panel/background/primary → semantic/surface/elevationMedium), that
// one's. toVar(name) → the CSS variable the naming rule gives a Figma name.
export function codeColours(scales, figmaVars = {}, themeCSS = '', allCSS = themeCSS, toVar = () => null) {
  const declared = new Set([...String(allCSS).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const have = new Set(scales.colors.map((t) => t.name));
  const figmaNames = new Map([...new Set(Object.values(figmaVars.color ?? {}).flatMap((m) => Object.keys(m ?? {})))].map((n) => [n.replace(/\/colou?r$/, ''), n]));
  for (const [short, name] of figmaNames) {
    if (have.has(short)) continue;
    const v = [toVar(name), toVar(short)].find((x) => x && declared.has(x));
    if (v) { scales.colors.push({ name: short, var: v }); have.add(short); }
  }
  for (const m of String(themeCSS).matchAll(/(--[\w-]+)\s*:[^;{}]*;[ \t]*\/\*([^*]*(?:\*(?!\/)[^*]*)*)\*\//g)) {
    const said = [...m[2].matchAll(/[A-Za-z][\w-]*(?:\/[\w-]+)+/g)].map((x) => x[0].replace(/\/colou?r$/, '')).find((n) => figmaNames.has(n));
    if (said && !have.has(said)) { scales.colors.push({ name: said, var: m[1] }); have.add(said); }
  }
  for (const [short, full] of figmaNames) {
    if (have.has(short)) continue;
    const chain = Object.values(figmaVars.aliases ?? {}).map((m) => m?.[full]).find(Array.isArray) ?? [];
    const via = chain.map((n) => String(n).replace(/\/colou?r$/, '')).map((n) => scales.colors.find((t) => t.name === n)).find(Boolean);
    if (via) { scales.colors.push({ name: short, var: via.var }); have.add(short); }
  }
  return scales;
}

// What every drawing needs once: the catalog, the system's parts (CSS, drawable components, modes) and its scales.
async function systemFor(ROOT, cfg) {
  const contractsDir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  // No catalog yet: the audit writes it, so run it once instead of handing that step to the agent.
  if (!existsSync(join(contractsDir, 'catalog.json')) && existsSync(join(ROOT, 'ds-config.json')) && envVar(process.env, 'QUERY_NO_AUDIT') !== '1') {
    spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: ROOT, stdio: 'ignore', timeout: 600000 });
  }
  if (!existsSync(join(contractsDir, 'catalog.json'))) return null;
  const catalog = JSON.parse(readFileSync(join(contractsDir, 'catalog.json'), 'utf8'));
  const { generateStyleguide } = await import('./styleguide-gen.mjs');
  const parts = await generateStyleguide(ROOT, cfg, { partsOnly: true, names: Object.keys(catalog.components ?? {}) });
  let figmaVars = {};
  try { figmaVars = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8')); } catch { /* no text styles */ }
  const scales = systemScales(parts.view, figmaVars, `${parts.themeCSS ?? ''}\n${parts.componentCSS ?? ''}`);
  {
    const { resolveNamingSpec, tokenToVar } = await import('./naming-convention.mjs');
    const spec = resolveNamingSpec(cfg);
    codeColours(scales, figmaVars, parts.themeCSS ?? '', `${parts.themeCSS ?? ''}\n${parts.componentCSS ?? ''}`, (n) => tokenToVar(n, spec));
  }
  // What the team wrote about each component and its product (descriptions, annotations, notes, guidelines, layers).
  const context = await loadContext(ROOT, cfg, catalog, { fetchLinks: envVar(process.env, 'NO_FETCH') !== '1' });
  const actionNames = Object.entries(context.components).filter(([, k]) => /^button$/i.test(k.role ?? '') || /\b(main )?action\b/i.test(k.purpose ?? '')).map(([n]) => n);
  // The screens designers made, read as compositions (a screen already in prototypes/ is read from there instead).
  let designed = [];
  if (context.screens.length) {
    const { screenToPrototype } = await import('./screen-layout.mjs');
    designed = context.screens.map((sc) => { try { return { name: slug(sc.name), label: sc.name, id: sc.id, prototype: screenToPrototype(sc, { catalog, scales, drawable: new Set((parts.view.components ?? []).map((c) => c.name)) }).prototype }; } catch { return null; } }).filter(Boolean);
  }
  return { catalog, parts, scales, context, actionNames, designed, fonts: cfg.prototypeFonts !== false };
}

// The texts a composition shows (headings, labels, stand-ins), to match it with a request.
const textsOf = (tree) => { const out = []; const walk = (n) => { if (!n) return; const p = n.props ?? {}; for (const k of ['text', 'Label', 'label', 'need', 'standInFor']) if (typeof p[k] === 'string') out.push(p[k]); (n.children ?? []).forEach(walk); }; walk(tree); return out.join(' '); };

// The request the prototype is for: --for "<text>", or what the person asked in the last hour (the prompt hook keeps it).
function requestOf(ROOT, args) {
  const at = args.indexOf('--for');
  if (at >= 0 && args[at + 1]) return args[at + 1];
  try { const r = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'prototypes', 'request.json'), 'utf8')); if (Date.now() - Date.parse(r.at) < 3600 * 1000) return r.text; } catch { /* none */ }
  return null;
}

// The product's other pages: every prototype in prototypes/ but the one named, as page facts, and what the team wrote
// in prototypes/conventions.json.
export function productPages(ROOT, sys, except = null) {
  const dir = join(ROOT, 'prototypes');
  const pages = {};
  let authored = {};
  try { authored = JSON.parse(readFileSync(join(dir, 'conventions.json'), 'utf8')); } catch { /* none written */ }
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'conventions.json'); } catch { /* no prototypes yet */ }
  for (const f of files) {
    const name = f.replace(/\.json$/, '');
    if (name === except) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      // A starting point read from a designed screen carries the designer's decisions.
      const tree = treeOf(splitStates(raw).ui);
      // When it was first made: where nothing is shared yet, the first page made sets the product's decisions.
      let made = null; try { const st = statSync(join(dir, f)); made = st.birthtimeMs || st.mtimeMs; } catch { /* unknown */ }
      pages[name] = { ...pageFacts(tree, { actionNames: sys.actionNames }), designed: /^Starting point read from the screen/.test(raw?.$note ?? ''), label: name, text: textsOf(tree), file: `prototypes/${f}`, made };
    } catch { /* not a composition */ }
  }
  // A screen designed in Figma and not brought into prototypes/ yet still says how the product's pages look.
  for (const d of sys.designed ?? []) {
    if (pages[d.name] || d.name === except) continue;
    const tree = treeOf(d.prototype);
    pages[d.name] = { ...pageFacts(tree, { actionNames: sys.actionNames }), designed: true, label: `${d.label} (designed in Figma; ${CLI} --prototype --from-screens brings it into prototypes/)`, text: textsOf(tree), file: null };
  }
  return { pages, authored };
}

// Check one prototype and, when it holds, draw it and keep its gaps. raw is the composition, or { prototype, gaps }.
function drawOne(ROOT, name, raw, sys) {
  normaliseValues(raw, sys.catalog);   // "false" for False: what was meant, never a stop
  const split = splitStates(raw);
  const ui = split.ui;
  const declared = Array.isArray(raw?.gaps) ? raw.gaps : [];
  const request = sys.request ?? requestOf(ROOT, []);
  const opts = { catalog: sys.catalog, view: sys.parts.view, scales: sys.scales, name, limits: sys.context.limits, breakpoints: sys.context.breakpoints, context: sys.context, css: `${sys.parts.themeCSS ?? ''}\n${sys.parts.componentCSS ?? ''}` };
  const r = checkPrototype(ui, { ...opts, declared, request });
  // Each other state is a whole page too: checked as one, its gaps the prototype's.
  const states = [];
  r.findings.push(...split.findings);
  for (const s of split.states) {
    const { ui: sui, unknown } = applyState(ui, s.overrides);
    for (const id of unknown) r.findings.push({ rule: 2, level: 'error', id, message: `state "${s.name}" names "${id}", and no part has that id: give the part that differs an "id" and name it there` });
    const rs = checkPrototype(sui, opts);
    for (const f of rs.findings) { const message = `state "${s.name}": ${f.message}`; if (!r.findings.some((x) => x.message === f.message || x.message === message)) r.findings.push({ ...f, message, ...(f.said ? { said: `${s.name}:${f.said}` } : {}) }); }
    for (const g of rs.gaps) if (!r.gaps.some((x) => x.kind === g.kind && x.need === g.need)) r.gaps.push(g);
    states.push({ name: s.name, tree: treeOf(sui) });
  }
  // The states the page owes (an empty list, a form sent with a mistake, what the request and the guidelines name).
  r.findings.push(...stateFindings(statesOwed(ui, { context: sys.context, request, catalog: sys.catalog }), split.states));
  // A link to a page of the flow that is not drawn yet.
  for (const l of linksOf(name, ui)) if (l.to !== name && !existsSync(join(ROOT, 'prototypes', `${l.to}.json`))) r.findings.push({ rule: null, source: 'the flow', level: 'warning', id: l.id, kind: 'flow', need: `${l.to} page`, message: `"${l.label}" goes to "${l.to}", which is not drawn yet: draw prototypes/${l.to}.json, or the flow stops there` });
  r.counts.errors = r.findings.filter((f) => f.level === 'error').length;
  r.counts.warnings = r.findings.length - r.counts.errors;
  r.ok = r.counts.errors === 0;
  // The same decisions as the product's other pages (frame, heading, actions, the answer to each missing need).
  const { pages, authored } = productPages(ROOT, sys, name);
  // This page votes too: where the other pages are split, the decision most pages share wins, never the first page
  // made over two that agree.
  let made = Date.now(); try { const st = statSync(join(ROOT, 'prototypes', `${name}.json`)); made = st.birthtimeMs || st.mtimeMs; } catch { /* not saved yet */ }
  const self = { ...pageFacts(treeOf(ui), { actionNames: sys.actionNames }), made };
  const conventions = deriveConventions({ ...pages, [name]: self }, authored);
  const differs = r.ok ? consistencyFindings(self, conventions) : [];
  // What the documentation says about each component this prototype uses, beside what it uses it for.
  const uses = usesAgainstPurpose(sys.context, nodesOf(ui).nodes);
  const outDir = join(ROOT, OUT_DIR, 'prototypes');
  const gapsFile = join(outDir, 'gaps.json');
  let store = { byPrototype: {} };
  try { store = JSON.parse(readFileSync(gapsFile, 'utf8')); } catch { /* first prototype */ }
  let page = null;
  if (r.ok) {
    store.byPrototype[name] = r.gaps;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(gapsFile, JSON.stringify({ $description: `What the design system lacks, from every prototype drawn with ${CLI} --prototype. Generated; the design team decides each one.`, byPrototype: store.byPrototype, merged: mergeGaps(store.byPrototype) }, null, 2) + '\n');
    page = join(outDir, `${name}.html`);
    const mine = mergeGaps({ [name]: r.gaps }).map(gapLine);
    // What the reply owes the person: every gap of the prototype just drawn (the Stop hook holds the reply to it).
    writeFileSync(join(outDir, 'last.json'), JSON.stringify({ at: new Date().toISOString(), name, pending: true, gaps: [...mergeGaps({ [name]: r.gaps }).map((g) => ({ need: g.need, kind: g.kind, line: gapLine(g) })), ...differs.map((d) => ({ need: `${d.what} ${d.product}`, kind: 'consistency', line: consistencyLine(d) })), ...r.findings.filter((f) => f.kind === 'request').map((f) => ({ need: f.message.replace(/^the request asks for /, '').split(' and ')[0], kind: 'request', line: f.message })), ...r.findings.filter((f) => f.kind === 'state').map((f) => ({ need: `${f.state} state`, kind: 'state', line: f.message })), ...r.findings.filter((f) => f.kind === 'flow').map((f) => ({ need: f.need, kind: 'flow', line: f.message }))] }, null, 2) + '\n');
    writeFileSync(page, prototypePage({ name, tree: treeOf(ui), states, parts: sys.parts, scales: sys.scales, gaps: mine, catalog: sys.catalog, fonts: sys.fonts !== false, note: `${r.counts.components} parts · only the design system's own components${r.gaps.some((g) => g.kind === 'layout') ? ', with the engine\'s neutral layout' : ''}` }));
  }
  return { ...r, page, differs, uses, used: [...new Set(nodesOf(ui).nodes.map((n) => n.component))] };
}

// What the context was read from, for the catalog: so the person sees what the prototype knows, and what is missing.
export function sourceLines(ctx) {
  if (!ctx?.sources?.length) return [];
  return ['', 'Read from:', ...ctx.sources.map((s) => `  ${s.missing ? '⚠️ ' : '• '}${s.what}: ${s.detail}`)];
}

// How the product's pages are arranged, for the catalog (only what at least two pages, or the team, agree on).
export function conventionLines(conv) {
  if (!conv) return [];
  const LABEL = { padding: 'page padding', gap: 'space between sections', width: 'screen width', align: 'alignment' };
  const src = (c) => (c.authored ? 'the team' : c.first ? `${c.pages.join(', ')}, the first page made` : c.pages.join(', '));
  const lines = [
    ...Object.entries(conv.page ?? {}).map(([k, c]) => `${LABEL[k]} ${c.value} (${src(c)})`),
    ...(conv.heading?.style ? [`page heading in ${conv.heading.style.value} (${src(conv.heading.style)})`] : []),
    ...(conv.actions?.at ? [`actions at the ${conv.actions.at.value}${conv.actions.justify ? `, lined up ${conv.actions.justify.value}` : ''} (${src(conv.actions.at)})`] : []),
    ...((conv.frame ?? []).length ? [`frame: ${conv.frame.map((c) => c.component).join(', ')} (${src(conv.frame[0])})`] : []),
    ...(conv.text?.body ? [`body text in ${conv.text.body.value} (${src(conv.text.body)})`] : []),
    ...(conv.text?.section ? [`section headings in ${conv.text.section.value} (${src(conv.text.section)})`] : []),
    ...Object.entries(conv.intents ?? {}).map(([intent, c]) => `the action for ${({ save: 'saving', cancel: 'cancelling', next: 'going on', back: 'going back', delete: 'deleting', create: 'creating' })[intent]}: ${[c.label ? `"${c.label.value}"` : null, c.component ? c.component.value : null].filter(Boolean).join(', a ')} (${src(c.label ?? c.component)})`),
    ...(conv.needs ?? []).map((n) => `"${n.need}" is ${n.answer} (${src(n)})`),
  ];
  return lines.length ? ['', 'How this product\'s pages are arranged (keep a new page the same):', ...lines.map((l) => `  ${l}`)] : [];
}

// --catalog: everything a prototype may use, in one screen: the system's components and options, the engine's pieces
// with the tokens they take, the format, and the starting points already made.
export function catalogText(sys, { cmd = CLI, starts = [], conventions = null, focus = null } = {}) {
  const drawable = new Set((sys.parts.view.components ?? []).map((c) => c.name));
  const comps = Object.fromEntries(Object.entries(sys.catalog.components ?? {}).map(([n, c]) => [n, { ...c, ...(drawable.has(n) ? {} : { status: c.status ? `${c.status}, not built in code` : 'not built in code: drawn as a box' }) }]));
  const pieces = pieceCatalog(sys.scales, Object.keys(comps));
  const pieceRows = Object.entries(pieces).map(([n, d]) => `${n.padEnd(8)}  ${Object.entries(d.props).map(([k, e]) => `${k}=${e.type === 'enum' ? (e.values.length > 6 ? `<${k === 'style' ? 'text style' : 'spacing token'}>` : e.values.join('|')) : e.type === 'boolean' ? 'true|false' : `<${k === 'width' ? 'screen width in px' : k === 'need' ? 'what is needed' : k === 'closest' ? 'nearest system component' : 'text'}>`}`).join('  ')}`);
  return [
    'PROTOTYPE CATALOG  ·  everything a prototype may use; nothing else exists for it',
    ...sourceLines(sys.context),
    ...focusLines(focus),
    '',
    'The design system\'s components (name, options):',
    catalogTable({ components: comps }),
    ...(() => { const l = purposeLines(sys.context ?? { components: {}, rules: [] }, Object.keys(comps)); return l.length ? ['', 'What each component is for (Figma descriptions and annotations, code notes, the team\'s guidelines); use it only for that:', ...l] : []; })(),
    ...(() => { const l = ruleLines(sys.context ?? { components: {}, rules: [] }); return l.length ? ['', 'The team\'s rules for the product:', ...l] : []; })(),
    ...((sys.context?.limits ?? []).length ? ['', 'Rules the check holds every prototype to (read from the guidelines):', ...sys.context.limits.map((l) => `  at most ${l.max} ${l.component} per ${l.per}: "${cut(l.sentence, 160)}" (${l.from})`)] : []),
    ...((sys.context?.templates ?? []).length ? ['', 'Templates in Figma (the components each composes, in order):', ...sys.context.templates.map((t) => `  ${t.name}: ${t.components.join(', ')}`)] : []),
    ...conventionLines(conventions),
    '',
    'The engine\'s pieces (only where the system has none of its own):',
    ...pieceRows.map((r) => `  ${r}`),
    `Spacing tokens: ${sys.scales.spacing.map((t) => `${t.name} (${t.value})`).join(', ') || 'none'}`,
    `Text styles: ${sys.scales.text.map((t) => `${t.name} (${t.size}/${t.lh} ${t.weight})`).join(', ') || 'none'}`,
    ...((sys.context?.breakpoints ?? []).length ? [`Screen widths (Page.width): ${sys.context.breakpoints.map((b) => `${b.name} (${b.px})`).join(', ')}`] : []),
    '',
    'Format: { "component": "Page", "props": { "padding": "<spacing token>" }, "children": [ { "component": "<name>", "props": { "<option>": "<value>" } } ] }',
    'A system component used for a need it does not quite meet carries "standInFor": "<the need>" in its props; a need nothing fits is { "component": "Missing", "props": { "need": "…" } }.',
    `A flow is one prototype per page, linked: a part that leads to the next page carries "goesTo": "<prototype name>" ("<name>#<state>" for one of its states); ${cmd} --prototype --flow checks the links against the flows the team wrote down.`,
    'It works as in the product (the system\'s scripts run, a selection moves, a field takes typing). A part that opens another (a dialog, a menu, a popover) carries "opens": "<id>" in its props, and the part it opens has that "id": it is drawn closed and opens on a click.',
    'Its other states go beside it: "states": { "empty": { "<id>": { …that part in this state… } }, "error": { … }, "loading": { … } }, each naming by "id" only the parts that differ (null leaves one out). A page with a list owes an empty state, one that takes input an error state, and each state the request or the guidelines name.',
    'It is reviewed as drawn: the parts of a column start on one line, one spacing per arrangement, one primary action in view, the main heading the largest text and each heading above its text, lines under 90 characters.',
    'It is tried at every screen width, in every state, with the words as written and 40% longer: nothing may run past the screen, be cut or spill, a control\'s label stays on one line, and on a phone every target is 24px or more. Row "wrap" and Columns "minWidth" let a layout fit a narrow screen.',
    ...(starts.length ? ['', `Prototypes already here (starting points read from designed screens among them): ${starts.map((f) => `prototypes/${f}`).join(', ')}; copy the closest one`] : []),
    '',
    `NEXT: write prototypes/<name>.json with only the parts above, then run ${cmd} --prototype prototypes/<name>.json and fix each ❌ line until it is drawn.`,
  ].join('\n');
}

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';

// The drawn page in the browser: its picture, and against the designed screen it redraws or the product's closest one.
// What differs in the page's own arrangement is added to what the reply owes the person (last.json). Without Chrome,
// or with --no-browser, nothing is measured and the prototype stands as checked.
async function againstScreens(ROOT, cfg, name, raw, sys, page, { browser = true, screens = null } = {}) {
  if (!browser || !page) return null;
  const tree = treeOf(splitStates(raw).ui);
  const pick = screenFor(name, raw, tree, screens ?? sys.context.screens ?? [], sys.catalog, slug);
  const r = await renderPrototype(ROOT, cfg, page, { name, screen: pick?.screen ?? null, mode: pick?.mode ?? 'sibling', widths: screenWidths(sys.context.breakpoints), textStyles: sys.scales?.text ?? [] }).catch((e) => ({ why: String(e?.message ?? e).split('\n')[0] }));
  if (r.why) return { why: r.why };
  // What does not fit at some width, in some state, is owed in the reply as the words are written; with longer words, listed.
  const fitOwed = (r.fit?.findings ?? []).filter((f) => f.asWritten);
  if (fitOwed.length) {
    const file = join(ROOT, OUT_DIR, 'prototypes', 'last.json');
    const lines = fitLines(fitOwed, { states: r.fit.states });
    try { const last = JSON.parse(readFileSync(file, 'utf8')); if (last.name === name) writeFileSync(file, JSON.stringify({ ...last, gaps: [...(last.gaps ?? []), ...fitOwed.map((f, i) => ({ need: f.text || f.component || f.path, kind: 'fit', line: lines[i].replace(/^⚠️\s+/, '') }))] }, null, 2) + '\n'); } catch { /* drawn without a record */ }
  }
  // The design review's findings are owed in the reply too: fixed in the composition, or said.
  if (r.review?.findings?.length) {
    const file = join(ROOT, OUT_DIR, 'prototypes', 'last.json');
    try { const last = JSON.parse(readFileSync(file, 'utf8')); if (last.name === name) writeFileSync(file, JSON.stringify({ ...last, gaps: [...(last.gaps ?? []), ...r.review.findings.map((f) => ({ need: f.message.split(':')[0], kind: 'visual', line: f.message }))] }, null, 2) + '\n'); } catch { /* drawn without a record */ }
  }
  // What the system cannot give the page (no heading style above its body text) is a gap the reply names.
  if (r.review?.limits?.length) {
    const file = join(ROOT, OUT_DIR, 'prototypes', 'last.json');
    try { const last = JSON.parse(readFileSync(file, 'utf8')); if (last.name === name) writeFileSync(file, JSON.stringify({ ...last, gaps: [...(last.gaps ?? []), ...r.review.limits.map((l) => ({ need: l.need, kind: 'text style', line: l.message }))] }, null, 2) + '\n'); } catch { /* drawn without a record */ }
  }
  if (!pick) return { picture: r.picture, cmp: [], a11y: prototypeA11y(ROOT, page, usedIn(tree)), interactions: r.interactions, fit: r.fit, review: r.review };
  const cmp = compareWithScreen(tree, r.rendered, pick.screen, { mode: pick.mode, catalog: sys.catalog, drawn: new Set((sys.parts.view.components ?? []).map((c) => c.name)) });
  const owed = owedFromScreen(cmp);
  if (owed.length) {
    const file = join(ROOT, OUT_DIR, 'prototypes', 'last.json');
    try { const last = JSON.parse(readFileSync(file, 'utf8')); if (last.name === name) writeFileSync(file, JSON.stringify({ ...last, gaps: [...(last.gaps ?? []), ...owed.map((d) => ({ need: `${d.what} ${pick.screen.name}`, kind: 'screen', line: d.message }))] }, null, 2) + '\n'); } catch { /* drawn without a record */ }
  }
  const a11y = prototypeA11y(ROOT, page, usedIn(tree));
  const ownA11y = (a11y ?? []).filter((i) => i.own);
  if (ownA11y.length) {
    const file = join(ROOT, OUT_DIR, 'prototypes', 'last.json');
    try { const last = JSON.parse(readFileSync(file, 'utf8')); if (last.name === name) writeFileSync(file, JSON.stringify({ ...last, gaps: [...(last.gaps ?? []), ...ownA11y.map((i) => ({ need: `accessibility ${i.issue}`, kind: 'a11y', line: `${i.issue}: ${i.selector} (${i.fix})` }))] }, null, 2) + '\n'); } catch { /* drawn without a record */ }
  }
  return { ...pick, cmp, picture: r.picture, visual: r.visual, a11y, interactions: r.interactions, fit: r.fit, review: r.review };
}

// The components a composition uses, by name.
const usedIn = (tree) => { const out = new Set(); const walk = (n) => { if (!n) return; if (n.component) out.add(n.component); (n.children ?? []).forEach(walk); }; walk(tree); return out; };
// The drawn page through the accessibility check: contrast in every mode, names, one main heading, the keyboard. The
// engine's own bar (pt-…) is left out. Returns [{ issue, selector, fix }] or null when the check could not run.
// The page's own composition (its main heading, a text's colour on its surface) is owed in the reply; what a system
// component does is the component's, for the audit.
export function prototypeA11y(ROOT, page, used = null) {
  const r = spawnSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(page).href, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: process.env });
  const out = String(r.stdout ?? '');
  const at = out.indexOf('{');
  if (at < 0) return null;
  try {
    const d = JSON.parse(out.slice(at));
    if (d.notChecked) return null;
    // Only what is on the page: a note that a component the page does not use was not checked is not about it.
    return (d.issues ?? []).filter((i) => !/(^|[#. ])pt-(bar|outline|gaps|modes|title|note|seg)/.test(String(i.selector ?? '')) && !/no instance shows its .*not checked/.test(String(i.selector ?? ''))
      && !(used && /^([\w-]+): /.test(String(i.selector ?? '')) && !used.has(/^([\w-]+): /.exec(String(i.selector))[1]))).map((i) => ({ issue: i.issue, selector: String(i.selector ?? ''), fix: i.fix, own: i.issue === 'heading' || (i.issue === 'contrast' && /pt-text/.test(String(i.selector ?? ''))) }));
  } catch { return null; }
}
export function a11yLines(list) {
  if (!list) return [];
  if (!list.length) return ['♿ ACCESSIBILITY OF THE DRAWN PAGE: nothing found'];
  return [`♿ ACCESSIBILITY OF THE DRAWN PAGE: ${list.length} issue(s)`, ...list.slice(0, 10).map((i) => `   ${i.own ? '⚠️ ' : '•'} ${i.issue}: ${i.selector}${i.own ? ` (the page's own: ${i.fix})` : ' (a system component: for the audit)'}`), ...(list.length > 10 ? [`   … ${list.length - 10} more`] : [])];
}

// --from-screens <capture.json>: each designed screen becomes a starting point in prototypes/, drawn at once.
async function fromScreens(ROOT, cfg, file, sys, { force = false, browser = true } = {}) {
  const { screenToPrototype, layoutHabits } = await import('./screen-layout.mjs');
  let capture;
  try { capture = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch (e) { console.log(`\n❌ ${file} is not a screen capture (${String(e.message).split('\n')[0]}).\n`); return 1; }
  const screens = capture.screens ?? [];
  if (!screens.length) { console.log(`\n⏭  ${file} holds no screens.\n`); return 2; }
  mkdirSync(join(ROOT, 'prototypes'), { recursive: true });
  const results = [];
  console.log(`\nScreens to prototypes  ·  ${screens.length} screen(s) from ${file}`);
  for (const sc of screens) {
    const { prototype, gaps } = screenToPrototype(sc, { catalog: sys.catalog, scales: sys.scales, drawable: new Set((sys.parts.view.components ?? []).map((c) => c.name)) });
    const name = slug(sc.name);
    const target = join(ROOT, 'prototypes', `${name}.json`);
    const kept = existsSync(target) && !force;
    if (!kept) writeFileSync(target, JSON.stringify({ $note: `Starting point read from the screen "${sc.name}" in Figma (${sc.id}). Edit it freely: only the system's components and the engine's layout pieces.`, prototype, gaps }, null, 2) + '\n');
    const r = drawOne(ROOT, name, kept ? JSON.parse(readFileSync(target, 'utf8')) : { prototype, gaps }, sys);
    results.push({ name: sc.name, prototype, ok: r.ok });
    console.log(`   ${r.ok ? '✅' : '❌'} ${sc.name} → prototypes/${name}.json${kept ? ' (kept as it was; --force replaces it)' : ''}${r.page ? ` · drawn ${r.page.replace(ROOT + '/', '')}` : ''}`);
    for (const f of r.findings.filter((x) => x.level === 'error')) console.log(`      ❌ ${f.message}`);
    const seen = await againstScreens(ROOT, cfg, name, kept ? JSON.parse(readFileSync(target, 'utf8')) : { prototype, gaps }, sys, r.page, { browser, screens });
    if (seen?.screen) for (const l of screenLines(seen.cmp, { ...seen, root: ROOT })) console.log(`      ${l}`);
    else if (seen?.why) console.log(`      ⏭  not measured in the browser (${seen.why})`);
  }
  const h = layoutHabits(results);
  console.log('\n📐 HOW THESE SCREENS ARRANGE THINGS');
  if (h.pagePadding.length) console.log(`   page padding: ${h.pagePadding.join(', ')}`);
  if (h.gaps.length) console.log(`   spacing between parts: ${h.gaps.map((g) => `${g.name} ×${g.n}`).join(', ')}`);
  if (h.components.length) console.log(`   components used: ${h.components.map((c) => `${c.name} (${c.screens.length})`).join(', ')}`);
  if (h.repeated.length) { console.log('   structures that repeat (template candidates):'); for (const t of h.repeated) console.log(`     • ${t.structure} in ${t.screens.join(', ')}`); }
  const merged = groupLayout(mergeGaps(JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'prototypes', 'gaps.json'), 'utf8')).byPrototype));
  if (merged.length) {
    console.log(`\n🧩 GAPS  ${merged.length}  (what the design system would need; nothing was invented)`);
    for (const g of merged.slice(0, 30)) console.log(`   • ${gapLine(g)}`);
    if (merged.length > 30) console.log(`   … ${merged.length - 30} more in ${join(OUT_DIR, 'prototypes', 'gaps.json')}`);
  }
  console.log(`\nNEXT: open the drawn screens to compare them with Figma; start a new prototype from the closest one in prototypes/, then run ${CLI} --prototype prototypes/<name>.json.\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

// --flow: how the prototypes link, against the flows the team wrote down.
function flowReport(ROOT, sys) {
  const dir = join(ROOT, 'prototypes');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'conventions.json'); } catch { /* none yet */ }
  const pages = {};
  for (const f of files) {
    try {
      const ui = splitStates(JSON.parse(readFileSync(join(dir, f), 'utf8'))).ui;
      const tree = treeOf(ui);
      const head = (function find(n) { if (!n) return null; if (n.component === 'Text' && /^h[12]$/.test(n.props?.as ?? '')) return n.props.text; for (const k of n.children ?? []) { const h = find(k); if (h) return h; } return null; })(tree);
      pages[f.replace(/\.json$/, '')] = { ui, heading: head };
    } catch { /* not a composition */ }
  }
  const g = flowGraph(Object.fromEntries(Object.entries(pages).map(([n, p]) => [n, p.ui])));
  const flows = teamFlows(sys.context?.rules ?? []);
  const findings = flowFindings(pages, flows);
  console.log(`\n🔗 FLOWS  ${g.names.length} page(s) in prototypes/, ${g.links.length} link(s)`);
  for (const l of g.links) console.log(`   ${l.from} → ${l.to}${l.state ? ` (its ${l.state} state)` : ''}  by "${l.label}"`);
  if (g.starts.length) console.log(`   starts: ${g.starts.join(', ')}`);
  if (g.deadEnds.length) console.log(`   ends: ${g.deadEnds.join(', ')} (nothing leads on from there: the end of a flow, or a page that needs a way on or back)`);
  for (const f of flows) console.log(`   the team's flow "${f.name}" (${f.from}): ${f.steps.join(' → ')}`);
  if (!flows.length) console.log('   no flow written in the guidelines or the design intent: the links above are the flow');
  // The pages of a flow match each other, the first page made setting what none share yet, and each page after the
  // first has a way back when one of them has.
  const { pages: facts } = productPages(ROOT, sys);
  const inFlow = [...new Set(g.links.flatMap((l) => [l.from, l.to]))].filter((n) => facts[n]);
  // Within a flow its order decides which page came first: the start sets what no two pages share yet.
  const placed = (x) => ({ ...facts[x], made: g.order[x] ?? Number.MAX_SAFE_INTEGER, designed: facts[x].designed });
  for (const n of inFlow) {
    const all = Object.fromEntries(inFlow.map((x) => [x, placed(x)]));
    for (const d of consistencyFindings(placed(n), deriveConventions(all, {}))) findings.push({ level: 'error', kind: 'flow', need: `${n} ${d.what}`, message: `${n}: ${consistencyLine(d).replace("on the product's other pages", 'on the other pages of the flow')}` });
  }
  const before = (n) => g.forward.filter((l) => l.to === n).map((l) => l.from);
  const hasBack = (n) => (facts[n]?.intents ?? []).some((x) => x.intent === 'back') || g.links.some((l) => l.from === n && before(n).includes(l.to));
  const later = inFlow.filter((n) => !g.starts.includes(n) && before(n).length);
  if (later.some(hasBack)) for (const n of later.filter((x) => !hasBack(x))) findings.push({ level: 'warning', kind: 'flow', need: `${n} way back`, message: `${n} has no way back to ${before(n).join(' or ')}, and ${later.filter(hasBack).join(', ')} has one: give it the same back action ("goesTo": "${before(n)[0]}")` });
  // A flow that does not hold (a page not drawn, a step that does not link, pages that decide differently) is not done.
  for (const f of findings) console.log(`   ❌ ${f.message}`);
  if (findings.length) {
    const outDir = join(ROOT, OUT_DIR, 'prototypes'); mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'last.json'), JSON.stringify({ at: new Date().toISOString(), name: 'flow', pending: true, gaps: findings.map((f) => ({ need: f.need, kind: 'flow', line: f.message })) }, null, 2) + '\n');
  }
  if (!findings.length) console.log('   ✅ the flow holds: every step drawn and linked, its pages decide alike');
  console.log(`\nNEXT: ${findings.length ? 'fix each ❌ line in the page it names (the same words for the same action on every page of the flow, draw the missing page, give the action that leads on "goesTo"), draw the changed pages again, and run this again until the flow holds; tell the person only what cannot be fixed.' : `open the first page${g.starts.length ? ` (.design-system-engine-out/prototypes/${g.starts[0]}.html)` : ''} and click through.`}\n`);
  return findings.length ? 1 : 0;
}

// --consistency: every page of the product against the others: where one decides differently.
function consistencyReport(ROOT, sys) {
  const { pages, authored } = productPages(ROOT, sys);
  const names = Object.keys(pages);
  console.log(`\nConsistency  ·  ${names.length} page(s) in prototypes/`);
  if (names.length < 2 && !Object.keys(authored).length) { console.log('   ⏭  fewer than two pages and no prototypes/conventions.json: nothing to compare yet.\n'); return 0; }
  let n = 0;
  for (const name of names) {
    const others = Object.fromEntries(Object.entries(pages).filter(([k]) => k !== name));
    const d = consistencyFindings(pages[name], deriveConventions(others, authored));
    n += d.length;
    console.log(`   ${d.length ? '⚠️ ' : '✅'} ${name}${d.length ? '' : ': the same as the others'}`);
    for (const x of d) console.log(`      • ${consistencyLine(x)}`);
  }
  for (const l of conventionLines(deriveConventions(pages, authored)).slice(1)) console.log(l.replace(/^/, ' '));
  console.log(`\nNEXT: ${n ? 'bring each page marked ⚠️ in line with the others, or tell the person why it differs; the team can write a decision in prototypes/conventions.json.' : 'nothing to change.'}\n`);
  return 0;
}

export async function runPrototype(ROOT, argv) {
  const args = argv.filter((a) => a !== '--prototype');
  const JSON_MODE = args.includes('--json');
  const screensAt = args.indexOf('--from-screens');
  const screensFile = screensAt >= 0 ? args[screensAt + 1] : null;
  const input = screensFile ? null : args.find((a) => !a.startsWith('--'));
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch { /* defaults */ }
  const file = screensFile ?? input;
  if (!args.includes('--catalog') && !args.includes('--consistency') && !args.includes('--flow') && (!file || !existsSync(resolve(ROOT, file)))) {
    console.log(`\nUsage: ${CLI} --prototype <composition.json>`);
    console.log(`       ${CLI} --prototype --from-screens <screen-capture.json>`);
    console.log(`       ${CLI} --prototype --catalog | --consistency | --flow`);
    console.log('   --no-browser draws without measuring the page in Chrome against the designed screens.');
    console.log('   The composition names the design system\'s components and their options, in the format --check-ui reads,');
    console.log('   plus the engine\'s layout pieces (Page, Stack, Row, Columns, Text) and Missing for a need nothing fits.');
    console.log('   A screen capture (screen-layout.mjs) turns each designed screen into a starting point.\n');
    return 2;
  }
  const sys = await systemFor(ROOT, cfg);
  if (sys) sys.request = requestOf(ROOT, args);
  if (!sys) { console.log(`\n⏭  no catalog yet: run ${CLI} once to write it, then draw the prototype again.\n`); return 2; }
  if (args.includes('--catalog')) {
    let starts = [];
    try { starts = readdirSync(join(ROOT, 'prototypes')).filter((f) => f.endsWith('.json')); } catch { /* none yet */ }
    const { pages, authored } = productPages(ROOT, sys);
    const req = requestOf(ROOT, args);
    const focus = req ? requestFocus(sys.context, req, Object.entries(pages).map(([name, p]) => ({ name, label: p.label ?? name, text: p.text, designed: !!p.designed, file: p.file }))) : null;
    console.log('\n' + catalogText(sys, { starts, conventions: deriveConventions(pages, authored), focus }) + '\n');
    return 0;
  }
  if (args.includes('--consistency')) return consistencyReport(ROOT, sys);
  if (args.includes('--flow')) return flowReport(ROOT, sys);
  if (screensFile) return fromScreens(ROOT, cfg, screensFile, sys, { force: args.includes('--force'), browser: !args.includes('--no-browser') });

  let raw;
  try { raw = JSON.parse(readFileSync(resolve(ROOT, input), 'utf8')); }
  catch (e) { console.log(`\n❌ ${input} is not valid JSON (${e.message.split('\n')[0]}). Nothing was drawn.\n`); return 1; }
  const name = basename(input).replace(/\.json$/i, '');
  const r = drawOne(ROOT, name, raw, sys);
  const { catalog } = sys;
  const page = r.page;
  const used = r.used;
  const seen = r.ok ? await againstScreens(ROOT, cfg, name, raw, sys, page, { browser: !args.includes('--no-browser') }) : null;
  if (JSON_MODE) { process.stdout.write(JSON.stringify({ ok: r.ok, page: page && page.replace(ROOT + '/', ''), findings: r.findings, counts: r.counts, gaps: r.gaps, used, screen: seen?.screen ? { name: seen.screen.name, mode: seen.mode, differences: seen.cmp, picture: seen.picture.replace(ROOT + '/', ''), visual: seen.visual } : null, picture: seen?.picture ? seen.picture.replace(ROOT + '/', '') : null }, null, 2) + '\n'); return r.ok ? 0 : 1; }

  console.log(`\nPrototype  ·  ${name}  ·  ${r.counts.components} part(s)`);
  // The same line for several parts (three tags, each experimental) is said once, with how many.
  const said = new Map();
  for (const f of r.findings) { const k = `${f.level}|${f.message}`; if (said.has(k)) said.get(k).n++; else said.set(k, { f, n: 1 }); }
  for (const { f, n } of said.values()) console.log(`   ${f.level === 'error' ? '❌' : '⚠️ '} ${f.message}${n > 1 ? ` (${n} places)` : ''}${f.rule ? `  (rule ${f.rule}: ${RULES[f.rule - 1]})` : f.source ? `  (${f.source})` : ''}`);
  if (!r.ok) {
    console.log(`\n❌ ${r.counts.errors} error(s): nothing drawn.`);
    console.log(`\nNEXT: fix each ❌ line in ${input} (only the system's components and their own options; Missing for a need nothing fits), then run ${CLI} --prototype ${input} again.\n`);
    return 1;
  }
  console.log(`✅ drawn: ${page.replace(ROOT + '/', '')}`);
  const own = used.filter((u) => catalog.components?.[u]);
  if (own.length) console.log(`   the system's components: ${own.join(', ')}`);
  if (r.uses.length) {
    console.log('\n📓 WHAT THE DOCUMENTATION SAYS ABOUT WHAT THIS PROTOTYPE USES');
    for (const u of r.uses) console.log(`   • ${u.component}${u.uses.length ? ` (used for ${u.uses.map((x) => JSON.stringify(x)).join(', ')})` : ''}: ${u.rule}`);
  }
  if (r.differs.length) {
    console.log(`\n📐 DIFFERENT FROM THE PRODUCT'S OTHER PAGES  ${r.differs.length}`);
    for (const d of r.differs) console.log(`   • ${consistencyLine(d)}`);
  }
  if (seen?.screen) { console.log(''); for (const l of screenLines(seen.cmp, { ...seen, root: ROOT })) console.log(l); }
  else if (seen?.picture) console.log(`\n   picture of the page: ${seen.picture.replace(ROOT + '/', '')}`);
  if (seen?.a11y) { console.log(''); for (const l of a11yLines(seen.a11y)) console.log(l); }
  else if (seen?.why) console.log(`\n   ⏭  not measured in the browser (${seen.why})`);
  if (seen?.review && seen.review.score != null) {
    const v = seen.review;
    console.log(`\n🎨 DESIGN REVIEW  ${v.score}/10${v.findings.length ? '' : ': aligned, one spacing rhythm, one main action, a clear hierarchy, lines that read'}`);
    for (const l of visualLines(v)) console.log(`   ${l}`);
  }
  if (seen?.fit) {
    const f = seen.fit, lines = fitLines(f.findings, { states: f.states });
    console.log(`\n📱 EVERY SIZE AND STATE  ${f.widths.join(', ')} · ${f.states.length} state${f.states.length === 1 ? '' : 's'} (${f.states.join(', ')}) · the words as written and 40% longer${lines.length ? `: ${lines.length} problem(s)` : ', all fit'}`);
    for (const l of lines) console.log(`   ${l}`);
    if (f.pictures.length) console.log(`   pictures: ${f.pictures.map((p) => p.replace(ROOT + '/', '')).join(', ')}`);
  }
  const works = interactionLines(seen?.interactions ?? []);
  const tried = (seen?.interactions ?? []).length;
  if (tried) { console.log(`\n🖱  HOW IT WORKS  ${tried} tried in the browser${works.length ? '' : ', all as in a product'}`); for (const l of works) console.log(`   ${l}`); }
  const placed = seen?.cmp ? owedFromScreen(seen.cmp) : [];
  const gaps = groupLayout(mergeGaps({ [name]: r.gaps }));
  if (gaps.length) {
    console.log(`\n🧩 GAPS  ${gaps.length}  (what the design system would need; nothing was invented)`);
    for (const g of gaps) console.log(`   • ${gapLine(g)}`);
    console.log(`   every prototype's gaps: ${join(OUT_DIR, 'prototypes', 'gaps.json')}`);
  }
  const next = [
    r.uses.length ? 'Check each use above against what its component is for: a use the documentation rules out gets "standInFor" with the need, or a Missing box, and the prototype is drawn again.' : null,
    r.differs.length ? 'Make each 📐 line match the other pages, or tell the person why this page differs.' : null,
    placed.length ? `Make each ⚠️ line under 📏 match "${seen.screen.name}", or tell the person why this page differs from it.` : null,
    (seen?.a11y ?? []).some((i) => i.own) ? 'Fix each ⚠️ line under ♿ in the composition (one main heading: a Text with as h1; a text colour that reads on its surface), or tell the person.' : null,
    (seen?.review?.findings ?? []).length ? 'Fix each ⚠️ line under 🎨 in the composition (one primary action, one spacing per arrangement, a heading style above its text, a narrower column) and draw it again until it scores 10, or tell the person why a line stays.' : null,
    (seen?.fit?.findings ?? []).length ? 'Fix each ⚠️ line under 📱 in the composition (a shorter label, Row wrap, Columns minWidth, fewer parts in a row) and draw it again, or tell the person; a line that happens only with longer words is for a translated product: tell the person.' : null,
    works.length ? 'Fix each ⚠️ line under 🖱 in the composition ("opens" names the "id" of the part it opens), or tell the person.' : null,
    seen?.picture ? `Look at ${seen.picture.replace(ROOT + '/', '')} before you answer.` : null,
    gaps.length ? `Tell the person each gap above as it is written: the design team decides them; never build one. Offer to send them to Figma as the design team's to do list (${CLI} --figma-edits writes it; applied only after a yes).` : null,
  ].filter(Boolean);
  console.log(`\nNEXT: open ${page.replace(ROOT + '/', '')} to see it.${next.length ? ` ${next.join(' ')}` : ''}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await runPrototype(process.cwd(), process.argv.slice(2)));
}
