// contract-a11y.mjs - what a screen reader is given by each component, for its contract: its role, how its accessible
// name is given, the states it announces, whether Tab reaches it and the keys it answers, per component and per state
// where one differs. Each fact says where it came from, and none is guessed:
//   measured  the style guide's build tried every variant in a browser (wcag-page.js facts, kept with the
//             accessibility results and written to the output folder's a11y-facts.json by the audit)
//   code      the component's own markup, read without a browser (its root, or its first control)
//   figma     its role annotation in Figma
//   authored  contract.authored.json semantics
// The browser comes first: it is what the code really gives. A source that says otherwise is kept beside it
// (differs), so a role Figma asks for and the code does not give is in the contract, not lost.
//
//   markupFacts(source, { props }) → { role, name, states, focusable, keyboard } read from the code, each a value or absent
//   measuredFacts(live)            → { role, name, states, focusable, keyboard, byState } from one component's live results
//   factsFile(themes, at)          → the a11y-facts.json the audit writes: { at, components: { name: measuredFacts } }
//   withA11yFacts(acc, ctx)        → the contract's accessibility with the facts in it
// Pure apart from readA11yFacts / writeA11yFacts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { templateOf } from './vue-markup.mjs';

export const A11Y_FACTS_FILE = 'a11y-facts.json';
export const a11yFactsPath = (ROOT) => join(ROOT, OUT_DIR, A11Y_FACTS_FILE);
export function readA11yFacts(ROOT) { try { const j = JSON.parse(readFileSync(a11yFactsPath(ROOT), 'utf8')); return j && typeof j.components === 'object' ? j : null; } catch { return null; } }
// A build that tried only some components (one asked for) keeps what an earlier build measured for the others.
export function writeA11yFacts(ROOT, file) {
  if (!file || !Object.keys(file.components ?? {}).length) return false;
  const path = a11yFactsPath(ROOT), before = readA11yFacts(ROOT)?.components ?? {};
  const components = Object.fromEntries(Object.entries({ ...before, ...file.components }).sort(([x], [y]) => x.localeCompare(y)));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ $description: 'What each component gives a screen reader, measured on every variant by the style guide\'s last build that tried it. Written by rms-design-system-engine; its contract reads it.', at: file.at ?? null, components }, null, 1) + '\n');
  return true;
}

// ── From the code ───────────────────────────────────────────────────────────────────────────────────────────────
const CONTROL_TAGS = /^(button|a|input|select|textarea|summary)$/;
const INTERACTIVE_ROLES = /^(button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|slider|spinbutton|textbox|combobox|searchbox|treeitem)$/;
const IMPLICIT = { button: 'button', summary: 'button', textarea: 'textbox', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  img: 'img', dialog: 'dialog', ul: 'list', ol: 'list', li: 'listitem', nav: 'navigation', table: 'table', form: 'form', progress: 'progressbar', meter: 'meter', hr: 'separator' };
const INPUT_ROLE = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox', button: 'button', submit: 'button', reset: 'button', image: 'button' };
// The roles a screen reader names from what the element holds (ARIA's name from content).
const FROM_CONTENT = /^(button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|heading|cell|columnheader|rowheader|treeitem|tooltip|listitem)$/;
const STATE_ATTRS = ['expanded', 'pressed', 'checked', 'selected', 'current', 'invalid', 'disabled', 'required', 'busy', 'haspopup'];
// Vue's key modifiers and the key each one is.
const VUE_KEYS = { enter: 'Enter', space: 'Space', esc: 'Escape', escape: 'Escape', tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', delete: 'Delete', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
const KEY_NAMES = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Backspace']);

// The markup a component renders: a Vue template, else the JSX its function returns (from its first lower- or
// upper-case element after a return or an arrow). → string | null
function markupOf(source) {
  const s = String(source ?? '');
  const vue = templateOf(s);
  if (vue != null) return vue;
  const m = /\breturn\s*\(?\s*(<[A-Za-z])/.exec(s) ?? /=>\s*\(?\s*(<[A-Za-z])/.exec(s);
  return m ? s.slice(m.index + m[0].length - 2) : null;
}
// The elements of some markup, in order: { tag, attrs: { name: value | true }, at, end } with the content of each
// (up to its closing tag) for the ones that need it. JSX braces and quoted values are read whole.
// Read by hand, one character at a time, so a long attribute never makes it slow.
function valueEnd(s, i) {
  const q = s[i];
  if (q === '"' || q === "'") { const j = s.indexOf(q, i + 1); return j < 0 ? s.length : j + 1; }
  if (q === '{') {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '"' || c === "'" || c === '`') { const k = s.indexOf(c, j + 1); j = k < 0 ? s.length : k; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return j + 1;
    }
    return s.length;
  }
  let j = i; while (j < s.length && !/[\s>]/.test(s[j])) j++;
  return j;
}
function elementsOf(markup) {
  const s = String(markup), out = [];
  for (let i = s.indexOf('<'); i >= 0 && i < s.length; i = s.indexOf('<', i + 1)) {
    const close = s[i + 1] === '/';
    const name = /^[A-Za-z][\w.-]*/.exec(s.slice(i + (close ? 2 : 1), i + (close ? 2 : 1) + 80))?.[0];
    if (!name) continue;
    let j = i + (close ? 2 : 1) + name.length;
    const attrs = {};
    let self = false, ok = false;
    while (j < s.length) {
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '>') { ok = true; j++; break; }
      if (s[j] === '/' && s[j + 1] === '>') { ok = true; self = true; j += 2; break; }
      if (s[j] === '{') { j = valueEnd(s, j); continue; }   // {...rest}
      const n = /^[^\s"'{}>=/]+/.exec(s.slice(j, j + 200))?.[0];
      if (!n) break;
      j += n.length;
      let k = j; while (k < s.length && /\s/.test(s[k])) k++;
      if (s[k] === '=') { k++; while (k < s.length && /\s/.test(s[k])) k++; const e = valueEnd(s, k); attrs[n] = s.slice(k, e); j = e; } else attrs[n] = true;
    }
    if (!ok) continue;
    out.push(close ? { close: true, tag: name, at: i, end: j } : { tag: name, attrs, self, at: i, end: j });
    i = j - 1;
  }
  return out;
}
// The element a JSX or TSX component returns, as written: { tag, markup } from its opening tag to its own closing one,
// or null when it returns none (a Vue file is read from its template).
export function jsxRoot(source) {
  const src = String(source ?? '');
  if (templateOf(src) != null) return null;
  const markup = markupOf(src);
  if (markup == null) return null;
  const list = elementsOf(markup), i = list.findIndex((x) => !x.close);
  if (i < 0) return null;
  const root = list[i];
  return { tag: root.tag, markup: markup.slice(root.at, root.end) + contentOf(markup, list, i) };
}
// The words some markup shows, between its tags.
function textOf(markup) {
  const s = String(markup);
  let out = '', at = 0;
  for (const el of elementsOf(s)) { out += s.slice(at, el.at) + ' '; at = el.end; }
  return out + s.slice(at);
}
// An attribute however the framework binds it (aria-label, :aria-label, v-bind:aria-label; tabIndex is tabindex):
// { value, bound } with the words when they are written as such ("button", {'button'}), the expression when bound
// to one ({label}, :aria-label="label"). undefined when it is not there.
function attr(el, name) {
  for (const [k, raw] of Object.entries(el.attrs)) {
    if (k.replace(/^(v-bind)?:/, '').toLowerCase() !== name.toLowerCase()) continue;
    if (raw === true) return { value: '', bound: false };
    const vueBound = /^(v-bind)?:/.test(k), inner = String(raw).replace(/^\{([\s\S]*)\}$/, '$1').replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
    const jsx = /^\{/.test(String(raw));
    const expr = vueBound || jsx ? inner : null;
    const lit = expr == null ? inner : /^(["'`])([^"'`]*)\1$/.test(expr) ? expr.slice(1, -1) : null;
    return lit != null ? { value: lit, bound: false } : { value: null, bound: true, expr };
  }
  return undefined;
}
const has = (el, name) => attr(el, name) !== undefined;
const words = (el, name) => attr(el, name)?.value ?? null;
// The text between an element's opening tag and its own closing one.
function contentOf(markup, list, i) {
  const el = list[i];
  if (el.self) return '';
  let depth = 0;
  for (let j = i + 1; j < list.length; j++) {
    const x = list[j];
    if (x.tag !== el.tag) continue;
    if (!x.close) { if (!x.self) depth++; continue; }
    if (depth) { depth--; continue; }
    return markup.slice(el.end, x.at);
  }
  return markup.slice(el.end);
}
// Its role: written on it, else its element's own; a role bound to an expression is not known from the code.
function roleOfEl(el) {
  const r = attr(el, 'role');
  if (r) return r.bound ? undefined : r.value.split(/\s+/)[0] || null;
  const t = el.tag.toLowerCase();
  if (t === 'a') return has(el, 'href') ? 'link' : null;
  if (t === 'input') { const ty = attr(el, 'type'); return ty?.bound ? undefined : INPUT_ROLE[String(ty?.value ?? 'text').toLowerCase()] ?? 'textbox'; }
  if (t === 'select') return 'combobox';
  return IMPLICIT[t] ?? null;
}
const tabindexOf = (el) => { const t = attr(el, 'tabindex'); return t ? (t.bound ? 'bound' : t.value.trim()) : null; };
const isControl = (el) => (CONTROL_TAGS.test(el.tag) && !(el.tag === 'a' && !has(el, 'href'))) || INTERACTIVE_ROLES.test(roleOfEl(el) ?? '') || (tabindexOf(el) != null && tabindexOf(el) !== '-1');

// What the code's markup gives a screen reader. props: the code's prop names, so a name written from {label} is said as
// prop:label. A root that is another component (<Button>) is left to the browser: nothing is read from it.
export function markupFacts(source, { props = [] } = {}) {
  const markup = markupOf(source);
  if (markup == null) return null;
  const list = elementsOf(markup);
  const opened = list.filter((x) => !x.close);
  const root = opened[0];
  if (!root || /^[A-Z]/.test(root.tag) || root.tag.includes('.')) return null;
  const idx = list.indexOf(root);
  const rootContent = contentOf(markup, list, idx);
  const ci = isControl(root) ? idx : list.findIndex((x, j) => j > idx && !x.close && x.at < root.end + rootContent.length && /^[a-z]/.test(x.tag) && isControl(x));
  const out = {};
  // Another component inside it may hold a control of its own: what Tab reaches is then left to the browser.
  const nested = list.some((x, j) => j > idx && !x.close && /^[A-Z]/.test(x.tag) && x.at < root.end + rootContent.length);
  if (ci < 0) {
    const r = roleOfEl(root);
    if (r) out.role = r;
    if (r === undefined) return null;
    if (!nested) { out.focusable = false; out.keyboard = []; }
    return Object.keys(out).length ? out : null;
  }
  const el = list[ci], tag = el.tag.toLowerCase();
  const role = roleOfEl(el);
  if (role) out.role = role;
  if (role === undefined) return null;   // a role bound to an expression: what it is and announces is the browser's to say
  // Its name: an aria-labelledby, an aria-label, a <label> it sits in or that names it, alt text, else its content
  // when its role is named from content. Words written from a prop ({label}, {{ label }}, :aria-label="label") are that
  // prop's: prop:label.
  const content = contentOf(markup, list, ci);
  const propsSet = new Set(props);
  const asProp = (expr) => { const m = /^(?:props\.|this\.)?([A-Za-z_$][\w$]*)$/.exec(String(expr ?? '').trim()); return m && propsSet.has(m[1]) && m[1] !== 'children' ? m[1] : null; };
  const propIn = (txt) => { for (const m of String(txt).matchAll(/\{\{?\s*([^{}]+?)\s*\}?\}/g)) { const p = asProp(m[1]); if (p) return p; } return null; };
  const textIn = (txt) => /[^\s<>{}]/.test(textOf(txt).replace(/\{[^{}]*\}/g, '')) || /<slot\b|\{\s*(?:props\.)?children\s*\}/.test(txt);
  const label = attr(el, 'aria-label');
  if (has(el, 'aria-labelledby')) out.name = 'labelledby';
  else if (label) { const p = label.bound ? asProp(label.expr) : null; out.name = p ? `prop:${p}` : 'aria-label'; }
  else if (tag === 'img') { const alt = attr(el, 'alt'); if (alt && (alt.bound || alt.value)) out.name = alt.bound && asProp(alt.expr) ? `prop:${asProp(alt.expr)}` : 'alt'; }
  else if (/^(input|select|textarea)$/.test(tag)) { if (/<label\b/.test(markup)) out.name = 'label'; }
  else if (FROM_CONTENT.test(role ?? '')) { const p = propIn(content); if (p) out.name = `prop:${p}`; else if (textIn(content)) out.name = 'content'; }
  // The states it announces, as its attributes write them (bound or not).
  const type = String(words(el, 'type') ?? '').toLowerCase();
  const states = STATE_ATTRS.filter((k) => has(el, `aria-${k}`)).map((k) => `aria-${k}`);
  for (const k of ['disabled', 'required']) if (has(el, k) && /^(button|input|select|textarea)$/.test(tag)) states.push(k);
  if (tag === 'input' && /^(checkbox|radio)$/.test(type)) states.push('checked');
  out.states = states;
  // Whether Tab reaches it, and the keys a native control answers by itself; a tabindex of -1 keeps it out.
  const ti = tabindexOf(el);
  const native = (tag === 'a' && has(el, 'href')) || /^(button|input|select|textarea|summary)$/.test(tag);
  out.focusable = ti === '-1' ? false : native || ti != null;
  const keys = !out.focusable ? [] : tag === 'button' || tag === 'summary' || (tag === 'input' && /^(button|submit|reset|image)$/.test(type)) ? ['Enter', 'Space']
    : tag === 'a' ? ['Enter'] : tag === 'input' && /^(checkbox|radio)$/.test(type) ? ['Space'] : tag === 'input' && type === 'range' ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] : tag === 'input' && type === 'number' ? ['ArrowUp', 'ArrowDown'] : [];
  // The keys its own handlers answer: Vue's key modifiers (@keydown.enter), a key a handler compares (e.key === 'Escape').
  for (const m of String(source).matchAll(/@key(?:down|up|press)((?:\.[\w-]+)+)/g)) for (const mod of m[1].split('.').filter(Boolean)) { const k = VUE_KEYS[mod.toLowerCase()]; if (k && !keys.includes(k)) keys.push(k); }
  for (const m of String(source).matchAll(/\b(?:key|code)\s*===?\s*['"]([A-Za-z]+)['"]|\bcase\s+['"]([A-Za-z]+)['"]\s*:/g)) { const k = m[1] ?? m[2]; const kk = k === 'Esc' ? 'Escape' : k === 'Spacebar' ? 'Space' : k; if ((KEY_NAMES.has(kk) || kk === 'Space') && !keys.includes(kk)) keys.push(kk); }
  if (/\b(?:key|code)\s*===?\s*['"] ['"]/.test(String(source)) && !keys.includes('Space')) keys.push('Space');
  out.keyboard = keys;
  return out;
}

// ── From the browser ────────────────────────────────────────────────────────────────────────────────────────────
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (xs) => [...new Set(xs ?? [])].sort();
// One variant's facts as the contract says them.
const shape = (f) => ({ role: f.role ?? null, name: f.name ?? null, states: sorted(f.states), focusable: !!f.focusable, keyboard: [...new Set(f.keys ?? [])] });
// One component's live results (the page's live.facts: [{ f, when: [variant settings] }]) → its facts, the ones most of
// its variants hold, and each state that differs with what tells it apart (the settings all its variants share and the
// others do not). → { role, name, states, focusable, keyboard, byState } | null
export function measuredFacts(live) {
  const groups = (live?.facts ?? []).filter((g) => g && g.f && Array.isArray(g.when) && g.when.length).map((g) => ({ f: shape(g.f), when: g.when }));
  if (!groups.length) return null;
  const merged = [];
  for (const g of groups) { const m = merged.find((x) => same(x.f, g.f)); if (m) m.when.push(...g.when); else merged.push({ f: g.f, when: [...g.when] }); }
  const base = merged.reduce((a, b) => (b.when.length > a.when.length ? b : a));
  const all = merged.flatMap((g) => g.when);
  const out = { ...base.f };
  const byState = [];
  for (const g of merged) {
    if (g === base) continue;
    // The settings every one of its variants has, and not every variant of the component.
    const when = {};
    for (const [k, v] of Object.entries(g.when[0] ?? {})) if (g.when.every((w) => same(w?.[k], v)) && !all.every((w) => same(w?.[k], v))) when[k] = v;
    const diff = {};
    for (const k of Object.keys(g.f)) if (!same(g.f[k], base.f[k])) diff[k] = g.f[k];
    byState.push({ when: Object.keys(when).length ? when : g.when[0], ...diff });
  }
  if (byState.length) out.byState = byState;
  return out;
}
// The file the audit writes from the build's results: the default theme's (a theme changes colours, not these facts).
export function factsFile(themes = {}, at = null) {
  const set = themes?.default ?? Object.values(themes ?? {})[0] ?? {};
  const components = {};
  // own: the control read is the component itself in some variant, not one it holds (a modal's first button), as the
  // page said it (wcag-page.js facts); absent from results saved before it was said. The design check trusts only it.
  for (const [name, r] of Object.entries(set)) {
    const f = measuredFacts(r?.live);
    if (!f) continue;
    const own = (r.live.facts ?? []).map((g) => g?.f?.own).filter((x) => typeof x === 'boolean');
    components[name] = { ...f, ...(own.length ? { own: own.some(Boolean) } : {}), ...(at ? { at: String(at).slice(0, 10) } : {}) };
  }
  return { at, components };
}

// ── Into the contract ───────────────────────────────────────────────────────────────────────────────────────────
// acc: the contract's accessibility so far ({ element, role, aria, keyboard }, each { value, from }); code: markupFacts;
// measured: measuredFacts; at: when it was measured; figmaRole: its Figma role annotation. The browser first, then authored, Figma, the code; for the name,
// the code's prop:x refines the browser's "content". → the new accessibility, or null when nothing is known.
export function withA11yFacts(acc, { code = null, measured = null, at = null, figmaRole = null } = {}) {
  const out = { ...(acc ?? {}) };
  const pick = (key, candidates) => {
    const known = candidates.filter((c) => c.value != null);
    if (!known.length) { delete out[key]; return; }
    const top = known[0];
    const differs = known.slice(1).filter((c, i, all) => !same(norm(key, c.value), norm(key, top.value)) && all.findIndex((d) => d.from === c.from && same(d.value, c.value)) === i);
    out[key] = { value: top.value, from: top.from, ...(differs.length ? { differs: differs.map((c) => ({ value: c.value, from: c.from })) } : {}) };
  };
  const was = (k) => (acc?.[k] ? [{ value: acc[k].value, from: acc[k].from }] : []);
  const m = measured ?? {}, c = code ?? {};
  // Role: authored stays first, as the team decided it; then what the browser has, Figma's annotation, the markup.
  // Figma's annotation is kept beside the role even when the team's word or the browser goes first.
  const roleWas = [...was('role'), ...(figmaRole && acc?.role?.from !== 'figma' ? [{ value: figmaRole, from: 'figma' }] : [])];
  pick('role', [...roleWas.filter((x) => x.from === 'authored'), ...(m.role ? [{ value: m.role, from: 'measured' }] : []), ...roleWas.filter((x) => x.from === 'figma'), ...(c.role ? [{ value: c.role, from: 'code' }] : []), ...roleWas.filter((x) => x.from === 'code' && x.value !== c.role)]);
  // Its name: the browser's source, made exact by the code's (content written from a prop is prop:<x>).
  if (m.name && c.name && /^(content|aria-label|alt)$/.test(m.name) && /^prop:/.test(c.name)) out.name = { value: c.name, from: 'code', measured: m.name };
  else pick('name', [...(m.name ? [{ value: m.name, from: 'measured' }] : []), ...(c.name ? [{ value: c.name, from: 'code' }] : [])]);
  pick('states', [...(measured ? [{ value: m.states ?? [], from: 'measured' }] : []), ...(c.states ? [{ value: c.states, from: 'code' }] : [])]);
  pick('focusable', [...(measured ? [{ value: !!m.focusable, from: 'measured' }] : []), ...(c.focusable != null ? [{ value: c.focusable, from: 'code' }] : [])]);
  pick('keyboard', [...(measured ? [{ value: m.keyboard ?? [], from: 'measured' }] : []), ...(c.keyboard ? [{ value: c.keyboard, from: 'code' }] : was('keyboard'))]);
  if (m.byState?.length) out.byState = m.byState.map((s) => ({ ...s, from: 'measured' })); else delete out.byState;
  const when = measured?.at ?? at;
  if (measured && when) out.measuredAt = String(when).slice(0, 10); else delete out.measuredAt;
  return Object.keys(out).length ? out : null;
}
// Two values compared as what they say: a role's case, a list's order.
function norm(key, v) { if (Array.isArray(v)) return sorted(v.map(String)); return key === 'role' ? String(v).toLowerCase().replace(/[\s_-]+/g, '') : v; }

// The schema of a contract's accessibility.
const str = { type: 'string' }, strs = { type: 'array', items: str };
const FROM = { enum: ['measured', 'code', 'figma', 'authored'] };
const sourced = (value, extra = {}) => ({ type: 'object', required: ['value', 'from'], additionalProperties: false,
  properties: { value, from: FROM, differs: { type: 'array', description: 'What another source says, where it says otherwise.', items: { type: 'object', required: ['value', 'from'], properties: { value: {}, from: FROM } } }, ...extra } });
export const ACCESSIBILITY_SCHEMA = {
  type: 'object', additionalProperties: false,
  description: 'What a screen reader is given: its element, role, how its name is given, the states it announces, whether Tab reaches it and the keys it answers. Each fact says where it came from: measured in a browser, the code\'s markup, a Figma annotation, or contract.authored.json.',
  properties: {
    element: sourced(str), role: sourced(str), aria: sourced(strs),
    name: sourced({ type: 'string', description: 'How its accessible name is given: content (what it holds), prop:<x> (the words of that prop, as its content or its aria-label), aria-label, labelledby, label, alt or title.' }, { measured: { type: 'string', description: 'What the browser measured, where the code says it more exactly.' } }),
    states: sourced(strs), focusable: sourced({ type: 'boolean' }), keyboard: sourced(strs),
    byState: { type: 'array', description: 'Each state whose facts differ from the rest, measured in a browser: the settings that tell it apart (when) and only what differs.',
      items: { type: 'object', required: ['when', 'from'], properties: { when: { type: 'object' }, from: { const: 'measured' }, role: { type: ['string', 'null'] }, name: { type: ['string', 'null'] }, states: strs, focusable: { type: 'boolean' }, keyboard: strs } } },
    measuredAt: { type: 'string', description: 'The day the measured facts were measured (the style guide\'s last build that tried it).' },
  },
};
