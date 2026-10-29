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
//   changed(from, to)  → { changed: [path], removed: [path] } | null (not known: every file is dated again)
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
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { normalizeRepo } from './component-changelog.mjs';

const TIMEOUT_MS = Math.max(1000, parseInt(process.env.GITLAB_FETCH_TIMEOUT_MS, 10) || 30000);
// The files a source reads the text of; every other path is only listed.
export const TEXT_FILE = /\.(json|md|mdx|markdown)$/i;
// Folders never read: what a build, a package manager or git writes.
const SKIP_DIR = /^(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.cache|storybook-static|\.design-system-engine-out)$/;
const MAX_FILES = 5000, MAX_READ = 2000, MAX_BYTES = 1024 * 1024;

// ── Which host a place is ───────────────────────────────────────────────────────────────────────────────────────────
// A link on github.com is GitHub; any other link is a GitLab project (on any host, as the intent layer always was); a
// path is a folder in the project.
export const isGithub = (url) => { try { return /^(www\.)?github\.com$/i.test(new URL(url).host); } catch { return false; } };
export const isLink = (s) => /^https?:\/\//i.test(String(s ?? '').trim());
// https://github.com/<owner>/<repo>[/tree/<ref>[/<path>]] → { owner, repo, ref, path, url } | null
export function parseGithub(link) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/([^?#]*))?)?\/?(?:[?#].*)?$/i.exec(String(link ?? '').trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3] ? decodeURIComponent(m[3]) : null, path: m[4] ? decodeURIComponent(m[4]).replace(/\/+$/, '') : null, url: `https://github.com/${m[1]}/${m[2]}` };
}
export const hostOf = (s) => (!isLink(s) ? 'folder' : isGithub(s) ? 'github' : 'gitlab');

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
  return gitlabHost(ROOT, c, opts);
}

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
      return { ref, sha, committedAt: String(h.committed_date ?? '') };
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
      try { const d = (await r.json())?.diffs ?? []; return { changed: d.filter((x) => x.new_path && !x.deleted_file).map((x) => x.new_path), removed: d.filter((x) => x.deleted_file).map((x) => x.old_path) }; } catch { return null; }
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
  if (status === 404) return 'not found on github.com (404): check the link, or the repository is private and no GITHUB_TOKEN was sent (put one that can read it in .env)';
  return `GitHub answered ${status}`;
}
function githubHost(ROOT, c, { env: given, fetchImpl = plainGet } = {}) {
  const env = given ?? process.env;
  const g = parseGithub(c.url);
  if (!g) return { error: `${c.url} is not a GitHub repository link (https://github.com/<owner>/<repo>)` };
  const token = envFrom('GITHUB_TOKEN', env, [ROOT]) || envFrom('GH_TOKEN', env, [ROOT]);
  // GitHub's API answers nothing without a User-Agent.
  const headers = { 'User-Agent': 'rms-design-system-engine', Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const rawHeaders = { 'User-Agent': 'rms-design-system-engine', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = getter(fetchImpl, headers), raw = getter(fetchImpl, rawHeaders);
  const api = `https://api.github.com/repos/${g.owner}/${g.repo}`;
  const fail = (r) => ({ error: r.status ? githubWhy(r.status) : 'could not reach github.com' });
  let dated = 0;
  return {
    kind: 'github', web: 'github', url: g.url, name: 'github.com', path: g.path, hasToken: !!token,
    async head() {
      let ref = c.ref ?? g.ref;
      if (!ref) { const r = await get(api); if (!r.ok) return fail(r); ref = (await r.json())?.default_branch || 'main'; }
      const cm = await get(`${api}/commits/${encodeURIComponent(ref)}`);
      if (!cm.ok) return fail(cm);
      const h = await cm.json();
      const sha = String(h?.sha ?? '');
      if (!/^[0-9a-f]{7,64}$/i.test(sha)) return { error: 'GitHub gave no commit for this branch' };
      return { ref, sha, committedAt: String(h?.commit?.committer?.date ?? h?.commit?.author?.date ?? '') };
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
          const r = await raw(`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${sha}/${x.path.split('/').map(encodeURIComponent).join('/')}`);
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
      try { const f = (await r.json())?.files ?? []; return { changed: f.filter((x) => x.status !== 'removed').map((x) => x.filename), removed: f.filter((x) => x.status === 'removed').map((x) => x.filename) }; } catch { return null; }
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
      return { ref: branch && branch !== 'HEAD' ? branch : 'HEAD', sha, committedAt: git(ROOT, ['log', '-1', '--format=%cI']) || '', digest };
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
    async lastChange(path) {
      const dirty = git(ROOT, ['status', '--porcelain', '--', path]);
      if (!dirty) { const at = git(ROOT, ['log', '-1', '--format=%cI', '--', path]); if (at) return at; }
      try { return new Date(statSync(join(resolve(ROOT), path)).mtimeMs).toISOString(); } catch { return null; }
    },
  };
}
