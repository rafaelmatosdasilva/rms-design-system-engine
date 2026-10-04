// styleguide-data.mjs - what the engine's style guide may show: only what Figma and the code agree on.
//
// A prop is shown as a control when Gate [15] matched it (component-prop-result.json, status "match"): Figma has it,
// the code accepts it under its counterpart name, with the same options and default. The control carries both
// names: Figma's as the label people read, the code's as the prop the code takes. Everything else (a prop missing on
// one side, a renamed one, a different default or option, a component not built yet, a recorded value that moved on
// one side) is not shown: it is counted in one line, and the person decides it before it appears.
//
// Pure: agreedView takes what the generator read and returns { components, notAgreed, modes }.
import { roleWord } from './role-markup.mjs';

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A Figma prop name without its node suffix ("Label#3:4" → "Label").
const cleanName = (k) => String(k).replace(/#[\d:]+$/, '');

// The mode axes the page offers, like Figma's mode collections: colour from ds-config.json figma.modes (the same
// cssSelector forms the capture reads), size from the sizing collection's own modes (vars snapshot modeVariants).
// An axis is `scoped` when its CSS is an attribute block that nests ([data-color], [data-size]): then each component
// can flip its own preview, as a Figma mode does on a frame. A :root-only switch is global.
export function modeAxes(cfg = {}, figmaVars = {}) {
  const axes = [];
  const modes = cfg.figma?.modes?.length ? cfg.figma.modes : [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'dark-media' }];
  const colour = { label: 'Color', values: [] };
  for (const m of modes) {
    const sel = m.cssSelector ?? 'root';
    if (sel === 'root') colour.values.push({ label: m.name, value: '' });
    else if (sel === 'dark-media') { colour.attr = 'data-color'; colour.scoped = true; colour.values.push({ label: m.name, value: 'dark' }); }
    else if (sel.startsWith('data:')) { const [a, v = ''] = sel.slice(5).split('='); colour.attr = colour.attr ?? (a.startsWith('data-') ? a : `data-${a}`); colour.values.push({ label: m.name, value: v }); }
    else if (sel.startsWith('class:')) { colour.classes = true; colour.values.push({ label: m.name, value: sel.slice(6) }); }
    // other media modes (breakpoints, contrast) are not a switch on one page
  }
  // The derived [data-color] blocks name the light mode too, so a scoped preview can go back to light inside a dark page.
  if (colour.attr === 'data-color') colour.values = colour.values.map((v) => (v.value === '' ? { ...v, value: 'light' } : v));
  if (colour.values.length > 1) axes.push(colour);
  for (const def of Object.values(figmaVars.modeVariants ?? {})) {
    const ms = def?.modes ?? [];
    if (ms.length < 2 || !Object.values(def.vars ?? {}).some((v) => v?.kind === 'scalar')) continue;
    axes.push({ label: 'Size', attr: 'data-size', scoped: true, values: ms.map((m, i) => ({ label: m.name ?? m.snapshotKey, value: i === 0 ? '' : m.snapshotKey })) });
    break;
  }
  return axes;
}

// What an option's selector adds to the component's own: classes, attributes, or a live state the page cannot hold
// (:hover, :focus). '.chip.chip--l' over '.chip' adds chip--l; '.button:disabled' sets disabled.
export function optionEffect(baseSelector, optionSelector) {
  if (!optionSelector) return null;
  const last = String(optionSelector).trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? '';
  const baseClasses = new Set((String(baseSelector ?? '').match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)));
  const add = (last.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)).filter((c) => !baseClasses.has(c));
  const attrs = {};
  for (const m of last.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)) attrs[m[1]] = m[2] ?? '';
  for (const m of last.matchAll(/:(disabled|checked|indeterminate|required|invalid)\b/g)) attrs[m[1] === 'invalid' ? 'aria-invalid' : m[1]] = m[1] === 'invalid' ? 'true' : '';
  const live = /:(hover|focus|focus-visible|focus-within|active)\b/.test(last);
  if (!add.length && !Object.keys(attrs).length) return live ? { live: true } : {};
  return { add, attrs, ...(live ? { live: true } : {}) };
}

// The part a boolean shows or a text prop writes: the contract's child of that name ("Show Icon" → its Icon child),
// else the part the word names in common markup (an icon is an svg or an *icon* class, a label its text).
function partFor(propName, list = [], fallback = null) {
  const word = String(propName).replace(/^(show|has|with)[\s_-]*/i, '').replace(/[\s_-]*(left|right|start|end)$/i, '').trim().toLowerCase();
  const named = (list ?? []).find((p) => String(p.name).toLowerCase() === word) ?? (list ?? []).find((p) => String(p.name).toLowerCase().includes(word));
  if (named) return String(named.selector).trim().split(/\s+/).pop();
  const kind = /icon|glyph|symbol/.test(word) ? 'icon' : /label|text|title|value/.test(word) ? 'label' : fallback;
  return kind === 'icon' ? 'svg, [class*="icon"]' : kind === 'label' ? '[class*="label"], [class*="text"], span' : null;
}

// The class a variant option would carry in the code, only when the project's CSS has that selector.
function variantClass(cls, option, cssText) {
  if (!cls) return null;
  const c = `${cls}--${slug(option)}`;
  return new RegExp(`\\.${c}(?![\\w-])`).test(cssText) ? c : null;
}

// propsSnap: figma-component-props.snapshot.json · rows: component-prop-result.json rows · agreedRecord: the agreed
// record ({ facts }) · classFor(name) → the component's class · cssText: the project's CSS · probes: { name: markup }
// · probeList: every probe the contract has (one that holds the component's class is a candidate too) · unbuilt: names
// Figma has and the code does not yet.
// check: parity-check.mjs --json result · figmaVars: the vars snapshot · pages: the project's own HTML (text) ·
// usage: { name: [app labels] } · notes: { name: the code's own note } · icons: the icon ids · title: the system's name.
// propertyMaps: { name: the contract's propertyMap (Figma prop → option → selector) } · parts: { name: [{ name, selector }] }
// from the contract's children. · jsx: { name: the markup a React component's own JSX returns (jsx-markup.mjs) }, used
// when neither the contract nor a page has it.
export function agreedView({ propsSnap = {}, rows = [], agreedRecord = {}, classFor = () => null, cssText = '', probes = {}, probeList = [], unbuilt = [], cfg = {},
  check = null, figmaVars = {}, pages = [], usage = {}, notes = {}, icons = [], title = '', propertyMaps = {}, parts = {}, jsx = {}, alsoNames = [] } = {}) {
  const byComponent = new Map();
  for (const r of rows) { if (!byComponent.has(r.component)) byComponent.set(r.component, []); byComponent.get(r.component).push(r); }
  const components = [], waiting = [];
  let undecided = 0;
  // alsoNames: components the catalog has that Figma lists no props for (a prototype draws them as they are, when the
  // code has their markup); they never count as waiting or undecided.
  const extra = alsoNames.filter((n) => !(n in propsSnap)).map((n) => [n, { properties: {}, noProps: true }]);
  for (const [name, entry] of [...Object.entries(propsSnap), ...extra]) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object') continue;
    if (entry.noProps && unbuilt.includes(name)) continue;
    const mine = byComponent.get(name) ?? [];
    if (unbuilt.includes(name) || mine.some((r) => /^\(no code file/.test(String(r.codeValue)))) { waiting.push(`${name} (not built yet)`); continue; }
    const cls = String(classFor(name) ?? '').replace(/^\./, '') || null;   // the class itself, without its dot
    const defs = Object.fromEntries(Object.entries(entry.properties ?? {}).map(([k, d]) => [cleanName(k), d]));
    const controls = [];
    for (const r of mine) {
      if (r.status !== 'match') { undecided++; continue; }   // missing, renamed, another value, or a prop only the code has
      const d = defs[r.figmaProp];
      if (!d) continue;
      const prop = /^\(|^not in code$/.test(String(r.codeProp)) || !r.codeProp ? r.figmaProp : r.codeProp;
      const control = { label: r.figmaProp, prop, type: d.type, default: d.defaultValue ?? null };
      const pm = propertyMaps[name]?.[r.figmaProp] ?? propertyMaps[name]?.[cleanName(r.figmaProp)] ?? null;
      const base = cls ? `.${cls}` : '';
      // An option's effect: the contract's selector for it, else the modifier class the CSS has.
      const effect = (option) => (pm && pm[option] != null ? optionEffect(base, pm[option]) : (() => { const c = variantClass(cls, option, cssText); return c ? { add: [c], attrs: {} } : {}; })());
      // A True/False variant is a switch, as a boolean prop is.
      const opts = d.variantOptions ?? [];
      const yesNo = d.type === 'VARIANT' && opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o));
      if (d.type === 'BOOLEAN' || yesNo) {
        control.type = 'BOOLEAN';
        control.default = String(d.defaultValue).toLowerCase() === 'true';
        const onKey = opts.find((o) => /^true$/i.test(o)) ?? 'True';
        const on = pm ? optionEffect(base, pm[onKey] ?? pm.true ?? pm.True) : null;
        if (on && (on.add?.length || Object.keys(on.attrs ?? {}).length)) control.on = on;
        else if (/^(is)?disabled$/i.test(r.figmaProp)) control.on = { add: [], attrs: { disabled: '' } };
        else { const c = variantClass(cls, r.figmaProp, cssText); if (c) control.on = { add: [c], attrs: {} }; else control.part = partFor(r.figmaProp, parts[name]); }
      } else if (d.type === 'VARIANT') control.options = opts.map((o) => ({ label: o, ...effect(o) }));
      else if (d.type === 'TEXT') control.part = partFor(r.figmaProp, parts[name], 'label');
      controls.push(control);
    }
    // Its markup: the fullest of the contract's probes, its instances in the project's pages, what the pages' scripts
    // build and what its React source returns.
    const candidates = [
      ...[probes[name], ...probeList.filter((p) => p !== probes[name])].flatMap((p) => (p === probes[name] && p ? [p] : instanceMarkups(p, cls, 1))).map((markup) => ({ markup, from: 'contract' })),
      ...pages.flatMap((h) => instanceMarkups(h, cls)).map((markup) => ({ markup, from: 'page' })),
      ...pages.flatMap((h) => scriptMarkups(h, cls)).map((markup) => ({ markup, from: 'script' })),
      ...(jsx[name] ? [{ markup: jsx[name], from: 'jsx' }] : []),
    ];
    const chosen = fullestMarkup(candidates);
    const markup = chosen?.markup ?? null;
    // Every other markup the code shows for it, fullest first: a drawing picks the one that fits each instance's words.
    const markups = [...new Set(candidates.map((c) => c.markup).filter((m) => m && elementsIn(m) <= 30))].sort((a, b) => elementsIn(b) - elementsIn(a)).slice(0, 6);
    if (entry.noProps && !markup) continue;
    components.push({ name, cls, role: roleWord(entry.annotations), description: entry.description ?? '', note: notes[name.toLowerCase()] ?? notes[name] ?? '',
      markup, markups: markups.length > 1 ? markups : undefined, markupFrom: chosen?.from ?? 'role', usage: usage[name] ?? [], tokens: componentTokens(cssText, cls), controls });
  }
  // A recorded value that moved on one side since it was agreed is not agreed any more.
  for (const f of Object.values(agreedRecord.facts ?? {})) if (f && f.figma !== undefined && f.code !== undefined && String(f.figma) !== String(f.code)) undecided++;
  const tokens = check ? agreedTokens(check, figmaVars) : null;
  undecided += tokens?.differences ?? 0;
  const said = [];
  if (undecided) said.push(`${undecided} difference${undecided === 1 ? '' : 's'} between Figma and the code`);
  if (waiting.length) said.push(`${waiting.length} component${waiting.length === 1 ? '' : 's'} not built yet (${waiting.map((w) => w.replace(/ \(not built yet\)$/, '')).join(', ')})`);
  const line = said.length ? `Not shown until agreed, ${said.join(' and ')}. Run the audit to see them and decide each one.` : 'Everything Figma and the code have is agreed.';
  return { title, components, tokens, icons, notAgreed: { differences: undecided, waiting, line }, modes: modeAxes(cfg, figmaVars) };
}

// ── Tokens: only the ones the token check found equal to Figma (parity-check.mjs --json → passVars) ─────────────
// A colour counts when it matches in every mode Figma has it in. Sizing is split into spacing, radii and the rest by
// its Figma name. Returns { colors: [{ group, items }], spacing, radii, sizing, typography, differences }.
export function agreedTokens(check = {}, figmaVars = {}) {
  const pass = check.passVars ?? [];
  const colours = new Map();
  for (const p of pass.filter((x) => x.dimension === 'color')) {
    if (!colours.has(p.token)) colours.set(p.token, { var: p.cssVar, values: {} });
    colours.get(p.token).values[p.mode] = p.value;
  }
  const modesOf = (token) => Object.keys(figmaVars.color ?? {}).filter((m) => figmaVars.color[m]?.[token] != null);
  const groups = new Map();
  for (const [token, c] of colours) {
    const modes = modesOf(token);
    if (modes.length && modes.some((m) => !(m in c.values))) continue;   // equal in one mode, not in another: not agreed
    const name = token.replace(/\/colou?r$/, '');
    const group = name.includes('/') ? name.split('/')[0] : 'color';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ figma: name, var: c.var, values: c.values });
  }
  const sizes = pass.filter((x) => x.dimension === 'sizing').map((p) => ({ figma: p.token, var: p.cssVar, value: p.value }));
  const isRadius = (t) => /radi(i|us)|corner/i.test(t.figma), isSpace = (t) => /\b(gap|padding|margin|space|spacing|inset)\b/i.test(t.figma.replace(/\//g, ' '));
  const scales = new Map();
  for (const p of pass.filter((x) => x.dimension === 'typography')) {
    const [scale, prop] = p.token.split('/');
    if (!scales.has(scale)) scales.set(scale, { scale });
    scales.get(scale)[prop] = { var: p.cssVar, value: p.value };
  }
  const differences = (check.fail ?? []).length + (check.aliasFail ?? []).length;
  return {
    colors: [...groups].map(([group, items]) => ({ group, items })),
    spacing: sizes.filter((t) => isSpace(t) && !isRadius(t)),
    radii: sizes.filter(isRadius),
    sizing: sizes.filter((t) => !isSpace(t) && !isRadius(t)),
    typography: [...scales.values()],
    differences,
  };
}

// ── A component's real markup: the first element in the project's own pages that carries its class ───────────────
// Static HTML only (a React page renders in the browser). Ids, inline handlers and scripts are taken out, so the copy
// is markup and nothing else.
export function instanceMarkup(html, cls) {
  return instanceMarkups(html, cls, 1)[0] ?? null;
}

// Every element in a piece of HTML that carries the class, outermost first (the first `max` of them).
export function instanceMarkups(html, cls, max = 20) {
  if (!html || !cls) return [];
  const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])[^"']*["'][^>]*>`, 'g');
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<template\b[\s\S]*?<\/template>/gi, '');
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  const out = [];
  let m;
  while (out.length < max && (m = open.exec(body))) {
    const tag = m[1].toLowerCase();
    let end = m.index + m[0].length;
    if (!VOID.test(tag) && !/\/>$/.test(m[0])) {
      const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
      re.lastIndex = end;
      let depth = 1, t;
      while (depth && (t = re.exec(body))) { if (t[1]) depth--; else if (!/\/>$/.test(t[0])) depth++; end = re.lastIndex; }
      if (depth) continue;
    }
    out.push(body.slice(m.index, end).replace(/\s(id|on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').trim());
    open.lastIndex = end;
  }
  return out;
}

// The markup a page's scripts build for a component: a string written piece by piece ('<button class="node' + (on ?
// ' node-selected' : '') + '">' + esc(name) + '</button>'), read as its literal pieces only, so what a value would
// fill is left empty and a branch is left out. Only a string that closes the component's element counts.
export function scriptMarkups(html, cls, max = 20) {
  if (!html || !cls) return [];
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const out = [];
  const hasCls = new RegExp(`<[a-zA-Z][\\w-]*\\b[^<>]*\\bclass\\s*=\\s*["'][^"']*(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  for (const js of scripts) {
    // A variable that holds markup (var badge = remote ? '<span…>' : '') is a part, not words.
    markupVars = new Set([...js.matchAll(/\b(?:var|let|const)\s+([\w$]+)\s*=[^;]*?['"`]\s*</g)].map((m) => m[1]));
    for (let i = 0; i < js.length && out.length < max; i++) {
      const q = js[i];
      if (q !== "'" && q !== '"' && q !== '`') continue;
      if (/[\w$\\]/.test(js[i - 1] ?? '')) continue;
      const first = literalAt(js, i);
      if (!first) continue;
      if (!/^\s*<[a-zA-Z]/.test(first.text) || !hasCls.test(first.text + '"')) { i = first.end - 1; continue; }
      const { text, end } = concatenation(js, i);
      i = end - 1;
      const m = instanceMarkup(text, cls);
      if (m) out.push(m.replace(/\s{2,}/g, ' '));
    }
  }
  return out;
}
// A string literal starting at i: its text (a template's ${…} left empty) and where it ends.
function literalAt(js, i) {
  const q = js[i];
  let text = '', j = i + 1;
  while (j < js.length) {
    const ch = js[j];
    if (ch === '\\') { text += js[j + 1] === 'n' ? '\n' : js[j + 1]; j += 2; continue; }
    if (ch === q) return { text, end: j + 1 };
    if (q === '`' && ch === '$' && js[j + 1] === '{') { const e = balanced(js, j + 1); if (e < 0) return null; j = e; continue; }
    if (q !== '`' && ch === '\n') return null;
    text += ch; j++;
  }
  return null;
}
// The index just past the bracket that closes the one at i, or -1.
function balanced(js, i) {
  const open = js[i], close = { '(': ')', '[': ']', '{': '}' }[open];
  let depth = 0;
  for (let j = i; j < js.length; j++) {
    const ch = js[j];
    if (ch === "'" || ch === '"' || ch === '`') { const l = literalAt(js, j); if (!l) return -1; j = l.end - 1; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return j + 1;
  }
  return -1;
}
// A run of pieces joined by + from i: the literal pieces at its own level, joined. A value written as text (a name, a
// count, esc(…)) becomes the placeholder Label, where the drawing writes the designed words; a value inside a tag, or one
// a helper builds (an icon's markup), is left empty. A part written only when an option is on (cond ? '<span…>' : '')
// is kept, so the drawing has every part; a class added the same way is left out.
const TEXT_CALL = /^(esc|escape\w*|encode\w*|String|text\w*|t)$/i;
let markupVars = new Set();
function concatenation(js, i, stop = js.length) {
  let text = '', j = i;
  const inTag = () => text.lastIndexOf('<') > text.lastIndexOf('>');
  while (j < stop) {
    while (j < stop && /\s/.test(js[j])) j++;
    if (js.startsWith('//', j)) { while (j < stop && js[j] !== '\n') j++; continue; }
    if (js.startsWith('/*', j)) { const e = js.indexOf('*/', j + 2); j = e < 0 ? stop : e + 2; continue; }
    const ch = js[j];
    if (ch === "'" || ch === '"' || ch === '`') { const l = literalAt(js, j); if (!l) break; text += l.text; j = l.end; }
    else if (ch === '(' || ch === '[') {
      const e = balanced(js, j); if (e < 0) break;
      if (ch === '(' && !inTag()) { const part = optionalPart(js, j + 1, e - 1); if (part) text += part; }
      j = e;
    } else if (/[\w$.]/.test(ch)) {
      const from = j;
      while (j < stop && /[\w$.]/.test(js[j])) j++;
      const name = js.slice(from, j).split('.').pop();
      let called = false;
      while (js[j] === '(' || js[j] === '[') { const e = balanced(js, j); if (e < 0) return { text, end: stop }; called = called || js[j] === '('; j = e; }
      if (!inTag() && (called ? TEXT_CALL.test(name) : !markupVars.has(js.slice(from, j)))) text += 'Label';
    } else break;
    while (j < stop && /[ \t\r\n]/.test(js[j])) j++;
    if (js[j] === '+' && js[j + 1] !== '+' && js[j + 1] !== '=') { j++; continue; }
    break;
  }
  return { text, end: Math.max(j, i + 1) };
}
// The element a bracketed `cond ? '<…>' : ''` writes when its option is on, or null.
function optionalPart(js, from, to) {
  let depth = 0, q = -1, c = -1;
  for (let k = from; k < to; k++) {
    const ch = js[k];
    if (ch === "'" || ch === '"' || ch === '`') { const l = literalAt(js, k); if (!l) return null; k = l.end - 1; continue; }
    if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
    else if (!depth && ch === '?' && q < 0) q = k;
    else if (!depth && ch === ':' && q >= 0) { c = k; break; }
  }
  if (q < 0 || c < 0) return null;
  let k = q + 1; while (/\s/.test(js[k])) k++;
  const { text } = concatenation(js, k, c);
  return /^\s*<[a-zA-Z]/.test(text) ? text : null;
}

// The markup a drawing uses: the fullest of what the code shows for the component (the contract's probes, its
// instances in the pages, what the pages' scripts build, what its React source returns), so a list item a script
// builds with its icon and name is drawn with them rather than from a test's one-line probe. A candidate larger than
// a component (a whole section) counts only when nothing else is there.
const elementsIn = (m) => (String(m).match(/<[a-zA-Z]/g) ?? []).length;
export function fullestMarkup(candidates, limit = 30) {
  const ok = candidates.filter((c) => c && c.markup);
  const fit = ok.filter((c) => elementsIn(c.markup) <= limit);
  const pool = fit.length ? fit : ok.slice(0, 1);
  return pool.reduce((best, c) => (!best || elementsIn(c.markup) > elementsIn(best.markup) ? c : best), null);
}

// The tokens a component's own rules use: each var() in a rule whose selector holds its class, with the property.
export function componentTokens(cssText, cls) {
  if (!cls) return [];
  const out = [], seen = new Set();
  const clean = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const classRe = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (!classRe.test(selector) || selector.startsWith('@')) continue;
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      for (const v of decl.slice(i + 1).matchAll(/var\(\s*(--[\w-]+)/g)) {
        const key = `${prop} ${v[1]}`;
        if (!seen.has(key)) { seen.add(key); out.push({ prop, var: v[1], selector }); }
      }
    }
  }
  return out;
}
