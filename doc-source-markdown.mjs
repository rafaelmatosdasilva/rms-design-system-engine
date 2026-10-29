// doc-source-markdown.mjs - an intent layer written as Markdown or MDX pages: a docs folder, a documentation site's
// content, or each component's own .mdx beside its code. Each page is turned into the shape a DSDS page is read into
// (doc-source-dsds.mjs → entityView), so the sections are read by their titles the same way, drafts and open questions
// set apart the same way, and every reader of the layer takes it unchanged.
//
// What makes a page:
//   - one file (docs/components/button.md, src/Button/Button.mdx), or a folder of a component's tabs (button/usage.mdx,
//     button/accessibility.mdx, button/style.mdx: one page named after the folder, each tab's sections under its name;
//     code, api and examples tabs are for developers and left out);
//   - its name: the front matter's title (or name), else a Storybook <Meta title="Components/Button">'s last part, else
//     its first # heading, else its file's (or folder's) name;
//   - its kind: the front matter's kind (or type, layer), else the Meta title's first part, else the nearest folder
//     named for a layer (components, patterns, foundations, templates, pages, flows), else a component when it says how
//     to use one (When to use, Props, Anatomy…) or sits beside its code, else a page of the system's own guidance;
//   - its code file: the front matter's component (code, source), else a code file of its name beside it;
//   - its sections: each ## heading, and each ### under it as "<## title> / <### title>" (read by its last part, as a
//     DSDS title is); the text before the first ## is what it is for (Overview). Its status and aliases come from the
//     front matter.
// The README (or index) at the layer's root is the system's own page. A layer folder's own index (components/index.md)
// is guidance for that whole layer, kept with the system's.
//
// MDX: imports, exports, JSX comments and component tags are taken out; the text inside them is kept.

import { posix } from 'node:path';
import { entityView, layerOf, heldLines } from './doc-source-dsds.mjs';

export const PAGE_FILE = /\.(md|mdx|markdown)$/i;
const CODE_FILE = /\.(vue|jsx|tsx|svelte|js|ts)$/i;
// Files that are about the repository, not the system.
const NOT_A_PAGE = /^(changelog|contributing|license|licence|code_of_conduct|security|authors|history|release[-_ ]?notes|migration.*)$/i;
// A component's tabs, when it is a folder: one page named after the folder.
const TAB = /^(index|readme|usage|overview|guidelines|guidance|accessibility|a11y|style|design|content|writing|docs|documentation|code|api|props|examples?|develop(ment)?)$/i;
// The tabs written for developers: left out.
const DEV_TAB = /^(code|api|props|examples?|develop(ment)?)$/i;
// A folder of a page's implementations (button/react/, button/rails/): written for developers, left out.
const DEV_DIR = /^(react|rails|vue|angular|svelte|web-?components?|ios|android|swiftui|compose|flutter|code|api|implementation|develop(ment|er)?|storybook)$/i;
// The kind of a page a layer's folder holds.
const SINGULAR = { components: 'component', foundations: 'foundation', patterns: 'pattern', templates: 'template', pages: 'page', flows: 'flow' };
// A folder of a component's documentation inside its own folder: part of its page.
const DOCS_DIR = /^(docs?|documentation|guidelines|usage)$/i;
// The tabs whose text before the first ## says what the component is.
const MAIN_TAB = /^(index|readme|overview|docs|documentation|usage|guidelines|guidance)$/i;
// The sections that say how to use a component: a page with one of them is a component's.
const COMPONENT_SECTION = /^(when (not )?to use|usage|anatomy|props|properties|variants?|states?|sizes?|behaviou?r|accessibility|do'?s( and don'?ts)?|don'?ts?)$/i;

// ── Front matter ────────────────────────────────────────────────────────────────────────────────────────────────────
// The YAML between --- lines at the top: key: value, a [list] or "- item" lines under a key. Nested maps are left out.
export function frontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(String(text ?? ''));
  if (!m) return { data: {}, body: String(text ?? '') };
  const data = {};
  let key = null;
  const unq = (v) => v.trim().replace(/^(['"])(.*)\1$/, '$2');
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && key) { (data[key] = Array.isArray(data[key]) ? data[key] : []).push(unq(item[1])); continue; }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1].toLowerCase();
    const v = kv[2].trim();
    if (!v) { data[key] = []; continue; }
    data[key] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(unq).filter(Boolean) : unq(v);
  }
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && !v.length) delete data[k];
  return { data, body: String(text).slice(m[0].length) };
}

// ── MDX ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A Storybook <Meta title="Components/Button" />: its title.
export const metaTitle = (text) => /<Meta\b[^>]*\btitle\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`]+)["'`]\s*\})/.exec(String(text ?? ''))?.slice(1).find(Boolean) ?? null;
// A Do or Don't example (<Do>, <Dont>, <DoDont type="dont">, any caption it carries): its words, led by its marker,
// so the page's Do and Don't sections read them as when (not) to use it.
const DO_TAG = /^<(Do|Dont|DoDont|DoDontItem)\b/;
const MARK = { do: '**Do:**', dont: '**Don\'t:**' };
function tagMark(tag) {
  const m = DO_TAG.exec(tag);
  if (!m) return '';
  const type = /\btype\s*=\s*["'{]\s*["']?(dont|don't|do)\b/i.exec(tag)?.[1]?.toLowerCase().replace("'", '') ?? (m[1] === 'Dont' ? 'dont' : m[1] === 'Do' ? 'do' : null);
  if (!type) return '';
  const cap = /\bcaption\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/.exec(tag)?.slice(1).find((x) => x != null);
  return `\n\n${MARK[type]} ${cap ?? ''}`;
}
// One tag from < at i, across lines, its quotes and braces kept whole. → the index after its >, or -1 when it is not a tag
function tagEnd(t, i) {
  if (!/[A-Za-z/]/.test(t[i + 1] ?? '')) return -1;
  let q = null, depth = 0;
  for (let k = i + 1; k < t.length; k++) {
    const ch = t[k];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { if (depth || /[=\s{]/.test(t[k - 1])) q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth <= 0) return k + 1;
    else if (ch === '\n' && depth <= 0 && t[k + 1] === '\n') return -1;   // a blank line: it was text, not a tag
  }
  return -1;
}
// A Markdown table → one line a row: its first cell, then the others ("Primary: For the main call to action").
function tableLines(rows) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).slice(1);
  return body.map((r) => { const c = cells(decodeEntities(r.replace(/!\[[^\]]*\]\([^)]*\)/g, ''))).filter(Boolean); return c.length > 1 ? `- ${c[0]}: ${c.slice(1).join(' · ')}` : c.length ? `- ${c[0]}` : ''; }).filter(Boolean);
}
// HTML entities as the characters they are (&nbsp; a space, &amp; an ampersand, &#8217; and &#x2019; by number).
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·', bull: '•', times: '×', copy: '©', reg: '®', trade: '™', larr: '←', rarr: '→' };
export const decodeEntities = (t) => String(t ?? '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m);
// A line that is only links (a page's bar of links: "[Source code] | [Usage guidelines]"), or only an image: nothing an
// agent can use.
const ONLY_LINKS = /^\s*(?:[-*]\s+)?(?:(?:!?\[[^\]]*\]\([^)]*\)|[|·•/–—-]|\s)+)$/;
// MDX (or Markdown with HTML) as Markdown text: imports, exports, comments and tags out (across lines), the text inside
// kept; a table a line a row; a Do or Don't example led by its marker; entities decoded, images and lines of links only
// left out. Code fences are kept as they are.
export function plainText(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // Imports and exports first, line by line: one that runs over several lines (an object, a template literal) up to
  // the line that closes it.
  const kept = [];
  let fenced = false, open = 0, tick = false;
  for (const line of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(line) && !open && !tick) { fenced = !fenced; kept.push(line); continue; }
    if (fenced) { kept.push(line); continue; }
    if (open || tick) {
      if (tick) { if (((line.match(/`/g) ?? []).length % 2) === 1) tick = false; continue; }
      open += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length; if (open <= 0) open = 0; continue;
    }
    if (/^\s*(import|export)\s/.test(line)) {
      tick = ((line.match(/`/g) ?? []).length % 2) === 1;
      open = tick ? 0 : Math.max(0, (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length);
      continue;
    }
    kept.push(line);
  }
  // Then the tags, across lines, outside code fences and inline code.
  const parts = kept.join('\n').split(/(^\s*(?:```|~~~)[\s\S]*?^\s*(?:```|~~~).*$)/m);
  const out = parts.map((part, n) => {
    if (n % 2) return part;
    let t = '', i = 0;
    while (i < part.length) {
      const ch = part[i];
      if (ch === '`') { const j = part.indexOf('`', i + 1); if (j > i && !part.slice(i, j).includes('\n')) { t += part.slice(i, j + 1); i = j + 1; continue; } }
      if (ch === '<') { const j = tagEnd(part, i); if (j > 0) { t += tagMark(part.slice(i, j)); i = j; continue; } }
      // A JSX expression on its own ({...} across lines) says nothing.
      if (ch === '{' && /(^|\n)\s*$/.test(t)) { let d = 0, k = i; for (; k < part.length; k++) { if (part[k] === '{') d++; else if (part[k] === '}' && --d === 0) break; } if (k < part.length && /^\s*(\n|$)/.test(part.slice(k + 1, k + 3))) { i = k + 1; continue; } }
      t += ch; i++;
    }
    // Images, their words wrapped over lines too: nothing an agent reads.
    return t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  }).join('');
  // Tables a line a row; a marker on its own line joined to the words after it.
  const lines = [];
  let table = [];
  const flush = () => { if (table.length) { lines.push(...(table.length > 1 ? tableLines(table) : table)); table = []; } };
  let inFence = false;
  for (const raw of out.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { flush(); inFence = !inFence; lines.push(raw); continue; }
    if (inFence) { lines.push(raw); continue; }
    if (/^\s*\|.*\|\s*$/.test(raw)) { table.push(raw); continue; }
    flush();
    const line = decodeEntities(raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '')).replace(/[ \t\u00a0]{2,}/g, ' ').replace(/\s+$/, '');
    lines.push(/\]\(/.test(line) && ONLY_LINKS.test(line) ? '' : line);
  }
  flush();
  const joined = [];
  for (const l of lines) {
    const prev = joined.length - 1;
    if (prev >= 0 && /^\*\*(Do|Don't):\*\*\s*$/.test(joined[prev]) && l.trim()) joined[prev] = `${joined[prev]} ${l.trim()}`;
    else if (!(l.trim() === '' && prev >= 0 && /^\*\*(Do|Don't):\*\*\s*$/.test(joined[prev]))) joined.push(l);
  }
  return joined.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ── A page's sections ───────────────────────────────────────────────────────────────────────────────────────────────
// → { title: its # heading or null, intro: the text before the first ##, sections: [{ title, body }] }
export function mdSections(text) {
  let title = null;
  const intro = [], sections = [];
  let h2 = null, cur = null, fenced = false;
  const start = (t) => { cur = { title: t, lines: [] }; sections.push(cur); };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = fenced ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h && h[1].length === 1 && !title && !h2) { title = h[2].trim(); continue; }
    if (h && h[1].length === 2) { h2 = h[2].trim(); start(h2); continue; }
    if (h && h[1].length === 3 && h2) { start(`${h2} / ${h[2].trim()}`); continue; }
    (cur ? cur.lines : intro).push(line);
  }
  return { title, intro: intro.join('\n').trim(), sections: sections.map((s) => ({ title: s.title, body: s.lines.join('\n').trim() })).filter((s) => s.body) };
}

const words = (s) => String(s ?? '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
const pretty = (s) => { const w = words(s); return w ? w[0].toUpperCase() + w.slice(1) : w; };
const plainTitle = (s) => String(s ?? '').replace(/[`*_]/g, '').trim();
// The nearest folder of the path named for a layer (components, patterns…). → its name, or null
// A site's own pages folder (src/pages, app/pages: where a documentation site keeps every page) names no layer.
function layerFolder(dir) {
  const segs = dir.split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (/^pages$/i.test(segs[i]) && (i === 0 || /^(src|app|docs?|website|site)$/i.test(segs[i - 1]))) continue;
    if (layerOf('', segs[i]) !== 'system') return segs[i];
  }
  return null;
}

// The pages and the system's own page. texts: Map(path → text) of the Markdown files; paths: every path under the
// layer (the code files beside a page are found in it); root: the layer's folder ('' for the repository's root).
// → { system, entities } as readDsds gives
export function readMarkdown(texts, { paths = [], root = '' } = {}) {
  const base = String(root ?? '').replace(/^\.?\/?|\/+$/g, '');
  const relOf = (p) => (base && p.startsWith(base + '/') ? p.slice(base.length + 1) : p);
  const all = new Set(paths.length ? paths : [...texts.keys()]);
  const groups = new Map();   // page key → [{ path, tab, fm, meta, doc }]
  const systemFiles = [];
  for (const [path, text] of [...texts].sort(([a], [b]) => a.localeCompare(b))) {
    if (!PAGE_FILE.test(path)) continue;
    const rel = relOf(path), dir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel), name = posix.basename(rel).replace(PAGE_FILE, '');
    if (NOT_A_PAGE.test(name) || dir.split('/').some((d) => DEV_DIR.test(d))) continue;
    const { data: fm, body } = frontMatter(text);
    const meta = metaTitle(body);
    const doc = mdSections(plainText(body));
    // The layer's own README or index: the system's page. A layer folder's index: guidance for that layer.
    if (/^(readme|index)$/i.test(name) && (!dir || (layerFolder(dir) === posix.basename(dir) && !fm.title && !meta))) { systemFiles.push({ path, dir, fm, doc }); continue; }
    const tab = TAB.test(name) && dir ? name.toLowerCase() : null;
    if (tab && DEV_TAB.test(tab)) continue;
    // A component's folder is its page: its tabs, the file named after it (Button/Button.mdx), and a docs folder in it
    // (Button/docs/overview.mdx).
    const home = DOCS_DIR.test(posix.basename(dir)) && posix.dirname(dir) !== '.' ? posix.dirname(dir) : dir;
    const key = tab || (home !== dir) || (dir && name.toLowerCase() === posix.basename(dir).toLowerCase()) ? home : rel.replace(PAGE_FILE, '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ path, dir, name, tab, fm, meta, doc });
  }

  const entities = [];
  for (const [key, files] of groups) {
    // The main tab first: its name, its intro and its front matter speak for the page.
    const isMain = (f) => (f.tab ? MAIN_TAB.test(f.tab) : f.dir === key || !f.dir) ? 1 : 0;
    files.sort((a, b) => (isMain(b) - isMain(a)) || a.path.localeCompare(b.path));
    const main = files[0];
    const fm = Object.assign({}, ...files.map((f) => f.fm).reverse());
    const meta = files.map((f) => f.meta).find(Boolean);
    const folderPage = files.some((f) => f.dir === key || f.dir.startsWith(key + '/'));
    const dir = folderPage ? key : main.dir;
    const own = folderPage ? posix.basename(key) : main.name;
    const name = plainTitle(fm.title ?? fm.name ?? (meta ? meta.split('/').pop() : null) ?? files.map((f) => f.doc.title).find(Boolean) ?? pretty(own));
    const items = [], dos = [], donts = [];
    // A Do or Don't example, wherever it is on the page, goes to the page's Do and Don't sections.
    const take = (body) => body.split('\n').filter((l) => { const m = /^\s*(?:[-*]\s+)?\*\*(Do|Don't):\*\*\s*(.*)$/.exec(l); if (!m) return true; if (m[2].trim()) (m[1] === 'Do' ? dos : donts).push(`- ${m[2].trim()}`); return false; }).join('\n').trim();
    for (const f of files) {
      const tabTitle = f.tab && !MAIN_TAB.test(f.tab) ? pretty(f.tab) : null;
      const intro = take(f.doc.intro);
      if (intro) items.push({ title: tabTitle ?? 'Overview', body: intro });
      for (const s of f.doc.sections) { const body = take(s.body); if (body) items.push({ title: tabTitle ? `${tabTitle} / ${s.title}` : s.title, body }); }
    }
    if (dos.length) items.push({ title: 'Do', body: dos.join('\n') });
    if (donts.length) items.push({ title: "Don't", body: donts.join('\n') });
    // Its code: named, else a code file of its name (or its folder's) beside it.
    const stem = (p) => posix.basename(p).replace(/\.[^.]+$/, '').replace(/\.(stories|story|docs?)$/i, '').toLowerCase();
    const named = String(fm.component ?? fm.code ?? fm.source ?? fm.sourcepath ?? fm.file ?? '').trim();
    const inDir = (p) => posix.dirname(p) === (base ? posix.join(base, dir) : dir || '.');
    const code = named || [...all].find((p) => CODE_FILE.test(p) && !/\.(stories|story|test|spec)\.\w+$/i.test(p) && inDir(p) && [own.toLowerCase(), words(own).replace(/\s+/g, '').toLowerCase()].includes(stem(p).replace(/[-_]/g, ''))) || null;
    const metaKind = meta && meta.includes('/') ? meta.split('/')[0] : null;
    // The folder a component's own folder sits in names its layer, never the component's folder (Layout/, Token/).
    const around = folderPage ? (posix.dirname(dir) === '.' ? '' : posix.dirname(dir)) : dir;
    const folder = layerFolder(base ? posix.join(base, around) : around);
    const kindOf = folder ? SINGULAR[layerOf('', folder)] : null;
    const kind = String(fm.kind ?? fm.type ?? fm.layer ?? metaKind ?? kindOf ?? (code || items.some((s) => COMPONENT_SECTION.test(plainTitle(s.title.split('/').pop()))) ? 'component' : 'guide')).trim();
    const entity = {
      kind, name, identifier: fm.id ?? posix.basename(key),
      ...(fm.description ? { description: fm.description } : {}),
      metadata: { ...(fm.status ? { status: fm.status } : {}), ...(fm.aliases ? { aliases: [fm.aliases].flat() } : {}), ...(fm.summary ? { summary: fm.summary } : {}) },
      ...(code ? { sourceFiles: [code] } : {}),
      documentBlocks: [{ kind: 'sections', items }],
    };
    // The group decides the layer first: the folder (or the Meta title's first part), as an index's group does.
    const view = entityView(entity, main.path, String(fm.kind ?? fm.type ?? fm.layer ?? metaKind ?? folder ?? ''), null, { described: true });
    if (code && !view.code) view.code = code;
    if (files.length > 1) view.files = files.map((f) => f.path);
    entities.push(view);
  }

  // The system's own page: its sections, a layer's index under the layer's name; drafted lines held, as on any page.
  let system = null;
  if (systemFiles.length) {
    const top = systemFiles.find((f) => !f.dir) ?? null;
    const sections = [], drafts = [];
    for (const f of systemFiles.sort((a, b) => a.dir.length - b.dir.length)) {
      const lead = f.dir ? pretty(posix.basename(f.dir)) : null;
      const add = (title, body) => { const text = heldLines(String(body), title, drafts); if (text) sections.push({ title, text }); };
      if (f.doc.intro) add(lead ?? 'About', f.doc.intro);
      for (const s of f.doc.sections) add(lead ? `${lead} / ${s.title}` : s.title, s.body);
    }
    system = { name: plainTitle(top?.fm.title ?? top?.doc.title ?? '') || null, version: top?.fm.version ?? null, format: 'markdown', sections, file: (top ?? systemFiles[0]).path, ...(drafts.length ? { drafts } : {}) };
  }
  return { system, entities };
}

// ── Links between pages ─────────────────────────────────────────────────────────────────────────────────────────────
// A link a page makes to another page of the site (/components/tree-view/usage, ../button.md) points nowhere outside
// it: it is made a link to that page where the layer lives, or to the layer's file it names. Links to anywhere else are
// left as they are. url(file): the link to one file of the layer.
const pageKey = (file) => { const p = String(file).replace(PAGE_FILE, ''), dir = posix.dirname(p), base = posix.basename(p); return dir !== '.' && (TAB.test(base) || base.toLowerCase() === posix.basename(dir).toLowerCase()) ? dir : p; };
export function resolveLinks(entities, { url, paths = [] } = {}) {
  const keys = entities.flatMap((e) => (e.files ?? [e.file]).map((f) => [pageKey(f).toLowerCase(), e]));
  const files = new Set(paths);
  const target = (href, from) => {
    const [path, hash] = String(href).split('#');
    if (!path || /^[a-z][\w+.-]*:|^\/\//i.test(path)) return null;
    if (!path.startsWith('/')) { const f = posix.normalize(posix.join(posix.dirname(from), path)); if (files.has(f)) { const u = url(f); return u ? u + (hash ? `#${hash}` : '') : null; } }
    const want = path.replace(/^\/+|\/+$/g, '').replace(PAGE_FILE, '').toLowerCase().split('/');
    for (let cut = 0; cut <= 1 && want.length - cut > 0; cut++) {
      const tail = want.slice(0, want.length - cut).join('/');
      const hit = keys.filter(([k]) => k === tail || k.endsWith('/' + tail));
      if (hit.length && new Set(hit.map(([, e]) => e)).size === 1) return hit[0][1].url ? hit[0][1].url + (hash ? `#${hash}` : '') : null;
      if (!TAB.test(want[want.length - 1])) break;   // only a tab's name may be left off (/button/usage → the Button page)
    }
    return null;
  };
  const fix = (t, from) => String(t).replace(/\]\(([^)\s]+)\)/g, (m, href) => { const u = target(href, from); return u ? `](${u})` : m; });
  for (const e of entities) {
    for (const k of ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations']) e[k] = (e[k] ?? []).map((t) => fix(t, e.file));
    e.rules = (e.rules ?? []).map((r) => ({ ...r, text: fix(r.text, e.file) }));
    e.sections = (e.sections ?? []).map((x) => ({ ...x, text: fix(x.text, e.file) }));
  }
}
