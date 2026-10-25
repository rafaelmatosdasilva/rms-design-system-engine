// intent-changes.mjs - the changes the Intent layer review asks for, made in the layer's own files and offered to the
// team as one merge request: never written to its branch directly.
//
// What it changes, page by page (useReport and the content check, intent-truth.mjs):
//   - the lines written on every page alike are taken out (mechanical);
//   - a sentence the system contradicts (a name it does not have, a value a prop does not take) is written again
//     with only what the system has, as a draft; one nothing in the system can say is left for a person;
//   - a component page that does not say what it is for, or when (not) to use it, and two pages that say the same,
//     get lines drafted for what is missing.
// A drafted line starts with **Draft:** (doc-source-dsds.mjs → DRAFT): it reaches no agent until a person removes the
// marker, and the style guide lists it under Review. Every drafted line passes the content check before it is written.
//
// Where a change is written: the page's own source when it is generated from one (a Markdown spec whose metadata
// names the page's code file, or whose title is its name) and the page itself too, so both say the same until the
// layer is generated again; else the page's DSDS file. A spec several pages are written from (a family's) takes a
// change that is true of all of them (a line taken out), never one drafted for one page: that page needs its own spec
// first, and is said.
//
// Drafts are written by Claude Code (the claude command, headless), told only what the system has; with no claude
// command, or --no-drafts, only the mechanical changes are made.

import { gunzipSync } from 'node:zlib';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { intentLayerConfig, DRAFT } from './doc-source-dsds.mjs';
import { STATE_FILE, parseGitlabProject, tokenFrom, writeTokenFrom, hostEnvFrom, plainGet, plainSend, untar, projectApi } from './gitlab-source.mjs';
export { writeTokenFrom };
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { linesOf, checkPage } from './intent-truth.mjs';

export const CHANGES_DIR = `${OUT_DIR}/intent-changes`;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const MARK = '**Draft:** ';

// ── The layer, where it lives ───────────────────────────────────────────────────────────────────────────────────────
// → { p, base, ref, get(path), send(method, path, body) }, or { error }
export function layerAccess(ROOT, cfg, { env = process.env } = {}) {
  const c = intentLayerConfig(cfg);
  if (!c) return { error: 'ds-config.json names no intent layer (intentLayer)' };
  const e = { ...env };
  const folders = [ROOT, ...(existsSync(join(ROOT, STATE_FILE)) ? [dirname(resolve(ROOT))] : [])];
  e.GITLAB_HOST = hostEnvFrom(e, folders);
  let host = ''; try { host = new URL(c.url).host; } catch { /* not a link */ }
  const p = parseGitlabProject(c.url, e) ?? (host ? parseGitlabProject(c.url, { ...e, GITLAB_HOST: [e.GITLAB_HOST, host].filter(Boolean).join(',') }) : null);
  if (!p) return { error: `${c.url} is not a GitLab project link` };
  const token = tokenFrom(e, folders);
  const headers = token && tokenAllowedFor(p.host, e) ? { 'PRIVATE-TOKEN': token } : {};
  // What writes (the merge request) takes GITLAB_WRITE_TOKEN when there is one: a token that may write only where it is
  // meant to (a project's or a group's own token), while GITLAB_TOKEN keeps reading everything the engine reads.
  const write = writeTokenFrom(e, folders);
  const writeHeaders = write && tokenAllowedFor(p.host, e) ? { 'PRIVATE-TOKEN': write } : headers;
  // The layer by its id, found from the link even when it moved or names the project (gitlab-source.mjs).
  let ready = null;
  const base = () => (ready ??= projectApi(p.origin, p.path, (u) => plainGet(u, { headers: headers['PRIVATE-TOKEN'] ? headers : writeHeaders })).then((x) => x.base));
  return {
    p, hasToken: !!headers['PRIVATE-TOKEN'], writesWith: writeHeaders === headers ? 'GITLAB_TOKEN' : 'GITLAB_WRITE_TOKEN',
    // A read refused with GITLAB_TOKEN (revoked, expired) is asked again with the write token, which reads its project.
    get: async (path) => { const b = await base(); const r = await plainGet(b + path, { headers }); return (r.status === 401 || r.status === 403) && writeHeaders !== headers ? plainGet(b + path, { headers: writeHeaders }) : r; },
    send: async (method, path, body) => plainSend((await base()) + path, { method, headers: writeHeaders, body }),
  };
}

// Every text file of the layer at a commit. → Map(path → text)
export async function layerFiles(access, sha) {
  const r = await access.get(`/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}`);
  if (!r.ok) throw new Error(`GitLab answered ${r.status} for the layer's files`);
  const out = new Map();
  for (const f of untar(gunzipSync(Buffer.from(await r.arrayBuffer())))) if (/\.(md|json|mjs|js|ya?ml|txt)$/i.test(f.path)) out.set(f.path, f.data.toString('utf8'));
  return out;
}

// ── Where a page is written ─────────────────────────────────────────────────────────────────────────────────────────
// The Markdown specs, by the code file their metadata names (a file, or a family's folder) and by their title.
export function specIndex(files) {
  const byCode = new Map(), byFolder = [], byTitle = new Map();
  for (const [f, t] of files) {
    if (!/\.md$/i.test(f)) continue;
    const src = /^\s*[-*]\s*Source:\s*`([^`]+)`/mi.exec(t)?.[1]?.replace(/^\.?\//, '');
    const h1 = /^#\s+(.+)$/m.exec(t)?.[1]?.trim();
    // A component's own spec wins over a pattern's that names the same code as its source; a pattern never owns a
    // component's code (its drafts would land in the pattern, and leave the component's page when it is generated again).
    if (src && /\.\w+$/.test(src)) { if (/(^|\/)patterns\//.test(f)) continue; if (!byCode.has(src) || (/\/components\//.test(f) && !/\/components\//.test(byCode.get(src)))) byCode.set(src, f); }
    else if (src) byFolder.push([src.replace(/\/?$/, '/'), f]);
    if (h1 && !byTitle.has(norm(h1))) byTitle.set(norm(h1), f);
  }
  return { byCode, byFolder, byTitle };
}
// → { spec, shared } (shared: a family's spec, written into several pages), or null
export function specOf(e, idx) {
  const code = String(e.code ?? '').replace(/^\.?\//, '');
  if (code && idx.byCode.has(code)) return { spec: idx.byCode.get(code), shared: false };
  if (idx.byTitle.has(norm(e.name))) return { spec: idx.byTitle.get(norm(e.name)), shared: false };
  const fam = code && idx.byFolder.filter(([d]) => code.startsWith(d)).sort((a, b) => b[0].length - a[0].length)[0];
  return fam ? { spec: fam[1], shared: true } : null;
}

// ── Editing a Markdown spec ─────────────────────────────────────────────────────────────────────────────────────────
// The written sections first, in the order a spec keeps them (Purpose to Limitations), then the reference ones (its role,
// do and don't, an example): a spec checked for its section order takes a new one in its place.
const ORDER = ['purpose', 'when to use', 'when not to use', 'rules', 'common mistakes', 'limitations', 'role', 'do and don\'t', 'example', 'properties', 'data', 'events', 'slots'];
// The role of the element a component's code renders, as a screen reader names it (none for an element with no role).
// An example of a component in use: its tag, and each prop that takes named values with the first of them (up to three),
// so every name and value in it is one the code takes.
// Each component's first use in the product's own code, as the last prototype check read it (page-check.mjs keeps it in
// OUT_DIR/prototypes/page-system.json): an example that is the code itself, its product's own attributes (data-*,
// class) left out. Sets facts.components[name].realUse.
export function withRealUses(ROOT, facts) {
  let cache = null;
  try { cache = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'prototypes', 'page-system.json'), 'utf8')); } catch { return facts; }
  const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const byKey = new Map(Object.keys(facts.components ?? {}).map((n) => [key(n), n]));
  for (const [name, u] of Object.entries(cache.firstUse ?? {})) {
    const n = [name, ...(cache.components?.[name]?.aliases ?? [])].map((a) => byKey.get(key(a))).find(Boolean);
    const code = String(u?.code ?? '').replace(/\s+(?:data-[\w-]+|class|className)=(?:"[^"]*"|'[^']*')/g, '').replace(/\s+/g, ' ').trim();
    // A tag that holds children is shown open and closed, its children left out.
    const tag = /^<([\w.:-]+)/.exec(code)?.[1];
    const whole = /\/>$/.test(code) || !tag ? code : `${code} … </${tag}>`;
    if (n && code && whole.length <= 320 && !code.includes('`')) facts.components[n].realUse = whole;
  }
  return facts;
}
// The section the engine keeps as the code is: Data, what each list or object holds. Events, props and slots are the
// generator's own definitions (from the code), never written twice.
const OWNED = ['Data'];
// Their lines for a component, from its code facts (codeFactsFor), leaving out what the rest of its page already names
// (said: the words of its other lines). → [{ where, text }]
export function factLines(k, said = new Set()) {
  const unsaid = (x) => !said.has(String(x).toLowerCase());
  const out = [];
  for (const p of Object.keys(k.data ?? {}).filter((p) => (k.data[p] ?? []).some(unsaid))) out.push({ where: 'Data', text: `\`${p}\` holds ${k.listy?.[p] ? 'a list of items, each with' : 'an object with'} ${k.data[p].map((f) => `\`${f}\``).join(', ')}.` });
  return out;
}

// What the code says of each component, from the system the last prototype check read (page-check.mjs keeps it in
// OUT_DIR/prototypes/page-system.json), and what the stress tests found (stress.json): by its code file →
// { events, payloads, slots, props (no comment explains them), propFacts, data: { prop: fields }, listy, ownless, shared,
// confusedWith (the other component, by the name the facts know it) }
export function codeFactsFor(ROOT, facts) {
  const out = new Map();
  let cache = null, stress = null;
  try { cache = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'prototypes', 'page-system.json'), 'utf8')); } catch { return out; }
  try { stress = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'prototypes', 'stress.json'), 'utf8')); } catch { /* no stress test yet */ }
  const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const factName = new Map(Object.keys(facts.components ?? {}).map((n) => [key(n), n]));
  const asFact = (n) => [n, ...(cache.components?.[n]?.aliases ?? [])].map((a) => factName.get(key(a))).find(Boolean) ?? null;
  const ownless = new Set(stress?.scenarios?.ownless ?? []);
  const sharedOf = (n) => (stress?.scenarios?.shared ?? []).filter((x) => x.components.includes(n)).map((x) => x.text);
  for (const [n, c] of Object.entries(cache.components ?? {})) {
    if (!c?.file) continue;
    const props = Object.entries(c.props ?? {});
    const listy = Object.fromEntries(props.filter(([, d]) => /array|object/.test(String(d.type ?? '').toLowerCase())).map(([p, d]) => [p, /array/.test(String(d.type).toLowerCase())]));
    // What each list or object holds: the fields its comment names, and those the product's own code gives it.
    const data = {};
    for (const p of Object.keys(listy)) {
      const named = Object.keys(c.fields?.[p] ?? {});
      const given = [...new Set((cache.uses?.[`${n}\u0000${p}`]?.values ?? []).flatMap((v) => (Array.isArray(v) ? v.flat(2) : [v])).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).flatMap((x) => Object.keys(x)))];
      const all = [...new Set([...named, ...given])];
      if (all.length) data[p] = all;
    }
    const confused = stress?.scenarios?.confusions?.[n]?.map((x) => x.chose).filter(Boolean) ?? [];
    out.set(String(c.file).replace(/^\.?\//, ''), {
      name: n, events: c.events ?? [], payloads: c.eventPayloads ?? {}, slots: c.slots?.named ?? [],
      props: props.filter(([, d]) => !d.description && !listy[d]).map(([p]) => p).filter((p) => !(p in listy)),
      propFacts: Object.fromEntries(props.map(([p, d]) => [p, { type: d.type ?? null, default: d.default ?? null, options: d.options ?? null }])),
      data, listy, ownless: ownless.has(n), shared: sharedOf(n),
      confusedWith: confused.length ? asFact(confused.sort((a, b) => confused.filter((x) => x === b).length - confused.filter((x) => x === a).length)[0]) : null,
    });
  }
  return out;
}
export function exampleOf(b) {
  // A use in the product's own code is the surest example there is: it is the code.
  if (b.realUse) return '`' + b.realUse + '`';
  // Only the code's own props (a name only Figma uses is not one the component takes).
  const set = Object.entries(b.props ?? {}).filter(([p, v]) => (!b.codeProps || b.codeProps.includes(p)) && Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && !/^(true|false)$/.test(x))).slice(0, 3);
  return '`<' + b.tag + set.map(([p, v]) => ` ${p}="${v[0]}"`).join('') + ' />`';
}
const ROLE_OF = { button: 'button', a: 'link', nav: 'navigation', ul: 'list', ol: 'list', table: 'table', dialog: 'dialog', select: 'combobox', textarea: 'textbox', form: 'form', header: 'banner', footer: 'contentinfo', aside: 'complementary', progress: 'progressbar' };
const headKey = (h) => h.replace(/^#+\s*/, '').replace(/^\d+(\.\d+)*[.)]?\s+/, '').trim().toLowerCase();
// Take a line out (a list item or a paragraph line equal to it); a heading left with nothing under it goes too.
export function mdRemove(text, line) {
  const want = flat(line);
  const lines = text.split('\n');
  const keep = lines.filter((l) => flat(l.replace(/^\s*[-*]\s+/, '')) !== want);
  if (keep.length === lines.length) return text;
  return dropEmptyHeadings(keep).join('\n');
}
function dropEmptyHeadings(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || /^#{1,2}\s/.test(lines[j])) { i = j - 1; while (out.length && !out.at(-1).trim() && out.length > 1 && !out.at(-2).trim()) out.pop(); continue; }
    }
    out.push(lines[i]);
  }
  return out;
}
// Write a line again (the list item or line that holds it): its new text, marked a draft.
export function mdReplace(text, line, next) {
  const want = flat(line);
  let done = false;
  const out = text.split('\n').map((l) => {
    const m = /^(\s*[-*]\s+)?(.*)$/.exec(l);
    if (!done && flat(m[2]) === want) { done = true; return (m[1] ?? '') + MARK + next; }
    return l;
  });
  return done ? out.join('\n') : text;
}
// Add a drafted line under its heading (made where it belongs in the spec's order when it is not there).
// sure: a line taken from the code or Figma as it is (a role, an example from its own props): written as the team's,
// with no Draft marker, since nothing in it was judged.
export function mdAdd(text, where, line, { sure = false } = {}) {
  const lines = text.split('\n');
  const key = where.toLowerCase(), mark = sure ? '' : MARK;
  const bullet = key === 'purpose' ? mark + line : `- ${mark}${line}`;
  const at = lines.findIndex((l) => /^##\s/.test(l) && headKey(l) === key);
  if (at >= 0) {
    let end = at + 1; while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    let last = end - 1; while (last > at && !lines[last].trim()) last--;
    lines.splice(last + 1, 0, ...(key === 'purpose' ? ['', bullet] : [bullet]));
    return lines.join('\n');
  }
  const rank = ORDER.indexOf(key);
  const later = lines.findIndex((l, i) => i > 0 && /^##\s/.test(l) && (ORDER.indexOf(headKey(l)) > rank || (ORDER.indexOf(headKey(l)) < 0 && headKey(l) !== 'metadata')));
  const block = [`## ${where}`, '', bullet, ''];
  if (later < 0) return text.replace(/\s*$/, '\n\n') + block.join('\n');
  lines.splice(later, 0, ...block);
  return lines.join('\n');
}

// ── Editing a DSDS page ─────────────────────────────────────────────────────────────────────────────────────────────
const SECTION = { 'when to use': ['when-to-use', 'should'], 'when not to use': ['when-to-use', 'should-not'], rules: ['how-to-use', 'should'], 'common mistakes': ['how-to-use', 'must-not'], limitations: ['how-to-use', 'should'] };
const indentOf = (text) => (/\n(\t+)"/.exec(text)?.[1]?.slice(0, 1)) ?? ' '.repeat((/\n( +)"/.exec(text)?.[1] ?? '  ').length);
export function jsonText(doc, before) { return JSON.stringify(doc, null, indentOf(before)) + (before.endsWith('\n') ? '\n' : ''); }
const entriesOf = (doc) => (Array.isArray(doc?.entries) ? doc.entries : [doc]);
// Take a line out of the entry: a rule equal to it (its section too when nothing is left), a line of a section's text.
export function jsonRemove(entry, line) {
  const want = flat(line); let n = 0;
  entry.sections = (entry.sections ?? []).filter((s) => {
    if (Array.isArray(s.items) && s.kind === 'guidelines') { const k = s.items.length; s.items = s.items.filter((it) => flat(it.statement) !== want); n += k - s.items.length; return s.items.length > 0; }
    for (const f of s.freeform ?? []) if (typeof f.body === 'string') { const b = f.body.split('\n').filter((l) => flat(l.replace(/^\s*[-*]\s+/, '')) !== want).join('\n'); if (b !== f.body) { f.body = b; n++; } }
    return true;
  });
  return n;
}
export function jsonReplace(entry, line, next) {
  const want = flat(line); let n = 0;
  for (const s of entry.sections ?? []) {
    for (const it of s.items ?? []) if (flat(it.statement) === want) { it.statement = MARK + next; n++; }
    for (const f of s.freeform ?? []) if (typeof f.body === 'string') f.body = f.body.split('\n').map((l) => { const m = /^(\s*[-*]\s+)?(.*)$/.exec(l); if (flat(m[2]) === want) { n++; return (m[1] ?? '') + MARK + next; } return l; }).join('\n');
  }
  if (flat(entry.description) === want) { entry.description = MARK + next; n++; }
  return n;
}
// How the layer's own pages hold each heading, so a line goes where the layer's generator would put it, and generating the
// pages again moves nothing: as a guidelines section, as a section of its own (its text under the same title), or as a
// block of text inside another section. The shape most pages use wins. files: Map(path → text) → { shapes, parents }
export function layoutOf(files) {
  const votes = new Map(), parents = new Set();
  const vote = (title, shape) => { const k = String(title ?? '').toLowerCase(); if (!k) return; const v = votes.get(k) ?? new Map(); v.set(shape, (v.get(shape) ?? 0) + 1); votes.set(k, v); };
  for (const [f, t] of files) {
    if (!/\.json$/i.test(f)) continue;
    let doc; try { doc = JSON.parse(t); } catch { continue; }
    for (const e of entriesOf(doc)) for (const s of e?.sections ?? []) {
      if (s.kind === 'guidelines') { vote(s.title, 'guidelines'); continue; }
      for (const b of s.freeform ?? []) {
        if (String(b.title ?? '').toLowerCase() === String(s.title ?? '').toLowerCase()) vote(b.title, 'own');
        else { vote(b.title, `in:${s.title}`); parents.add(String(s.title).toLowerCase()); }
      }
    }
  }
  const shapes = new Map([...votes].map(([k, v]) => [k, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
  return { shapes, parents };
}
export function jsonAdd(entry, where, line, { sure = false, layout = null } = {}) {
  const key = where.toLowerCase(), mark = sure ? '' : MARK;
  if (key === 'purpose') { if (!flat(entry.description)) entry.description = mark + line; return; }
  const shape = layout?.shapes.get(key);
  if (shape && shape !== 'guidelines') {
    entry.sections ??= [];
    const host = shape === 'own' ? where : shape.slice(3);
    let s = entry.sections.find((x) => x.kind !== 'guidelines' && String(x.title ?? '').toLowerCase() === host.toLowerCase());
    if (!s) {
      s = { kind: 'section', for: 'all', title: host, freeform: [] };
      // A section of its own goes before the sections that hold the rest of the text, as the generator places it.
      const later = shape === 'own' ? entry.sections.findIndex((x) => x.kind === 'section' && layout.parents.has(String(x.title ?? '').toLowerCase())) : -1;
      entry.sections.splice(later < 0 ? entry.sections.length : later, 0, s);
    }
    s.freeform ??= [];
    let b = s.freeform.find((x) => String(x.title ?? '').toLowerCase() === key);
    if (!b) { b = { title: where, body: '' }; s.freeform.push(b); }
    b.body = (b.body ? b.body + '\n' : '') + '- ' + mark + line;
    return;
  }
  const [framing, level] = SECTION[key] ?? ['how-to-use', 'should'];
  entry.sections ??= [];
  let s = entry.sections.find((x) => x.kind === 'guidelines' && String(x.title ?? '').toLowerCase() === key);
  if (!s) {
    s = { kind: 'guidelines', for: 'all', framing, title: where, items: [] };
    const rank = ORDER.indexOf(key);
    const later = entry.sections.findIndex((x) => x.kind !== 'guidelines' || ORDER.indexOf(String(x.title ?? '').toLowerCase()) > rank);
    entry.sections.splice(later < 0 ? entry.sections.length : later, 0, s);
  }
  s.items.push({ level, statement: mark + line });
}

// ── What to change ──────────────────────────────────────────────────────────────────────────────────────────────────
// report: useReport's, with the content check's findings (wrong) on each page. → [{ entity, page, remove, rewrite, need }]
//   rewrite: [{ line (as written), finding }]; need: ['purpose' | 'whenToUse' | 'whenNotToUse' | 'mistakes' | 'limitations'
//   | 'example' | 'role' | 'doDont' | 'differ']
// leftForPeople: the lines a drafter said nothing in the system can say (kept, so they are not asked about again).
// partOf: Map(page name → the code files that use it), for each page of an internal part (intent-proposals.mjs → partsOf).
// hold: the keys of the Fix proposals the team has not answered (intent-answers.mjs): their sentences wait for the answer.
export function planOf(snap, report, { leftForPeople = new Set(), code = null, partOf = new Map(), hold = new Set() } = {}) {
  const byKey = new Map(snap.entities.map((e) => [`${e.file}#${e.name}`, e]));
  const nameOfCode = (f) => snap.entities.find((x) => x.code && String(x.code).replace(/^\.?\//, '') === String(f).replace(/^\.?\//, ''))?.name ?? String(f).split('/').pop().replace(/\.\w+$/, '');
  const out = [];
  for (const page of report.pages) {
    const e = byKey.get(`${page.file}#${page.name}`); if (!e) continue;
    // An internal part's page says, for certain, that it is not used on its own and what to use: the components that use it.
    if (page.action === 'move' && partOf.get(page.name)?.length) {
      const users = [...new Set(partOf.get(page.name).map(nameOfCode))];
      const text = `Not used on its own: it is an internal part of ${users.join(' and ')}; use ${users.length > 1 ? 'one of them' : users[0]} instead.`;
      if (!linesOf(e).some((l) => /internal part of/i.test(l.text))) out.push({ entity: e, page, remove: [], rewrite: [], need: [{ write: [{ where: 'When not to use', text }] }] });
      continue;
    }
    if (['delete', 'move', 'rename', 'name'].includes(page.action)) continue;   // a page to remove or name first
    const remove = [...new Set(e.repeatedLines ?? [])];
    const rewrite = [];
    for (const f of page.wrong ?? []) {
      if (f.kind !== 'name' && f.kind !== 'claim' || !f.line) continue;
      if (f.kind === 'name' && hold.has(`fix:${page.name}:${String(f.says).replace(/`/g, '')}`)) continue;
      // The line as written that holds the sentence: a list item, or a line of a section's text.
      const held = linesOf(e).flatMap((l) => l.text.split('\n')).map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).find((l) => flat(l).includes(flat(f.line)));
      if (held && leftForPeople.has(flat(held))) continue;
      if (held && !rewrite.some((r) => r.line === held)) rewrite.push({ line: held, findings: [f] });
      else if (held) rewrite.find((r) => r.line === held).findings.push(f);
    }
    const need = [];
    if (page.component && !(page.drafts ?? []).length) {
      if (!e.purpose.length) need.push('purpose');
      if (!e.whenToUse.length) need.push('whenToUse');
      if (!e.whenNotToUse.length) need.push('whenNotToUse');
      if (!e.mistakes.length) need.push('mistakes');
      if (!e.limitations.length) need.push('limitations');
      const said = linesOf(e).map((l) => `${l.where}: ${l.text}`);
      if (!said.some((t) => /^examples?\b/i.test(t) || /```|`<[A-Za-z][\w-]*[\s/>]/.test(t))) need.push('example');
      if (!said.some((t) => /(^|:\s*)role\s*[:\u2014-]|^(accessibility )?role\b/i.test(t))) need.push('role');
      if (!said.some((t) => /^do'?s?\s*(and|&)\s*don'?t'?s?\b/i.test(t) || /(^|:\s*)(do|don'?t|do not)\s*:/i.test(t))) need.push('doDont');
      const twin = (page.wrong ?? []).find((f) => f.kind === 'twin');
      if (twin) need.push({ differ: twin.other });
      // What the stress tests found: no "when to use" of its own (every line shared), or agents picking another
      // component for what its page names (drafted: telling them apart is a judgement).
      const k = code?.(e);
      if (k?.ownless && !need.includes('whenToUse')) need.push('whenToUse', { ownUse: k.shared ?? [] });
      if (k?.confusedWith && !twin) need.push({ differ: k.confusedWith });
    }
    // What the code says for certain, kept as the code is: what each list or object holds. That section is the engine's:
    // each run writes what the page does not say yet and takes out a line the code no longer says (a field gone), with
    // nothing to review.
    if (page.component) {
      const k = code?.(e);
      if (k) {
        const owned = [], free = [];
        for (const l of linesOf(e)) {
          const m = /^(Data):\s*([\s\S]*)$/.exec(l.text);
          if (OWNED.includes(l.where)) owned.push({ where: l.where, text: l.text.trim() });
          else if (m) owned.push({ where: m[1], text: m[2].trim() });
          else free.push(l);
        }
        const said = new Set(free.flatMap((l) => String(l.text).toLowerCase().match(/[a-z_$][\w$:-]*/g) ?? []));
        const now = factLines(k, said);
        for (const o of owned) if (!now.some((x) => x.where === o.where && flat(x.text) === flat(o.text))) remove.push(o.text);
        const write = now.filter((x) => !owned.some((o) => o.where === x.where && flat(o.text) === flat(x.text)));
        if (write.length) need.push({ write });
      }
    }
    if (remove.length || rewrite.length || need.length) out.push({ entity: e, page, remove, rewrite, need });
  }
  return out;
}

// ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────────────
// What the system says of a component, for whoever drafts: its props and the values each takes, its code file, what
// Figma says it is, and what its page says now.
export function briefOf(name, facts, e = null) {
  const c = facts.components[name] ?? {};
  return {
    component: name, file: c.file ?? null, status: c.status ?? null,
    // The tag an example writes it with (its file's name), and the element it renders: what its role starts from.
    tag: c.file ? String(c.file).split('/').pop().replace(/\.[^.]+$/, '') : null, root: c.root ?? null,
    codeProps: Object.values(c.props ?? {}).some((d) => d.from) ? Object.keys(c.props).filter((p) => c.props[p].from === 'the code') : null,
    props: Object.fromEntries(Object.entries(c.props ?? {}).map(([p, d]) => [p, d.options?.length ? d.options : d.type ?? 'any'])),
    page: e ? linesOf(e).map((l) => `${l.where}: ${l.text}`).slice(0, 40) : [],
    ...(c.realUse ? { realUse: c.realUse } : {}),
  };
}
const RULES = `Rules for every line you write:
- Name only components, props and values listed in the facts given, in backticks, exactly as written there. Never invent one.
- One sentence a line, plain and specific to this component; never a sentence that would be true of any component.
- Say what a person or an agent should do, not what the component is made of; no token or pixel values.
- When nothing true can be said from the facts, give null (or an empty list).`;
// The claude command, headless, one prompt at a time. → text; throws with claude's own words when it cannot answer (not
// signed in, say). null when there is no claude command.
export function claudeRunner({ model = 'claude-sonnet-5-5', bin = 'claude', timeout = 600000 } = {}) {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); } catch { return null; }
  return (prompt) => {
    const r = spawnSync(bin, ['-p', prompt, '--output-format', 'json', '--model', model, '--max-turns', '1', '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task'], { encoding: 'utf8', timeout, maxBuffer: 64e6 });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
    if (r.status !== 0 || out?.is_error) throw new Error(`claude could not answer: ${flat(out?.result ?? r.stderr ?? r.stdout).slice(0, 200)}`);
    return out?.result ?? r.stdout;
  };
}
const jsonIn = (text) => { const m = /\{[\s\S]*\}/.exec(String(text ?? '')); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

// What to ask for, one request per sentence to write again and one per page that lacks a part. → [{ key, kind, it, r?, ask }]
export function draftJobs(plan, facts) {
  const jobs = [];
  for (const [i, it] of plan.entries()) {
    const name = it.page.component;
    for (const [j, r] of it.rewrite.entries()) jobs.push({ key: `${i}.r${j}`, kind: 'rewrite', it, r, ask: { key: `${i}.r${j}`, task: 'rewrite', line: r.line, problems: r.findings.map((f) => f.truth), facts: name ? briefOf(name, facts) : null, layer: it.entity.layer, page: it.entity.name } });
    // Its role and an example are taken from the code, never asked (draftPlan).
    const parts = it.need.filter((n) => typeof n === 'string' && n !== 'role' && n !== 'example');
    const differ = it.need.find((n) => n?.differ)?.differ;
    const ownUse = it.need.find((n) => n?.ownUse)?.ownUse;
    if (name && (parts.length || differ)) jobs.push({ key: `${i}.d`, kind: 'draft', it, ask: { key: `${i}.d`, task: 'draft', need: parts, differFrom: differ ?? null, facts: briefOf(name, facts, it.entity), other: differ ? briefOf(differ, facts) : null, ...(ownUse ? { ownUse: true, shared: ownUse } : {}) } });
  }
  return jobs;
}
// The words a drafter is given for some requests: what to answer, the rules, the requests.
export function draftPrompt(asks) {
  return `You write the documentation of a design system's components, for the people and agents who build with it. Answer with one JSON object and nothing else: { "<key>": <answer> } for every key below.

For a "rewrite": the line has the problems listed. Write it again so that it says what it meant with only what the facts have: { "text": "<the line>" }. If nothing in the facts can say it, { "text": null, "why": "<one short sentence>" }.
For a "draft": write the parts listed in need, for the component in facts: { "purpose": "<one sentence: what it is for>", "whenToUse": ["<line>", …], "whenNotToUse": ["<line>", …], "mistakes": ["<a mistake people make with it, and what to do instead>", …], "limitations": ["<what it does not do, or only does when a prop is set>", …], "doDont": ["Do: <line>", "Don't: <line>"] } (2 or 3 lines each, only the parts asked). With differFrom: also say when to use this one and not the other component (facts in other), in whenToUse, and when to use the other one instead, in whenNotToUse, naming it in backticks. With ownUse: every "when to use" line it has now is shared word for word with other components (in shared): write whenToUse lines that only this one meets, never one of those.

${RULES}

${JSON.stringify(asks, null, 1)}`;
}
// Each rewrite and each missing part drafted (run: prompt → text; or answers: { key: answer } already given), and
// checked: a line the content check finds anything in is not kept.
// → plan items with { rewritten: [{ line, text|null, why }], drafted: [{ where, text }], dropped: [{ text, why }] }
// plan.answers: every answer the drafter gave, by key, so the same drafts can be sent later (--drafts-from) instead of
// asked again.
// What the code says as it is, written as the team's (sure): its role, from the element it renders; an example of it,
// from the product's own use or its own tag and props; its events and what each sends; what each list holds; its slots;
// the props no comment explains. Nothing in them is judged, so nothing to review. → plan, each item's drafted holding them
export function sureParts(plan, facts) {
  for (const it of plan) {
    it.drafted = (it.drafted ?? []).filter((d) => !d.sure);
    for (const x of it.need.find((n) => n?.write)?.write ?? []) it.drafted.push({ ...x, sure: true });
    const name = it.page.component, b = name ? briefOf(name, facts) : null; if (!b) continue;
    // Written "Role: button", not "button": a reader that keeps a section's lines as rules, and not its title, still says what it is.
    if (it.need.includes('role') && ROLE_OF[b.root]) it.drafted.push({ where: 'Role', text: `Role: ${ROLE_OF[b.root]}`, sure: true });
    if (it.need.includes('example') && b.tag) it.drafted.push({ where: 'Example', text: exampleOf(b), sure: true });
  }
  return plan;
}
export function draftPlan(plan, facts, run, { batch = 12, answers = null } = {}) {
  const jobs = draftJobs(plan, facts);
  plan.answers = {};
  for (const it of plan) Object.assign(it, { rewritten: [], drafted: [], dropped: [] });
  sureParts(plan, facts);
  for (let k = 0; k < jobs.length; k += batch) {
    const part = jobs.slice(k, k + batch);
    const answer = answers ?? jsonIn(run(draftPrompt(part.map((j) => j.ask)))) ?? {};
    for (const j of part) if (answer[j.key] !== undefined) plan.answers[j.key] = answer[j.key];
    for (const j of part) {
      const a = answer[j.key]; const name = j.it.page.component;
      const ok = (text) => !checkPage({ kind: 'component', layer: j.it.entity.layer, name: j.it.entity.name, file: j.it.entity.file, purpose: [], whenToUse: [text], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] }, facts, { component: name, strict: true }).some((f) => f.kind === 'name' || f.kind === 'claim');
      if (j.kind === 'rewrite') {
        const text = typeof a?.text === 'string' ? flat(a.text) : null;
        if (text && ok(text)) j.it.rewritten.push({ line: j.r.line, text });
        else if (!text && a?.why) j.it.rewritten.push({ line: j.r.line, text: null, why: flat(a.why) });
        else j.it.dropped.push({ text: text ?? j.r.line, why: text ? 'the rewrite still names what the system does not have' : 'no answer' });
        continue;
      }
      for (const [k, where] of [['purpose', 'Purpose'], ['whenToUse', 'When to use'], ['whenNotToUse', 'When not to use'], ['mistakes', 'Common mistakes'], ['limitations', 'Limitations'], ['doDont', 'Do and don\'t']]) {
        if (!j.ask.need.includes(k) && !['purpose', 'whenToUse', 'whenNotToUse'].includes(k)) continue;   // these three also say how it differs from its twin
        for (const t of [a?.[k]].flat().filter((x) => typeof x === 'string').map(flat).filter(Boolean)) (ok(t) ? j.it.drafted : j.it.dropped).push(ok(t) ? { where, text: t } : { text: t, why: 'it names what the system does not have' });
      }
    }
  }
  return plan;
}

// ── Making the changes ──────────────────────────────────────────────────────────────────────────────────────────────
// plan (drafted or not) and the layer's files → { files: Map(path → new text), pages: [summary], held: [why not] }
export function applyPlan(plan, files) {
  const idx = specIndex(files), layout = layoutOf(files);
  const next = new Map();
  const text = (f) => next.get(f) ?? files.get(f);
  const pages = [], held = [];
  for (const it of plan) {
    const e = it.entity;
    const src = specOf(e, idx);
    const page = files.has(e.file) ? e.file : null;
    const did = { name: e.name, file: e.file, spec: src?.spec ?? null, removed: [], rewritten: [], drafted: [] };
    const edit = (fnMd, fnJson) => {
      if (src) { const t = text(src.spec), n = fnMd(t); if (n !== t) next.set(src.spec, n); }
      if (page) {
        const before = text(page); let doc; try { doc = JSON.parse(before); } catch { return; }
        const entry = entriesOf(doc).find((x) => (x.id ?? x.name) === (e.id ?? e.name)) ?? entriesOf(doc)[0];
        if (fnJson(entry)) next.set(page, jsonText(doc, files.get(page)));
      }
    };
    for (const l of it.remove) { edit((t) => mdRemove(t, l), (x) => jsonRemove(x, l)); did.removed.push(l); }
    for (const r of it.rewritten ?? []) {
      // One the drafter could not write with what the system has is left as it is, for a person: never taken out here.
      if (r.text) { edit((t) => mdReplace(t, r.line, r.text), (x) => jsonReplace(x, r.line, r.text)); did.rewritten.push(r); }
      else held.push({ name: e.name, why: `"${r.line}" names what the system does not have, and nothing it has says it: ${r.why ?? 'a person decides'}` });
    }
    if ((it.drafted ?? []).length && src?.shared) held.push({ name: e.name, why: `it is written from ${src.spec}, which other pages are written from too: give it a spec of its own, then draft it` });
    else for (const d of it.drafted ?? []) { edit((t) => mdAdd(t, d.where, d.text, { sure: d.sure }), (x) => (jsonAdd(x, d.where, d.text, { sure: d.sure, layout }), true)); did.drafted.push(d); }
    if (did.removed.length || did.rewritten.length || did.drafted.length) pages.push(did);
  }
  return { files: next, pages, held };
}

// ── Reviewing drafts ────────────────────────────────────────────────────────────────────────────────────────────────
// What a person decides for each draft: approve it (its marker comes off), change it (new text, marker off) or drop it
// (the line is deleted). In the page's spec and its DSDS page alike, as the changes are made.
const draftOf = (raw, text) => DRAFT.test(raw) && flat(raw.replace(DRAFT, '')) === flat(text);
// to: undefined approves, a string changes, null drops.
export function mdReview(src, text, to) {
  let hit = false;
  const out = [];
  for (const l of src.split('\n')) {
    const m = /^(\s*[-*]\s+)?(.*)$/.exec(l);
    if (!draftOf(m[2], text)) { out.push(l); continue; }
    hit = true;
    if (to !== null) out.push((m[1] ?? '') + (to ?? m[2].replace(DRAFT, '').trim()));
  }
  return !hit ? src : (to === null ? dropEmptyHeadings(out) : out).join('\n');
}
export function jsonReview(entry, text, to) {
  let n = 0;
  const next = (s) => to ?? String(s).replace(DRAFT, '').trim();
  entry.sections = (entry.sections ?? []).filter((s) => {
    if (Array.isArray(s.items)) {
      s.items = s.items.filter((it) => { if (!draftOf(String(it.statement ?? ''), text)) return true; n++; if (to === null) return false; it.statement = next(it.statement); return true; });
      if (s.kind === 'guidelines' && !s.items.length) return false;
    }
    for (const f of s.freeform ?? []) if (typeof f.body === 'string') f.body = f.body.split('\n').flatMap((l) => { const m = /^(\s*[-*]\s+)?(.*)$/.exec(l); if (!draftOf(m[2], text)) return [l]; n++; return to === null ? [] : [(m[1] ?? '') + next(m[2])]; }).join('\n');
    return true;
  });
  if (draftOf(String(entry.description ?? ''), text)) { n++; if (to === null) delete entry.description; else entry.description = next(entry.description); }
  return n;
}
// decisions: [{ page (its name or file), line (a draft's text; left out: every draft of the page), do: 'approve' |
// 'change' | 'drop', to (change's new text) }]. check(entity, text) → why the new text is wrong, or null.
// → { files: Map(path → new text), pages: [{ name, file, spec, approved, changed, dropped }], problems: [why not] }
export function reviewPlan(snap, decisions, files, { check = () => null } = {}) {
  const idx = specIndex(files);
  const next = new Map();
  const text = (f) => next.get(f) ?? files.get(f);
  const byPage = new Map(), problems = [];
  for (const d of decisions) {
    const say = (why) => problems.push(`${d.page}${d.line ? `, "${d.line}"` : ''}: ${why}`);
    if (!['approve', 'change', 'drop'].includes(d.do)) { say('say approve, change or drop'); continue; }
    const e = snap.entities.find((x) => (norm(x.name) === norm(d.page) || (d.page && String(x.file).endsWith(d.page))) && (x.drafts ?? []).length);
    if (!e) { say('no page of that name has drafts'); continue; }
    const lines = d.line ? e.drafts.filter((x) => flat(x.text) === flat(d.line)) : e.drafts;
    if (!lines.length) { say('the page has no draft with that text (--review-drafts lists them)'); continue; }
    if (d.do === 'change' && (!d.line || !flat(d.to))) { say('a change takes the line and its new text (to)'); continue; }
    if (d.do === 'change') { const why = check(e, flat(d.to)); if (why) { say(`the new text is not kept: ${why}`); continue; } }
    const src = specOf(e, idx);
    const page = files.has(e.file) ? e.file : null;
    const did = byPage.get(e) ?? byPage.set(e, { name: e.name, file: e.file, spec: src?.spec ?? null, approved: [], changed: [], dropped: [] }).get(e);
    for (const l of lines) {
      const to = d.do === 'approve' ? undefined : d.do === 'drop' ? null : flat(d.to);
      if (src) { const t = text(src.spec), n = mdReview(t, l.text, to); if (n !== t) next.set(src.spec, n); }
      if (page) {
        const before = text(page); let doc; try { doc = JSON.parse(before); } catch { doc = null; }
        const entry = doc && (entriesOf(doc).find((x) => (x.id ?? x.name) === (e.id ?? e.name)) ?? entriesOf(doc)[0]);
        if (entry && jsonReview(entry, l.text, to)) next.set(page, jsonText(doc, files.get(page)));
      }
      if (d.do === 'approve') did.approved.push(l.text); else if (d.do === 'drop') did.dropped.push(l.text); else did.changed.push({ line: l.text, to: flat(d.to) });
    }
  }
  return { files: next, pages: [...byPage.values()], problems };
}
export function describeReview({ pages, problems }) {
  const n = (k) => pages.reduce((t, p) => t + p[k].length, 0);
  const out = [`Drafts reviewed on ${pages.length} page${pages.length === 1 ? '' : 's'}: ${n('approved')} approved, ${n('changed')} changed, ${n('dropped')} dropped.`, ''];
  for (const p of pages) {
    out.push(`### ${p.name}`, `\`${p.spec ?? p.file}\`${p.spec ? ` (and \`${p.file}\`)` : ''}`, '');
    for (const l of p.approved) out.push(`- Approved: "${l}"`);
    for (const c of p.changed) out.push(`- Changed: "${c.line}" → "${c.to}"`);
    for (const l of p.dropped) out.push(`- Dropped: "${l}"`);
    out.push('');
  }
  if (problems.length) out.push('### Not done', '', ...problems.map((p) => `- ${p}`), '');
  return out.join('\n');
}

// What changed, for the person and for the merge request's description.
export function describeChanges({ pages, held, merged = [], started = [] }, { dropped = [] } = {}) {
  const n = (k) => pages.reduce((t, p) => t + p[k].length, 0);
  const out = [`${merged.length ? `${merged.length} page${merged.length === 1 ? '' : 's'} merged into another's, ` : ''}${started.length ? `${started.length} new page${started.length === 1 ? '' : 's'}, ` : ''}${pages.length} page${pages.length === 1 ? '' : 's'} changed: ${n('removed')} line${n('removed') === 1 ? '' : 's'} written on every page alike taken out, ${n('rewritten')} sentence${n('rewritten') === 1 ? '' : 's'} the system contradicts written again as drafts, ${n('drafted')} line${n('drafted') === 1 ? '' : 's'} drafted.`,
    '', 'A line that starts with **Draft:** is not the team\'s word yet: no agent gets it until a person reads it, changes what is not right and removes the marker (or deletes it to turn it down). rms-design-system-engine lists each under Review on the Documentation page.', ''];
  for (const m of merged) out.push(`### ${m.name} → ${m.into}`, `The team said no to keeping its page: ${m.moved.length} line${m.moved.length === 1 ? '' : 's'} only it said drafted on ${m.into}'s page, \`${m.file}\` taken out, and it is noted as a part of ${m.into}.`, ...m.moved.map((d) => `- Drafted, ${d.where}: "${d.text}"`), '');
  for (const x of started) out.push(`### ${x.name} (new page)`, `Started from its code (\`${x.code}\`): \`${x.spec}\` and \`${x.file}\`; its lines are below.`, '');
  for (const p of pages) {
    out.push(`### ${p.name}`, `\`${p.spec ?? p.file}\`${p.spec ? ` (and \`${p.file}\`)` : ''}`, '');
    for (const r of p.rewritten) out.push(`- Written again (draft): "${r.line}" → "${r.text}"`);
    for (const d of p.drafted) out.push(d.sure ? `- Written from the code, ${d.where}: "${d.text}"` : `- Drafted, ${d.where}: "${d.text}"`);
    if (p.removed.length) out.push(`- Taken out, written on every page alike: ${p.removed.map((l) => `"${l}"`).join(', ')}`);
    out.push('');
  }
  if (held.length) out.push('### Not changed', '', ...held.map((h) => `- ${h.name}: ${h.why}.`), '');
  if (dropped.length) out.push('### Drafts not kept (the content check found them wrong)', '', ...dropped.map((d) => `- ${d.page}: "${d.text}" (${d.why})`), '');
  return out.join('\n');
}

// The changed files, written under the engine's folder to read before anything is sent. → the folder
export function writeLocal(ROOT, files, summary) {
  const dir = resolve(ROOT, CHANGES_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [f, t] of files) { if (t === null) continue; const p = join(dir, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); }   // a file taken out: CHANGES.md says it
  writeFileSync(join(dir, 'CHANGES.md'), summary + '\n');
  return dir;
}

// One branch, one commit, one merge request, from the commit the changes were made on: the team merges it, or not.
// → { url, branch } | { error }
export async function openMergeRequest(access, { files, sha, target, title, description, branch, message, created = new Set() }) {
  const b = await access.send('POST', `/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(sha)}`);
  if (!b.ok) return { error: b.status === 403 || b.status === 401 ? `GitLab refused (${b.status}) the token in ${access.writesWith}: it needs Commit Create (and Merge request Create) on the layer, and your role there Developer or more. Add the layer to your token's projects, or ask a Maintainer of it for the role` : `GitLab answered ${b.status} when making the branch` };
  const c = await access.send('POST', '/repository/commits', { branch, commit_message: message, actions: [...files].map(([file_path, content]) => (content === null ? { action: 'delete', file_path } : { action: created.has(file_path) ? 'create' : 'update', file_path, content })) });
  if (!c.ok) return { error: `GitLab answered ${c.status} to the commit (the branch ${branch} was made; delete it before trying again)` };
  const m = await access.send('POST', '/merge_requests', { source_branch: branch, target_branch: target, title, description, remove_source_branch: true });
  if (!m.ok) return { error: `GitLab answered ${m.status} to the merge request (the branch ${branch} holds the changes)` };
  return { url: (await m.json())?.web_url ?? null, branch };
}

// The same changes as one commit straight on the layer's branch, for a team that reviews in the layer itself rather
// than in a merge request: only when the branch is still at the commit the changes were made on, so nothing written
// since is overwritten. Drafted lines keep their marker either way. → { url, sha } | { error }
// files: Map(path → text, or null for a file taken out); created: the paths that are new.
export async function commitToBranch(access, { files, sha, target, message, created = new Set() }) {
  const h = await access.get(`/repository/commits/${encodeURIComponent(target)}`);
  if (!h.ok) return { error: `GitLab answered ${h.status} for ${target}` };
  const head = String((await h.json())?.id ?? '');
  if (!head.startsWith(sha) && !sha.startsWith(head)) return { error: `${target} moved since the layer was read (now ${head.slice(0, 8)}): run --intent-changes again, so the changes are made on what is there now` };
  // A large change goes as several commits, one after another (GitLab closes a request that is too large): each made on
  // the one before it, and none once someone else committed in between.
  const parts = [], LIMIT = 400000;
  for (const [file_path, content] of files) {
    const last = parts.at(-1);
    const size = content?.length ?? 0;
    if (!last || last.size + size > LIMIT || last.actions.length >= 40) parts.push({ size: 0, actions: [] });
    parts.at(-1).actions.push(content === null ? { action: 'delete', file_path } : { action: created.has(file_path) ? 'create' : 'update', file_path, content }); parts.at(-1).size += size;
  }
  let base = head, out = null;
  for (const [k, part] of parts.entries()) {
    if (k) { const now = await access.get(`/repository/commits/${encodeURIComponent(target)}`); const at = now.ok ? String((await now.json())?.id ?? '') : ''; if (at !== base) return { error: `${target} moved while the changes were sent (${k} of ${parts.length} parts sent): run --intent-changes again for the rest`, sent: k }; }
    let c; try { c = await access.send('POST', '/repository/commits', { branch: target, commit_message: parts.length > 1 ? `${message.split('\n')[0]} (part ${k + 1} of ${parts.length})${message.includes('\n') ? '\n' + message.split('\n').slice(1).join('\n') : ''}` : message, actions: part.actions }); }
    catch (e) { return { error: `the connection to GitLab broke while sending part ${k + 1} of ${parts.length} (${e.code ?? e.message}): run again to send what is left`, sent: k }; }
    if (!c.ok) return { error: c.status === 403 || c.status === 401 ? `GitLab refused (${c.status}) a commit on ${target} with the token in ${access.writesWith}: it is a protected branch, or the token may not create commits there` : `GitLab answered ${c.status} to the commit` };
    out = await c.json(); base = String(out?.id ?? '');
  }
  return { url: out?.web_url ?? null, sha: out?.id ?? null, parts: parts.length };
}

// ── The whole of it, for the command and for each run ───────────────────────────────────────────────────────────────
// The layer as last read, checked, its changes planned, drafted (answers given, else the claude command; when neither
// can, the requests are written for whoever runs the engine) and made in its files. → { snap, access, result, summary,
// note, plan } or { error }. Nothing is sent.
// May this person send changes to the layer, as a commit on its branch or a merge request? GitLab answers, from the
// write token's role in the layer and whether it may push to the branch (stores.mjs → writeAccess); what the setup or
// the person says is never enough. → { ok } | { ok: false, why, mergeRequest? (a merge request would be accepted) }
export async function mayWrite(ROOT, cfg, want = 'commit', opts = {}) {
  const { writeAccess } = await import('./stores.mjs');
  const a = await writeAccess(ROOT, cfg, 'intentLayer', opts);
  if (!a.mode) return { ok: false, why: a.why };
  if (want === 'commit' && a.mode === 'merge-request' && a.why) return { ok: false, why: a.why, mergeRequest: true };
  return { ok: true };
}

// only: the pages to work on (the ones the team just answered for), with any page their answers start or merge.
export async function prepareLayerFix(ROOT, cfg, { drafts = true, answers = null, model, only = null } = {}) {
  const il = await import('./intent-layer.mjs');
  const truth = await import('./intent-truth.mjs');
  const snap = il.readIntentLayer(ROOT, cfg);
  if (!snap?._source?.sha) return { error: 'no intent layer read yet' };
  const facts = truth.systemFacts(ROOT, cfg, { record: false });
  withRealUses(ROOT, facts);
  const names = [...new Set([...il.systemNames(ROOT, cfg), ...Object.keys(facts.components)])];
  const matched = il.matchComponents(names, snap.entities, il.codeFilesOf(ROOT, cfg));
  const found = truth.checkLayer(snap, matched, facts);
  const report = il.useReport(snap, matched, { names, codeExists: (f) => existsSync(resolve(ROOT, f)), from: il.namesFrom(ROOT, cfg), wrongOf: (e) => found.get(e) ?? [] });
  const access = layerAccess(ROOT, cfg);
  if (access.error) return { error: access.error };
  const leftFile = resolve(ROOT, OUT_DIR, 'intent-left-for-people.json');
  let left = []; try { left = JSON.parse(readFileSync(leftFile, 'utf8')); } catch { /* none yet */ }
  const code = codeFactsFor(ROOT, facts);
  const pr = await import('./intent-proposals.mjs'), ia = await import('./intent-answers.mjs');
  const codeFiles = il.codeFilesOf(ROOT, cfg);
  const partOf = pr.partsOf(ROOT, report, codeFiles);
  // The team's answers to the engine's proposals: a fix still to answer waits, a merge or a new page is made here.
  const decided = await pr.decidedLayer(ROOT, cfg);
  const ans = decided ? ia.answersFor({ snap, report, proposals: decided.proposals, decisions: decided.decisions, codeFiles }) : { hold: new Set(), merges: [], creates: [] };
  const codeOf = (e) => code.get(String(e.code ?? '').replace(/^\.?\//, '')) ?? null;
  const plan = planOf(snap, report, { leftForPeople: new Set(left.map((x) => flat(x.line))), code: codeOf, partOf, hold: ans.hold }).filter((it) => !only || only.has(it.entity.name));
  if (only) ans.merges = ans.merges.filter((m) => only.has(m.part.name));
  if (!plan.length && !ans.merges.length && !ans.creates.length) return { snap, access, plan, answers: {}, result: { files: new Map(), pages: [], held: [] }, summary: '', note: '' };
  let files; try { files = await layerFiles(access, snap._source.sha); } catch (e) { return { error: e.message }; }
  // A page to start: its files beside its siblings', then drafted as any page with nothing written.
  const created = new Set(), started = [];
  for (const c of ans.creates) {
    const s = ia.startPage(c, snap, files, { api: ia.apiOf(ROOT, c.code) }); if (!s) continue;
    for (const [f, t] of s.files) { files.set(f, t); created.add(f); }
    started.push({ name: s.entity.name, codeName: c.name, code: c.code, spec: s.spec, file: s.file });
    plan.push({ entity: s.entity, page: { name: s.entity.name, file: s.file, component: c.name }, remove: [], rewrite: [], need: ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'example', 'role', 'doDont'] });
  }
  for (const it of plan) it.code = codeOf(it.entity);
  let note = '';
  sureParts(plan, facts);
  if (drafts && draftJobs(plan, facts).length) {
    if (answers) draftPlan(plan, facts, null, { answers, batch: Infinity });
    else {
      const run = claudeRunner({ model: model ?? ((typeof cfg.intentLayer === 'object' && cfg.intentLayer.draftModel) || undefined) });
      try { if (!run) throw new Error('the claude command is not installed'); draftPlan(plan, facts, run); }
      catch (e) {
        for (const it of plan) Object.assign(it, { rewritten: [], drafted: [], dropped: [] });
        sureParts(plan, facts);   // what the code says for certain is written all the same
        const ask = resolve(ROOT, OUT_DIR, 'intent-draft-request.md');
        mkdirSync(dirname(ask), { recursive: true });
        writeFileSync(ask, draftPrompt(draftJobs(plan, facts).map((j) => j.ask)) + '\n');
        note = `No drafts this run (${e.message}): the requests are in ${OUT_DIR}/intent-draft-request.md. Answer them as one JSON object in a file, then run --intent-changes --drafts-from <that file>.`;
      }
    }
  }
  const dropped = plan.flatMap((i) => (i.dropped ?? []).map((d) => ({ page: i.entity.name, ...d })));
  const result = applyPlan(plan, files);
  for (const f of created) if (!result.files.has(f)) result.files.set(f, files.get(f));
  const table = ia.tableOfCode(files);
  if (table) for (const x of started) result.files.set(table, ia.addRow(result.files.get(table) ?? files.get(table), x.codeName, x.code, 'Started from the code by rms-design-system-engine; its lines are drafts to review.'));
  const merged = ia.applyMerges(ans.merges, files, result.files, { layout: layoutOf(files) });
  result.created = created; result.started = started; result.merged = merged;
  // What the drafter left for a person: kept, so later runs do not ask about it again (it stays on the page as Fix).
  const now = plan.flatMap((i) => (i.rewritten ?? []).filter((r) => !r.text).map((r) => ({ page: i.entity.name, line: r.line, why: r.why ?? null })));
  if (now.length) { mkdirSync(dirname(leftFile), { recursive: true }); writeFileSync(leftFile, JSON.stringify([...left, ...now.filter((n) => !left.some((l) => flat(l.line) === flat(n.line)))], null, 1) + '\n'); }
  return { snap, access, plan, answers: plan.answers ?? {}, result, summary: describeChanges(result, { dropped }), note };
}

// Right after the team answers (--intent-decide): what the answers change in the layer, made and committed on its branch
// at once, on the pages they were about only, so an answer is all a person gives. → the line to say.
export async function actOnAnswers(ROOT, cfg, { only }) {
  try {
    const may = await mayWrite(ROOT, cfg, 'commit');
    if (!may.ok) return `ℹ️  The layer is not changed yet: ${may.why}. The next run that may write to it (--intent-changes) makes the change.`;
    const p = await prepareLayerFix(ROOT, cfg, { only });
    if (p.error) return `⚠️  The layer is not changed yet: ${p.error}`;
    if (!p.result.files.size) return '✅ Nothing to change in the layer for this answer.';
    writeLocal(ROOT, p.result.files, p.summary);
    const done = await commitToBranch(p.access, { files: p.result.files, created: p.result.created, sha: p.snap._source.sha, target: p.snap._source.ref, message: 'Intent layer: the team\'s answers made by rms-design-system-engine (' + p.summary.split('\n')[0].replace(/\.$/, '') + ')\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>' });
    if (done.error) return `⚠️  The layer is not changed yet: ${done.error}`;
    try { const il = await import('./intent-layer.mjs'); await il.syncSources(ROOT, cfg); } catch { /* next run reads it */ }
    return `🔧 Made in the layer and committed on ${p.snap._source.ref}: ${p.summary.split('\n')[0]} ${done.url ?? done.sha} (${OUT_DIR}/intent-changes/CHANGES.md says each change)${p.note ? `\n   ${p.note}` : ''}`;
  } catch (e) { return `⚠️  The layer is not changed yet: ${e.message}`; }
}

// On each run (the audit, the style guide), when ds-config.json → intentLayer.autoFix is "commit": what the engine can
// fix in the layer is fixed and committed straight on its branch, drafted lines marked for the team to review, and what
// it did is said in one line. Once per run; never when the run is offline; never fails the run. → the line, or null.
let fixedThisRun = false;
export async function autoFix(ROOT, cfg, { offline = false } = {}) {
  const mode = typeof cfg.intentLayer === 'object' ? cfg.intentLayer.autoFix : null;
  if (mode !== 'commit' || offline || fixedThisRun) return null;
  fixedThisRun = true;
  try {
    const may = await mayWrite(ROOT, cfg, 'commit');
    if (!may.ok) return `ℹ️  Intent layer not fixed this run: ${may.why}${may.mergeRequest ? ' (--intent-changes --merge-request sends the fixes for review)' : ''}.`;
    const p = await prepareLayerFix(ROOT, cfg);
    if (p.error) return `⚠️  Intent layer not fixed this run: ${p.error}`;
    if (!p.result.files.size) return p.note ? `🔧 Intent layer: nothing to fix that needs no drafting. ${p.note}` : null;
    writeLocal(ROOT, p.result.files, p.summary);
    const done = await commitToBranch(p.access, { files: p.result.files, created: p.result.created, sha: p.snap._source.sha, target: p.snap._source.ref, message: 'Intent layer: fixed by rms-design-system-engine (' + p.summary.split('\n')[0].replace(/\.$/, '') + ')\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>' });
    if (done.error) return `⚠️  Intent layer not fixed this run: ${done.error}`;
    // Read again, so what this run builds shows the layer as it is now.
    try { const il = await import('./intent-layer.mjs'); await il.syncSources(ROOT, cfg); } catch { /* next run reads it */ }
    return `🔧 Intent layer fixed and committed on ${p.snap._source.ref}: ${p.summary.split('\n')[0]} ${done.url ?? done.sha} (${OUT_DIR}/intent-changes/CHANGES.md says each change)${p.note ? `\n   ${p.note}` : ''}`;
  } catch (e) { return `⚠️  Intent layer not fixed this run: ${e.message}`; }
}
