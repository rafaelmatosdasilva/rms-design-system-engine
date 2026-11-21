// page-rebuild.mjs - a page made outside the system, rebuilt from the system's own components.
// Run from project root:  rms-design-system-engine --prototype --from-page <page.html | https://…> [--force]
//
// A page an AI tool or a person made with styles of its own is read for the job each of its parts does, never for how it
// looks: its landmarks (header, nav, main, footer, form), its roles, its headings, its controls and the names it gave
// its own parts (a class called "card" is a card whatever it is painted). Each job is matched to the system's own
// component the way the common set matches names (common-set.mjs), and a job no component of the system does becomes
// a Missing box with the need written on it, for the gaps list, never a part styled for the occasion.
// The result is a composition, written as a starting point in prototypes/ as --from-screens writes one, and drawn by
// the prototype check like any other. The page itself is never changed.
//
//   readHtml(html)                          → the page as a tree: { tag, attrs, children, text }
//   rebuild(tree, { catalog, name })        → { prototype, regions, gaps }
//   pageCounts(html, tokens)                → what the page writes by hand: values, inline styles, own classes, fonts
//   rebuildLines(r) / rebuildMarkdown(r)    → the terminal's lines and the record beside the prototype

import { commonOf } from './common-set.mjs';
import { censusText } from './raw-census.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head']);
// Each entity once, in one pass, so "&amp;lt;" stays "&lt;" rather than becoming "<".
const ENTITY = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => String(s).replace(/&(#\d{1,7}|[a-z]{2,6});/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(Math.min(Number(e.slice(1)), 0x10ffff)) : ENTITY[e.toLowerCase()] ?? m));
// Comments taken out by a plain scan: from each "<!--" to the next "-->", or to the end when it is never closed.
function withoutComments(html) {
  let out = '', at = 0;
  for (;;) {
    const open = html.indexOf('<!--', at);
    if (open < 0) return out + html.slice(at);
    out += html.slice(at, open);
    const close = html.indexOf('-->', open + 4);
    if (close < 0) return out;
    at = close + 3;
  }
}

// A forgiving reader: unclosed tags close with their parent, and what it cannot read it leaves out rather than guess.
export function readHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const src = withoutComments(String(html)).replace(/<!doctype[^>]*>/i, '');
  // A tag's inside is read in one pass to its ">" (linear on any input) and its attributes after, apart.
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let m, skipping = null;
  while ((m = re.exec(src))) {
    if (m[3] != null) { if (!skipping) { const t = decode(m[3]).replace(/\s+/g, ' '); if (t.trim()) stack.at(-1).children.push({ tag: '#text', text: t }); } continue; }
    const inside = m[2] ?? '';
    const selfClosing = /\/\s*$/.test(inside);
    const tag = m[1].toLowerCase(), closing = m[0][1] === '/';
    if (skipping) { if (closing && tag === skipping) skipping = null; continue; }
    if (closing) { const at = stack.map((n) => n.tag).lastIndexOf(tag); if (at > 0) stack.length = at; continue; }
    const attrs = {};
    for (const a of inside.matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    if (SKIP.has(tag)) { if (!VOID.has(tag) && !selfClosing) skipping = tag; continue; }
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }
  const body = find(root, (n) => n.tag === 'body');
  return body ?? root;
}

function find(node, test) {
  if (test(node)) return node;
  for (const k of node.children ?? []) { const f = find(k, test); if (f) return f; }
  return null;
}
const textOf = (n) => (n.tag === '#text' ? n.text : (n.children ?? []).map(textOf).join(' ')).replace(/\s+/g, ' ').trim();
const classes = (n) => String(n.attrs?.class ?? '').split(/\s+/).filter(Boolean);
const said = (n) => `<${n.tag}${classes(n).length ? ` class="${classes(n).slice(0, 3).join(' ')}"` : ''}>`;

// What an element is for, read from its markup. → { job, from } or null for plain arrangement.
// job is a common-set id, or one of the engine's own words for what the common set does not hold.
const HOLDS = new Set(['card', 'dialog', 'alert', 'form field', 'menu', 'tabs', 'table', 'empty state']);
const INPUT_JOB = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', range: 'slider', file: 'file upload', date: 'date picker', 'datetime-local': 'date picker', color: 'colour picker' };
export function jobOf(n) {
  const role = String(n.attrs?.role ?? '').toLowerCase();
  const byRole = { button: 'button', link: 'link', checkbox: 'checkbox', radio: 'radio', switch: 'switch', dialog: 'dialog', alertdialog: 'dialog', tablist: 'tabs', table: 'table', grid: 'table', alert: 'alert', status: 'alert', progressbar: 'progress', menu: 'menu', tooltip: 'tooltip', combobox: 'select', listbox: 'select', textbox: 'text input', img: 'image' }[role];
  if (byRole) return { job: byRole, from: `role="${role}"` };
  // The name the page gave its own part, read as the common set reads a component's name. A name on something that
  // holds controls of its own ("nav-links" around three links) names what it holds, so it says the job only for a part
  // made to hold others (a card, a dialog).
  for (const c of classes(n)) {
    const id = commonOf(c);
    if (id && (HOLDS.has(id) || !(n.children ?? []).some((k) => k.tag !== '#text' && (jobOf(k) || (k.children ?? []).some((x) => x.tag !== '#text' && jobOf(x)))))) return { job: id, from: `class "${c}"` };
  }
  const t = n.tag;
  if (t === 'button') return { job: 'button', from: '<button>' };
  if (t === 'a' && n.attrs?.href != null) return { job: 'link', from: '<a href>' };
  if (t === 'input') { const ty = String(n.attrs?.type ?? 'text').toLowerCase(); if (ty === 'hidden') return { job: 'hidden', from: 'type="hidden"' }; return { job: INPUT_JOB[ty] ?? 'text input', from: `<input type="${ty}">` }; }
  if (t === 'textarea') return { job: 'text input', from: '<textarea>' };
  if (t === 'select') return { job: 'select', from: '<select>' };
  if (t === 'table') return { job: 'table', from: '<table>' };
  if (t === 'dialog') return { job: 'dialog', from: '<dialog>' };
  if (t === 'progress' || t === 'meter') return { job: 'progress', from: `<${t}>` };
  if (t === 'img' || t === 'picture' || t === 'video') return { job: 'image', from: `<${t}>` };
  if (t === 'hr') return { job: 'divider', from: '<hr>' };
  return null;
}

// The system's component for a job: one whose name the common set reads as that job, else one named for it outright.
export function componentFor(job, catalog) {
  const names = Object.keys(catalog?.components ?? {});
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  return names.find((n) => commonOf(n) === job) ?? names.find((n) => norm(n) === norm(job)) ?? names.find((n) => norm(n).endsWith(norm(job))) ?? null;
}

// The words a component shows go into its text option, the one named for what it says (label, text, title) first.
function textProp(def = {}) {
  const props = Object.entries(def.props ?? {}).filter(([, p]) => p.type === 'text').map(([k]) => k);
  return props.find((k) => /^(label|text|title|heading|content)$/i.test(k.replace(/[\s_-]/g, ''))) ?? props[0] ?? null;
}
// An option the page's own class already says (a "primary" button is the system's primary, when it has one).
function optionsFrom(n, def = {}) {
  const out = {};
  const cls = classes(n).flatMap((c) => c.toLowerCase().split(/[-_]+/));
  for (const [k, p] of Object.entries(def.props ?? {})) {
    if (p.type !== 'enum') continue;
    const v = (p.values ?? []).find((x) => cls.includes(String(x).toLowerCase()));
    if (v != null) out[k] = v;
  }
  if (n.attrs?.disabled != null) for (const [k, p] of Object.entries(def.props ?? {})) if (p.type === 'boolean' && /^disabled$/i.test(k)) out[k] = true;
  return out;
}

const LANDMARK = { header: 'the page header', nav: 'navigation', main: 'the main content', footer: 'the footer', aside: 'a side panel', form: 'a form', section: 'a section', article: 'an article' };
const HEADING = /^h([1-6])$/;
const ROWISH = /(^|[-_])(row|inline|toolbar|actions|buttons|btns|nav|menu|links|flex|hstack|group)([-_]|$)/i;
const GRIDISH = /(^|[-_])(grid|cols|columns|cards|tiles|gallery|features)([-_]|$)/i;

export function rebuild(tree, { catalog = { components: {} }, name = 'page' } = {}) {
  const gaps = [], regions = [];
  const comps = catalog.components ?? {};
  let region = null;
  const lack = (need, kind = 'component') => { if (!gaps.some((g) => g.need === need)) gaps.push({ need, kind }); };
  const convert = (n, depth) => {
    if (n.tag === '#text') { const t = n.text.trim(); return t ? { component: 'Text', props: { text: t } } : null; }
    const h = HEADING.exec(n.tag);
    if (h) return { component: 'Text', props: { text: textOf(n), as: n.tag } };
    if (n.tag === 'p' || n.tag === 'label' || n.tag === 'span' || n.tag === 'small' || n.tag === 'strong' || n.tag === 'em') {
      const t = textOf(n); if (!t) return null;
      if (!(n.children ?? []).some((k) => k.tag !== '#text' && jobOf(k))) return { component: 'Text', props: { text: t } };
    }
    const job = jobOf(n);
    if (job?.job === 'hidden') return null;
    if (job) {
      const comp = componentFor(job.job, catalog);
      const words = n.tag === 'input' ? (n.attrs?.placeholder || n.attrs?.['aria-label'] || n.attrs?.value || '') : textOf(n);
      if (region) region.parts.push({ job: job.job, from: job.from, with: comp, held: !comp && HOLDS.has(job.job), element: said(n) });
      if (comp) {
        const tp = textProp(comps[comp]);
        const props = { ...optionsFrom(n, comps[comp]), ...(tp && words ? { [tp]: words.slice(0, 80) } : {}) };
        // A component that holds other parts (a card, a dialog) keeps what is inside it.
        const inside = HOLDS.has(job.job) ? (n.children ?? []).map((k) => convert(k, depth + 1)).filter(Boolean) : [];
        return { component: comp, props: { ...props, ...(words && !tp ? { content: [words.slice(0, 80)] } : {}) }, ...(inside.length ? { children: inside } : {}) };
      }
      lack(`${job.job === 'image' ? 'an image or media component' : `a ${job.job} component`}`, 'component');
      // A part made to hold others keeps what it holds, arranged by the engine and marked as standing in for it.
      if (HOLDS.has(job.job)) {
        const inside = (n.children ?? []).map((k) => convert(k, depth + 1)).filter(Boolean);
        if (inside.length) return { component: 'Stack', props: { standInFor: `a ${job.job} (the page's ${said(n)})` }, children: inside };
      }
      return { component: 'Missing', props: { need: `${job.job}${words ? ` "${words.slice(0, 30)}${words.length > 30 ? '…' : ''}"` : ''}, the page's ${said(n)}`, kind: 'component' } };
    }
    const kids = (n.children ?? []).map((k) => convert(k, depth + 1)).filter(Boolean);
    if (!kids.length) return null;
    const cls = classes(n).join(' ');
    // Several of the same part side by side (three cards, a row of links) is a grid or a row, as the page named it.
    const sameKids = kids.length >= 3 && kids.every((k) => k.component === kids[0].component && k.component !== 'Text');
    const piece = n.tag === 'nav' || n.tag === 'ul' && ROWISH.test(cls) || ROWISH.test(cls) ? 'Row' : GRIDISH.test(cls) || sameKids ? 'Columns' : 'Stack';
    if (kids.length === 1 && piece === 'Stack' && !LANDMARK[n.tag]) return kids[0];
    // A section's heading stays above the grid or row it introduces.
    if (piece !== 'Stack' && kids[0]?.component === 'Text' && /^h[1-6]$/.test(kids[0].props?.as ?? '') && kids.length > 2) return { component: 'Stack', props: {}, children: [kids[0], { component: piece, props: {}, children: kids.slice(1) }] };
    return { component: piece, props: {}, children: kids };
  };
  const top = [];
  const walkRegions = (n, depth) => {
    for (const k of n.children ?? []) {
      if (k.tag === '#text') { const c = convert(k, depth); if (c) top.push(c); continue; }
      // A wrapper with nothing to say (a div around everything) is looked through, to the regions it holds.
      if (!LANDMARK[k.tag] && !jobOf(k) && !HEADING.test(k.tag) && (k.children ?? []).filter((x) => x.tag !== '#text').length > 1 && depth < 3 && (k.children ?? []).some((x) => LANDMARK[x.tag])) { walkRegions(k, depth + 1); continue; }
      const heading = find(k, (x) => HEADING.test(x.tag));
      region = { name: LANDMARK[k.tag] ?? (heading ? `"${textOf(heading).slice(0, 40)}"` : `a block (${said(k)})`), from: LANDMARK[k.tag] ? `<${k.tag}>` : heading ? `its heading <${heading.tag}>` : 'its position', parts: [] };
      const c = convert(k, depth + 1);
      if (c) { top.push(c); regions.push(region); }
      region = null;
    }
  };
  walkRegions(tree, 0);
  return { prototype: { component: 'Page', props: {}, children: top }, regions, gaps, name };
}

// What the page writes by hand, before it is rebuilt. tokens: censusTokens() of the system's theme, or null.
export function pageCounts(html, tokens = null) {
  const css = [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const inline = [...String(html).matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => m[2] ?? m[3]);
  const census = tokens ? censusText(`${css}\n${inline.map((s) => `x{${s}}`).join('\n')}`, tokens) : [];
  const own = new Set([...String(html).matchAll(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/gi)].flatMap((m) => (m[2] ?? m[3]).split(/\s+/).filter(Boolean)));
  const fonts = [...String(html).matchAll(/<link[^>]+href=["'][^"']*fonts\.(googleapis|bunny|adobe)[^"']*["']/gi)].length + (css.match(/@font-face/gi) ?? []).length;
  return { values: census.length, rules: (css.match(/\{/g) ?? []).length, inline: inline.length, classes: own.size, fonts };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function rebuildLines(r) {
  const used = new Map();
  const count = (n) => { if (!n) return; if (!['Page', 'Stack', 'Row', 'Columns', 'Text', 'Missing'].includes(n.component)) used.set(n.component, (used.get(n.component) ?? 0) + 1); (n.children ?? []).forEach(count); };
  count(r.prototype);
  const missing = JSON.stringify(r.prototype).match(/"component":"Missing"/g)?.length ?? 0;
  const b = r.before ?? {};
  const lines = [`Rebuilt from the system  ·  ${r.source}  →  prototypes/${r.name}.json`];
  lines.push(`   Before: ${plural(b.values ?? 0, 'value', 'values')} typed by hand · ${plural(b.rules ?? 0, 'style rule', 'style rules')} of its own · ${plural(b.inline ?? 0, 'inline style', 'inline styles')} · ${plural(b.classes ?? 0, 'class', 'classes')} of its own · ${plural(b.fonts ?? 0, 'font', 'fonts')} loaded`);
  lines.push(`   After:  ${plural([...used.values()].reduce((a, n) => a + n, 0), 'system component', 'system components')} (${[...used.entries()].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(' · ') || 'none'}) · ${plural(missing, 'part', 'parts')} the system lacks · no value, rule or class of its own, since a composition holds only the system's parts and tokens`);
  for (const g of r.regions) {
    lines.push(`   ▸ ${g.name} (read from ${g.from})`);
    for (const p of g.parts) lines.push(`      · ${p.element} is ${p.job === 'image' ? 'an image' : `a ${p.job}`} (${p.from}) → ${p.with ?? (p.held ? 'not in the system: what it holds, arranged by the engine and marked as a stand-in' : 'not in the system: a Missing box')}`);
  }
  if (r.gaps.length) lines.push(`   What the system lacks: ${r.gaps.map((g) => g.need).join(' · ')}. Each goes on the gaps list, never filled with styles of the occasion.`);
  if (r.unseen?.length) for (const u of r.unseen) lines.push(`   Not read: ${u}`);
  return lines;
}

export function rebuildMarkdown(r) {
  return ['# Rebuilt from the system', '', `${r.source}, rebuilt as \`prototypes/${r.name}.json\`. The page itself was not changed.`, '', ...rebuildLines(r).slice(1).map((l) => l.replace(/^ {3}▸ /, '\n## ').replace(/^ {6}· /, '- ').replace(/^ {3}/, ''))].join('\n') + '\n';
}
