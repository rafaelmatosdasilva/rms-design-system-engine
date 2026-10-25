// gitlab-source.mjs - read the project straight from GitLab, on gitlab.com or any company-hosted GitLab.
//
// `--project=https://<host>/<group>/<project>` (with or without .git, or /-/tree/<branch> for a branch other than
// the default one) keeps a local mirror of the branch's latest commit beside where the engine runs, through the
// GitLab REST API: no git, no clone, no SSH key. Every run asks GitLab for the branch's latest commit and fetches
// the archive again only when it has moved, so the engine always checks what is on GitLab now. Files the engine
// writes in the mirror (ds-config.json, snapshots, its output) are kept across refreshes; a file removed on GitLab
// is removed from the mirror.
//
// Token: GITLAB_TOKEN (read_api is enough), from the environment or a .env where the engine runs (else in the
// mirror, else, for a run inside the mirror, in the folder that holds it), never logged. It is only ever sent to gitlab.com or a host named in GITLAB_HOST (gitlab-fetch.mjs's rule),
// so a mistyped or hostile link cannot receive it. A public project needs no token.
//
// GitLab cannot be reached (offline, VPN down): the mirror already there is used, and the run says from which
// commit. The pure parts are exported for tests; network goes through an injectable fetch.

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, rmdirSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { gunzipSync } from 'zlib';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { tokenAllowedFor } from './gitlab-fetch.mjs';

export const STATE_FILE = '.gitlab-source.json';
const TIMEOUT_MS = Math.max(1000, parseInt(process.env.GITLAB_FETCH_TIMEOUT_MS, 10) || 30000);

const hostsIn = (env) => String(env.GITLAB_HOST ?? '').split(',').map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()).filter(Boolean);

// Is this link a GitLab project? gitlab.com, a host named in GITLAB_HOST, a host called gitlab.<something>, or a
// link carrying GitLab's own "/-/" segment. → { origin, host, path, ref } (ref null = the default branch), else null.
// A GitHub link, an SSH link or anything else stays with the plain git clone.
export function parseGitlabProject(input, env = process.env) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.host.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const dash = parts.indexOf('-');
  const before = (dash >= 0 ? parts.slice(0, dash) : parts);
  if (before.length) before[before.length - 1] = before[before.length - 1].replace(/\.git$/i, '');
  const looksGitlab = host === 'gitlab.com' || hostsIn(env).includes(host) || /^gitlab\./.test(host) || dash >= 0;
  if (!looksGitlab || before.length < 2 || host === 'github.com') return null;
  let ref = null;
  if (dash >= 0 && ['tree', 'commits'].includes(parts[dash + 1]) && parts.length > dash + 2) ref = parts.slice(dash + 2).join('/');
  return { origin: `${u.protocol}//${u.host}`, host, path: before.join('/'), ref };
}

// The folder the mirror lives in: beside where the engine runs, named for the project.
export const mirrorDir = (from, p) => join(from, p.path.split('/').pop().replace(/[^\w.-]/g, '') || 'project');

// A .env value: a quoted one up to its closing quote, else up to an inline " #" comment.
function envValue(raw) {
  const v = String(raw).trim(); const q = v[0];
  if (q === '"' || q === "'") { const end = v.indexOf(q, 1); return end > 0 ? v.slice(1, end) : v.slice(1); }
  const h = v.indexOf(' #'); return (h >= 0 ? v.slice(0, h) : v).trim();
}

// GITLAB_TOKEN from the environment, else from a .env in one of the folders given (first that has it).
export function tokenFrom(env, folders = []) {
  if (env.GITLAB_TOKEN) return env.GITLAB_TOKEN;
  for (const d of folders) {
    let text; try { text = readFileSync(join(d, '.env'), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*GITLAB_TOKEN\s*=\s*(.*)$/);
      if (!m) continue;
      const v = envValue(m[1]);
      if (v) return v;
    }
  }
  return '';
}

// GITLAB_WRITE_TOKEN from the environment, else from a .env in one of the folders: a token that writes only where it is
// meant to (a project's own), which also reads that project when GITLAB_TOKEN is refused.
export function writeTokenFrom(env, folders = []) {
  if (env.GITLAB_WRITE_TOKEN) return env.GITLAB_WRITE_TOKEN;
  for (const d of folders) {
    let text; try { text = readFileSync(join(d, '.env'), 'utf8'); } catch { continue; }
    const m = text.match(/^\s*GITLAB_WRITE_TOKEN\s*=(.*)$/m);
    if (m && envValue(m[1])) return envValue(m[1]);
  }
  return '';
}

// Any variable from the environment, else from a .env in one of the folders: a store's own token (stores.mjs), named in
// its place's tokenEnv. Only names made of capitals, digits and _ are read.
export function envFrom(name, env, folders = []) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(String(name ?? ''))) return '';
  if (env[name]) return env[name];
  for (const d of folders) {
    let text; try { text = readFileSync(join(d, '.env'), 'utf8'); } catch { continue; }
    const m = text.match(new RegExp(`^\\s*${name}\\s*=(.*)$`, 'm'));
    if (m && envValue(m[1])) return envValue(m[1]);
  }
  return '';
}

// GITLAB_HOST from the environment, else from a .env in one of the folders (so a project's .env can name its host).
export function hostEnvFrom(env, folders = []) {
  if (env.GITLAB_HOST) return env.GITLAB_HOST;
  for (const d of folders) {
    let text; try { text = readFileSync(join(d, '.env'), 'utf8'); } catch { continue; }
    const m = text.match(/^\s*GITLAB_HOST\s*=(.*)$/m);
    if (m && envValue(m[1])) return envValue(m[1]);
  }
  return '';
}

// A tar archive (already gunzipped) → [{ path, data }] for its regular files, the archive's top folder dropped.
// Long names (pax "path", GNU "L") are honoured; links, devices and anything that would land outside are skipped.
export function untar(buf) {
  const out = [];
  let off = 0, longName = null, paxPath = null;
  const str = (b) => { const z = b.indexOf(0); return b.subarray(0, z < 0 ? b.length : z).toString('utf8'); };
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { const m = data.toString('utf8').match(/\d+ path=([^\n]*)\n/); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = str(data); continue; }
    const prefix = str(h.subarray(345, 500));
    let name = paxPath ?? longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)));
    paxPath = null; longName = null;
    if (type !== '0' && type !== '\0' && type !== '7') continue;          // a regular file only
    const rel = name.split('/').slice(1).join('/');                         // drop "<project>-<ref>-<sha>/"
    if (!rel || rel.split('/').some((s) => s === '..' || s === '') || rel.startsWith('/')) continue;
    out.push({ path: rel, data: Buffer.from(data) });
  }
  return out;
}

// A plain GET with Node's own http(s), the mirror's default. Node's fetch always sends the browser header
// Sec-Fetch-Mode: cors, and GitLab answers 406 to an archive download that carries it (the project and commit calls
// pass, so the run fails only at the download). Follows up to 5 redirects; the token goes no further than the host
// it was meant for. → { ok, status, json(), arrayBuffer() }, the part of a fetch Response the mirror reads.
// A project as GitLab knows it now, from a link that may be old or loose: the project moved or was renamed (GitLab
// answers the old path with the project, by its id), or the link names it by its name instead of its path (the one
// project of that name in that group). Every call after it goes to the project by its id, which a move never changes.
// get(url) → a response, with the token. → { base, path, how: 'same' | 'moved' | 'name', project: GitLab's answer
// (its default_branch, so the caller asks no second time) | null }; said once a run when the link is not the
// project's path (projectNote).
const PROJECTS = new Map();
export async function projectApi(origin, path, get) {
  const key = `${origin}|${path}`;
  if (PROJECTS.has(key)) return PROJECTS.get(key);
  const byPath = `${origin}/api/v4/projects/${encodeURIComponent(path)}`;
  let out = { base: byPath, path, how: 'same', project: null };
  try {
    const r = await get(byPath);
    if (r?.ok) {
      const j = await r.json();
      out.project = j ?? null;
      if (j?.id) out = { base: `${origin}/api/v4/projects/${j.id}`, path: j.path_with_namespace || path, how: j.path_with_namespace && j.path_with_namespace.toLowerCase() !== path.toLowerCase() ? 'moved' : 'same', project: j };
    } else if (r?.status === 404) {
      const parts = path.split('/'), leaf = parts.pop(), group = parts.join('/').toLowerCase();
      const s = await get(`${origin}/api/v4/projects?search=${encodeURIComponent(leaf)}&simple=true&per_page=100`);
      if (s?.ok) {
        const n = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const hit = (await s.json() ?? []).filter((x) => String(x.path_with_namespace ?? '').split('/').slice(0, -1).join('/').toLowerCase() === group && (n(x.name) === n(leaf) || n(x.path) === n(leaf)));
        if (hit.length === 1) out = { base: `${origin}/api/v4/projects/${hit[0].id}`, path: hit[0].path_with_namespace, how: 'name', project: null };
      }
    }
  } catch { /* the link as given */ }
  PROJECTS.set(key, out);
  if (out.how !== 'same') console.log(`ℹ️  ${projectNote(`${origin}/${path}`, out)}`);
  return out;
}
export function projectNote(given, r) {
  return r.how === 'moved' ? `${given} has moved: GitLab has it at ${r.path} now, which the engine uses. Change the link to it where it is written (ds-config.json, the profile).`
    : r.how === 'name' ? `${given} names the project by its name: its path in GitLab is ${r.path}, which the engine uses. Change the link to it where it is written (ds-config.json, the profile).` : '';
}

export function plainGet(url, { headers = {}, signal } = {}, hops = 5) {
  return new Promise((ok, fail) => {
    const u = new URL(url);
    // A connection of its own each time (agent: false): one kept alive from before a long wait (drafting blocks for
    // minutes) is closed by then, and writing into it fails with EPIPE.
    const req = (u.protocol === 'http:' ? httpRequest : httpsRequest)(u, { method: 'GET', headers, signal, agent: false }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && hops > 0) {
        res.resume();
        const next = new URL(res.headers.location, u);
        const keep = next.host === u.host ? headers : Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'private-token'));
        ok(plainGet(next.href, { headers: keep, signal }, hops - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', fail);
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        ok({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body.toString('utf8')), arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
      });
    });
    req.on('error', fail);
    req.end();
  });
}

// A request that changes something (POST, PUT), with a JSON body, through Node's own http(s) as plainGet: no
// redirect is followed, so the token goes nowhere but the host. → { ok, status, json() }
export function plainSend(url, { method = 'POST', headers = {}, body = null } = {}) {
  return new Promise((ok, fail) => {
    const u = new URL(url);
    const data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = (u.protocol === 'http:' ? httpRequest : httpsRequest)(u, { method, agent: false, headers: { ...headers, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', fail);
      res.on('end', () => { const b = Buffer.concat(chunks).toString('utf8'); ok({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode ?? 0, json: async () => JSON.parse(b || 'null') }); });
    });
    req.on('error', fail);
    if (data) req.write(data);
    req.end();
  });
}

// What a failed response means, in words the person can act on (never the token).
function why(status, host) {
  if (status === 401) return 'GitLab did not accept the token (401): check GITLAB_TOKEN - wrong, expired or revoked';
  if (status === 403) return 'GitLab refused (403): the token needs the read_api scope and access to this project';
  if (status === 404) return `not found on ${host} (404): check the link, or the project is private and no token was sent (set GITLAB_TOKEN, and GITLAB_HOST=${host} for a company GitLab)`;
  return `GitLab answered ${status}`;
}

// Bring the mirror up to the branch's latest commit. opts: { from, env, fetchImpl, offline }.
// → { dir, path, ref, sha, title, committedAt, changed, stale?, warning?, error? }
export async function syncGitlab(p, opts = {}) {
  const from = opts.from ?? process.cwd();
  const dir = opts.dir ?? mirrorDir(from, p);
  const statePath = join(dir, STATE_FILE);
  let state = null; try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const env = { ...(opts.env ?? process.env) };
  // A .env where the engine runs, in the mirror, and, for a run inside a mirror (its state file says so), in the folder
  // that holds it: where the project was first named with --project=, and where its .env is.
  const folders = [...new Set([from, dir, ...(state ? [dirname(resolve(dir))] : [])].map((d) => resolve(d)))];
  env.GITLAB_HOST = hostEnvFrom(env, folders);
  const token = tokenFrom(env, folders);
  const send = token && tokenAllowedFor(p.host, env);
  const headers = send ? { 'PRIVATE-TOKEN': token } : {};
  const fetchImpl = opts.fetchImpl ?? plainGet;
  let base = `${p.origin}/api/v4/projects/${encodeURIComponent(p.path)}`;
  const cached = (warning) => state?.sha && existsSync(dir)
    ? { dir, path: p.path, ref: state.ref, sha: state.sha, title: state.title, committedAt: state.committedAt, changed: false, stale: true, warning }
    : { dir: null, path: p.path, error: warning };
  if (opts.offline) return cached('not checked against GitLab this run');
  const notSent = token && !send ? `; a GITLAB_TOKEN is set but not sent to ${p.host}: add GITLAB_HOST=${p.host} to .env to allow it` : '';
  const get = async (url) => {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    try { return await fetchImpl(url, { headers, signal }); } catch (e) { return { ok: false, status: 0, error: e }; }
  };
  try {
    // The project by its id, found from the link even when it moved or names the project.
    const found = await projectApi(p.origin, p.path, get);
    base = found.base;
    let ref = p.ref || found.project?.default_branch;
    if (!ref) {
      const r = await get(base);
      if (!r.ok) return cached(r.status ? why(r.status, p.host) + notSent : `could not reach ${p.host}`);
      ref = (await r.json())?.default_branch || 'main';
    }
    const c = await get(`${base}/repository/commits/${encodeURIComponent(ref)}`);
    if (!c.ok) return cached(c.status ? why(c.status, p.host) + notSent : `could not reach ${p.host}`);
    const head = await c.json();
    const sha = String(head?.id ?? '');
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) return cached('GitLab gave no commit for this branch');
    const info = { dir, path: p.path, ref, sha, title: String(head.title ?? ''), committedAt: String(head.committed_date ?? '') };
    if (state?.sha === sha && existsSync(dir)) return { ...info, changed: false };
    const a = await get(`${base}/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}`);
    if (!a.ok) return cached(a.status ? why(a.status, p.host) + notSent : `could not reach ${p.host}`);
    // The project cannot write the mirror's own records (a .gitlab-source.json committed upstream would otherwise say
    // which host the next run talks to; a .gitlab-history.json, whose history it shows).
    const files = untar(gunzipSync(Buffer.from(await a.arrayBuffer()))).filter((f) => f.path !== STATE_FILE && f.path !== '.gitlab-history.json');
    if (!files.length) return cached('the archive GitLab sent holds no files');
    const root = resolve(dir) + sep;
    mkdirSync(dir, { recursive: true });
    const now = new Set(files.map((f) => f.path));
    for (const old of state?.files ?? []) {                                  // gone on GitLab: gone here (only files GitLab put here)
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
    const next = { source: `${p.origin}/${p.path}`, origin: p.origin, host: p.host, path: p.path, branch: p.ref, ref, sha, title: info.title, committedAt: info.committedAt, fetchedAt: new Date().toISOString(), files: [...now].sort() };
    writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n');
    return { ...info, changed: true, previous: state?.sha ?? null };
  } catch (e) {
    return cached(`could not read ${p.host}: ${e.message}`);
  }
}

// The project a mirror follows, from its state file (the branch it was told, else the default one).
export function projectFromState(dir) {
  let st; try { st = JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8')); } catch { return null; }
  if (!st?.origin || !st?.host || !st?.path) return null;
  return { origin: st.origin, host: st.host, path: st.path, ref: st.branch ?? null };
}

// Is this folder already the copy of that project (its state file names the same one)? Then it is brought up to date
// where it is, never copied again inside itself: a run from inside the copy, given the project by a profile or --project.
export function isMirrorOf(dir, p) {
  const here = projectFromState(dir);
  return !!here && !!p && here.origin === p.origin && here.path.toLowerCase() === p.path.toLowerCase();
}

// One line for the person: which GitLab commit this run checks.
export function describe(r) {
  if (r.error) return `❌ GitLab: ${r.path}: ${r.error}`;
  const when = r.committedAt ? ` (${r.committedAt.slice(0, 10)})` : '';
  const what = `${r.path} @ ${r.ref} ${r.sha.slice(0, 8)}${when}`;
  if (r.stale) return `⚠️  GitLab: ${r.warning} - checking the copy of ${what}`;
  return `🦊 GitLab: ${what} - ${r.changed ? (r.previous ? `fetched (was ${r.previous.slice(0, 8)})` : 'fetched') : 'up to date'}`;
}
