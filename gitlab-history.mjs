// gitlab-history.mjs - the history of a project read from GitLab. Its mirror (gitlab-source.mjs) holds the files
// of one commit and no .git, so what the engine reads from git history is read through the GitLab API instead, with
// the same read_api token: the commits that changed a file (each component's changelog, with the release it shipped
// in and its merge request), and the commit behind each line (the reason a line changed, when a component last
// changed). Only for the files a run asks about.
//
// Kept beside the mirror's own record (.gitlab-history.json), per commit: a file asked again at the same commit is
// never asked again; when the branch moves, GitLab's compare says which files moved and only those are asked again.
// What a commit changed (its diff), the release it shipped in and the day that release was tagged never change once
// known, and are kept as they are.
//
// Every reader is synchronous, as the git ones it stands in for: a reader that finds something missing runs this
// file once as a child process (`node gitlab-history.mjs '<request>'`), which fills the record, then reads it. A
// project that is not a GitLab mirror is never touched: its readers keep using git. The network goes through an
// injectable fetch for tests; the token goes only where gitlab-source.mjs would send it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STATE_FILE, plainGet, tokenFrom, hostEnvFrom, projectApi } from './gitlab-source.mjs';
import { tokenAllowedFor } from './gitlab-fetch.mjs';

export const HISTORY_FILE = '.gitlab-history.json';
const PER_PATH = 50;      // commits kept per file (one page)
const JOBS = 6;           // requests at once
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// The mirror's record when root is a GitLab mirror, else null (the project is read with git).
export function mirrorState(root) {
  const st = readJson(join(root, STATE_FILE));
  return st?.origin && st?.path && st?.sha ? st : null;
}
export const mirrorRepo = (root) => { const st = mirrorState(root); return st ? `${st.origin}/${st.path}` : null; };
export const mirrorHead = (root) => mirrorState(root)?.sha ?? null;
export const mirrorBranch = (root) => mirrorState(root)?.ref ?? null;

const empty = (sha) => ({ sha, blame: {}, commits: {}, info: {}, diffs: {}, refs: {}, tags: {}, tagList: null, tagsAt: null, ranges: {} });
export function readHistory(root) {
  const st = mirrorState(root);
  if (!st) return null;
  const h = readJson(join(root, HISTORY_FILE));
  return h && typeof h === 'object' ? { ...empty(h.sha), ...h } : empty(null);
}

// A file's path in the mirror, as GitLab names it ('src/theme.css').
const rel = (root, file) => relative(resolve(root), resolve(root, String(file))).split('\\').join('/');

// What a request still needs from GitLab: the files to blame and the files whose commits to list (with a pattern a
// changed line must hold, so their diffs are read). → null when the record already answers all of it.
export function missing(root, { blame = [], paths = [], releases = 0 } = {}, h = readHistory(root)) {
  const st = mirrorState(root);
  if (!st) return null;
  const fresh = h.sha === st.sha;
  const b = [...new Set(blame.map((f) => rel(root, f)))].filter((f) => !fresh || !(f in h.blame));
  const p = paths.map((x) => (typeof x === 'string' ? { path: x } : x)).map((x) => ({ ...x, path: rel(root, x.path) }))
    .filter((x) => !fresh || !(x.path in h.commits) || (x.pattern && (h.commits[x.path] ?? []).some((id) => !(h.diffs[id] && x.path in h.diffs[id])))
      // A commit whose release was not read (its request failed) is asked again, never left to read as unreleased.
      || (h.commits[x.path] ?? []).some((id) => !(id in h.refs)));
  // The project's last releases, each with every commit it holds: the tags read at this commit, and each range read.
  const r = releases > 0 && (h.tagsAt !== st.sha || releaseRanges(h, st.sha, releases).some(([key]) => !(key in h.ranges)));
  return b.length || p.length || r || undatedReleases(h).length || !fresh ? { blame: b, paths: p, releases } : null;
}

// The ranges a release log reads, newest first: [key, from, to, release]. The commits not released yet (from the newest
// version tag to the head) first, then each of the last n version tags from the one before it (v2.11.01..v2.12.00).
function releaseRanges(h, sha, n) {
  const tags = (h.tagList ?? []).map((t) => t.name).filter((x) => /^v\d/.test(x)).sort(byVersion);
  if (!tags.length) return [[`..${sha}`, null, sha, null]];
  const out = [[`${tags.at(-1)}..${sha}`, tags.at(-1), sha, null]];
  for (let i = tags.length - 1; i >= Math.max(0, tags.length - n); i--) out.push([`${tags[i - 1] ?? ''}..${tags[i]}`, tags[i - 1] ?? null, tags[i], tags[i]]);
  return out;
}

// The project's last releases, newest first, each with every commit it holds (merges left out), whatever files they
// changed: [{ release, releasedAt, commits: [{ sha, short, date, subject, author }] }]; release null for what is merged
// and not released yet. A commit is shown once, in the first release that holds it.
export function releaseLogOf(root, { releases = 10 } = {}) {
  const st = mirrorState(root);
  if (!st) return null;
  ensureHistory(root, { releases });
  const h = readHistory(root);
  if (h.tagsAt !== st.sha) return null;
  const seen = new Set(), out = [];
  for (const [key, , , release] of releaseRanges(h, st.sha, releases).reverse()) {
    const ids = (h.ranges[key] ?? []).filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    const commits = ids.map((id) => { const i = h.info[id] ?? {}; return { sha: id, short: id.slice(0, 7), date: i.time ?? null, subject: i.subject ?? '', author: i.author ?? null }; })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (commits.length || release) out.push({ release, releasedAt: release ? h.tags?.[release] ?? null : null, commits });
  }
  return out.reverse();
}

// The releases a commit shipped in whose tag day is not known yet.
const undatedReleases = (h) => [...new Set(Object.values(h.refs ?? {}).map((r) => r?.release).filter(Boolean))].filter((n) => !(n in (h.tags ?? {})));

// Fill the record for a request, through the GitLab API. opts: { fetchImpl, env, from }.
export async function fillHistory(root, req = {}, opts = {}) {
  const st = mirrorState(root);
  if (!st) return { skipped: 'not a GitLab mirror' };
  const env = { ...(opts.env ?? process.env) };
  const folders = [opts.from, root, dirname(resolve(root))].filter(Boolean);
  env.GITLAB_HOST = hostEnvFrom(env, folders);
  const token = tokenFrom(env, folders);
  const headers = token && tokenAllowedFor(st.host, env) ? { 'PRIVATE-TOKEN': token } : {};
  const fetchImpl = opts.fetchImpl ?? plainGet;
  // The project by its id, found from the link even when it moved or names the project.
  const { base } = await projectApi(st.origin, st.path, (u) => fetchImpl(u, { headers }));
  let asked = 0, failed = 0;
  const get = async (path) => {
    asked++;
    try {
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20000) : undefined;
      const r = await fetchImpl(`${base}${path}`, { headers, signal });
      if (r.status === 404) return { missing: true };
      if (!r.ok) { failed++; return null; }
      return { body: await r.json() };
    } catch { failed++; return null; }
  };
  const pool = async (items, fn) => { const q = [...items]; await Promise.all(Array.from({ length: Math.min(JOBS, q.length) }, async () => { while (q.length) await fn(q.shift()); })); };

  const h = readHistory(root);
  // The branch moved: keep what the files that did not move already had.
  if (h.sha && h.sha !== st.sha) {
    const c = await get(`/repository/compare?from=${encodeURIComponent(h.sha)}&to=${encodeURIComponent(st.sha)}&straight=true`);
    const moved = c?.body?.diffs ? new Set(c.body.diffs.flatMap((d) => [d.old_path, d.new_path])) : null;
    for (const key of ['blame', 'commits']) for (const f of Object.keys(h[key])) if (!moved || moved.has(f)) delete h[key][f];
    // A release can now hold a commit that had none.
    for (const [id, r] of Object.entries(h.refs)) if (!r?.release) delete h.refs[id];
  }
  h.sha = st.sha;
  const want = missing(root, req, h) ?? { blame: [], paths: [], releases: 0 };

  await pool(want.blame, async (f) => {
    const r = await get(`/repository/files/${encodeURIComponent(f)}/blame?ref=${encodeURIComponent(st.sha)}`);
    if (!r) return;                                           // not reachable now: asked again next time
    if (r.missing) { h.blame[f] = null; return; }           // not on GitLab (a file the engine wrote in the mirror)
    const ranges = [];
    let line = 1;
    for (const part of Array.isArray(r.body) ? r.body : []) {
      const c = part.commit ?? {};
      const n = (part.lines ?? []).length;
      if (c.id) { ranges.push([line, n, c.id]); h.info[c.id] ??= infoOf(c); }
      line += n;
    }
    h.blame[f] = ranges;
  });

  const paths = want.paths;
  await pool(paths.filter((x) => !(x.path in h.commits)), async (x) => {
    const r = await get(`/repository/commits?ref_name=${encodeURIComponent(st.sha)}&path=${encodeURIComponent(x.path)}&per_page=${PER_PATH}`);
    if (!r) return;
    if (r.missing) { h.commits[x.path] = null; return; }
    const list = (Array.isArray(r.body) ? r.body : []).filter((c) => (c.parent_ids ?? []).length < 2);   // no merges
    for (const c of list) h.info[c.id] ??= infoOf(c);
    h.commits[x.path] = list.map((c) => c.id);
  });
  // What each commit changed in a file asked with a pattern: its diff, kept for good.
  const diffOf = [...new Set(paths.filter((x) => x.pattern).flatMap((x) => (h.commits[x.path] ?? []).filter((id) => !(h.diffs[id] && x.path in h.diffs[id]))))];
  const tracked = new Set(paths.filter((x) => x.pattern).map((x) => x.path));
  await pool(diffOf, async (id) => {
    const keep = {};
    for (let page = 1; page <= 3; page++) {
      const r = await get(`/repository/commits/${id}/diff?per_page=100&page=${page}`);
      if (!r || r.missing) return;
      const list = Array.isArray(r.body) ? r.body : [];
      for (const d of list) if (tracked.has(d.new_path) || tracked.has(d.old_path)) keep[tracked.has(d.new_path) ? d.new_path : d.old_path] = String(d.diff ?? '');
      if (list.length < 100) break;
    }
    for (const p of tracked) keep[p] ??= '';
    h.diffs[id] = { ...(h.diffs[id] ?? {}), ...keep };
  });
  // The release each commit shipped in and its merge request, for the commits a changelog shows.
  const shown = [...new Set(paths.flatMap((x) => (h.commits[x.path] ?? [])))].filter((id) => !(id in h.refs));
  await pool(shown, async (id) => {
    const [t, m] = await Promise.all([get(`/repository/commits/${id}/refs?type=tag&per_page=100`), get(`/repository/commits/${id}/merge_requests`)]);
    if (!t || !m) return;
    const tags = (Array.isArray(t.body) ? t.body : []).map((x) => x.name).filter((n) => /^v\d/.test(n)).sort(byVersion);
    const mrs = Array.isArray(m.body) ? m.body : [];
    const mr = mrs.find((x) => x.state === 'merged') ?? mrs[0];
    h.refs[id] = { release: tags[0] ?? null, mr: mr?.iid != null ? String(mr.iid) : null };
  });
  // The day each of those releases was tagged (an annotated tag's own date, else its commit's), so a release is dated
  // when it came out, never by the newest commit it holds. A tag GitLab does not list is kept as unknown.
  const undated = undatedReleases(h);
  let tagsRead = true;
  for (let page = 1; undated.length && page <= 5; page++) {
    const r = await get(`/repository/tags?per_page=100&page=${page}`);
    if (!r) { tagsRead = false; break; }                       // not reachable now: asked again next time
    const list = r.missing ? [] : (Array.isArray(r.body) ? r.body : []);
    for (const t of list) if (t?.name) h.tags[t.name] = t.created_at ?? t.commit?.committed_date ?? t.commit?.created_at ?? null;
    if (list.length < 100 || undated.every((n) => n in h.tags)) break;
  }
  if (tagsRead) for (const n of undated) if (!(n in h.tags)) h.tags[n] = null;
  // A release log: every tag (its day kept too) once per commit of the branch, then each release's range not read yet.
  if (want.releases > 0) {
    if (h.tagsAt !== st.sha) {
      const list = [];
      let ok = true;
      for (let page = 1; page <= 5; page++) {
        const r = await get(`/repository/tags?per_page=100&page=${page}`);
        if (!r) { ok = false; break; }
        const got = r.missing ? [] : (Array.isArray(r.body) ? r.body : []);
        list.push(...got.filter((t) => t?.name).map((t) => ({ name: t.name, date: t.created_at ?? t.commit?.committed_date ?? t.commit?.created_at ?? null })));
        if (got.length < 100) break;
      }
      if (ok) { h.tagList = list; h.tagsAt = st.sha; for (const t of list) h.tags[t.name] = t.date; }
    }
    if (h.tagsAt === st.sha) {
      await pool(releaseRanges(h, st.sha, want.releases).filter(([key]) => !(key in h.ranges)), async ([key, from, to]) => {
        const r = from
          ? await get(`/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
          : await get(`/repository/commits?ref_name=${encodeURIComponent(to)}&per_page=100`);
        if (!r) return;
        const list = (r.missing ? [] : (from ? r.body?.commits : r.body)) ?? [];
        const own = (Array.isArray(list) ? list : []).filter((c) => (c.parent_ids ?? []).length < 2);   // no merges
        for (const c of own) h.info[c.id] ??= infoOf(c);
        h.ranges[key] = own.map((c) => c.id);
      });
    }
  }
  writeFileSync(join(root, HISTORY_FILE), JSON.stringify(h) + '\n');
  return { asked, failed };
}

const infoOf = (c) => ({ author: c.author_name ?? null, time: c.authored_date ?? c.committed_date ?? null, subject: String(c.title ?? c.message ?? '').split('\n')[0] });
// v1.2.0 before v1.10.0 before v2.0.0.
function byVersion(a, b) {
  const n = (v) => String(v).replace(/^v/, '').split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const x = n(a), y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return -1; if (y[i] === undefined) return 1;
    if (typeof x[i] === 'number' && typeof y[i] === 'number') return x[i] - y[i];
    return String(x[i]) < String(y[i]) ? -1 : 1;
  }
  return 0;
}

// Fill what a request still needs, synchronously: this file run once as a child process. Never throws.
export function ensureHistory(root, req = {}, { from } = {}) {
  if (!missing(root, req)) return;
  try {
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), JSON.stringify({ ...req, from })], { cwd: root, stdio: 'ignore', timeout: 180000 });
  } catch { /* history is a convenience: the run goes on without it */ }
}

// The commit behind each line of a file: Map(line → { hash, author, date, time, subject }), { uncommitted } for a file
// GitLab does not have (the engine's own files in the mirror), null when it could not be read.
export function blameOf(root, file) {
  if (!mirrorState(root)) return undefined;
  const f = rel(root, file);
  ensureHistory(root, { blame: [f] });
  const h = readHistory(root);
  if (!(f in h.blame)) return null;
  const ranges = h.blame[f];
  if (ranges === null) return { uncommitted: true };
  const by = new Map();
  for (const [start, n, id] of ranges) {
    const i = h.info[id] ?? {};
    const r = { hash: id.slice(0, 7), author: i.author, date: String(i.time ?? '').slice(0, 10), time: i.time ? new Date(i.time).toISOString() : null, subject: i.subject };
    for (let k = 0; k < n; k++) by.set(start + k, r);
  }
  return by;
}

// The commits that changed a component's files, newest first, as component-changelog.mjs's git reader gives them:
// [{ sha, short, date, subject, release, releasedAt, pr, changed? }], releasedAt the day its release was tagged. With a
// pattern, only commits that changed a rule holding it, each with what it changed in those rules.
export function commitsOf(root, files = [], { pattern = null, max = 100, ruleChanges = null } = {}) {
  if (!mirrorState(root) || !files.length) return null;
  const paths = files.map((f) => ({ path: rel(root, f), ...(pattern ? { pattern } : {}) }));
  ensureHistory(root, { paths });
  const h = readHistory(root);
  const re = pattern ? new RegExp(pattern) : null;
  const rows = new Map();
  for (const { path } of paths) {
    for (const id of h.commits[path] ?? []) {
      let changed;
      if (re) {
        const diff = h.diffs[id]?.[path];
        if (diff == null) continue;
        // A hunk that holds the rule (its selector, in a changed line or in the lines around it) and changes a line:
        // git log -L follows the rule's own lines; a diff shows three lines around a change, so a change further
        // below a long rule's selector is not seen here.
        const hunks = String(diff).split(/^(?=@@)/m).filter((hk) => {
          const lines = hk.split('\n').filter((l) => !/^(@@|\+\+\+|---)/.test(l));
          return lines.some((l) => /^[+-]/.test(l)) && lines.some((l) => re.test(l.slice(1)));
        });
        if (!hunks.length) continue;
        changed = ruleChanges ? ruleChanges(hunks.join('\n').split('\n')) : undefined;
      }
      if (rows.has(id)) continue;
      const i = h.info[id] ?? {};
      rows.set(id, { sha: id, short: id.slice(0, 7), date: i.time ?? null, subject: i.subject ?? '', release: h.refs[id]?.release ?? null, releasedAt: h.tags?.[h.refs[id]?.release] ?? null, pr: h.refs[id]?.mr ?? null, ...(changed ? { changed } : {}) });
    }
  }
  return [...rows.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, max);
}

// Run as a child process: fill the record for the request given, in the mirror it runs in.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let req = {};
  try { req = JSON.parse(process.argv[2] ?? '{}'); } catch { /* an empty request */ }
  await fillHistory(process.cwd(), req, { from: req.from });
}
