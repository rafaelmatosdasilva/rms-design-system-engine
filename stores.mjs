// stores.mjs - where each part of the engine's own files lives, and whether this person may write it there.
//
// A team keeps each part where it chose: the Figma and code snapshots, the intent layer, the contracts, the style guide
// and its decisions, in a GitLab project (a path in it, a branch of it) or a folder. ds-config.json → stores names the
// place of each, usually from the company's profile (profile.mjs):
//
//   "stores": { "snapshots": { "read": { "gitlab": "<project link>", "path": "snapshots" } },
//               "intentLayer": { "read": "<project link>", "mode": "merge-request" },
//               "styleguide": { "write": { "folder": "../public" } } }
//
// A place is { gitlab: link, branch?, path?, tokenEnv? }, { github: link, branch?, path? } or { folder: path, path? };
// a GitHub store is read and written with git, which the engine already speaks, rather than a second API; a link or a path alone is read as
// one. `write` is where the part is written, the same place as `read` when not said, and null for nowhere. It is never
// a claim that this person may write: GitLab answers that (writeAccess), from the token's role in the project and
// whether it may push to the branch, and the engine writes only where GitLab says yes. GitLab still refuses on its own
// if the engine is bypassed: its roles, protected branches and per-project tokens are the lock, not this file.
//
// Tokens stay in .env, never in a store or a profile: a place may name its own variable (tokenEnv, one token per
// project); else GITLAB_TOKEN reads and GITLAB_WRITE_TOKEN writes. A token goes only to gitlab.com or a host named in
// GITLAB_HOST. Nothing here throws to the run: a store that cannot be read or written says so in one line.
//
// A computer with no token reads a store with the person's own git access instead (gitStoreFiles): the projects they
// already clone are reached over their SSH key or their credential helper, so nobody makes a token just to read. Only
// where there is no token, so a setup that has one is unchanged, and git is never allowed to stop and ask for one.
// Writing without a token works the same way (gitStorePush): the commit is built from git's own plumbing inside that
// mirror and pushed, so nothing is checked out. What a person may push is still the host's to say - a protected
// branch refuses exactly as it would from their terminal, and the refusal is what the run reports. Each
// commit the engine makes names whose run made it as its author (decided-by.mjs), the token's owner staying the
// committer, so a store several people write tells their runs apart.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, accessSync, unlinkSync, rmSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname, relative, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR, REFS_DIR, PROJECT, SKILL } from './names.mjs';
// The name a commit carries when nobody is named: a no-reply address, never a person's.
const NOREPLY = `${SKILL}@users.noreply.github.com`;
import { STATE_FILE, parseGitlabProject, tokenFrom, writeTokenFrom, hostEnvFrom, envFrom, plainGet, plainSend, projectApi } from './gitlab-source.mjs';
import { tokenAllowedFor } from './gitlab-fetch.mjs';
import { runBy } from './decided-by.mjs';
import { isOwnFile, linksOf, ASSETS } from './styleguide-files.mjs';

export const PARTS = ['snapshots', 'intentLayer', 'contracts', 'kept', 'styleguide', 'decisions', 'themes', 'prototypes'];
export const LABEL = { snapshots: 'Snapshots', intentLayer: 'Intent layer', contracts: 'Contracts', kept: 'Kept differences', styleguide: 'Style guide', decisions: 'Team decisions', themes: 'Themes', prototypes: 'Prototypes' };
export const STATE = `${OUT_DIR}/stores.json`;
// The team's themes (a style guide module's data: one system's themes, flat, <name>.theme.json in the folder the place's
// path names; a store several systems share points its path at the system's own folder), read into the
// engine's own folder, never the project's: the build reads them there with the person's own (styleguide-gen.mjs).
export const THEMES_DIR = `${OUT_DIR}/themes`;
// The team's prototypes, in the project itself (prototypes/<Name>.vue is where --prototype already reads and writes
// them), so a person opens and edits one exactly as they do today.
export const PROTOTYPES_DIR = 'prototypes';
// The team's decisions: the files people write by deciding (answers to proposals, accepted differences, checks made
// by hand). Not what Figma and the code last agreed on (agreed.mjs): every run rewrites it, nobody decides it.
export const DECISION_FILES = ['intentDecisions', 'baseline', 'checked'].map((k) => PROJECT[k].now);
// The differences kept on purpose are a part of their own: a design rule agents follow (which side is right, and why),
// so a team keeps them with what agents read (its intent layer); the contracts carry each one (contract-gen.mjs).
// A setup that names no place for them keeps them with the decisions.
export const KEPT_FILES = [PROJECT.kept.now];
// What a store may put in the project, by part: nothing else is ever written from it (not a .env, not a hook).
const TAKES = {
  snapshots: (rel) => /\.snapshot\.json$/i.test(rel),
  decisions: (rel) => DECISION_FILES.includes(rel),
  kept: (rel) => KEPT_FILES.includes(rel),
  contracts: (rel) => /\.(json|md)$/i.test(rel),
  styleguide: (rel) => /\.(html|css|js|mjs|svg|png|jpe?g|webp|gif|woff2?|json|txt)$/i.test(rel),
  themes: (rel) => /^[^/]+\.json$/i.test(rel),
  // A team's prototypes: the composition or the page itself, flat in the folder the place's path names, as the
  // themes are. A prototype is the team's work like a decision is, and until now it lived on whoever drew it.
  prototypes: (rel) => /^[^/]+\.(json|vue|jsx|tsx|svelte|html?)$/i.test(rel),
};
const ROLE = { 0: 'no access', 5: 'Minimal access', 10: 'Guest', 15: 'Planner', 20: 'Reporter', 30: 'Developer', 40: 'Maintainer', 50: 'Owner' };
const roleOf = (n) => ROLE[n] ?? `access level ${n}`;
const hash = (b) => createHash('sha1').update(b).digest('hex');
const cleanPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
const safeRel = (rel) => !!rel && !rel.startsWith('/') && !/^[a-z]:/i.test(rel) && !rel.split('/').some((s) => s === '..' || s === '');

// ── Places ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// → { gitlab, branch, path, tokenEnv, writeTokenEnv } | { folder, path } | { github } | null (nowhere)
export function placeOf(v) {
  if (v == null || v === false || v === '' || v === 'nowhere') return null;
  if (typeof v === 'string') return /^https?:\/\//i.test(v) ? placeOf({ gitlab: v }) : { folder: v, path: '' };
  if (typeof v !== 'object') return null;
  const path = cleanPath(v.path);
  if (v.gitlab) {
    const url = String(v.gitlab).trim();
    const p = parseGitlabProject(url, { GITLAB_HOST: (() => { try { return new URL(url).host; } catch { return ''; } })() });
    return { gitlab: url, branch: v.branch ? String(v.branch) : (p?.ref ?? null), path, tokenEnv: v.tokenEnv ?? null, writeTokenEnv: v.writeTokenEnv ?? null };
  }
  if (v.folder) return { folder: String(v.folder), path };
  if (v.github) return { github: String(v.github), branch: v.branch ?? null, path };
  return null;
}
const keyOf = (pl) => JSON.stringify(pl);
// The same place, whichever token reads or writes it: where it is, not how it is reached.
export const samePlace = (a, b) => !!a && !!b && ['gitlab', 'folder', 'github', 'branch', 'path'].every((k) => (a[k] ?? null) === (b[k] ?? null));

// Each part's read and write place, and how a write is sent ("commit" or "merge-request"). The intent layer named the
// old way (ds-config.json → intentLayer) is its place when stores does not name one.
export function storesOf(cfg) {
  const s = cfg?.stores ?? {};
  const out = {};
  for (const part of PARTS) {
    let e = s[part];
    if (e != null && (typeof e !== 'object' || !('read' in e || 'write' in e))) e = { read: e };
    if (!e && part === 'kept' && s.decisions) e = s.decisions;
    if (!e && part === 'intentLayer' && cfg?.intentLayer) {
      const il = typeof cfg.intentLayer === 'string' ? { gitlab: cfg.intentLayer } : cfg.intentLayer;
      const url = il.gitlab ?? il.url;
      if (url) e = { read: { gitlab: url }, mode: il.autoFix === 'commit' ? 'commit' : 'merge-request' };
    }
    if (!e) { out[part] = { read: null, write: null, mode: 'commit' }; continue; }
    const read = placeOf(e.read);
    const write = 'write' in e ? placeOf(e.write) : read;
    out[part] = { read, write, mode: e.mode === 'merge-request' ? 'merge-request' : 'commit' };
  }
  return out;
}

export function describePlace(pl) {
  if (!pl) return 'nowhere';
  if (pl.folder) return `the folder ${join(pl.folder, pl.path || '')}`;
  const p = pl.gitlab ? parseGitlabProject(pl.gitlab, { GITLAB_HOST: (() => { try { return new URL(pl.gitlab).host; } catch { return ''; } })() }) : null;
  const name = p ? p.path : (pl.gitlab ?? pl.github);
  return `${name}${pl.branch ? ` @ ${pl.branch}` : ''}${pl.path ? `, ${pl.path}/` : ''}`;
}

// ── GitLab, for one place ───────────────────────────────────────────────────────────────────────────────────────────
// opts.http: { get(url, { headers }), send(url, { method, headers, body }) }, Node's own http(s) by default (tests pass
// a fake GitLab). → { p, base, get(path, { write }), send(method, path, body), writesWith, canWriteWith } | { error }
export function gitlabApi(ROOT, place, { env = process.env, http } = {}) {
  const get0 = http?.get ?? plainGet, send0 = http?.send ?? plainSend;
  const folders = [ROOT, ...(existsSync(join(ROOT, STATE_FILE)) ? [dirname(resolve(ROOT))] : [])];
  const e = { ...env }; e.GITLAB_HOST = hostEnvFrom(e, folders);
  let host = ''; try { host = new URL(place.gitlab).host; } catch { /* not a link */ }
  const p = parseGitlabProject(place.gitlab, e) ?? (host ? parseGitlabProject(place.gitlab, { ...e, GITLAB_HOST: [e.GITLAB_HOST, host].filter(Boolean).join(',') }) : null);
  if (!p) return { error: `${place.gitlab} is not a GitLab project link` };
  const allowed = tokenAllowedFor(p.host, e);
  const readTok = (place.tokenEnv && envFrom(place.tokenEnv, e, folders)) || tokenFrom(e, folders);
  // The token that writes: the place's own (writeTokenEnv, else tokenEnv), else GITLAB_WRITE_TOKEN, else the one that
  // reads. A place's own write token is often the pipeline's (a project access token): a computer without it writes
  // with the person's own, so one setup serves both. A place with only its own token (tokenEnv) keeps to it.
  const own = place.writeTokenEnv || place.tokenEnv || null;
  const tries = [[own, own ? envFrom(own, e, folders) : ''], ...(place.tokenEnv && !place.writeTokenEnv ? [] : [['GITLAB_WRITE_TOKEN', writeTokenFrom(e, folders)]])];
  const hit = tries.find(([, t]) => t);
  const writeTok = hit?.[1] || readTok;
  const wName = hit?.[0] ?? (place.tokenEnv || 'GITLAB_TOKEN');
  const h = (t) => (t && allowed ? { 'PRIVATE-TOKEN': t } : {});
  const hr = h(readTok), hw = h(writeTok);
  // The project by its id, found from the link even when it moved or names the project (gitlab-source.mjs).
  let ready = null;
  const base = () => (ready ??= projectApi(p.origin, p.path, (u) => get0(u, { headers: hr['PRIVATE-TOKEN'] ? hr : hw })).then((x) => x.base));
  return {
    p, writesWith: writeTok && writeTok !== readTok ? wName : (place.tokenEnv || 'GITLAB_TOKEN'),
    hasWriteToken: !!hw['PRIVATE-TOKEN'], hasReadToken: !!hr['PRIVATE-TOKEN'], notSent: !!(readTok || writeTok) && !allowed,
    get: async (path, { write = false } = {}) => {
      const b = await base();
      const r = await get0(b + path, { headers: write ? hw : hr });
      return !write && (r.status === 401 || r.status === 403 || r.status === 404) && hw['PRIVATE-TOKEN'] && hw['PRIVATE-TOKEN'] !== hr['PRIVATE-TOKEN'] ? get0(b + path, { headers: hw }) : r;
    },
    send: async (method, path, body) => send0((await base()) + path, { method, headers: hw, body }),
  };
}

// ── Reading a store with the person's own git access ───────────────────────────────────────────────────────────────
// Someone who already clones the team's projects needs no token of their own to read a store: git reaches it with
// their SSH key or their credential helper, exactly as when they clone by hand. Used only where there is no token to
// send, so a setup that has one is untouched.
//
// git must never stop to ask for anything. A run waiting on a prompt nobody can see hangs for ever, so every question
// is turned into a plain failure (BatchMode, GIT_TERMINAL_PROMPT) and the run then says what it would have said.
const GIT_SILENT = { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new', GIT_ASKPASS: '', SSH_ASKPASS: '' };
const gitMirrorDir = (host, path, home = homedir()) => join(home, '.cache', 'rms-engine', 'git', host, path.replace(/[^A-Za-z0-9._-]/g, '-') + '.git');

// A place git can reach, from its link: { host, path, origin }, or null when the link is not a repository's.
// Any host, because git is the same everywhere — which is what lets a store live on GitHub without the engine
// learning a second API for it.
export function gitPlaceOf(place) {
  const url = place?.github ?? place?.gitlab;
  if (!url) return null;
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  // The project's own path: what comes before GitLab's "/-/" or GitHub's "/tree|/blob", without a .git suffix.
  const parts = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const end = ['-', 'tree', 'blob'].map((m) => parts.indexOf(m)).filter((i) => i > 0);
  const path = parts.slice(0, end.length ? Math.min(...end) : parts.length).join('/').replace(/\.git$/, '');
  return path.includes('/') ? { host: u.host.toLowerCase(), path, origin: u.origin } : null;
}

// → { sha, files: Map<relative path, Buffer> } | null when git cannot reach it with what this person has.
export function gitStoreFiles(p, place, { git = gitSilently, home = homedir() } = {}) {
  const dir = gitMirrorDir(p.host, p.path, home);
  const under = place.path ? place.path.replace(/^\/+|\/+$/g, '') : '';
  try {
    if (!existsSync(join(dir, 'HEAD'))) { mkdirSync(dirname(dir), { recursive: true }); git(['init', '--bare', '-q', dir]); }
    const g = (args, input) => git(['--git-dir', dir, ...args], input);
    // SSH first: it is the access a person already has. The https address only works where a credential helper holds
    // it, and asks nothing when it does not.
    const ref = place.branch || 'HEAD';
    let fetched = false;
    for (const url of [`git@${p.host}:${p.path}.git`, `${p.origin}/${p.path}.git`]) {
      try { g(['fetch', '--depth', '1', '-q', url, ref]); fetched = true; break; } catch { /* the next way in */ }
    }
    if (!fetched) return null;
    const sha = String(g(['rev-parse', 'FETCH_HEAD'])).trim();
    const names = String(g(['ls-tree', '-r', '--name-only', 'FETCH_HEAD', ...(under ? ['--', under] : [])])).split('\n').filter(Boolean);
    if (!names.length) return { sha, files: new Map() };
    // One process for every file: a store holds hundreds, and one git per file would cost more than the fetch.
    const out = g(['cat-file', '--batch'], Buffer.from(names.map((n) => `FETCH_HEAD:${n}\n`).join(''), 'utf8'));
    const files = new Map();
    let at = 0;
    for (const name of names) {
      const nl = out.indexOf(0x0a, at);
      if (nl < 0) break;
      const head = String(out.subarray(at, nl));
      const size = Number(head.split(' ')[2]);
      if (!Number.isFinite(size)) break;                      // "missing": the batch and the names fell out of step
      files.set(under ? relative(under, name) : name, out.subarray(nl + 1, nl + 1 + size));
      at = nl + 1 + size + 1;                                 // the newline git writes after each object
    }
    return { sha, files };
  } catch { return null; }
}
// stderr is kept, not thrown away: when a host refuses a push (a protected branch, a role that may not write) what
// it says is the only useful part of the failure, and the run passes it on word for word.
// What GitLab and GitHub say when a branch's protection refuses a push (GitLab's own words, and a hook declining it).
const PROTECTED = /protected branch|not allowed to push|pre-receive hook declined/i;
const gitSilently = (args, input, env = {}) => execFileSync('git', args, { input, maxBuffer: 256 * 1024 * 1024, timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...GIT_SILENT, ...env } });

// Writing a store with the person's own git access, for a computer with no token. The mirror gitStoreFiles already
// keeps is enough: a commit is built from git's own plumbing (hash-object, write-tree, commit-tree) and pushed, so
// nothing is ever checked out and the person's folders are untouched.
//
// What the host allows is still the host's to say. A push to a protected branch is refused by GitLab or GitHub
// exactly as it would be from a terminal, and the refusal is passed on in the line the run prints: this adds a way
// in, never a permission.
//
// On GitLab a refused branch is what a merge request is for, as the API path does it: with mergeRequest set, a push
// the branch's protection refuses is sent again to a branch of its own, with GitLab's push options asking for a merge
// request into the branch it was meant for (mergeRequest.always: the setup asks for one, so the branch is never pushed
// to). Whether this person may open one is still GitLab's to say, on that push.
//
// → { ok: true, sha } | { ok: true, sha, mergeRequest: { branch, target, url } } | { ok: false, why }
export function gitStorePush(p, place, files, message, { git = gitSilently, home = homedir(), who = null, mergeRequest = null } = {}) {
  const dir = gitMirrorDir(p.host, p.path, home);
  const under = place.path ? place.path.replace(/^\/+|\/+$/g, '') : '';
  const branch = place.branch || 'HEAD';
  const urls = [`git@${p.host}:${p.path}.git`, `${p.origin}/${p.path}.git`];
  const g = (args, input) => git(['--git-dir', dir, ...args], input);
  try {
    if (!existsSync(join(dir, 'HEAD'))) { mkdirSync(dirname(dir), { recursive: true }); git(['init', '--bare', '-q', dir]); }
    let url = null;
    for (const u of urls) { try { g(['fetch', '-q', u, branch]); url = u; break; } catch { /* the next way in */ } }
    if (!url) return { ok: false, why: 'git could not reach it with this computer\'s own access' };
    const head = String(g(['rev-parse', 'FETCH_HEAD'])).trim();

    // An index of its own, so nothing touches whatever index the mirror may hold.
    const index = join(dir, `store-index-${process.pid}`);
    const withIndex = (args, input) => git(['--git-dir', dir, ...args], input, { GIT_INDEX_FILE: index });
    try {
      withIndex(['read-tree', head]);
      for (const [rel, data] of files) {
        const blob = String(git(['--git-dir', dir, 'hash-object', '-w', '--stdin'], Buffer.from(data))).trim();
        withIndex(['update-index', '--add', '--cacheinfo', `100644,${blob},${under ? `${under}/${rel}` : rel}`]);
      }
      const tree = String(withIndex(['write-tree'])).trim();
      if (tree === String(g(['rev-parse', `${head}^{tree}`])).trim()) return { ok: true, sha: head, unchanged: true };
      // Who ran it is the author, as it is for a commit made through the API. git also needs a committer, and will
      // not take one it had to guess: a computer with no name configured (a CI runner, a fresh container) is refused
      // outright with "empty ident name", so the engine always says who is committing rather than leaving it to git.
      // Where nobody is named, the engine names itself: a commit that says what made it beats a commit that fails.
      const env = {
        GIT_AUTHOR_NAME: who?.name || SKILL, GIT_AUTHOR_EMAIL: who?.email || NOREPLY,
        GIT_COMMITTER_NAME: who?.name || SKILL, GIT_COMMITTER_EMAIL: who?.email || NOREPLY,
      };
      const sha = String(git(['--git-dir', dir, 'commit-tree', tree, '-p', head, '-m', message], undefined, env)).trim();
      if (!mergeRequest?.always) {
        try { g(['push', '-q', url, `${sha}:refs/heads/${branch}`]); return { ok: true, sha }; }
        catch (e) { if (!mergeRequest || !PROTECTED.test(String(e?.stderr ?? e?.message ?? ''))) throw e; }
      }
      // A merge request: the target is the branch's own name (HEAD is the default branch, which the host names).
      let target = place.branch;
      if (!target) { const m = /^ref: refs\/heads\/(\S+)\s+HEAD/m.exec(String(g(['ls-remote', '--symref', url, 'HEAD']))); target = m?.[1]; }
      if (!target) return { ok: false, why: 'the branch to send a merge request into is not known: name it in the setup (branch)' };
      const source = mergeRequest.branch;
      const title = String(message).split('\n')[0].slice(0, 250);
      g(['push', '-q', '-o', 'merge_request.create', '-o', `merge_request.target=${target}`, '-o', 'merge_request.remove_source_branch', '-o', `merge_request.title=${title}`, url, `${sha}:refs/heads/${source}`]);
      // GitLab prints the merge request's link on stderr, which a push that worked does not hand back: its list,
      // filtered to the branch, is always right.
      const web = `${p.origin}/${p.path}/-/merge_requests?scope=all&state=opened&source_branch=${encodeURIComponent(source)}`;
      return { ok: true, sha, mergeRequest: { branch: source, target, url: web } };
    } finally { try { rmSync(index, { force: true }); } catch { /* never there on the first failure */ } }
  } catch (e) {
    // What git says is what the host said: a protected branch, a role that may not push, a stale branch.
    return { ok: false, why: String(e?.stderr ?? e?.message ?? e).split('\n').filter(Boolean).slice(-2).join('; ').slice(0, 300) || 'git refused the push' };
  }
}

// ── May this person write the part there? GitLab says ──────────────────────────────────────────────────────────────
// Asked once per run and place, with the token that would write: the project's permissions (the token's role) and the
// branch's can_push (a protected branch it may not push takes a merge request instead, which Developer may open).
// → { mode: 'commit' | 'merge-request' | 'folder' | null, why, branch?, api?, place }
const asked = new Map();
export function forgetAccess() { asked.clear(); }
export async function writeAccess(ROOT, cfg, part, opts = {}) {
  const s = storesOf(cfg)[part];
  const place = s?.write;
  if (!place) return { mode: null, place: null, why: s?.read ? `this setup reads ${LABEL[part].toLowerCase()} from ${describePlace(s.read)} and writes it nowhere` : 'the setup names no place for it' };
  return placeAccess(ROOT, place, s.mode, opts);
}
// The same for a place that is no part's: the profile's repository, or a store's root (its README, readmes.mjs).
export function placeAccess(ROOT, place, mode = 'commit', opts = {}) {
  const k = keyOf([place, mode]);
  if (!asked.has(k)) asked.set(k, check(ROOT, place, mode, opts));
  return asked.get(k);
}
async function check(ROOT, place, want, opts) {
  // GitHub: written the same way it is read, with git. There is no second API here and no token of the engine's own,
  // so what a person may push is what GitHub already lets them push — their SSH key or their credential helper, the
  // repository's branch protection, their role. Reached for the same reason reading was: git is the same everywhere.
  if (place.github) {
    const gp = gitPlaceOf(place);
    if (!gp) return { mode: null, place, why: `${place.github} is not a repository link` };
    if (!(opts.gitStore ?? gitStoreFiles)(gp, { ...place, path: '' }, opts)) return { mode: null, place, why: 'git could not reach it with this computer\'s own access' };
    return { mode: 'push', place, gitPlace: gp, why: 'written with your own git access; GitHub still decides what you may push' };
  }
  if (place.folder) {
    const dir = resolve(ROOT, place.folder, place.path || '');
    try { mkdirSync(dir, { recursive: true }); accessSync(dir, constants.W_OK); return { mode: 'folder', place, why: '' }; }
    catch { return { mode: null, place, why: `${dir} cannot be written on this computer` }; }
  }
  if (opts.offline) return { mode: null, place, why: 'not checked with GitLab this run (offline)' };
  const api = gitlabApi(ROOT, place, opts);
  if (api.error) return { mode: null, place, why: api.error };
  const name = api.p.path;
  // No token to write with: this person's own git access may still reach it, as it does for reading. Offered when
  // git can fetch the repository, which proves the access without writing anything; whether they may *push* is the
  // host's to answer, and it answers on the push itself, in words this run passes on. A way in, never a permission.
  if (!api.hasWriteToken) {
    const gp = gitPlaceOf(place);
    if (gp && (opts.gitStore ?? gitStoreFiles)(gp, { ...place, path: '' }, opts)) {
      return { mode: 'push', place, gitPlace: gp, why: 'written with your own git access (no token); the host still decides what you may push' };
    }
  }
  if (!api.hasWriteToken) return { mode: null, place, why: api.notSent ? `a token is set but not sent to ${api.p.host}: add GITLAB_HOST=${api.p.host} to .env` : `no token to write ${name} with: add ${place.writeTokenEnv || place.tokenEnv || 'GITLAB_WRITE_TOKEN'} to .env (a token for ${name} only)` };
  try {
    const r = await api.get('', { write: true });
    if (r.status === 401) return { mode: null, place, why: `GitLab did not accept the token in ${api.writesWith} (401): wrong, expired or revoked` };
    if (!r.ok) return { mode: null, place, why: `the token in ${api.writesWith} cannot see ${name} (${r.status}): a Maintainer of ${name} can give it access` };
    const proj = await r.json();
    const perms = proj?.permissions;
    const level = perms ? Math.max(perms.project_access?.access_level ?? 0, perms.group_access?.access_level ?? 0) : null;
    if (level != null && level < 30) return { mode: null, place, level, why: `GitLab gives the token in ${api.writesWith} ${roleOf(level)} on ${name}; writing needs Developer or more: a Maintainer of ${name} can grant it` };
    const branch = place.branch || proj?.default_branch || 'main';
    const b = await api.get(`/repository/branches/${encodeURIComponent(branch)}`, { write: true });
    if (!b.ok) return { mode: null, place, level, why: b.status === 404 ? `${name} has no branch ${branch}` : `GitLab answered ${b.status} for the branch ${branch} of ${name}` };
    const info = await b.json();
    // The role and can_push are the token's user's; a token may still be read only (its scopes), which a fine-grained
    // token cannot be asked about. So GitLab is asked for a commit with nothing in it: a token that may write gets 400
    // (nothing to commit), one that may not gets 401 or 403. Nothing is ever written by it.
    const probe = await api.send('POST', '/repository/commits', {});
    if (probe.status === 401 || probe.status === 403) {
      let said = ''; try { const j = await probe.json(); said = j?.error_description ?? j?.message ?? j?.error ?? ''; } catch { /* no body */ }
      return { mode: null, place, level, branch, why: `the token in ${api.writesWith} may only read ${name}${said ? ` (GitLab: ${String(said).slice(0, 160)})` : ''}: writing needs a token that may create commits there` };
    }
    if (info?.can_push) return { mode: want === 'merge-request' ? 'merge-request' : 'commit', place, level, branch, api, why: '' };
    if (level == null || level >= 30) return { mode: 'merge-request', place, level, branch, api, why: `${branch} is protected: changes go as a merge request for a Maintainer to merge` };
    return { mode: null, place, level, branch, why: `GitLab does not let the token in ${api.writesWith} push to ${branch} of ${name}` };
  } catch (e) { return { mode: null, place, why: `could not ask GitLab (${e.message})` }; }
}

// ── State: what each store held when last read, so a local change is never overwritten by a pull ──────────────────
function readState(ROOT) { try { return JSON.parse(readFileSync(resolve(ROOT, STATE), 'utf8')); } catch { return {}; } }
function writeState(ROOT, st) { const f = resolve(ROOT, STATE); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(st, null, 1) + '\n'); }

// ── The part's files here ──────────────────────────────────────────────────────────────────────────────────────────
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', OUT_DIR, REFS_DIR]);
// → Map(rel → Buffer): the snapshots (every *.snapshot.json, but the intent layer's own) or the decisions files.
export function localFiles(ROOT, cfg, part, { intentOut } = {}) {
  const out = new Map();
  if (part === 'decisions' || part === 'kept') { for (const f of part === 'kept' ? KEPT_FILES : DECISION_FILES) if (existsSync(join(ROOT, f))) out.set(f, readFileSync(join(ROOT, f))); return out; }
  // The prototypes a person drew, flat in the project's own prototypes/ folder. Only what the part takes, so a
  // screenshot or a note left beside one is this person's, not the team's.
  if (part === 'prototypes') {
    let names = []; try { names = readdirSync(join(ROOT, PROTOTYPES_DIR)); } catch { return out; }
    for (const n of names) {
      if (!TAKES.prototypes(n)) continue;
      try { if (statSync(join(ROOT, PROTOTYPES_DIR, n)).isFile()) out.set(n, readFileSync(join(ROOT, PROTOTYPES_DIR, n))); } catch { /* gone between the two */ }
    }
    return out;
  }
  if (part !== 'snapshots') return out;
  const skipFile = new Set([cleanPath(intentOut ?? 'intent-layer.snapshot.json')]);
  const walk = (d, depth) => {
    if (depth > 5) return;
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || (n.startsWith('.') && n !== '.')) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      const rel = relative(ROOT, p).split(sep).join('/');
      if (st.isDirectory()) { if (!existsSync(join(p, STATE_FILE))) walk(p, depth + 1); }
      else if (TAKES.snapshots(rel) && !skipFile.has(rel)) out.set(rel, readFileSync(p));
    }
  };
  walk(ROOT, 0);
  return out;
}
// The files of a folder the engine built (the contracts, the style guide), by the part's own kinds. → Map(rel → Buffer)
// The themes on this computer that the team's store lacks, or holds an older version of (by the theme's changed date):
// what a style guide build sends, so a theme someone makes reaches everyone with no step of its own. A newer one a
// colleague sent is never replaced. dirs: the folders this person keeps theme files in. → Map(<file> → Buffer)
export function themesToShare(ROOT, dirs, sys) {
  const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const list = (d) => { try { return readdirSync(d).filter((f) => /\.json$/i.test(f)).sort(); } catch { return []; } };
  const theirs = new Map(), storeDir = join(ROOT, THEMES_DIR);
  for (const f of list(storeDir)) { const t = read(join(storeDir, f)); if (t?.id) theirs.set(t.id, String(t.changed ?? '')); }
  const out = new Map();
  for (const d of dirs) for (const f of list(d)) {
    const t = read(join(d, f));
    if (!t?.id || !t.name || (theirs.has(t.id) && !(String(t.changed ?? '') > theirs.get(t.id)))) continue;
    out.set(f, Buffer.from(JSON.stringify(t, null, 2) + '\n')); theirs.set(t.id, String(t.changed ?? ''));
  }
  return out;
}

// The style guide's own files (styleguide-files.mjs) beside the pages sent that nothing links any more: neither a page
// sent nor another page already there (read: its text). Only a file of its own, named as it names them, in its assets
// folder or beside the page (where an earlier build wrote them).
function staleBeside(sendable, there, read) {
  const sent = new Set(sendable.map(([rel]) => rel));
  const linked = new Set();
  for (const [rel, data] of sendable) if (/\.html?$/i.test(rel)) linksOf(Buffer.from(data).toString('utf8')).forEach((l) => linked.add(l));
  for (const f of there) if (/^[^/]+\.html?$/i.test(f) && !sent.has(f)) linksOf(read(f)).forEach((l) => linked.add(l));
  return there.filter((f) => isOwnFile(f) && !sent.has(f) && !linked.has(f));
}

// The page and what it links to beside it (another page, a picture, a stylesheet), followed from each page sent: never
// the rest of its folder, where a person may keep files of their own (a theme saved from the page).
export function pageFiles(page) {
  const dir = dirname(page), out = new Map(), todo = [basename(page)];
  while (todo.length) {
    const rel = todo.shift();
    if (out.has(rel) || !TAKES.styleguide(rel)) continue;
    const p = join(dir, rel); let buf; try { buf = readFileSync(p); } catch { continue; }
    out.set(rel, buf);
    if (!/\.html?$/i.test(rel)) continue;
    for (const m of buf.toString('utf8').matchAll(/\b(?:src|href)="([^"#?]+)/g)) {
      const ref = m[1]; if (/^([a-z][\w+.-]*:|\/\/|\/)/i.test(ref)) continue;
      const next = relative(dir, join(dirname(p), decodeURIComponent(ref))).split(sep).join('/');
      if (!next.startsWith('..')) todo.push(next);
    }
  }
  return out;
}

export function folderFiles(dir, part) {
  const out = new Map();
  const walk = (d) => {
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      const rel = relative(dir, p).split(sep).join('/');
      if (st.isDirectory()) walk(p); else if (TAKES[part]?.(rel)) out.set(rel, readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

// ── Reading a store into the project ──────────────────────────────────────────────────────────────────────────────
// Only when its commit moved (GitLab) or a file differs (folder). A file changed here and in the store since it was
// last read is decided by what each copy was built from (stamp.mjs): the store's taken when it was built from newer
// inputs, else this computer's kept, and said either way. → { line, changed, written: [rel], kept: [rel] } | null
export async function pullStore(ROOT, cfg, part, opts = {}) {
  const place = storesOf(cfg)[part]?.read;
  if (!place) return null;
  const st = readState(ROOT), prev = st[part] ?? {};
  const label = LABEL[part];
  let remote, sha = null;
  try {
    if (place.folder) remote = folderFiles(resolve(ROOT, place.folder, place.path || ''), part);
    else if (place.github) {
      // GitHub, read with git: the engine learns no second API for it, because git is the same on either host. A
      // person reaches it the way they already clone from GitHub; there is no token of the engine's own here.
      if (opts.offline) return { line: null, changed: false, written: [] };
      const p = gitPlaceOf(place);
      if (!p) return { line: `⚠️  ${label}: ${place.github} is not a repository link`, changed: false, written: [] };
      const g = (opts.gitStore ?? gitStoreFiles)(p, place, opts);
      if (!g) return { line: `⚠️  ${label} not read from ${describePlace(place)}: git could not reach it with this computer's own access`, changed: false, written: [] };
      if (prev.sha === g.sha) return { line: null, changed: false, written: [] };
      sha = g.sha; remote = g.files;
    } else {
      if (opts.offline) return { line: null, changed: false, written: [] };
      const api = gitlabApi(ROOT, place, opts);
      if (api.error) return { line: `⚠️  ${label}: ${api.error}`, changed: false, written: [] };
      // No token to send: this person's own git access reads it instead, as it does when they clone the project by
      // hand. Only here, so a setup with a token keeps going through the API exactly as before; when git cannot
      // reach it either, the API below says what it always said.
      if (!api.hasReadToken && !api.hasWriteToken) {
        const g = (opts.gitStore ?? gitStoreFiles)(api.p, place, opts);
        if (g) {
          if (prev.sha === g.sha) return { line: null, changed: false, written: [] };
          sha = g.sha; remote = g.files;
        }
      }
      if (!remote) {
        let ref = place.branch;
        if (!ref) { const r = await api.get(''); if (!r.ok) return { line: `⚠️  ${label} not read from ${describePlace(place)}: GitLab answered ${r.status}`, changed: false, written: [] }; ref = (await r.json())?.default_branch || 'main'; }
        const c = await api.get(`/repository/commits/${encodeURIComponent(ref)}`);
        if (!c.ok) return { line: `⚠️  ${label} not read from ${describePlace(place)}: GitLab answered ${c.status}`, changed: false, written: [] };
        sha = String((await c.json())?.id ?? '');
        if (sha && prev.sha === sha) return { line: null, changed: false, written: [] };
        remote = await treeFiles(api, place.path, sha, part);
      }
    }
  } catch (e) { return { line: `⚠️  ${label} not read from ${describePlace(place)}: ${e.message}`, changed: false, written: [] }; }
  const written = [], kept = [], keptNewer = [], newer = [], files = { ...(prev.files ?? {}) };
  const { stampIn, compareStamps } = await import('./stamp.mjs');
  const base = resolve(ROOT, part === 'themes' ? THEMES_DIR : part === 'prototypes' ? PROTOTYPES_DIR : '.');
  for (const [rel, data] of remote) {
    if (!safeRel(rel) || !TAKES[part]?.(rel)) continue;
    const fp = resolve(base, rel);
    if (!fp.startsWith(base + sep)) continue;
    const there = hash(data);
    const here = existsSync(fp) ? hash(readFileSync(fp)) : null;
    if (here === there) { files[rel] = there; continue; }
    if (here && prev.files?.[rel] !== here) {                                // changed here and there since the last read
      const mine = stampIn(readFileSync(fp, 'utf8'), rel), theirs = stampIn(Buffer.from(data).toString('utf8'), rel);
      const c = mine && theirs ? compareStamps(theirs, mine, { ROOT }) : null;   // is this computer's older?
      if (!c?.older) { (mine && theirs && compareStamps(mine, theirs, { ROOT }).older ? keptNewer : kept).push(rel); continue; }
      newer.push({ rel, why: c.why.join('; ') });
    }
    mkdirSync(dirname(fp), { recursive: true }); writeFileSync(fp, data); written.push(rel); files[rel] = there;
  }
  st[part] = { sha, files, readAt: new Date().toISOString() };
  writeState(ROOT, st);
  const at = `${describePlace(place)}${sha ? ` ${sha.slice(0, 8)}` : ''}`;
  const lines = [];
  if (written.length) lines.push(`📥 ${label}: ${written.length} file${written.length === 1 ? '' : 's'} from ${at}${newer.length ? `, ${newer.map((n) => n.rel).join(', ')} over this computer's, built from older inputs (${newer.map((n) => n.why).join('; ')})` : ''}`);
  if (keptNewer.length) lines.push(`ℹ️  ${label}: ${keptNewer.join(', ')} changed here and in ${describePlace(place)}: this computer's kept, built from newer inputs${part === 'snapshots' ? ' (send it with --refresh-snapshots)' : ''}`);
  if (kept.length) lines.push(`⚠️  ${label}: ${kept.join(', ')} changed here and in ${describePlace(place)}, from inputs that cannot be ordered: this computer's kept${part === 'snapshots' ? ' (send it with --refresh-snapshots, or delete it to take the store\'s)' : ''}`);
  return { line: lines.join('\n') || null, changed: written.length > 0, written, kept: [...keptNewer, ...kept] };
}
async function treeFiles(api, path, sha, part) {
  const out = new Map(), pre = path ? path + '/' : '';
  for (let page = 1; page <= 50; page++) {
    const r = await api.get(`/repository/tree?ref=${encodeURIComponent(sha)}&recursive=true&per_page=100&page=${page}${path ? `&path=${encodeURIComponent(path)}` : ''}`);
    if (!r.ok) { if (r.status === 404 && page === 1) return out; throw new Error(`GitLab answered ${r.status} for the files`); }
    const items = await r.json();
    for (const it of items ?? []) {
      if (it.type !== 'blob' || !it.path.startsWith(pre)) continue;
      const rel = it.path.slice(pre.length);
      if (!TAKES[part]?.(rel)) continue;
      const f = await api.get(`/repository/files/${encodeURIComponent(it.path)}/raw?ref=${encodeURIComponent(sha)}`);
      if (f.ok) out.set(rel, Buffer.from(await f.arrayBuffer()));
    }
    if (!items || items.length < 100) break;
  }
  return out;
}

// ── Writing the part to its store ──────────────────────────────────────────────────────────────────────────────────
// Only where GitLab lets this person write (writeAccess); a commit on the branch, or a merge request when the branch is
// protected or the setup asks for one. When the branch moved since the store was read in this run (another run wrote
// it), each file is merged rather than refused: one only this run changed is sent, one only the other changed is
// taken here, and one both changed is decided by what each was built from (stamp.mjs): the copy built from newer
// inputs is kept, and one whose inputs cannot be ordered is held, neither overwritten. Never throws. → { ok, line, url? }
export async function pushStore(ROOT, cfg, part, files, message, opts = {}) {
  const label = LABEL[part];
  const a = await writeAccess(ROOT, cfg, part, opts);
  if (!a.mode) return { ok: false, line: `ℹ️  ${label} not sent: ${a.why}.${a.place ? ' Whoever may write it there sends it.' : ''}` };
  const place = a.place;
  let sendable = [...files].filter(([rel]) => safeRel(rel) && TAKES[part]?.(rel));
  if (!sendable.length) return { ok: true, line: `ℹ️  ${label}: nothing to send` };
  // Written with this person's own git access, because there is no token. Built and pushed without a checkout; a
  // host that will not take it says so and that is what the line carries.
  if (a.mode === 'push') {
    // On GitLab, a protected branch takes a merge request instead, as with a token; GitHub has no push options for one.
    const mergeRequest = place.github ? null : { always: storesOf(cfg)[part]?.mode === 'merge-request', branch: `design-system-engine/${part}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}` };
    const r = (opts.gitPushStore ?? gitStorePush)(a.gitPlace, place, sendable, message, { ...opts, who: 'runBy' in opts ? opts.runBy : runBy(ROOT), mergeRequest });
    if (!r.ok) return { ok: false, line: `⚠️  ${label} not sent: ${r.why}` };
    if (r.unchanged) return { ok: true, line: `ℹ️  ${label}: ${describePlace(place)} already has these files` };
    // The branch did not move, so what the store was read at stays; the merge request is for a Maintainer to merge.
    if (r.mergeRequest) return { ok: true, url: r.mergeRequest.url, line: `📤 ${label}: ${sendable.length} file${sendable.length === 1 ? '' : 's'} sent as a merge request into ${r.mergeRequest.target} with your own git access (${r.mergeRequest.url})${mergeRequest.always ? '' : ` - ${r.mergeRequest.target} is protected: a Maintainer merges it`}` };
    const st2 = readState(ROOT), prev2 = st2[part] ?? {};
    st2[part] = { sha: r.sha, files: { ...(prev2.files ?? {}), ...Object.fromEntries(sendable.map(([rel, d]) => [rel, hash(d)])) }, readAt: new Date().toISOString() };
    writeState(ROOT, st2);
    return { ok: true, line: `📤 ${label}: ${sendable.length} file${sendable.length === 1 ? '' : 's'} pushed to ${describePlace(place)} with your own git access` };
  }
  if (a.mode === 'folder') {
    const dir = resolve(ROOT, place.folder, place.path || '');
    for (const [rel, data] of sendable) { const fp = join(dir, rel); mkdirSync(dirname(fp), { recursive: true }); writeFileSync(fp, data); }
    const list = (d, pre = '') => { try { return readdirSync(join(dir, d)).map((f) => pre + f); } catch { return []; } };
    const there = [...list(''), ...list(ASSETS, `${ASSETS}/`)];
    const gone = part !== 'styleguide' ? [] : staleBeside(sendable, there, (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } });
    for (const f of gone) { try { unlinkSync(join(dir, f)); } catch { /* gone already */ } }
    return { ok: true, line: `📤 ${label}: ${sendable.length} file${sendable.length === 1 ? '' : 's'} written to ${dir}${gone.length ? `, ${gone.length} an earlier page linked removed` : ''}` };
  }
  const api = a.api;
  try {
    const h = await api.get(`/repository/commits/${encodeURIComponent(a.branch)}`, { write: true });
    if (!h.ok) return { ok: false, line: `⚠️  ${label} not sent: GitLab answered ${h.status} for ${a.branch}` };
    const head = String((await h.json())?.id ?? '');
    const st = readState(ROOT), prev = st[part] ?? {};
    // A part the project reads from the same place (the snapshots, the decisions) is sent on the commit it was read at.
    // Not the themes: each is a file of its own, and the page published beside them moves the branch they are read at.
    const expect = opts.expectSha ?? (part !== 'themes' && TAKES_ON_RUN.includes(part) && keyOf(storesOf(cfg)[part].read) === keyOf(place) ? prev.sha : null);
    const pre = place.path ? place.path + '/' : '';
    let merged = null;
    if (expect && head && !head.startsWith(expect)) {
      merged = await mergeMoved(ROOT, part, api, pre, head, sendable, prev, opts.force ?? process.argv.includes('--force'));
      if (merged.error) return { ok: false, line: `⚠️  ${label} not sent: ${a.branch} moved since it was read (now ${head.slice(0, 8)}), and ${merged.error}: run again, so the store is read first` };
      sendable = merged.send;
      if (!sendable.length) {
        st[part] = { sha: head, files: { ...(prev.files ?? {}), ...merged.seen }, readAt: new Date().toISOString() };
        writeState(ROOT, st);
        return { ok: !merged.held.length, line: `${merged.held.length ? '⚠️ ' : 'ℹ️ '} ${label}: nothing sent - ${a.branch} moved since it was read (now ${head.slice(0, 8)}): ${mergedSay(merged)}` };
      }
    }
    const there = new Set();
    for (let page = 1; page <= 50; page++) {
      const r = await api.get(`/repository/tree?ref=${encodeURIComponent(head)}&recursive=true&per_page=100&page=${page}${place.path ? `&path=${encodeURIComponent(place.path)}` : ''}`, { write: true });
      if (!r.ok) break;
      const items = await r.json();
      for (const it of items ?? []) if (it.type === 'blob') there.add(it.path);
      if (!items || items.length < 100) break;
    }
    // A file as it was when the store was last read, at the commit still there, is not sent again.
    const changed = sendable.filter(([rel, data]) => !(prev.sha === head && prev.files?.[rel] === hash(data) && there.has(pre + rel)));
    // The style guide's own files an earlier page linked and no page there links now (its data of the last build):
    // removed in the same commit, so the store holds what its pages use, never one more data file a build.
    const beside = [...there].filter((p) => p.startsWith(pre)).map((p) => p.slice(pre.length));
    const pages = {};
    for (const f of part === 'styleguide' ? beside.filter((x) => /^[^/]+\.html?$/i.test(x) && !sendable.some(([rel]) => rel === x)) : []) {
      const r = await api.get(`/repository/files/${encodeURIComponent(pre + f)}/raw?ref=${encodeURIComponent(head)}`, { write: true });
      pages[f] = r.ok ? Buffer.from(await r.arrayBuffer()).toString('utf8') : '';
    }
    const gone = part === 'styleguide' ? staleBeside(sendable, beside, (f) => pages[f] ?? '') : [];
    if (!changed.length && !gone.length) return { ok: true, line: `ℹ️  ${label}: ${describePlace(place)} already has these files` };
    const after = merged ? ` - ${a.branch} had moved since it was read: ${mergedSay(merged)}` : '';
    const actions = [...changed.map(([rel, data]) => ({ action: there.has(pre + rel) ? 'update' : 'create', file_path: pre + rel, content: Buffer.from(data).toString('base64'), encoding: 'base64' })),
      ...gone.map((f) => ({ action: 'delete', file_path: pre + f }))];
    // The commit says whose run made it. The token's owner stays the committer, so GitLab's roles and its audit trail
    // are untouched; this is the author, which is what tells three people's runs apart in a store they all write.
    const who = 'runBy' in opts ? opts.runBy : runBy(ROOT);
    const authored = who ? { author_name: who.name, author_email: who.email } : {};
    if (a.mode === 'commit') {
      const c = await api.send('POST', '/repository/commits', { branch: a.branch, commit_message: message, actions, ...authored });
      // A gateway that gave up while GitLab still made the commit (a large one, a slow server): the branch says whether
      // it is there, so a commit that landed is never reported as not sent, nor sent again.
      let out = null;
      if (!c.ok && c.status >= 500) {
        for (let i = 0; i < 3 && !out; i++) {
          await new Promise((r) => setTimeout(r, opts.retryMs ?? 2000));
          const h2 = await api.get(`/repository/commits/${encodeURIComponent(a.branch)}`, { write: true }).catch(() => null);
          const j = h2?.ok ? await h2.json() : null;
          if (j?.id && j.id !== head && String(j.title ?? '').trim() === message.split('\n')[0].trim()) out = j;
        }
      }
      if (!c.ok && !out) return { ok: false, line: `⚠️  ${label} not sent: GitLab answered ${c.status} to the commit${c.status === 403 ? ` (the token in ${api.writesWith} may not create commits on ${a.branch})` : ''}` };
      out ??= await c.json();
      st[part] = { sha: out?.id ?? null, files: { ...(prev.sha === head ? prev.files : merged ? { ...(prev.files ?? {}), ...merged.seen } : {}), ...Object.fromEntries(changed.map(([rel, d]) => [rel, hash(d)])) }, readAt: new Date().toISOString() };
      writeState(ROOT, st);
      return { ok: true, url: out?.web_url ?? null, line: `📤 ${label}: ${changed.length} file${changed.length === 1 ? '' : 's'} committed on ${describePlace(place)}${out?.web_url ? ` (${out.web_url})` : ''}${after}` };
    }
    const branch = `design-system-engine/${part}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const b = await api.send('POST', `/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(head)}`);
    if (!b.ok) return { ok: false, line: `⚠️  ${label} not sent: GitLab answered ${b.status} when making the branch ${branch}` };
    const c = await api.send('POST', '/repository/commits', { branch, commit_message: message, actions, ...authored });
    if (!c.ok) return { ok: false, line: `⚠️  ${label} not sent: GitLab answered ${c.status} to the commit (the branch ${branch} was made; delete it before trying again)` };
    const m = await api.send('POST', '/merge_requests', { source_branch: branch, target_branch: a.branch, title: message.split('\n')[0], description: message, remove_source_branch: true });
    if (!m.ok) return { ok: false, line: `⚠️  ${label}: the branch ${branch} holds the changes, but GitLab answered ${m.status} to the merge request` };
    const url = (await m.json())?.web_url ?? null;
    return { ok: true, url, line: `📤 ${label}: ${changed.length} file${changed.length === 1 ? '' : 's'} sent as a merge request into ${a.branch}${url ? ` (${url})` : ''}${a.why ? ` - ${a.why}` : ''}${after}` };
  } catch (e) { return { ok: false, line: `⚠️  ${label} not sent: ${e.message}` }; }
}

// The files of a write whose branch moved since the store was read, each as it is there now (head) against the copy
// read (prev.files, by hash) and this run's: only this run changed it, sent; only the store, its copy written here;
// both, the stamps decide (compareStamps), the one built from newer inputs kept and one that cannot be ordered held.
// → { send, took: [rel], kept: [{ rel, why }], held: [rel], seen: { rel: hash of the copy there } } or { error }
async function mergeMoved(ROOT, part, api, pre, head, sendable, prev, force = false) {
  const { stampIn, compareStamps } = await import('./stamp.mjs');
  const base = resolve(ROOT, part === 'themes' ? THEMES_DIR : part === 'prototypes' ? PROTOTYPES_DIR : '.');
  const out = { send: [], took: [], kept: [], held: [], seen: {} };
  for (const [rel, data] of sendable) {
    const r = await api.get(`/repository/files/${encodeURIComponent(pre + rel)}/raw?ref=${encodeURIComponent(head)}`, { write: true });
    if (!r.ok && r.status !== 404) return { error: `GitLab answered ${r.status} for ${rel}` };
    const there = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    const theirs = there ? hash(there) : null, ours = hash(data), read = prev.files?.[rel] ?? null;
    if (theirs) out.seen[rel] = theirs;
    if (theirs === ours) continue;                                            // the same already there
    if (theirs === read) { out.send.push([rel, data]); continue; }            // only this run changed it
    if (!there) { out.send.push([rel, data]); continue; }                     // gone there, written here: sent
    const here = resolve(base, rel), inside = here.startsWith(base + sep);
    const take = () => { if (inside) { mkdirSync(dirname(here), { recursive: true }); writeFileSync(here, there); } };
    const local = existsSync(here) ? hash(readFileSync(here)) : null;
    if (ours === read && local === read) { take(); out.took.push(rel); continue; }   // only the store changed it: taken here
    const a = stampIn(there.toString('utf8'), rel), b = stampIn(Buffer.from(data).toString('utf8'), rel);
    const mineOlder = a && b ? compareStamps(a, b, { ROOT }) : null, theirsOlder = a && b ? compareStamps(b, a, { ROOT }) : null;
    if (mineOlder?.older && !force) { take(); out.kept.push({ rel, why: mineOlder.why.join('; ') }); }
    else if (theirsOlder?.older || force) out.send.push([rel, data]);
    else out.held.push(rel);
  }
  return out;
}
const mergedSay = (m) => [
  m.took.length ? `${m.took.length} taken from the store, changed only there` : null,
  m.kept.length ? `${m.kept.map((k) => k.rel).join(', ')} kept as the store has ${m.kept.length === 1 ? 'it' : 'them'}, built from newer inputs (${m.kept.map((k) => k.why).join('; ')})` : null,
  m.held.length ? `${m.held.join(', ')} held, changed there and here from inputs that cannot be ordered: run again, so the store is read first, or send it with --force` : null,
].filter(Boolean).join('; ') || 'nothing of the other run\'s was overwritten';

// ── On each run: the stores the project reads from, brought in ─────────────────────────────────────────────────────
// The snapshots and the team's decisions (the parts the checks read); the contracts and the style guide are only
// written. → [line]
const TAKES_ON_RUN = ['snapshots', 'kept', 'decisions', 'themes', 'prototypes'];
export async function pullOnRun(ROOT, cfg, opts = {}) {
  const lines = [];
  for (const part of TAKES_ON_RUN) {
    const r = await pullStore(ROOT, cfg, part, opts);
    if (r?.line) lines.push(r.line);
  }
  return lines;
}

// What this person may do with each part, as GitLab answers today: one line each, for setup and the profile.
export async function accessLines(ROOT, cfg, opts = {}) {
  const s = storesOf(cfg), out = [];
  for (const part of PARTS) {
    const { read, write } = s[part];
    if (!read && !write) continue;
    const a = await writeAccess(ROOT, cfg, part, opts);
    const same = samePlace(read, write);
    const where = same || !write ? `lives in ${describePlace(read)}` : read ? `read from ${describePlace(read)}, written to ${describePlace(write)}` : `lives in ${describePlace(write)}`;
    const may = a.mode === 'commit' ? `you can change it (a commit on ${a.branch})`
      : a.mode === 'merge-request' ? `you can change it through a merge request into ${a.branch}`
        : a.mode === 'folder' ? 'you can change it' : `you can only read it: ${a.why}`;
    out.push(`   ${LABEL[part]}: ${where}; ${may}`);
  }
  return out;
}
