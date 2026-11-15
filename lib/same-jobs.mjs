// same-jobs.mjs - the same job done differently across products.
//
// Products built from the same components still build the same job (a create flow, a detail page, a list page, the
// navigation) a different way each. Each difference is reasonable alone and costly together: people moving between
// products relearn the pattern, and an agent copies whichever version it reads first. This reads each product's pages,
// says what job each does (by its file's name, else by what it is built from) and which of the system's components
// carry it, in their order and with where the main action sits, then groups the pages that do the same job across two
// or more products and says what differs, each difference a question: is it earned? A job the team keeps different on
// purpose is said with its reason (ds-config.json sameJobs.keep: { "<job>": "why" }), the way an exception is kept.
//
//   jobOf(file, components)       → a job id, or null
//   pageOf(page, names, classFor) → { product, file, job, components, action }
//   sameJobs(pages, { keep })     → [{ job, label, pages, differences, kept }]
//   sameJobLines(groups)          → the drift check's lines

import { basename, dirname } from 'node:path';

export const JOBS = [
  { id: 'create', label: 'a create flow', words: /(^|[-_ ])(create|new|add|signup|sign-up|register|compose|checkout)([-_ ]|$)/ },
  { id: 'edit', label: 'an edit form', words: /(^|[-_ ])(edit|update)([-_ ]|$)/ },
  { id: 'detail', label: 'a detail page', words: /(^|[-_ ])(detail|details|view|show|profile)([-_ ]|$)|\[[^\]]+\]|^_?id$|^\$id$/ },
  { id: 'list', label: 'a list or table page', words: /(^|[-_ ])(list|table|overview|browse|results|all|catalog|catalogue)([-_ ]|$)/ },
  { id: 'search', label: 'a search', words: /(^|[-_ ])(search|find)([-_ ]|$)/ },
  { id: 'settings', label: 'a settings page', words: /(^|[-_ ])(settings|preferences|account)([-_ ]|$)/ },
  { id: 'login', label: 'a sign-in', words: /(^|[-_ ])(login|log-in|signin|sign-in|auth)([-_ ]|$)/ },
  { id: 'navigation', label: 'the navigation', words: /(^|[-_ ])(nav|navbar|navigation|sidebar|header|menu|topbar|appbar|shell|layout)([-_ ]|$)/ },
];
const LABEL = Object.fromEntries(JOBS.map((j) => [j.id, j.label]));

const words = (s) => String(s).replace(/\.[^.]+$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A page's job: its file's name, else its folder's when the file is an index or a page by convention, else what it is
// built from (a table is a list page, fields with a submit are a create flow). components: the system's, it uses.
export function jobOf(file, components = [], text = '') {
  const name = words(basename(file)), dir = words(basename(dirname(file)));
  const from = (s) => JOBS.find((j) => j.words.test(s))?.id ?? null;
  const own = /^(index|page|\+page|route|main)$/.test(name) ? null : from(name);
  if (own) return own;
  const folder = from(dir);
  if (folder) return folder;
  const has = (re) => components.some((c) => re.test(c));
  if (has(/table|datagrid|data-grid/i)) return 'list';
  if (has(/input|field|select|textarea/i) && /type\s*=\s*["']submit["']/.test(text)) return 'create';
  return null;
}

// Where a name is first written in a page: its tag (<Button, <my-button) or its class.
const firstAt = (name, cls, text) => {
  const tag = name.charAt(0).toUpperCase() + name.slice(1), kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const c = cls ? String(cls).replace(/^[.#]/, '') : null;
  const re = new RegExp([`<${esc(tag)}(?=[\\s/>])`, `<${esc(kebab)}(?=[\\s/>])`, ...(c ? [`class(?:Name)?\\s*=\\s*\\{?\\s*["'\`][^"'\`]*(?<![\\w-])${esc(c)}(?![\\w-])`] : [])].join('|'));
  const m = re.exec(text);
  return m ? m.index : -1;
};

// Where the main action sits: the first submit or primary action, before every other component the page places (top),
// after all of them (bottom) or between. null when the page has none, or places nothing else.
const actionOf = (text, at) => {
  const m = /type\s*=\s*["']submit["']|variant\s*=\s*["']primary["']/.exec(text);
  if (!m) return null;
  const tagStart = text.lastIndexOf('<', m.index);
  const others = at.map(([, i]) => i).filter((i) => i !== tagStart);
  if (!others.length) return null;
  return others.every((i) => i > m.index) ? 'top' : others.every((i) => i < tagStart) ? 'bottom' : 'middle';
};

// One product page read: page { file, text, productName }, names: the system's components, classFor(name) → its class.
export function pageOf(page, names = [], classFor = () => null) {
  const text = String(page.text ?? '');
  const at = names.map((n) => [n, firstAt(n, classFor(n), text)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  const components = at.map(([n]) => n);
  return { product: page.productName ?? null, file: page.file, job: jobOf(page.file, components, text), components, action: actionOf(text, at) };
}

const listed = (l) => l.join(' · ');

// The pages that do the same job across two or more products, each group with what differs. pages: pageOf() results.
// keep: Map or object, job id → the reason the team keeps it different.
export function sameJobs(pages = [], { keep = {} } = {}) {
  const kept = keep instanceof Map ? keep : new Map(Object.entries(keep ?? {}));
  const byJob = new Map();
  for (const p of pages) if (p.job && p.product && p.components.length) {
    const g = byJob.get(p.job) ?? new Map();
    if (!g.has(p.product)) g.set(p.product, p);   // a product's first page of the job stands for it
    byJob.set(p.job, g);
  }
  const out = [];
  for (const [job, g] of byJob) {
    if (g.size < 2) continue;
    const list = [...g.values()].sort((a, b) => a.product.localeCompare(b.product));
    const differences = [];
    const every = list.map((p) => new Set(p.components));
    const all = [...new Set(list.flatMap((p) => p.components))];
    const shared = all.filter((c) => every.every((s) => s.has(c)));
    const apart = all.filter((c) => !shared.includes(c));
    if (apart.length) differences.push({ kind: 'components', text: `built from different components: ${list.map((p) => `${p.product} uses ${listed(p.components.filter((c) => apart.includes(c))) || 'none of the others'}`).join(', ')}` });
    const orders = list.map((p) => p.components.filter((c) => shared.includes(c)).join(' → '));
    if (shared.length > 1 && new Set(orders).size > 1) differences.push({ kind: 'order', text: `in another order: ${list.map((p, i) => `${p.product} ${orders[i]}`).join(', ')}` });
    const actions = list.filter((p) => p.action);
    if (actions.length > 1 && new Set(actions.map((p) => p.action)).size > 1) differences.push({ kind: 'action', text: `the main action sits apart: ${actions.map((p) => `${p.product} at the ${p.action}`).join(', ')}` });
    if (!differences.length) continue;
    out.push({ job, label: LABEL[job] ?? job, pages: list.map((p) => ({ product: p.product, file: p.file })), differences, kept: kept.has(job) ? kept.get(job) || null : undefined });
  }
  return out.sort((a, b) => (a.kept === undefined ? 0 : 1) - (b.kept === undefined ? 0 : 1) || b.differences.length - a.differences.length || a.job.localeCompare(b.job));
}

// A header line, then each job's own line and its differences under it.
export function sameJobLines(groups = []) {
  const open = groups.filter((g) => g.kept === undefined), kept = groups.filter((g) => g.kept !== undefined);
  const lines = [];
  if (open.length) {
    lines.push(`${open.length} job${open.length === 1 ? ' is' : 's are'} done differently across products. For each difference, ask whether it is earned: align the products, or keep it with its reason (sameJobs.keep in ds-config.json):`);
    for (const g of open.slice(0, 8)) {
      lines.push(`   · ${g.label} (${g.pages.map((p) => `${p.product} ${p.file.split('/').pop()}`).join(', ')})`);
      for (const d of g.differences) lines.push(`   ·   ${d.text}`);
    }
    if (open.length > 8) lines.push(`   · and ${open.length - 8} more`);
  }
  for (const g of kept) lines.push(`${g.label[0].toUpperCase()}${g.label.slice(1)} is kept different across ${g.pages.map((p) => p.product).join(' · ')} on purpose${g.kept ? `: ${g.kept}` : ''}.`);
  return lines;
}
