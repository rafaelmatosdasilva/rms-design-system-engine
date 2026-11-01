// page-quality.mjs - what a prototype gets wrong as a page, beyond using the system right: the habits agents fall into
// (a card inside a card, more than one main action, a destructive action louder than the main one, a heading level
// skipped, a label written only as a placeholder, several alerts on one page, sections all at one weight), and the
// states a page owes and leaves out (nothing for an empty list, a form with no error, data that loads with nothing
// shown meanwhile). Read from the page's structure, the same for every framework: a page in the project's code (Vue,
// React, Svelte, HTML: the page check's parsed tree) or one of the engine's compositions. Each finding has its line or
// part, and the page a score out of 10 for its hierarchy and clarity, beside the system's own checks.
//
// A node: { name (the system component, or null), tag (the element, or null), attrs: { name: value | true }, text,
// line, path, children: [node] }.

const has = (re, s) => re.test(String(s ?? ''));
const vals = (n) => Object.entries(n.attrs ?? {}).filter(([, v]) => typeof v === 'string').map(([, v]) => v);
const attr = (n, re) => Object.entries(n.attrs ?? {}).find(([k]) => re.test(k));
const label = (n) => `${n.name ?? `<${n.tag}>`}${n.text ? ` "${n.text.slice(0, 40)}"` : ''}`;
const where = (n) => (n.line != null ? { line: n.line } : n.path != null ? { path: n.path } : {});

const OVERLAY = /dialog|modal|drawer|sheet|popover|overlay|side ?panel|sidepanel|tooltip|menu/i;
const SURFACE = /card|tile/i;
const BUTTON = /button|btn|\bcta\b|action(?!bar)/i;
const PRIMARY = /\b(primary|cta|main|filled|solid|contained)\b/i;
const EMPHASIS_ATTR = /^(variant|type|kind|appearance|priority|emphasis|level|color|intent|hierarchy|mode|theme)$/i;
const DESTRUCTIVE = /\b(danger|destructive|critical|negative|delete|remove|discard|erase|destroy|cancel subscription)\b/i;
const INPUT = /^(input|textarea|select)$/i;
const INPUT_NAME = /input|field|textarea|select|search|combo|picker/i;
const LABELLED = /^(label|aria-?label|aria-?labelledby|labelContent|labelText|title|legend)$/i;
const ALERT = /alert|banner|toast|snackbar|notification|callout|notice/i;
const SECTION = /^(section|article|fieldset)$/i;
const SECTION_NAME = /section|card|panel|group|block/i;

function flat(root) {
  const out = [];
  const go = (n, parents) => { for (const c of n.children ?? []) { out.push({ n: c, parents }); go(c, [...parents, c]); } };
  go(root, []);
  return out;
}
const headingLevel = (n) => {
  const t = /^h([1-6])$/i.exec(n.tag ?? ''); if (t) return +t[1];
  const a = attr(n, /^(as|tag|level|headingLevel|aria-level|variant)$/i);
  const m = a && /^h?([1-6])$/i.exec(String(a[1]));
  return m && (n.tag === null || n.name || /^\d$/.test(String(a[1])) || /^h\d$/i.test(String(a[1]))) && (/^h\d$/i.test(String(a[1])) || /level/i.test(a[0])) ? +m[1] : null;
};
const isPrimary = (n) => has(PRIMARY, n.name) || Object.entries(n.attrs ?? {}).some(([k, v]) => EMPHASIS_ATTR.test(k) && typeof v === 'string' && PRIMARY.test(v)) || (n.attrs?.primary === true);
const isButton = (n) => (n.tag && /^button$/i.test(n.tag)) || has(BUTTON, n.name) || n.attrs?.role === 'button';
const isDestructive = (n) => vals(n).some((v) => DESTRUCTIVE.test(v)) || has(DESTRUCTIVE, n.text) || has(/danger|destructive/i, n.name);

// → [{ kind, message, line | path }]
export function habitFindings(root, { templates = [] } = {}) {
  const all = flat(root);
  const out = [];
  const add = (kind, n, message) => out.push({ kind, message, ...(n ? where(n) : {}) });
  const shell = new Set(templates);
  const inOverlay = (parents) => parents.some((p) => has(OVERLAY, p.name));

  // A card inside a card: a surface inside another one draws a box in a box.
  for (const { n, parents } of all) if (n.name && !shell.has(n.name) && SURFACE.test(n.name) && parents.some((p) => p.name && !shell.has(p.name) && SURFACE.test(p.name))) add('nested', n, `${label(n)} is a card inside a card (${parents.filter((p) => p.name && SURFACE.test(p.name)).map((p) => p.name).join(' › ')}): one surface, its parts laid out inside it`);

  // One main action in view (an action inside a dialog or a panel is that layer's own).
  const actions = all.filter(({ n, parents }) => isButton(n) && !inOverlay(parents));
  const primaries = actions.filter(({ n }) => isPrimary(n));
  if (primaries.length > 1) add('primary', primaries[1].n, `${primaries.length} main actions in view (${primaries.map(({ n }) => label(n)).join(', ')}): keep one primary, the rest secondary`);

  // A destructive action louder than the main one: the one people must not press by mistake is not the most prominent.
  for (const { n } of actions) if (isDestructive(n) && isPrimary(n)) add('destructive', n, `${label(n)} is destructive and styled as the main action: make the safe action the primary one, and this one secondary or behind a confirmation`);

  // Headings: one main heading, and no level skipped on the way down.
  const heads = all.map(({ n }) => ({ n, level: headingLevel(n) })).filter((h) => h.level);
  if (heads.filter((h) => h.level === 1).length > 1) add('heading', heads.filter((h) => h.level === 1)[1].n, 'more than one main heading (h1): a page has one');
  for (let i = 1; i < heads.length; i++) if (heads[i].level > heads[i - 1].level + 1) add('heading', heads[i].n, `heading level ${heads[i].level} follows level ${heads[i - 1].level}: a level is skipped (screen readers read the outline by them)`);
  if (heads.length && heads[0].level > 2) add('heading', heads[0].n, `the page's first heading is level ${heads[0].level}: start at 1 (or 2 under the product's own)`);

  // A label written only as a placeholder: it disappears as soon as someone types, and some screen readers skip it.
  for (const { n, parents } of all) {
    const field = (n.tag && INPUT.test(n.tag)) || (n.name && INPUT_NAME.test(n.name));
    if (!field || !attr(n, /^placeholder$/i)) continue;
    if (has(/^(hidden|checkbox|radio|submit|button|reset)$/i, n.attrs?.type)) continue;
    if (attr(n, LABELLED) || parents.some((p) => /^label$/i.test(p.tag ?? '')) || (n.attrs?.id && all.some(({ n: o }) => /^label$/i.test(o.tag ?? '') && String(o.attrs?.for ?? o.attrs?.htmlFor ?? '') === String(n.attrs.id)))) continue;
    add('placeholder', n, `${label(n)} is labelled only by its placeholder: give it a label (or aria-label) that stays when someone types`);
  }

  // Several signals at alert level on one page: a page asks for attention only where it matters.
  const alerts = all.filter(({ n, parents }) => n.name && ALERT.test(n.name) && !inOverlay(parents));
  if (alerts.length > 1) add('alerts', alerts[1].n, `${alerts.length} alerts on one page (${alerts.map(({ n }) => n.name).join(', ')}): keep the one that matters now; the rest inline, or gone once resolved`);

  // Every section at one weight: three or more sections and no heading to lead them.
  const sections = all.filter(({ n }) => (n.tag && SECTION.test(n.tag)) || (n.name && !shell.has(n.name) && SECTION_NAME.test(n.name)));
  if (sections.length >= 3 && !heads.length) add('flat', sections[0].n, `${sections.length} sections and no heading: every part has the same weight. Give the page a main heading, and the section that matters most first`);
  return out;
}

const WEIGHT = { primary: 2, destructive: 2, nested: 1, heading: 1, placeholder: 1, alerts: 1, flat: 1 };
// → { score, findings }
export function habitReview(root, opts = {}) {
  const findings = habitFindings(root, opts);
  const seen = new Set();
  const once = findings.filter((f) => { const k = `${f.kind}|${f.message}`; return !seen.has(k) && seen.add(k); });
  const lost = Object.entries(Object.groupBy ? Object.groupBy(once, (f) => f.kind) : once.reduce((m, f) => ((m[f.kind] ??= []).push(f), m), {})).reduce((s, [k, list]) => s + (WEIGHT[k] ?? 1) * Math.min(list.length, 2), 0);
  return { score: Math.max(0, 10 - lost), findings: once };
}

// ── The states a page owes ──────────────────────────────────────────────────────────────────────────────────────
// A list owes what shows when it is empty, a form its errors, data that loads what shows meanwhile. Read from the page's
// structure and its own code: a branch on the list's length, an empty-state component or prop, an error prop or
// message, a loading flag or skeleton. The system's own components for each are named, so the fix uses them.
const LIST_NAME = /table|list|grid|feed|tree|gallery|results/i;
const EMPTY = /\.length\s*(?:===?|==|<=?|>)\s*0|!\s*[\w$.?]+\.length\b|\.length\s*\?|\blength\s*&&|\bempty\b|no ?(data|results|items|records)|nothing (to show|found|here)|\{:else\}|v-else|#if/i;
const ERROR = /error|invalid|validation|errorMessage|helperText|feedback/i;
const ASYNC = /\bfetch\(|\bawait\b|axios|useQuery|useSWR|\$fetch|onMounted\(\s*async|\.then\(/;
const LOADING = /loading|isLoading|pending|skeleton|spinner|busy|progress/i;
export function owedStates(root, { markup = '', script = '', components = [], templates = [] } = {}) {
  const all = flat(root).map((x) => x.n);
  const shell = new Set(templates);
  const out = [];
  const system = (re) => components.filter((c) => re.test(c));
  const lists = all.filter((n) => (n.name && !shell.has(n.name) && LIST_NAME.test(n.name)) || attr(n, /^(v-for|v-each)$/i));
  const looped = /v-for=|\{#each\b|\.map\(\s*\(?[\w{]/.test(markup);
  if ((lists.length || looped) && !EMPTY.test(markup) && !lists.some((n) => attr(n, /empty|noData|noResults|emptyText|emptyState|placeholder/i))) {
    const use = system(/empty/i);
    out.push({ kind: 'empty', message: `the page shows a list and nothing for when it has no items: show its empty state${use.length ? ` with the system's ${use.slice(0, 2).join(' or ')}` : ' (the list\'s own empty prop, or a message that says what to do next)'}`, ...(lists[0] ? where(lists[0]) : {}) });
  }
  const fields = all.filter((n) => (n.tag && INPUT.test(n.tag) && !has(/^(hidden|submit|button|reset)$/i, n.attrs?.type)) || (n.name && INPUT_NAME.test(n.name)));
  if (fields.length && !fields.some((n) => attr(n, ERROR)) && !all.some((n) => n.name && ERROR.test(n.name)) && !ERROR.test(markup)) {
    const use = system(/error|feedback|message|alert/i);
    out.push({ kind: 'error', message: `the page takes input and shows no error: show what is wrong at the field${use.length ? ` (the system's ${use.slice(0, 2).join(' or ')})` : ' (its error prop)'}, said in words`, ...where(fields[0]) });
  }
  if (ASYNC.test(script) && !LOADING.test(markup) && !LOADING.test(script.replace(/\bfetch\(|\bawait\b/g, ''))) {
    const use = system(/skeleton|spinner|loader|loading|progress/i);
    out.push({ kind: 'loading', message: `the page loads its data and shows nothing meanwhile: show it loading${use.length ? ` with the system's ${use.slice(0, 2).join(' or ')}` : ''}` });
  }
  return out;
}

// ── Adapters ─────────────────────────────────────────────────────────────────────────────────────────────────
// The page check's parsed tree (page-check.mjs parseMarkup, each node marked with the system component it is), and the
// markup it came from (for the text between a tag and its end).
export function fromPageTree(tree, markup = '') {
  const textOf = (n) => {
    if (n.end == null) return null;
    const close = markup.indexOf(`</${n.tag}`, n.end);
    const inner = close > n.end ? markup.slice(n.end, close) : '';
    const t = inner.replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    return t && t.length <= 80 ? t : null;
  };
  const conv = (n) => ({
    name: n.system ?? null, tag: n.system ? null : n.tag, line: n.line,
    attrs: Object.fromEntries((n.attrs ?? []).filter((a) => a.name || a.raw).map((a) => [String(a.name ?? a.raw).replace(/^[:@]|^v-bind:/, ''), a.value === null || a.value === undefined ? true : String(a.value).replace(/^['"`]|['"`]$/g, '')])),
    text: (n.attrs ?? []).find((a) => /^(label|text|title|labelContent)$/i.test(a.name ?? ''))?.value ?? textOf(n),
    children: (n.children ?? []).map(conv),
  });
  return { children: (tree.children ?? []).map(conv) };
}
// A composition ({ component, props, children }), the engine's own format.
export function fromComposition(tree) {
  let i = 0;
  const conv = (n, path) => ({
    name: n.component && !/^(Page|Stack|Row|Columns|Text|Missing)$/.test(n.component) ? n.component : null,
    tag: n.component === 'Text' ? (n.props?.as ?? 'p') : null, path,
    attrs: Object.fromEntries(Object.entries(n.props ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)])),
    text: [n.props?.Label, n.props?.label, n.props?.text, n.props?.Text, n.props?.title].find((v) => typeof v === 'string') ?? null,
    children: (n.children ?? []).map((c, k) => conv(c, `${path}.${k}`)),
  });
  void i;
  return { children: [conv(tree, '0')] };
}

export const habitLines = (r) => (r?.findings ?? []).map((f) => `⚠️  ${f.line != null ? `line ${f.line}: ` : ''}${f.message}`);
export const stateLines = (list) => (list ?? []).map((f) => `⚠️  ${f.line != null ? `line ${f.line}: ` : ''}${f.message}`);
