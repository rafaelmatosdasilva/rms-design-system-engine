// styleguide-data.mjs - what the engine's style guide may show: only what Figma and the code agree on.
//
// A prop is shown as a control when Gate [15] matched it (component-prop-result.json, status "match"): Figma has it,
// the code accepts it under its counterpart name, with the same options and default. The control carries both
// names: Figma's as the label people read, the code's as the prop the code takes. Everything else (a prop missing on
// one side, a renamed one, a different default or option, a component not built yet, a recorded value that moved on
// one side) is not shown: it is counted in one line, and the person decides it before it appears.
//
// Pure: agreedView takes what the generator read and returns { components, notAgreed, modes }.
import { roleWord, roleMarkup, roleSheetLines, roleOf } from './role-markup.mjs';
import { behavioursFor, partSheetLines, roleKey } from './behaviour-contract.mjs';
import { WCAG21, WCAG21_KIND } from './wcag21.mjs';

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

// The lines of a component's own CSS rules (every rule whose selector names its class, or its id when the selector
// is one, as #tt), 1-based, in a stylesheet.
export function ruleLines(css = '', cls = '') {
  if (!cls) return [];
  const token = /^[.#]/.test(cls) ? cls : `.${cls}`;
  const text = String(css), want = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?![\\w-])`), out = [];
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  let depth = 0, start = 0, ruleStart = -1, ruleDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { if (ruleStart < 0 && want.test(text.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, ''))) { ruleStart = lineAt(start + text.slice(start, i).search(/\S/)); ruleDepth = depth; } depth++; start = i + 1; }
    else if (ch === '}') { depth--; if (ruleStart > 0 && depth === ruleDepth) { for (let l = ruleStart; l <= lineAt(i); l++) out.push(l); ruleStart = -1; } start = i + 1; }
    else if (ch === ';' && depth === 0) start = i + 1;
  }
  return [...new Set(out)];
}

// The lines of every object entry keyed by a component's name (badge: { … } or "badge": { … }), 1-based, in a
// contract or config file, so a change to its contract dates the component as a change to its CSS does.
export function entryLines(text = '', key = '') {
  if (!key) return [];
  const src = String(text), lines = src.split('\n'), out = [];
  const head = new RegExp(`^\\s*["']?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:\\s*\\{`);
  lines.forEach((l, i) => {
    if (!head.test(l)) return;
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j].replace(/\/\/.*$/, '')) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      out.push(j + 1);
      if (depth <= 0) break;
    }
  });
  return [...new Set(out)];
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

// The widths a component is shown at, from Figma: each mode of a collection that sets a viewport or breakpoint width
// variable (viewport/min-width: Desktop 1680px, Phone 350px), narrowest first. → [{ value, label, px }] | [] (none).
export function viewportWidths(figmaVars = {}) {
  for (const col of Object.values(figmaVars?.modeVariants ?? {})) {
    const name = Object.keys(col?.vars ?? {}).find((n) => /(^|\/)(viewport|breakpoint|screen|device)s?([/-](min-)?width)?$/i.test(n) || /(^|\/)(viewport|breakpoint|screen)[/-]?(min-)?width$/i.test(n));
    if (!name) continue;
    const vals = col.vars[name].values ?? {};
    const out = (col.modes ?? []).map((m) => ({ value: String(m.snapshotKey ?? m.name).toLowerCase(), label: m.name, px: parseFloat(vals[m.snapshotKey] ?? vals[m.name]) })).filter((w) => w.px > 0);
    if (out.length) return out.sort((a, b) => a.px - b.px);
  }
  return [];
}

export function modeAxes(cfg = {}, figmaVars = {}, themeCss = '') {
  const axes = [];
  const modes = cfg.figma?.modes?.length ? cfg.figma.modes : [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'dark-media' }];
  // Each switch is named as Figma names the collection it switches (Styling, Sizing), never by what it is about.
  const colour = { label: cfg.figma?.colorCollection || 'Mode', colour: true, values: [] };
  for (const m of modes) {
    const sel = m.cssSelector ?? 'root';
    if (sel === 'root') colour.values.push({ label: m.name, value: '' });
    else if (sel === 'dark-media') { colour.attr = 'data-color'; colour.scoped = true; colour.values.push({ label: m.name, value: 'dark' }); Object.assign(colour, { media: '(prefers-color-scheme: dark)', mediaValue: 'dark' }); }
    else if (sel.startsWith('data:')) { const [a, v = ''] = sel.slice(5).split('='); colour.attr = colour.attr ?? (a.startsWith('data-') ? a : `data-${a}`); colour.values.push({ label: m.name, value: v }); }
    else if (sel.startsWith('class:')) { colour.classes = true; colour.values.push({ label: m.name, value: sel.slice(6) }); }
    // other media modes (breakpoints, contrast) are not a switch on one page
  }
  // In Figma's own order of the collection's modes when the snapshot records it (Dark before Light, as the file has it).
  const figmaOrder = figmaVars._modeOrder?.color;
  if (Array.isArray(figmaOrder)) {
    const keyOf = (label) => modes.find((m) => m.name === label)?.snapshotKey ?? String(label).toLowerCase();
    const at = (v) => { const i = figmaOrder.indexOf(keyOf(v.label)); return i < 0 ? 99 : i; };
    colour.values.sort((a, b) => at(a) - at(b));
  }
  // The derived [data-color] blocks name the light mode too, so a scoped preview can go back to light inside a dark page.
  if (colour.attr === 'data-color') colour.values = colour.values.map((v) => (v.value === '' ? { ...v, value: 'light' } : v));
  // The mode the page rests on when the device's media query does not match: the root one, wherever Figma lists it.
  if (colour.media) colour.restValue = colour.values.find((v) => v.value !== colour.mediaValue)?.value ?? '';
  if (colour.values.length > 1) axes.push(colour);
  for (const [collection, def] of Object.entries(figmaVars.modeVariants ?? {})) {
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
    const axis = { label: collection || cfg.figma?.sizingCollection || 'Mode', attr: 'data-size', scoped: true, values: ms.map((m, i) => ({ label: m.name ?? m.snapshotKey, value: i === 0 ? (code ? String(m.snapshotKey) : '') : m.snapshotKey, ...(i > 0 && !inCode(m) ? { notInCode: true } : {}) })) };
    if (code) Object.assign(axis, { media: code.block.condition, mediaValue: code.mode });   // the device or window the code draws it on
    if (code) axis.restValue = axis.values.find((v) => v.value !== code.mode && !v.notInCode)?.value ?? axis.values[0].value;
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
  // A class inside :not() is one the option must not have, never one it adds.
  const last = (String(optionSelector).trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? '').replace(/:not\([^()]*\)/g, '');
  const baseClasses = new Set((String(baseSelector ?? '').match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)));
  const add = (last.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)).filter((c) => !baseClasses.has(c));
  const attrs = {};
  for (const m of last.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)) attrs[m[1]] = m[2] ?? '';
  for (const m of last.matchAll(/:(disabled|checked|indeterminate|required|invalid)\b/g)) attrs[m[1] === 'invalid' ? 'aria-invalid' : m[1]] = m[1] === 'invalid' ? 'true' : '';
  const liveState = /:(hover|focus-visible|focus-within|focus|active)\b/.exec(last)?.[1] ?? null;
  const live = !!liveState;
  // A state set on an earlier part (.checkbox-input:checked + .checkbox-box): the option is that part's state, so
  // the page sets it there (the input ticked), and the last part's class is the part itself, never added to the root.
  const compounds = String(optionSelector).trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
  const stateAt = compounds.findIndex((c) => /:(disabled|checked|indeterminate|required|invalid)\b|\[[\w-]+/.test(c.replace(/:not\([^()]*\)/g, '')));
  if (stateAt >= 0 && stateAt < compounds.length - 1) {
    const at = compounds[stateAt].replace(/:not\([^()]*\)/g, '');
    const target = (at.match(/^[a-z][\w-]*/i)?.[0] ?? '') + (at.match(/\.[\w-]+/g) ?? []).join('');
    const partAttrs = {};
    for (const m of at.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)) partAttrs[m[1]] = m[2] ?? '';
    for (const m of at.matchAll(/:(disabled|checked|indeterminate|required|invalid)\b/g)) partAttrs[m[1] === 'invalid' ? 'aria-invalid' : m[1]] = m[1] === 'invalid' ? 'true' : '';
    if (target) return { add: [], attrs: partAttrs, target, ...(live ? { live: true, state: liveState } : {}) };
  }
  if (!add.length && !Object.keys(attrs).length) return live ? { live: true, state: liveState } : {};
  // A state on one of the component's parts alone (.radioButton-input:checked): set on that part, the part's class
  // never added to the root.
  const part = Object.keys(attrs).length && add.length === 1 && [...baseClasses].some((b) => add[0].startsWith(`${b}-`)) ? add[0] : null;
  if (part) return { add: [], attrs, target: `.${part}`, ...(live ? { live: true, state: liveState } : {}) };
  return { add, attrs, ...(live ? { live: true, state: liveState } : {}) };
}

// The part a boolean shows or a text prop writes: the contract's child of that name ("Show Icon" → its Icon child),
// else the part the word names in common markup (an icon is an svg or an *icon* class, a label its text).
function partFor(propName, list = [], fallback = null) {
  const word = String(propName).replace(/^(show|has|with)[\s_-]*/i, '').replace(/[\s_-]*(left|right|start|end)$/i, '').trim().toLowerCase();
  const named = (list ?? []).find((p) => String(p.name).toLowerCase() === word) ?? (list ?? []).find((p) => String(p.name).toLowerCase().includes(word));
  if (named) return String(named.selector).trim().split(/\s+/).pop();
  const kind = /icon|glyph|symbol/.test(word) ? 'icon' : /label|text|title|value/.test(word) ? 'label' : fallback;
  // The prop's own word first (a title is a title class or a heading before it is any label), in the order to search.
  const own = /^[a-z]+$/.test(word) && !/^(label|text|icon)$/.test(word) ? `[class*="${word}"], ` : '';
  const heading = /title|heading/.test(word) ? 'h1, h2, h3, h4, ' : '';
  return kind === 'icon' ? 'svg, [class*="icon"]' : kind === 'label' ? `${own}${heading}[class*="label"], [class*="text"], span` : null;
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
  // One compound: the modifier is the prop's state. A negative one (no-divider-top, often on a layer such as ::after)
  // is the state with the part hidden, so it is the off state; any other is the on state.
  if (compounds.length === 1) return modifier.length && modifier.every(inCss) ? (/^(no|hide|without)[-_]/.test(modifier[0]) ? { off: { add: modifier, attrs: {} } } : { on: { add: modifier, attrs: {} } }) : null;
  const part = compounds[compounds.length - 1];
  // The part too, so a part no instance holds can still be drawn when the prop turns it on.
  if (modifier.length && modifier.every(inCss) && /^(no|hide|without)[-_]/.test(modifier[0])) return { off: { add: modifier, attrs: {} }, part };
  return { part };
}
// A selector that concerns the component: one of its compound classes is the component's own or one of its parts
// (.radioButton, .radioButton-input), or it names no class at all (a state such as :hover). → boolean
export function ownSelector(cls, sel) {
  if (!cls || typeof sel !== 'string') return true;
  const classes = (sel.match(/\.[\w-]+/g) ?? []).map((k) => k.slice(1));
  return !classes.length || classes.some((k) => k === cls || k.startsWith(`${cls}-`));
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
      // A realization names a part (".listItem-icon"), never a class to put on the component itself; only a no- or
      // hide- modifier that hides the part (".x.no-icon svg") is a class.
      if (!found && typeof hr === 'string') { const b = booleanSelector(base, hr, cssText); found = b?.off ? b : { part: String(hr).trim().split(/\s+/).pop() }; }
      if (!found && /^(is)?disabled$/i.test(label) && cls && new RegExp(`\\.${cls}[^{,]*:disabled`).test(cssText)) found = { on: { add: [], attrs: { disabled: '' } } };
      if (!found) { const c = variantClass(cls, label, cssText); if (c) found = { on: { add: [c], attrs: {} } }; }
      if (!found) { unrealized.push(label); continue; }
      Object.assign(control, found);
    } else if (d.type === 'VARIANT') {
      const options = opts.map((o) => {
        const k = pm && typeof pm === 'object' ? optionKey(pm, o) : undefined;
        // A selector of another element (a product's own markup the contract also maps) is not this component's.
        if (k !== undefined && ownSelector(cls, pm[k])) return { label: o, ...(optionEffect(base, pm[k]) ?? {}), mapped: true };
        const c = variantClass(cls, o, cssText);
        if (c) return { label: o, add: [c], attrs: {}, mapped: true };
        // A chosen state (Selected, Checked, On) is the component's own :checked rule when its CSS has one.
        const ch = /^(selected|checked|on)$/i.test(o) && cls ? new RegExp(`\\.(${cls.replace(/[-]/g, '\\-')}(?:-[\\w-]+)?):checked`).exec(cssText) : null;
        if (ch) return { label: o, ...(optionEffect(base, `.${ch[1]}:checked`) ?? {}), mapped: true };
        return { label: o };
      });
      // Realized when at least one option other than the default is; an option the code does not build is offered but
      // marked so (unbuilt), never drawn with another's look.
      const others = options.filter((o) => lc(o.label) !== lc(d.defaultValue ?? ''));
      if (!others.some((o) => o.mapped)) { unrealized.push(label); continue; }
      control.options = options.map(({ mapped, ...o }) => (mapped || lc(o.label) === lc(d.defaultValue ?? '') ? o : { ...o, unbuilt: true }));
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
    const controls = [], propsNotBuilt = [];
    // An HTML and CSS system has no code props for Gate [15] to pair: what the code realizes is what agrees.
    if (!mine.length && (cfg.frameworkComponents === false || !rows.length)) {
      const r = realizedControls({ name, defs, cls, propertyMap: propertyMaps[name] ?? {}, realizations: cfg.htmlRealizations?.[name] ?? {}, cssText, parts: parts[name] ?? [] });
      controls.push(...r.controls);
      unrealized += r.unrealized.length;
      // Figma's props the code does not build: shown in the panel as such, never drawn with Figma's look.
      propsNotBuilt.push(...r.unrealized.map((label) => ({ label, type: defs[label]?.type ?? 'BOOLEAN' })));
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
    // Figma's order, as its panel lists the props: the variants first, then the rest in the order Figma keeps them.
    const figmaOrder = [...Object.keys(defs).filter((k) => defs[k].type === 'VARIANT'), ...Object.keys(defs).filter((k) => defs[k].type !== 'VARIANT')];
    const at = (label) => { const i = figmaOrder.indexOf(label); return i < 0 ? figmaOrder.length : i; };
    controls.forEach((k) => { k.at = at(k.label); });
    propsNotBuilt.forEach((k) => { k.at = at(k.label); });
    controls.sort((a, b) => a.at - b.at);
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
      markup, markups: markups.length > 1 ? markups : undefined, markupFrom: chosen?.from ?? 'role', usage: usage[name] ?? [], tokens: componentTokens(cssText, cls), controls, ...(propsNotBuilt.length ? { unbuilt: propsNotBuilt } : {}) });
  }
  // A recorded value that moved on one side since it was agreed is not agreed any more.
  for (const f of Object.values(agreedRecord.facts ?? {})) if (f && f.figma !== undefined && f.code !== undefined && String(f.figma) !== String(f.code)) undecided++;
  const tokens = check ? agreedTokens(check, figmaVars) : null;
  undecided += tokens?.differences ?? 0;
  const said = [];
  if (undecided) said.push(`${undecided} value${undecided === 1 ? '' : 's'} where Figma and the code differ`);
  if (unrealized) said.push(`${unrealized} Figma propert${unrealized === 1 ? 'y' : 'ies'} the code does not build yet`);
  if (waiting.length) said.push(`${waiting.length} component${waiting.length === 1 ? '' : 's'} the code does not have yet (${waiting.map((w) => w.replace(/ \(not built yet\)$/, '')).join(', ')})`);
  const line = said.length ? `Left off this page until Figma and the code agree: ${said.join(', ').replace(/, ([^,]*)$/, ' and $1')}. Each one is in the To do list, with who does it and what to do.` : 'Figma and the code agree on everything this page shows.';
  return { title, components, tokens, icons, notAgreed: { differences: undecided, unrealized, waiting, line }, modes: modeAxes(cfg, figmaVars, themeCss), widths: viewportWidths(figmaVars) };
}

// The primitive colours (Figma's primitives/… ramp) the theme declares with Figma's value in every mode, for the ramp
// the style guide shows first. A primitive is named by the convention (primitives/Neutral 100 → --neutral-100) and
// read from the theme's own blocks: :root for the root mode, the dark media block, or a [data-…] / class block.
// → { group: 'primitives', items: [{ figma, var, values }] } | null
export function primitiveColours(figmaVars = {}, themeCss = '', cfg = {}) {
  const prim = figmaVars.primitives ?? {};
  const prefix = cfg.figma?.primitivePrefix ?? 'primitives/';
  const modes = cfg.figma?.modes?.length ? cfg.figma.modes : [{ snapshotKey: 'light', cssSelector: 'root' }, { snapshotKey: 'dark', cssSelector: 'dark-media' }];
  const css = String(themeCss).replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = (body) => Object.fromEntries([...String(body).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
  const block = (re) => { let out = {}; for (const m of css.matchAll(re)) out = { ...out, ...decls(m[1]) }; return out; };
  // The theme's top-level :root blocks, and the :root blocks inside its dark media blocks.
  const media = [], top = [];
  for (let i = 0, depth = 0, start = 0, head = ''; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) { head = css.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (css[i] === '}') { depth--; if (depth === 0) { (/^@media/.test(head) ? media : top).push([head, css.slice(start, i)]); start = i + 1; } }
  }
  const root = Object.assign({}, ...top.filter(([h]) => /(^|,)\s*:root\s*$/.test(h)).map(([, b]) => decls(b)));
  const dark = Object.assign({}, ...media.filter(([h]) => /prefers-color-scheme:\s*dark/.test(h)).map(([, b]) => decls((b.match(/:root\s*\{([^{}]*)\}/) ?? [])[1] ?? '')));
  const of = (m) => {
    const sel = m.cssSelector ?? 'root';
    if (sel === 'root') return root;
    if (sel === 'dark-media') return { ...root, ...dark };
    const [a, v = ''] = sel.replace(/^(data|class):/, '').split('=');
    const re = sel.startsWith('class:') ? new RegExp(`\\.${a}\\s*\\{([^{}]*)\\}`, 'g') : new RegExp(`\\[(?:data-)?${a.replace(/^data-/, '')}=["']?${v}["']?\\]\\s*\\{([^{}]*)\\}`, 'g');
    return { ...root, ...block(re) };
  };
  const names = [...new Set(Object.values(prim).flatMap((m) => Object.keys(m ?? {})))];
  const items = [];
  for (const name of names) {
    const v = `--${name.slice(name.startsWith(prefix) ? prefix.length : 0).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const values = {};
    let ok = true;
    for (const m of modes) {
      const want = prim[m.snapshotKey]?.[name];
      if (want == null) continue;
      const have = of(m)[v];
      if (!have || have !== String(want).toLowerCase()) { ok = false; break; }
      values[m.snapshotKey] = want;
    }
    if (ok && Object.keys(values).length) items.push({ figma: name.slice(name.startsWith(prefix) ? prefix.length : 0), var: v, values });
  }
  return items.length ? { group: 'primitives', items } : null;
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
  // Each value by the name of the Figma variable its text style binds (typography/m/font-size, font-family), and the
  // styles in Figma's own order.
  const FIG_PROP = { size: 'font-size', lh: 'line-height', weight: 'font-weight', ls: 'letter-spacing' };
  const sized = new Set(Object.keys(figmaVars.sizing ?? {}));
  for (const t of scales.values()) {
    for (const [prop, v] of Object.entries(t)) {
      if (prop === 'scale' || !v) continue;
      const name = `typography/${t.scale}/${FIG_PROP[prop] ?? prop}`;
      // A value Figma keeps in the text style itself, with no variable of its own (a weight): named by that style.
      if (sized.has(name)) v.figma = name;
      else if ((figmaVars.typography ?? {})[t.scale]) v.figma = `text style ${t.scale}`;
    }
    const fam = Object.keys(figmaVars.strings ?? {}).find((k) => /(^|\/)font-?family$/i.test(k));
    if (fam && !t.family) t.family = { figma: fam, value: figmaVars.strings[fam] };
  }
  const typeOrder = Object.keys(figmaVars.typography ?? {});
  const typeAt = (t) => { const i = typeOrder.indexOf(t.scale); return i < 0 ? typeOrder.length : i; };
  const differences = (check.fail ?? []).length + (check.aliasFail ?? []).length;
  return {
    colors: [...groups].map(([group, items]) => ({ group, items })),
    spacing: sizes.filter((t) => isSpace(t) && !isRadius(t)),
    radii: sizes.filter(isRadius),
    sizing: sizes.filter((t) => !isSpace(t) && !isRadius(t)),
    typography: [...scales.values()].sort((a, b) => typeAt(a) - typeAt(b)),
    differences,
  };
}

// An instance copied from a page, without its handlers and its ids (a script's hooks, unique to that page), except an id
// the instance itself points to (aria-labelledby, aria-describedby, aria-controls, for): the label a group is named by
// stays with it, so the copy is named as the product names it. The style guide makes each one unique where it draws it.
export function keepReferencedIds(html) {
  const refs = new Set();
  for (const r of String(html).matchAll(/\s(?:aria-(?:labelledby|describedby|controls|owns|errormessage|activedescendant|details|flowto)|for|headers|list)\s*=\s*("([^"]*)"|'([^']*)')/gi)) for (const id of (r[2] ?? r[3] ?? '').split(/\s+/)) if (id) refs.add(id);
  return String(html).replace(/\s(id|on\w+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, (all, attr, v, dq, sq) => (/^id$/i.test(attr) && refs.has(dq ?? sq ?? v) ? all : '')).trim();
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
    out.push(keepReferencedIds(body.slice(m.index, end)));
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

// Every token a component is drawn with, visible in a variant or not: each var() in a rule for its class or one of its
// parts (.badge-label, .badge__icon; never another component's class), with the properties it sets, ordered colour,
// type, spacing, radius, border, shadow, then the rest. → [{ var, props: [prop] }]
const TOKEN_KINDS = [/^(color|background|background-color|border(-\w+)?-color|outline-color|fill|stroke|caret-color|accent-color|text-decoration-color)$/, /^(font|font-\w+|line-height|letter-spacing|text-\w+)$/, /^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(-\w+)*$/, /radius/, /^(border|outline)(-\w+)*$/, /shadow/];
export function allComponentTokens(cssText, cls, otherClasses = []) {
  if (!cls) return [];
  const clean = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const q = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A component the system defines by id (#tt) is matched by that id; any other by its class and its parts' classes.
  const classRe = /^#/.test(cls) ? new RegExp(`#(${q(cls.slice(1))})(?![\\w-])`, 'g') : new RegExp(`\\.(${q(cls)}(?:(?:-|__)[\\w-]+)?)(?![\\w-])`, 'g');
  const others = new Set(otherClasses.filter((o) => o && o !== cls));
  const by = new Map();
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (selector.startsWith('@')) continue;
    if (![...selector.matchAll(classRe)].some((h) => !others.has(h[1]))) continue;
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      if (prop.startsWith('--')) continue;   // a variable it sets, not one it draws with
      for (const v of decl.slice(i + 1).matchAll(/var\(\s*(--[\w-]+)/g)) { const e = by.get(v[1]) ?? by.set(v[1], { var: v[1], props: [] }).get(v[1]); if (!e.props.includes(prop)) e.props.push(prop); }
    }
  }
  const kind = (e) => { const k = e.props.map((p) => TOKEN_KINDS.findIndex((re) => re.test(p))).filter((n) => n >= 0); return k.length ? Math.min(...k) : TOKEN_KINDS.length; };
  return [...by.values()].map((e, i) => ({ e, i, k: kind(e) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.e);
}

// A Figma variant's name as its props: 'Size=L, State=Default' → { Size: 'L', State: 'Default' }; none → null.
export function variantOf(name) {
  if (!name) return null;
  const out = {};
  for (const part of String(name).split(',')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return Object.keys(out).length ? out : null;
}

// Which components use each token: in their own rules, or through another token whose value names it
// (--button-background: var(--neutral-100) makes the button a user of --neutral-100, through --button-background).
// → { '--var': { direct: [name], via: [{ name, through }] } }, for the style guide's "What uses it" view.
export function tokenUses(cssText, comps = []) {
  const clean = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const refs = {};   // --x → the variables its value names, in any mode
  for (const m of clean.matchAll(/(--[\w-]+)\s*:([^;{}]*)/g)) for (const v of m[2].matchAll(/var\(\s*(--[\w-]+)/g)) (refs[m[1]] ??= new Set()).add(v[1]);
  const out = {}, at = (v) => (out[v] ??= { direct: [], via: [] });
  for (const c of comps) {
    if (!c.cls || /^#/.test(c.cls)) continue;
    const own = [...new Set(componentTokens(clean, c.cls).map((t) => t.var))];
    for (const v of own) if (!at(v).direct.includes(c.name)) at(v).direct.push(c.name);
    // Nearest first: each token its own ones name, then the ones those name, each once, with the own one it came through.
    const seen = new Set(own), queue = own.map((v) => [v, v]);
    while (queue.length) {
      const [v, first] = queue.shift();
      for (const r of refs[v] ?? []) { if (seen.has(r)) continue; seen.add(r); at(r).via.push({ name: c.name, through: first }); queue.push([r, first]); }
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
// The look of the system's own card (its rule for the class alone): the border's colour and width, its corner radius and
// shadow, each as the CSS writes it. → { border, width, radius, shadow } (each or null), or null with no rule.
export function cardLook(themeCss = '', cls = null) {
  if (!cls) return null;
  const clean = String(themeCss).replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(`(?:^|[}\\s])\\.${cls.replace(/[-]/g, '\\-')}\\s*\\{([^}]*)\\}`, 'g');
  const body = [...clean.matchAll(re)].map((m) => m[1]).join(';');
  if (!body) return null;
  const decl = (prop) => { const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(body); return m ? m[1].trim().replace(/\\s*!important$/, '') : null; };
  const out = { border: decl('border-color'), width: decl('border-width'), radius: decl('border-radius'), shadow: decl('box-shadow') };
  const b = decl('border');
  if (b && !/^(none|0)$/.test(b)) {
    const vars = b.match(/var\([^()]*\)|#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
    const width = /^(var\([^()]*\)|[\d.]+px)\s/.exec(b)?.[1] ?? null;
    out.width ??= width;
    out.border ??= vars.filter((v) => v !== width).pop() ?? null;
  }
  return out;
}

export function chromeRoles({ tokens = null, themeCss = '', componentNames = [], icons = {}, override = {}, card = null } = {}) {
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
    // A page's title: the system's own heading style when it has one clearly larger than its body text (at least 20px
    // and 1.6 times it), as it is; else the page scales the largest style up (--sg-title in the template).
    const lPx = parseFloat(l.size.value), mPx = parseFloat(m.size.value);
    if (lPx >= 20 && lPx >= 1.6 * mPx) { roles.title = `var(${l.size.var})`; from.title = `type/${l.scale}, the system's own heading`; }
  }
  // No font role: the page's text inherits the font the system sets on its own page, with its fallbacks, as its
  // components do. A family variable alone (Inter) would fall to the browser's serif where that font is not installed.
  // Radii and spacing: the system's own scale, nearest to each step the layout uses.
  const px = (t) => parseFloat(String(t.value));
  const nearest = (list, want) => list.filter((t) => Number.isFinite(px(t))).sort((a, b) => Math.abs(px(a) - want) - Math.abs(px(b) - want) || px(a) - px(b))[0];
  const radii = (tokens?.radii ?? []).filter((t) => px(t) > 0);
  const cardRadius = radii.find((t) => /card|surface|container|panel/i.test(t.figma));
  for (const [role, want, t] of [['radius-s', 4], ['radius', 8, cardRadius], ['radius-l', 12, cardRadius], ['radius-pill', 999]]) {
    const pick = t ?? nearest(radii, want);
    if (pick) { roles[role] = `var(${pick.var})`; from[role] = pick.figma; }
  }
  const spaces = tokens?.spacing ?? [];
  for (const [role, want] of [['space-xxs', 2], ['space-xs', 4], ['space-s', 8], ['space-m', 12], ['space-l', 16], ['space-xl', 24], ['space-xxl', 32]]) {
    const pick = nearest(spaces, want);
    if (pick) { roles[role] = `var(${pick.var})`; from[role] = pick.figma; }
  }
  if (icons.size) { roles.icon = `${icons.size}px`; from.icon = 'the size of the system\'s icons'; }
  // Every box on the page (the Playground, its tables, the code) looks like the system's own card, as the overview's
  // cards are that card: its border colour and width, its radius and its shadow.
  const look = cardLook(themeCss, card?.cls);
  if (look) {
    const at = `the system's card (.${card.cls})`;
    if (look.border) { roles.border = look.border; from.border = at; }
    if (look.width) { roles['line-width'] = look.width; from['line-width'] = at; }
    if (look.radius) { roles.radius = look.radius; roles['radius-l'] = look.radius; from.radius = from['radius-l'] = at; }
    roles.shadow = look.shadow ?? 'none'; from.shadow = at;
  }
  for (const [role, v] of Object.entries(override ?? {})) if (typeof v === 'string' && v) { roles[role] = /^--/.test(v) ? `var(${v})` : v; from[role] = 'styleguide.chrome'; }
  const NEEDED = ['bg', 'surface', 'text', 'muted', 'border', 'accent', 's', 'm', 'l', 'radius', 'space-s', 'space-l'];
  const missing = NEEDED.filter((r) => !roles[r]);
  // Declared again on every element that carries its own mode, so a preview in Light on a Dark page resolves the
  // page's roles with its own values (a variable is resolved where it is declared, then inherited as it is).
  const css = Object.keys(roles).length ? `:root, [data-color], [data-size] { ${Object.entries(roles).map(([k, v]) => `--sg-${k}: ${v};`).join(' ')} }` : '';
  return { roles, from, missing, css, contrast: pageContrast(roles, byVar) };
}

// The page's own text on its own backgrounds, in every colour mode, from the tokens' values: each pair below WCAG's
// 4.5:1 for body text (1.4.3), so a page that is hard to read in Dark fails its check. → [{ text, on, mode, ratio }]
const PAGE_PAIRS = [['text', 'bg'], ['text-2', 'bg'], ['muted', 'bg'], ['text', 'bg-2'], ['text-2', 'bg-2'], ['muted', 'bg-2']];
export function pageContrast(roles = {}, byVar = new Map()) {
  const tokenOf = (role) => { const m = /^var\((--[\w-]+)\)$/.exec(roles[role] ?? ''); return m ? byVar.get(m[1]) : null; };
  const modes = [...new Set(PAGE_PAIRS.flat().flatMap((r) => Object.keys(tokenOf(r)?.values ?? {})))];
  const out = [], seen = new Set();
  for (const mode of modes) for (const [fg, bg] of PAGE_PAIRS) {
    const f = rgbaOf(tokenOf(fg)?.values?.[mode]), b = rgbaOf(tokenOf(bg)?.values?.[mode]);
    if (!f || !b || b[3] < 1) continue;   // a see-through background depends on what is under it
    const blend = f.map((c, i) => (i < 3 ? c * f[3] + b[i] * (1 - f[3]) : 1));
    const lum = (c) => { const [r, g, bl] = c.slice(0, 3).map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const [hi, lo] = [lum(blend), lum(b)].sort((x, y) => y - x);
    const ratio = Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
    const key = `${mode}:${roles[fg]}:${roles[bg]}`;
    if (ratio < 4.5 && !seen.has(key)) { seen.add(key); out.push({ text: fg, on: bg, mode, ratio }); }
  }
  return out;
}
function rgbaOf(v) {
  const s = String(v ?? '').trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) { let h = m[1]; if (h.length <= 4) h = h.split('').map((c) => c + c).join(''); const n = (i) => parseInt(h.slice(i, i + 2), 16); return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]; }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4]];
  return null;
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
    // A segmented control by name first; then tabs, the same choice drawn another way; then any group with a selected
    // item. Anything but a segmented control is a stand-in, and the page says so.
    const own = /(segment|toggle|switcher|picker|chooser)/i.test(c.name), tabs = !own && /tab/i.test(c.name);
    const score = (own ? 0 : tabs ? 1 : 10) + (items[0].tag === 'button' ? 0 : 2);
    const base = (/\bclass\s*=\s*["']([^"']*)["']/i.exec(rootAttrs)?.[1] ?? '').split(/\s+/).filter(Boolean)[0];
    // The control itself, without the modifiers one product gave it (full-width, compact): only its own class.
    // Its decoration too (an empty aria-hidden part, as a sliding pill the system's script places).
    const deco = [...inner.matchAll(/<span\b[^>]*aria-hidden\s*=\s*["']true["'][^>]*>\s*<\/span>/gi)].map((d) => d[0]).join('');
    found.push({ score, from: c.name, open: `<${rootTag}${base ? ` class="${base}"` : ''}>${deco}`, close: `</${rootTag}>`, item: { tag: items[0].tag, classes: common, label }, selected, standIn: own ? null : tabs ? 'tabs' : c.name });
  }
  const best = found.sort((a, b) => a.score - b.score)[0];
  if (!best) return null;
  const { score, ...ui } = best;
  return ui;
}

// With no segmented control and no tabs: the system's radio group, one radio per choice (a component whose markup holds
// a radio input, its label part kept), then its buttons side by side, the selected one in its strongest look (primary)
// and the others in its quietest, or, with a single button, the selected one in it and the others plain. Same shape as
// segmentedUi, with standIn saying what stands in. → object | null (the page then draws plain buttons with its tokens).
export function radioGroupUi(components = [], systemCss = '') {
  const defined = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(systemCss);
  const keep = (attrs) => (/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs ?? '')?.[1] ?? '').split(/\s+/).filter((k) => k && defined(k));
  for (const c of components) {
    const m = /^\s*<(label|div|span)\b([^>]*)>([\s\S]*)<\/\1>\s*$/i.exec(c.markup ?? '');
    const input = m && /<input\b([^>]*\btype\s*=\s*["']?radio\b[^>]*)>/i.exec(m[3]);
    if (!input) continue;
    const lab = /<(span|strong|em|b)\b([^>]*)>[^<]*<\/\1>/i.exec(m[3].replace(/<svg[\s\S]*?<\/svg>/gi, ''));
    return { from: c.name, open: '<div class="sg-seg" role="radiogroup">', close: '</div>', item: { tag: m[1].toLowerCase(), classes: keep(m[2]), label: lab ? keep(lab[2]).join(' ') || null : null, radio: keep(input[1]) }, selected: { add: [], attrs: {} }, standIn: 'radio group' };
  }
  return null;
}

export function buttonsAsSegmentedUi(components = [], systemCss = '') {
  const all = [];
  for (const c of components) { const b = buttonUi([c], systemCss); if (b && !all.some((x) => x.cls === b.cls)) all.push({ ...b, name: c.name }); }
  if (!all.length) return null;
  const strong = all.find((b) => /(primary|cta)/i.test(b.name)) ?? null;
  const quiet = [...all].filter((b) => b !== strong).sort((a, b) => (/(secondary|outline)/i.test(a.name) ? 0 : 1) - (/(secondary|outline)/i.test(b.name) ? 0 : 1))[0] ?? strong;
  const on = strong && quiet && strong !== quiet ? strong : null;
  // One look only: the selected choice wears it and the others are plain, so which one is chosen still shows.
  if (!on) return { from: quiet.from, open: '<div class="sg-seg">', close: '</div>', item: { tag: 'button', classes: [], label: null }, selected: { add: [quiet.cls], attrs: {} }, standIn: 'buttons' };
  return { from: `${on.from} and ${quiet.from}`, open: '<div class="sg-seg">', close: '</div>', item: { tag: 'button', classes: [quiet.cls], label: quiet.label?.cls || null },
    selected: { add: [on.cls], remove: [quiet.cls], attrs: {} }, standIn: 'buttons' };
}

// What the page could not take from the system, and what it used instead: one line each, for the overview and the To
// do list. ui: the picks above (segmented, field, button, card, iconButton, overlay).
export function standInGaps(ui = {}) {
  const gaps = [];
  const seg = ui.segmented;
  if (!seg) gaps.push({ control: 'segmented control', uses: 'plain buttons drawn with its tokens' });
  else if (seg.standIn) gaps.push({ control: 'segmented control', uses: seg.standIn === 'tabs' ? 'its tabs' : seg.standIn === 'radio group' ? 'its radio group' : seg.standIn === 'buttons' ? 'its buttons side by side' : `its ${seg.standIn}` });
  if (!ui.field) gaps.push({ control: 'text field', uses: 'a plain text input drawn with its tokens' });
  else if (ui.field.standIn) gaps.push({ control: 'text field', uses: `its ${ui.field.standIn}` });
  if (!ui.button) gaps.push({ control: 'text button', uses: 'plain links and buttons drawn with its tokens' });
  if (!ui.card) gaps.push({ control: 'card', uses: 'plain blocks drawn with its tokens' });
  if (!ui.iconButton) gaps.push({ control: 'icon button', uses: 'plain buttons drawn with its tokens' });
  return gaps.map((g) => ({ ...g, say: `This system has no ${g.control}, so the page uses ${g.uses}.`, todo: `Design ${/^[aeiou]/i.test(g.control) ? 'an' : 'a'} ${g.control} in Figma and build it, and the page uses it; or keep the stand-in.` }));
}

// The system's own text field, for the page's text inputs: a component's markup holding a text <input> (role
// textbox, or a name that says input or field, preferred), cut to its root and the input, each keeping only the
// classes the system's own CSS defines (a product's extra classes stay out). → { from, markup } or null.
// The system's own text button, for the links the page shows (each component's products): a component whose role is a
// button or a link, with a text label, and a class the system's CSS styles. The quietest one wins (a link, then a
// tertiary or ghost button, then a secondary one; a primary or destructive one last); an icon-only button never.
// ds-config.json → styleguide.ui.button names one instead. → { from, cls, label: { tag, cls } } | null
// How a component moves, read from the system's own CSS, so the style guide can play it: an entry animation on its
// own rule, the modifiers that play an exit (.toast.toast-out), and, for a component shown inside an overlay, the
// container, its open and closing classes and its other layers (.modal.is-open, .modal.is-closing, .modal-overlay).
// A looping animation (a spinner) always plays and needs no button. → { entry, exits, overlay } | null
export function motionUi(cls = '', css = '') {
  if (!cls || /^#/.test(cls)) return null;
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((x) => x.trim().replace(/\s+/g, ' ')), body: m[2] }));
  const esc = (c) => c.replace(/[-]/g, '\\-');
  const me = esc(cls);
  const moves = (b) => /(^|;)\s*animation(-name)?\s*:/.test(b) && !/\binfinite\b/.test(b) && !/animation(-name)?\s*:\s*none/.test(b);
  let entry = false; const exits = new Set(), states = new Map();
  for (const r of rules) {
    if (!moves(r.body)) continue;
    for (const sel of r.sels) {
      if (new RegExp(`^\\.${me}$`).test(sel)) entry = true;
      let m = new RegExp(`^\\.${me}\\.([\\w-]+)$`).exec(sel);
      if (m) exits.add(m[1]);
      m = new RegExp(`^\\.([\\w-]+)\\.([\\w-]+) \\.${me}$`).exec(sel);
      if (m) { if (!states.has(m[1])) states.set(m[1], new Set()); states.get(m[1]).add(m[2]); }
    }
  }
  let overlay = null;
  for (const [container, st] of states) {
    const c = esc(container);
    const open = rules.flatMap((r) => r.sels.map((sel) => [sel, r.body])).map(([sel, body]) => [new RegExp(`^\\.${c}\\.([\\w-]+)$`).exec(sel), body])
      .find(([m, body]) => m && /display\s*:\s*(?!none)[\w-]+/.test(body))?.[0]?.[1];
    if (!open) continue;
    const layers = new Set();
    for (const r of rules) for (const sel of r.sels) { const m = new RegExp(`^\\.${c}(?:\\.[\\w-]+)? (?:> )?\\.([\\w-]+)$`).exec(sel); if (m && m[1] !== cls) layers.add(m[1]); }
    overlay = { container, open, closing: [...st].find((x) => x !== open) ?? null, layers: [...layers] };
    break;
  }
  if (!entry && !exits.size && !overlay) return null;
  return { entry, exits: [...exits], overlay };
}

export function buttonUi(components = [], systemCss = '', prefer = null) {
  const defined = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(systemCss);
  const found = [];
  for (const c of components) {
    const m = /^\s*<(button|a)\b([^>]*)>([\s\S]*)<\/\1>\s*$/i.exec(c.markup ?? '');
    if (!m || !(prefer ? c.name === prefer : ['button', 'link'].includes(c.role) || m[1].toLowerCase() === 'a')) continue;
    const cls = (/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2])?.[1] ?? '').split(/\s+/).filter(Boolean)[0];
    if (!cls || !defined(cls)) continue;
    // Its label part, even one a product fills at run time (an empty span); only the classes the system styles.
    const lab = /<(span|strong|b|em)\b([^>]*)>([^<]*)<\/\1>/i.exec(m[3]);
    const bare = m[3].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').trim();
    if (!lab && !bare) continue;   // icon only
    const labelCls = lab ? (/\bclass\s*=\s*["']([^"']*)["']/i.exec(lab[2])?.[1] ?? '').split(/\s+/).filter((k) => k && defined(k)).join(' ') : '';
    const rank = c.role === 'link' || m[1].toLowerCase() === 'a' ? 0 : /(link|tertiary|ghost|subtle|plain|text)/i.test(c.name) ? 1 : /(secondary|outline)/i.test(c.name) ? 2 : /(primary|danger|destructive|cta)/i.test(c.name) ? 5 : 3;
    found.push({ rank, from: c.name, cls, label: lab ? { tag: lab[1].toLowerCase(), cls: labelCls } : null });
  }
  const best = found.sort((a, b) => a.rank - b.rank)[0];
  if (!best) return null;
  const { rank, ...ui } = best;
  return ui;
}

// The system's own card, for the overview's links to each section: a component named card or tile whose root class the
// system's CSS styles. → { from, cls } | null
// The system's own icon-only button (an svg and no label), for the page's menu and close buttons on a phone.
// → { from, cls } | null
export function iconButtonUi(components = [], systemCss = '') {
  const defined = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(systemCss);
  for (const c of components) {
    const m = /^\s*<button\b([^>]*)>([\s\S]*)<\/button>\s*$/i.exec(c.markup ?? '');
    if (!m || (c.role && c.role !== 'button') || !/<svg\b/i.test(m[2])) continue;
    if (m[2].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').trim()) continue;   // it has a label
    if (/<(span|strong|b|em)\b[^>]*>\s*<\/\1>/i.test(m[2].replace(/<svg[\s\S]*?<\/svg>/gi, ''))) continue;   // an empty label holder
    const cls = (/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[1])?.[1] ?? '').split(/\s+/).filter(Boolean)[0];
    if (cls && defined(cls)) return { from: c.name, cls };
  }
  return null;
}

export function cardUi(components = [], systemCss = '') {
  const defined = (c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(systemCss);
  for (const c of components) {
    if (!/(^|[^a-z])(card|tile)$/i.test(c.name) && !/^(card|tile)/i.test(c.name)) continue;
    const cls = (/^\s*<[a-z][\w-]*\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(c.markup ?? '')?.[1] ?? '').split(/\s+/).filter(Boolean)[0];
    if (cls && defined(cls)) return { from: c.name, cls };
  }
  return null;
}

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
    const field = c.role === 'textbox' || /input|field|text/i.test(c.name);
    const score = (field ? 0 : 10) + (ic.length || rc.length ? 0 : 5);
    found.push({ score, from: c.name, markup, standIn: field ? null : /search/i.test(c.name) || type === 'search' ? 'search field' : c.name });
  }
  const best = found.sort((a, b) => a.score - b.score)[0];
  return best ? { from: best.from, markup: best.markup, ...(best.standIn ? { standIn: best.standIn } : {}) } : null;
}

// ── How to use a component: the same four sections on every page ──────────────────────────────────────────────────
// Read from what the team already writes: Figma's description and annotations, and the code's own note, where a line
// starts with the section's name (When not to use: …, or the name on its own line with the text below it); then
// contract.authored.json → components.<name>.guidance ({ whenToUse, whenNotToUse, mistakes, limitations }, a string or
// a list). A section nobody has written yet is listed as missing, so the overview can count the gaps.
export const GUIDANCE = [
  ['whenToUse', 'When to use', /^(when to use|use (it )?when|usage|quando usar)$/i],
  ['whenNotToUse', 'When not to use', /^(when not to use|do not use (it )?when|don'?t use (it )?when|avoid|quando n[ãa]o usar)$/i],
  ['mistakes', 'Common mistakes', /^(common mistakes|mistakes|common errors|erros comuns)$/i],
  ['limitations', 'Limitations', /^(limitations|limits|known limitations|limita[çc][õo]es)$/i],
];
// seen: what the last audit found the products doing with the component (a rule laid over it, a look-alike built by
// hand, a parent's rule overriding it), said plainly; it fills Common mistakes when the team wrote none.
export function guidanceView({ description = '', annotations = [], note = '', authored = null, seen = [] } = {}) {
  const found = {}, from = {};
  const take = (text, source) => {
    let cur = null;
    for (const raw of String(text ?? '').split(/\r?\n/)) {
      const line = raw.replace(/^\s*(?:[-*•]|#+)\s*/, '').trim();
      if (!line) { cur = null; continue; }
      const m = /^([^:–—-]{3,40}?)\s*[:–—-]\s*(.*)$/.exec(line) ?? (/^[^:]{3,40}:?$/.test(line) ? [line, line.replace(/:$/, ''), ''] : null);
      const hit = m && GUIDANCE.find(([, , re]) => re.test(m[1].trim()));
      if (hit) { cur = hit[0]; if (!found[cur]) { found[cur] = []; from[cur] = source; } if (m[2].trim()) found[cur].push(m[2].trim()); continue; }
      if (cur && from[cur] === source) found[cur].push(line);
    }
  };
  take(description, 'Figma');
  for (const a of annotations ?? []) take(typeof a === 'string' ? a : a?.label ?? a?.labelMarkdown ?? '', 'Figma');
  take(note, 'the code');
  for (const [key] of GUIDANCE) {
    const v = authored?.[key];
    const list = Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v.trim() ? [v.trim()] : [];
    if (list.length && !found[key]?.length) { found[key] = list; from[key] = 'contract.authored.json'; }
  }
  if (!found.mistakes?.length && seen.length) { found.mistakes = [...new Set(seen.map(String))].slice(0, 6); from.mistakes = "the products' code, as the last audit found it"; }
  const sections = GUIDANCE.map(([key, title]) => ({ key, title, text: found[key]?.length ? found[key] : null, ...(found[key]?.length ? { from: from[key] } : {}) }));
  return { sections, missing: sections.filter((x) => !x.text).map((x) => x.key) };
}

// ── How ready a component is: stable, beta or deprecated ─────────────────────────────────────────────────────────────
// From where the team already says it: contract.authored.json → components.<name>.status, a line of Figma's description
// or annotations (Status: beta), else its code (@deprecated, @beta, @status beta). Nothing said, nothing shown: a status
// is never guessed. → { status: 'Beta', kind: 'stable' | 'beta' | 'deprecated', from } | null
const STATUS_KIND = [['deprecated', /^(deprecated|obsolete|retired|legacy)$/i], ['beta', /^(beta|alpha|experimental|preview|draft|wip|new)$/i], ['stable', /^(stable|ready|released|production|done)$/i]];
export function statusView({ description = '', annotations = [], note = '', authored = null, text = '' } = {}) {
  const pick = (word, from) => { const k = STATUS_KIND.find(([, re]) => re.test(String(word).trim())); return k ? { status: String(word).trim().replace(/^\w/, (ch) => ch.toUpperCase()).toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase()), kind: k[0], from } : null; };
  if (authored) { const r = pick(authored, 'contract.authored.json'); if (r) return r; }
  for (const t of [description, ...(annotations ?? []).map((a) => (typeof a === 'string' ? a : a?.label ?? ''))]) {
    const m = /(?:^|\n)\s*(?:status|maturity|stage)\s*[:=–—-]\s*([A-Za-z]+)/i.exec(String(t ?? ''));
    if (m) { const r = pick(m[1], 'Figma'); if (r) return r; }
  }
  for (const [t, from] of [[note, 'the code'], [text, 'the code']]) {
    const s = String(t ?? '');
    if (/@deprecated\b/.test(s)) return { status: 'Deprecated', kind: 'deprecated', from };
    const m = /@status\s+([A-Za-z]+)/.exec(s) ?? /@(beta|alpha|experimental)\b/.exec(s);
    if (m) { const r = pick(m[1], from); if (r) return r; }
  }
  return null;
}

// Its test coverage, from the coverage summary the project's tests write (Istanbul's json-summary: { "<file>": { lines:
// { pct } } }): the entry for its own file. → { lines: 87.5 } | null
export function coverageOf(summary, file) {
  if (!summary || !file) return null;
  const want = String(file).replace(/^\.\//, '');
  const key = Object.keys(summary).find((k) => k !== 'total' && (k === want || k.endsWith('/' + want)));
  const pct = key ? summary[key]?.lines?.pct : null;
  return typeof pct === 'number' ? { lines: pct } : null;
}

// ── A component's code API, as its page lists it ──────────────────────────────────────────────────────────────────────
// api: component-api.mjs apiFor(). → { file, tag?, syntax?, props: [{ name, values?, type?, default?, required? }],
// events: [names], slots: [names] } | null when the code states none. A callback prop (onChange) is listed once, as an
// event; "required" is only what the code says (a default makes a prop not required), never a guess.
export function apiView(api, file = api?.file) {
  if (!api?.file) return null;
  const events = api.events ?? [];
  const props = Object.entries(api.props ?? {}).filter(([n]) => !events.includes(n)).map(([n, f]) => ({ name: n,
    ...(f.options ? { values: f.options } : f.type ? { type: f.type } : {}), ...(f.default != null ? { default: String(f.default) } : {}), ...(typeof f.required === 'boolean' ? { required: f.required } : {}) }));
  const slots = [...(api.slots?.default ? ['default'] : []), ...(api.slots?.named ?? [])];
  if (!props.length && !events.length && !slots.length) return null;
  return { file, ...(api.tag ? { tag: api.tag, syntax: api.syntax } : {}), props, events, slots };
}

// ── Accessibility, per component: what it owes and what the last browser check found ─────────────────────────────────
// Each check of a11y-check.mjs, by the WCAG success criterion it stands for (the WCAG 2.1 checks of wcag-page.js and
// a11y-static.mjs added from wcag21.mjs).
const A11Y_WCAG_OWN = {
  contrast: '1.4.3', hovercontrast: '1.4.3', focuscontrast: '1.4.11', iconcontrast: '1.4.11', name: '4.1.2', focus: '2.4.7', ariastate: '4.1.2', keyboard: '2.1.1',
  target: '2.5.8', tabtrap: '2.1.2', tabindex: '2.4.3', escape: '2.1.1', focusreturn: '2.4.3', heading: '1.3.1', motion: '2.3.3', forcedfocus: '2.4.7',
  spacing: '1.4.12', activate: '2.1.1', arrows: '2.1.1', zoom: '1.4.4', obscured: '2.4.11', focusthin: '2.4.13', rolecontract: '4.1.2', annotation: '4.1.2',
  reflow: '1.4.10', partrole: '1.3.1', behaviour: '2.1.1', statefollows: '4.1.2', semantics: '4.1.2',
};
export const A11Y_WCAG = { ...WCAG21_KIND, ...A11Y_WCAG_OWN };
// The criteria the page names, with their WCAG title and level (every WCAG 2.1 criterion at A and AA, and the 2.2 ones
// the checks stand for).
export const WCAG_CRITERIA = {
  ...Object.fromEntries(WCAG21.map((c) => [c.sc, [c.name, c.level]])),
  '1.3.1': ['Info and Relationships', 'A'], '1.4.3': ['Contrast (Minimum)', 'AA'], '1.4.4': ['Resize Text', 'AA'], '1.4.10': ['Reflow', 'AA'],
  '1.4.11': ['Non-text Contrast', 'AA'], '1.4.12': ['Text Spacing', 'AA'], '2.1.1': ['Keyboard', 'A'], '2.1.2': ['No Keyboard Trap', 'A'],
  '2.3.3': ['Animation from Interactions', 'AAA'], '2.4.3': ['Focus Order', 'A'], '2.4.7': ['Focus Visible', 'AA'], '2.4.11': ['Focus Not Obscured (Minimum)', 'AA'],
  '2.4.13': ['Focus Appearance', 'AAA'], '2.5.8': ['Target Size (Minimum)', 'AA'], '3.3.1': ['Error Identification', 'A'], '4.1.2': ['Name, Role, Value', 'A'],
};
// The static findings (a11y-static.mjs) that belong to a component: in a file named after it (or its class), or, in a
// shared script, with its class or name in the code around the finding. → { name: [{ kind, file, line, desc, fix }] }
export function wcagStatics(findings = [], components = []) {
  const out = {};
  const kinds = new Set(['shortcut', 'timing', 'gesture', 'motionact']);
  const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = components.map((c) => ({ name: c.name, file: new RegExp(`(?:^|[\\/._-])(?:${[c.name, c.cls].filter(Boolean).map(esc).join('|')})(?:[\\/._-]|$)`, 'i'),
    code: c.cls ? new RegExp(`[.'"\\s]${esc(c.cls)}(?![\\w-])`) : null }));
  for (const f of findings) {
    if (!kinds.has(f.kind)) continue;
    const base = String(f.file ?? '').replace(/\.[^./\\]+$/, '');
    const own = words.filter((w) => w.file.test(base));
    const hit = own.length ? own : words.filter((w) => w.code && w.code.test(f.near ?? ''));
    for (const w of hit) (out[w.name] ??= []).push({ kind: f.kind, file: f.file, line: f.line, desc: f.desc, fix: f.fix ?? '' });
  }
  return out;
}
const wcagOfLine = (line) => (/error/i.test(line) ? '3.3.1' : '4.1.2');
// "WCAG 2.1.1 Keyboard (A)": a criterion as the page names it.
export const wcagLabel = (id) => (!id ? null : WCAG_CRITERIA[id] ? `WCAG ${id} ${WCAG_CRITERIA[id][0]} (${WCAG_CRITERIA[id][1]})` : `WCAG ${id}`);

// name, cls: the component · role: its role word (Figma's annotation, else the authored contract) · annotations: Figma's
// notes on it · parts: its part roles ([{ layer, part }]) · exceptions: behaviours the person excused ({ id: reason }) ·
// result: the last browser check (a11y.json), or null · guide: { kind: { title(n), fix } } (a11y-check.mjs A11Y_GUIDE).
// → { role, element, expects: [{ says, wcag }], excused: [{ says, reason }], checked: null | { at, notRead?, issues: [{ kind,
// title, fix, wcag, details: [where each one is] }] } }, one issue per kind of problem, each wcag as the page names it ("WCAG 4.1.2 Name, Role, Value (A)").
export function a11yView({ name, cls = null, role = null, roleFrom = null, annotations = [], parts = [], exceptions = {}, result = null, guide = {}, notes = [] } = {}) {
  const expects = [];
  const known = role && roleOf(role);
  // Where each row comes from: the Figma annotation that states the role, else the authored contract.
  const fromRole = roleFrom === 'figma' ? `Figma annotation Role: ${role}` : roleFrom === 'contract' ? 'contract.authored.json semantics' : 'its role';
  if (role) {
    expects.push({ says: known ? `It is ${roleMarkup(role)}.` : `It carries role="${role}".`, wcag: '4.1.2', from: fromRole });
    for (const line of roleSheetLines(role)) expects.push({ says: `It has ${line}.`, wcag: wcagOfLine(line), from: fromRole });
  }
  const b = behavioursFor(role, annotations.map((a) => (typeof a === 'string' ? { label: a } : a)), exceptions);
  for (const r of b.rows) expects.push({ says: (r.sheet ?? r.says).replace(/^\w/, (ch) => ch.toUpperCase()) + '.', wcag: r.act?.keys ? '2.1.1' : '4.1.2', from: r.from === 'Figma annotation' ? 'Figma annotation' : fromRole });
  parts.forEach((p, i) => { const line = partSheetLines([p])[0]; if (line) expects.push({ says: line.replace(/^\w/, (ch) => ch.toUpperCase()) + '.', wcag: '1.3.1', from: `Figma annotation on the "${p.layer}" layer` }); });
  const excused = b.excepted.map((x) => ({ says: x.id, reason: x.reason }));
  let checked = null;
  if (result) {
    const at = result.checkedAt ?? null;
    if ((result.notRead ?? []).some((x) => String(x).split(' (')[0] === name)) checked = { at, notRead: true, issues: [] };
    else {
      const mine = new RegExp(`\\.${String(cls ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
      const seen = new Set(), found = [];
      for (const r of result.issues ?? []) {
        // its own: the check named it, or the finding is on its class, or starts with its name ("stepper: …")
        const sel = String(r.selector ?? '');
        if (!(r.component === name || (!r.component && ((cls && mine.test(sel)) || sel.startsWith(`${name}: `))))) continue;
        const detail = r.contrast != null ? `${r.text ? `"${r.text}" ` : ''}${r.contrast}:1, needs ${r.needs}:1${r.theme ? ` (${r.theme})` : ''}` : String(r.selector ?? '');
        const k = r.issue + '|' + detail;
        if (seen.has(k)) continue;
        seen.add(k);
        found.push({ kind: r.issue, fix: r.fix ?? guide[r.issue]?.fix ?? '', detail });
      }
      // One line per kind of problem: how many, where each is, the fix and the criterion once.
      const issues = [];
      for (const f of found) {
        const same = issues.find((i) => i.kind === f.kind);
        if (same) { same.details.push(f.detail); continue; }
        issues.push({ kind: f.kind, fix: f.fix, wcag: A11Y_WCAG[f.kind] ?? null, details: [f.detail] });
      }
      for (const i of issues) i.title = guide[i.kind]?.title ? guide[i.kind].title(i.details.length) : i.kind;
      checked = { at, issues };
    }
  }
  for (const x of expects) x.wcag = wcagLabel(x.wcag);
  for (const x of checked?.issues ?? []) x.wcag = wcagLabel(x.wcag);
  // What the page tries on the live component: each behaviour its role and Figma's notes ask for.
  const behaviours = b.rows.map((r) => ({ id: r.id, says: r.says, act: r.act, expect: r.expect }));
  return { role: role ?? null, roleFrom, ...(known ? { element: roleMarkup(role), key: roleKey(role) } : {}), expects, excused, checked, behaviours, notes };
}

// ── Parity, per component: what agrees with Figma and what does not ────────────────────────────────────────────────
// agreed: the agreed record (agreed.mjs) · census: the last audit's census entry for it ({ compared, differ,
// notComparable, reasons }) · differences: its open differences (each { what, plain?, who?, todo? }) · controls: the
// props both sides have · unbuilt: Figma props the code does not build · ownTokens: its tokens equal to Figma.
// → { agreed: [{ what, value, since, commit }], props: [{ figma, code }], tokens: [{ figma, var }], differ, notBuilt:
// [labels], notCompared: { count, reasons: [[why, n]] } | null, counts: { agree, differ, notBuilt, notCompared } }
// A fact the record holds that an open difference names is not listed as agreeing: the record is the last agreement.
export function parityView({ name, agreed = {}, census = null, differences = [], controls = [], unbuilt = [], ownTokens = null } = {}) {
  const prefix = `${name} · `;
  const open = differences.map((d) => String(d.what ?? ''));
  const facts = Object.entries(agreed.facts ?? {})
    .filter(([k, f]) => k.startsWith(prefix) && f && f.figma !== undefined && String(f.figma) === String(f.code) && !open.some((w) => w.includes(k)))
    .map(([k, f]) => ({ what: k.slice(prefix.length), value: String(f.code), since: f.at ?? null, commit: f.commit ?? null }))
    .sort((a, b) => a.what.localeCompare(b.what));
  const props = controls.map((k) => ({ figma: k.label, code: k.prop ?? k.label }));
  const tokens = [...(ownTokens?.colors ?? []), ...(ownTokens?.sizes ?? [])].map((t) => ({ figma: t.figma, var: t.var }));
  const notCompared = census && census.notComparable ? { count: census.notComparable, reasons: Object.entries(census.reasons ?? {}) } : null;
  const notBuilt = unbuilt.map((u) => u.label ?? u);
  return { agreed: facts, props, tokens, differ: differences, notBuilt, notCompared,
    counts: { agree: facts.length + props.length + tokens.length, differ: differences.length, notBuilt: notBuilt.length, notCompared: notCompared?.count ?? 0 } };
}

// ── What the audit found on a component, split by where it belongs: a difference from Figma goes to Parity, an
// accessibility problem (a text's contrast) to Accessibility. list: [{ check, … }] → { parity: [...], a11y: [...] }
export const A11Y_CHECK = /contrast|accessib|focus|keyboard|target size|screen reader/i;
export function splitFindings(list = []) {
  return { parity: list.filter((x) => !A11Y_CHECK.test(x.check ?? '')), a11y: list.filter((x) => A11Y_CHECK.test(x.check ?? '')) };
}

// ── Parity, one table: every prop, variable and value of the component, Figma beside code ──────────────────────────
// Everything the component has, whatever the Playground shows. propsSnap: the Figma props snapshot · controls: the props
// both sides have ({ label, prop }) · unbuilt: Figma props the code does not build · codeProps: the code's own props
// (component-api, { name: { default } }) · allTokens: every CSS variable its rules use ({ var, figma }) · check: the token
// check's result (passVars, fail, skip) · agreed: the agreed record (facts, seen) · propsAt / checkedAt: when Figma's props
// were read and when the tokens were checked.
// → [{ type: 'Prop'|'Variable'|'Value', figma: { name, value } | null, code: { name, value } | null,
//      status: 'match'|'differs'|'figma'|'code', at }], props first, then variables, then values. status figma: only in
// Figma; code: only in code. at: a value's time is since both sides agreed, or when it last moved.
export function parityRows({ name, propsSnap = {}, controls = [], unbuilt = [], codeProps = {}, allTokens = [], check = null, agreed = {}, propsAt = null, checkedAt = null, slotParts = [] } = {}) {
  const lc = (x) => String(x ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  const rows = [];
  // The code's props as the API reader gives them (a list, each with its name) or keyed by name.
  if (Array.isArray(codeProps)) codeProps = Object.fromEntries(codeProps.filter((d) => d?.name).map((d) => [d.name, d]));
  // Props: each Figma property, paired with the code prop that realizes it, then the code's own props Figma lacks.
  const fprops = propsSnap[name]?.properties ?? {};
  const say = (d) => {
    if (d.type === 'VARIANT') return `${(d.variantOptions ?? []).join(', ')} · default ${d.defaultValue}`;
    if (d.type === 'BOOLEAN') return `on or off · default ${d.defaultValue ? 'on' : 'off'}`;
    if (d.type === 'TEXT') return `text · default ${JSON.stringify(String(d.defaultValue ?? ''))}`;
    if (d.type === 'INSTANCE_SWAP') return 'a component swap';
    return String(d.type ?? '').toLowerCase();
  };
  const paired = new Set();
  const notBuilt = new Set(unbuilt.map((u) => lc(u.label ?? u)));
  // What goes inside it: in an HTML and CSS system (no code props) the markup puts any content in, so a Figma slot or
  // component swap is realized by what the markup holds; with code props, a slot by the children it takes.
  const html = !Object.keys(codeProps).length;
  for (const [key, d] of Object.entries(fprops)) {
    const label = key.split('#')[0];
    const ctl = controls.find((k) => lc(k.label) === lc(label));
    const own = ctl ? null : Object.keys(codeProps).find((n) => lc(n) === lc(label));
    const codeName = ctl ? (ctl.prop ?? ctl.label) : own;
    // A Figma slot the code holds in a part of its own (the contract names it: .modal-slot): paired with that part.
    const slotFigma = Object.values(fprops).filter((x) => x.type === 'SLOT').length;
    const part = d.type === 'SLOT' && !codeName ? slotParts.find((x) => lc(x.name) === lc(label)) ?? (slotFigma === 1 && slotParts.length === 1 ? slotParts[0] : null) : null;
    if (part?.selector) { rows.push({ type: 'Prop', figma: { name: label, value: say(d) }, code: { name: part.selector, value: 'its slot' }, status: 'match', at: propsAt, slot: true }); continue; }
    const inside = !codeName && !notBuilt.has(lc(label)) && (html ? d.type === 'SLOT' || d.type === 'INSTANCE_SWAP' : d.type === 'SLOT' && 'children' in codeProps);
    if (inside) { rows.push({ type: 'Prop', figma: { name: label, value: say(d) }, code: html ? { name: 'its content', value: 'what the markup puts inside' } : { name: 'children', value: 'what it wraps' }, status: 'match', at: propsAt, slot: d.type === 'SLOT' }); continue; }
    if (codeName && !notBuilt.has(lc(label))) {
      paired.add(lc(codeName));
      const def = codeProps[codeName]?.default;
      rows.push({ type: 'Prop', figma: { name: label, value: say(d) }, code: { name: codeName, value: def === undefined ? '' : `default ${def}` }, status: 'match', at: propsAt });
    } else rows.push({ type: 'Prop', figma: { name: label, value: say(d) }, code: null, status: 'figma', at: propsAt });
  }
  for (const [n, d] of Object.entries(codeProps)) {
    if (paired.has(lc(n)) || /^(on[A-Z]|class(Name)?$|style$|children$|id$|ref$|key$)/.test(n)) continue;
    rows.push({ type: 'Prop', figma: null, code: { name: n, value: d?.default === undefined ? '' : `default ${d.default}` }, status: 'code', at: propsAt });
  }
  // Variables: each CSS variable its rules use, with Figma's variable and the values in each mode, then the Figma
  // variables named after it that have no CSS variable.
  const modes = (list) => [...new Set(list.map((v) => (v.mode && v.mode !== '-' ? `${v.mode} ` : '') + (v.value ?? v.css ?? '')))].join(' · ');
  const seenVar = new Set();
  for (const t of allTokens) {
    if (!t?.var || seenVar.has(t.var)) continue;
    seenVar.add(t.var);
    const pass = (check?.passVars ?? []).filter((v) => v.cssVar === t.var);
    const fail = (check?.fail ?? []).filter((v) => v.cssVar === t.var);
    if (!t.figma && !pass.length && !fail.length) { rows.push({ type: 'Variable', figma: null, code: { name: t.var, value: '' }, status: 'code', at: checkedAt }); continue; }
    const figmaName = t.figma ?? String((pass[0] ?? fail[0]).token ?? '').replace(/\/color$/, '');
    if (fail.length) rows.push({ type: 'Variable', figma: { name: figmaName, value: [...new Set(fail.map((v) => (v.mode && v.mode !== '-' ? `${v.mode} ` : '') + (v.figma ?? v.value ?? '')))].join(' · ') }, code: { name: t.var, value: [...new Set(fail.map((v) => (v.mode && v.mode !== '-' ? `${v.mode} ` : '') + (v.css ?? 'not declared')))].join(' · ') }, status: 'differs', at: checkedAt });
    else rows.push({ type: 'Variable', figma: { name: figmaName, value: modes(pass) }, code: { name: t.var, value: modes(pass) }, status: pass.length ? 'match' : 'differs', at: checkedAt });
  }
  const prefix = lc(name);
  const figmaOnly = new Map();
  for (const sk of check?.skip ?? []) {
    const tok = String(sk.token ?? '');
    if (lc(tok.split('/')[0]) !== prefix || figmaOnly.has(tok)) continue;
    figmaOnly.set(tok, { type: 'Variable', figma: { name: tok, value: '' }, code: null, status: 'figma', at: checkedAt, why: sk.reason ?? null });
  }
  rows.push(...figmaOnly.values());
  // Values: every value the audit compares (height, padding, font size, a state's opacity), each with when it last held.
  const pre = `${name} · `;
  for (const [k, f] of Object.entries(agreed.seen ?? {}).filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b))) {
    const moves = f.moves ?? [];
    const at = f.same ? (agreed.facts?.[k]?.at ?? moves.at(-1)?.at ?? null) : (moves.at(-1)?.at ?? null);
    rows.push({ type: 'Value', figma: { name: k.slice(pre.length), value: String(f.figma ?? '') }, code: { name: k.slice(pre.length), value: String(f.code ?? '') }, status: f.same ? 'match' : 'differs', at });
  }
  return rows;
}

// ── Where a person reports a problem: an issue about one component, or feedback on the page ────────────────────────
// template: ds-config styleguide.issues, the tracker's new-issue address with {name} for the component and {title} for a
// ready title ("https://redmine.example.com/projects/ds/issues/new?issue[subject]={title}"). Without one, the repository's
// own tracker when it is on GitHub or GitLab. name: the component, or null for the page. → url | null
export function issueLink({ template = null, repo = null, name = null } = {}) {
  const title = name ? `${name}: ` : 'Style guide: ';
  if (template) return String(template).replace(/\{name\}/g, encodeURIComponent(name ?? '')).replace(/\{title\}/g, encodeURIComponent(title));
  if (!repo) return null;
  if (/github\.com/i.test(repo)) return `${repo.replace(/\/$/, '')}/issues/new?title=${encodeURIComponent(title)}`;
  if (/gitlab/i.test(repo)) return `${repo.replace(/\/$/, '')}/-/issues/new?issue[title]=${encodeURIComponent(title)}`;
  return null;
}

// ── How a product brings the component in ─────────────────────────────────────────────────────────────────────────
// tag, syntax: component-api.mjs callName · file: its path from the project root · text: its source · pkg: { name, dir }
// of the package the file belongs to, when it is not the project itself · template: ds-config styleguide.importFrom
// ("@/components/{path}", {path} the file's path from src/ or the package, {name} its tag).
// → { line, from } | null. A Vue or Svelte file is a default import; a React one is named unless only a default export
// gives it. Without a template: the package's name and path, else @/ and the path under src/, else ./ and the path.
export function importOf({ tag, syntax, file, text = '', pkg = null, template = null } = {}) {
  if (!tag || !file || syntax === 'html') return null;
  const ext = (file.match(/\.[^./]+$/) ?? [''])[0];
  const keepExt = /^\.(vue|svelte)$/.test(ext);
  const strip = (p) => (keepExt ? p : p.slice(0, p.length - ext.length));
  let from;
  const underSrc = file.match(/(?:^|\/)src\/(.+)$/);
  if (template) from = template.replace('{path}', strip(underSrc ? underSrc[1] : file)).replace('{name}', tag);
  else if (pkg?.name && pkg.dir && file.startsWith(pkg.dir + '/')) from = `${pkg.name}/${strip(file.slice(pkg.dir.length + 1)).replace(/^src\//, '')}`;
  else if (underSrc) from = `@/${strip(underSrc[1])}`;
  else from = `./${strip(file)}`;
  const named = syntax === 'jsx' && new RegExp(`export\\s+(?:function|const|let|class)\\s+${tag}\\b`).test(text);
  return { line: named ? `import { ${tag} } from '${from}';` : `import ${tag} from '${from}';`, from };
}

// How a product brings in a system whose components are CSS classes (no module to import): its stylesheet, by the name
// the package gives it. file: the stylesheet's path from the project root · pkg: { name, dir, exports } of the package
// it belongs to (the root's own counts). → { line, from, css: true } | null. The package's exports name it when they map
// a path to the file (@acme/ds/theme.css), else the package's name and the path, else the path itself.
export function stylesheetImport({ file, pkg = null } = {}) {
  if (!file) return null;
  const rel = String(file).replace(/^\.\//, '');
  const inPkg = pkg?.name ? (pkg.dir && pkg.dir !== '.' ? (rel.startsWith(pkg.dir + '/') ? rel.slice(pkg.dir.length + 1) : null) : rel) : null;
  let from;
  if (inPkg != null) {
    const ex = pkg.exports && typeof pkg.exports === 'object' ? Object.entries(pkg.exports).find(([, v]) => typeof v === 'string' && v.replace(/^\.\//, '') === inPkg) : null;
    from = ex ? `${pkg.name}/${ex[0].replace(/^\.\//, '')}` : `${pkg.name}/${inPkg}`;
  } else from = `./${rel}`;
  return { line: `@import '${from}';`, from, css: true };
}

// The functions of the system's own script that build or drive a component: those whose body names its class as a
// class (a '.toast' or 'toast' string, classList, className, class="…") and whose own name shares a word with the
// component's (showToast for toast, createSegmentedControl for segmentedControl), never one that only uses it inside
// something else. text: the script · cls: the component's class · name: the component's name.
// → [{ name, args, exported }] in the order the script has them. exported: the script is a module that exports it.
export function scriptUses({ text = '', cls = '', name = '' } = {}) {
  const words = (w) => String(w).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 4);
  const own = words(name || cls);
  const c = String(cls).replace(/^[.#]/, '');
  if (!c || /^#/.test(cls)) return [];
  const e = c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const names = new RegExp(`(['"\`])\\.?${e}\\1|classList\\.\\w+\\(\\s*['"\`]${e}['"\`]|class(?:Name)?\\s*=\\s*['"\`][^'"\`]*\\b${e}\\b|['"\`][^'"\`\\n]*\\.${e}(?![\\w-])[^'"\`\\n]*['"\`]`);
  const t = String(text), fns = [...t.matchAll(/^(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/gm)];
  return fns.map((m, i) => ({ name: m[2], args: m[3].replace(/\s+/g, ' ').trim(), exported: !!m[1] || new RegExp(`export\\s*\\{[^}]*\\b${m[2]}\\b`).test(t), body: t.slice(m.index, i + 1 < fns.length ? fns[i + 1].index : t.length) }))
    .filter((f) => words(f.name).some((w) => own.includes(w)) && names.test(f.body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))).map(({ name: n, args, exported }) => ({ name: n, args, exported }));
}

// The system's components a component is built with: those whose class its markup holds (HTML), or that its own file
// uses (a tag, an import). Itself and its own parts never count. names: [{ name, cls }].
export function nestedComponents({ name, cls = null, markup = '', text = '', names = [] } = {}) {
  const classes = new Set([...String(markup).matchAll(/class\s*=\s*["']([^"']*)["']/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  const out = [];
  for (const o of names) {
    if (o.name === name || (cls && o.cls === cls)) continue;
    const inMarkup = o.cls && classes.has(o.cls) && !(cls && o.cls.startsWith(cls + '-') || cls && o.cls.startsWith(cls + '__'));
    const tagName = o.name.replace(/(^|[-_/\s]+)(\w)/g, (m, s2, ch) => ch.toUpperCase());
    const inText = text && new RegExp(`<${tagName}\\b|import\\s+\\{?[^;]*\\b${tagName}\\b[^;]*from`).test(text);
    if (inMarkup || inText) out.push(o.name);
  }
  return out;
}

