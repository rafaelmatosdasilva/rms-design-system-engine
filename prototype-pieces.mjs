// prototype-pieces.mjs - what a prototype may be made of, and the check that holds it to that.
//
// A prototype is a composition (the format --check-ui reads): the design system's own components with their own
// options, nothing else. Claude never writes styles, so nothing can be invented. Where the system has no piece for
// arrangement, the engine lends a few neutral ones: Page, Stack, Row, Columns, and Text for headings and copy. They
// carry no colour, border or font of their own; their spacing can only be one of the system's spacing tokens and their
// text one of its text styles. A system component with the same name always wins, and the engine's pieces are listed
// as layout the system lacks. A need nothing fits is a Missing box with the need written on it, and a component used
// for a need it does not quite meet carries `standInFor`; both go on the gaps list for the design team.
//
// Pure: no I/O. prototype.mjs is the command.
import { checkUi } from './ui-catalog.mjs';
import { ruledOut, requestFindings } from './prototype-context.mjs';

export const PIECES = ['Page', 'Stack', 'Row', 'Columns', 'Text', 'Missing'];
export const GAP_KINDS = ['component', 'option', 'token', 'icon', 'layout', 'pattern'];

// The system's scales a piece may use: spacing tokens ({ figma, var, value }) and text styles ({ name, size, weight, lh }).
// The family the system's own text is set in: its text styles' when Figma names one, else the one its component CSS
// uses most (`font-family`, or the family at the end of a `font` shorthand).
// A family written through a variable (font-family: var(--font-family), sans-serif) counts as the variable's value.
export function systemFamily(cssText = '') {
  const count = new Map();
  const vars = new Map();
  for (const m of String(cssText).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  const resolve = (f) => f.replace(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/, (all, v) => { const x = vars.get(v); return x && !/var\(/.test(x) ? x : all; });
  for (const m of String(cssText).matchAll(/font-family\s*:\s*([^;}]+)/g)) { const f = resolve(m[1].trim()); if (!/^var\(/.test(f) && f !== 'inherit') count.set(f, (count.get(f) ?? 0) + 1); }
  for (const m of String(cssText).matchAll(/(?<![\w-])font\s*:[^;}]*?(?<![\w.])[\d.]+(?:px|rem|em|%)(?:\s*\/\s*[\d.]+(?:px|rem|em|%)?)?\s+([^;}]+)/g)) { const f = resolve(m[1].trim()); if (!/^var\(/.test(f)) count.set(f, (count.get(f) ?? 0) + 1); }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function systemScales(view = {}, figmaVars = {}, cssText = '') {
  const spacing = (view.tokens?.spacing ?? []).map((t) => ({ name: t.figma, var: t.var, value: t.value }));
  const text = Object.entries(figmaVars.typography ?? {}).map(([name, t]) => ({ name, size: t.size, weight: t.weight, lh: t.lh, family: t.family }));
  // The page's own colours, when the system names them: its page surface and its primary text.
  // A component's own colour (buttonSecondary/background) is never the page's: only system-wide names count.
  const own = new Set((view.components ?? []).map((c) => String(c.name).toLowerCase().replace(/^[._]+/, '')));
  const colours = (view.tokens?.colors ?? []).flatMap((g) => g.items).filter((t) => !own.has(String(t.figma).split('/')[0].toLowerCase()));
  const best = (list, score) => list.map((t) => [t, score(t.figma.toLowerCase())]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const surface = best(colours, (n) => (/(surface|background|\bbg\b|canvas)/.test(n) ? 2 : 0) && ((/surface/.test(n) ? 2 : 0) + (/(page|canvas|app)/.test(n) ? 3 : 0) + (/(base|default|low)/.test(n) ? 1 : 0) + 1));
  const ink = best(colours, (n) => (/(^|\/)(text|content|foreground|ink)\//.test(n) ? 1 : 0) && ((/primary|default|base/.test(n) ? 2 : 0) + 1));
  // Every colour token, for a surface or a text colour the screen binds to one of them.
  const colors = (view.tokens?.colors ?? []).flatMap((g) => g.items).map((t) => ({ name: t.figma, var: t.var }));
  return { spacing, text, colors, surface: surface?.var ?? null, ink: ink?.var ?? null, family: text.find((t) => t.family)?.family ?? systemFamily(cssText) };
}

// The engine's pieces as catalog entries, so one checker reads them with the system's components. A piece whose name
// the system already uses is left out: the system's own wins.
export function pieceCatalog(scales, systemNames = []) {
  const taken = new Set(systemNames.map((n) => n.toLowerCase()));
  const space = scales.spacing.map((t) => t.name);
  const spacing = space.length ? { type: 'enum', values: ['none', ...space] } : { type: 'enum', values: ['none'] };
  const sides = { paddingTop: spacing, paddingRight: spacing, paddingBottom: spacing, paddingLeft: spacing };
  const defs = {
    Page: { description: 'The engine\'s page: the system\'s page surface and text colour, its children one under another; width and height are the screen\'s, in px; clip cuts what overflows; mode names the system\'s modes it is drawn in.', props: { padding: spacing, gap: spacing, align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'] }, width: { type: 'text' }, height: { type: 'text' }, clip: { type: 'boolean' }, mode: { type: 'text' }, ...sides } },
    Stack: { description: 'The engine\'s vertical arrangement; grow takes the room its parent leaves; surface is a colour token\'s Figma name for its background.', props: { gap: spacing, padding: spacing, align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'] }, grow: { type: 'boolean' }, stretch: { type: 'boolean' }, clip: { type: 'boolean' }, ...sides, surface: { type: 'text' } } },
    Row: { description: 'The engine\'s horizontal arrangement; grow takes the room its parent leaves; surface is a colour token\'s Figma name for its background.', props: { gap: spacing, padding: spacing, align: { type: 'enum', values: ['start', 'center', 'end', 'stretch', 'baseline'] }, justify: { type: 'enum', values: ['start', 'center', 'end', 'between'] }, wrap: { type: 'boolean' }, grow: { type: 'boolean' }, stretch: { type: 'boolean' }, clip: { type: 'boolean' }, ...sides, surface: { type: 'text' } } },
    Columns: { description: 'The engine\'s equal columns; minWidth is the narrowest a column may be, in px: on a narrower screen the columns wrap, fewer to a row.', props: { count: { type: 'enum', values: ['2', '3', '4'] }, minWidth: { type: 'text' }, gap: spacing, grow: { type: 'boolean' }, stretch: { type: 'boolean' } } },
    Text: { description: 'Copy in one of the system\'s text styles; color is a colour token\'s Figma name.', props: { text: { type: 'text' }, style: { type: 'enum', values: scales.text.map((t) => t.name) }, as: { type: 'enum', values: ['h1', 'h2', 'h3', 'p', 'span'] }, color: { type: 'text' } } },
    Missing: { description: 'A need the system has nothing for: a labelled empty box, and a line on the gaps list.', props: { need: { type: 'text' }, kind: { type: 'enum', values: GAP_KINDS }, closest: { type: 'text' } } },
  };
  if (!scales.text.length) delete defs.Text.props.style;
  return Object.fromEntries(Object.entries(defs).filter(([n]) => !taken.has(n.toLowerCase())).map(([n, d]) => [n, { ...d, engine: true }]));
}

// The nodes of a composition as one flat list, whatever its form (nested or A2UI), with each node's props together.
const RESERVED = new Set(['id', 'component', 'children', 'child', 'props', 'type']);
export function nodesOf(ui) {
  const out = [];
  let n = 0;
  if (Array.isArray(ui?.components)) {
    for (const c of ui.components) out.push({ id: c.id, component: c.component, props: { ...Object.fromEntries(Object.entries(c).filter(([k]) => !RESERVED.has(k))), ...(c.props ?? {}) }, children: c.children ?? [] });
    return { root: ui.root ?? out[0]?.id ?? null, nodes: out };
  }
  const walk = (node) => {
    if (!node || typeof node !== 'object') return null;
    const id = node.id ?? `node-${++n}`;
    const kids = (Array.isArray(node.children) ? node.children : []).map(walk).filter(Boolean);
    out.push({ id, component: node.component, props: { ...Object.fromEntries(Object.entries(node).filter(([k]) => !RESERVED.has(k))), ...(node.props ?? {}) }, children: kids });
    return id;
  };
  return { root: walk(ui), nodes: out };
}

// A copy of the composition without `standInFor` (a note for the gaps list, not a prop the component takes).
function withoutNotes(ui) {
  // A column count may be written as a number; the catalog lists it as text.
  const strip = (o) => {
    // Notes the check reads and the drawing uses, never options: standInFor, purpose, content (the words a designed
    // instance shows), box (its size on the screen) and, on a component the code has not built, the surface the screen
    // gives it, figmaState (the state a designed screen shows it in) and opens (the id of the part a click opens).
    const { standInFor, purpose, content, box, textless, figmaState, opens, goesTo, ...rest } = o;
    for (const k of ['width', 'height']) if (typeof rest[k] === 'number') rest[k] = String(rest[k]);
    if (rest.props && typeof rest.props === 'object') { const { standInFor: s2, purpose: p2, content: c2, box: b2, textless: t2, figmaState: f2, opens: o2, goesTo: g2, ...p } = rest.props; if (!PIECES.includes(rest.component)) delete p.surface; rest.props = p; for (const k of ['width', 'height', 'count', 'minWidth']) if (typeof p[k] === 'number') p[k] = String(p[k]); }
    if (typeof rest.count === 'number') rest.count = String(rest.count);
    return rest;
  };
  if (Array.isArray(ui?.components)) return { ...ui, components: ui.components.map(strip) };
  const walk = (node) => (node && typeof node === 'object' ? { ...strip(node), ...(Array.isArray(node.children) ? { children: node.children.map(walk) } : {}) } : node);
  return walk(ui);
}

// catalog: contracts/catalog.json · view: the style guide's agreed view (what can be drawn) · scales: systemScales().
// Returns { ok, findings, counts, gaps, drawable: { name: component view }, pieces } (findings as checkUi's).
// limits: the guidelines' "at most n <component> per screen" ([{ component, max, per, sentence, from }]).
// breakpoints: the system's screen widths ([{ name, px }]); a Page.width that is none of them is a warning.
// context: prototype-context's view of the documentation, for the uses it rules out.
// request: what the person asked for (the prompt hook keeps it), held against the composition.
export function checkPrototype(ui, { catalog = { components: {} }, view = { components: [] }, scales = { spacing: [], text: [] }, name = 'prototype', declared = [], limits = [], breakpoints = [], context = null, request = null, css = '' } = {}) {
  const systemNames = Object.keys(catalog.components ?? {});
  const pieces = pieceCatalog(scales, systemNames);
  const r = checkUi(withoutNotes(ui), { ...catalog, components: { ...catalog.components, ...pieces } });
  // A component the catalog does not have is never made up: it is a Missing box with the need written on it.
  const findings = r.findings.map((f) => (f.rule === 1 && f.level === 'error' && pieces.Missing ? { ...f, message: `${f.message}; if the system has nothing for it, write a Missing box with the need instead` } : f));
  const drawable = Object.fromEntries((view.components ?? []).map((c) => [c.name, c]));
  const gaps = [];
  const { root: rootId, nodes } = nodesOf(ui);
  const used = {};
  // What a click opens is another part of the composition, named by its id; never the page itself.
  const ids = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const to = node.props?.opens;
    if (to == null) continue;
    if (typeof to !== 'string' || !ids.has(to)) findings.push({ rule: 2, level: 'error', id: node.id, message: `${node.component}.opens names ${JSON.stringify(to)}, and no part has that id: give the part it opens an "id" and name it here` });
    else if (to === rootId || to === node.id) findings.push({ rule: 2, level: 'error', id: node.id, message: `${node.component}.opens names ${to === rootId ? 'the page itself' : 'itself'}: it opens another part (a dialog, a menu), drawn closed until it is used` });
  }
  for (const node of nodes) {
    const p = node.props ?? {};
    if (node.component === 'Missing' && pieces.Missing) {
      gaps.push({ need: String(p.need ?? 'unnamed need'), kind: p.kind ?? 'component', closest: p.closest ?? null, used: null, prototype: name, node: node.id });
      if (!p.need) findings.push({ rule: 2, level: 'error', id: node.id, message: 'a Missing box must say the need it stands for (need)' });
      continue;
    }
    if (node.component === 'Columns' && pieces.Columns && p.minWidth != null && !/^\d{2,4}$/.test(String(p.minWidth))) findings.push({ rule: 2, level: 'error', id: node.id, message: `Columns.minWidth is the narrowest a column may be, in px (like "240"), not ${JSON.stringify(p.minWidth)}` });
    if (node.component === 'Page' && pieces.Page && p.width != null && !/^\d{2,4}$/.test(String(p.width))) findings.push({ rule: 2, level: 'error', id: node.id, message: `Page.width is the screen's width in px (like "820"), not ${JSON.stringify(p.width)}` });
    // A stand-in is a gap whatever stands in, the engine's own Text included.
    if (pieces[node.component] && p.standInFor) gaps.push({ need: String(p.standInFor), kind: 'component', closest: null, used: `the engine's ${node.component}`, prototype: name, node: node.id });
    if (pieces[node.component]) { if (node.component !== 'Text') (used[node.component] ??= []).push(node.id); continue; }
    if (p.standInFor) gaps.push({ need: String(p.standInFor), kind: 'component', closest: node.component, used: node.component, prototype: name, node: node.id });
    // A use the component's documentation rules out: never as a stand-in; as a label, worth a look.
    if (context?.components?.[node.component]) {
      for (const r of ruledOut(context.components[node.component], p.standInFor ?? '', node.component)) findings.push({ rule: null, source: 'the team\'s documentation', level: 'error', id: node.id, message: `${node.component} is not for "${p.standInFor}": "${r.sentence}". Show "${p.standInFor}" as a Missing box instead` });
      const label = [p.Label, p.label, p.text].find((v) => typeof v === 'string' && v.trim());
      if (!p.standInFor && label) for (const r of ruledOut(context.components[node.component], label, node.component)) findings.push({ rule: null, source: 'the team\'s documentation', level: 'warning', id: node.id, message: `${node.component} "${label}": its documentation says "${r.sentence}"; check this use, and use a Missing box if it is ruled out` });
    }
    if (!catalog.components?.[node.component]) continue;   // checkUi already said so
    // A component the team has retired is never put in a new screen: its replacement is.
    const def = catalog.components[node.component];
    if (/^(deprecated|removed|obsolete)$/i.test(def.status ?? '')) findings.push({ rule: 1, level: 'error', id: node.id, message: `${node.component} is ${def.status}${def.useInstead?.length ? `: use ${def.useInstead.join(' or ')} instead` : ': the team retired it, so it is not used in a new screen'}` });
    const v = drawable[node.component];
    if (!v) {
      gaps.push({ need: `${node.component} built in code`, kind: 'component', closest: null, used: null, prototype: name, node: node.id, note: 'in Figma, not built in the code yet: drawn as a labelled box' });
      continue;
    }
    // A prop Figma and the code do not agree on yet is drawn with its default, never guessed.
    const agreed = new Set((v.controls ?? []).flatMap((c) => [c.label, c.prop]));
    const optDefs = catalog.components[node.component]?.props ?? {};
    for (const k of Object.keys(p)) {
      if (['standInFor', 'purpose', 'content', 'box', 'textless', 'surface', 'figmaState', 'opens', 'goesTo'].includes(k) || agreed.has(k)) continue;
      // A value of a choice turns on the class the system's CSS adds for it (.node.node-selected); a default value
      // needs none. One the CSS has no class for is drawn without it, and said.
      if (optDefs[k]?.type === 'enum') {
        if (String(p[k]) === String(optDefs[k].default ?? '') || /^(default|false|none|off|no|normal|rest)$/i.test(String(p[k]))) continue;
        if (modifierFor(css, v.cls, /^true$/i.test(String(p[k])) ? k : p[k])) continue;
        const saidV = `${node.component}.${k}=${p[k]}`;
        if (!findings.some((f) => f.said === saidV)) findings.push({ rule: null, source: 'the code', level: 'warning', id: node.id, said: saidV, message: `${saidV}: the system's CSS has no class for it: drawn without it` });
        continue;
      }
      // A text or on/off option the code has no prop for is drawn on the part its name points to (prototype page).
      if (['text', 'boolean'].includes(optDefs[k]?.type) && drawnByName(k, optDefs[k], v.markup)) continue;
      if (optDefs[k]?.type === 'boolean' && (p[k] === true || /^true$/i.test(String(p[k])))) continue;   // shown, as it is drawn
      if (['text', 'boolean'].includes(optDefs[k]?.type) && !v.markup) continue;   // no markup: drawn as its text, nothing else to hide
      const said = `${node.component}.${k}`;
      if (findings.some((f) => f.said === said)) continue;
      findings.push({ rule: null, source: 'the code', level: 'warning', id: node.id, said, message: `${said} has no part of that name in the code yet: drawn without it` });
    }
  }
  // The team's written limits: a component used more often than its guidelines allow.
  const count = new Map();
  for (const node of nodes) count.set(node.component, (count.get(node.component) ?? 0) + 1);
  for (const l of limits) {
    const n = count.get(l.component) ?? 0;
    if (n > l.max) findings.push({ rule: null, source: 'the team\'s guidelines', level: 'error', id: null, message: `${n} ${l.component} on this ${l.per}, and the guidelines allow ${l.max}: "${l.sentence}" (${l.from}). Keep ${l.max === 1 ? 'the main one' : `${l.max}`}; for the rest use what the guidelines name, or a Missing box when the system lacks it` });
  }
  if (context && request) findings.push(...requestFindings(context, request, nodes));
  const root = nodes.find((n) => n.component === 'Page');
  const w = root?.props?.width != null ? Number(root.props.width) : null;
  if (w && breakpoints.length && !breakpoints.some((b) => Math.abs(b.px - w) < 1)) findings.push({ rule: null, source: 'the system\'s screen widths', level: 'warning', id: root.id, message: `Page.width ${w} is none of the system's screen widths: ${breakpoints.map((b) => `${b.name} (${b.px})`).join(', ')}` });
  // A surface or a text colour is one of the system's colour tokens, never a value of its own.
  const tokenNames = new Set((scales.colors ?? []).map((t) => t.name));
  for (const n of nodes) for (const k of ['surface', 'color']) {
    const v = n.props?.[k];
    if (v == null || !pieces[n.component]) continue;
    if (!tokenNames.has(String(v))) findings.push({ rule: 2, level: 'error', id: n.id, message: `${n.component}.${k} "${v}" is not one of the system's colour tokens: name one of them by its Figma name, or leave it out` });
  }
  // Gaps written beside the composition (a screen's starting point carries what its screen used that the system lacks).
  for (const g of declared) if (g?.need) gaps.push({ need: String(g.need), kind: GAP_KINDS.includes(g.kind) ? g.kind : 'component', closest: g.closest ?? null, used: g.used ?? null, prototype: name, node: null, ...(g.note ? { note: g.note } : {}) });
  // The engine's layout pieces stand in for layout components the system does not have.
  for (const [piece, ids] of Object.entries(used)) gaps.push({ need: `a ${piece} layout component`, kind: 'layout', closest: null, used: `the engine's ${piece}`, prototype: name, node: ids.join(', '), count: ids.length });
  const errors = findings.filter((f) => f.level === 'error').length;
  return { ok: errors === 0, findings, counts: { components: r.counts.components, errors, warnings: findings.length - errors }, gaps, drawable, pieces: Object.keys(pieces) };
}

// The class the system's CSS adds to a component's class for a value (the same reading the page does), or null.
export function modifierFor(css, cls, value) {
  if (!cls || !css) return null;
  const word = String(value).replace(/^show[\s_-]*/i, '').replace(/[\s_-]*content$/i, '').replace(/[\s_-]+/g, '').toLowerCase();
  if (word.length < 3) return null;
  const mods = new Set();
  for (const m of String(css).matchAll(new RegExp(`\\.${String(cls).replace(/[^\w-]/g, '')}((?:\\.[A-Za-z][\\w-]*)+)`, 'g'))) for (const k of m[1].split('.').filter(Boolean)) mods.add(k);
  const flat = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = [...mods].find((m) => { const w = flat(m); return w === word || w.endsWith(word) || (word.length >= 4 && w.includes(word)); });
  if (named || word.length < 4) return named ?? null;
  // Else the class whose rules use a variable the value names (Type=negative: .badge.high coloured with --…-negative).
  const clean = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  return [...mods].find((m) => { const sel = new RegExp(`\\.${String(cls).replace(/[^\w-]/g, '')}\\.${m.replace(/[^\w-]/g, '')}(?![\\w-])`); return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((r) => sel.test(r[1]) && [...r[2].matchAll(/var\(\s*(--[\w-]+)/g)].some((v) => flat(v[1]).includes(word))); }) ?? null;
}

// Whether the prototype page can draw an option by its name (the same reading the page does): a class in the
// component's markup that the name points to (TitleContent → a class saying title), the Figma default text in it, or
// the component's own text for a label.
export function drawnByName(prop, def = {}, markup = '') {
  const m = String(markup ?? '');
  if (!m) return false;
  const word = String(prop).replace(/^show[\s_-]*/i, '').replace(/[\s_-]*content$/i, '').replace(/[\s_-]+/g, '').toLowerCase();
  const tokens = [...m.matchAll(/class="([^"]*)"/g)].flatMap((x) => x[1].toLowerCase().split(/[\s_-]+/));
  if (word && tokens.some((c) => c === word || (c.length >= 4 && word.startsWith(c)) || (word.length >= 4 && c.startsWith(word)))) return true;
  if (word === 'icon' && /<svg\b/i.test(m)) return true;
  if (def.type === 'text' && ['label', 'title', 'text'].includes(word)) return true;
  if (def.type === 'text' && typeof def.default === 'string' && def.default.trim() && new RegExp(`>\\s*${def.default.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`, 'i').test(m)) return true;
  return false;
}

// The gaps of every prototype so far, merged by need: what the design team sees, the most needed first.
export function mergeGaps(byPrototype = {}) {
  const merged = new Map();
  for (const [proto, list] of Object.entries(byPrototype)) {
    for (const g of list ?? []) {
      const key = `${g.kind}|${String(g.need).toLowerCase()}`;
      if (!merged.has(key)) merged.set(key, { need: g.need, kind: g.kind, closest: g.closest ?? null, used: g.used ?? null, note: g.note ?? null, prototypes: [] });
      const m = merged.get(key);
      if (!m.prototypes.includes(proto)) m.prototypes.push(proto);
      if (!m.closest && g.closest) m.closest = g.closest;
    }
  }
  return [...merged.values()].sort((a, b) => b.prototypes.length - a.prototypes.length || (a.kind === 'layout') - (b.kind === 'layout'));
}

// One line per gap, for the summary and the reply.
export function gapLine(g) {
  const where = g.prototypes ? ` (needed in ${g.prototypes.length} prototype${g.prototypes.length === 1 ? '' : 's'}: ${g.prototypes.join(', ')})` : '';
  const instead = g.used ? `; the prototype uses ${g.used} meanwhile` : g.closest ? `; closest in the system: ${g.closest}` : '';
  return `${g.kind}: ${g.need}${instead}${g.note ? ` (${g.note})` : ''}${where}`;
}
