// specimen.mjs - the theme editor's specimen: a screen made of the system's own components, planned at build time and
// held to the same guardrail as every other thing the engine composes (ui-catalog.mjs checkUi, the check a prototype,
// --check-ui and the MCP check_ui tool run), so nothing on it is invented.
//
// What may be placed: a component the code renders (its renderings, else markup read from its code) that the catalog
// knows. Each one placed is checked as a composition node; one the check refuses is left off and said, never drawn.
// Without a catalog (no audit has run yet) nothing can be checked, so nothing is placed: the editor then previews the
// Showroom's screens only.
//
//   FAMILIES                      → [family, test of a component's name]: the industry's own names, first match wins
//   familyOf(name)                → its family, 'other', or null for a part of another (a row, a cell, a/b)
//   codeRendered(c)               → whether the code renders it (the view's component)
//   specimenPlan(components, catalog) → { sections: [{ key, title, says, components }], composition, check, refused }

import { checkUi } from './ui-catalog.mjs';

export const FAMILIES = [
  ['overlay', /modal|dialog|pop ?over|pop ?up|tooltip|drawer|sheet|toast|snackbar/i],
  ['button', /^(button|btn)(?!.*(row|group|calendar|keyboard|floating|header|dropdown|drop-down))/i],
  ['textarea', /text ?area/i],
  ['select', /drop ?down|select(?!or|ion)|combo ?box|picker/i],
  ['checkbox', /check ?box/i],
  ['radio', /radio/i],
  ['switch', /switch|^toggle/i],
  ['field', /input|text ?field|password|search ?(bar|field|input)|^search$|^field/i],
  ['chip', /chip/i],
  ['tag', /tag|badge|pill|lozenge/i],
  ['alert', /alert|info ?box|banner|notice|callout|feedback|error ?state|empty ?state/i],
  ['progress', /progress|loader|spinner|skeleton/i],
  ['nav', /^tab|segment|breadcrumb|stepper|pagination/i],
  ['card', /card/i],
  ['accordion', /accordion|disclosure|expand/i],
  ['data', /^table$|data ?grid|chart|timeline|list$/i],
];

export function familyOf(name) {
  const n = String(name ?? '');
  if (!n || n.includes('/') || /(row|cell|item|divider)$/i.test(n)) return null;
  return FAMILIES.find(([, re]) => re.test(n))?.[0] ?? 'other';
}

const CODE_FROM = /^(page|script|jsx|probe|vue|render|build)/i;
export const codeRendered = (c) => !!((c?.renders ?? []).some((r) => r?.markup) || (c?.markup && CODE_FROM.test(String(c.markupFrom ?? ''))));

// The sections, in the order a person reads a system: what you press, what you fill, what you choose, what it says
// back, how you move, what holds content, the data, then the rest. [key, title, says, families, at most per family]
const SECTIONS = [
  ['actions', 'Actions', 'Every button, in the variants its code renders.', ['button'], 99],
  ['forms', 'Forms', 'Fields, dropdowns and text areas.', ['field', 'select', 'textarea'], 6],
  ['choices', 'Choices', 'Checkboxes, radio buttons, switches and chips.', ['checkbox', 'radio', 'switch', 'chip'], 3],
  ['status', 'Status', 'Tags, badges and progress.', ['tag', 'progress'], 6],
  ['messages', 'Messages', 'Alerts, banners and the states a page can be in.', ['alert'], 4],
  ['navigation', 'Navigation', 'Tabs, segmented controls, breadcrumbs and steppers.', ['nav'], 6],
  ['surfaces', 'Surfaces', 'Cards and what folds open.', ['card', 'accordion'], 6],
  ['data', 'Data', 'Tables, charts and lists.', ['data'], 3],
];

export function specimenPlan(components = [], catalog = null) {
  if (!catalog?.components) return { sections: [], composition: null, check: null, refused: [], unchecked: true };
  // The usual order of emphasis first (primary, secondary, tertiary…), so the main actions lead; the rest as listed.
  const RANK = ['primary', 'secondary', 'tertiary', 'quaternary', 'positive', 'negative'];
  const rank = (n) => { const i = RANK.findIndex((w) => new RegExp(w, 'i').test(n)); return i < 0 ? RANK.length : i; };
  const cands = components.filter((c) => codeRendered(c) && familyOf(c.name)).map((c, i) => ({ c, i })).sort((x, y) => rank(x.c.name) - rank(y.c.name) || x.i - y.i).map((x) => x.c);
  // Each one is a node of a composition, checked as a prototype's are: one the catalog refuses is never placed.
  const refused = [], ok = [];
  for (const c of cands) {
    const r = checkUi({ component: c.name }, catalog);
    if (r.ok) ok.push(c); else refused.push({ name: c.name, why: r.findings.filter((f) => f.level === 'error').map((f) => f.message) });
  }
  const used = new Set(), sections = [];
  for (const [key, title, says, fams, max] of SECTIONS) {
    const names = fams.flatMap((f) => ok.filter((c) => familyOf(c.name) === f).slice(0, max).map((c) => c.name));
    names.forEach((n) => used.add(n));
    if (names.length) sections.push({ key, title, says, components: names });
  }
  const rest = ok.filter((c) => !used.has(c.name)).map((c) => c.name);
  if (rest.length) sections.push({ key: 'rest', title: 'Everything else', says: 'The rest of the system, overlays held in place.', components: rest, overlays: rest.filter((n) => familyOf(n) === 'overlay') });
  const all = sections.flatMap((s) => s.components);
  const composition = { component: null, children: all.map((component) => ({ component })) };
  return { sections, composition, check: { placed: all.length, refused: refused.length }, refused };
}
