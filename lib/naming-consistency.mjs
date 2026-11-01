// naming-consistency.mjs - one way of writing names across the design system.
//
// A system whose properties are written "Show Icon" on one component, "show-icon" on another and "showIcon" on a third
// reads as three systems, and every person and agent using it has to guess. The convention is the one most of the
// system already follows: each property name is read for its style (Title Case words, lower case words, kebab-case,
// camelCase, PascalCase, snake_case), the style most names are written in wins, and every name written otherwise is a
// difference with its rename into that style. The same for the options of variant properties (True or true, Default
// or default), and an option one letter away from a word the system writes elsewhere ("sucess" beside "success") is
// named as the word it meant. Single words fit every style that writes them that way ("Label" fits Title Case and
// PascalCase, "label" fits the lower ones).
//
//   import { namingFindings } from './naming-consistency.mjs'
//   namingFindings({ components: { buttonPrimary: { properties: { 'label-content': {…}, State: { variantOptions: [...] } } } } })
//   → { props: { style, count, of }, options: { style, count, of }, findings: [{ component, kind, name, want, why }] }

export const STYLES = {
  title: 'Title Case words',
  lowerWords: 'lower case words',
  kebab: 'kebab-case',
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
};

// The words of a name, lower case: "Show dividerLine Top" → [show, divider, line, top].
export function wordsOf(name) {
  return String(name ?? '').replace(/#[\d:]+$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-/]+/).map((w) => w.toLowerCase()).filter(Boolean);
}

// The styles a name is written in (a single word fits several). → [style]
export function stylesOf(name) {
  const n = String(name ?? '').replace(/#[\d:]+$/, '').trim();
  if (!n) return [];
  if (/^[A-Z][a-z0-9]*$/.test(n)) return ['title', 'pascal'];
  if (/^[a-z][a-z0-9]*$/.test(n)) return ['lowerWords', 'kebab', 'camel', 'snake'];
  if (/^[A-Z][a-z0-9]*( [A-Z][a-z0-9]*)+$/.test(n)) return ['title'];
  if (/^[a-z][a-z0-9]*( [a-z][a-z0-9]*)+$/.test(n)) return ['lowerWords'];
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(n)) return ['kebab'];
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(n)) return ['snake'];
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(n)) return ['camel'];
  if (/^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(n)) return ['pascal'];
  return [];   // mixed: "show-Icon", "title Content", "Show dividerLine Top"
}

// A name written in a style. → string
export function inStyle(name, style) {
  const w = wordsOf(name);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  switch (style) {
    case 'title': return w.map(cap).join(' ');
    case 'lowerWords': return w.join(' ');
    case 'kebab': return w.join('-');
    case 'snake': return w.join('_');
    case 'camel': return w.map((x, i) => (i ? cap(x) : x)).join('');
    case 'pascal': return w.map(cap).join('');
    default: return String(name);
  }
}

// The style most names are written in: each name counts once for every style it fits; a tie goes to the style of
// more names of two words or more (they say the most). → { style, count, of } | null
export function dominantStyle(names) {
  const list = names.map((n) => String(n ?? '').replace(/#[\d:]+$/, '').trim()).filter(Boolean);
  if (list.length < 3) return null;
  const count = {}, multi = {};
  for (const n of list) for (const s of stylesOf(n)) { count[s] = (count[s] ?? 0) + 1; if (wordsOf(n).length > 1) multi[s] = (multi[s] ?? 0) + 1; }
  const ranked = Object.keys(count).sort((a, b) => count[b] - count[a] || (multi[b] ?? 0) - (multi[a] ?? 0));
  if (!ranked.length || !(multi[ranked[0]] ?? 0) && list.some((n) => wordsOf(n).length > 1)) {
    // Single words only agree with each other: the style of the multi-word names decides.
    const byMulti = Object.keys(multi).sort((a, b) => multi[b] - multi[a]);
    if (!byMulti.length) return null;
    return { style: byMulti[0], count: count[byMulti[0]], of: list.length };
  }
  return { style: ranked[0], count: count[ranked[0]], of: list.length };
}

// One letter added, missing, changed or two swapped.
function oneOff(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
// Words a system's options use, to name the one a misspelt option meant.
const KNOWN = ['success', 'error', 'warning', 'info', 'neutral', 'positive', 'negative', 'default', 'hover', 'focus', 'pressed', 'active', 'selected',
  'disabled', 'enabled', 'primary', 'secondary', 'tertiary', 'small', 'medium', 'large', 'filled', 'outlined', 'checked', 'unchecked', 'current', 'idle'];

// props: { component: { properties: { name: { type?, variantOptions? } } } } (the Figma component props snapshot).
export function namingFindings(snapshot = {}) {
  const comps = Object.entries(snapshot.components ?? snapshot).filter(([n, v]) => !n.startsWith('_') && v && typeof v === 'object' && (v.properties || v.props));
  const props = comps.flatMap(([c, v]) => Object.entries(v.properties ?? v.props ?? {}).map(([name, d]) => ({ component: c, name: name.replace(/#[\d:]+$/, ''), def: d ?? {} })));
  const options = props.flatMap((p) => (Array.isArray(p.def.variantOptions) ? p.def.variantOptions : []).map((o) => ({ component: p.component, prop: p.name, name: String(o) })));
  const findings = [];
  const pd = dominantStyle(props.map((p) => p.name));
  if (pd) for (const p of props) {
    if (stylesOf(p.name).includes(pd.style)) continue;
    findings.push({ component: p.component, kind: 'property', name: p.name, want: inStyle(p.name, pd.style), why: `${pd.count} of the system's ${pd.of} property names are ${STYLES[pd.style]}` });
  }
  // Options are words a person reads in the panel: their case, and a word written two ways.
  const od = dominantStyle(options.map((o) => o.name).filter((n) => /^[A-Za-z][A-Za-z0-9 ]*$/.test(n)));
  const vocabulary = new Set([...KNOWN, ...options.map((o) => o.name.toLowerCase())]);
  for (const o of options) {
    const lower = o.name.toLowerCase();
    const meant = /^[a-z]+$/i.test(o.name) && !KNOWN.includes(lower) ? [...vocabulary].find((w) => w !== lower && oneOff(lower, w) && (KNOWN.includes(w) || options.some((x) => x.name.toLowerCase() === w && x.component !== o.component))) : null;
    if (meant) { findings.push({ component: o.component, kind: 'option', prop: o.prop, name: o.name, want: od ? inStyle(meant, od.style) : meant, why: `"${o.name}" reads as a misspelling of "${meant}"` }); continue; }
    if (od && /^[A-Za-z][A-Za-z0-9 ]*$/.test(o.name) && !stylesOf(o.name).includes(od.style)) findings.push({ component: o.component, kind: 'option', prop: o.prop, name: o.name, want: inStyle(o.name, od.style), why: `${od.count} of the system's ${od.of} options are ${STYLES[od.style]}` });
  }
  return { props: pd, options: od, findings };
}

// The line the audit prints for each, under the props check: a difference the Figma file owns.
export function namingLine(f) {
  return f.kind === 'property'
    ? `${f.component} property "${f.name}" is named differently from the rest of the system: rename it "${f.want}" in Figma (${f.why})`
    : `${f.component} option "${f.name}" of ${f.prop} is named differently from the rest of the system: rename it "${f.want}" in Figma (${f.why})`;
}
