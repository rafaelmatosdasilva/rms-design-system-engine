// doc-host.mjs - where a team's written documentation lives, read the same way wherever that is: a GitLab project, a
// GitHub repository, or a folder in the project. The intent layer (doc-source-dsds.mjs) asks one of these for the
// latest commit, the files under one folder, which files a new commit changed and when a file last changed, and knows
// nothing of the host.
//
// layerHost(ROOT, c, { env, fetchImpl }) → { kind, url, web, error? , head(), files(folder), changed(from, to),
// lastChange(path, sha), notSent }. c: the layer's config (intentLayerConfig): { host, url, folder? }.
//   head()             → { ref, sha, committedAt, digest? } | { error }
//   files(folder, also) → { files: [{ path, data }], paths: [every path under folder], note? } | { error }
//                        Only the text files a source reads carry data (JSON, Markdown, MDX); every path is listed so
//                        a page can find the code file beside it.
//   changed(from, to)  → { changed: [path], removed: [path], by? } | null (not known: every file is dated again);
//                        by: who made the commits between the two (who-did-it.mjs), oldest first
//   commits(from, to)  → [{ sha, at, says, by?, files: [path] }] oldest first, one per commit between the two, merges left out
//                        (a merge repeats what its branch's commits did) | null (not known)
//   lastChange(path, sha) → an ISO date | null
//
// READ-ONLY everywhere: every call is a GET (GitLab, GitHub) or a read of the folder. The token of each host goes only
// to that host: GITLAB_TOKEN to gitlab.com or a host named in GITLAB_HOST (gitlab-source.mjs), GITHUB_TOKEN (or
// GH_TOKEN) to api.github.com and raw.githubusercontent.com. Both from the environment or the project's .env.
// DEGRADE-SAFE: a failure is { error } in plain words; nothing throws.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parseGitlabProject, tokenFrom, writeTokenFrom, hostEnvFrom, envFrom, untar, plainGet, STATE_FILE, projectApi } from './gitlab-source.mjs';
import { doneBy, doneByAll, runFromTrailer } from './who-did-it.mjs';

// Who made the commit the layer is read at, and who brought it in (who-did-it.mjs): its row on History names them.
const whoOf = (author, committer, message) => { const by = doneBy({ author, committer, run: runFromTrailer(/^Run-by:\s*(\S+)/mi.exec(String(message ?? ''))?.[1]) }); return by ? { by } : {}; };
// The commits a compare gave, as [author, committer, message] each: every person once.
// The most commits of one read told apart, each with its own files (one request each): the newest.
const COMMITS_MAX = 50;
const firstLine = (m) => String(m ?? '').split('\n')[0].trim();
const whoOfAll = (commits) => { const by = doneByAll(commits.map(([a, c, m]) => whoOf(a, c, m).by)); return by ? { by } : {}; };
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { normalizeRepo } from './component-changelog.mjs';
import { notionHost, confluenceHost } from './doc-tools.mjs';
import { OUT_DIR } from './names.mjs';

const TIMEOUT_MS = Math.max(1000, parseInt(process.env.GITLAB_FETCH_TIMEOUT_MS, 10) || 30000);
// The files a source reads the text of; every other path is only listed.
export const TEXT_FILE = /\.(json|md|mdx|markdown)$/i;
// Folders never read: what a build, a package manager or git writes.
const SKIP_DIR = /^(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.cache|storybook-static|\.design-system-engine-out)$/;
const MAX_FILES = 5000, MAX_READ = 2000, MAX_BYTES = 1024 * 1024;

// ── Which host a place is ───────────────────────────────────────────────────────────────────────────────────────────
// A link on github.com, or on a GitHub Enterprise host named in GITHUB_HOST, is GitHub; a Notion or Confluence link is
// that tool's (doc-tools.mjs); any other link is a GitLab project (on any host, as the intent layer always was); a path
// is a folder in the project.
const enterprise = (env = process.env) => String(env.GITHUB_HOST ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
export const isGithub = (url, env = process.env) => { try { const h = new URL(url).host.toLowerCase(); return /^(www\.)?github\.com$/.test(h) || enterprise(env).includes(h); } catch { return false; } };
export const isLink = (s) => /^https?:\/\//i.test(String(s ?? '').trim());
// https://<github.com or an enterprise host>/<owner>/<repo>[/tree/<ref>[/<path>]] → { owner, repo, ref, path, url, host,
// api, raw } | null. raw: where a file's text is read (raw.githubusercontent.com; an enterprise host's own API).
// any: a link named as GitHub's (intentLayer.github), on whatever host.
export function parseGithub(link, { any = false } = {}) {
  const m = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/([^?#]*))?)?\/?(?:[?#].*)?$/i.exec(String(link ?? '').trim());
  if (!m) return null;
  const host = m[1].toLowerCase().replace(/^www\./, ''), dotcom = host === 'github.com';
  if (!dotcom && !any && !/\bgithub\b|^ghe\.|\.ghe\./.test(host) && !enterprise().includes(host)) return null;
  return { owner: m[2], repo: m[3], ref: m[4] ? decodeURIComponent(m[4]) : null, path: m[5] ? decodeURIComponent(m[5]).replace(/\/+$/, '') : null, url: `https://${m[1]}/${m[2]}/${m[3]}`, host, api: dotcom ? 'https://api.github.com' : `https://${m[1]}/api/v3`, dotcom };
}
export function hostOf(s, env = process.env) {
  if (!isLink(s)) return 'folder';
  let h = ''; try { h = new URL(s).host.toLowerCase(); } catch { /* not a link */ }
  if (isGithub(s, env)) return 'github';
  if (/(^|\.)notion\.(so|site)$/.test(h)) return 'notion';
  if (/\.atlassian\.net$/.test(h) || /\/wiki\/spaces\/[^/]+\/pages\/\d+|\/pages\/viewpage\.action\?(?:[^#]*&)?pageId=\d+/.test(s)) return 'confluence';
  return 'gitlab';
}

// A link to one file of the layer, in its host's own form. src: the snapshot's _source.
export function fileUrl(src, file) {
  if (!src?.url || !file) return null;
  const path = `${src.prefix ?? ''}${file}`.split('/').map(encodeURIComponent).join('/');
  const ref = encodeURI(src.ref ?? 'HEAD');
  return (src.web ?? src.host) === 'github' ? `${src.url}/blob/${ref}/${path}` : `${src.url}/-/blob/${ref}/${path}`;
}

export function layerHost(ROOT, c, opts = {}) {
  if (c.host === 'github') return githubHost(ROOT, c, opts);
  if (c.host === 'folder') return folderHost(ROOT, c);
  if (c.host === 'notion') return notionHost(ROOT, c, opts);
  if (c.host === 'confluence') return confluenceHost(ROOT, c, opts);
  return gitlabHost(ROOT, c, opts);
}
// The documentation tools: read into Markdown pages, never written.
export const TOOLS = { notion: 'Notion', confluence: 'Confluence' };

const getter = (fetchImpl, headers, again = null) => async (url) => {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  try {
    const r = await fetchImpl(url, { method: 'GET', headers, signal });
    return (r.status === 401 || r.status === 403) && again ? await fetchImpl(url, { method: 'GET', headers: again, signal }) : r;
  } catch { return { ok: false, status: 0 }; }
};

// ── GitLab ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Through the REST API, no clone: the branch's latest commit, then one archive of the folder, read in memory.
function gitlabWhy(status, host) {
  if (status === 401) return 'GitLab did not accept the token (401): check GITLAB_TOKEN in .env, it may be wrong, expired or revoked';
  if (status === 403) return 'GitLab refused (403): the token needs the read_api scope and access to this project';
  if (status === 404) return `not found on ${host} (404): check the link, or the project is private and no token was sent (GITLAB_TOKEN in .env, and GITLAB_HOST=${host} for a company GitLab)`;
  return `GitLab answered ${status}`;
}
function gitlabHost(ROOT, c, { env: given, fetchImpl = plainGet } = {}) {
  const env = { ...(given ?? process.env) };
  // The .env where it runs, and, for a project that is a GitLab mirror (gitlab-source.mjs), the folder that holds it.
  const folders = [ROOT, ...(existsSync(join(ROOT, STATE_FILE)) ? [dirname(resolve(ROOT))] : [])];
  env.GITLAB_HOST = hostEnvFrom(env, folders);
  // A link set as the intent layer is a GitLab project by declaration, on any host; the token still goes only where
  // GITLAB_HOST allows.
  let host = ''; try { host = new URL(c.url).host; } catch { /* not a link */ }
  const p = parseGitlabProject(c.url, env) ?? (host ? parseGitlabProject(c.url, { ...env, GITLAB_HOST: [env.GITLAB_HOST, host].filter(Boolean).join(',') }) : null);
  if (!p) return { error: `${c.url} is not a GitLab project link` };
  const token = tokenFrom(env, folders);
  const headers = token && tokenAllowedFor(p.host, env) ? { 'PRIVATE-TOKEN': token } : {};
  const notSent = token && !headers['PRIVATE-TOKEN'] ? `; a GITLAB_TOKEN is set but not sent to ${p.host}: add GITLAB_HOST=${p.host} to .env` : '';
  // A read GITLAB_TOKEN refuses (revoked, expired) is asked again with the layer's own GITLAB_WRITE_TOKEN, which reads it.
  const write = writeTokenFrom(env, folders);
  const get = getter(fetchImpl, headers, write && write !== token && tokenAllowedFor(p.host, env) ? { 'PRIVATE-TOKEN': write } : null);
  const fail = (r) => ({ error: r.status ? gitlabWhy(r.status, p.host) + notSent : `could not reach ${p.host}` });
  let api = null;
  const base = async () => (api ??= await projectApi(p.origin, p.path, get));
  return {
    kind: 'gitlab', web: 'gitlab', url: `${p.origin}/${p.path}`, name: p.host,
    async head() {
      // The layer by its id, found from the link even when it moved or names the project.
      const { base: b, project } = await base();
      let ref = p.ref || project?.default_branch;
      if (!ref) { const r = await get(b); if (!r.ok) return fail(r); ref = (await r.json())?.default_branch || 'main'; }
      const cm = await get(`${b}/repository/commits/${encodeURIComponent(ref)}`);
      if (!cm.ok) return fail(cm);
      const h = await cm.json();
      const sha = String(h?.id ?? '');
      if (!/^[0-9a-f]{7,64}$/i.test(sha)) return { error: 'GitLab gave no commit for this branch' };
      return { ref, sha, committedAt: String(h.committed_date ?? ''), ...whoOf(h.author_name, h.committer_name, h.message) };
    },
    async files(folder, sha) {
      const { base: b } = await base();
      const a = await get(`${b}/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}${folder ? `&path=${encodeURIComponent(folder)}` : ''}`);
      if (!a.ok) return fail(a);
      const all = untar(gunzipSync(Buffer.from(await a.arrayBuffer())));
      return { files: all, paths: all.map((f) => f.path) };
    },
    async changed(from, to) {
      const { base: b } = await base();
      const r = await get(`${b}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!r.ok) return null;
      try { const j = await r.json(), d = j?.diffs ?? []; return { changed: d.filter((x) => x.new_path && !x.deleted_file).map((x) => x.new_path), removed: d.filter((x) => x.deleted_file).map((x) => x.old_path), ...whoOfAll((j?.commits ?? []).map((x) => [x.author_name, x.committer_name, x.message])) }; } catch { return null; }
    },
    async commits(from, to) {
      const { base: b } = await base();
      const r = await get(`${b}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!r.ok) return null;
      let list; try { list = ((await r.json())?.commits ?? []).filter((c) => (c.parent_ids ?? []).length < 2).slice(-COMMITS_MAX); } catch { return null; }
      const out = [];
      for (const c of list) {
        const files = [];
        for (let page = 1; page <= 10; page++) {
          const d = await get(`${b}/repository/commits/${encodeURIComponent(c.id)}/diff?per_page=100&page=${page}`);
          if (!d.ok) return null;
          let got; try { got = await d.json(); } catch { return null; }
          files.push(...got.map((x) => x.new_path || x.old_path).filter(Boolean));
          if (got.length < 100) break;
        }
        out.push({ sha: String(c.id), at: String(c.committed_date ?? c.authored_date ?? ''), says: firstLine(c.title ?? c.message), ...whoOf(c.author_name, c.committer_name, c.message), files: [...new Set(files)].sort() });
      }
      return out;
    },
    async lastChange(path, sha) {
      const { base: b } = await base();
      const r = await get(`${b}/repository/commits?ref_name=${encodeURIComponent(sha)}&path=${encodeURIComponent(path)}&per_page=1`);
      if (!r.ok) return null;
      try { const at = (await r.json())?.[0]?.committed_date; return at ? String(at) : null; } catch { return null; }
    },
  };
}

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Through the REST API, no clone: the branch's latest commit, its tree (one call, every path), then each text file
// under the folder from raw.githubusercontent.com. A public repository needs no token; GitHub allows 60 calls an hour
// without one, so the pages are dated only with GITHUB_TOKEN (or when there are few).
function githubWhy(status) {
  if (status === 401) return 'GitHub did not accept the token (401): check GITHUB_TOKEN in .env, it may be wrong, expired or revoked';
  if (status === 403 || status === 429) return `GitHub refused (${status}): its limit for requests without a token may be reached, or the token cannot read this repository; put a GITHUB_TOKEN that can read it in .env`;
  if (status === 404) return 'not found on GitHub (404): check the link, or the repository is private and no GITHUB_TOKEN was sent (put one that can read it in .env)';
  return `GitHub answered ${status}`;
}
function githubHost(ROOT, c, { env: given, fetchImpl = plainGet } = {}) {
  const env = given ?? process.env;
  const g = parseGithub(c.url, { any: true });
  if (!g) return { error: `${c.url} is not a GitHub repository link (https://github.com/<owner>/<repo>; a GitHub Enterprise host is named in GITHUB_HOST)` };
  const token = envFrom('GITHUB_TOKEN', env, [ROOT]) || envFrom('GH_TOKEN', env, [ROOT]);
  // GitHub's API answers nothing without a User-Agent.
  const headers = { 'User-Agent': 'rms-design-system-engine', Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const rawHeaders = { 'User-Agent': 'rms-design-system-engine', ...(g.dotcom ? {} : { Accept: 'application/vnd.github.raw' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = getter(fetchImpl, headers), raw = getter(fetchImpl, rawHeaders);
  const api = `${g.api}/repos/${g.owner}/${g.repo}`;
  // A file's text: from raw.githubusercontent.com, or an enterprise host's own API (its contents, asked for raw).
  const rawUrl = (sha, path) => g.dotcom ? `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}` : `${api}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`;
  const fail = (r) => ({ error: r.status ? githubWhy(r.status) : 'could not reach github.com' });
  let dated = 0;
  return {
    kind: 'github', web: 'github', url: g.url, name: g.host, path: g.path, hasToken: !!token,
    async head() {
      let ref = c.ref ?? g.ref;
      if (!ref) { const r = await get(api); if (!r.ok) return fail(r); ref = (await r.json())?.default_branch || 'main'; }
      const cm = await get(`${api}/commits/${encodeURIComponent(ref)}`);
      if (!cm.ok) return fail(cm);
      const h = await cm.json();
      const sha = String(h?.sha ?? '');
      if (!/^[0-9a-f]{7,64}$/i.test(sha)) return { error: 'GitHub gave no commit for this branch' };
      return { ref, sha, committedAt: String(h?.commit?.committer?.date ?? h?.commit?.author?.date ?? ''), ...whoOf(h?.commit?.author?.name, h?.commit?.committer?.name, h?.commit?.message) };
    },
    async files(folder, sha) {
      const t = await get(`${api}/git/trees/${encodeURIComponent(sha)}?recursive=1`);
      if (!t.ok) return fail(t);
      const tree = await t.json();
      const under = (p) => !folder || p === folder || p.startsWith(folder.replace(/\/?$/, '/'));
      const blobs = (tree?.tree ?? []).filter((x) => x?.type === 'blob' && under(x.path) && !x.path.split('/').some((s) => SKIP_DIR.test(s))).slice(0, MAX_FILES);
      const want = blobs.filter((x) => TEXT_FILE.test(x.path) && (x.size ?? 0) <= MAX_BYTES).slice(0, MAX_READ);
      const files = [];
      for (let i = 0; i < want.length; i += 8) {
        await Promise.all(want.slice(i, i + 8).map(async (x) => {
          const r = await raw(rawUrl(sha, x.path));
          if (r.ok) files.push({ path: x.path, data: Buffer.from(await r.arrayBuffer()) });
        }));
      }
      files.sort((a, b) => a.path.localeCompare(b.path));
      const note = tree?.truncated ? 'GitHub gave only part of this repository\'s tree; name the documentation\'s folder in the link (/tree/<branch>/<folder>) to read all of it' : null;
      return { files, paths: blobs.map((x) => x.path), ...(note ? { note } : {}) };
    },
    async changed(from, to) {
      const r = await get(`${api}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`);
      if (!r.ok) return null;
      try { const j = await r.json(), f = j?.files ?? []; return { changed: f.filter((x) => x.status !== 'removed').map((x) => x.filename), removed: f.filter((x) => x.status === 'removed').map((x) => x.filename), ...whoOfAll((j?.commits ?? []).map((x) => [x?.commit?.author?.name, x?.commit?.committer?.name, x?.commit?.message])) }; } catch { return null; }
    },
    async commits(from, to) {
      const r = await get(`${api}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`);
      if (!r.ok) return null;
      let list; try { list = ((await r.json())?.commits ?? []).filter((c) => (c.parents ?? []).length < 2).slice(-COMMITS_MAX); } catch { return null; }
      // Without a token, GitHub's 60 calls an hour go to the pages first: the commits are told apart only with one.
      if (!token && list.length > 5) return null;
      const out = [];
      for (const c of list) {
        const d = await get(`${api}/commits/${encodeURIComponent(c.sha)}`);
        if (!d.ok) return null;
        let got; try { got = await d.json(); } catch { return null; }
        out.push({ sha: String(c.sha), at: String(c?.commit?.committer?.date ?? c?.commit?.author?.date ?? ''), says: firstLine(c?.commit?.message), ...whoOf(c?.commit?.author?.name, c?.commit?.committer?.name, c?.commit?.message), files: [...new Set((got?.files ?? []).map((x) => x.filename))].sort() });
      }
      return out;
    },
    async lastChange(path, sha) {
      // Without a token, a few: the rest of the hour's 60 calls are the next run's.
      if (!token && ++dated > 20) return null;
      const r = await get(`${api}/commits?sha=${encodeURIComponent(sha)}&path=${encodeURIComponent(path)}&per_page=1`);
      if (!r.ok) return null;
      try { const at = (await r.json())?.[0]?.commit?.committer?.date; return at ? String(at) : null; } catch { return null; }
    },
  };
}

// ── A folder in the project ─────────────────────────────────────────────────────────────────────────────────────────
// Read as it is on disk, edits not yet committed included: its "commit" is a digest of what is there, so a run reads it
// again as soon as a page changes. Each page is dated by its last commit, or by when it was saved when it has changes
// git does not have yet. Its links go to the project's own repository when it has one (package.json, the origin remote).
const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); return r.status === 0 ? r.stdout.trim() : ''; };
function walk(dir, rel, out) {
  let names = []; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of names) {
    if (out.length >= MAX_FILES) return;
    if (d.name.startsWith('.') && d.name !== '.storybook') continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) { if (!SKIP_DIR.test(d.name)) walk(join(dir, d.name), r, out); }
    else if (d.isFile()) out.push(r);
  }
}
function folderHost(ROOT, c) {
  const dir = resolve(ROOT, c.folder ?? '.');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { error: `${c.folder} is not a folder in this project` };
  const rel = (p) => relative(resolve(ROOT), p).split(sep).join('/');
  const root = rel(dir) === '' ? '' : rel(dir);
  const listed = () => { const out = []; walk(dir, root, out); return out; };
  // The project's repository, for links: its path from the repository's root (prefix) and the branch checked out.
  let repo = null;
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? null;
  } catch { /* no package.json */ }
  repo ||= git(ROOT, ['remote', 'get-url', 'origin']) || null;
  const url = repo ? normalizeRepo(repo) : null;
  const prefix = git(ROOT, ['rev-parse', '--show-prefix']);
  const branch = git(ROOT, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return {
    kind: 'folder', web: url && isGithub(url) ? 'github' : url ? 'gitlab' : null, url, prefix, name: root || 'this folder', folder: root,
    async head() {
      const paths = listed();
      const h = createHash('sha1');
      for (const p of paths) { try { const s = statSync(join(resolve(ROOT), p)); h.update(`${p}\0${s.size}\0${s.mtimeMs}\n`); } catch { /* gone */ } }
      const digest = h.digest('hex');
      const sha = git(ROOT, ['rev-parse', 'HEAD']) || digest;
      return { ref: branch && branch !== 'HEAD' ? branch : 'HEAD', sha, committedAt: git(ROOT, ['log', '-1', '--format=%cI']) || '', digest, ...(() => { const [a, c, t] = (git(ROOT, ['log', '-1', '--format=%an%x1f%cn%x1f%(trailers:key=Run-by,valueonly)']) || '').split('\x1f'); return whoOf(a, c, t ? 'Run-by: ' + t : ''); })() };
    },
    async files() {
      const paths = listed();
      const files = [];
      for (const p of paths) {
        if (!TEXT_FILE.test(p) || files.length >= MAX_READ) continue;
        try { const abs = join(resolve(ROOT), p); if (statSync(abs).size <= MAX_BYTES) files.push({ path: p, data: readFileSync(abs) }); } catch { /* unreadable */ }
      }
      return { files, paths };
    },
    // Every file is dated again each read: git answers from disk.
    async changed() { return null; },
    async commits() { return null; },
    async lastChange(path) {
      const dirty = git(ROOT, ['status', '--porcelain', '--', path]);
      if (!dirty) { const at = git(ROOT, ['log', '-1', '--format=%cI', '--', path]); if (at) return at; }
      try { return new Date(statSync(join(resolve(ROOT), path)).mtimeMs).toISOString(); } catch { return null; }
    },
  };
}

// ── Writing to the layer where it lives (GitHub, a folder) ──────────────────────────────────────────────────────────
// The access the layer's changes take (intent-changes.mjs): its text files at the commit read, one commit straight on
// its branch (only while the branch is still at that commit), or a branch and a request for the team to review. A
// GitLab layer has its own (intent-changes.mjs → layerAccess); this one is GitHub's or a folder's.
//   files(sha)  → Map(path → text) of the layer's JSON and Markdown files
//   commit({ files, sha, target, message, created }) → { url, sha, said } | { error }
//   request({ files, sha, target, title, description, branch, message, created }) → { url, branch, said } | { error }
// files: Map(path → text, or null for a file taken out). said: what was done, in words.
// A folder is the project's own: its changes are written there, never committed, for a person to read and commit; a
// file changed on disk since the layer was read is not overwritten. GitHub: GITHUB_TOKEN (or GH_TOKEN) that may write
// to the repository (contents, and pull requests for a request), sent only to api.github.com.
export function layerWriter(ROOT, c, { env = process.env, fetchImpl = plainGet, sendImpl = null } = {}) {
  if (c.host === 'folder') return folderWriter(ROOT, c);
  if (c.host === 'github') return githubWriter(ROOT, c, { env, fetchImpl, sendImpl });
  if (TOOLS[c.host]) return toolWriter(ROOT, c, { env, fetchImpl, sendImpl });
  return { error: 'a GitLab layer is written through intent-changes.mjs → layerAccess' };
}
// A documentation tool is read, never written: its pages are given as the Markdown files they were read into, so the
// changes are made on them and listed (intent-changes/CHANGES.md, the Documentation page) for a person to make in the
// tool. Sending them is refused, in plain words.
export const toolRefusal = (host) => `the engine reads the layer from ${TOOLS[host]} but never writes there: each change is listed for a person to make in ${TOOLS[host]} (${OUT_DIR}/intent-changes/CHANGES.md, and the Documentation page)`;
function toolWriter(ROOT, c, { env, fetchImpl, sendImpl }) {
  const h = layerHost(ROOT, c, { env, fetchImpl, ...(sendImpl ? { sendImpl } : {}) });
  if (h.error) return h;
  const refuse = async () => ({ error: toolRefusal(c.host) });
  return {
    kind: c.host, writesWith: `nothing: ${TOOLS[c.host]} is only read`, readOnly: true,
    async files() {
      const got = await h.files();
      if (got.error) throw new Error(got.error);
      return new Map(got.files.map((f) => [f.path, f.data.toString('utf8')]));
    },
    commit: refuse,
    request: refuse,
  };
}
function folderWriter(ROOT, c) {
  const h = folderHost(ROOT, c);
  if (h.error) return h;
  const read = new Map();   // what each file held when read: a file changed since is not overwritten
  const write = async ({ files, created = new Set() }) => {
    const moved = [];
    for (const [f] of files) {
      const abs = resolve(ROOT, f);
      if (!abs.startsWith(resolve(ROOT) + sep)) return { error: `${f} is outside this project` };
      const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
      if (created.has(f) ? now !== null : read.has(f) && now !== read.get(f)) moved.push(f);
    }
    if (moved.length) return { error: `${moved.slice(0, 3).join(', ')}${moved.length > 3 ? ` and ${moved.length - 3} more` : ''} changed in the folder since the layer was read: run again, so the changes are made on what is there now` };
    const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
    for (const [f, t] of files) {
      const abs = resolve(ROOT, f);
      if (t === null) { rmSync(abs, { force: true }); continue; }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, t);
    }
    return { url: null, sha: null, said: `written in the folder ${h.folder || '.'} (${files.size} file${files.size === 1 ? '' : 's'}), not committed: read them and commit them yourself` };
  };
  return {
    kind: 'folder', writesWith: 'the project\'s own folder',
    async files() {
      const got = await h.files();
      const out = new Map();
      for (const f of got.files) { const t = f.data.toString('utf8'); out.set(f.path, t); read.set(f.path, t); }
      return out;
    },
    commit: write,
    // A folder has no review of its own: the changes are written the same way, for a person to read before committing.
    request: write,
  };
}
function githubWriter(ROOT, c, { env, fetchImpl, sendImpl }) {
  const g = parseGithub(c.url, { any: true });
  if (!g) return { error: `${c.url} is not a GitHub repository link` };
  const h = githubHost(ROOT, c, { env, fetchImpl });
  const token = envFrom('GITHUB_TOKEN', env, [ROOT]) || envFrom('GH_TOKEN', env, [ROOT]);
  const api = `${g.api}/repos/${g.owner}/${g.repo}`;
  const headers = { 'User-Agent': 'rms-design-system-engine', Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const send = async (method, path, body) => {
    const fn = sendImpl ?? (await import('./gitlab-source.mjs')).plainSend;
    try { return await fn(api + path, { method, headers, body }); } catch (e) { return { ok: false, status: 0, json: async () => ({ message: e.message }) }; }
  };
  const get = async (path) => { try { return await fetchImpl(api + path, { method: 'GET', headers }); } catch { return { ok: false, status: 0 }; } };
  const refused = (r, what) => (r.status === 401 ? `GitHub did not accept the token (401) for ${what}: check GITHUB_TOKEN in .env`
    : r.status === 403 || r.status === 404 ? `GitHub refused ${what} (${r.status}): the token in GITHUB_TOKEN needs to write to ${g.owner}/${g.repo} (contents${what.includes('pull request') ? ' and pull requests' : ''}), or the branch is protected`
      : r.status === 422 ? `GitHub could not do ${what} (422): the branch may already exist, or the branch moved` : r.status ? `GitHub answered ${r.status} to ${what}` : `could not reach GitHub for ${what}`);
  // One commit with every change on top of `parent`, and the branch moved to it (only forward, from `parent`).
  const commitOn = async (branch, parent, files, message, created) => {
    const pc = await get(`/git/commits/${parent}`);
    if (!pc.ok) return { error: refused(pc, 'reading the commit') };
    const baseTree = (await pc.json())?.tree?.sha;
    const tree = [...files].map(([path, content]) => (content === null ? { path, mode: '100644', type: 'blob', sha: null } : { path, mode: '100644', type: 'blob', content }));
    const t = await send('POST', '/git/trees', { base_tree: baseTree, tree });
    if (!t.ok) return { error: refused(t, 'the commit\'s files') };
    const cm = await send('POST', '/git/commits', { message, tree: (await t.json())?.sha, parents: [parent] });
    if (!cm.ok) return { error: refused(cm, 'the commit') };
    const sha = (await cm.json())?.sha;
    const ref = await send('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false });
    if (!ref.ok) return { error: refused(ref, `moving ${branch}`) };
    return { sha, url: `${g.url}/commit/${sha}` };
  };
  return {
    kind: 'github', writesWith: token ? 'GITHUB_TOKEN' : 'no token',
    async files(sha) {
      const got = await h.files(c.path ?? null, sha);
      if (got.error) throw new Error(got.error);
      return new Map(got.files.map((f) => [f.path, f.data.toString('utf8')]));
    },
    async commit({ files, sha, target, message, created = new Set() }) {
      if (!token) return { error: `no GITHUB_TOKEN in .env that may write to ${g.owner}/${g.repo}` };
      const r = await get(`/git/ref/heads/${encodeURIComponent(target)}`);
      if (!r.ok) return { error: refused(r, `reading ${target}`) };
      const head = String((await r.json())?.object?.sha ?? '');
      if (!head || !sha || (!head.startsWith(sha) && !sha.startsWith(head))) return { error: `${target} moved since the layer was read (now ${head.slice(0, 8)}): run again, so the changes are made on what is there now` };
      const done = await commitOn(target, head, files, message, created);
      return done.error ? done : { ...done, said: `committed on ${target}: ${done.url}` };
    },
    async request({ files, sha, target, title, description, branch, message, created = new Set() }) {
      if (!token) return { error: `no GITHUB_TOKEN in .env that may write to ${g.owner}/${g.repo}` };
      const b = await send('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
      if (!b.ok) return { error: refused(b, `making the branch ${branch}`) };
      const done = await commitOn(branch, sha, files, message, created);
      if (done.error) return { error: `${done.error} (the branch ${branch} was made; delete it before trying again)` };
      const pr = await send('POST', '/pulls', { title, head: branch, base: target, body: description });
      if (!pr.ok) return { error: `${refused(pr, 'the pull request')} (the branch ${branch} holds the changes)` };
      const url = (await pr.json())?.html_url ?? null;
      return { url, branch, said: `pull request ${url} (branch ${branch})` };
    },
  };
}
