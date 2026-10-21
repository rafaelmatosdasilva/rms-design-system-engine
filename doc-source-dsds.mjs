// doc-source-dsds.mjs - a documentation source: the team's intent layer written in DSDS and kept in a GitLab project.
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
//   "intentLayer": "https://<host>/<group>/<project>"                    (or /-/tree/<branch>)
//   "intentLayer": { "gitlab": "<link>", "entry": "docs/dsds/system.dsds.json", "out": "intent-layer.snapshot.json" }
// Without an entry, the shortest path ending in system.dsds.json is the index, else every *.dsds.json with an entity.
// The component contracts in the same repository (*.contract.json, published with --contracts-out) are read too, for
// their links and what each lists; "contracts": "<folder>" names their folder when the entry's folder does not hold it.
//
// READ-ONLY. The engine never writes to the intent layer: it only asks GitLab (GET) for the project, the branch's latest
// commit and one archive, and the only file it writes is its own snapshot in the project. A read_api token is enough.
// Read through the GitLab REST API, no clone: the branch's latest commit, then one archive of the folder that holds the
// index, read in memory. Nothing is fetched again while the commit has not moved. The token is gitlab-source.mjs's:
// GITLAB_TOKEN from the environment or the project's .env, only ever sent to gitlab.com or a host named in GITLAB_HOST.
// What was read is written to one snapshot file (out), so a run without the network still has the layer, and says
// from which commit.
//
// Text that is the same on every entity of a kind but for the entity's own name (a generator's filler: "Use X when
// its API matches the need") says nothing about any of them and is dropped; the count is kept.
//
// DEGRADE-SAFE: any failure keeps the snapshot already there and returns { error } in plain words; never throws.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, posix } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseGitlabProject, tokenFrom, hostEnvFrom, untar, plainGet, STATE_FILE } from './gitlab-source.mjs';
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { contractSummaries } from './shared-contracts.mjs';

export const ID = 'dsds-gitlab';
// The reader's version, kept in each snapshot: one written by an older reader is read again even when the commit has
// not moved, so a fix to the reading (a placeholder left out) reaches a project at once. Raise it with every change
// to what is read.
export const READER = 5;   // 3: reads DSDS 0.23 (entries, refs, sections with freeform and guidelines) as well as 0.15; 4: a guidelines section by its title (when to use, when not to, mistakes, limitations); 5: the component contracts kept beside it (shared-contracts.mjs)
export const LABEL = 'the intent layer';

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
  return { url, entry: o.entry ? String(o.entry).replace(/^\/+/, '') : null, out: o.out || DEFAULT_OUT, contracts: o.contracts ? String(o.contracts).replace(/^\/+|\/+$/g, '') : null };
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
    purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [],
    facts: [], repeated: 0,   // what was left out: the sections that are facts (by title), the lines repeated on every page
  };
  const desc = String(entity?.description ?? '').trim();
  const summary = String(entity?.metadata?.summary ?? '').trim();
  if (summary) view.summary = summary;
  let statusLine = null;
  const casesPurpose = [];   // a use-cases block's purpose: after what the sections say it is for
  // DSDS 0.15 writes documentBlocks; 0.23 writes sections: a section's freeform parts read as 0.15's sections, its
  // guidelines (a statement each, a shared one through its ref) by their title as a section's are: "When to use",
  // "When not to use", "Common mistakes", "Limitations" as those, the rest ("Rules", "For agents") as a checklist.
  const v23 = (entity?.sections ?? []).flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    if (x.kind === 'guidelines') {
      const items = (x.items ?? []).map((it) => { const sh = it?.statement ? null : sharedStatement(it?.refs, shared); return { label: it?.statement ?? sh.text, level: it?.level ?? sh?.level ?? null }; });
      const key = keyOfTitle(x.title);
      return [key && key !== 'purpose' ? { kind: 'guided', key, items } : { kind: 'checklist', title: x.title, items }];
    }
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
        // A body that only names its own section ("Do / Don't section.") is a placeholder: nothing to read.
        if (/^[\w\s/'’&-]{1,60}\bsection\.?$/i.test(body) && body.toLowerCase().startsWith(title.split('/').pop().trim().toLowerCase().slice(0, 4)) || body.replace(/\s*section\.?$/i, '').trim().toLowerCase() === title.trim().toLowerCase()) continue;
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
    } else if (b.kind === 'guided') {
      for (const it of b.items ?? []) { const label = String(it?.label ?? '').trim(); if (label) view[b.key].push(label); }
    } else if (b.kind === 'checklist') {
      for (const it of b.items ?? []) {
        const label = String(it?.label ?? '').trim();
        if (label) view.rules.push({ text: label, level: it.level ?? null });
      }
    }
  }
  view.purpose.push(...casesPurpose);
  if (desc) view.purpose.push(desc);
  const st = entity?.metadata?.status;
  view.status = statusLine ?? (st && typeof st === 'object' ? st.status ?? null : st) ?? null;
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
  // DSDS 0.23: the index has entries (the system's own), shared rules and refs to each page's file; a page file is one
  // entry ({ kind, id, … }) or several ({ entries: [] }), its group the folder it is in (components, patterns…).
  if (index && (index.entries || index.refs)) {
    const shared = index.shared ?? [];
    const sys = (index.entries ?? []).find((e) => e?.kind === 'system') ?? {};
    const sections = [];
    for (const x of sys.sections ?? []) {
      if (x?.kind === 'guidelines') for (const it of x.items ?? []) { const t = it?.statement ?? sharedStatement(it?.refs, shared).text; if (t) sections.push({ title: x.title ?? 'Guidelines', text: `- ${t}${it?.level ? ` (${it.level})` : ''}` }); }
      if (x?.kind === 'section') for (const f of x.freeform ?? []) if (f?.title && f?.body) sections.push({ title: String(f.title), text: String(f.body).trim() });
    }
    system = { name: sys.name ?? index.name ?? null, version: sys.metadata?.version ?? null, dsds: index.schemaVersion ?? null, sections };
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


// Its snapshot, as written by syncIntentLayer.
export function snapshotPath(ROOT, cfg) { const c = intentLayerConfig(cfg); return c ? resolve(ROOT, c.out) : null; }
export function readSnapshot(ROOT, cfg) {
  const p = snapshotPath(ROOT, cfg);
  if (!p || !existsSync(p)) return null;
  try { const s = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(s?.entities) ? s : null; } catch { return null; }
}
// A link to one file of the layer on GitLab, on the branch it was read from.
export const fileUrl = (src, file) => (src?.url && file ? `${src.url}/-/blob/${encodeURI(src.ref ?? 'HEAD')}/${file.split('/').map(encodeURIComponent).join('/')}` : null);

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
  const prev = readSnapshot(ROOT, cfg);
  const kept = (error) => ({ error, out: c.out, stale: !!prev, source: prev?._source ?? null });
  if (opts.offline) return kept('not checked against GitLab this run');
  const env = { ...(opts.env ?? process.env) };
  // The .env where it runs, and, for a project that is a GitLab mirror (gitlab-source.mjs), the folder that holds it:
  // where the project was first named with --project=, and where its .env is.
  const folders = [ROOT, ...(existsSync(join(ROOT, STATE_FILE)) ? [dirname(resolve(ROOT))] : [])];
  env.GITLAB_HOST = hostEnvFrom(env, folders);
  // A link set as the intent layer is a GitLab project by declaration, on any host; the token still goes only where
  // GITLAB_HOST allows (below).
  let host = ''; try { host = new URL(c.url).host; } catch { /* not a link */ }
  const p = parseGitlabProject(c.url, env) ?? (host ? parseGitlabProject(c.url, { ...env, GITLAB_HOST: [env.GITLAB_HOST, host].filter(Boolean).join(',') }) : null);
  if (!p) return { error: `${c.url} is not a GitLab project link`, out: c.out, stale: !!prev };
  const token = tokenFrom(env, folders);
  const headers = token && tokenAllowedFor(p.host, env) ? { 'PRIVATE-TOKEN': token } : {};
  const notSent = token && !headers['PRIVATE-TOKEN'] ? `; a GITLAB_TOKEN is set but not sent to ${p.host}: add GITLAB_HOST=${p.host} to .env` : '';
  const fetchImpl = opts.fetchImpl ?? plainGet;
  // Every call is a GET: the layer is read, never changed.
  const get = async (url) => {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    try { return await fetchImpl(url, { method: 'GET', headers, signal }); } catch { return { ok: false, status: 0 }; }
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
    const source = { id: ID, label: LABEL, url: `${p.origin}/${p.path}`, ref, sha, committedAt: String(head.committed_date ?? ''), entry: c.entry, entryGiven: c.entry ?? null };
    if (prev?._source?.sha === sha && prev?._source?.url === source.url && (prev._source.entryGiven ?? null) === (c.entry ?? null) && prev._reader === READER) {
      return { ok: true, changed: false, out: c.out, source: prev._source, entities: prev.entities.length, boilerplate: prev.boilerplate ?? 0 };
    }
    const folder = c.entry && posix.dirname(c.entry) !== '.' ? posix.dirname(c.entry) : null;
    const a = await get(`${base}/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}${folder ? `&path=${encodeURIComponent(folder)}` : ''}`);
    if (!a.ok) return fail(a);
    const files = new Map();
    const keep = (archive) => {
      for (const f of untar(gunzipSync(Buffer.from(archive)))) {
        if (!/\.json$/i.test(f.path)) continue;
        try { files.set(f.path, JSON.parse(f.data.toString('utf8'))); } catch { /* not JSON: not read */ }
      }
    };
    keep(await a.arrayBuffer());
    // The component contracts kept in the layer (intentLayer.contracts): read from the same commit when the entry's
    // folder does not hold them. They are read for their links and what they list, never changed.
    if (c.contracts && folder && !(c.contracts + '/').startsWith(folder + '/')) {
      const k = await get(`${base}/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}&path=${encodeURIComponent(c.contracts)}`);
      if (k.ok) keep(await k.arrayBuffer());
    }
    const entry = c.entry ?? [...files.keys()].filter((f) => /(^|\/)system\.dsds\.json$/i.test(f)).sort((x, y) => x.split('/').length - y.split('/').length || x.length - y.length)[0] ?? null;
    if (c.entry && !files.has(c.entry)) return kept(`${c.entry} is not in ${p.path} on ${ref}: check intentLayer.entry`);
    const { system, entities } = readDsds(files, entry);
    if (!entities.length) return kept(`no DSDS entities found in ${p.path} on ${ref} (looked for system.dsds.json and *.dsds.json files)`);
    const boilerplate = dropBoilerplate(entities);
    for (const e of entities) e.url = fileUrl(source, e.file);
    source.entry = entry;
    source.fetchedAt = (opts.now ?? new Date()).toISOString();
    const snap = {
      _note: 'The intent layer as read from GitLab (rms-design-system-engine). Regenerated when its commit moves; do not edit by hand, edit the layer itself.',
      _source: source, _reader: READER, system, boilerplate, entities,
      contracts: contractSummaries(files, (f) => fileUrl(source, f)),
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


// The adapter, as intent-layer.mjs's SOURCES take it.
export const source = {
  id: ID, label: LABEL, configKey: 'intentLayer',
  configured: (cfg) => !!intentLayerConfig(cfg),
  read: readSnapshot,
  sync: (ROOT, cfg, opts) => syncIntentLayer(ROOT, cfg, opts),
  describe: (r) => describeSync(r),
};
