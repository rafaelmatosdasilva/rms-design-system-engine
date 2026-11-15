// system-advice.mjs - what keeps a design system healthy as it grows, advice only (never a failure).
//
// Each function is pure over text the audit already reads; the audit prints them as one block, "🧭 System health".
//   • modes set deep inside a product: a mode attribute the theme switches on (data-theme, data-color…) written on
//     an element other than the page's root, so part of the page draws in another mode than the rest;
//   • two themes in one product: a product that brings in two of the system's theme stylesheets, one overriding
//     the other by the order they load;
//   • semantic tokens with no description: what a token is for, written in Figma, is what an agent reads to pick it;
//   • catalogue-only patches: a Storybook preview stylesheet that styles a component, so the catalogue shows it
//     right while the products draw it as the code does;
//   • near-duplicate components: two components whose own rules are nearly the same, one maybe a variant of the
//     other (after several are built at once, this is where they drift into copies);
//   • tokens named by look: a semantic token named for its colour or a scale step (blue-500) rather than its role
//     (text/subtle), which agents then pick by appearance.
//   • brand or product names in token keys: a token named after a product or a brand (harborNotes/accent,
//     acme/primary) stops making sense the day a second product or brand uses the system;
//   • aliases to a removed token: a Figma variable that points at a variable no longer in the file (the capture records it,
//     brokenAliases), and a token in the code that points at one declared nowhere, so it always shows its fallback.
//   • a product's near-copy of a system component: a class a product styles almost as the system styles one of
//     its components, a decision rather than a drift: use the component (a new option if it needs one), or add the new
//     one to the system on purpose.

import { sameInEveryMode } from './prune-check.mjs';
import { styleOnly } from './a11y-static.mjs';

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// The attributes a theme switches modes on: [data-x] or [data-x="…"] in a selector whose rule declares custom properties.
export function modeAttributes(themeCss) {
  const attrs = new Set();
  for (const m of String(themeCss ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/--[\w-]+\s*:/.test(m[2])) continue;
    for (const a of m[1].matchAll(/\[\s*(data-[\w-]+)\s*(?:[~|^$*]?=\s*["']?[^\]"']*["']?)?\s*\]/g)) attrs.add(a[1]);
  }
  return [...attrs].sort();
}

// each place a product sets one of those attributes on an element other than the page's root (<html>, <body>),
// in markup or from a script. files: [{ file, text }]. → [{ file, line, attr, on }].
export function modesBelowRoot(files, attrs) {
  if (!attrs?.length) return [];
  const out = [];
  const names = attrs.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const tagRe = new RegExp(`<([A-Za-z][\\w.-]*)\\b[^>]*?\\s(${names})\\s*=`, 'g');
  const setRe = new RegExp(`([\\w$.\\]\\[)]+)\\.setAttribute\\(\\s*['"](${names})['"]`, 'g');
  const dataRe = new RegExp(`([\\w$.\\]\\[)]+)\\.dataset\\.(\\w+)\\s*=`, 'g');
  const datasetNames = new Set(attrs.map((a) => a.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())));
  const isRoot = (expr) => /(^|\.)(documentElement|body)$/.test(expr) || /^(document\.)?(documentElement|body)$/.test(expr);
  for (const { file, text } of files ?? []) {
    const src = String(text ?? '');
    for (const m of src.matchAll(tagRe)) if (!/^(html|body)$/i.test(m[1])) out.push({ file, line: lineOf(src, m.index), attr: m[2], on: `<${m[1]}>` });
    for (const m of src.matchAll(setRe)) if (!isRoot(m[1])) out.push({ file, line: lineOf(src, m.index), attr: m[2], on: m[1] });
    for (const m of src.matchAll(dataRe)) if (datasetNames.has(m[2]) && !isRoot(m[1])) out.push({ file, line: lineOf(src, m.index), attr: `data-${m[2].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, on: m[1] });
  }
  return out;
}

// the system's theme stylesheets each product brings in (an @import, a <link>, an import in a script), by their
// file names. themes: the names of the system's theme files (theme.css, brand-b.css). products: { name: [{ file, text }] }.
// → [{ product, themes: [name, …], files }] for each product that brings in two or more different ones.
export function productsWithTwoThemes(products, themes) {
  const names = [...new Set((themes ?? []).map((t) => String(t).split('/').pop()).filter(Boolean))];
  if (names.length < 2) return [];   // one theme file: nothing to bring in twice
  const out = [];
  for (const [product, files] of Object.entries(products ?? {})) {
    const found = new Map();
    for (const { file, text } of files) {
      for (const m of String(text ?? '').matchAll(/(?:@import\s+(?:url\()?|href\s*=\s*|import\s+(?:[^'"]*?\sfrom\s+)?|require\(\s*)['"]([^'"]+\.(?:css|scss|less))['"]/g)) {
        const base = m[1].split('/').pop();
        if (names.includes(base)) { if (!found.has(base)) found.set(base, new Set()); found.get(base).add(file); }
      }
    }
    if (found.size > 1) out.push({ product, themes: [...found.keys()].sort(), files: [...new Set([...found.values()].flatMap((s) => [...s]))].sort() });
  }
  return out;
}

// the semantic tokens (not the primitives) with no description in Figma (tokenMeta), from the vars snapshot.
// → { total, missing: [name, …] }.
export function undescribedTokens(vars, { primitivePrefix = 'primitives/' } = {}) {
  const names = new Set();
  for (const mode of Object.values(vars?.color ?? {})) for (const n of Object.keys(mode ?? {})) names.add(n);
  for (const n of Object.keys(vars?.sizing ?? {})) names.add(n);
  const semantic = [...names].filter((n) => !n.startsWith('_') && !n.startsWith(primitivePrefix)).sort();
  const meta = vars?.tokenMeta ?? {};
  const said = (n) => String(meta[n]?.description ?? meta[n.replace(/\/colou?r$/, '')]?.description ?? '').trim();
  return { total: semantic.length, semantic, missing: semantic.filter((n) => !said(n)) };
}

// rules in Storybook's own preview styles (.storybook/*.css, a <style> in preview-head.html) whose selector names a
// component's class. files: [{ file, text }] under .storybook. classes: { component: '.base-class' }.
// → [{ file, line, selector, component }].
export function catalogueOnlyPatches(files, classes) {
  const out = [];
  const list = Object.entries(classes ?? {}).filter(([, c]) => typeof c === 'string' && /^\.[\w-]+$/.test(c));
  if (!list.length) return out;
  for (const { file, text } of files ?? []) {
    const src = String(text ?? '');
    const css = /\.html?$/i.test(file) ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ at: m.index + m[0].indexOf(m[1]), css: m[1] })) : [{ at: 0, css: src }];
    for (const { at, css: sheet } of css) {
      for (const m of sheet.matchAll(/([^{}@;]+)\{[^{}]*\}/g)) {
        const selector = m[1].trim();
        const hit = list.find(([, c]) => new RegExp(`${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(selector));
        if (hit) out.push({ file, line: lineOf(src, at + m.index + m[0].indexOf(selector)), selector, component: hit[0] });
      }
    }
  }
  return out;
}

// pairs of components whose own rules (the declarations on their base class) are nearly the same. css: the
// system's stylesheet. classes: { component: '.base-class' }. Each needs `min` declarations; a pair counts at `share`.
// → [{ a, b, same, of }], most alike first.
export function nearDuplicateComponents(css, classes, { min = 5, share = 0.8 } = {}) {
  const decls = new Map();
  const src = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [name, cls] of Object.entries(classes ?? {})) {
    if (typeof cls !== 'string' || !/^\.[\w-]+$/.test(cls)) continue;
    const re = new RegExp(`(^|[},])\\s*${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`, 'g');
    const set = new Set();
    for (const m of src.matchAll(re)) for (const d of m[2].split(';')) { const t = d.trim().replace(/\s+/g, ' '); if (t && t.includes(':')) set.add(t); }
    if (set.size >= min) decls.set(name, set);
  }
  const out = [];
  const names = [...decls.keys()].sort();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = decls.get(names[i]), b = decls.get(names[j]);
    const same = [...a].filter((d) => b.has(d)).length, of = new Set([...a, ...b]).size;
    if (same / of >= share) out.push({ a: names[i], b: names[j], same, of });
  }
  return out.sort((x, y) => y.same / y.of - x.same / x.of || x.a.localeCompare(y.a));
}

// the declarations of each rule whose selector is one class (.name { … }), merged across the rules of that class.
// css: a stylesheet (or the style blocks of a page). → Map<class (no dot), { decls: Set<'prop: value'>, line }>.
export function classRules(css) {
  const src = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out = new Map();
  for (const m of src.matchAll(/(?:^|(?<=[{};]))\s*\.([A-Za-z_][\w-]*)\s*\{([^{}]*)\}/g)) {
    const e = out.get(m[1]) ?? { decls: new Set(), line: lineOf(src, m.index + m[0].indexOf('.')) };
    for (const d of m[2].split(';')) { const t = d.trim().replace(/\s+/g, ' '); if (t && t.includes(':')) e.decls.add(t); }
    out.set(m[1], e);
  }
  return out;
}

// each rule of `rules` that nearly copies a system component's own rule: `share` of the larger one's declarations
// written alike in both, each with at least `min`. system: Map<component, Set<decl>>. own: the system's classes (its own rules are not copies).
// → [{ cls, line, like, same, of, differ: [property] }], the most alike component for each.
export function nearCopies(rules, system, { own = new Set(), min = 5, share = 0.75 } = {}) {
  const out = [];
  for (const [cls, r] of rules ?? []) {
    if (own.has(cls) || r.decls.size < min) continue;
    let best = null;
    for (const [like, decls] of system ?? []) {
      if (decls.size < min) continue;
      const same = [...r.decls].filter((d) => decls.has(d)).length, of = Math.max(r.decls.size, decls.size);
      if (same / of >= share && (!best || same / of > best.same / best.of)) best = { like, same, of, decls };
    }
    if (best) out.push({ cls, line: r.line, like: best.like, same: best.same, of: best.of, differ: [...new Set([...r.decls, ...best.decls].filter((d) => !(r.decls.has(d) && best.decls.has(d))).map((d) => d.split(':')[0].trim()))] });
  }
  return out;
}

// The system's components as near-copy targets: each component's own declarations in its stylesheet.
// css: the system's stylesheet. classes: { component: '.base-class' }. → { system: Map<component, Set>, own: Set<class> }.
export function systemRules(css, classes) {
  const rules = classRules(css), system = new Map(), own = new Set();
  for (const [name, cls] of Object.entries(classes ?? {})) {
    if (typeof cls !== 'string' || !/^\.[\w-]+$/.test(cls)) continue;
    own.add(cls.slice(1));
    const r = rules.get(cls.slice(1));
    if (r) system.set(name, r.decls);
  }
  return { system, own };
}

// across the products: files { product: [{ file, text }] } (their stylesheets, and the <style> blocks of their pages
// and components). → [{ product, file, line, cls, like, same, of, differ }].
export function productCopies(products, css, classes, opts = {}) {
  const { system, own } = systemRules(css, classes);
  if (!system.size) return [];
  const out = [];
  for (const [product, files] of Object.entries(products ?? {})) for (const { file, text } of files ?? []) {
    if (/\.html?$/i.test(file) && (files ?? []).some((f) => f.file === file.replace(/\.(html?)$/i, '.src.$1'))) continue;   // built from the .src beside it
    const sheet = /\.(css|scss|less)$/i.test(file);
    if (!sheet && !/<style\b/i.test(String(text ?? ''))) continue;
    for (const c of nearCopies(classRules(sheet ? text : styleOnly(text)), system, { own, ...opts })) out.push({ product, file, ...c });
  }
  return out;
}

// semantic tokens named by look: a colour word or a scale step (50, 100 … 900) as a part of the name.
// names: token names (Figma's, with /). → [{ name, word }].
const LOOK = /^(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|slate|zinc|stone|black|white|[1-9]00|50|950)$/i;
export function namedByLook(names, { primitivePrefix = 'primitives/' } = {}) {
  const out = [];
  for (const n of names ?? []) {
    if (!n || n.startsWith('_') || n.startsWith(primitivePrefix)) continue;
    const word = n.split(/[\/\-_.\s]+/).find((p) => LOOK.test(p));
    if (word) out.push({ name: n, word });
  }
  return out;
}

// tokens whose name holds a product's or a brand's name. names: token names (Figma's, with /). brands: the names to
// look for (each product, the declared brands, the system's package scope). components: the system's components, whose
// own tokens are named after them on purpose. → [{ name, brand }].
const squash = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function brandNamedTokens(names, { brands = [], components = [] } = {}) {
  const first = new Map(); for (const b of (brands ?? []).filter(Boolean)) if (!first.has(squash(b))) first.set(squash(b), b);   // each name as first written
  const want = [...first.entries()].filter(([k]) => k.length >= 2);
  const comps = new Set((components ?? []).map(squash));
  const out = [];
  for (const n of names ?? []) {
    if (!n || n.startsWith('_')) continue;
    const segs = String(n).split('/');
    if (comps.has(squash(segs[0]))) continue;   // a component's own token, named after it
    const hit = want.find(([k]) => segs.some((seg) => { const q = squash(seg); return q === k || (k.length >= 4 && q.includes(k)); }));
    if (hit) out.push({ name: n, brand: hit[1] });
  }
  return out;
}

// A Figma variable that points at a variable no longer in the file, as the capture recorded it (vars.brokenAliases:
// [{ name, mode, target }], target the missing variable's name, or its id when only that is known). → the same list.
export function brokenFigmaAliases(vars) {
  return (Array.isArray(vars?.brokenAliases) ? vars.brokenAliases : []).filter((b) => b && b.name).map((b) => ({ name: b.name, mode: b.mode ?? null, target: b.target ?? b.id ?? null }));
}

// A token in the code that points at a token declared nowhere: var(--x, fallback) whose --x no file declares (as --x: or
// setProperty('--x')), so it always shows its fallback. Listed in a token's own definition (--a: var(--x, #fff)), and
// anywhere else when --x was declared once (removed(--x) finds it in the history: { sha, date }). Without a fallback the
// Clean CSS gate already fails it. files: [{ file, text }]. → [{ file, line, token, target, removed }].
export function danglingCodeAliases(files, { removed = () => null } = {}) {
  const declared = new Set();
  for (const { text } of files ?? []) {
    for (const m of String(text ?? '').matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);
    for (const m of String(text ?? '').matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) declared.add(m[1]);
  }
  const out = [], asked = new Map();
  const wasDeclared = (t) => { if (!asked.has(t)) asked.set(t, removed(t) ?? null); return asked.get(t); };
  for (const { file, text } of files ?? []) {
    const src = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*,/g)) {
      const target = m[1];
      if (declared.has(target)) continue;
      // The declaration it sits in: a token's own definition when the property before it is a custom property.
      const before = src.slice(Math.max(0, src.lastIndexOf(';', m.index) + 1, src.lastIndexOf('{', m.index) + 1), m.index);
      const def = /(--[\w-]+)\s*:[^:]*$/.exec(before);
      const was = wasDeclared(target);
      if (!def && !was) continue;
      out.push({ file, line: lineOf(src, m.index), token: def ? def[1] : null, target, removed: was });
    }
  }
  return out;
}

// A colour token the code mixes away: color-mix() gives it no share of the mix (the other colour takes 100%), so the
// token never shows, whatever value it is given. The share is read where the code writes it: a percentage, or a token
// times a percentage (calc(var(--x) * 1%)), its value from the vars snapshot. A stylesheet function that returns a
// color-mix() (Sass: @function f($a, $b, $c) { @return color-mix(…) }) is read through each call to it, its arguments
// put in its parameters' places. The usual cause: an opacity token given to the colour it is mixed with, rather than to
// the token's own. files: [{ file, text }]. vars: the vars snapshot. → [{ file, line, token, other, share, by }]
const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
const callAt = (text, open) => { let d = 0; for (let i = open; i < text.length; i++) { if (text[i] === '(') d++; else if (text[i] === ')' && --d === 0) return text.slice(open + 1, i); } return null; };
export function mixedAwayColours(files, vars = {}) {
  const numbers = new Map();
  const put = (name, v) => { const n = parseFloat(v); if (!isNaN(n)) numbers.set('--' + String(name).replace(/\//g, '-'), n); };
  for (const [k, v] of Object.entries(vars?.sizing ?? {})) if (typeof v !== 'object') put(k, v);
  const fns = new Map();
  for (const { text } of files ?? []) {
    for (const m of String(text ?? '').matchAll(/@function\s+([\w-]+)\s*\(([^)]*)\)\s*\{\s*@return\s+([^;]*color-mix\([^;]*);/g)) fns.set(m[1], { params: m[2].split(',').map((x) => x.trim().split(':')[0]).filter(Boolean), body: m[3] });
  }
  const share = (w) => {
    if (w == null) return null;
    const lit = /^(-?[\d.]+)%$/.exec(w); if (lit) return +lit[1];
    const t = /^calc\(\s*var\(\s*(--[\w-]+)[^)]*\)\s*\*\s*([\d.]+)%\s*\)$/.exec(w) || /^calc\(\s*([\d.]+)%\s*\*\s*var\(\s*(--[\w-]+)[^)]*\)\s*\)$/.exec(w);
    if (!t) return null;
    const [name, k] = t[1].startsWith('--') ? [t[1], +t[2]] : [t[2], +t[1]];
    return numbers.has(name) ? numbers.get(name) * k : null;
  };
  const stop = (s) => { const m = /^(.*?)\s+((?:-?[\d.]+%)|(?:calc\(.*\)))$/.exec(s); return m ? { colour: m[1].trim(), w: m[2] } : { colour: s.trim(), w: null }; };
  const weightBy = (w) => (w && /var\(\s*(--[\w-]+)/.exec(w)?.[1]) || null;
  const tokenOf = (c) => /^var\(\s*(--[\w-]+)/.exec(c)?.[1] ?? null;
  const out = [], seen = new Set();
  const look = (file, line, args) => {
    const parts = splitTop(args); if (parts.length !== 3 || !/^in\s/.test(parts[0])) return;
    const a = stop(parts[1]), b = stop(parts[2]);
    let pa = share(a.w), pb = share(b.w);
    if (a.w == null && b.w == null) return;
    if (pa == null && a.w == null && pb != null) pa = 100 - pb;
    if (pb == null && b.w == null && pa != null) pb = 100 - pa;
    for (const [me, them, p, other] of [[a, b, pa, pb], [b, a, pb, pa]]) {
      const token = tokenOf(me.colour);
      if (!token || p == null || p > 0 || !(other > 0)) continue;
      const key = file + ':' + line + token; if (seen.has(key)) continue; seen.add(key);
      out.push({ file, line, token, other: tokenOf(them.colour) ?? them.colour, share: other, by: weightBy(them.w) ?? weightBy(me.w) });
    }
  };
  for (const { file, text } of files ?? []) {
    const src = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of src.matchAll(/color-mix\(/g)) {
      if (/@return\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;   // a function's own body: read through its calls
      const args = callAt(src, m.index + 'color-mix'.length); if (args != null) look(file, lineOf(src, m.index), args);
    }
    for (const [name, f] of fns) {
      for (const m of src.matchAll(new RegExp('(?<![\\w-])' + name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\(', 'g'))) {
        if (/@function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
        const args = callAt(src, m.index + name.length); if (args == null) continue;
        const given = splitTop(args); if (given.length !== f.params.length) continue;
        let body = f.body; f.params.forEach((p, i) => { body = body.split(p).join(given[i]); });
        const inner = callAt(body, body.indexOf('color-mix(') + 'color-mix'.length); if (inner != null) look(file, lineOf(src, m.index), inner);
      }
    }
  }
  return out;
}

// The style guide's To do rows for the tokens, under The system: the semantic tokens with no description, for
// whoever keeps Figma; the same value written by hand in two tokens and the tokens one component uses, a decision each. vars: the vars
// snapshot. users: token → [component, …] (contract-gen tokenUsers), or null when no contracts were written.
// → [{ kind, who, say, todo }], none when there is nothing to do.
const some = (list, n = 4, more = 'more') => list.slice(0, n).join(list.some((x) => x.includes(',')) ? '; ' : ', ') + (list.length > n ? `${list.some((x) => x.includes(',')) ? ';' : ','} and ${list.length - n} ${more}` : '');
const group = (g) => (g.length > 3 ? `${g.slice(0, 2).join(', ')}, and ${g.length - 2} more` : g.length === 3 ? `${g[0]}, ${g[1]}, and ${g[2]}` : g.join(' and '));
// Every token name in the vars snapshot: colours in every mode, sizing, primitives.
export const tokenNames = (vars) => [...new Set([...Object.values(vars?.color ?? {}).flatMap((m) => Object.keys(m ?? {})), ...Object.keys(vars?.sizing ?? {}), ...Object.values(vars?.primitives ?? {}).flatMap((m) => Object.keys(m ?? {}))])];
// A font family the code writes by hand (font-family: "Open Sans") rather than with the system's family variable: what
// is drawn there (and what inherits it) keeps that font in every brand. css: the system's stylesheets.
// → [{ selector, value }]
export function handWrittenFamilies(css = '') {
  const out = [];
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of m[2].matchAll(/(?:^|;)\s*font-family\s*:\s*([^;]+)/g)) {
      const v = d[1].trim();
      if (/^var\(|^(inherit|initial|unset|revert|revert-layer)$/i.test(v)) continue;
      // The page's own shell (html, body, :root, every element) is the app's, not a component's: a product sets its own.
      const sel = m[1].split(/[;}]/).pop().trim();
      if (sel.split(',').every((x) => /^(html|body|:root|\*|\*::before|\*::after)$/i.test(x.trim()))) continue;
      out.push({ selector: m[1].split(/[;}]/).pop().trim().replace(/\s+/g, ' '), value: v });
    }
  }
  return out;
}

export function tokenTodos({ vars = {}, dangling = [], mixedAway = [], brands = [], components = [], primitivePrefix = 'primitives/', css = '', componentTokens = null, usedTokens = null, codeNames = [] } = {}) {
  const out = [];
  // With what each token is used by known (usedTokens: in a component's code, named after it, bound on its Figma
  // component, or pointed at by one of those), a missing description is each of those components' to show, and what
  // is left is a token nothing uses: one finding, for Figma.
  // A token no component uses yet is no fault in a white-label system: kept for a brand or a component to come (each
  // token's panel says Not used yet), and no task, its description included.
  // A component's own tokens are written in its Documentation (each component's row); the system's row keeps the rest,
  // the shared ones no component lists as its own.
  const all = undescribedTokens(vars, { primitivePrefix });
  const own = componentTokens instanceof Set ? componentTokens : new Set();
  const isOwn = (n) => own.has(n) || own.has(String(n).replace(/\/colou?r$/, ''));
  const ud = { missing: usedTokens instanceof Set ? [] : all.missing.filter((n) => !isOwn(n)) };
  // How many shared tokens the check read, so a rule nothing breaks can say so as a share rather than as a phrase.
  ud.of = all.semantic.filter((n) => !isOwn(n)).length;
  if (ud.missing.length) out.push({ kind: 'Description', who: 'figma', n: ud.missing.length, of: ud.of,
    say: `${ud.missing.length} shared token${ud.missing.length === 1 ? '' : 's'} (no component holds ${ud.missing.length === 1 ? 'it' : 'them'} as its own) ${ud.missing.length === 1 ? 'has' : 'have'} no description in Figma (${some(ud.missing)}). Each component's own tokens are in its Documentation.`,
    todo: 'Write what each one is for in its variable\'s description in Figma. Agents read it to pick the right token. Each token\'s panel on this page shows it, or says Not written yet.' });
  const same = sameInEveryMode(vars);
  if (same.length) out.push({ kind: 'Same value', who: 'both',
    say: `${same.length} group${same.length === 1 ? ' of tokens holds' : 's of tokens hold'} the same value written by hand rather than pointing at one primitive (${some(same.map(group), 3, 'more groups')}).`,
    todo: 'Decide for each group whether one is enough. Keep one in Figma and point the others at it, or keep them apart when they are meant to differ later.' });
  const names = tokenNames(vars), branded = brandNamedTokens(names, { brands, components });
  if (branded.length) out.push({ kind: 'Brand in the name', who: 'figma', n: branded.length, of: names.length,
    say: `${branded.length} token${branded.length === 1 ? ' is' : 's are'} named after a product or brand (${some(branded.map((b) => `${b.name} for ${b.brand}`))}), a name that stops making sense when a second product or brand uses the system.`,
    todo: 'Rename each one in Figma to the role it plays (text/accent rather than harborNotes/accent).' });
  const broken = brokenFigmaAliases(vars);
  if (broken.length) out.push({ kind: 'Broken alias', who: 'figma',
    say: `${broken.length} Figma variable${broken.length === 1 ? ' points' : 's point'} at a variable that is no longer in the file (${some([...new Set(broken.map((b) => b.name + (b.target && !/^VariableID:/.test(b.target) ? ` to ${b.target}` : '')))])}).`,
    todo: 'Point each one at the variable that replaced it in Figma, or give it its own value.' });
  if (dangling?.length) out.push({ kind: 'Broken alias', who: 'code',
    say: `${dangling.length} token${dangling.length === 1 ? ' in the code points' : 's in the code point'} at a token declared nowhere, so ${dangling.length === 1 ? 'it shows' : 'they show'} only ${dangling.length === 1 ? 'its' : 'their'} fallback (${some(dangling.map((d) => `${d.token ?? d.file + ':' + d.line} to ${d.target}${d.removed ? `, removed in ${d.removed.sha}` : ''}`))}).`,
    todo: 'Point each one at the token that replaced it.' });
  if (mixedAway?.length) out.push({ kind: 'Colour never shows', who: 'code',
    say: `${mixedAway.length === 1 ? 'A colour token is' : `${mixedAway.length} colour tokens are`} mixed at 0% in the code, so ${mixedAway.length === 1 ? 'it never shows' : 'they never show'}, whatever value ${mixedAway.length === 1 ? 'it is' : 'they are'} given (${some(mixedAway.map((x) => `${x.token} in ${x.file}:${x.line} under ${x.other} at ${x.share}%`))}).`,
    todo: 'Give the mix\'s share to the token\'s own colour. When the share is an opacity token, it is the opacity of the token\'s colour, not of the colour it is mixed with. A developer does it in the code.' });
  const hand = handWrittenFamilies(css).filter((h) => !/monospace|mono\b/i.test(h.value));
  if (hand.length) out.push({ kind: 'Font written by hand', who: 'code',
    say: `The code writes ${hand.length === 1 ? 'a font family' : `${hand.length} font families`} by hand instead of the system's family variable (${some(hand.map((h) => `${h.value} on ${h.selector}`), 3)}). What is drawn there, and every component that inherits it, keeps that font whatever the brand or Figma says.`,
    todo: 'Write font-family with the system\'s family variable. A developer does it in the code.' });
  return out;
}

// ── The library's own conventions, beside its names ─────────────────────────────────────────────────────────────────
// A variant option named by its look (Color=Blue) where a role belongs (Tone=Primary): a colour word, never a shade's
// number (a size option of 100 is a size). props: the component-props snapshot. → [{ component, prop, option }]
const LOOK_WORD = /^(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|slate|zinc|stone|black|white)$/i;
export function optionsNamedByLook(props = {}) {
  const out = [];
  for (const [component, e] of Object.entries(props ?? {})) {
    if (component.startsWith('_') || !e || typeof e !== 'object') continue;
    for (const [k, d] of Object.entries(e.properties ?? {})) {
      if (d?.type !== 'VARIANT') continue;
      for (const o of d.variantOptions ?? []) if (String(o).split(/[\s\-_/.]+/).some((w) => LOOK_WORD.test(w))) out.push({ component, prop: k.replace(/#[\d:]+$/, ''), option: String(o) });
    }
  }
  return out;
}

// Spacing and size values off the library's own grid: the base (8, else 4) that 90% or more of its spacing, radius
// and size tokens are multiples of, and the ones that are not. Hairlines (2px and less) and pill radii (999px and
// more) are left out, and so is what is no spacing (a font size, a line height, an opacity, a border's width).
// vars: the variables snapshot. → { base, of, off: [{ name, value }] } | null (no base the library keeps)
const SPACING = /(^|\/)(space|spacing|spacer|gap|padding|margin|inset|radius|radii|size|width|height|offset)(\/|$|[A-Z])/i;
const NOT_SPACING = /font|line|letter|opacity|duration|delay|breakpoint|border|stroke|weight|z-?index|ratio/i;
export function offGrid(vars = {}) {
  const vals = [];
  for (const [name, x] of Object.entries(vars?.sizing ?? {})) {
    if (name.startsWith('_') || !SPACING.test(name) || NOT_SPACING.test(name)) continue;
    const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(x).trim());
    if (m && Math.abs(+m[1]) > 2 && Math.abs(+m[1]) < 999) vals.push({ name, value: +m[1] });
  }
  if (vals.length < 10) return null;   // too few to say what the library keeps
  for (const base of [8, 4]) {
    const off = vals.filter((v) => v.value % base !== 0);
    if (off.length <= vals.length * 0.1) return { base, of: vals.length, off };
  }
  return null;
}

// A mode spelled two ways across collections (Dark in one, dark mode in another): the modes are paired by their name,
// so the two never meet. vars: the variables snapshot. → [{ concept, spellings: [..] }]
export function modeSpellings(vars = {}) {
  const names = [...(vars?._collections?.colorModes ?? []), ...Object.values(vars?.modeVariants ?? {}).flatMap((c) => (c?.modes ?? []).map((m) => m?.name))].filter(Boolean).map(String);
  const by = new Map();
  for (const n of names) { const k = n.toLowerCase().replace(/[\s_-]+/g, '').replace(/mode$/, ''); if (!by.has(k)) by.set(k, new Set()); by.get(k).add(n); }
  return [...by.entries()].filter(([, s]) => s.size > 1).map(([concept, s]) => ({ concept, spellings: [...s] }));
}

// The status colours a system keeps, by family, whichever word it uses for each: one missing where the others are
// there (an error and a success colour, and no warning) is a state the products then colour by hand.
// names: every colour token's name. → { have: [families], missing: [families] } | null (fewer than two families)
const STATUS = { error: /(^|\/|-)(error|danger|negative|critical|destructive)(\/|-|$)/i, warning: /(^|\/|-)(warning|warn|alert|caution|attention)(\/|-|$)/i,
  success: /(^|\/|-)(success|positive|valid|confirm)(\/|-|$)/i, info: /(^|\/|-)(info|information|informative|notice)(\/|-|$)/i };
export function statusFamilies(names = []) {
  const have = Object.keys(STATUS).filter((f) => names.some((n) => STATUS[f].test(n)));
  return have.length < 2 ? null : { have, missing: Object.keys(STATUS).filter((f) => !have.includes(f)) };
}
