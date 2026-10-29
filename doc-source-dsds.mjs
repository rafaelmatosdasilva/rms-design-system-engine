// doc-source-dsds.mjs - a documentation source: the team's intent layer, written in DSDS or as Markdown (MDX) pages,
// kept in a GitLab project, a GitHub repository or a folder of the project (doc-host.mjs says where; the Markdown
// pages are read by doc-source-markdown.mjs into the same shape as a DSDS page).
//
// One adapter of the documentation sources intent-layer.mjs reads (its SOURCES): it turns its own format into the
// shape every reader takes (see "A documentation source" there), and knows nothing of what reads it.
//
// The layer is written in DSDS, the Design System Documentation Standard: one JSON index (system.dsds.json) whose
// entity groups point ($ref) at one file per entity (a component, a foundation, a pattern, a template, a page). Each
// entity's document blocks hold what the team wrote: sections (title + Markdown body), use cases (recommended and
// discouraged) and checklists (must, should). Facts the engine already reads from Figma and the code (anatomy, API,
// states, the tokens a component uses) are left out.
//
// ds-config.json → intentLayer:
//   "intentLayer": "https://<host>/<group>/<project>"                    (or /-/tree/<branch>): a GitLab project
//   "intentLayer": "https://github.com/<owner>/<repo>"                   (or /tree/<branch>/<folder>): a GitHub repository
//   "intentLayer": "docs"                                                a folder in the project, as it is on disk
//   "intentLayer": { "gitlab" | "github" | "folder": "<place>", "path": "<folder in it>", "format": "dsds" | "markdown",
//                    "entry": "docs/dsds/system.dsds.json", "out": "intent-layer.snapshot.json" }
// The format is found from the files when not said: DSDS when there is a *.dsds.json, else the Markdown and MDX pages.
// Without an entry, the shortest path ending in system.dsds.json is the index, else every *.dsds.json with an entity.
// The component contracts in the same repository (*.contract.json, published with --contracts-out) are read too, for
// their links and what each lists; "contracts": "<folder>" names their folder when the entry's folder does not hold it.
//
// READ-ONLY. The engine never writes to the intent layer while it reads it: it only asks its host (GET) for the latest
// commit and the files of one folder, and the only file it writes is its own snapshot in the project. A read_api token
// (GitLab) or a token that can read the repository (GitHub, none for a public one) is enough. No clone: nothing is
// fetched again while the commit has not moved (a folder: while no file in it changed). Each host's token goes only to
// that host (doc-host.mjs).
// What was read is written to one snapshot file (out), so a run without the network still has the layer, and says
// from which commit.
//
// Text that is the same on every entity of a kind but for the entity's own name (a generator's filler: "Use X when
// its API matches the need") says nothing about any of them and is dropped; the count is kept.
//
// DEGRADE-SAFE: any failure keeps the snapshot already there and returns { error } in plain words; never throws.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { contractSummaries } from './shared-contracts.mjs';
import { layerHost, hostOf, isLink, parseGithub, fileUrl as hostFileUrl } from './doc-host.mjs';

export const ID = 'dsds-gitlab';
// The reader's version, kept in each snapshot: one written by an older reader is read again even when the commit has
// not moved, so a fix to the reading (a placeholder left out) reaches a project at once. Raise it with every change
// to what is read.
export const READER = 17;   // 17: Markdown and MDX pages, and GitHub and a project's folder as hosts (doc-host.mjs); 16: a root's Parts section, each part's documentation under its name (component-parts.mjs); 15: a page's Decisions section, read as its decisions (decisions.mjs); 14: each page's Markdown spec (the file a person edits; the JSON is generated from it); 13: the names a generated definitions section gives (its events, props, slots), and those it only names; 12: a prose section's line already led by its title keeps it once, and a drafted line in it stays a draft; 11: a component page's own prose sections read as its rules, under their titles; 10: a team's own titles for rules (Accessibility, … Rule) read as rules; 9: a token's own line is never one of a template's; 8: shared rules are the system's, a line differing only by the page's names is repeated; 7: drafted lines set apart, and the repeated lines kept as written; 3: reads DSDS 0.23 (entries, refs, sections with freeform and guidelines) as well as 0.15; 4: a guidelines section by its title (when to use, when not to, mistakes, limitations); 5: the component contracts kept beside it (shared-contracts.mjs); 6: when each page's file last changed
export const LABEL = 'the intent layer';

export const DEFAULT_OUT = 'intent-layer.snapshot.json';
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Config ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// → { host: 'gitlab' | 'github' | 'folder', url, folder?, path?, ref?, format?, entry, out, contracts } | null
// url: the link, or the folder's path for a folder. path: the folder in the repository the layer is read from (a GitHub
// link's /tree/<branch>/<folder> says it too). The layer's place may come from ds-config.json → stores.intentLayer (a
// company's profile, stores.mjs) instead; its other settings (entry, out, contracts) stay in intentLayer.
const slashes = (s) => String(s ?? '').trim().replace(/^\.?\/+|\/+$/g, '');
export function intentLayerConfig(cfg) {
  const raw = cfg?.intentLayer;
  const st = cfg?.stores?.intentLayer, read = st && typeof st === 'object' && 'read' in st ? st.read : st;
  const store = typeof read === 'string' ? { place: read, host: hostOf(read) }
    : read?.gitlab ? { place: `${String(read.gitlab).replace(/\/+$/, '')}${read.branch ? `/-/tree/${read.branch}` : ''}`, host: 'gitlab' }
      : read?.github ? { place: String(read.github), host: 'github', ref: read.branch ?? null, path: read.path ?? null }
        : read?.folder ? { place: posix.join(slashes(read.folder) || '.', slashes(read.path)), host: 'folder' } : null;
  if ((!raw && !store) || (st && typeof st === 'object' && 'read' in st && st.read == null)) return null;   // read nowhere: no layer
  const o = typeof raw === 'string' ? (isLink(raw) ? { url: raw } : { folder: raw }) : (raw ?? {});
  const given = o.gitlab ? ['gitlab', o.gitlab] : o.github ? ['github', o.github] : o.folder != null ? ['folder', o.folder] : o.url ? [hostOf(o.url), o.url] : [null, ''];
  const host = store?.host ?? given[0];
  let url = String(store?.place ?? given[1] ?? '').trim();
  if (!url || !host) return null;
  const gh = host === 'github' ? parseGithub(url) : null;
  if (host === 'folder') url = slashes(url) || '.';
  const path = slashes(store?.path ?? o.path ?? gh?.path ?? '') || null;
  const ref = store?.ref ?? o.branch ?? o.ref ?? gh?.ref ?? null;
  const format = /^(dsds|markdown|md|mdx)$/i.test(o.format ?? '') ? (/^dsds$/i.test(o.format) ? 'dsds' : 'markdown') : null;
  return {
    host, url, ...(host === 'folder' ? { folder: url } : {}), ...(path ? { path } : {}), ...(host !== 'gitlab' && ref ? { ref } : {}), ...(format ? { format } : {}),
    entry: o.entry ? String(o.entry).replace(/^\/+/, '') : null, out: o.out || DEFAULT_OUT, contracts: o.contracts ? String(o.contracts).replace(/^\/+|\/+$/g, '') : null,
  };
}

// ── Where each entity sits in the design intent ─────────────────────────────────────────────────────────────────────
const LAYER_OF = [
  ['components', /^(component|element|primitive)s?$/],
  ['foundations', /^(foundation|token|token-?group|style)s?$/],
  ['patterns', /^patterns?$/],
  ['templates', /^(template|layout)s?$/],
  ['pages', /^(page|product-?page|screen)s?$/],
  ['flows', /^(flow|module|journey|workflow)s?$/],
];
// The group an index puts it in decides first ("Templates" holding entities of kind component are templates), by any
// of its words ("Library components", "Product pages"); then its kind.
export function layerOf(kind, group = '') {
  const words = String(group ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of [...words.reverse(), String(kind ?? '').toLowerCase().trim().replace(/\s+/g, '-')]) {
    const hit = LAYER_OF.find(([, re]) => re.test(w));
    if (hit) return hit[0];
  }
  return 'system';
}

// ── The sections the style guide and the contracts read, by their title ─────────────────────────────────────────────
// A title such as "Overview / When To Use" is read by its last part.
const KEY_OF = [
  // What the team decided about it, what it ruled out and why (decisions.mjs reads each line).
  ['decisions', /^(decisions?|decided|design decisions)$/i],
  ['purpose', /^(intent|purpose|overview|what it is|description|summary|about)$/i],
  ['whenToUse', /^(when to use|use (it )?when|usage|usage rules|usage guidelines|how to use|do|dos)$/i],
  ['whenNotToUse', /^(when not to use|what not to do|do not use (it )?when|don'?t use (it )?when|avoid|don'?ts?)$/i],
  ['mistakes', /^(common mistakes|mistakes|common errors|pitfalls)$/i],
  ['limitations', /^(limitations|limits|known limitations|constraints)$/i],
  // A team's own titles for rules: what is true of accessibility, any "… rule(s)".
  ['rules', /^(rules|.*\brules?|accessibility|a11y|keyboard|focus)$/i],
];
// Facts the engine reads from Figma and the code itself: never read as intent.
const FACT_TITLE = /^(source|sources|tokens? used|tokens|api|props|properties|events|emits|slots|anatomy|states|css custom properties|metadata)$/i;
// A definition that only says what kind of thing it is: nothing an agent can use.
const PLACEHOLDER_DEF = /^((an? )?(event|slot|prop(erty)?) (emitted|exposed|accepted|provided|defined) by the component|(the )?(default|named) slot|no description( yet)?|)\.?$/i;
// Section titles written for people by their nature (where a fact was confirmed, examples, links to other pages, a
// mapping to the code, notes on tokens the contracts carry): left on the page as they are, never read as rules.
export const FOR_PEOPLE = /^(evidence|.*\bexamples?|cross[- ]references?|references?|see also|related|related pages|changelog|history|sources?|.*\bmapping|token notes|table of contents|contents|on this page)$/i;
// A section that is mostly code (a fenced block, markup) with little prose around it: an example, for people.
export const isExample = (text) => /```|^\s*</m.test(String(text)) && String(text).replace(/```[\s\S]*?```/g, '').replace(/^\s*<[^\n]*$/gm, '').trim().length < 200;
// A title's own words: its last part ("Overview / When To Use"), any numbering ("2. Overview") dropped.
const titleWords = (title) => String(title ?? '').split('/').pop().trim().replace(/^\d+(\.\d+)*[.)]?\s+/, '');
export function keyOfTitle(title) {
  const last = titleWords(title);
  return KEY_OF.find(([, re]) => re.test(last))?.[0] ?? null;
}

// The line that says a part belongs to its root ("Part of tileCardBank, placed only inside it."): what makes it a
// part, not documentation of it.
export const PART_SAID = /^part of [\w/.-]+\b/i;
// A Markdown spec's Parts section: each ### heading under ## Parts is a part, its text its documentation.
export function mdParts(text) {
  const out = {};
  let inParts = false, name = null, body = [];
  const flush = () => { if (name) out[name] = itemsOf(body.join('\n')).filter((l) => !PART_SAID.test(l)); name = null; body = []; };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line), h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2 && !h3) { flush(); inParts = /^parts?$/i.test(h2[1]); continue; }
    if (!inParts) continue;
    if (h3) { flush(); name = h3[1].replace(/`/g, '').trim(); continue; }
    if (name) body.push(line);
  }
  flush();
  return out;
}

// A Markdown body → its lines: each bullet or paragraph one item, markers dropped. A bullet written over several lines
// is one item, up to the next bullet or blank line.
export function itemsOf(body) {
  const out = [];
  let para = [], inBullet = false;
  const flush = () => { if (para.length) { out.push(para.join(' ')); para = []; } };
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); inBullet = false; continue; }
    const bullet = /^(?:[-*•+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { flush(); out.push(bullet[1].trim()); inBullet = true; continue; }
    if (inBullet && !/^#/.test(line)) { out[out.length - 1] += ' ' + line; continue; }
    inBullet = false;
    para.push(line.replace(/^#+\s*/, ''));
  }
  flush();
  return out.filter(Boolean);
}

// ── DSDS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A JSON pointer ("#/entity", "#/a/b~1c") inside a parsed file.
function pointer(obj, frag) {
  if (!frag || frag === '#' || frag === '#/') return obj;
  return String(frag).replace(/^#\/?/, '').split('/').filter(Boolean)
    .map((p) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// The code file an entity names, in any of its extensions ({ "<vendor>": { "sourcePath": "…" } }).
function codeFileOf(entity) {
  // DSDS 0.23: the files it is made from (sourceFiles), its component file first.
  const files = (entity?.sourceFiles ?? []).map((f) => (typeof f === 'string' ? f : f?.file ?? f?.path ?? f?.href ?? '')).filter(Boolean);
  const code = files.find((f) => /\.(vue|jsx?|tsx?|svelte)$/i.test(f)) ?? null;
  if (code) return code;
  for (const v of Object.values(entity?.$extensions ?? {})) {
    const p = v && typeof v === 'object' ? (v.sourcePath ?? v.source ?? v.path) : null;
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return null;
}

// A rule a page takes from the system's shared ones (DSDS 0.23: refs [{ to: "<shared id>#<item id>" }]): its words.
function sharedStatement(refs, shared) {
  for (const r of refs ?? []) {
    const [sid, iid] = String(r?.to ?? '').split('#');
    const block = (shared ?? []).find((b) => b?.id === sid);
    for (const sec of block?.sections ?? []) for (const it of sec?.items ?? []) if (!iid || it?.id === iid) { if (it?.statement) return { text: it.statement, level: it.level ?? null }; }
  }
  return { text: '', level: null };
}

// One entity as the engine reads it. file: its path in the project.
export function entityView(entity, file, group = '', shared = null) {
  const kind = String(entity?.kind ?? '').trim() || 'entity';
  const view = {
    kind, layer: layerOf(kind, group), name: String(entity?.name ?? entity?.identifier ?? entity?.id ?? '').trim(), id: entity?.identifier ?? entity?.id ?? null,
    status: null, file, code: codeFileOf(entity), summary: null,
    purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], decisions: [],
    // The documentation of its parts, the components only placed inside it (a dropdown's row): each under its own name
    // in the page's Parts section (### tileListRow, or a section titled "Parts / tileListRow").
    parts: {},
    facts: [], repeated: 0,   // what was left out: the sections that are facts (by title), the lines repeated on every page
    // What its generated definitions sections name (Events, Properties, Slots), each term with whether it says more than
    // its name (a placeholder like "Event emitted by the component." says nothing): left out for agents, kept so a check
    // can tell what is written. { events: [{ term, said }], props: [...], slots: [...] }
    defined: {},
    // The other names it goes by (Figma's, the code's): a line that differs from another page's only by them is one line.
    aliases: (Array.isArray(entity?.metadata?.aliases) ? entity.metadata.aliases : []).map(String).filter(Boolean),
  };
  const desc = String(entity?.description ?? '').trim();
  const summary = String(entity?.metadata?.summary ?? '').trim();
  if (summary) view.summary = summary;
  let statusLine = null;
  const casesPurpose = [];   // a use-cases block's purpose: after what the sections say it is for
  // DSDS 0.15 writes documentBlocks; 0.23 writes sections: a section's freeform parts read as 0.15's sections, its
  // guidelines (a statement each, a shared one through its ref) by their title as a section's are: "When to use",
  // "When not to use", "Common mistakes", "Limitations" as those, the rest ("Rules", "For agents") as a checklist.
  for (const x of entity?.sections ?? []) {
    if (x?.kind !== 'definitions') continue;
    const k = /event|emit/i.test(x.title ?? '') ? 'events' : /slot/i.test(x.title ?? '') ? 'slots' : /prop/i.test(x.title ?? '') ? 'props' : null;
    if (!k) continue;
    view.defined[k] = [...(view.defined[k] ?? []), ...(x.items ?? []).map((it) => ({ term: String(it?.term ?? '').replace(/\s*\(.*\)\s*$/, '').trim(), codeTerm: /\(([^)]+)\)\s*$/.exec(String(it?.term ?? ''))?.[1] ?? null, said: !PLACEHOLDER_DEF.test(String(it?.definition ?? '').trim()) })).filter((x) => x.term)];
  }
  const v23 = (entity?.sections ?? []).flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    if (x.kind === 'guidelines') {
      // A rule given by reference to one the system shares (refs: same-as) is the system's, set on every page on purpose.
      const items = (x.items ?? []).map((it) => { const sh = it?.statement ? null : sharedStatement(it?.refs, shared); return { label: it?.statement ?? sh.text, level: it?.level ?? sh?.level ?? null, shared: !it?.statement && !!sh?.text }; });
      const key = keyOfTitle(x.title);
      return [key && key !== 'purpose' ? { kind: 'guided', key, items } : { kind: 'checklist', title: x.title, items }];
    }
    // A Parts section: each of its titled parts is a part's documentation, under that part's name.
    if (x.kind === 'section' && /^parts?$/i.test(titleWords(x.title))) return [{ kind: 'sections', items: (x.freeform ?? []).filter((f) => f?.title).map((f) => ({ ...f, title: `Parts / ${f.title}` })) }];
    if (x.kind === 'section') return [{ kind: 'sections', items: (x.freeform ?? []).concat(x.body || x.content ? [{ title: x.title, body: x.body ?? x.content }] : []) }];
    return [x];
  });
  const blocks = [...(entity?.documentBlocks ?? []), ...(entity?.agentDocumentBlocks ?? []), ...v23];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.kind === 'sections' || b.kind === 'section') {
      for (const s of (b.items ?? [b])) {
        const title = String(s?.title ?? '').trim(), body = String(s?.body ?? s?.content ?? '').trim();
        if (!title || !body) continue;
        if (/^metadata$/i.test(titleWords(title))) { statusLine ??= /(?:^|\n)\s*[-*]?\s*status\s*:\s*([^\n]+)/i.exec(body)?.[1]?.trim() ?? null; continue; }
        if (FACT_TITLE.test(titleWords(title))) { view.facts.push(title); continue; }
        const part = /^parts?\s*\/\s*(.+)$/i.exec(title)?.[1]?.trim();
        if (part) { (view.parts[part] ??= []).push(...itemsOf(body).filter((l) => !PART_SAID.test(l))); continue; }
        // A body that only names its own section ("Do / Don't section.") is a placeholder: nothing to read.
        if (/^[\w\s/'’&-]{1,60}\bsection\.?$/i.test(body) && body.toLowerCase().startsWith(title.split('/').pop().trim().toLowerCase().slice(0, 4)) || body.replace(/\s*section\.?$/i, '').trim().toLowerCase() === title.trim().toLowerCase()) continue;
        const key = keyOfTitle(title);
        // A component page's rules under the team's own title (Accessibility, … Rule): its rules. On a page of another
        // layer such a section already reaches the agents with its title, so it stays one.
        if (key === 'rules') { if (view.layer === 'components') view.rules.push(...itemsOf(body).map((text) => ({ text, level: null }))); else view.sections.push({ title, text: body }); }
        else if (key) view[key].push(...itemsOf(body));
        // Any other prose a component page gives under a title of its own is a rule of it, said with that title
        // ("Legend Overflow: …"): the team's titles are theirs, the engine reads them. Examples and notes for people stay.
        // A line already led by the title ("Role: button" under Role) keeps it once; a drafted line stays a draft, set
        // apart below, never read as a rule with the title in front of its marker.
        else if (view.layer === 'components' && !FOR_PEOPLE.test(titleWords(title)) && !isExample(body)) view.rules.push(...itemsOf(body).map((text) => {
          const own = titleWords(title), led = text.toLowerCase().startsWith(own.toLowerCase() + ':');
          return DRAFT.test(text) || isOpen(text) ? { text, level: null, draftOf: own } : { text: led ? text : `${own}: ${text}`, level: null };
        }));
        else view.sections.push({ title, text: body });
      }
    } else if (b.kind === 'use-cases') {
      for (const it of b.items ?? []) {
        const d = String(it?.description ?? '').trim(); if (!d) continue;
        if (/^(recommended|do|preferred)$/i.test(it.stance ?? '')) view.whenToUse.push(d);
        else if (/^(discouraged|dont|don't|avoid|prohibited|forbidden)$/i.test(it.stance ?? '')) view.whenNotToUse.push(d);
      }
      if (b.purpose) casesPurpose.push(String(b.purpose).trim());
    } else if (b.kind === 'guided') {
      for (const it of b.items ?? []) { const label = String(it?.label ?? '').trim(); if (label) view[b.key].push(b.key === 'rules' ? { text: label, level: it.level ?? null, ...(it.shared ? { shared: true } : {}) } : label); }
    } else if (b.kind === 'checklist') {
      for (const it of b.items ?? []) {
        const label = String(it?.label ?? '').trim();
        if (label) view.rules.push({ text: label, level: it.level ?? null, ...(it.shared ? { shared: true } : {}) });
      }
    }
  }
  view.purpose.push(...casesPurpose);
  if (desc) view.purpose.push(desc);
  const st = entity?.metadata?.status;
  view.status = statusLine ?? (st && typeof st === 'object' ? st.status ?? null : st) ?? null;
  // A line written as a draft ("**Draft:** …", by the engine or a person) is not the team's word yet: it is set apart
  // for review and reaches no agent until its marker is removed. A line the team left open ([open], TBD) the same: it
  // is a question for a person, never guidance.
  for (const [k, where] of [['purpose', 'Purpose'], ['whenToUse', 'When to use'], ['whenNotToUse', 'When not to use'], ['mistakes', 'Common mistakes'], ['limitations', 'Limitations'], ['rules', 'Rules']]) {
    const keep = [];
    for (const it of view[k]) { const t = String(it?.text ?? it); if (DRAFT.test(t)) (view.drafts ??= []).push({ where: it?.draftOf ?? where, text: t.replace(DRAFT, '').trim(), ...draftTask(t) }); else if (isOpen(t)) (view.open ??= []).push({ where: it?.draftOf ?? where, text: openText(t) }); else keep.push(it); }
    view[k] = keep;
  }
  // In a section's text too: a line that starts with the marker, as a list item or on its own.
  for (const x of view.sections) {
    const lines = x.text.split('\n'), keep = [];
    let fenced = false;
    for (const l of lines) { if (/^\s*```/.test(l)) fenced = !fenced; const t = l.replace(/^\s*[-*]\s+/, ''); if (fenced || /^\s*```/.test(l)) { keep.push(l); continue; } if (DRAFT.test(t)) (view.drafts ??= []).push({ where: x.title, text: t.replace(DRAFT, '').trim(), ...draftTask(t) }); else if (isOpen(t)) (view.open ??= []).push({ where: x.title, text: openText(t) }); else keep.push(l); }
    x.text = keep.join('\n').trim();
  }
  view.sections = view.sections.filter((x) => x.text);
  return view;
}
// The marker of a drafted line, at its start: **Draft:**, __Draft:__ or Draft:, with the task that wrote it when it
// says one: **Draft (What to do when no component fits, 2026-10-28):**.
export const DRAFT = /^\s*(?:\*\*|__)?draft(?:\s*\(([^)]*)\))?(?::(?:\*\*|__)|(?:\*\*|__):|:)\s*/i;
// The task a drafted line names, and its day. → { task, at } | {}
export function draftTask(line) {
  const m = DRAFT.exec(String(line ?? ''))?.[1]?.trim();
  if (!m) return {};
  const d = /^(.*?),\s*(\d{4}-\d{2}-\d{2})$/.exec(m);
  return d ? { task: d[1].trim(), at: d[2] } : { task: m };
}
// A question the team has not settled, written into a page: [open], [TBD], "Open question: …", TBD, "to be decided",
// "??". It is not a rule yet: set apart like a draft, it reaches no agent, and a person settles it.
// (Not a bare "Open:", which names a state, and not "??" inside a line, which is code.)
export const OPEN = /\[(?:open|tbd|tbc|todo|\?)\]|^\s*(?:\*\*|__)?(?:open question|tbd|tbc|todo)(?:\*\*|__)?\s*:|\bTB[DC]\b|\bto be (?:decided|defined|confirmed|agreed)\b|\?{2,}\s*$/i;
export const isOpen = (t) => OPEN.test(String(t ?? ''));
const openText = (t) => String(t).replace(/^\s*(?:\*\*|__)?(?:open question|tbd|tbc|todo)(?:\*\*|__)?\s*:\s*/i, '').replace(/\s*\[(?:open|tbd|tbc|todo|\?)\]\s*/gi, ' ').trim();

// The system's own page holds drafts as any page does: set apart, never one of its rules, until a person approves them.
// → true when the line was a draft (and is now in drafts)
export function heldDraft(line, where, drafts) {
  const t = String(line ?? '').replace(/^\s*[-*]\s+/, '');
  if (!DRAFT.test(t)) return false;
  drafts.push({ where, text: t.replace(DRAFT, '').trim(), ...draftTask(t) });
  return true;
}
// A section's text without its drafted lines (each one held). → the text left
export const heldLines = (body, where, drafts) => body.split('\n').filter((l) => !heldDraft(l, where, drafts)).join('\n').trim();

// The index and its entity files → { system: { name, version, sections, drafts? }, entities: [view] }.
// files: Map(path → parsed JSON). entry: the index's path, or null to take every file with an entity.
export function readDsds(files, entry = null) {
  const entities = [];
  const seen = new Set();
  const push = (entity, file, group) => {
    if (!entity || typeof entity !== 'object' || !entity.kind) return;
    const key = `${file}#${entity.identifier ?? entity.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(entityView(entity, file, group));
  };
  const index = entry ? files.get(entry) : null;
  let system = null;
  // DSDS 0.23: the index has entries (the system's own), shared rules and refs to each page's file; a page file is one
  // entry ({ kind, id, … }) or several ({ entries: [] }), its group the folder it is in (components, patterns…).
  if (index && (index.entries || index.refs)) {
    const shared = index.shared ?? [];
    const sys = (index.entries ?? []).find((e) => e?.kind === 'system') ?? {};
    const sections = [], drafts = [];
    for (const x of sys.sections ?? []) {
      if (x?.kind === 'guidelines') for (const it of x.items ?? []) { const t = it?.statement ?? sharedStatement(it?.refs, shared).text; if (t && !heldDraft(t, x.title ?? 'Guidelines', drafts)) sections.push({ title: x.title ?? 'Guidelines', text: `- ${t}${it?.level ? ` (${it.level})` : ''}` }); }
      if (x?.kind === 'section') for (const f of x.freeform ?? []) if (f?.title && f?.body) { const text = heldLines(String(f.body), String(f.title), drafts); if (text) sections.push({ title: String(f.title), text }); }
    }
    system = { name: sys.name ?? index.name ?? null, ...(sys.id ? { id: sys.id } : {}), version: sys.metadata?.version ?? null, dsds: index.schemaVersion ?? null, sections, file: entry, ...(drafts.length ? { drafts } : {}) };
    const base = posix.dirname(entry);
    const one = (e, file, group) => { if (e && typeof e === 'object' && e.kind && e.kind !== 'system') { const key = `${file}#${e.id ?? e.name}`; if (!seen.has(key)) { seen.add(key); entities.push(entityView(e, file, group, shared)); } } };
    for (const r of index.refs ?? []) {
      const href = typeof r === 'string' ? r : r?.href; if (!href) continue;
      const file = posix.normalize(posix.join(base, href)), doc = files.get(file);
      const group = posix.relative(base, file).split('/')[0] ?? '';
      if (doc?.entries) for (const e of doc.entries) one(e, file, group); else one(doc, file, group);
    }
    for (const e of index.entries ?? []) one(e, entry, '');
    // Pages the index does not list, in the folder it is in: read too.
    if (!entities.length) for (const [file, doc] of files) if (file !== entry && (doc?.kind || doc?.entries)) { const group = posix.relative(base, file).split('/')[0] ?? ''; if (doc.entries) doc.entries.forEach((e) => one(e, file, group)); else one(doc, file, group); }
    return { system, entities };
  }
  if (index) {
    const info = index.systemInfo ?? {};
    const sections = [], drafts = [];
    for (const b of index.documentBlocks ?? []) {
      if (b?.kind === 'sections') for (const s of b.items ?? []) if (s?.title && s?.body) { const text = heldLines(String(s.body), String(s.title), drafts); if (text) sections.push({ title: String(s.title), text }); }
      if (b?.kind === 'checklist') for (const it of b.items ?? []) if (it?.label && !heldDraft(it.label, b.title ?? 'Checklist', drafts)) sections.push({ title: b.title ?? 'Checklist', text: `- ${it.label}${it.level ? ` (${it.level})` : ''}` });
    }
    system = { name: info.name ?? null, version: info.version ?? null, dsds: index.dsdsVersion ?? null, sections, file: entry, ...(drafts.length ? { drafts } : {}) };
    const base = posix.dirname(entry);
    for (const g of index.entityGroups ?? []) {
      for (const e of g?.entities ?? []) {
        if (e && typeof e.$ref === 'string') {
          const [p, frag] = e.$ref.split('#');
          const file = p ? posix.normalize(posix.join(base, p)) : entry;
          const doc = files.get(file);
          if (doc) push(pointer(doc, '#' + (frag ?? '')), file, g.name);
        } else push(e, entry, g?.name);
      }
    }
  }
  if (!index || !entities.length) {
    for (const [file, doc] of files) if (doc?.entity) push(doc.entity, file, '');
  }
  return { system, entities };
}

// Drop the text a generator writes on every entity of a kind with only the name changed. → number of items dropped.
// A rule the system shares by reference is not one of them: it is left out of the page (the system's own rules carry it)
// and never counted as one to take out. Repeated is: the same line on half the pages of a kind or more; for any page but
// a token's, the same line with only its own name changed on five or more, or one that names nothing in code on a fifth.
export function dropBoilerplate(entities) {
  const shape = (e, t) => {
    let s = String(t);
    for (const w of [e.code, e.name, e.id, ...(e.aliases ?? [])].filter(Boolean).sort((a, b) => b.length - a.length)) s = s.split(w).join('{}');
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  };
  for (const e of entities) { const n = e.rules.length; e.rules = e.rules.filter((r) => !r?.shared); if (n > e.rules.length) e.sharedRules = n - e.rules.length; }
  const FIELDS = ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'rules'];
  const byKind = new Map();
  for (const e of entities) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind).push(e); }
  let dropped = 0;
  for (const list of byKind.values()) {
    if (list.length < 5) continue;
    const count = new Map();
    for (const e of list) {
      const own = new Set();
      for (const f of FIELDS) for (const it of e[f]) own.add(f + '\u0000' + shape(e, it.text ?? it));
      for (const k of own) count.set(k, (count.get(k) ?? 0) + 1);
    }
    const min = Math.max(5, Math.ceil(list.length / 2));
    const repeated = (e, f, it) => {
      const k = shape(e, it.text ?? it), n = count.get(f + '\u0000' + k) ?? 0;
      // A token's one line is written from a template by nature (what it colours, of which component): only the first.
      if (e.kind === 'token') return n >= min;
      return n >= min || (k.includes('{}') && n >= 5) || (!/`/.test(k) && n >= Math.max(10, Math.ceil(list.length / 5)));
    };
    for (const e of list) for (const f of FIELDS) {
      const keep = e[f].filter((it) => !repeated(e, f, it));
      dropped += e[f].length - keep.length;
      e.repeated = (e.repeated ?? 0) + e[f].length - keep.length;
      // Which lines, as written, so a change to the layer can take them out where they are written.
      for (const it of e[f]) if (!keep.includes(it)) (e.repeatedLines ??= []).push(String(it.text ?? it));
      e[f] = keep;
    }
  }
  return dropped;
}


// Its snapshot, as written by syncIntentLayer.
export function snapshotPath(ROOT, cfg) { const c = intentLayerConfig(cfg); return c ? resolve(ROOT, c.out) : null; }
export function readSnapshot(ROOT, cfg) {
  const p = snapshotPath(ROOT, cfg);
  if (!p || !existsSync(p)) return null;
  try { const s = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(s?.entities) ? s : null; } catch { return null; }
}
// A link to one file of the layer where it lives (GitLab, GitHub, the project's own repository), on the branch it was
// read from.
export const fileUrl = hostFileUrl;

// ── Reading it where it lives ───────────────────────────────────────────────────────────────────────────────────────
// Read the layer and write its snapshot. opts: { env, fetchImpl, offline, now }.
// → { ok, changed, out, source, entities, boilerplate } | { error, out, stale } (stale: the snapshot kept is from an earlier commit)
const HOST_NAME = { gitlab: 'GitLab', github: 'GitHub', folder: 'its folder' };
export async function syncIntentLayer(ROOT, cfg, opts = {}) {
  const c = intentLayerConfig(cfg);
  if (!c) return null;
  const out = resolve(ROOT, c.out);
  const prev = readSnapshot(ROOT, cfg);
  const kept = (error) => ({ error, out: c.out, stale: !!prev, source: prev?._source ?? null });
  if (opts.offline && c.host !== 'folder') return kept(`not checked against ${HOST_NAME[c.host]} this run`);
  const h = layerHost(ROOT, c, opts);
  if (h.error) return { error: h.error, out: c.out, stale: !!prev };
  try {
    const head = await h.head();
    if (head.error) return kept(head.error);
    const { ref, sha } = head;
    const source = { id: ID, label: LABEL, host: h.kind, ...(h.web && h.web !== h.kind ? { web: h.web } : {}), url: h.url, ...(h.folder != null ? { folder: h.folder } : {}), ...(h.prefix ? { prefix: h.prefix } : {}), ref, sha, committedAt: String(head.committedAt ?? ''), ...(head.digest ? { digest: head.digest } : {}), entry: c.entry, entryGiven: c.entry ?? null, ...(c.path ? { path: c.path } : {}) };
    const same = (a, b) => (a ?? null) === (b ?? null);
    if (prev?._source?.sha === sha && same(prev._source.url, source.url) && same(prev._source.entryGiven, c.entry) && same(prev._source.path, c.path) && same(prev._source.digest, head.digest) && same(prev._source.formatGiven, c.format) && prev._reader === READER) {
      return { ok: true, changed: false, out: c.out, source: prev._source, entities: prev.entities.length, boilerplate: prev.boilerplate ?? 0 };
    }
    // The folder read: the one named, else the index's.
    const folder = c.path ?? (c.entry && posix.dirname(c.entry) !== '.' ? posix.dirname(c.entry) : null) ?? (c.host === 'folder' && c.folder !== '.' ? c.folder : null);
    const files = new Map(), layerFiles = [], specs = new Map(), pages = new Map();
    const keep = ({ files: got, paths }) => {
      layerFiles.push(...paths);   // every file's path, so a page that names another file of the layer can be checked
      for (const f of got) {
        // A Markdown page (or a DSDS layer's Markdown spec: the file a person edits, which each page is generated from).
        if (/\.(md|mdx|markdown)$/i.test(f.path)) { const t = f.data.toString('utf8'); pages.set(f.path, t); if (/\.md$/i.test(f.path) && /(^|\/)specs\//.test(f.path)) specs.set(f.path, t); continue; }
        if (!/\.json$/i.test(f.path)) continue;
        try { files.set(f.path, JSON.parse(f.data.toString('utf8'))); } catch { /* not JSON: not read */ }
      }
    };
    const got = await h.files(folder, sha);
    if (got.error) return kept(got.error);
    keep(got);
    // The component contracts kept in the layer (intentLayer.contracts): read from the same commit when the folder read
    // does not hold them. They are read for their links and what they list, never changed.
    if (c.contracts && folder && !(c.contracts + '/').startsWith(folder + '/')) {
      const k = await h.files(c.contracts, sha);
      if (!k.error) keep(k);
    }
    if (c.entry && !files.has(c.entry)) return kept(`${c.entry} is not in ${source.url} on ${ref}: check intentLayer.entry`);
    // DSDS when said, or when the layer has a DSDS file; else its Markdown pages.
    const dsdsFiles = [...files.keys()].filter((f) => /\.dsds\.json$/i.test(f));
    const format = c.format ?? (c.entry || dsdsFiles.length || !pages.size ? 'dsds' : 'markdown');
    source.format = format;
    if (c.format) source.formatGiven = c.format;
    const where = c.host === 'folder' ? `the folder ${source.folder}` : `${source.url.replace(/^https?:\/\//, '')} on ${ref}`;
    let system, entities;
    if (format === 'dsds') {
      const entry = c.entry ?? dsdsFiles.filter((f) => /(^|\/)system\.dsds\.json$/i.test(f)).sort((x, y) => x.split('/').length - y.split('/').length || x.length - y.length)[0] ?? null;
      ({ system, entities } = readDsds(files, entry));
      if (!entities.length) return kept(!dsdsFiles.length && !pages.size ? `no DSDS entities and no Markdown or MDX pages found in ${where}` : `no DSDS entities found in ${where} (looked for system.dsds.json and *.dsds.json files${pages.size ? '; it has Markdown pages: set intentLayer.format to "markdown" to read those' : ''})`);
      source.entry = entry;
    } else {
      const { readMarkdown } = await import('./doc-source-markdown.mjs');
      ({ system, entities } = readMarkdown(pages, { paths: layerFiles, root: folder ?? '' }));
      if (!entities.length) return kept(`no DSDS entities and no Markdown or MDX pages found in ${where}`);
      source.entry = system?.file ?? null;
    }
    const boilerplate = dropBoilerplate(entities);
    for (const e of entities) e.url = fileUrl(source, e.file);
    // Each page's own spec, where it has one (its code file's, else its title's); a family's spec several pages are
    // written from is named as shared.
    if (format === 'dsds') try {
      const { specIndex, specOf } = await import('./intent-changes.mjs');
      const idx = specIndex(specs, { codes: entities.map((e) => e.code) });
      for (const e of entities) { const sp = specOf(e, idx); if (sp) { e.spec = sp.spec; e.specUrl = fileUrl(source, sp.spec); if (sp.shared) e.specShared = true; else { const mp = mdParts(specs.get(sp.spec)); if (Object.keys(mp).length) e.parts = { ...(e.parts ?? {}), ...mp }; } } }
    } catch { /* the pages stand without it */ }
    // When each page's file last changed: the files a new commit changed (one compare with the commit read before) take
    // its date; a file not dated yet asks for its own last commit, once. A date not known is left out, never guessed. A
    // page made of several files (a component's tabs) takes the latest of theirs.
    const fileDates = { ...(prev?._reader >= 6 && c.host !== 'folder' ? prev.fileDates ?? {} : {}) };
    const previous = prev?._reader >= 6 ? prev?._source?.sha : null;
    if (previous && previous !== sha && c.host !== 'folder') {
      const d = await h.changed(previous, sha);
      if (d) { for (const f of d.changed) fileDates[f] = source.committedAt; for (const f of d.removed) delete fileDates[f]; }
      else for (const k of Object.keys(fileDates)) delete fileDates[k];
    }
    const filesOf = (e) => e.files ?? [e.file];
    const undated = [...new Set(entities.flatMap(filesOf).filter(Boolean))].filter((f) => !fileDates[f]);
    for (let i = 0; i < undated.length; i += 8) {
      await Promise.all(undated.slice(i, i + 8).map(async (f) => { const at = await h.lastChange(f, sha); if (at) fileDates[f] = at; }));
    }
    for (const e of entities) { const at = filesOf(e).map((f) => fileDates[f]).filter(Boolean).sort().pop(); if (at) e.updatedAt = at; }
    source.fetchedAt = (opts.now ?? new Date()).toISOString();
    const snap = {
      _note: `The intent layer as read from ${HOST_NAME[c.host]} (rms-design-system-engine). Regenerated when it changes; do not edit by hand, edit the layer itself.`,
      _source: source, _reader: READER, system, boilerplate, entities,
      contracts: contractSummaries(files, (f) => fileUrl(source, f)),
      fileDates,
      layerFiles: [...new Set(layerFiles)].sort(),
      ...(got.note ? { note: got.note } : {}),
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(snap, null, 2) + '\n');
    return { ok: true, changed: true, out: c.out, source, entities: entities.length, boilerplate, previous: prev?._source?.sha ?? null, ...(got.note ? { note: got.note } : {}) };
  } catch (e) {
    return kept(`could not read ${h.name ?? c.url}: ${e.message}`);
  }
}

// One line for the person.
export function describeSync(r) {
  if (!r) return '';
  const at = (s) => (!s?.sha ? '' : s.host === 'folder' ? `the folder ${s.folder ?? s.url}${s.ref && s.ref !== 'HEAD' ? ` (${s.ref})` : ''}` : `${s.url.replace(/^https?:\/\//, '')} @ ${s.ref} ${s.sha.slice(0, 8)}${s.committedAt ? ` (${s.committedAt.slice(0, 10)})` : ''}`);
  if (r.error) return r.stale ? `⚠️  Intent layer: ${r.error} - using the copy of ${at(r.source)}` : `❌ Intent layer: ${r.error}`;
  const fmt = r.source?.format === 'markdown' ? 'Markdown pages' : 'pages';
  return `🧭 Intent layer: ${at(r.source)} - ${r.entities} ${fmt}${r.boilerplate ? ` (${r.boilerplate} repeated lines left out)` : ''}, ${r.changed ? 'read' : 'up to date'} → ${r.out}${r.note ? `\n   ⚠️  ${r.note}` : ''}`;
}


// The adapter, as intent-layer.mjs's SOURCES take it.
export const source = {
  id: ID, label: LABEL, configKey: 'intentLayer',
  configured: (cfg) => !!intentLayerConfig(cfg),
  read: readSnapshot,
  sync: (ROOT, cfg, opts) => syncIntentLayer(ROOT, cfg, opts),
  describe: (r) => describeSync(r),
};
