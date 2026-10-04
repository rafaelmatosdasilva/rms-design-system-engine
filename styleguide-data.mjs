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
// The system's page text styles (its html and body rules' colour and font, the ones a component inherits) declared
// again on every element that carries its own mode: an inherited value is resolved on the page, so without this a
// component switched to Light on a Dark page would still inherit the Dark page's text colour.
const INHERITED = /^(color|font|font-family|font-size|font-weight|line-height|letter-spacing)$/;
export function modeRootCSS(css = '') {
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = {};
  for (const m of text.matchAll(/(?:^|[}\s,])(html|body)\s*\{([^{}]*)\}/g)) {
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) if (INHERITED.test(d[1]) && /var\(/.test(d[2])) decls[d[1]] = d[2].trim();
  }
  const body = Object.entries(decls).map(([k, v]) => `${k}: ${v};`).join(' ');
  return body ? `\n\n  /* == The page's text styles on each element with its own mode (inherited values follow that mode) == */\n  [data-color], [data-size] { ${body} }\n` : '';
}

// The code's own breakpoint modes: each @media block (not a colour or contrast preference) that sets variables on
// :root, with the base :root's values for the same variables. → [{ condition, decls, base, rules }]
export function codeSizeBlocks(css = '') {
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');   // a comment can name @media without being one
  const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const outside = text.replace(/@(media|supports|container)\b[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  const base = {};
  for (const m of outside.matchAll(/(?:^|[}\s,]):root\s*\{([^{}]*)\}/g)) Object.assign(base, decls(m[1]));
  const out = [];
  for (const m of text.matchAll(/@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    if (/prefers-color-scheme|prefers-contrast/.test(m[1])) continue;
    const rules = [...m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((r) => ({ sel: r[1].trim(), body: r[2].trim() }));
    const root = rules.filter((r) => r.sel === ':root');
    if (!root.length) continue;
    const d = Object.assign({}, ...root.map((r) => decls(r.body)));
    out.push({ condition: m[1].trim().replace(/\s+/g, ' '), decls: d, base: Object.fromEntries(Object.keys(d).map((k) => [k, base[k] ?? null])), rules: rules.filter((r) => r.sel !== ':root') });
  }
  return out;
}

// Which breakpoint block draws a sizing collection's second mode: the one that sets the collection's variables, else
// the only one there is. → { block, base, mode } (the snapshot keys) or null.
export function codeSizeMode(def = {}, themeCss = '') {
  const ms = def?.modes ?? [];
  if (ms.length !== 2) return null;
  const blocks = codeSizeBlocks(themeCss);
  const names = Object.keys(def.vars ?? {}).map((t) => `--${t.replace(/\//g, '-')}`);
  const named = blocks.filter((b) => names.some((n) => n in b.decls));
  const block = named.length === 1 ? named[0] : (!named.length && blocks.length === 1 ? blocks[0] : null);
  return block ? { block, base: String(ms[0].snapshotKey), mode: String(ms[1].snapshotKey), names: Object.fromEntries(Object.keys(def.vars ?? {}).map((t) => [`--${t.replace(/\//g, '-')}`, t])) } : null;
}

// The page's own toggle for a breakpoint mode: the theme's @media values under [data-size="<mode>"], the base values
// under [data-size="<base>"], so a preview, or the page on a phone, can be shown in either. '' when the code has none.
export function codeSizeCSS(modeVariants = {}, themeCss = '') {
  for (const def of Object.values(modeVariants ?? {})) {
    const hit = codeSizeMode(def, themeCss);
    if (!hit) continue;
    const { block, base, mode } = hit;
    const lines = (map) => Object.entries(map).filter(([, v]) => v != null).map(([k, v]) => `    ${k}: ${v};`).join('\n');
    return `\n\n  /* == Size toggle - the theme's own ${block.condition} block, under [data-size] (code values, nothing copied by hand) == */\n` +
      `  [data-size="${base}"] {\n${lines(block.base)}\n  }\n  [data-size="${mode}"] {\n${lines(block.decls)}\n  }\n` +
      block.rules.map((r) => `  [data-size="${mode}"] ${r.sel} { ${r.body} }\n`).join('');
  }
  return '';
}

export function modeAxes(cfg = {}, figmaVars = {}, themeCss = '') {
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
    // A mode the code has no CSS for (no @media, [data-…] or class block sets these variables) is offered but not
    // drawn: the page would show Figma's values, not the code's.
    const vars = Object.keys(def.vars ?? {}).map((t) => `--${t.replace(/\//g, '-')}`);
    const inCode = (m) => { const k = String(m.snapshotKey); return new RegExp(`\\[data-[\\w-]+=["']?${k}["']?\\]|\\.${k}\\b`).test(themeCss) || [...String(themeCss).matchAll(/@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)].some((b) => !/prefers-/.test(b[1]) && vars.some((v) => b[2].includes(`${v}:`))); };
    // When the theme draws the second mode in a breakpoint block, the page toggles it with [data-size] (codeSizeCSS):
    // the base is then a value of its own, so a page seen on a phone can still be switched back, and the switch says
    // what the mode changes, from the code's own values.
    const code = codeSizeMode(def, themeCss);
    const axis = { label: 'Size', attr: 'data-size', scoped: true, values: ms.map((m, i) => ({ label: m.name ?? m.snapshotKey, value: i === 0 ? (code ? String(m.snapshotKey) : '') : m.snapshotKey, ...(i > 0 && !inCode(m) ? { notInCode: true } : {}) })) };
    if (code) Object.assign(axis, { media: code.block.condition, mediaValue: code.mode });   // the device or window the code draws it on
    if (code) axis.changes = { [code.mode]: Object.entries(code.block.decls).filter(([k, v]) => code.block.base[k] != null && code.block.base[k] !== v).map(([k, v]) => ({ name: code.names[k] ?? k, from: code.block.base[k], to: v })) };
    axes.push(axis);
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

// ── An HTML and CSS system: no code props to compare, so a Figma prop counts when the code realizes it ─────────────
// The contract's propertyMap (Figma prop → option → selector, or one selector for a boolean or a text), ds-config.json
// htmlRealizations ({ component: { prop: selector } }), else a modifier class the CSS has (.chip--l) and, for a
// disabled switch, a :disabled rule. A prop whose name the contract spells another way is found by its options when
// they are the same set. → { controls, unrealized: [prop names] }. Instance swaps are not a control.
const lc = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
function mapFor(map = {}, prop, options = null) {
  const key = Object.keys(map ?? {}).find((k) => lc(k) === lc(prop));
  if (key) return map[key];
  if (options?.length) {
    const want = options.map(lc).sort().join('|');
    const same = Object.entries(map ?? {}).find(([, v]) => v && typeof v === 'object' && Object.keys(v).map(lc).sort().join('|') === want);
    if (same) return same[1];
  }
  return undefined;
}
const optionKey = (obj, option) => Object.keys(obj ?? {}).find((k) => lc(k) === lc(option));
// One selector for a boolean: ".badge.no-label .badge-label" hides the label with no-label; ".button svg" is the part.
function booleanSelector(base, sel, cssText) {
  const compounds = String(sel).trim().split(/\s+/).filter(Boolean);
  if (!compounds.length || /:has\(|@/.test(sel)) return null;
  const baseClasses = new Set((base.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)));
  const first = (compounds[0].match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1));
  const modifier = first.filter((c) => !baseClasses.has(c));
  const inCss = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(cssText);
  if (compounds.length === 1) return modifier.length && modifier.every(inCss) ? { on: { add: modifier, attrs: {} } } : null;
  const part = compounds[compounds.length - 1];
  if (modifier.length && modifier.every(inCss) && /^(no|hide|without)[-_]/.test(modifier[0])) return { off: { add: modifier, attrs: {} } };
  return { part };
}
export function realizedControls({ name, defs = {}, cls = null, propertyMap = {}, realizations = {}, cssText = '', parts = [] }) {
  const base = cls ? `.${cls}` : '';
  const controls = [], unrealized = [];
  for (const [label, d] of Object.entries(defs)) {
    if (!d || d.type === 'INSTANCE_SWAP') continue;
    const opts = d.variantOptions ?? [];
    const yesNo = d.type === 'VARIANT' && opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o));
    const pm = mapFor(propertyMap, label, d.type === 'VARIANT' && !yesNo ? opts : null);
    const hr = mapFor(realizations, label);
    const control = { label, prop: label, type: d.type, default: d.defaultValue ?? null };
    if (d.type === 'BOOLEAN' || yesNo) {
      control.type = 'BOOLEAN';
      control.default = String(d.defaultValue).toLowerCase() === 'true';
      let found = null;
      if (pm && typeof pm === 'object') {
        const on = optionEffect(base, pm[optionKey(pm, 'true')]), off = optionEffect(base, pm[optionKey(pm, 'false')]);
        found = {};
        if (on && (on.add?.length || Object.keys(on.attrs ?? {}).length)) found.on = on;
        if (off && (off.add?.length || Object.keys(off.attrs ?? {}).length)) found.off = off;
        if (!found.on && !found.off) found = null;
      } else if (typeof pm === 'string') found = booleanSelector(base, pm, cssText);
      if (!found && typeof hr === 'string') found = booleanSelector(base, hr, cssText) ?? { part: hr };
      if (!found && /^(is)?disabled$/i.test(label) && cls && new RegExp(`\\.${cls}[^{,]*:disabled`).test(cssText)) found = { on: { add: [], attrs: { disabled: '' } } };
      if (!found) { const c = variantClass(cls, label, cssText); if (c) found = { on: { add: [c], attrs: {} } }; }
      if (!found) { unrealized.push(label); continue; }
      Object.assign(control, found);
    } else if (d.type === 'VARIANT') {
      const options = opts.map((o) => {
        const k = pm && typeof pm === 'object' ? optionKey(pm, o) : undefined;
        if (k !== undefined) return { label: o, ...(optionEffect(base, pm[k]) ?? {}), mapped: true };
        const c = variantClass(cls, o, cssText);
        return c ? { label: o, add: [c], attrs: {}, mapped: true } : { label: o };
      });
      // Realized when every option is mapped, or every option but the default is a class the CSS has.
      const missing = options.filter((o) => !o.mapped && lc(o.label) !== lc(d.defaultValue ?? ''));
      if (missing.length || !options.some((o) => o.mapped)) { unrealized.push(label); continue; }
      control.options = options.map(({ mapped, ...o }) => o);
    } else if (d.type === 'TEXT') {
      const sel = typeof hr === 'string' ? hr : (typeof pm === 'string' ? pm : null);
      const part = sel ? String(sel).trim().split(/\s+/).pop() : partFor(label.replace(/\s*content$/i, ''), parts, null);
      if (!part) { unrealized.push(label); continue; }
      control.part = part;
    } else continue;
    controls.push(control);
  }
  return { controls, unrealized };
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
  check = null, figmaVars = {}, pages = [], usage = {}, notes = {}, icons = [], title = '', propertyMaps = {}, parts = {}, jsx = {}, alsoNames = [], themeCss = '' } = {}) {
  const byComponent = new Map();
  for (const r of rows) { if (!byComponent.has(r.component)) byComponent.set(r.component, []); byComponent.get(r.component).push(r); }
  const components = [], waiting = [];
  let undecided = 0, unrealized = 0;
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
    // An HTML and CSS system has no code props for Gate [15] to pair: what the code realizes is what agrees.
    if (!mine.length && (cfg.frameworkComponents === false || !rows.length)) {
      const r = realizedControls({ name, defs, cls, propertyMap: propertyMaps[name] ?? {}, realizations: cfg.htmlRealizations?.[name] ?? {}, cssText, parts: parts[name] ?? [] });
      controls.push(...r.controls);
      unrealized += r.unrealized.length;
    }
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
    // An instance hidden at rest (a hidden class or attribute, or an extra class whose own rule sets display: none, such
    // as a reset button that shows only once zoomed) would draw nothing: the next one is used when there is one.
    const shown = candidates.filter((c) => !hiddenAtRest(c.markup, cls, cssText));
    // Of those, the ones holding every part a prop shows, hides or writes (an icon, a label): an instance without the
    // icon cannot show it when show-icon is on, and a bare text label cannot be hidden.
    const named = controls.filter((k) => k.part && (k.type === 'BOOLEAN' || k.type === 'TEXT'));
    const held = (m) => named.filter((k) => holdsPart(m, k.part)).length;
    const pool = shown.length ? shown : candidates;
    const most = Math.max(0, ...pool.map((c) => held(c.markup)));
    const chosen = fullestMarkup(pool.filter((c) => held(c.markup) === most));
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
  if (unrealized) said.push(`${unrealized} Figma propert${unrealized === 1 ? 'y' : 'ies'} the code does not realize yet (no contract propertyMap, htmlRealizations entry or modifier class)`);
  if (waiting.length) said.push(`${waiting.length} component${waiting.length === 1 ? '' : 's'} not built yet (${waiting.map((w) => w.replace(/ \(not built yet\)$/, '')).join(', ')})`);
  const line = said.length ? `Not shown until agreed, ${said.join(' and ')}. Run the audit to see them and decide each one.` : 'Everything Figma and the code have is agreed.';
  return { title, components, tokens, icons, notAgreed: { differences: undecided, unrealized, waiting, line }, modes: modeAxes(cfg, figmaVars, themeCss) };
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
  // A size whose value changes with a mode (a breakpoint): every mode's Figma value, the base first.
  const byMode = (token) => {
    for (const def of Object.values(figmaVars.modeVariants ?? {})) {
      const v = def?.vars?.[token];
      if (v?.values) return (def.modes ?? []).map((m) => ({ mode: m.name ?? m.snapshotKey, value: v.values[m.snapshotKey] })).filter((x) => x.value != null);
    }
    return null;
  };
  const sizes = pass.filter((x) => x.dimension === 'sizing').map((p) => ({ figma: p.token, var: p.cssVar, value: p.value, ...(byMode(p.token) ? { modes: byMode(p.token) } : {}) }));
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
// Whether a piece of markup's own element is hidden until something happens: a hidden attribute, an inline
// display: none, a hidden class, or a class besides the component's own whose rule is display: none.
// Whether markup holds a part a prop names: a tag (svg, span), a class (.label) or a class fragment ([class*="text"]),
// any of a selector list, below the component's own element.
export function holdsPart(markup, sel) {
  const inner = String(markup ?? '').replace(/^<[^>]*>/, '');
  return String(sel ?? '').split(',').map((x) => x.trim().split(/\s+/).pop()).some((x) => {
    const tag = /^([a-z][\w-]*)/i.exec(x)?.[1], cls = /\.([\w-]+)/.exec(x)?.[1], frag = /\[class\*=["']?([\w-]+)["']?\]/.exec(x)?.[1];
    const classes = [...inner.matchAll(/\bclass\s*=\s*["']([^"']*)["']/g)].map((m) => m[1]).join(' ');
    return (tag ? new RegExp(`<${tag}\\b`, 'i').test(inner) : true) && (cls ? new RegExp(`(^|\\s)${cls}(\\s|$)`).test(classes) : true) && (frag ? classes.includes(frag) : true) && Boolean(tag || cls || frag);
  });
}

export function hiddenAtRest(markup, cls, cssText = '') {
  const open = String(markup ?? '').match(/^<[a-zA-Z][\w-]*\b([^>]*)>/);
  if (!open) return false;
  if (/(^|\s)hidden(\s|=|$)/.test(open[1]) || /aria-hidden\s*=\s*["']true/.test(open[1]) || /\bstyle\s*=\s*["'][^"']*display\s*:\s*none/.test(open[1])) return true;
  const classes = (open[1].match(/\bclass\s*=\s*["']([^"']*)["']/)?.[1] ?? '').split(/\s+/).filter((c) => c && c !== cls);
  return classes.some((c) => /^(hidden|is-hidden|d-none|invisible)$/.test(c)
    || new RegExp(`(^|[},\\s])\\.${c.replace(/[-]/g, '\\-')}\\s*\\{[^}]*\\bdisplay\\s*:\\s*none`).test(String(cssText)));
}

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

// ── The page's own look, from the system: each role the template's layout uses, filled with one of the system's own
// tokens (styleguide.chrome in ds-config.json names one by hand: { "text": "--my-ink" }). A role with no token is left
// to the browser's own and listed, never given a value of the engine's.
// tokens: agreedTokens() · themeCss: the system's CSS (its font) · componentNames: tokens named after one component
// (badge/background) are only a last resort · icons: { size } the system's icon size, read from its icon set.
const CHROME_COLOURS = [
  ['surface', [/(surface|background|bg)/, /(elevationhigh|high|raised|card|elevated|primary|default|base)/]],
  ['bg', [/(surface|background|bg|canvas)/, /(page|canvas|app|window|elevationlow|low|sunken|base|default)/]],
  ['bg-2', [/(surface|background|bg)/, /(elevationmedium|medium|elevationlow|low|secondary|subtle|muted|alt|sunken|detail)/]],
  ['text', [/(text|content|foreground|fg|ink)/, /(primary|default|base|strong)/]],
  ['text-2', [/(text|content|foreground|fg|ink)/, /(secondary)/]],
  ['muted', [/(text|content|foreground|fg|ink)/, /(tertiary|muted|subtle|placeholder|disabled)/]],
  ['border', [/(border|divider|stroke|outline|line)/, /(default|primary|base|subtle|divider)?/]],
  ['accent', [/(accent|brand|focus|link|interactive|highlight|action)/, /.*/]],
  ['warning', [/(warning|caution|attention)/, /.*/]],
  ['positive', [/(positive|success|valid)/, /.*/]],
  ['negative', [/(negative|error|danger|critical)/, /.*/]],
];
export function chromeRoles({ tokens = null, themeCss = '', componentNames = [], icons = {}, override = {} } = {}) {
  const roles = {}, from = {};
  const comps = new Set(componentNames.map((n) => n.toLowerCase()));
  const flat = (tokens?.colors ?? []).flatMap((g) => g.items).filter((t) => t?.var);
  const words = (t) => t.figma.toLowerCase().replace(/[^a-z0-9/]+/g, '').split('/');
  // A token for everyone before one a component owns: a shared group (semantic/content/primary, color/text), then the
  // shortest CSS name (--border before --card-border); a group named after a component comes last.
  const GENERIC = /^(semantic|global|base|core|sys|system|foundation|foundations|theme|color|colors|palette|alias|ref|common)$/;
  const rank = (t) => { const g = words(t)[0]; return (GENERIC.test(g) ? 0 : 50) + (comps.has(g) ? 100 : 0) + t.var.length; };
  const used = new Set();
  const byVar = new Map(flat.map((t) => [t.var, t]));
  // What the system's own page uses: the background and text colour its html or body rule sets.
  const page = [...String(themeCss).matchAll(/(?:^|[}\s;])(?:html|body|:root)\b[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  const pageVar = (prop) => { const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*var\\((--[\\w-]+)`).exec(page); return m && byVar.has(m[1]) ? byVar.get(m[1]) : null; };
  for (const [role, t] of [['bg', pageVar('background(?:-color)?')], ['text', pageVar('color')]]) if (t) { roles[role] = `var(${t.var})`; from[role] = `${t.figma} (the system's page)`; used.add(t.var); }
  for (const [role, [what, which]] of CHROME_COLOURS) {
    if (roles[role]) continue;
    const pick = flat.filter((t) => !used.has(t.var) && rank(t) < 100 && words(t).some((w) => what.test(w)) && words(t).some((w) => which.test(w)))
      .sort((a, b) => rank(a) - rank(b) || a.figma.localeCompare(b.figma))[0];
    if (pick) { roles[role] = `var(${pick.var})`; from[role] = pick.figma; if (!['positive', 'negative', 'warning'].includes(role)) used.add(pick.var); }
  }
  if (!roles.bg && roles.surface) { roles.bg = roles.surface; from.bg = from.surface; }
  if (!roles['bg-2'] && roles.bg) { roles['bg-2'] = roles.bg; from['bg-2'] = from.bg; }
  if (!roles['text-2'] && roles.text) { roles['text-2'] = roles.text; from['text-2'] = from.text; }
  if (!roles.muted && roles['text-2']) { roles.muted = roles['text-2']; from.muted = from['text-2']; }
  if (!roles.accent && roles.text) { roles.accent = roles.text; from.accent = from.text; }
  if (roles.bg) { roles.stage = roles.bg; from.stage = from.bg; }
  if (roles.warning) from.warning = from.warning ?? '';
  // Type: the system's text styles, smallest to largest; headings take the largest.
  const type = (tokens?.typography ?? []).filter((t) => t.size?.var).sort((a, b) => parseFloat(a.size.value) - parseFloat(b.size.value));
  if (type.length) {
    const s = type[0], l = type[type.length - 1], m = type[Math.floor((type.length - 1) / 2)] === s && type.length > 1 ? type[1] : type[Math.floor((type.length - 1) / 2)];
    const put = (role, t) => { roles[role] = `var(${t.size.var})`; from[role] = `type/${t.scale}`; if (t.weight?.var) { roles[`${role}-weight`] = `var(${t.weight.var})`; } };
    put('xs', s); put('s', s); put('m', m); put('l', l); put('h1', l); put('h2', l);
    if (l.weight?.var) roles['heading-weight'] = `var(${l.weight.var})`;
    if (m.lh?.var) roles.lh = `var(${m.lh.var})`;
  }
  // The font: a family variable the theme declares, else the family the theme sets on its page.
  const famVar = /(--[\w-]*font[\w-]*family[\w-]*)\s*:/i.exec(themeCss) ?? /(--[\w-]*family[\w-]*)\s*:/i.exec(themeCss);
  const famDecl = /(?:^|[{;\s])(?:html|body|:root)[^{]*\{[^}]*?font-family\s*:\s*([^;}]+)/i.exec(themeCss);
  if (famVar) { roles.font = `var(${famVar[1]})`; from.font = famVar[1]; }
  else if (famDecl) { roles.font = famDecl[1].trim(); from.font = 'the theme\'s page font'; }
  // Radii and spacing: the system's own scale, nearest to each step the layout uses.
  const px = (t) => parseFloat(String(t.value));
  const nearest = (list, want) => list.filter((t) => Number.isFinite(px(t))).sort((a, b) => Math.abs(px(a) - want) - Math.abs(px(b) - want) || px(a) - px(b))[0];
  const radii = (tokens?.radii ?? []).filter((t) => px(t) > 0);
  const card = radii.find((t) => /card|surface|container|panel/i.test(t.figma));
  for (const [role, want, t] of [['radius-s', 4], ['radius', 8, card], ['radius-l', 12, card], ['radius-pill', 999]]) {
    const pick = t ?? nearest(radii, want);
    if (pick) { roles[role] = `var(${pick.var})`; from[role] = pick.figma; }
  }
  const spaces = tokens?.spacing ?? [];
  for (const [role, want] of [['space-xxs', 2], ['space-xs', 4], ['space-s', 8], ['space-m', 12], ['space-l', 16], ['space-xl', 24], ['space-xxl', 32]]) {
    const pick = nearest(spaces, want);
    if (pick) { roles[role] = `var(${pick.var})`; from[role] = pick.figma; }
  }
  if (icons.size) { roles.icon = `${icons.size}px`; from.icon = 'the size of the system\'s icons'; }
  for (const [role, v] of Object.entries(override ?? {})) if (typeof v === 'string' && v) { roles[role] = /^--/.test(v) ? `var(${v})` : v; from[role] = 'styleguide.chrome'; }
  const NEEDED = ['bg', 'surface', 'text', 'muted', 'border', 'accent', 'font', 's', 'm', 'l', 'radius', 'space-s', 'space-l'];
  const missing = NEEDED.filter((r) => !roles[r]);
  // Declared again on every element that carries its own mode, so a preview in Light on a Dark page resolves the
  // page's roles with its own values (a variable is resolved where it is declared, then inherited as it is).
  const css = Object.keys(roles).length ? `:root, [data-color], [data-size] { ${Object.entries(roles).map(([k, v]) => `--sg-${k}: ${v};`).join(' ')} }` : '';
  return { roles, from, missing, css };
}

// ── The system's own segmented control, for every switch the page offers ────────────────────────────────────────────
// Read from a component's markup: a root holding two or more of the same element (button, a, li, a tab) where one
// carries a class or attribute the others lack (selected, active, aria-selected): that is the selected state. A name
// that says it (segment, toggle, tabs, switcher, picker) is preferred. → { from, open, close, item: { tag, classes,
// label }, selected: { add, attrs } } or null (the page then uses a plain row of buttons the browser draws).
export function segmentedUi(components = []) {
  const found = [];
  for (const c of components) {
    const m = /^\s*<([a-z][\w-]*)\b([^>]*)>([\s\S]*)<\/\1>\s*$/i.exec(c.markup ?? '');
    if (!m) continue;
    const [, rootTag, rootAttrs, inner] = m;
    const kids = [...inner.matchAll(/<(button|a|li|div|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((k) => ({ tag: k[1].toLowerCase(), attrs: k[2], inner: k[3] }));
    const byTag = {};
    for (const k of kids) (byTag[k.tag] ??= []).push(k);
    const items = Object.values(byTag).filter((list) => list.length >= 2).sort((a, b) => b.length - a.length)[0];
    if (!items) continue;
    const classesOf = (a) => (/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)?.[1] ?? '').split(/\s+/).filter(Boolean);
    const sets = items.map((k) => classesOf(k.attrs));
    const common = sets[0].filter((x) => sets.every((s) => s.includes(x)));
    const odd = sets.map((s) => s.filter((x) => !common.includes(x)));
    const selectedIdx = odd.findIndex((s) => s.some((x) => /^(is-)?(selected|active|current|checked|on)$/i.test(x)));
    const attrSel = items.findIndex((k) => /aria-(selected|pressed|checked)\s*=\s*["']true["']/i.test(k.attrs));
    if (selectedIdx < 0 && attrSel < 0) continue;
    const selected = selectedIdx >= 0 ? { add: odd[selectedIdx].filter((x) => /^(is-)?(selected|active|current|checked|on)$/i.test(x)), attrs: {} }
      : { add: [], attrs: { [/aria-(selected|pressed|checked)/i.exec(items[attrSel].attrs)[0].toLowerCase()]: 'true' } };
    const label = /<span\b[^>]*\bclass\s*=\s*["']([^"']*(?:label|text)[^"']*)["']/i.exec(items[0].inner)?.[1]?.split(/\s+/)[0] ?? null;
    const score = (/(segment|toggle|tabs?|switcher|picker|chooser)/i.test(c.name) ? 0 : 10) + (items[0].tag === 'button' ? 0 : 2);
    const base = (/\bclass\s*=\s*["']([^"']*)["']/i.exec(rootAttrs)?.[1] ?? '').split(/\s+/).filter(Boolean)[0];
    // The control itself, without the modifiers one product gave it (full-width, compact): only its own class.
    found.push({ score, from: c.name, open: `<${rootTag}${base ? ` class="${base}"` : ''}>`, close: `</${rootTag}>`, item: { tag: items[0].tag, classes: common, label }, selected });
  }
  const best = found.sort((a, b) => a.score - b.score)[0];
  if (!best) return null;
  const { score, ...ui } = best;
  return ui;
}

// The system's own text field, for the page's text inputs: a component's markup holding a text <input> (role
// textbox, or a name that says input or field, preferred), cut to its root and the input, each keeping only the
// classes the system's own CSS defines (a product's extra classes stay out). → { from, markup } or null.
export function fieldUi(components = [], systemCss = '') {
  const defined = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(systemCss);
  const keep = (attrs) => (/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').split(/\s+/).filter((c) => c && defined(c));
  const found = [];
  for (const c of components) for (const mk of [c.markup, ...(c.markups ?? [])]) {
    const root = /^\s*<([a-z][\w-]*)\b([^>]*)>/i.exec(mk ?? '');
    const input = /<input\b([^>]*)>/i.exec(mk ?? '');
    if (!root || !input) continue;
    const type = (/\btype\s*=\s*["']?([\w-]+)/i.exec(input[1])?.[1] ?? 'text').toLowerCase();
    if (!/^(text|search|email|url|tel)$/.test(type)) continue;
    const ic = keep(input[1]), rc = keep(root[2]);
    const inputTag = `<input type="text" aria-label="Value"${ic.length ? ` class="${ic.join(' ')}"` : ''}>`;
    const markup = root[1].toLowerCase() === 'input' ? inputTag : `<${root[1]}${rc.length ? ` class="${rc.join(' ')}"` : ''}>${inputTag}</${root[1]}>`;
    const score = (c.role === 'textbox' || /input|field|text/i.test(c.name) ? 0 : 10) + (ic.length || rc.length ? 0 : 5);
    found.push({ score, from: c.name, markup });
  }
  const best = found.sort((a, b) => a.score - b.score)[0];
  return best ? { from: best.from, markup: best.markup } : null;
}
