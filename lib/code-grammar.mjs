// code-grammar.mjs - how this system builds a component in the code: its construction grammar, read the way
// construction-grammar.mjs reads Figma's, and each component's anatomy read as deeply as Figma's is.
//
// The Figma side says how the system names a component, its properties and options, how it lays out and which variables
// it binds. Nothing said the same of the code, so an agent asked to write a component in code had no way to write it
// the way the system already does, and a difference between the two sides could not be named. This reads the system's
// own component files and says, as rules of the same shape (id, area, says, follows, of, toFix, status):
//   • the framework and the file layout: what a component file is written in, where it sits, how it is named;
//   • the props: how each kind is named, the word a yes/no begins or ends with, how an option is written, whether each
//     carries a comment, and whether each Figma property has its prop (the Code Connect file);
//   • the tokens: whether a component uses custom properties made for it or the shared ones (the team says which);
//   • how a state is written (a pseudo-class, a class, a data attribute, an ARIA attribute), how a part's class and a
//     variant's class are named;
//   • its look: a shadow, a border, its corners, its opacity and its text, each with a token or written by hand.
// Each rule is what most components already do, with how many follow it and which do not, and it is a rule only once
// every component follows it, as on the Figma side: there are no exceptions. The team's answers are the same ones,
// kept in the authored contract's construction (every id here begins with "code-", so the two never meet).
//
// Beside the rules, each component's anatomy (anatomyOf), the depth the Figma capture reads: each state and how it is
// written, each shadow with its attributes and how it is turned off, borders, the radius of each corner and whether the
// corners share one custom property, opacity, its parts with their element and class, in order and whether each is
// optional, which prop changes which declaration on which part, how it wraps (flex-wrap, the row gap against the column
// gap, the minimum width), whether it hugs or fills, the text each part sets; and what only the code has: the custom
// properties it declares as its own API, those it reads from the theme, and therefore what is safe to override.
//
//   codeGrammarOf({ components }, { answers }) → { code: { components, rules, vocabulary, anatomy }, questions }
//     components: [{ name, file, text, styles: [{ file, text }], root: 'button', api, figmaProps }] (codeInputs reads it)
//   anatomyOf({ file, text, styles, root, props }) → one component's anatomy
//   codeInputs(ROOT, cfg, { figmaProps }) → the components, read from the code capture (or the files, without one)
//   codeGrammarLines(grammar) → the code's rules in a few lines, for llms.txt and --query
//
// The engine changes no code: a rule's components to fix are a reading, handed back as every finding is.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { judge, dominantCase, affix, caseFits, wordsOf, top, MIN_SEEN } from './construction-grammar.mjs';
import { walkCss, styleBlocksOf } from './css-source.mjs';
import { textStyleKey } from './text-styles.mjs';

const low = (s) => String(s ?? '').toLowerCase();
const strip = (k) => String(k).split('#')[0].trim();
const uniq = (xs) => [...new Set(xs)];

// ── Reading one component ─────────────────────────────────────────────────────

// The words a state is called by, and what each pseudo-class, attribute and class word means.
const STATE_WORDS = new Set(['hover', 'focus', 'active', 'pressed', 'disabled', 'selected', 'checked', 'loading', 'error', 'invalid', 'open', 'expanded', 'collapsed', 'readonly', 'required', 'indeterminate', 'current', 'busy', 'empty', 'filled']);
const PSEUDO_STATE = { hover: 'hover', focus: 'focus', 'focus-visible': 'focus', 'focus-within': 'focus', active: 'active', disabled: 'disabled', checked: 'checked', indeterminate: 'indeterminate', invalid: 'error', 'user-invalid': 'error', 'read-only': 'readonly', required: 'required', 'placeholder-shown': 'empty', empty: 'empty' };
const ARIA_STATE = { disabled: 'disabled', selected: 'selected', checked: 'checked', pressed: 'pressed', expanded: 'expanded', invalid: 'error', busy: 'loading', current: 'current', readonly: 'readonly', required: 'required' };
const stateWord = (w) => { const x = low(w).replace(/^(is|has)-/, ''); return x === 'invalid' ? 'error' : x === 'focused' ? 'focus' : x === 'hovered' ? 'hover' : x === 'opened' ? 'open' : STATE_WORDS.has(x) ? x : null; };

// The template a component renders: a Vue file's <template>, a Svelte file without its script and style, a React file whole.
function markupOf(file, text) {
  const t = String(text ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
  const ext = low(extname(file));
  if (ext === '.vue') { const a = t.search(/<template\b[^>]*>/), b = t.lastIndexOf('</template>'); return a < 0 || b < a ? '' : t.slice(t.indexOf('>', a) + 1, b); }
  if (ext === '.svelte') return t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  return t;
}
// The string literals of a bound class: ['a', { b: x }, 'c'] → a c; an object's keys with what each is bound to.
function classBindings(expr) {
  const e = String(expr ?? '');
  const always = [...e.replace(/\{[^{}]*\}/g, ' ').matchAll(/['"`]([^'"`$]*)['"`]/g)].flatMap((m) => m[1].split(/\s+/)).filter((w) => /^-?[A-Za-z_][\w-]*$/.test(w));
  const when = [];
  for (const o of e.matchAll(/\{([^{}]*)\}/g)) for (const m of o[1].matchAll(/['"]?(-?[A-Za-z_][\w-]*)['"]?\s*:\s*([^,]+)/g)) when.push({ cls: m[1], expr: m[2].trim() });
  // A class built from a prop: `button--${size}` (a family of classes, one an option).
  const built = [...e.matchAll(/`([^`]*?)\$\{\s*([A-Za-z_$][\w$.]*)[^}]*\}([^`]*)`/g)].map((m) => ({ prefix: m[1].trim().split(/\s+/).pop(), expr: m[2], suffix: m[3] }));
  return { always, when, built };
}
// Each element of the markup with its tag, its classes (always there), the classes a condition puts on it, whether it is
// shown only on a condition, and its place in the order. Another component (a capitalised or hyphenated tag) is its own.
function elementsOf(file, text, styled = []) {
  const styledSet = new Set(styled);
  const m = markupOf(file, text), out = [];
  for (const x of m.matchAll(/<([A-Za-z][\w.-]*)((?:\s+(?:[^>"'`{}]|"[^"]*"|'[^']*'|`[^`]*`|\{(?:[^{}]|\{[^{}]*\})*\})*)?)\s*\/?>/g)) {
    const tag = x[1], attrs = x[2] ?? '';
    if (/^(template|slot|script|style)$/i.test(tag)) continue;
    const own = [...attrs.matchAll(/(?:^|\s)(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].flatMap((a) => (a[1] ?? a[2]).split(/\s+/)).filter(Boolean);
    const bound = [...attrs.matchAll(/(?:^|\s)(?::class|v-bind:class|className|class)\s*=\s*(?:"([^"]*)"|\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\})/g)].map((a) => a[1] ?? a[2]).filter((v) => v != null && /[{`'"[]/.test(v));
    const b = bound.map(classBindings);
    const before = m.slice(Math.max(0, x.index - 40), x.index);
    const optional = /(?:^|\s)(v-if|v-else-if|v-else|v-show|\{#if)\b/.test(attrs) || /(&&|\?)\s*\(?\s*$/.test(before) || /\{#if[^}]*\}\s*$/.test(before);
    // A tag the component's own styled template names is not another component: it is this one's element, and the
    // name the styles are written under is the class it carries.
    const isStyled = styledSet.has(tag);
    out.push({ tag, classes: uniq([...(isStyled ? [tag] : []), ...own, ...b.flatMap((y) => y.always)]), when: b.flatMap((y) => y.when), built: b.flatMap((y) => y.built), optional, component: !isStyled && /^[A-Z]|-/.test(tag) && !/^(svg|path|g)$/i.test(tag) });
  }
  return out;
}

// One selector cut into its compounds, each with its classes, attributes and pseudo-classes.
function compounds(selector) {
  const parts = String(selector).replace(/::?(v-)?deep\(([^)]*)\)/g, ' $2').replace(/\[data-v-[\w-]+\]/g, '').split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return parts.map((c) => ({
    text: c,
    classes: [...c.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]),
    attrs: [...c.matchAll(/\[([\w-]+)(?:\s*[~|^$*]?=\s*["']?([^"'\]]*)["']?)?\]/g)].map((m) => ({ name: m[1], value: m[2] ?? null })),
    pseudos: [...c.matchAll(/(?<!:):([\w-]+)(\([^)]*\))?/g)].map((m) => m[1]),
    element: /::(before|after|placeholder|marker)/.exec(c)?.[1] ?? null,
  }));
}
// The states one compound puts on an element, each with how it is written.
function statesIn(c, root) {
  const out = [];
  for (const p of c.pseudos) if (PSEUDO_STATE[p]) out.push({ state: PSEUDO_STATE[p], how: 'pseudo-class', example: `:${p}` });
  for (const a of c.attrs) {
    if (/^aria-/.test(a.name)) { const s = ARIA_STATE[a.name.slice(5)]; if (s && a.value !== 'false') out.push({ state: s, how: 'aria attribute', example: `[${a.name}${a.value ? `="${a.value}"` : ''}]` }); }
    else if (/^data-/.test(a.name)) { const s = stateWord(a.name.slice(5)) ?? (a.value ? stateWord(a.value) : null); if (s) out.push({ state: s, how: 'data attribute', example: `[${a.name}${a.value ? `="${a.value}"` : ''}]` }); }
    else { const s = stateWord(a.name); if (s) out.push({ state: s, how: 'attribute', example: `[${a.name}]` }); }
  }
  for (const k of c.classes) {
    if (k === root) continue;
    const word = k.startsWith(`${root}--`) ? k.slice(root.length + 2) : k.startsWith(`${root}-`) ? k.slice(root.length + 1) : k;
    const s = stateWord(word);
    if (s) out.push({ state: s, how: 'class', example: `.${k}` });
  }
  return out;
}
// How a class beside the root's own is named: block__part, block-part, or a name of its own.
function classWay(cls, root, sep) {
  if (cls.startsWith(`${root}${sep}`)) return `<root>${sep}…`;
  return null;
}
// A shadow's layers, each with the attributes it writes (x, y, blur, spread, colour, inset).
export function shadowLayers(value) {
  const v = String(value ?? '').trim();
  if (!v || /^(none|unset|initial|inherit)$/i.test(v)) return [];
  const layers = [];
  let depth = 0, from = 0;
  for (let i = 0; i <= v.length; i++) {
    const c = v[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if ((c === ',' && !depth) || i === v.length) { layers.push(v.slice(from, i).trim()); from = i + 1; }
  }
  return layers.filter(Boolean).map((l) => {
    const words = l.match(/(?:[\w-]+\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s]+)/g) ?? [];
    const inset = words.some((w) => low(w) === 'inset');
    const lengths = words.filter((w) => /^-?[\d.]+(px|rem|em|%)?$/.test(w) || /^(calc|var)\(/.test(w) && !/color|colour|shadow-colou?r/.test(w) && words.length > 2);
    const colour = words.find((w) => !lengths.includes(w) && low(w) !== 'inset') ?? null;
    return { inset, lengths: lengths.length, colour, token: tokened(l), attributes: lengths.length + (colour ? 1 : 0) + (inset ? 1 : 0) };
  });
}
const varsIn = (v) => [...String(v ?? '').matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
// A value written with a token: a custom property it names, through var() or a function of the token's name
// (transformOpacity(--x)); a word every value may take (inherit) is no value written by hand either.
const tokened = (v) => /(^|[\s(,])--[\w-]+/.test(String(v ?? ''));
// A Sass variable a value names ($space-m), and the ones a stylesheet declares. A system that keeps its values in Sass
// writes `padding: $space-m`, which names no custom property and is not therefore written by hand: it is read through
// its declaration. One this reading cannot resolve is not read at all, and a rule leaves it out rather than fail it:
// a reading problem is never reported as a value written by hand.
const sassIn = (v) => [...String(v ?? '').matchAll(/\$([\w-]+)/g)].map((m) => m[1]);
export function sassVars(styles = []) {
  const out = new Map();
  for (const s of styles) for (const m of String(s.text ?? '').matchAll(/(^|[\s;{])\$([\w-]+)\s*:\s*([^;}]+)/g)) out.set(m[2], m[3].trim());
  return out;
}
// A value as it reads once its Sass variables are put in, following one through another. → { value, read }
export function resolveSass(value, vars, depth = 0, seen = new Set()) {
  const v = String(value ?? '');
  const names = sassIn(v);
  if (!names.length || depth > 8) return { value: v, read: true };
  let out = v, read = true;
  for (const n of names) {
    if (seen.has(n) || !vars.has(n)) { read = false; continue; }
    const inner = resolveSass(vars.get(n), vars, depth + 1, new Set([...seen, n]));
    if (!inner.read) read = false;
    out = out.replace(new RegExp(`\\$${n}(?![\\w-])`, 'g'), inner.value);
  }
  return { value: out, read };
}
const CORNERS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'border-start-start-radius', 'border-start-end-radius', 'border-end-end-radius', 'border-end-start-radius'];
const TEXT = /^(font|font-size|font-weight|line-height|letter-spacing|font-family)$/;
// What a component spaces itself with: the padding, the gaps between its parts and the margins it sets. A design
// system names every one of these, so each is read against the tokens the system has, as a colour or a radius is.
const SPACE = /^(padding|padding-(top|right|bottom|left|block|inline)(-(start|end))?|gap|row-gap|column-gap|margin|margin-(top|right|bottom|left|block|inline)(-(start|end))?)$/;
// A system's text styles reach the code as a mixin, a placeholder or a class rather than a declaration: `@include
// S-Strong`, `@extend %body-m`, `class="text-body-m"`. Figma names a style with slashes ("s/strong"), the code with a
// hyphen or nothing, so a name is tried both ways against the styles the capture holds (text-styles.mjs).
export function namesTextStyle(typo, name) {
  const n = String(name ?? '').trim();
  if (!n || !typo) return null;
  for (const k of [n, n.replace(/[-_]/g, '/'), n.replace(/^(text|type|font|typography)[-_/]/i, '').replace(/[-_]/g, '/')]) {
    const hit = textStyleKey(typo, k);
    if (hit) return hit;
  }
  return null;
}
// Every `@include X` and `@extend %X` of a stylesheet, with the line it sits on, so each can be read under the rule it
// is in (walkCss keeps declarations, and these are neither declarations nor rules of their own).
export function stylePulls(text, file = '') {
  const out = [];
  const t = String(text ?? '');
  const lineOf = (i) => { let n = 1; for (let j = 0; j < i && j < t.length; j++) if (t.charCodeAt(j) === 10) n++; return n; };
  for (const m of t.matchAll(/@(include|extend)\s+%?\.?([\w-]+)/g)) out.push({ how: m[1], name: m[2], file, line: lineOf(m.index) });
  return out;
}
const SIZING_FILL = (d) => (d.prop === 'width' && /^100%$/.test(d.value)) || (d.prop === 'flex' && /^1(\s|$)/.test(d.value)) || (d.prop === 'flex-grow' && d.value === '1') || (d.prop === 'align-self' && d.value === 'stretch');
const SIZING_HUG = (d) => (d.prop === 'display' && /^inline-(flex|block|grid)$/.test(d.value)) || (/^(width|inline-size)$/.test(d.prop) && /^(fit-content|max-content|auto)$/.test(d.value));

// One component's anatomy, from its markup and its own styles. root: the class its first element carries (no dot).
// props: the names of its props, so a class a condition puts on is said with the prop that changes it.
export function anatomyOf({ file = '', text = '', styles = [], root = null, props = [], textStyles = null } = {}) {
  const styled = styles.flatMap((s) => s.roots ?? []);
  const els = elementsOf(file, text, styled);
  root = root ?? els.find((e) => e.classes.length)?.classes[0] ?? null;
  if (!root) return null;
  const all = styles.flatMap((s) => walkCss(s.text, s.file));
  const rules = all.filter((r) => r.selectors.some((x) => x.includes(`.${root}`) || els.some((e) => e.classes.some((k) => k !== root && x.includes(`.${k}`)))));
  const where = (r, d) => `${r.file}:${d?.line ?? r.line}`;
  // What the stylesheet's Sass variables hold, so a value written with them is read rather than taken for one by hand.
  const sass = sassVars(styles);
  const readValue = (v) => resolveSass(v, sass);
  const propNames = new Set(props);
  const states = [], shadows = [], borders = [], opacity = [], text_ = [], corners = [], spacing = [], changes = [];
  const declared = new Map(), used = new Map();
  let wrap = null, rowGap = null, columnGap = null, minWidth = null, sizing = null;
  const partOf = (sel) => { const cs = compounds(sel), last = cs.at(-1); const k = last?.classes.find((x) => x !== root) ?? null; return cs.length > 1 && k ? k : last?.classes.includes(root) ? null : k; };
  for (const r of rules) for (const sel of r.selectors) {
    const cs = compounds(sel);
    const at = cs.findIndex((c) => c.classes.includes(root));
    const part = partOf(sel);
    const onRoot = at >= 0 && at === cs.length - 1;
    for (const c of cs) for (const s of statesIn(c, root)) states.push({ ...s, part: c.classes.includes(root) ? null : part, at: where(r) });
    for (const d of r.decls) {
      // What the value really holds, its Sass variables put in; one that cannot be resolved is marked unread, and each
      // rule leaves it out rather than count it as written by hand.
      const { value: val, read } = readValue(d.value);
      for (const v of varsIn(val)) used.set(v, used.get(v) ?? where(r, d));
      if (/^--/.test(d.prop) && (onRoot || cs.length === 1)) declared.set(d.prop, where(r, d));
      if (d.prop === 'box-shadow') shadows.push({ selector: sel, part, value: d.value, read, off: /^(none|unset|initial)$/i.test(val), layers: shadowLayers(val), at: where(r, d) });
      if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(width|style|color))?$/.test(d.prop) && !/radius/.test(d.prop)) borders.push({ selector: sel, part, prop: d.prop, value: d.value, read, token: tokened(val) || /^(none|0|inherit|currentcolor|transparent)$/i.test(val), at: where(r, d) });
      if (d.prop === 'opacity') opacity.push({ selector: sel, part, value: d.value, read, token: tokened(val), at: where(r, d) });
      if (TEXT.test(d.prop)) text_.push({ selector: sel, part, prop: d.prop, value: d.value, read, token: tokened(val) || /^(inherit|initial)$/.test(val), at: where(r, d) });
      if (SPACE.test(d.prop)) spacing.push({ selector: sel, part, prop: d.prop, value: d.value, read, token: tokened(val) || /^(0|auto|inherit|initial)$/.test(val) || val.split(/\s+/).every((x) => /^0(px|rem|em|%)?$/.test(x)), at: where(r, d) });
      if (d.prop === 'border-radius' || CORNERS.includes(d.prop)) corners.push({ selector: sel, part, prop: d.prop, value: d.value, read, resolved: val, at: where(r, d) });
      if (onRoot && !cs[at].pseudos.length && cs[at].classes.length === 1) {
        if (d.prop === 'flex-wrap' || (d.prop === 'flex-flow' && /wrap/.test(d.value))) wrap = /nowrap/.test(d.value) ? 'nowrap' : /wrap/.test(d.value) ? 'wrap' : wrap;
        if (d.prop === 'gap') { const g = d.value.split(/\s+(?![^(]*\))/); rowGap = g[0]; columnGap = g[1] ?? g[0]; }
        if (d.prop === 'row-gap') rowGap = d.value;
        if (d.prop === 'column-gap') columnGap = d.value;
        if (d.prop === 'min-width' || d.prop === 'min-inline-size') minWidth = d.value;
        if (SIZING_FILL(d)) sizing = 'fill';
        else if (SIZING_HUG(d) && sizing !== 'fill') sizing = 'hug';
      }
    }
  }
  // The text styles this component pulls in rather than declares: a mixin or a placeholder inside one of its rules
  // (`@include S-Strong`), read under the innermost rule it sits in, and a class on an element that names one
  // (`class="text-body-m"`). Each is the system's text style, so a part that takes one sets its text with the system.
  if (textStyles) {
    const byFile = new Map();
    for (const r of all) { const l = byFile.get(r.file) ?? []; l.push(r); byFile.set(r.file, l); }
    for (const s of styles) for (const p of stylePulls(s.text, s.file)) {
      const style = namesTextStyle(textStyles, p.name);
      if (!style) continue;
      const inside = (byFile.get(s.file) ?? []).filter((r) => r.line <= p.line).sort((a, b) => b.line - a.line)[0];
      const sel = inside?.selectors?.[0];
      if (!sel || !rules.includes(inside)) continue;
      text_.push({ selector: sel, part: partOf(sel), prop: `@${p.how}`, value: p.name, read: true, token: true, style, at: `${s.file}:${p.line}` });
    }
    for (const e of els) for (const k of e.classes) {
      const style = namesTextStyle(textStyles, k);
      if (style) text_.push({ selector: `.${k}`, part: e.classes.includes(root) ? null : e.classes.find((x) => x !== root) ?? null, prop: 'class', value: k, read: true, token: true, style, at: file });
    }
  }
  // The parts: each element below the root with a class of its own, in the order the markup writes them.
  const rootEl = els.findIndex((e) => e.classes.includes(root));
  const parts = els.slice(rootEl + 1).filter((e) => e.classes.some((k) => k !== root) || e.component).map((e, i) => ({
    class: e.classes.find((k) => k !== root) ?? null, element: e.tag, ...(e.component ? { component: true } : {}), optional: e.optional, order: i + 1,
  }));
  // Which prop changes which declaration on which part: a class a prop puts on (or builds), and what that class sets.
  const condOf = (expr) => [...String(expr).matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]).filter((w) => propNames.has(w));
  for (const e of els) {
    const onPart = e.classes.find((k) => k !== root) ?? (e.classes.includes(root) ? null : undefined);
    if (onPart === undefined && !e.classes.includes(root)) continue;
    const say = (prop, cls, match) => {
      const sets = rules.filter((r) => r.selectors.some((x) => match(x))).flatMap((r) => r.decls.map((d) => ({ prop: d.prop, at: where(r, d) })));
      if (sets.length) changes.push({ prop, class: cls, part: e.classes.includes(root) ? null : onPart, declarations: uniq(sets.map((x) => x.prop)), at: sets[0].at });
    };
    for (const w of e.when) for (const p of condOf(w.expr)) say(p, `.${w.cls}`, (x) => new RegExp(`\\.${w.cls.replace(/[-]/g, '\\-')}(?![\\w-])`).test(x));
    for (const b of e.built) { const p = String(b.expr).split('.').pop(); if (propNames.has(p) && b.prefix) say(p, `.${b.prefix}*`, (x) => x.includes(`.${b.prefix}`) && !new RegExp(`\\.${b.prefix.replace(/-/g, '\\-')}(?![\\w-])`).test(x)); }
  }
  // Its corners: one custom property for every corner, values that differ by corner, or written by hand.
  const own = corners.filter((c) => !c.part);
  const res = (c) => c.resolved ?? c.value;
  const cornerVars = uniq(own.flatMap((c) => varsIn(res(c))));
  const perCorner = own.some((c) => CORNERS.includes(c.prop) || (c.prop === 'border-radius' && res(c).split(/\s+(?![^(]*\))/).filter((x) => x !== '/').length > 1));
  const radius = own.length ? { shared: cornerVars.length === 1 && !perCorner && own.every((c) => varsIn(res(c)).length === 1 || /^(0|inherit)$/.test(res(c))), perCorner, tokens: cornerVars, values: uniq(own.map((c) => c.value)), byHand: uniq(own.filter((c) => c.read && !tokened(res(c)) && !/^(0|inherit|50%|100%)$/.test(res(c))).map((c) => c.value)), at: own[0].at } : null;
  const exposes = [...declared.keys()].filter((v) => used.has(v));
  const inherits = [...used.keys()].filter((v) => !declared.has(v));
  // Its part classes and its variant classes, and how they are named.
  const allClasses = uniq(els.flatMap((e) => [...e.classes, ...e.when.map((w) => w.cls), ...e.built.map((b) => b.prefix + '*')]));
  const partWays = parts.map((p) => p.class).filter(Boolean).map((k) => classWay(k, root, '__') ?? (k.startsWith(`${root}--`) ? null : classWay(k, root, '-')) ?? 'own name');
  const modifiers = allClasses.filter((k) => k !== root && (k.startsWith(`${root}--`) || els.some((e) => e.when.some((w) => w.cls === k)) || k.endsWith('*')) && !parts.some((p) => p.class === k));
  const variantClasses = modifiers.filter((k) => !stateWord(k.replace(/^.*?(--|-)(?=[^-]*$)/, '').replace(/^(is|has)-/, ''))).map((k) => ({ class: k, way: k.startsWith(`${root}--`) ? '<root>--…' : /^(is|has)-/.test(k) ? 'is-…' : k.startsWith(`${root}-`) ? '<root>-…' : 'own name' }));
  const modWays = variantClasses.map((v) => v.way);
  return {
    root: `.${root}`, states: dedupe(states, (s) => `${s.state}|${s.how}|${s.part ?? ''}`), parts, changes,
    shadows, borders, opacity, text: text_, spacing, radius, wrap: wrap || rowGap || columnGap || minWidth ? { wrap, rowGap, columnGap, minWidth } : null,
    sizing, exposes, inherits, overridable: exposes, partWays, modWays, modifiers, variantClasses,
  };
}
const dedupe = (xs, key) => { const seen = new Set(); return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

// ── The rules ─────────────────────────────────────────────────────────────────

const SYNTAX = { vue: 'Vue single-file component (.vue)', jsx: 'React component (.jsx or .tsx)', svelte: 'Svelte component (.svelte)', 'web component': 'web component', ts: 'TypeScript module', js: 'JavaScript module' };
const syntaxOf = (c) => {
  const e = low(extname(c.file ?? ''));
  return e === '.vue' ? 'vue' : e === '.svelte' ? 'svelte' : e === '.jsx' || e === '.tsx' ? 'jsx' : c.api?.syntax ?? (e === '.ts' ? 'ts' : e === '.js' || e === '.mjs' ? 'js' : null);
};
// The kind of a prop, as the rules group them: a yes/no, a choice of options, a text, a number, something else.
function kindOf(p = {}) {
  const t = low(p.type);
  if (/^bool/.test(t) || typeof p.default === 'boolean') return 'boolean';
  if ((p.options ?? []).length > 1 || /\|/.test(t)) return 'option';
  if (/^(string|text)/.test(t)) return 'text';
  if (/^(number|int)/.test(t)) return 'number';
  return null;
}
const OPTION_LITERALS = (p) => [...(p.options ?? []), ...[...String(p.type ?? '').matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])];

export function codeGrammarOf({ components = [], textStyles = null } = {}, { answers = {} } = {}) {
  const list = components.filter((c) => c && c.name && c.file);
  if (!list.length) return { code: { components: 0, rules: [], vocabulary: {}, anatomy: {} }, questions: [] };
  const rules = [], add = (r) => { if (r) rules.push(r); };
  const opts = { answers };
  const anatomy = {}, notRead = [];
  for (const c of list) {
    const a = anatomyOf({ file: c.file, text: c.text, styles: c.styles ?? [], root: c.root, props: Object.keys(c.api?.props ?? {}), textStyles });
    if (a) anatomy[c.name] = a;
    // A component with nothing of its own to read is said, never dropped quietly: one that renders another component
    // and no element of its own has no anatomy, and a reading that leaves it out silently reads as a clean component.
    else notRead.push({ component: c.name, file: c.file, why: /<[a-z][\w-]*\s|<[a-z][\w-]*>/.test(String(c.text)) ? 'no class of its own on any element' : 'it renders another component and no element of its own' });
  }

  // The framework and the file layout.
  const syntaxes = list.map((c) => ({ component: c.name, s: syntaxOf(c) })).filter((x) => x.s);
  const sx = top(syntaxes.map((x) => x.s))[0];
  if (sx) add(judge('code-framework', 'architecture', `A component is written as a ${SYNTAX[sx] ?? sx}`, syntaxes.map((x) => ({ component: x.component, value: x.s, fits: x.s === sx })), opts));
  const stems = list.map((c) => ({ component: c.name, value: basename(c.file).replace(/\.[^.]+$/, '') })).filter((x) => !/^index$/i.test(x.value));
  const fileCase = dominantCase(stems.map((x) => x.value));
  add(judge('code-file-name-case', 'naming', `A component's file is named in ${fileCase}`, stems.map((x) => ({ ...x, fits: caseFits(x.value, fileCase) })), opts));
  const dirs = list.map((c) => ({ component: c.name, file: c.file, d1: dirname(c.file), d2: dirname(dirname(c.file)) }));
  const [d1, n1] = top(dirs.map((x) => x.d1)), [d2] = top(dirs.map((x) => x.d2));
  const flat = n1 >= dirs.length / 2;
  add(judge('code-file-folder', 'architecture', flat ? `A component's file sits in ${d1}/` : `A component's file sits in a folder of its family under ${d2}/ (${d2}/<family>/)`,
    dirs.map((x) => ({ component: x.component, value: x.file, fits: flat ? x.d1 === d1 : x.d2 === d2 })), opts));

  // The props: how each kind is named, a yes/no's word, an option's case, and a comment on each.
  const props = list.flatMap((c) => Object.entries(c.api?.props ?? {}).map(([n, p]) => ({ component: c.name, value: n, p, kind: kindOf(p) })));
  const KIND = { boolean: 'A yes/no prop (a boolean)', option: 'A prop of options', text: 'A text prop', number: 'A number prop' };
  for (const kind of Object.keys(KIND)) {
    const of = props.filter((x) => x.kind === kind);
    if (!of.length) continue;
    const c = dominantCase(of.map((x) => x.value));
    add(judge(`code-${kind}-prop-case`, 'naming', `${KIND[kind]} is named in ${c}`, of.map((x) => ({ component: x.component, value: x.value, fits: caseFits(x.value, c) })), opts));
    if (kind !== 'boolean') continue;
    const cap = (w) => w.replace(/^\w/, (x) => x.toUpperCase());
    const pre = affix(of.map((x) => x.value), 'start'), post = affix(of.map((x) => x.value), 'end');
    if (pre) add(judge('code-boolean-prop-prefix', 'naming', `A yes/no prop begins with "${pre}" (${pre}${cap('thing')})`, of.map((x) => ({ component: x.component, value: x.value, fits: wordsOf(x.value)[0] === pre && wordsOf(x.value).length > 1 })), opts));
    if (post) add(judge('code-boolean-prop-suffix', 'naming', `A yes/no prop ends with "${cap(post)}" (thing${cap(post)})`, of.map((x) => ({ component: x.component, value: x.value, fits: wordsOf(x.value).at(-1) === post && wordsOf(x.value).length > 1 })), opts));
  }
  const options = props.flatMap((x) => OPTION_LITERALS(x.p).filter((o) => /[A-Za-z]/.test(o)).map((o) => ({ component: x.component, value: `${x.value}=${o}`, option: o })));
  if (options.length) {
    const oc = dominantCase(options.map((o) => o.option));
    add(judge('code-option-case', 'naming', `A prop's option is written in ${oc}`, options.map((o) => ({ component: o.component, value: o.value, fits: caseFits(o.option, oc) })), opts));
  }
  add(judge('code-component-comment', 'documentation', 'Every component carries a comment saying what it is for', list.map((c) => ({ component: c.name, value: '', fits: !!String(c.api?.description ?? '').trim() })), opts));
  const withProps = list.filter((c) => Object.keys(c.api?.props ?? {}).length);
  add(judge('code-prop-comment', 'documentation', 'Every prop carries a comment saying what it is for', withProps.map((c) => { const none = Object.entries(c.api.props).filter(([, p]) => !String(p.description ?? '').trim()).map(([n]) => n); return { component: c.name, value: none.join(', '), fits: !none.length }; }), opts));

  // Each Figma property's prop: the components Figma has are joined to it by a Code Connect file, which maps every
  // Figma property to its prop or slot.
  const inFigma = list.filter((c) => c.figmaProps && Object.keys(c.figmaProps).length);
  add(judge('code-code-connect', 'documentation', 'Every component Figma has is joined to it by a Code Connect file', inFigma.map((c) => ({ component: c.name, value: c.api?.codeConnectFile ?? '', fits: !!c.api?.codeConnectFile })), opts));
  const connected = inFigma.filter((c) => c.api?.codeConnectFile);
  add(judge('code-figma-props-mapped', 'architecture', 'Each Figma property maps to a prop or a slot of its component', connected.map((c) => {
    const mapped = new Set([...Object.keys(c.api.codeConnect ?? {}), ...(c.api.codeConnectProps ?? []).map((x) => x.figma)].map((k) => low(strip(k))));
    const left = Object.keys(c.figmaProps).map(strip).filter((k) => !mapped.has(low(k)));
    return { component: c.name, value: uniq(left).join(', '), fits: !left.length };
  }), opts));

  // The tokens: custom properties made for the component (--button-…), or the shared ones, the team's to say.
  const seen = list.map((c) => ({ c, a: anatomy[c.name] })).filter((x) => x.a && x.a.inherits.length + x.a.exposes.length);
  if (seen.length) {
    const id = 'code-tokens';
    const isOwn = (x, v) => { const r = x.a.root.slice(1); return x.a.exposes.includes(v) || v.startsWith(`--${r}-`) || v.includes(`-${low(x.c.name)}-`); };
    const byWay = (way) => seen.map((x) => { const vs = uniq([...x.a.inherits, ...x.a.exposes]); const off = vs.filter((v) => (way === 'own' ? !isOwn(x, v) : isOwn(x, v))); return { component: x.c.name, value: off.slice(0, 6).join(', ') + (off.length > 6 ? '…' : ''), fits: !off.length }; });
    const SAYS = { own: 'A component\'s styles use custom properties made for it (--<component>-…), each set from the system\'s tokens', shared: 'A component\'s styles use the system\'s shared tokens directly, never custom properties made for it' };
    const said = answers[id] === 'own' || answers[id] === 'shared' ? answers[id] : null;
    const way = said ?? (byWay('own').filter((x) => x.fits).length > byWay('shared').filter((x) => x.fits).length ? 'own' : 'shared');
    const other = way === 'own' ? 'shared' : 'own';
    const r = judge(id, 'variables', SAYS[way], byWay(way), { ...opts, answers: { ...answers, [id]: said ? true : answers[id] } });
    if (r && !said && r.status === 'fix') r.status = 'decide';
    if (r) { r.way = way; r.ways = [way, other].map((w) => ({ way: w, says: SAYS[w], follows: byWay(w).filter((x) => x.fits).length })); add(r); }
  }

  // How each state is written, state by state: the way most components write it.
  const byState = new Map(), examples = {};
  for (const [n, a] of Object.entries(anatomy)) for (const s of a.states.filter((x) => !x.part)) {
    const m = byState.get(s.state) ?? new Map();
    const ways = m.get(n) ?? new Set(); ways.add(s.how); m.set(n, ways); byState.set(s.state, m);
    (examples[`${n}|${s.state}|${s.how}`] ??= s.example);
  }
  const HOW = { 'pseudo-class': 'a pseudo-class', class: 'a class', 'data attribute': 'a data attribute', 'aria attribute': 'an ARIA attribute', attribute: 'an attribute' };
  for (const [state, m] of byState) {
    if (m.size < MIN_SEEN) continue;
    const how = top([...m.values()].flatMap((w) => [...w]))[0];
    const ex = Object.values(anatomy).flatMap((a) => a.states).find((s) => s.state === state && s.how === how)?.example;
    add(judge(`code-state-${state}`, 'wiring', `The ${state} state is written as ${HOW[how] ?? how}${ex ? ` (${ex})` : ''}`, [...m].map(([n, w]) => ({ component: n, value: `written as ${[...w].map((h) => `${HOW[h] ?? h}${examples[`${n}|${state}|${h}`] ? ` (${examples[`${n}|${state}|${h}`]})` : ''}`).join(' and ')}`, fits: w.has(how) })), opts));
  }
  // How a part's class and a variant's class are named.
  const partWay = Object.entries(anatomy).filter(([, a]) => a.partWays.length);
  if (partWay.length) {
    const w = top(partWay.flatMap(([, a]) => a.partWays))[0];
    const example = w === '<root>__…' ? 'button__label' : w === '<root>-…' ? 'button-label' : 'label';
    add(judge('code-part-class', 'naming', w === 'own name' ? 'A part\'s class is a name of its own (label), never the component\'s with it' : `A part's class is the component's with the part's name (${example})`,
      partWay.map(([n, a]) => { const named = a.parts.filter((p) => p.class), off = named.filter((p, i) => a.partWays[i] !== w).map((p) => p.class); return { component: n, value: off.join(', '), fits: !off.length }; }), opts));
  }
  const modWay = Object.entries(anatomy).filter(([, a]) => a.modWays.length);
  if (modWay.length) {
    const norm = (x) => x;
    const w = top(modWay.flatMap(([, a]) => a.modWays.map(norm)))[0];
    const SAY = { '<root>--…': 'the component\'s with two hyphens (button--large)', '<root>-…': 'the component\'s with one hyphen (button-large)', 'is-…': 'a word of its own after is- (is-large)', 'own name': 'a name of its own (large)' };
    add(judge('code-variant-class', 'naming', `A variant's class is ${SAY[w] ?? w}`, modWay.map(([n, a]) => ({ component: n, value: a.variantClasses.filter((x) => norm(x.way) !== w).map((x) => x.class).join(', '), fits: a.modWays.every((x) => norm(x) === w) })), opts));
  }

  // Its look: each value with the system's token, never by hand.
  const look = (id, says, pick, fits) => {
    // Only what the reading could resolve is judged: a value whose Sass variable is declared somewhere this does not
    // read is left out, so it neither passes nor fails (a reading problem is never a value written by hand).
    const items = Object.entries(anatomy).map(([n, a]) => ({ n, xs: pick(a).filter((x) => x.read !== false) })).filter((x) => x.xs.length);
    add(judge(id, 'variables', says, items.map(({ n, xs }) => { const off = xs.filter((x) => !fits(x)); return { component: n, value: uniq(off.map((x) => `${x.part ? `.${x.part} ` : ''}${x.prop ? `${x.prop}: ` : ''}${x.value}`)).slice(0, 4).join('; '), fits: !off.length }; }), opts));
  };
  look('code-shadow-token', 'A shadow is written with the system\'s token', (a) => a.shadows.filter((s) => !s.off), (s) => s.layers.every((l) => l.token));
  look('code-border-token', 'A border\'s colour is written with the system\'s token', (a) => a.borders.filter((b) => /-color$/.test(b.prop) || /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/.test(b.prop)), (b) => b.token);
  look('code-opacity-token', 'An opacity is written with the system\'s token', (a) => a.opacity, (o) => o.token || /^(0|1)$/.test(o.value));
  look('code-text-token', 'A part\'s text is set with the system\'s text styles and tokens, never a size written by hand', (a) => a.text, (t) => t.token);
  look('code-spacing-token', 'A component\'s padding, gaps and margins are written with the system\'s spacing tokens', (a) => a.spacing, (x) => x.token);
  const rounded = Object.entries(anatomy).filter(([, a]) => a.radius);
  add(judge('code-radius-token', 'variables', 'A component\'s corners are written with the system\'s radius tokens', rounded.map(([n, a]) => ({ component: n, value: a.radius.byHand.join(', '), fits: !a.radius.byHand.length })), opts));
  add(judge('code-radius-one-token', 'variables', 'A component\'s corners share one radius token', rounded.map(([n, a]) => ({ component: n, value: a.radius.values.join(', '), fits: a.radius.shared })), opts));
  const styled = Object.entries(anatomy).filter(([, a]) => a.inherits.length || a.exposes.length);
  add(judge('code-exposes-properties', 'architecture', 'A component declares its own custom properties for what may be overridden (--<component>-…)', styled.map(([n, a]) => ({ component: n, value: a.exposes.slice(0, 4).join(', '), fits: a.exposes.length > 0 })), opts));

  // The vocabulary to reuse rather than rules: the states and how they are written, the parts most components have,
  // how they hug or fill.
  const partNames = new Map();
  for (const a of Object.values(anatomy)) for (const p of a.parts) if (p.class) { const w = p.class.replace(new RegExp(`^${a.root.slice(1)}(__|-)`), ''); partNames.set(w, (partNames.get(w) ?? 0) + 1); }
  const vocabulary = {
    states: [...byState].map(([state, m]) => ({ state, components: m.size, ways: Object.fromEntries(Object.entries([...m.values()].flatMap((w) => [...w]).reduce((o, h) => ({ ...o, [h]: (o[h] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1])) })).sort((a, b) => b.components - a.components),
    parts: [...partNames].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, components]) => ({ name, components })),
    sizing: Object.values(anatomy).reduce((o, a) => (a.sizing ? { ...o, [a.sizing]: (o[a.sizing] ?? 0) + 1 } : o), {}),
  };
  const questions = rules.filter((r) => r.status === 'decide').map((r) => ({ id: r.id, ask: `${r.says}? ${r.follows} of ${r.of} do. Is it the rule? If it is, ${r.toFix.length} ${r.toFix.length === 1 ? 'is' : 'are'} to fix.` }));
  return { code: { components: list.length, rules, vocabulary, anatomy, ...(notRead.length ? { notRead } : {}) }, questions };
}

// The code's rules in a few lines, as grammarLines says Figma's. → [line]
export function codeGrammarLines(g, { parts = 8 } = {}) {
  const c = g?.code;
  if (!c?.rules?.length) return [];
  const lines = [`How this system builds a component in the code (from its ${c.components} component files). A new or changed component is written the way each line says; one still to decide, as the component it is like is:`];
  const fix = (r) => `${r.toFix.length} to fix`;
  for (const r of c.rules) lines.push(`- ${r.says}: ${r.status === 'rule' ? 'the rule, every component follows it' : r.status === 'fix' ? `${r.follows} of ${r.of} follow it, ${fix(r)}${r.by === 'team' ? ' (the team\'s rule)' : ''}` : `${r.follows} of ${r.of} follow it; the team decides whether it is the rule (then ${fix(r)})`}.`);
  const p = c.vocabulary?.parts ?? [];
  if (p.length) lines.push(`- Parts its components already name: ${p.slice(0, parts).map((x) => `${x.name} (${x.components})`).join(', ')}.`);
  return lines;
}

// ── Reading the inputs ────────────────────────────────────────────────────────

// The styles a component file brings: a Vue or Svelte file's own <style> blocks, and every stylesheet it imports
// beside it (import './button.css', import styles from './button.module.scss').
function stylesOf(ROOT, file, text, read) {
  const out = [];
  if (/\.(vue|svelte)$/i.test(file)) out.push({ file, text: styleBlocksOf(text) });
  for (const m of String(text).matchAll(/(?:^|\n)\s*import\s+(?:[\w{}\s,*]+\s+from\s+)?['"](\.{1,2}\/[^'"]+\.(?:css|scss|sass|less))['"]/g)) {
    const rel = resolve(ROOT, dirname(file), m[1]).slice(resolve(ROOT).length + 1);
    const t = read(resolve(ROOT, rel));
    if (t) out.push({ file: rel, text: t });
  }
  for (const m of String(text).matchAll(/<style\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/g)) {
    const rel = resolve(ROOT, dirname(file), m[1]).slice(resolve(ROOT).length + 1);
    const t = read(resolve(ROOT, rel));
    if (t) out.push({ file: rel, text: t });
  }
  const js = cssInJs(file, text);
  if (js) out.push(js);
  return out;
}

// The styles a component writes in JavaScript (styled-components, emotion): each tagged template literal, read as the
// CSS it is. A system written this way declares no class of its own, so each block is read under one made from the
// name the styles are given (`const Button = styled.button` → `.Button`), which is the root the markup's element
// carries. An interpolation (`${p => …}`) is left out, never guessed. → { file, text, roots } or null
export function cssInJs(file, text) {
  if (!/\.(jsx?|tsx?|mjs)$/i.test(String(file))) return null;
  const t = String(text ?? '');
  const out = [];
  const roots = [];
  const lineOf = (i) => { let n = 1; for (let j = 0; j < i && j < t.length; j++) if (t.charCodeAt(j) === 10) n++; return n; };
  let at = 1;
  for (const m of t.matchAll(/(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*)?\b(?:styled(?:\.[\w$]+|\([^)]*\))(?:\.[\w$]+)*|css|createGlobalStyle)\s*`([\s\S]*?)`/g)) {
    const name = m[1] ?? null;
    // Interpolations cannot be read, so each becomes a blank of its own length: every line number stays true.
    const body = m[2].replace(/\$\{[\s\S]*?\}/g, (x) => x.replace(/[^\n]/g, ' '));
    const start = lineOf(m.index + m[0].indexOf('`') + 1);
    while (at < start) { out.push(''); at++; }
    const sel = name ? `.${name}` : ':root';
    if (name) roots.push(name);
    out.push(`${sel} {${body}}`);
    at = start + body.split('\n').length;
  }
  return out.length ? { file, text: out.join('\n'), roots } : null;
}

// The components the code has, each with its file, its text, its styles, the class it is drawn with and its API: from
// the code capture (its API carries the compiler's types and the Code Connect file) when there is one, else from the
// component files. figmaProps: the Figma props snapshot, so each component that Figma has is known.
export async function codeInputs(ROOT, cfg = {}, { figmaProps = {} } = {}) {
  const cache = new Map();
  const read = (p) => { if (!cache.has(p)) { try { cache.set(p, readFileSync(p, 'utf8')); } catch { cache.set(p, ''); } } return cache.get(p); };
  const { codeSnapshotPath } = await import('./names.mjs');
  const snapPath = resolve(ROOT, codeSnapshotPath(cfg));
  let snap = null;
  if (existsSync(snapPath)) { try { snap = JSON.parse(read(snapPath)); } catch { snap = null; } }
  const { rootClassOf, codeComponents, textComponentApi } = await import('./component-source.mjs');
  const figmaOf = (n) => figmaProps?.[n]?.properties ?? null;
  const entries = snap?.api && Object.keys(snap.api).length
    ? Object.entries(snap.api).filter(([, a]) => a?.file).map(([name, api]) => ({ name, api, file: api.file, root: String(snap.components?.[name]?.selector ?? '').match(/^\.(-?[A-Za-z_][\w-]*)$/)?.[1] ?? null }))
    : codeComponents(resolve(ROOT), cfg, read).map((c) => ({ name: c.name, file: c.file, root: c.cls, api: textComponentApi(c.file, read(resolve(ROOT, c.file))) }));
  // One file, one component: a file the capture gives two names (a Figma component and its part both read from it) is
  // read once, under the name its own class says, else the first.
  const byFile = new Map();
  for (const e of entries) { const prev = byFile.get(e.file); if (!prev || (!prev.root && e.root)) byFile.set(e.file, e); }
  return [...byFile.values()].map((e) => {
    const text = read(resolve(ROOT, e.file));
    if (!text) return null;
    return { name: e.name, file: e.file, text, styles: stylesOf(ROOT, e.file, text, read), root: e.root ?? rootClassOf(e.file, text), api: e.api, figmaProps: figmaOf(e.name) };
  }).filter(Boolean);
}

// The code's grammar for a project, as the build, the Rules page and the commands read it. → codeGrammarOf's result
export async function codeGrammarFor(ROOT, cfg = {}, { figmaProps = {}, textStyles = null, answers = {} } = {}) {
  return codeGrammarOf({ components: await codeInputs(ROOT, cfg, { figmaProps }), textStyles }, { answers });
}
