// intent-layer.mjs - read a design system's intent layer (why each piece exists and how it is meant to be used) from a
// GitLab project, and map it into the design intent.
//
// The layer is written in DSDS, the Design System Documentation Standard: one JSON index (system.dsds.json) whose
// entity groups point ($ref) at one file per entity (a component, a foundation, a pattern, a template, a page). Each
// entity's document blocks hold what the team wrote: sections (title + Markdown body), use cases (recommended and
// discouraged) and checklists (must, should). Facts the engine already reads from Figma and the code (anatomy, API,
// states, the tokens a component uses) are left out.
//
// ds-config.json → intentLayer:
//   "intentLayer": "https://<host>/<group>/<project>"                    (or /-/tree/<branch>)
//   "intentLayer": { "gitlab": "<link>", "entry": "docs/dsds/system.dsds.json", "out": "intent-layer.snapshot.json" }
// Without an entry, the shortest path ending in system.dsds.json is the index, else every *.dsds.json with an entity.
//
// Read through the GitLab REST API, no clone: the branch's latest commit, then one archive of the folder that holds the
// index, read in memory. Nothing is fetched again while the commit has not moved. The token is gitlab-source.mjs's:
// GITLAB_TOKEN from the environment or the project's .env, only ever sent to gitlab.com or a host named in GITLAB_HOST.
// What was read is written to one snapshot file (out); every reader (intent-gen, contract-gen, the style guide) reads
// that file, so a run without the network still has the layer, and says from which commit.
//
// Text that is the same on every entity of a kind but for the entity's own name (a generator's filler: "Use X when
// its API matches the need") says nothing about any of them and is dropped; the count is kept.
//
// DEGRADE-SAFE: any failure keeps the snapshot already there and returns { error } in plain words; never throws.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, posix } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseGitlabProject, tokenFrom, hostEnvFrom, untar, plainGet } from './gitlab-source.mjs';
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { codeSnapshotPath } from './names.mjs';

export const DEFAULT_OUT = 'intent-layer.snapshot.json';
const TIMEOUT_MS = Math.max(1000, parseInt(process.env.GITLAB_FETCH_TIMEOUT_MS, 10) || 30000);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Config ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// → { url, entry, out } | null
export function intentLayerConfig(cfg) {
  const raw = cfg?.intentLayer;
  if (!raw) return null;
  const o = typeof raw === 'string' ? { gitlab: raw } : raw;
  const url = String(o.gitlab ?? o.url ?? '').trim();
  if (!url) return null;
  return { url, entry: o.entry ? String(o.entry).replace(/^\/+/, '') : null, out: o.out || DEFAULT_OUT };
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
  ['purpose', /^(intent|purpose|overview|what it is|description|summary|about)$/i],
  ['whenToUse', /^(when to use|use (it )?when|usage|usage rules|usage guidelines|how to use|do|dos)$/i],
  ['whenNotToUse', /^(when not to use|what not to do|do not use (it )?when|don'?t use (it )?when|avoid|don'?ts?)$/i],
  ['mistakes', /^(common mistakes|mistakes|common errors|pitfalls)$/i],
  ['limitations', /^(limitations|limits|known limitations|constraints)$/i],
];
// Facts the engine reads from Figma and the code itself: never read as intent.
const FACT_TITLE = /^(source|sources|tokens? used|tokens|api|props|properties|events|emits|slots|anatomy|states|css custom properties|metadata)$/i;
// A title's own words: its last part ("Overview / When To Use"), any numbering ("2. Overview") dropped.
const titleWords = (title) => String(title ?? '').split('/').pop().trim().replace(/^\d+(\.\d+)*[.)]?\s+/, '');
export function keyOfTitle(title) {
  const last = titleWords(title);
  return KEY_OF.find(([, re]) => re.test(last))?.[0] ?? null;
}

// A Markdown body → its lines: each bullet or paragraph one item, markers dropped.
export function itemsOf(body) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(para.join(' ')); para = []; } };
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = /^(?:[-*•+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { flush(); out.push(bullet[1].trim()); continue; }
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
  for (const v of Object.values(entity?.$extensions ?? {})) {
    const p = v && typeof v === 'object' ? (v.sourcePath ?? v.source ?? v.path) : null;
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return null;
}

// One entity as the engine reads it. file: its path in the project.
export function entityView(entity, file, group = '') {
  const kind = String(entity?.kind ?? '').trim() || 'entity';
  const view = {
    kind, layer: layerOf(kind, group), name: String(entity?.name ?? entity?.identifier ?? '').trim(), id: entity?.identifier ?? null,
    status: null, file, code: codeFileOf(entity), summary: null,
    purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [],
    facts: [], repeated: 0,   // what was left out: the sections that are facts (by title), the lines repeated on every page
  };
  const desc = String(entity?.description ?? '').trim();
  const summary = String(entity?.metadata?.summary ?? '').trim();
  if (summary) view.summary = summary;
  let statusLine = null;
  const casesPurpose = [];   // a use-cases block's purpose: after what the sections say it is for
  const blocks = [...(entity?.documentBlocks ?? []), ...(entity?.agentDocumentBlocks ?? [])];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.kind === 'sections' || b.kind === 'section') {
      for (const s of (b.items ?? [b])) {
        const title = String(s?.title ?? '').trim(), body = String(s?.body ?? s?.content ?? '').trim();
        if (!title || !body) continue;
        if (/^metadata$/i.test(titleWords(title))) { statusLine ??= /(?:^|\n)\s*[-*]?\s*status\s*:\s*([^\n]+)/i.exec(body)?.[1]?.trim() ?? null; continue; }
        if (FACT_TITLE.test(titleWords(title))) { view.facts.push(title); continue; }
        const key = keyOfTitle(title);
        if (key) view[key].push(...itemsOf(body));
        else view.sections.push({ title, text: body });
      }
    } else if (b.kind === 'use-cases') {
      for (const it of b.items ?? []) {
        const d = String(it?.description ?? '').trim(); if (!d) continue;
        if (/^(recommended|do|preferred)$/i.test(it.stance ?? '')) view.whenToUse.push(d);
        else if (/^(discouraged|dont|don't|avoid|prohibited|forbidden)$/i.test(it.stance ?? '')) view.whenNotToUse.push(d);
      }
      if (b.purpose) casesPurpose.push(String(b.purpose).trim());
    } else if (b.kind === 'checklist') {
      for (const it of b.items ?? []) {
        const label = String(it?.label ?? '').trim();
        if (label) view.rules.push({ text: label, level: it.level ?? null });
      }
    }
  }
  view.purpose.push(...casesPurpose);
  if (desc) view.purpose.push(desc);
  view.status = statusLine ?? entity?.metadata?.status ?? null;
  return view;
}

// The index and its entity files → { system: { name, version, sections }, entities: [view] }.
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
  if (index) {
    const info = index.systemInfo ?? {};
    const sections = [];
    for (const b of index.documentBlocks ?? []) {
      if (b?.kind === 'sections') for (const s of b.items ?? []) if (s?.title && s?.body) sections.push({ title: String(s.title), text: String(s.body).trim() });
      if (b?.kind === 'checklist') for (const it of b.items ?? []) if (it?.label) sections.push({ title: b.title ?? 'Checklist', text: `- ${it.label}${it.level ? ` (${it.level})` : ''}` });
    }
    system = { name: info.name ?? null, version: info.version ?? null, dsds: index.dsdsVersion ?? null, sections };
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
export function dropBoilerplate(entities) {
  const shape = (e, t) => {
    let s = String(t);
    for (const w of [e.code, e.name, e.id].filter(Boolean)) s = s.split(w).join('{}');
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  };
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
    for (const e of list) for (const f of FIELDS) {
      const keep = e[f].filter((it) => (count.get(f + '\u0000' + shape(e, it.text ?? it)) ?? 0) < min);
      dropped += e[f].length - keep.length;
      e.repeated = (e.repeated ?? 0) + e[f].length - keep.length;
      e[f] = keep;
    }
  }
  return dropped;
}

// ── Matching entities to the system's components ────────────────────────────────────────────────────────────────────
// By name (its words, case and spacing aside: "Button Main" is buttonMain), by identifier without its kind
// ("component-button-primary"), else by the code file the entity names and the engine found for the component.
// names: the components; codeFiles: { name: file }. → Map(name → entity)
export function matchComponents(names, entities, codeFiles = {}) {
  const comps = entities.filter((e) => e.layer === 'components');
  const byName = new Map(), byCode = new Map();
  for (const e of comps) {
    for (const k of [norm(e.name), norm(String(e.id ?? '').replace(/^(component|element)[-_:]?/i, ''))]) if (k && !byName.has(k)) byName.set(k, e);
    if (e.code) byCode.set(e.code.replace(/^\.?\//, ''), e);
  }
  const out = new Map();
  for (const name of names) {
    let e = byName.get(norm(name));
    const file = codeFiles[name] ? String(codeFiles[name]).replace(/^\.?\//, '') : null;
    if (!e && file) e = byCode.get(file) ?? [...byCode].find(([p]) => file.endsWith('/' + p) || p.endsWith('/' + file))?.[1];
    if (e) out.set(name, e);
  }
  return out;
}

// The code file of each component the engine knows: ds-config.json → componentFiles, then the code capture's.
export function codeFilesOf(ROOT, cfg = {}) {
  const out = {};
  try {
    const snap = JSON.parse(readFileSync(resolve(ROOT, codeSnapshotPath(cfg)), 'utf8'));
    for (const [n, a] of Object.entries(snap?.api ?? {})) if (a?.file) out[n] = a.file;
  } catch { /* no code capture yet */ }
  for (const [n, f] of Object.entries(cfg?.componentFiles ?? {})) if (typeof f === 'string') out[n] = f;
  return out;
}

// ── The snapshot ────────────────────────────────────────────────────────────────────────────────────────────────────
export function snapshotPath(ROOT, cfg) { const c = intentLayerConfig(cfg); return c ? resolve(ROOT, c.out) : null; }
export function readIntentLayer(ROOT, cfg) {
  const p = snapshotPath(ROOT, cfg);
  if (!p || !existsSync(p)) return null;
  try { const s = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(s?.entities) ? s : null; } catch { return null; }
}

// A link to one file of the layer on GitLab, on the branch it was read from.
export const fileUrl = (src, file) => (src?.url && file ? `${src.url}/-/blob/${encodeURI(src.ref ?? 'HEAD')}/${file.split('/').map(encodeURIComponent).join('/')}` : null);

// What a component carries from the layer, for the design intent, the contracts and the style guide.
export function componentIntent(e, src) {
  const list = (a) => (a.length ? a : null);
  return {
    name: e.name, file: e.file, url: fileUrl(src, e.file), status: e.status ?? null,
    purpose: e.purpose[0] ?? null, whenToUse: list(e.whenToUse), whenNotToUse: list(e.whenNotToUse),
    mistakes: list(e.mistakes), limitations: list(e.limitations),
    rules: list(e.rules.map((r) => (r.level ? `${r.text} (${r.level})` : r.text))),
    sections: list(e.sections),
  };
}

// One line of an index: its first sentence, at most n characters.
export function short(text, n = 160) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const first = /^(.+?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  return first.length > n ? first.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : first;
}

// The pages that are not components, for llms.txt: { name, kind, layer, purpose }.
export function layerPages(snap) {
  return (snap?.entities ?? []).filter((e) => e.layer !== 'components').map((e) => ({ name: e.name, kind: e.kind, layer: e.layer, purpose: e.purpose[0] ?? null }));
}

// ── What reaches the agents ─────────────────────────────────────────────────────────────────────────────────────────
// Where each kind of line of a page goes, as the readers above and in contract-gen, prototype-context and the style
// guide take it. The usage report below is built from this table, so it says what is true of the readers.
export const REACH = {
  components: {
    purpose: ['its contract', 'llms.txt (when Figma has no description)', 'the prototype context', 'its documentation in the style guide'],
    whenToUse: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    whenNotToUse: ['its contract', 'llms.txt (the first line)', 'the prototype context and its checks', 'its documentation in the style guide'],
    mistakes: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    limitations: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    rules: ['its contract', 'the prototype context', 'its documentation in the style guide'],
  },
  other: {
    purpose: ['llms.txt', 'the prototype context'],
    whenToUse: ['the prototype context'],
    whenNotToUse: ['the prototype context'],
    mistakes: ['the prototype context'],
    limitations: ['the prototype context'],
    rules: ['the prototype context'],
    sections: ['the prototype context (when a request matches it)'],
  },
};
// Why a part of a page does not reach the agents, what to do so it does, and whether to remove it (and what it is
// still for when it stays). One entry per reason; the usage report and the style guide say them as written here.
export const NOT_USED = {
  noComponent: {
    why: 'Its name matches no component of the system, nor does the code file it names, so the engine cannot tell which component it is about.',
    fix: 'Name the page as the component is named in Figma (or point it at the component\'s code file). If the component is not in Figma yet, add it there.',
    remove: 'Only if the component no longer exists. Otherwise keep it: once it is named, the whole page reaches the agents.',
  },
  unknownTitle: {
    why: 'The engine sorts a component page by the title of each section, and this title is not one it knows, so no agent is given it.',
    fix: 'If it tells someone when or how to use the component, title it Intent, When to use, When not to use, Common mistakes or Limitations.',
    remove: 'No. It stays on the page for people and in design-intent.json, which a person or an agent can open.',
  },
  noReader: {
    why: 'No agent reads this kind of line on a page of this layer yet.',
    fix: 'Nothing on the page: the engine would have to learn to read it.',
    remove: 'No. It stays on the page for people.',
  },
  morePurpose: {
    why: 'Only the first line of what it is for is read: it is the one-line summary agents see.',
    fix: 'Put the sentence that matters most first.',
    remove: 'No. The rest stays on the page for people.',
  },
  facts: {
    why: 'The engine reads these from Figma and the code themselves, which are the source; a copy here is not read so that it can never contradict them.',
    fix: 'Nothing: agents get them from the contracts, built from Figma and the code.',
    remove: 'Yes, unless a script writes them from the code on every change: a copy written by hand goes out of date.',
  },
  repeated: {
    why: 'The same sentence is on every page of its kind with only the name changed, so it says nothing about this one.',
    fix: 'Write what is true of this piece only (when to use it, what not to do with it), or leave it out.',
    remove: 'Yes: change whatever writes it on every page.',
  },
};
const notUsedItem = (what, reason) => ({ what, reason, ...NOT_USED[reason] });

const KIND_WORDS = { purpose: 'what it is for', whenToUse: 'when to use', whenNotToUse: 'when not to use', mistakes: 'common mistakes', limitations: 'limitations', rules: 'rules', sections: 'other sections' };

// For every page of the layer: what the agents get from it and where, what they do not get (why, what to do so they
// do, whether to remove it: NOT_USED), and a verdict.
//   used:     what it is for and when (or when not) to use it reach the agents
//   thin:     some of it reaches them, but not what it is for together with when to use it
//   not used: nothing of it reaches them
// matched: Map(component → entity) from matchComponents. → { pages: [...], counts: { used, thin, notUsed } }
export function useReport(snap, matched = new Map()) {
  const forEntity = new Map([...matched].map(([n, e]) => [e, n]));
  const pages = [];
  for (const e of snap?.entities ?? []) {
    const comp = e.layer === 'components';
    const component = forEntity.get(e) ?? null;
    const reach = comp ? REACH.components : REACH.other;
    const gets = [], notUsed = [];
    if (comp && !component) {
      notUsed.push(notUsedItem('the whole page', 'noComponent'));
    } else {
      for (const k of ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'rules']) {
        const n = (e[k] ?? []).length; if (!n) continue;
        const to = reach[k];
        // Only the first line of what it is for is read.
        const lines = k === 'purpose' ? 1 : n;
        if (to) gets.push({ what: KIND_WORDS[k], lines, to });
        else notUsed.push(notUsedItem(`${KIND_WORDS[k]} (${n} line${n === 1 ? '' : 's'})`, 'noReader'));
        if (k === 'purpose' && n > 1) notUsed.push(notUsedItem(`${n - 1} more line${n === 2 ? '' : 's'} of what it is for`, 'morePurpose'));
      }
    }
    if (e.sections?.length && reach.sections && !(comp && !component)) gets.push({ what: `${KIND_WORDS.sections} (${e.sections.map((x) => x.title).slice(0, 4).join(', ')}${e.sections.length > 4 ? ', …' : ''})`, lines: e.sections.length, to: reach.sections });
    else if (e.sections?.length) notUsed.push(notUsedItem(`${e.sections.length} section${e.sections.length === 1 ? '' : 's'} (${e.sections.map((x) => x.title).slice(0, 4).join(', ')}${e.sections.length > 4 ? ', …' : ''})`, 'unknownTitle'));
    if (e.facts?.length) notUsed.push(notUsedItem(e.facts.join(', '), 'facts'));
    if (e.repeated) notUsed.push(notUsedItem(`${e.repeated} repeated line${e.repeated === 1 ? '' : 's'}`, 'repeated'));
    // A page that names no component: nothing else on it matters until it is named.
    if (comp && !component) notUsed.splice(1);
    const has = (k) => gets.some((g) => g.what.startsWith(KIND_WORDS[k]));
    // A component's page is used when it says what the piece is for and when (or when not) to use it; any other page
    // when it says what it is for and gives a rule or a section to compose by.
    const how = has('whenToUse') || has('whenNotToUse') || (!comp && (has('rules') || has('sections') || has('mistakes')));
    const verdict = !gets.length ? 'not used' : has('purpose') && how ? 'used' : 'thin';
    pages.push({ name: e.name, kind: e.kind, layer: e.layer, file: e.file, url: fileUrl(snap._source, e.file), component, verdict, gets, notUsed });
  }
  const counts = { used: 0, thin: 0, notUsed: 0 };
  for (const p of pages) counts[p.verdict === 'used' ? 'used' : p.verdict === 'thin' ? 'thin' : 'notUsed']++;
  return { pages, counts };
}

// ── Reading it from GitLab ──────────────────────────────────────────────────────────────────────────────────────────
function why(status, host) {
  if (status === 401) return 'GitLab did not accept the token (401): check GITLAB_TOKEN in .env, it may be wrong, expired or revoked';
  if (status === 403) return 'GitLab refused (403): the token needs the read_api scope and access to this project';
  if (status === 404) return `not found on ${host} (404): check the link, or the project is private and no token was sent (GITLAB_TOKEN in .env, and GITLAB_HOST=${host} for a company GitLab)`;
  return `GitLab answered ${status}`;
}

// Read the layer and write its snapshot. opts: { env, fetchImpl, offline, now }.
// → { ok, changed, out, source, entities, boilerplate } | { error, out, stale } (stale: the snapshot kept is from an earlier commit)
export async function syncIntentLayer(ROOT, cfg, opts = {}) {
  const c = intentLayerConfig(cfg);
  if (!c) return null;
  const out = resolve(ROOT, c.out);
  const prev = readIntentLayer(ROOT, cfg);
  const kept = (error) => ({ error, out: c.out, stale: !!prev, source: prev?._source ?? null });
  if (opts.offline) return kept('not checked against GitLab this run');
  const env = { ...(opts.env ?? process.env) };
  env.GITLAB_HOST = hostEnvFrom(env, [ROOT]);
  const p = parseGitlabProject(c.url, env);
  if (!p) return { error: `${c.url} is not a GitLab project link`, out: c.out, stale: !!prev };
  const token = tokenFrom(env, [ROOT]);
  const headers = token && tokenAllowedFor(p.host, env) ? { 'PRIVATE-TOKEN': token } : {};
  const notSent = token && !headers['PRIVATE-TOKEN'] ? `; a GITLAB_TOKEN is set but not sent to ${p.host}: add GITLAB_HOST=${p.host} to .env` : '';
  const fetchImpl = opts.fetchImpl ?? plainGet;
  const get = async (url) => {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    try { return await fetchImpl(url, { headers, signal }); } catch { return { ok: false, status: 0 }; }
  };
  const fail = (r) => kept(r.status ? why(r.status, p.host) + notSent : `could not reach ${p.host}`);
  const base = `${p.origin}/api/v4/projects/${encodeURIComponent(p.path)}`;
  try {
    let ref = p.ref;
    if (!ref) {
      const r = await get(base);
      if (!r.ok) return fail(r);
      ref = (await r.json())?.default_branch || 'main';
    }
    const cm = await get(`${base}/repository/commits/${encodeURIComponent(ref)}`);
    if (!cm.ok) return fail(cm);
    const head = await cm.json();
    const sha = String(head?.id ?? '');
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) return kept('GitLab gave no commit for this branch');
    const source = { url: `${p.origin}/${p.path}`, ref, sha, committedAt: String(head.committed_date ?? ''), entry: c.entry, entryGiven: c.entry ?? null };
    if (prev?._source?.sha === sha && prev?._source?.url === source.url && (prev._source.entryGiven ?? null) === (c.entry ?? null)) {
      return { ok: true, changed: false, out: c.out, source: prev._source, entities: prev.entities.length, boilerplate: prev.boilerplate ?? 0 };
    }
    const folder = c.entry && posix.dirname(c.entry) !== '.' ? posix.dirname(c.entry) : null;
    const a = await get(`${base}/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}${folder ? `&path=${encodeURIComponent(folder)}` : ''}`);
    if (!a.ok) return fail(a);
    const files = new Map();
    for (const f of untar(gunzipSync(Buffer.from(await a.arrayBuffer())))) {
      if (!/\.json$/i.test(f.path)) continue;
      try { files.set(f.path, JSON.parse(f.data.toString('utf8'))); } catch { /* not JSON: not read */ }
    }
    const entry = c.entry ?? [...files.keys()].filter((f) => /(^|\/)system\.dsds\.json$/i.test(f)).sort((x, y) => x.split('/').length - y.split('/').length || x.length - y.length)[0] ?? null;
    if (c.entry && !files.has(c.entry)) return kept(`${c.entry} is not in ${p.path} on ${ref}: check intentLayer.entry`);
    const { system, entities } = readDsds(files, entry);
    if (!entities.length) return kept(`no DSDS entities found in ${p.path} on ${ref} (looked for system.dsds.json and *.dsds.json files)`);
    const boilerplate = dropBoilerplate(entities);
    source.entry = entry;
    source.fetchedAt = (opts.now ?? new Date()).toISOString();
    const snap = {
      _note: 'The intent layer as read from GitLab (rms-design-system-engine). Regenerated when its commit moves; do not edit by hand, edit the layer itself.',
      _source: source, system, boilerplate, entities,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(snap, null, 2) + '\n');
    return { ok: true, changed: true, out: c.out, source, entities: entities.length, boilerplate, previous: prev?._source?.sha ?? null };
  } catch (e) {
    return kept(`could not read ${p.host}: ${e.message}`);
  }
}

// One line for the person.
export function describeSync(r) {
  if (!r) return '';
  const at = (s) => (s?.sha ? `${s.url.replace(/^https?:\/\//, '')} @ ${s.ref} ${s.sha.slice(0, 8)}${s.committedAt ? ` (${s.committedAt.slice(0, 10)})` : ''}` : '');
  if (r.error) return r.stale ? `⚠️  Intent layer: ${r.error} - using the copy of ${at(r.source)}` : `❌ Intent layer: ${r.error}`;
  return `🧭 Intent layer: ${at(r.source)} - ${r.entities} pages${r.boilerplate ? ` (${r.boilerplate} repeated lines left out)` : ''}, ${r.changed ? 'read' : 'up to date'} → ${r.out}`;
}
