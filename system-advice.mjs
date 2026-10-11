// system-advice.mjs - what keeps a design system healthy as it grows, advice only (never a failure).
//
// Each function is pure over text the audit already reads; the audit prints them as one block, "🧭 System health".
//   • modes set deep inside a product (L7): a mode attribute the theme switches on (data-theme, data-color…) written on
//     an element other than the page's root, so part of the page draws in another mode than the rest;
//   • two themes in one product (K14): a product that brings in two of the system's theme stylesheets, one overriding
//     the other by the order they load;
//   • semantic tokens with no description (F8): what a token is for, written in Figma, is what an agent reads to pick it;
//   • catalogue-only patches (F11): a Storybook preview stylesheet that styles a component, so the catalogue shows it
//     right while the products draw it as the code does;
//   • near-duplicate components (F14): two components whose own rules are nearly the same, one maybe a variant of the
//     other (after several are built at once, this is where they drift into copies);
//   • tokens named by look (I17): a semantic token named for its colour or a scale step (blue-500) rather than its role
//     (text/subtle), which agents then pick by appearance.
//   • aliases to a removed token: a Figma variable that points at a variable no longer in the file (the capture records it,
//     brokenAliases), and a token in the code that points at one declared nowhere, so it always shows its fallback.

import { sameInEveryMode } from './prune-check.mjs';

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

// L7: each place a product sets one of those attributes on an element other than the page's root (<html>, <body>),
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

// K14: the system's theme stylesheets each product brings in (an @import, a <link>, an import in a script), by their
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

// F8: the semantic tokens (not the primitives) with no description in Figma (tokenMeta), from the vars snapshot.
// → { total, missing: [name, …] }.
export function undescribedTokens(vars, { primitivePrefix = 'primitives/' } = {}) {
  const names = new Set();
  for (const mode of Object.values(vars?.color ?? {})) for (const n of Object.keys(mode ?? {})) names.add(n);
  for (const n of Object.keys(vars?.sizing ?? {})) names.add(n);
  const semantic = [...names].filter((n) => !n.startsWith('_') && !n.startsWith(primitivePrefix)).sort();
  const meta = vars?.tokenMeta ?? {};
  const said = (n) => String(meta[n]?.description ?? meta[n.replace(/\/colou?r$/, '')]?.description ?? '').trim();
  return { total: semantic.length, missing: semantic.filter((n) => !said(n)) };
}

// F11: rules in Storybook's own preview styles (.storybook/*.css, a <style> in preview-head.html) whose selector names a
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

// F14: pairs of components whose own rules (the declarations on their base class) are nearly the same. css: the
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

// I17: semantic tokens named by look: a colour word or a scale step (50, 100 … 900) as a part of the name.
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

// The style guide's To do rows for the tokens (F8, L9), under The system: the semantic tokens with no description, for
// whoever keeps Figma; the same value written by hand in two tokens and the tokens one component uses, a decision each. vars: the vars
// snapshot. users: token → [component, …] (contract-gen tokenUsers), or null when no contracts were written.
// → [{ kind, who, say, todo }], none when there is nothing to do.
const some = (list, n = 4, more = 'more') => list.slice(0, n).join(list.some((x) => x.includes(',')) ? '; ' : ', ') + (list.length > n ? `${list.some((x) => x.includes(',')) ? ';' : ','} and ${list.length - n} ${more}` : '');
const group = (g) => (g.length > 3 ? `${g.slice(0, 2).join(', ')}, and ${g.length - 2} more` : g.length === 3 ? `${g[0]}, ${g[1]}, and ${g[2]}` : g.join(' and '));
export function tokenTodos({ vars = {}, users = null, dangling = [], primitivePrefix = 'primitives/' } = {}) {
  const out = [];
  const ud = undescribedTokens(vars, { primitivePrefix });
  if (ud.missing.length) out.push({ kind: 'Description', who: 'figma',
    say: `${ud.missing.length} of ${ud.total} semantic tokens have no description in Figma (${some(ud.missing)}).`,
    todo: 'Write what each one is for in its variable\'s description in Figma. Agents read it to pick the right token. Each token\'s panel on this page shows it, or says Not written yet.' });
  const same = sameInEveryMode(vars);
  if (same.length) out.push({ kind: 'Same value', who: 'both',
    say: `${same.length} group${same.length === 1 ? ' of tokens holds' : 's of tokens hold'} the same value written by hand rather than pointing at one primitive (${some(same.map(group), 3, 'more groups')}).`,
    todo: 'Decide for each group whether one is enough. Keep one in Figma and point the others at it, or keep them apart when they are meant to differ later. Ask Claude for every group.' });
  const broken = brokenFigmaAliases(vars);
  if (broken.length) out.push({ kind: 'Broken alias', who: 'figma',
    say: `${broken.length} Figma variable${broken.length === 1 ? ' points' : 's point'} at a variable that is no longer in the file (${some([...new Set(broken.map((b) => b.name + (b.target && !/^VariableID:/.test(b.target) ? ` to ${b.target}` : '')))])}).`,
    todo: 'Point each one at the variable that replaced it in Figma, or give it its own value.' });
  if (dangling?.length) out.push({ kind: 'Broken alias', who: 'code',
    say: `${dangling.length} token${dangling.length === 1 ? ' in the code points' : 's in the code point'} at a token declared nowhere, so ${dangling.length === 1 ? 'it shows' : 'they show'} only ${dangling.length === 1 ? 'its' : 'their'} fallback (${some(dangling.map((d) => `${d.token ?? d.file + ':' + d.line} to ${d.target}${d.removed ? `, removed in ${d.removed.sha}` : ''}`))}).`,
    todo: 'Point each one at the token that replaced it. Tell Claude to do it.' });
  const single = [...(users ?? new Map())].filter(([, who]) => who.length === 1).map(([t, who]) => `${t.replace(/\./g, '/')} in ${who[0]}`).sort();
  if (single.length) out.push({ kind: 'Single use', who: 'both',
    say: `${single.length} token${single.length === 1 ? ' is' : 's are'} used by one component only (${some(single, 8)}).`,
    todo: 'Decide for each whether it stays shared or becomes that component\'s own token.' });
  return out;
}
