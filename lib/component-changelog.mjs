// component-changelog.mjs - each component's changelog and links, for the style guide, from what the project already
// holds: its git history, its repository, its release tags and the Figma file key. No network.
//
// repoUrl(ROOT) → 'https://github.com/owner/repo' | null (package.json repository, else the origin remote)
// changelogs(ROOT, comps, { max }) → { name: [{ sha, short, date, subject, release, releasedAt, pr, changed? }] }
//   comps: [{ name, files, pattern?, ranges? }]: its own files, and when they are shared (a theme stylesheet), the line
//   ranges of its own rules ([file, from, to], followed back through every commit with git log -L, so a change inside
//   a rule counts) or else the pattern a changed line must hold (its class). changed: what the commit changed in those
//   rules, in a few words (border-radius --radius-modal → --radii-modal; width 320px added).
// figmaChangelogs(ROOT, { props, vars }, names, { max })
//   → { name: [{ sha, short, date, subject, release, releasedAt, changed }] }: every commit that recorded a new read of Figma (its snapshots) and changed what Figma says of the component: its
//   properties and options, and its variables in every mode.
// commitUrl / prUrl: links in the repository's own host form (GitHub, GitLab).
// A project read from GitLab (a mirror with no .git) gives the same through the GitLab API (gitlab-history.mjs).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { spawnSync } from 'node:child_process';
import { mirrorState, mirrorRepo, mirrorBranch, commitsOf, ensureHistory, releaseLogOf } from './gitlab-history.mjs';
import { diffFiles } from './change-where.mjs';
import { doneBy, runFromTrailer } from './who-did-it.mjs';

// Who did each commit (who-did-it.mjs): its author, its committer and the Run-by trailer of a run with nobody behind it.
// Read after the fields each caller already takes, so a subject is never split by them.
const WHO = '%x1f%an%x1f%cn%x1f%(trailers:key=Run-by,valueonly,separator=%x2C)';
const byOf = ([author, committer, trailer] = []) => { const by = doneBy({ author, committer, run: runFromTrailer(trailer) }); return by ? { by } : {}; };
const git = (ROOT, args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); return r.status === 0 ? r.stdout : ''; };

export function normalizeRepo(url) {
  let u = String(url ?? '').trim().replace(/^git\+/, '').replace(/\.git$/, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(u);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  u = u.replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  return /^https?:\/\/[^/]+\/.+/.test(u) ? u.replace(/\/$/, '') : null;
}

export function repoUrl(ROOT) {
  if (mirrorState(ROOT)) return mirrorRepo(ROOT);
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const r = normalizeRepo(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url);
    if (r) return r;
  } catch { /* no package.json */ }
  return normalizeRepo(git(ROOT, ['remote', 'get-url', 'origin']).trim());
}

const gitlab = (repo) => /gitlab/i.test(repo ?? '');
export const commitUrl = (repo, sha) => (repo && sha ? `${repo}${gitlab(repo) ? '/-' : ''}/commit/${sha}` : null);
export const prUrl = (repo, n) => (repo && n ? `${repo}${gitlab(repo) ? '/-/merge_requests/' : '/pull/'}${n}` : null);
export const fileUrl = (repo, branch, file, line) => (repo && file ? `${repo}${gitlab(repo) ? '/-' : ''}/blob/${branch}/${file}${line ? `#L${line}` : ''}` : null);
// The branch the repository publishes from: the origin's default, else main.
export const defaultBranch = (ROOT) => mirrorBranch(ROOT) ?? (git(ROOT, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '') || 'main');

// The project's last releases, newest first (what is merged and not released yet first), each with every commit it holds
// whatever it changed, merges left out: [{ release, releasedAt, commits: [{ sha, short, date, subject, author }] }]. A
// release holds the commits from the version tag before it; a commit is shown once, in the first release that holds it.
export function releaseLog(ROOT, { releases = 10, where = false } = {}) {
  if (mirrorState(ROOT)) return releaseLogOf(ROOT, { releases, where }) ?? [];
  const tags = git(ROOT, ['tag', '-l', 'v[0-9]*', '--sort=v:refname']).split('\n').filter(Boolean);
  const day = tagDates(ROOT);
  const rangeOf = (from, to) => git(ROOT, ['log', '--no-merges', '--format=%H%x1f%aI%x1f%an%x1f%s', from ? `${from}..${to}` : to]).split('\n').filter(Boolean)
    .map((l) => { const [sha, date, author, subject] = l.split('\x1f'); return { sha, short: sha.slice(0, 7), date, subject, author }; });
  const out = [];
  if (tags.length) { const now = rangeOf(tags.at(-1), 'HEAD'); if (now.length) out.push({ release: null, releasedAt: null, commits: now }); }
  else { const now = rangeOf(null, 'HEAD').slice(0, 100); if (now.length) out.push({ release: null, releasedAt: null, commits: now }); }
  for (let i = tags.length - 1; i >= Math.max(0, tags.length - releases); i--) out.push({ release: tags[i], releasedAt: day[tags[i]] ?? null, commits: rangeOf(tags[i - 1] ?? null, tags[i]).slice(0, 300) });
  if (where) {
    // What each commit changed, file by file (its added and removed lines only), read in batches.
    const all = out.flatMap((g) => g.commits), byId = new Map(all.map((c) => [c.sha, c]));
    for (let i = 0; i < all.length; i += 40) {
      const text = git(ROOT, ['show', '--no-color', '--unified=0', '--format=%x00%H', ...all.slice(i, i + 40).map((c) => c.sha)]);
      for (const part of text.split('\0').filter(Boolean)) {
        const sha = part.slice(0, 40), c = byId.get(sha);
        if (c) c.files = diffFiles(part.slice(41)).map((f) => ({ path: f.path, diff: f.diff.slice(0, 20000) }));
      }
    }
  }
  return out;
}

// The ticket a commit was made for, as the team writes it at the start of its subject: #121226 - fixed … (or a pattern
// of the team's own, changelog.ticket: "[A-Z]+-\\d+" for a Jira key). → { ticket, ticketUrl, says } (says: the subject
// without it), null when it names none. A pull request at its end ((#12)) is not a ticket. ticketUrl: from
// changelog.ticketUrl ("https://issues.example/issues/{id}"), else as the project's own changelog links its tickets
// ([#99826](https://issues.example/issues/99826)), else none.
export function ticketOf(subject, cfg = {}, ROOT = null) {
  const s = String(subject ?? '').trim();
  const own = cfg?.changelog?.ticket;
  let re;
  // A list mark before it (* #120770 - …) is part of how the team writes it, not of the ticket.
  try { re = own ? new RegExp(`^\\s*(?:[*-]\\s+)?\\[?(${own})\\]?`) : /^\s*(?:[*-]\s+)?\[?(#\d+)\]?/; } catch { return null; }
  const m = re.exec(s);
  if (!m) return null;
  const ticket = m[1], id = ticket.replace(/^#/, '');
  const says = s.slice(m[0].length).replace(/^\s*[-–—:|]\s*/, '').trim();
  // The team's link pattern for every ticket; one learned from the project's changelog ([#n](…n)) only for #n tickets.
  const pattern = cfg?.changelog?.ticketUrl ?? (ROOT && /^#\d+$/.test(ticket) ? ticketLinks(ROOT) : null);
  return { ticket, ticketUrl: pattern ? String(pattern).replace(/\{id\}/g, encodeURIComponent(id)) : null, says: says || s };
}

// How the project's own changelog links a ticket: its first [#n](…n) link, as a pattern ("https://…/issues/{id}").
const linksFound = new Map();
export function ticketLinks(ROOT) {
  if (linksFound.has(ROOT)) return linksFound.get(ROOT);
  let out = null;
  const look = (dir, depth) => {
    let names = [];
    try { names = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (out) return;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory() && depth > 0 && !/^(node_modules|\.|dist|build)/.test(e.name)) look(rel, depth - 1);
      else if (e.isFile() && /changelog.*\.md$/i.test(e.name)) {
        const m = /\[#(\d+)\]\((https?:\/\/[^)\s]*?)\1\)/.exec(readFileSync(join(ROOT, rel), 'utf8'));
        if (m) out = `${m[2]}{id}`;
      }
    }
  };
  look('', 3);
  linksFound.set(ROOT, out);
  return out;
}

// What a commit's patch of a rule changed, in a few words: each declaration changed (old → new), added or removed.
export function ruleChanges(patch = [], { most = 4 } = {}) {
  const decl = (l) => { const m = /^\s*([-\w]+)\s*:\s*([^;]+?)\s*;?\s*(\/\*.*)?$/.exec(l.replace(/\/\*.*?\*\//g, '').trim() ? l.replace(/\/\*.*?\*\//g, '') : ''); return m ? [m[1], m[2].replace(/var\((--[\w-]+)\)/g, '$1').trim()] : null; };
  const was = new Map(), now = new Map();
  for (const l of patch) {
    if (/^(---|\+\+\+)/.test(l)) continue;
    if (l.startsWith('-')) { for (const part of l.slice(1).split(';')) { const d = decl(part); if (d) was.set(d[0], d[1]); } }
    else if (l.startsWith('+')) { for (const part of l.slice(1).split(';')) { const d = decl(part); if (d) now.set(d[0], d[1]); } }
  }
  const out = [];
  for (const [k, v] of now) { if (!was.has(k)) out.push(`${k} ${v} added`); else if (was.get(k) !== v) out.push(`${k} ${was.get(k)} → ${v}`); }
  for (const [k, v] of was) if (!now.has(k)) out.push(`${k} ${v} removed`);
  return out.length > most ? [...out.slice(0, most), `and ${out.length - most} more`] : out;
}

// What Figma says of a component in one read of its snapshots: its properties (type, options, default) and its own
// variables (named after it) in every mode. → { props: { name: 'type: options · default' }, vars: { 'mode name': value } }
export function figmaOf(props, vars, name) {
  const p = {}, v = {};
  for (const [k, e] of Object.entries(props?.[name]?.properties ?? {})) p[k.replace(/#[\d:]+$/, '')] = [e?.type, (e?.variantOptions ?? []).join(', '), typeof e?.defaultValue === 'object' ? null : e?.defaultValue].filter((x) => x != null && x !== '').join(' · ');
  for (const [mode, map] of Object.entries(vars ?? {})) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || /^(modeVariants|aliases|breakpoints|strings|booleans|animation|primitives|_)/.test(mode)) continue;
    for (const [k, val] of Object.entries(map)) if (k.startsWith(name + '/') && (typeof val === 'string' || typeof val === 'number')) v[`${k} ${mode}`] = String(val);
  }
  return { props: p, vars: v, known: !!props?.[name] };
}
export function figmaDiff(a, b, { most = 4 } = {}) {
  const out = [];
  if (!a.known && b.known) return ['read from Figma for the first time'];
  // A property only written another way (show-icon → Show Icon) is renamed, not removed and added.
  const key = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const gone = Object.keys(a.props).filter((k) => !(k in b.props)), added = Object.keys(b.props).filter((k) => !(k in a.props));
  const renamed = new Map(gone.map((k) => [k, added.find((n) => key(n) === key(k))]).filter(([, n]) => n));
  for (const [k, n] of renamed) out.push(`property ${k} renamed ${n}`);
  for (const [k, v] of Object.entries(b.props)) { if (!(k in a.props)) { if (![...renamed.values()].includes(k)) out.push(`property ${k} added`); } else if (a.props[k] !== v) out.push(`property ${k} ${a.props[k]} → ${v}`); }
  for (const k of gone) if (!renamed.has(k)) out.push(`property ${k} removed`);
  for (const [k, v] of Object.entries(b.vars)) { if (!(k in a.vars)) out.push(`${k} ${v} added`); else if (a.vars[k] !== v) out.push(`${k} ${a.vars[k]} → ${v}`); }
  for (const k of Object.keys(a.vars)) if (!(k in b.vars)) out.push(`${k} removed`);
  return out.length > most ? [...out.slice(0, most), `and ${out.length - most} more`] : out;
}
// What a commit said of every component is kept per commit (FIGMA_GIT_HISTORY, in the engine's output folder): what a
// commit holds never changes, so each run reads with git show only the commits it has not read before. cache: false
// reads every one again and keeps nothing.
export const FIGMA_GIT_HISTORY = `${OUT_DIR}/figma-git-history.json`;
// What a read of the snapshots says of each component it has properties for, and of each name asked for.
const digestOf = (props, vars, names) => Object.fromEntries([...new Set([...Object.keys(props ?? {}).filter((n) => !n.startsWith('_')), ...names])].map((n) => [n, figmaOf(props, vars, n)]));
export function figmaChangelogs(ROOT, { props = null, vars = null } = {}, names = [], { max = 30, cache = true } = {}) {
  const files = [props, vars].filter(Boolean);
  if (!files.length || !names.length) return {};
  const commits = git(ROOT, ['log', `--max-count=${max}`, '--no-merges', `--format=%H%x1f%aI%x1f%s${WHO}`, '--', ...files]).split('\n').filter(Boolean).map((l) => { const [sha, date, subject, ...who] = l.split('\x1f'); return { sha, short: sha.slice(0, 7), date, subject, ...byOf(who) }; });
  if (!commits.length) return {};
  const key = JSON.stringify(files);
  const path = join(ROOT, FIGMA_GIT_HISTORY);
  let kept = null;
  if (cache) { try { kept = JSON.parse(readFileSync(path, 'utf8')); } catch { /* none yet */ } }
  const at = kept?.key === key && kept.at && typeof kept.at === 'object' ? kept.at : {};
  let read = 0;
  const show = (rev, f) => { if (!f) return null; try { return JSON.parse(git(ROOT, ['show', `${rev}:${f}`]) || 'null'); } catch { return null; } };
  // A revision's digest: kept, or read now (both snapshots as they were at it). A name asked for that a kept digest does
  // not hold (a component with no properties in Figma, asked for the first time) reads it again.
  const digest = (rev) => { if (!at[rev] || names.some((n) => !(n in at[rev]))) { at[rev] = digestOf(show(rev, props), show(rev, vars), names); read++; } return at[rev]; };
  const none = { props: {}, vars: {}, known: false };
  const out = {};
  for (const r of commits) {
    const before = digest(`${r.sha}^`), after = digest(r.sha);
    for (const n of names) {
      const changed = figmaDiff(before[n] ?? none, after[n] ?? none);
      if (changed.length) (out[n] ??= []).push({ ...r, changed });
    }
  }
  // Only the revisions the commits listed still need: one past them is dropped.
  if (cache && read) {
    const need = new Set(commits.flatMap((c) => [c.sha, `${c.sha}^`]));
    try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify({ key, at: Object.fromEntries(Object.entries(at).filter(([k]) => need.has(k))) })); } catch { /* not kept: read again next run */ }
  }
  const shas = [...new Set(Object.values(out).flat().map((r) => r.sha))];
  if (shas.length) {
    const tags = git(ROOT, ['name-rev', '--tags', '--refs=v[0-9]*', '--name-only', ...shas]).split('\n');
    const rel = Object.fromEntries(shas.map((s, i) => [s, /^(v[\d.]+[\w.-]*?)(?:[~^]\d*)*$/.exec(tags[i] ?? '')?.[1] ?? null]));
    const day = tagDates(ROOT);
    for (const list of Object.values(out)) for (const r of list) { r.release = rel[r.sha]; r.releasedAt = day[r.release] ?? null; }
  }
  return out;
}

// The day each version tag was made (an annotated tag's own date, else its commit's): { v1.2.0: '2026-02-10T…' }.
function tagDates(ROOT) {
  const out = {};
  for (const line of git(ROOT, ['for-each-ref', '--format=%(refname:short)%09%(creatordate:iso-strict)', 'refs/tags/v[0-9]*']).split('\n')) {
    const [name, date] = line.split('\t'); if (name && date) out[name] = date;
  }
  return out;
}

export function changelogs(ROOT, comps = [], { max = 100 } = {}) {
  const out = {};
  // Read from GitLab: every component's files asked for in one go, then each one's commits from the record.
  if (mirrorState(ROOT)) {
    ensureHistory(ROOT, { paths: comps.flatMap((c) => (c.files ?? []).map((path) => ({ path, ...(c.pattern ? { pattern: c.pattern } : {}) }))) });
    for (const c of comps) {
      const rows = c.files?.length ? commitsOf(ROOT, c.files, { pattern: c.pattern ?? null, max, ruleChanges }) : null;
      if (rows?.length) out[c.name] = rows;
    }
    return out;
  }
  for (const c of comps) {
    if (!c.files?.length) continue;
    let rows;
    if (c.ranges?.length) {
      const args = ['log', `--max-count=${max}`, '--no-merges', `--format=%x1e%H%x1f%aI%x1f%s${WHO}`, ...c.ranges.flatMap(([f, a, b]) => ['-L', `${a},${b}:${f}`])];
      rows = git(ROOT, args).split('\x1e').filter((x) => x.trim()).map((chunk) => {
        const [head, ...patch] = chunk.split('\n'); const [sha, date, subject, ...who] = head.split('\x1f');
        return { sha, short: sha.slice(0, 7), date, subject, ...byOf(who), changed: ruleChanges(patch) };
      });
    }
    if (!rows?.length) {
      const args = ['log', `--max-count=${max}`, '--no-merges', `--format=%H%x1f%aI%x1f%s${WHO}`, ...(c.pattern ? ['-G', c.pattern] : []), '--', ...c.files];
      rows = git(ROOT, args).split('\n').filter(Boolean).map((l) => { const [sha, date, subject, ...who] = l.split('\x1f'); return { sha, short: sha.slice(0, 7), date, subject, ...byOf(who) }; });
    }
    if (rows.length) out[c.name] = rows;
  }
  const shas = [...new Set(Object.values(out).flat().map((r) => r.sha))];
  if (!shas.length) return out;
  // The release each one shipped in: the nearest version tag that holds it (v2.0.1~3 → v2.0.1); none yet, none.
  const names = git(ROOT, ['name-rev', '--tags', '--refs=v[0-9]*', '--name-only', ...shas]).split('\n');
  const release = Object.fromEntries(shas.map((s, i) => [s, /^(v[\d.]+[\w.-]*?)(?:[~^]\d*)*$/.exec(names[i] ?? '')?.[1] ?? null]));
  // The pull request each one came in with: its own subject (#12), else the merge that brought it in.
  const pr = {};
  for (const line of git(ROOT, ['log', '--merges', '--format=%H%x1f%s', '-200']).split('\n').filter(Boolean)) {
    const [m, s] = line.split('\x1f'); const n = /#(\d+)/.exec(s)?.[1]; if (!n) continue;
    for (const sha of git(ROOT, ['rev-list', `${m}^1..${m}^2`]).split('\n').filter(Boolean)) pr[sha] ??= n;
  }
  const day = tagDates(ROOT);
  for (const list of Object.values(out)) for (const r of list) { r.release = release[r.sha]; r.releasedAt = day[r.release] ?? null; r.pr = /\(#(\d+)\)/.exec(r.subject)?.[1] ?? pr[r.sha] ?? null; }
  return out;
}
