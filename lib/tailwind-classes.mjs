// tailwind-classes.mjs - a Tailwind component's classes against Figma, as far as a CSS component is compared.
//
// A Tailwind component writes its look as classes, where no CSS rule carries it. tailwind-check.mjs read them for the
// default look only (height, padding, corner, the three colours) and only from a v4 @theme. This reads the rest:
//   the theme       a v3 tailwind.config (theme and theme.extend), read as text: the project's code is never run
//   each variant    the classes each option writes (cva and tailwind-variants, a map of option to classes, a
//                   conditional on the prop), so each Figma variant is compared with its own classes, not the file's
//   each state      hover:, active:, focus-visible:, disabled:, aria-/data- states, against the variable Figma binds in
//                   that state (component-state-bindings.json)
//   each measure    gap, text size, weight and line height, border width, shadow and motion (duration, easing)
//   each mode       a dark mode (or a brand) drawn by the theme's override block or by dark: classes, against the value
//                   Figma's variable takes in that mode
// Advisory, like the rest of the Tailwind check: each difference names the class to write.
//
//   configTheme(text)                         → Map(namespace → Map(value → [name]))   a v3 config's theme
//   optionClasses(text, axes)                 → { base, options: { axis: { option: [class] } }, found }
//   tailwindFindings(input)                   → [{ component, where, what, figma, code, write }]
import { parseColor, sameColor, lengthPx, timeMs, sameEasing } from './css-values.mjs';
import { figmaEasing, STATE as TRIGGER_STATE } from './motion-parity.mjs';

// ── A JS object literal, read as data ─────────────────────────────────────
// Strings, numbers, booleans, null, arrays and objects; a key in quotes or bare. Anything else (a function, a
// require, a spread, a variable) is read as undefined and skipped, never run.
function tokens(src) {
  const out = [], s = String(src ?? '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, v = '', plain = true;
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') { v += s[j + 1] ?? ''; j += 2; continue; } if (c === '`' && s[j] === '$' && s[j + 1] === '{') plain = false; v += s[j++]; }
      out.push({ t: plain ? 'str' : 'expr', v, at: i, end: j + 1 }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) { const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i)); if (m) { out.push({ t: 'num', v: Number(m[0]), at: i, end: i + m[0].length }); i += m[0].length; continue; } }
    if (/[A-Za-z_$]/.test(c)) { const m = /^[\w$]+/.exec(s.slice(i)); out.push({ t: 'id', v: m[0], at: i, end: i + m[0].length }); i += m[0].length; continue; }
    if (c === '.' && s.slice(i, i + 3) === '...') { out.push({ t: 'p', v: '...', at: i, end: i + 3 }); i += 3; continue; }
    out.push({ t: 'p', v: c, at: i, end: i + 1 }); i++;
  }
  return out;
}
// Parse the value at tokens[k] → [value, next k]. Stops at a , } ] at depth 0 when the value is not a literal.
function value(ts, k) {
  const t = ts[k];
  if (!t) return [undefined, k];
  if (t.t === 'p' && t.v === '{') {
    const obj = {}; k++;
    while (ts[k] && !(ts[k].t === 'p' && ts[k].v === '}')) {
      if (ts[k].t === 'p' && ts[k].v === ',') { k++; continue; }
      if (ts[k].t === 'p' && ts[k].v === '...') { k = skip(ts, k + 1); continue; }
      const key = ts[k];
      if (!key || !['id', 'str', 'num'].includes(key.t) || !(ts[k + 1]?.t === 'p' && ts[k + 1].v === ':')) { k = skip(ts, k); continue; }
      const [v, n] = value(ts, k + 2);
      if (v !== undefined) obj[String(key.v)] = v;
      k = n;
    }
    return [obj, k + 1];
  }
  if (t.t === 'p' && t.v === '[') {
    const arr = []; k++;
    while (ts[k] && !(ts[k].t === 'p' && ts[k].v === ']')) {
      if (ts[k].t === 'p' && ts[k].v === ',') { k++; continue; }
      const [v, n] = value(ts, k);
      arr.push(v); k = n;
    }
    return [arr, k + 1];
  }
  if (t.t === 'str' && !isOp(ts[k + 1])) return [t.v, k + 1];
  if (t.t === 'num' && !isOp(ts[k + 1])) return [t.v, k + 1];
  if (t.t === 'id' && ['true', 'false', 'null'].includes(t.v) && !isOp(ts[k + 1])) return [t.v === 'true' ? true : t.v === 'false' ? false : null, k + 1];
  return [undefined, skip(ts, k)];
}
const isOp = (t) => !!t && t.t === 'p' && !/^[,}\]]$/.test(t.v);
// Past one value that is not a literal: to the next , } ] at its own depth.
function skip(ts, k) {
  let d = 0;
  for (; k < ts.length; k++) {
    const v = ts[k].t === 'p' ? ts[k].v : null;
    if (v === '{' || v === '[' || v === '(') d++;
    else if (v === '}' || v === ']' || v === ')') { if (d === 0) return k; d--; }
    else if (v === ',' && d === 0) return k;
  }
  return k;
}
// The object literal right after `name:` (or `name =`, or the first argument of name(…)) in some code, read as data.
export function objectAfter(src, re) {
  const ts = tokens(src);
  for (let k = 0; k < ts.length; k++) {
    if (!(ts[k].t === 'id' && re.test(ts[k].v))) continue;
    const n = ts[k + 1];
    if (!n || n.t !== 'p' || !/^[:=(]$/.test(n.v)) continue;
    const at = ts[k + 2];
    if (at?.t === 'p' && at.v === '{') return value(ts, k + 2)[0];
  }
  return null;
}

// ── TW1. A v3 theme from tailwind.config ───────────────────────────────────
// Its theme and theme.extend, each key under the namespace @theme would give it.
const CONFIG_NS = { colors: 'color', spacing: 'spacing', borderRadius: 'radius', fontSize: 'text', fontWeight: 'font-weight', lineHeight: 'leading',
  letterSpacing: 'tracking', boxShadow: 'shadow', transitionDuration: 'duration', transitionTimingFunction: 'ease', borderWidth: 'border-width' };
const norm = (v) => { const s = String(v).trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' '); const hex = /^#([0-9a-f]{3,4})$/.exec(s); return hex ? `#${[...hex[1]].map((c) => c + c).join('')}` : s; };
// A value, and the same value in px when it is in rem: p-[12px] finds a spacing of 0.75rem.
export function addValue(map, ns, value, name) {
  const byValue = map.get(ns) ?? map.set(ns, new Map()).get(ns);
  const put = (v) => byValue.set(v, [...new Set([...(byValue.get(v) ?? []), name])]);
  const v = norm(value);
  put(v);
  const px = /^[\d.]+(rem|px)$/.test(v) ? lengthPx(v) : null;
  if (px != null && !/px$/.test(v)) put(`${+px.toFixed(3)}px`);
}
export function configTheme(text) {
  const theme = objectAfter(text, /^theme$/);
  const out = new Map();
  if (!theme || typeof theme !== 'object') return out;
  for (const layer of [theme, theme.extend ?? {}]) {
    for (const [key, ns] of Object.entries(CONFIG_NS)) {
      const entries = layer[key];
      if (!entries || typeof entries !== 'object') continue;
      const flat = (obj, prefix) => {
        for (const [name, v] of Object.entries(obj)) {
          const full = name === 'DEFAULT' ? prefix : prefix ? `${prefix}-${name}` : name;
          if (typeof v === 'string' || typeof v === 'number') addValue(out, ns, String(v), full || 'DEFAULT');
          else if (Array.isArray(v) && ns === 'text' && typeof v[0] === 'string') {
            addValue(out, ns, v[0], full);
            const lh = typeof v[1] === 'string' ? v[1] : v[1]?.lineHeight;
            if (lh) addValue(out, `text-lh:${full}`, lh, full);
          } else if (v && typeof v === 'object' && ns === 'color') flat(v, full);
        }
      };
      flat(entries, '');
    }
  }
  return out;
}

// ── TW3. The classes each option writes ────────────────────────────────────
// axes: [[axis, [option]]] from Figma's variants. Read, in order: cva/tailwind-variants (variants: { axis: { option:
// classes } }), an object whose keys are one axis's options (const TONE = { Neutral: '…' }), and a conditional on the
// prop (variant === 'Secondary' ? '…' : '…', the other branch every other option's). → { base: string (the text with
// the option strings taken out), options: { axisLower: { optionLower: string } }, found }
const lc = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
export function optionClasses(text, axes = []) {
  const src = String(text ?? '');
  const options = {}, spans = [];
  const put = (axis, opt, classes) => { const a = lc(axis), o = lc(opt); options[a] ??= {}; options[a][o] = `${options[a][o] ?? ''} ${classes}`.trim(); };
  const axisOf = (name) => axes.find(([a]) => lc(a) === lc(name));
  const asText = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : typeof v === 'string' ? v : '');
  const ts = tokens(src);
  // cva / tv: variants: { axis: { option: classes } }
  for (let k = 0; k < ts.length; k++) {
    if (!(ts[k].t === 'id' && ts[k].v === 'variants' && ts[k + 1]?.v === ':' && ts[k + 2]?.v === '{')) continue;
    const [obj, end] = value(ts, k + 2);
    if (!obj) continue;
    for (const [axis, opts] of Object.entries(obj)) {
      if (!opts || typeof opts !== 'object' || !axisOf(axis)) continue;
      for (const [opt, cls] of Object.entries(opts)) put(axis, opt, asText(cls));
    }
    spans.push([ts[k].at, ts[end - 1]?.end ?? ts[k].end]);
  }
  // An object whose keys are an axis's options.
  for (let k = 0; k < ts.length; k++) {
    if (!(ts[k].t === 'p' && ts[k].v === '{') || spans.some(([a, b]) => ts[k].at >= a && ts[k].at < b)) continue;
    const [obj, end] = value(ts, k);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const keys = Object.keys(obj), vals = Object.values(obj);
    if (keys.length < 2 || !vals.every((v) => typeof v === 'string' || Array.isArray(v))) continue;
    const axis = axes.find(([, opts]) => keys.filter((key) => opts.some((o) => lc(o) === lc(key))).length >= Math.min(2, opts.length));
    if (!axis) continue;
    for (const [key, v] of Object.entries(obj)) put(axis[0], key, asText(v));
    spans.push([ts[k].at, ts[end - 1]?.end ?? ts[k].end]);
  }
  // A conditional on the prop: prop === 'Option' ? 'classes' : 'classes'.
  for (const m of src.matchAll(/\b(\w+)\s*===?\s*(['"])([^'"]+)\2\s*\?\s*(['"`])([^'"`]*)\4\s*:\s*(['"`])([^'"`]*)\6/g)) {
    const axis = axisOf(m[1]);
    if (!axis) continue;
    put(axis[0], m[3], m[5]);
    for (const o of axis[1]) if (lc(o) !== lc(m[3])) put(axis[0], o, m[7]);
    spans.push([m.index, m.index + m[0].length]);
  }
  let base = src;
  for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) base = base.slice(0, a) + ' '.repeat(b - a) + base.slice(b);
  return { base, options, found: Object.keys(options).length > 0 };
}
// A Figma variant's name → { axis: option }.
export const variantProps = (name) => Object.fromEntries(String(name ?? '').split(',').map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0]));

// ── Classes ────────────────────────────────────────────────────────────────
// Every class in some text, with its variants (hover:, dark:, data-[state=open]:) apart. → [{ variants: ['hover'], cls }]
export function classesIn(text) {
  return [...String(text ?? '').matchAll(/(?<![\w-])((?:(?:[\w-]+(?:-\[[^\]\s]+\])?|\[[^\]\s]+\]):)*)(-?[a-z]+(?:-[a-z0-9.]+)*(?:-\[[^\]\s]+\])?)(?:\/\d+)?(?![\w-])/g)]
    .map((m) => ({ variants: m[1] ? m[1].slice(0, -1).split(/:(?![^[]*\])/) : [], cls: m[2] }));
}

// ── TW2. The class prefixes each Figma state is written with ───────────────
export const STATE_PREFIXES = {
  hover: ['hover', 'group-hover'], hovered: ['hover', 'group-hover'],
  pressed: ['active'], active: ['active'], down: ['active'],
  focus: ['focus-visible', 'focus'], focused: ['focus-visible', 'focus'], 'focus-visible': ['focus-visible'],
  disabled: ['disabled', 'aria-disabled', 'data-[disabled]', 'data-disabled', 'group-disabled'],
  selected: ['aria-selected', 'data-[state=on]', 'data-[state=active]', 'data-[selected]', 'aria-pressed', 'aria-checked', 'data-[state=checked]'],
  checked: ['checked', 'aria-checked', 'data-[state=checked]'], open: ['data-[state=open]', 'aria-expanded', 'open'],
};
const RESTING = /^(default|rest|resting|idle|normal|enabled|none|off|false)$/i;
const ROLE_PREFIX = { fill: 'bg', text: 'text', stroke: 'border' };
const TEXT_SIZE_WORD = /^text-(xs|sm|base|lg|[2-9]?xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;
// The colour class of a role among some classes (text-sm is a size, not a colour; border-2 a width).
const roleClasses = (list, role) => list.filter(({ cls }) => cls.startsWith(`${ROLE_PREFIX[role]}-`)
  && !(role === 'text' && TEXT_SIZE_WORD.test(cls)) && !(role === 'stroke' && /^border-(\d+|[xytrblse]|[xytrblse]-\d+|solid|dashed|dotted|double|none|hidden|collapse|separate)$/.test(cls)));
const withVariant = (list, vs) => list.filter((c) => vs.length ? vs.every((v) => c.variants.includes(v)) && c.variants.length === vs.length : !c.variants.length);
const write = (vs, cls) => `${vs.map((v) => `${v}:`).join('')}${cls}`;

// The paints a Figma variant binds (component-state-bindings.json): fill, text and stroke tokens.
function paintsOf(bindings = []) {
  const out = {};
  for (const b of bindings) {
    if (!b?.token) continue;
    if (b.bindingField === 'fills' && b.isText && (b.depth ?? 0) <= 1) out.text ??= b.token;
    else if (b.bindingField === 'fills' && !b.isText && (b.depth ?? 0) === 0) out.fill ??= b.token;
    else if (b.bindingField === 'strokes' && (b.depth ?? 0) === 0) out.stroke ??= b.token;
  }
  return out;
}

// Tailwind's own scale, for a class the theme does not name (text-sm is 14px wherever the theme says nothing).
const DEFAULT_TEXT = { xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 36], '4xl': [36, 40], '5xl': [48, 48], '6xl': [60, 60] };
const DEFAULT_WEIGHT = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const DEFAULT_LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const DEFAULT_EASE = { linear: 'linear', in: 'cubic-bezier(0.4, 0, 1, 1)', out: 'cubic-bezier(0, 0, 0.2, 1)', 'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)' };
const nameFor = (theme, ns, v) => {
  const px = lengthPx(v);
  const m = theme.get(ns);
  if (!m) return null;
  return (m.get(norm(v)) ?? (px != null ? m.get(`${+px.toFixed(3)}px`) : null) ?? [])[0] ?? null;
};
const themeValue = (theme, ns, name) => { for (const [v, names] of theme.get(ns) ?? []) if (names.includes(name)) return v; return null; };

// The px a text-size class gives, from the theme, else Tailwind's scale, else a bracketed value.
function textPx(cls, theme) {
  const n = cls.slice(5);
  const v = themeValue(theme, 'text', n);
  if (v != null) return lengthPx(v);
  if (DEFAULT_TEXT[n]) return DEFAULT_TEXT[n][0];
  const b = /^\[(.+)\]$/.exec(n); return b ? lengthPx(b[1]) : null;
}
function weightOf(cls, theme) {
  const n = cls.slice(5);
  const v = themeValue(theme, 'font-weight', n);
  if (v != null) return Number(v);
  if (DEFAULT_WEIGHT[n]) return DEFAULT_WEIGHT[n];
  const b = /^\[(\d+)\]$/.exec(n); return b ? Number(b[1]) : null;
}

// The value a colour class draws in a mode: the theme's (or the mode's override block's) value of its name.
function colourIn(cls, prefix, theme, override) {
  const name = cls.slice(prefix.length + 1);
  const b = /^\[(.+)\]$/.exec(name);
  if (b) return b[1];
  return override?.get(`--color-${name}`) ?? themeValue(theme, 'color', name);
}

// A mode's override block in the theme CSS (.dark { --color-…: … }), from its cssSelector: class:dark → .dark,
// media → @media (prefers-color-scheme: dark), a selector as written. → Map(var → value)
export function modeOverrides(css, cssSelector) {
  const out = new Map();
  const sel = String(cssSelector ?? '');
  if (!sel || sel === 'root') return out;
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  if (/^media/i.test(sel) || /prefers-color-scheme/.test(sel)) for (const m of text.matchAll(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{([\s\S]*?\})\s*\}/g)) blocks.push(m[1]);
  const want = /^class:(.+)$/.exec(sel)?.[1] ? `.${/^class:(.+)$/.exec(sel)[1]}` : sel;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(';').pop().split(',').map((s) => s.trim());
    if (selectors.some((s) => s === want || s === `:root${want}` || s === `html${want}` || s.replace(/\s+/g, '') === want.replace(/\s+/g, ''))) blocks.push(m[2]);
  }
  for (const b of blocks) for (const d of b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
  return out;
}

// ── All of it, for every component ─────────────────────────────────────────
// structure: figma-structure components; files: { component: text }; theme: Map from themeValues/configTheme;
// varOf(token, raw) → CSS variable; sizing: Figma's sizing values; typography: Figma's text styles ({ name: { size,
// weight, lh } }); stateBindings: component-state-bindings.json; effects / motion: those snapshots' components;
// modes: [{ name, snapshotKey, cssSelector }] beyond the first, with colours: { snapshotKey: { token: value } };
// themeCss: the theme's CSS, for a mode's override block. → [{ component, where, what, figma, code, write }]
export function tailwindFindings({ structure = {}, files = {}, theme = new Map(), base = 4, varOf = () => null, sizing = {}, typography = {},
  stateBindings = {}, effects = {}, motion = {}, modes = [], colours = {}, themeCss = '' }) {
  const out = [];
  const seen = new Set();
  const add = (f) => { const k = `${f.component}|${f.what}|${f.code}|${f.write}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  const nameIn = (cssVar, ns) => String(cssVar ?? '').replace(new RegExp(`^--${ns}-`), '');
  const sizePx = (v) => {
    if (/^\[\s*[\d.]+(px|rem)\s*\]$/.test(v)) return lengthPx(v.slice(1, -1));
    if (/^\d+(\.\d+)?$/.test(v)) return Number(v) * base;
    const t = themeValue(theme, 'spacing', v); return t != null ? lengthPx(t) : null;
  };
  for (const [comp, s] of Object.entries(structure)) {
    const text = files[comp];
    if (!text) continue;
    // TW3: each Figma variant with the classes its options write; the default look when no option is read.
    const axes = [];
    for (const name of Object.keys(s.variants ?? {})) for (const [a, o] of Object.entries(variantProps(name))) {
      const ax = axes.find(([x]) => x === a) ?? (axes.push([a, []]), axes.at(-1));
      if (!ax[1].includes(o)) ax[1].push(o);
    }
    const oc = optionClasses(text, axes);
    const looks = oc.found
      ? Object.entries(s.variants ?? {}).map(([name, v]) => {
        const props = variantProps(name);
        const parts = [oc.base, ...Object.entries(props).map(([a, o]) => oc.options[lc(a)]?.[lc(o)] ?? '')];
        // A variant Figma draws that none of the code's options writes is not this code's: not compared.
        const missing = Object.entries(props).some(([a, o]) => oc.options[lc(a)] && oc.options[lc(a)][lc(o)] == null);
        return missing ? null : { where: Object.keys(s.variants).length > 1 ? name : null, classes: classesIn(parts.join(' ')), v };
      }).filter(Boolean)
      : [{ where: null, classes: classesIn(text), v: {} }];
    const all = classesIn(text);
    // The default look's classes: what each mode draws at rest.
    const restLook = (oc.found ? looks.find((l) => l.where === s.defaultVariant) ?? looks[0] : looks[0]);
    const restClasses = restLook ? restLook.classes : all;
    for (const look of looks) {
      const plain = withVariant(look.classes, []);
      const has = (re) => plain.filter((c) => re.test(c.cls)).map((c) => c.cls);
      const where = look.where;
      const h = look.v.h ?? s.h;
      if (Number.isFinite(h)) {
        const hs = has(/^h-/);
        const px = hs.map((c) => sizePx(c.slice(2))).filter((x) => x != null);
        if (hs.length && !px.some((x) => Math.abs(x - h) < 0.5)) add({ component: comp, where, what: 'height', figma: `${h}px`, code: hs.join(' '), write: Number.isInteger(h / base) ? `h-${h / base}` : `h-[${h}px]` });
      }
      const pad = look.v.paddingVar ?? s.paddingVar ?? {};
      const want = (tok) => (tok ? nameIn(varOf(tok, true), 'spacing') : null);
      const [tb, lr] = [want(pad.tb), want(pad.lr)];
      if (tb && lr) {
        const toks = plain.map((c) => c.cls);
        const ok = tb === lr ? toks.includes(`p-${tb}`) || (toks.includes(`px-${lr}`) && toks.includes(`py-${tb}`)) : toks.includes(`px-${lr}`) && toks.includes(`py-${tb}`);
        const code = has(/^p[xytrblse]?-/);
        if (code.length && !ok) add({ component: comp, where, what: 'padding', figma: `${pad.tb} · ${pad.lr}`, code: code.join(' '), write: tb === lr ? `p-${tb}` : `px-${lr} py-${tb}` });
      }
      if (s.innerRadiusVar) {
        const r = nameIn(varOf(s.innerRadiusVar, true), 'radius');
        const code = has(/^rounded(-|$)/);
        if (code.length && !code.includes(`rounded-${r}`)) add({ component: comp, where, what: 'corner', figma: `${s.innerRadiusVar}${sizing[s.innerRadiusVar] ? ` (${sizing[s.innerRadiusVar]})` : ''}`, code: code.join(' '), write: `rounded-${r}` });
      }
      const colors = look.v.colors ?? s.colors ?? {};
      for (const role of ['fill', 'text', 'stroke']) {
        const tok = colors[role]?.token;
        if (!tok) continue;
        const name = nameIn(varOf(tok, false), 'color');
        const code = roleClasses(plain, role).map((c) => c.cls);
        if (code.length && !code.includes(`${ROLE_PREFIX[role]}-${name}`)) add({ component: comp, where, what: role === 'fill' ? 'fill' : role === 'text' ? 'text colour' : 'border colour', figma: tok, code: code.join(' '), write: `${ROLE_PREFIX[role]}-${name}` });
      }
      // TW4: gap, text, border width.
      if (s.gapVar) {
        const g = nameIn(varOf(s.gapVar, true), 'spacing');
        const code = has(/^gap(-[xy])?-/);
        if (code.length && !code.includes(`gap-${g}`)) add({ component: comp, where, what: 'gap', figma: s.gapVar, code: code.join(' '), write: `gap-${g}` });
      }
      const style = typography[s.fontSizeVar] ?? typography[s.fontWeightVar];
      if (style) {
        const sizes = has(/^text-/).filter((c) => !/^text-(left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(c) && textPx(c, theme) != null);
        const want = lengthPx(style.size);
        if (sizes.length && want != null && !sizes.some((c) => Math.abs(textPx(c, theme) - want) < 0.5)) {
          const named = nameFor(theme, 'text', style.size) ?? Object.entries(DEFAULT_TEXT).find(([, [px]]) => px === want)?.[0];
          add({ component: comp, where, what: 'text size', figma: `${s.fontSizeVar} (${style.size})`, code: sizes.join(' '), write: named ? `text-${named}` : `text-[${want}px]` });
        }
        const weights = has(/^font-/).filter((c) => weightOf(c, theme) != null);
        const w = Number(style.weight);
        if (weights.length && Number.isFinite(w) && !weights.some((c) => weightOf(c, theme) === w)) {
          const named = nameFor(theme, 'font-weight', String(w)) ?? Object.entries(DEFAULT_WEIGHT).find(([, x]) => x === w)?.[0];
          add({ component: comp, where, what: 'weight', figma: `${s.fontWeightVar ?? s.fontSizeVar} (${w})`, code: weights.join(' '), write: named ? `font-${named}` : `font-[${w}]` });
        }
        const lhWant = lengthPx(style.lh);
        const leading = has(/^leading-/);
        if (leading.length && lhWant != null && want != null) {
          const px = (c) => { const n = c.slice(8), t = themeValue(theme, 'leading', n); if (t != null) return /px|rem/.test(t) ? lengthPx(t) : Number(t) * want; if (DEFAULT_LEADING[n]) return DEFAULT_LEADING[n] * want; if (/^\d+$/.test(n)) return Number(n) * base; const b = /^\[(.+)\]$/.exec(n); return b ? (/px|rem/.test(b[1]) ? lengthPx(b[1]) : Number(b[1]) * want) : null; };
          if (!leading.some((c) => px(c) != null && Math.abs(px(c) - lhWant) < 0.5)) add({ component: comp, where, what: 'line height', figma: `${style.lh}`, code: leading.join(' '), write: Number.isInteger(lhWant / base) ? `leading-${lhWant / base}` : `leading-[${lhWant}px]` });
        }
      }
      const weights = s.stroke?.weights;
      if (Array.isArray(weights) && weights.length && weights.every((x) => x === weights[0]) && weights[0] > 0) {
        const wpx = weights[0];
        const widths = has(/^border(-\d+|-\[[^\]]+\])?$/);
        const pxOf = (c) => (c === 'border' ? 1 : /^border-(\d+)$/.test(c) ? Number(c.slice(7)) : lengthPx(c.slice(8, -1)));
        if (!widths.length) add({ component: comp, where, what: 'border width', figma: `${wpx}px`, code: 'none', write: wpx === 1 ? 'border' : `border-${wpx}` });
        else if (!widths.some((c) => pxOf(c) === wpx)) add({ component: comp, where, what: 'border width', figma: `${wpx}px`, code: widths.join(' '), write: wpx === 1 ? 'border' : `border-${wpx}` });
      }
    }
    // TW2: each state Figma binds, against the classes written with its prefix.
    const sb = stateBindings[comp] ?? stateBindings[Object.keys(stateBindings).find((k) => lc(k) === lc(comp))] ?? {};
    const entries = Object.entries(sb).map(([name, v]) => ({ name, props: v.props ?? variantProps(name), paints: paintsOf(v.bindings) }));
    const stateAxis = (props) => Object.entries(props).find(([, val]) => STATE_PREFIXES[String(val).toLowerCase()]);
    for (const e of entries) {
      const st = stateAxis(e.props);
      if (!st) continue;
      const [axis, val] = st;
      const others = Object.entries(e.props).filter(([a]) => a !== axis);
      const rest = entries.find((r) => RESTING.test(String(r.props[axis] ?? '')) && others.every(([a, v]) => r.props[a] === v));
      if (!rest) continue;
      const prefixes = STATE_PREFIXES[String(val).toLowerCase()];
      for (const role of ['fill', 'text', 'stroke']) {
        const tok = e.paints[role];
        if (!tok || tok === rest.paints[role]) continue;   // the state draws it as at rest: no class owed
        const name = nameIn(varOf(tok, false), 'color');
        const want = `${prefixes[0]}:${ROLE_PREFIX[role]}-${name}`;
        const written = all.filter((c) => c.variants.length && prefixes.includes(c.variants.at(-1)) && roleClasses([c], role).length);
        if (!written.some((c) => c.cls === `${ROLE_PREFIX[role]}-${name}`)) add({ component: comp, where: `${String(val).toLowerCase()}${others.length && entries.filter((x) => stateAxis(x.props)?.[1] === val).length > 1 ? `, ${others.map(([a, v]) => `${a}=${v}`).join(', ')}` : ''}`, what: role === 'fill' ? 'fill' : role === 'text' ? 'text colour' : 'border colour', figma: tok, code: written.length ? written.map((c) => write(c.variants, c.cls)).join(' ') : 'none', write: want });
      }
    }
    // TW4: shadow, from the effects capture.
    const fx = effects[comp];
    if (fx) {
      const shadows = all.filter((c) => !c.variants.length && /^shadow(-|$)/.test(c.cls) && !/^shadow-(none|transparent|inherit|current)$/.test(c.cls) && !/^shadow-(black|white|[a-z]+-\d{2,3})$/.test(c.cls));
      const figmaShadows = (fx.effects ?? []).filter((e) => /SHADOW/.test(e.type));
      if (figmaShadows.length && !shadows.length) add({ component: comp, where: null, what: 'shadow', figma: `draws ${figmaShadows.length === 1 ? 'one' : figmaShadows.length}`, code: 'none', write: themeShadowFor(theme, fx) ?? 'shadow-…' });
      else if (!figmaShadows.length && shadows.length) add({ component: comp, where: null, what: 'shadow', figma: 'draws none', code: shadows.map((c) => c.cls).join(' '), write: 'shadow-none, or a shadow in Figma' });
    }
    // TW4: motion, from the prototype's transitions.
    const mo = (motion[comp] ?? []).filter((m) => m && m.type !== 'INSTANT' && m.duration > 0 && m.trigger !== 'AFTER_TIMEOUT');
    if (mo.length) {
      const m = mo.find((x) => TRIGGER_STATE[x.trigger]) ?? mo[0];
      const ms = Math.round(m.duration * 1000), fe = figmaEasing(m.easing);
      const plain = all.filter((c) => !c.variants.length);
      const animates = plain.some((c) => /^transition(-|$)/.test(c.cls) && c.cls !== 'transition-none');
      const durs = plain.filter((c) => /^duration-/.test(c.cls));
      const durMs = (c) => { const n = c.cls.slice(9); const t = themeValue(theme, 'duration', n); if (t != null) return timeMs(t); if (/^\d+$/.test(n)) return Number(n); const b = /^\[(.+)\]$/.exec(n); return b ? timeMs(b[1]) : null; };
      const msClass = [75, 100, 150, 200, 300, 500, 700, 1000].includes(ms) ? `duration-${ms}` : `duration-[${ms}ms]`;
      if (!animates && !durs.length) add({ component: comp, where: TRIGGER_STATE[m.trigger] ?? null, what: 'motion', figma: `${ms}ms ${fe.css ?? fe.spring}`, code: 'none: it changes at once', write: `transition ${msClass}` });
      else {
        // Tailwind's own default when no duration class: 150ms.
        const code = durs.length ? durMs(durs[0]) : 150;
        if (code != null && Math.abs(code - ms) > 10) add({ component: comp, where: TRIGGER_STATE[m.trigger] ?? null, what: 'duration', figma: `${ms}ms`, code: durs.length ? durs.map((c) => c.cls).join(' ') : 'transition (150ms)', write: msClass });
        const eases = plain.filter((c) => /^ease-/.test(c.cls));
        if (fe.css && eases.length) {
          const css = (c) => { const n = c.cls.slice(5); return themeValue(theme, 'ease', n) ?? DEFAULT_EASE[n] ?? (/^\[(.+)\]$/.exec(n)?.[1]?.replace(/_/g, ' ') ?? null); };
          if (!eases.some((c) => css(c) && sameEasing(css(c), fe.css) !== false)) add({ component: comp, where: TRIGGER_STATE[m.trigger] ?? null, what: 'easing', figma: fe.css, code: eases.map((c) => c.cls).join(' '), write: `ease-[${fe.css.replace(/\s+/g, '_')}]` });
        }
      }
    }
    // TW5: each mode beyond the first, its colours as the theme's override block or a dark: class draws them.
    const resting = s.colors ?? {};
    for (const mode of modes) {
      const values = colours[mode.snapshotKey] ?? {};
      const override = modeOverrides(themeCss, mode.cssSelector);
      const prefix = /dark/i.test(`${mode.cssSelector} ${mode.name} ${mode.snapshotKey}`) ? 'dark' : /^class:(.+)$/.exec(String(mode.cssSelector ?? ''))?.[1] ?? null;
      for (const role of ['fill', 'text', 'stroke']) {
        const tok = resting[role]?.token;
        const figma = tok ? values[tok] : null;
        if (!figma || !parseColor(figma)) continue;
        const p = ROLE_PREFIX[role];
        const inMode = prefix ? roleClasses(restClasses.filter((c) => c.variants.length === 1 && c.variants[0] === prefix), role) : [];
        const drawn = inMode.length ? inMode : roleClasses(restClasses.filter((c) => !c.variants.length), role);
        if (!drawn.length) continue;
        const v = colourIn(drawn[0].cls, p, theme, override);
        if (!v || !parseColor(v)) continue;
        if (!sameColor(v, figma)) {
          const name = nameIn(varOf(tok, false), 'color');
          add({ component: comp, where: mode.name, what: role === 'fill' ? 'fill' : role === 'text' ? 'text colour' : 'border colour', figma: `${tok} (${figma})`, code: `${inMode.length ? `${prefix}:` : ''}${drawn[0].cls} (${v})`,
            write: inMode.length ? `${p}-${name}, with --color-${name} set in the ${mode.name} block` : `--color-${name}: ${figma} in the ${mode.name} block` });
        }
      }
    }
  }
  return out;
}
// The theme's shadow named after Figma's effect style, when there is one.
function themeShadowFor(theme, fx) {
  const style = (fx.effects ?? []).map((e) => e.style ?? e.effectStyle).find(Boolean);
  if (!style) return null;
  const k = String(style).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const [, names] of theme.get('shadow') ?? []) { const n = names.find((x) => x === k || k.endsWith(x)); if (n) return `shadow-${n}`; }
  return null;
}

export function findingLine(f) {
  return `${f.component}${f.where ? ` (${f.where})` : ''}: ${f.what}, Figma ${f.figma}, the code writes ${f.code}; write ${f.write}`;
}
