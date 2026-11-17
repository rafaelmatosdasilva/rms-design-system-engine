// github-source.mjs - read the project straight from GitHub, as gitlab-source.mjs reads it from GitLab.
//
// `--project=https://github.com/<owner>/<repo>` (with or without .git, or /tree/<branch> for a branch other than the
// default one) keeps a local mirror of that branch's latest commit, through GitHub's REST API: no git, no clone, no
// SSH key. Every run asks for the branch's latest commit and fetches the archive again only when it has moved, so
// the engine always checks what is on GitHub now rather than whatever a clone happens to hold.
//
// This is the GitLab reader's twin and deliberately so: the same mirror folder, the same state file shape, the same
// rules about what is kept and what is removed, so a project moving between the two changes nothing about how the
// engine reads it. What differs is GitHub's own: a token header of `Authorization: Bearer`, a commit read from
// /repos/<owner>/<repo>/commits/<ref>, an archive from /tarball/<sha>, and an archive whose files all sit under one
// folder named for the repository and the commit - which `untar` already drops, as it does GitLab's, so the mirror
// holds the project itself and nothing here strips it a second time.
//
// Token: GITHUB_TOKEN (contents:read is enough), from the environment or a .env where the engine runs, never logged,
// and only ever sent to github.com or a host named in GITHUB_HOST (a GitHub Enterprise Server), so a mistyped or
// hostile link cannot receive it. A public repository needs no token.
//
// GitHub cannot be reached (offline, a VPN down, the rate limit): the mirror already there is used, and the run says
// which commit it is reading and that it was not checked this run - never a silent check of something older.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { untar, mirrorDir, envFrom, plainGet } from './gitlab-source.mjs';
import { said } from './host-refusals.mjs';

export const STATE_FILE = '.github-source.json';
const TIMEOUT_MS = 30000;
const hostsIn = (env) => String(env.GITHUB_HOST ?? '').split(',').map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()).filter(Boolean);
// The token goes to github.com and to a host the person named, and nowhere else.
export const tokenAllowedFor = (host, env = process.env) => new Set(['github.com', 'api.github.com', ...hostsIn(env)]).has(String(host).toLowerCase());

// A GitHub link → { origin, apiBase, host, path: '<owner>/<repo>', ref }. Anything that is not one → null, so the
// GitLab reader keeps every link that is its own.
export function parseGithubProject(input, env = process.env) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.host.toLowerCase();
  const known = host === 'github.com' || host === 'www.github.com' || hostsIn(env).includes(host);
  if (!known) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  if (parts.length < 2) return null;
  const owner = parts[0], repo = parts[1].replace(/\.git$/i, '');
  // /tree/<branch…> and /commits/<branch…> name a branch; a branch with slashes keeps them.
  const at = parts[2];
  const ref = ['tree', 'commits', 'blob'].includes(at) && parts.length > 3 ? parts.slice(3).join('/') : null;
  const enterprise = host !== 'github.com' && host !== 'www.github.com';
  return { origin: `${u.protocol}//${u.host}`, host, path: `${owner}/${repo}`, ref,
    apiBase: enterprise ? `${u.protocol}//${u.host}/api/v3` : 'https://api.github.com' };
}

function why(status, host) {
  return said('github', status, { detail: status === 404 ? `on ${host}; a private repository needs GITHUB_TOKEN with contents:read` : null });
}

// Bring the mirror up to the branch's latest commit. opts: { from, dir, env, fetchImpl, offline }.
// → { dir, path, ref, sha, title, committedAt, changed, stale?, warning?, error? }
export async function syncGithub(p, opts = {}) {
  const from = opts.from ?? process.cwd();
  const dir = opts.dir ?? mirrorDir(from, p, opts.env ?? process.env);
  const statePath = join(dir, STATE_FILE);
  let state = null; try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const env = { ...(opts.env ?? process.env) };
  const folders = [...new Set([from, dir, ...(state ? [dirname(resolve(dir))] : [])].map((d) => resolve(d)))];
  env.GITHUB_HOST = envFrom('GITHUB_HOST', env, folders) ?? env.GITHUB_HOST;
  const token = envFrom('GITHUB_TOKEN', env, folders) ?? env.GITHUB_TOKEN ?? '';
  const send = token && tokenAllowedFor(p.host, env);
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'rms-design-system-engine', ...(send ? { authorization: `Bearer ${token}` } : {}) };
  const fetchImpl = opts.fetchImpl ?? plainGet;
  const cached = (warning) => (state?.sha && existsSync(dir)
    ? { dir, path: p.path, ref: state.ref, sha: state.sha, title: state.title, committedAt: state.committedAt, changed: false, stale: true, warning }
    : { dir: null, path: p.path, error: warning });
  if (opts.offline) return cached('not checked against GitHub this run');
  const notSent = token && !send ? `; a GITHUB_TOKEN is set but not sent to ${p.host}: add GITHUB_HOST=${p.host} to .env to allow it` : '';
  const get = async (url) => {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    try { return await fetchImpl(url, { headers, signal }); } catch (e) { return { ok: false, status: 0, error: e }; }
  };
  const base = `${p.apiBase}/repos/${p.path}`;
  try {
    let ref = p.ref;
    if (!ref) {
      const r = await get(base);
      if (!r.ok) return cached(r.status ? why(r.status, p.host) + notSent : `could not reach ${p.host}`);
      ref = (await r.json())?.default_branch || 'main';
    }
    const c = await get(`${base}/commits/${encodeURIComponent(ref)}`);
    if (!c.ok) return cached(c.status ? why(c.status, p.host) + notSent : `could not reach ${p.host}`);
    const head = await c.json();
    const sha = String(head?.sha ?? '');
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) return cached('GitHub gave no commit for this branch');
    const title = String(head?.commit?.message ?? '').split('\n')[0];
    const info = { dir, path: p.path, ref, sha, title, committedAt: String(head?.commit?.committer?.date ?? '') };
    if (state?.sha === sha && existsSync(dir)) return { ...info, changed: false };
    const a = await get(`${base}/tarball/${encodeURIComponent(sha)}`);
    if (!a.ok) return cached(a.status ? why(a.status, p.host) + notSent : `could not reach ${p.host}`);
    // The project cannot write the mirror's own records: a .github-source.json committed upstream would otherwise
    // say which host the next run talks to.
    const files = untar(gunzipSync(Buffer.from(await a.arrayBuffer()))).filter((f) => f.path !== STATE_FILE && f.path !== '.gitlab-source.json');
    if (!files.length) return cached('the archive GitHub sent holds no files');
    const root = resolve(dir) + sep;
    mkdirSync(dir, { recursive: true });
    const now = new Set(files.map((f) => f.path));
    for (const old of state?.files ?? []) {                       // gone on GitHub: gone here (only files GitHub put here)
      if (now.has(old)) continue;
      const fp = resolve(dir, old);
      if (!fp.startsWith(root)) continue;
      try { rmSync(fp, { force: true }); } catch { /* leave it */ }
      let d = dirname(fp);
      while (d.startsWith(root) && d !== resolve(dir)) { try { if (readdirSync(d).length) break; rmdirSync(d); } catch { break; } d = dirname(d); }
    }
    for (const f of files) {
      const fp = resolve(dir, f.path);
      if (!fp.startsWith(root)) continue;
      mkdirSync(dirname(fp), { recursive: true });
      writeFileSync(fp, f.data);
    }
    writeFileSync(statePath, JSON.stringify({ source: `${p.origin}/${p.path}`, origin: p.origin, host: p.host, path: p.path,
      branch: p.ref, ref, sha, title, committedAt: info.committedAt, fetched: new Date().toISOString(), files: [...now] }, null, 2) + '\n');
    return { ...info, changed: true, previous: state?.sha ?? null };
  } catch (e) {
    return cached(`could not read ${p.host}: ${e.message}`);
  }
}

// What the run says about it: the commit checked, so a summary never leaves which one unsaid.
export function describe(r) {
  if (!r) return null;
  if (r.error) return `GitHub: ${r.error}`;
  const at = `${r.path}@${String(r.sha).slice(0, 7)}${r.ref ? ` (${r.ref})` : ''}`;
  if (r.stale) return `GitHub: ${at}, ${r.warning}`;
  return `GitHub: ${at}${r.changed ? ', fetched' : ', unchanged since the last run'}${r.title ? ` — ${r.title}` : ''}`;
}
