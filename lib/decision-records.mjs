// decision-records.mjs - the team's decision records, kept as a chain: superseded by a new record, never edited.
//
// A team that writes its decisions down keeps them as records in a folder, one file each (an architecture decision
// record: its status, the context, the decision, its consequences, and links to what it is about). Each has a life:
// draft, proposed, accepted, then superseded by a later record or deprecated. Its worth is that it stays as it was
// decided: why the system is shaped the way it is. A decision changed in place loses that, and nobody can say any more
// what was decided first, or why it changed.
//
// So the records are read here, with the chain of which one overruled which (a record "Superseded by" another, and
// that one "Supersedes" it back), and, once the system has had a first release (a git tag), an accepted record whose
// decision was edited in place is a finding: a new record that supersedes it, and links back, is what it should be.
// A record links the contracts it is about; it never holds them, so the contracts can change while the decision holds.
// The decisions log (decisions.mjs) gathers each accepted record as a decision, and tells an agent which record
// overruled which. Read only: nothing here writes a record.
//
//   RECORD_DIRS                         → the folders a team keeps its records in, looked for in order
//   STATUSES                            → the lifecycle, in its order
//   parseRecord(text, file)             → { file, id, title, status, date, supersedes, supersededBy, links, decision, context, consequences }
//   recordChains(records)               → [{ from, to }] each record a later one superseded, from the old to the new
//   readRecords(ROOT, cfg)              → { dir, records, chains } | null when the team keeps none
//   editedInPlace(ROOT, file, { since }) → [{ commit, at, by }] each change to a record's decision made after `since`
//   recordFindings(ROOT, cfg)           → { records, chains, firstRelease, findings: [{ file, title, why, changes }] }
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

export const RECORD_DIRS = ['docs/decisions', 'docs/adr', 'docs/adrs', 'docs/architecture/decisions', 'doc/adr', 'adr', 'decisions'];
export const STATUSES = ['draft', 'proposed', 'accepted', 'rejected', 'deprecated', 'superseded'];

const statusOf = (s) => { const w = String(s ?? '').toLowerCase(); return STATUSES.find((x) => w.includes(x)) ?? (w.trim() ? w.trim().split(/\s+/)[0] : null); };
// A record's own file name, the way another record links to it: 0005-use-tokens.md → 0005-use-tokens.
const idOf = (f) => basename(String(f)).replace(/\.(md|mdx|markdown|txt)$/i, '');
const linksIn = (s) => [...String(s ?? '').matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ text: m[1], href: m[2] }));

// The sections of a record, by their headings (## Status, ## Context, ## Decision, ## Consequences), and its status from
// a "Status:" line or its section's first words. The links it gives under or beside "Supersedes" and "Superseded by".
export function parseRecord(text, file = '') {
  const t = String(text ?? '');
  const title = /^#\s+(.+)$/m.exec(t)?.[1]?.trim() ?? idOf(file);
  const sections = {};
  for (const part of t.split(/^##\s+/m).slice(1)) { const [head, ...rest] = part.split('\n'); sections[head.trim().toLowerCase()] = rest.join('\n').trim(); }
  const statusLine = /^\s*(?:\*\*)?status(?:\*\*)?\s*:\s*(.+)$/im.exec(t)?.[1] ?? sections.status?.split('\n').find((l) => l.trim()) ?? null;
  const status = statusOf(statusLine);
  const date = /^\s*(?:\*\*)?date(?:\*\*)?\s*:\s*(\d{4}-\d{2}-\d{2})/im.exec(t)?.[1] ?? null;
  const after = (re) => { const out = []; for (const l of t.split('\n')) if (re.test(l)) for (const k of linksIn(l)) out.push(idOf(k.href)); return [...new Set(out)]; };
  return {
    file, id: idOf(file), title, status, ...(date ? { date } : {}),
    supersedes: after(/\bsupersedes\b/i), supersededBy: after(/\bsuperseded\s+by\b/i),
    // What it is about: the contracts and other files it links (never their contents).
    links: linksIn(t).filter((k) => !/^#/.test(k.href) && !/^https?:/i.test(k.href) || /\.contract\.json$/i.test(k.href)).map((k) => k.href),
    decision: sections.decision ?? null, context: sections.context ?? null, consequences: sections.consequences ?? null,
  };
}

// Each record a later one superseded: from the old to the new, read from either side ("Superseded by" on the old one,
// "Supersedes" on the new), once each.
export function recordChains(records = []) {
  const ids = new Set(records.map((r) => r.id));
  const seen = new Set(), out = [];
  const add = (from, to) => { const k = `${from}>${to}`; if (from && to && from !== to && ids.has(from) && ids.has(to) && !seen.has(k)) { seen.add(k); out.push({ from, to }); } };
  for (const r of records) { for (const to of r.supersededBy) add(r.id, to); for (const from of r.supersedes) add(from, r.id); }
  return out;
}

export function readRecords(ROOT, cfg = {}) {
  const dirs = cfg.decisionRecords?.dir ? [cfg.decisionRecords.dir] : RECORD_DIRS;
  for (const d of dirs) {
    const dir = resolve(ROOT, d);
    let files = [];
    try { if (!statSync(dir).isDirectory()) continue; files = readdirSync(dir).filter((f) => /\.(md|mdx|markdown)$/i.test(f) && !/^(readme|index|template)\b/i.test(f)).sort(); } catch { continue; }
    const records = files.map((f) => parseRecord(readFileSync(join(dir, f), 'utf8'), join(d, f))).filter((r) => r.status || r.decision);
    if (records.length) return { dir: d, records, chains: recordChains(records) };
  }
  return null;
}

const git = (ROOT, args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

// The first release: the oldest tag. Before it, a record may still be shaped; after it, it is history.
export function firstRelease(ROOT) {
  const out = git(ROOT, ['tag', '--sort=creatordate']);
  const tag = out?.split('\n').map((x) => x.trim()).find(Boolean);
  return tag ?? null;
}

// The changes made to a record after `since` (a tag or commit) that touch more than its status and its supersede links:
// its decision, context or consequences rewritten in place. → [{ commit, at, by }]
export function editedInPlace(ROOT, file, { since } = {}) {
  if (!since) return [];
  const log = git(ROOT, ['log', '--diff-filter=M', '--format=%H%x09%aI%x09%an', `${since}..HEAD`, '--', file]);   // changes to a record that was there, never the one that wrote it
  if (!log) return [];
  const out = [];
  for (const line of log.split('\n').filter(Boolean)) {
    const [commit, at, by] = line.split('\t');
    const diff = git(ROOT, ['show', '-U0', '--format=', commit, '--', file]) ?? '';
    const changed = diff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).map((l) => l.slice(1).trim()).filter(Boolean);
    // A status that moved on, or a link to the record that superseded it, is the lifecycle working as it should.
    const substantive = changed.filter((l) => !/^(\*\*)?(status|date)(\*\*)?\s*:/i.test(l) && !/\bsuperseded\s+by\b|\bsupersedes\b/i.test(l) && !/^#+\s*status\b/i.test(l) && !STATUSES.includes(l.toLowerCase().replace(/[^a-z]/g, '')));
    if (substantive.length) out.push({ commit: commit.slice(0, 8), at: String(at).slice(0, 10), by: by || null });
  }
  return out;
}

export function recordFindings(ROOT, cfg = {}) {
  const read = readRecords(ROOT, cfg);
  if (!read) return null;
  const since = firstRelease(ROOT);
  const findings = [];
  for (const r of read.records) {
    if (r.status !== 'accepted') continue;
    const changes = editedInPlace(ROOT, r.file, { since });
    if (changes.length) findings.push({ file: r.file, title: r.title, changes, why: `accepted, then its decision was edited in place after the first release (${since}): write a new record that supersedes it and links back, so why it changed is kept` });
  }
  return { ...read, firstRelease: since, findings };
}

// Each record as the decisions log reads a decision (decisions.mjs → decisionsFrom). An accepted record rules out what
// its decision says it chose against; a superseded or deprecated one is kept, said as overruled, with what replaced it.
export function recordDecisions(read) {
  if (!read) return [];
  const byId = new Map(read.records.map((r) => [r.id, r]));
  return read.records.filter((r) => ['accepted', 'superseded', 'deprecated'].includes(r.status)).map((r) => {
    const next = read.chains.filter((c) => c.from === r.id).map((c) => byId.get(c.to)?.title ?? c.to);
    const firstLine = (s) => String(s ?? '').split('\n').map((x) => x.trim()).find(Boolean) ?? null;
    return {
      what: r.title, why: firstLine(r.decision) ?? firstLine(r.context),
      ruledOut: [...String(r.decision ?? '').matchAll(/^\s*(?:ruled out|instead of|not|rejected)\s*:\s*(.+)$/gim)].flatMap((m) => m[1].split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean)),
      at: r.date ?? null, from: r.file, status: r.status,
      ...(next.length ? { overruledBy: next } : {}),
    };
  });
}
