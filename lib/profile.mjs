// profile.mjs - a company's setup, written once by its maintainers and read by everyone who runs the engine there.
//
// A profile is a small JSON the company keeps in a private repository everyone can read and only its maintainers can
// change (its intent layer, say): where the code is, the Figma file, the rest of the shared setup, and where each part
// of the engine's files lives (stores.mjs). It never holds a token or anything one person sets for themself.
//
//   { "profile": 1, "name": "Acme", "client": "acme", "project": "<the code's link>",
//     "stores": { "snapshots": { "read": { "gitlab": "<link>", "path": "snapshots" } }, ... },
//     "config": { "figmaFileKey": "...", "paths": { ... }, ... } }
//
// `--profile <link or file>` writes it into this folder's ds-config.json (the shared keys and the stores; what this
// person set for themself is kept), and remembers it there: every later run reads it again and takes a new version
// when its maintainers changed it. Whether this person may write each part is never in it: GitLab answers that.
// `--make-command <client>` writes the command a team installs: rms-design-system-engine-<client>.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { SKILL } from './names.mjs';
import { parseGitlabUrl, refCandidates, tokenAllowedFor } from './gitlab-fetch.mjs';
import { tokenFrom, writeTokenFrom, hostEnvFrom, plainGet, STATE_FILE, projectApi } from './gitlab-source.mjs';
import { PARTS } from './stores.mjs';

export const PROFILE_FILE = 'design-system-engine-profile.json';
// What one person sets for themself: never taken from a profile, never written into one. Dotted: a key inside a key.
export const PERSONAL = ['intentLayer.autoFix', 'intentLayer.draftModel', 'draftModel', 'codeRoots', 'pluginDirs', 'codeReading.hookBrowser', 'webhook', 'hooks', 'styleguide.modules', 'profile'];
// Never in a profile, whatever its key is called.
const SECRET = /token|secret|password|passwd|api[-_]?key|private[-_]?key/i;

const hashOf = (t) => createHash('sha1').update(t).digest('hex');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
function getPath(o, path) { return path.split('.').reduce((a, k) => (isObj(a) ? a[k] : undefined), o); }
function setPath(o, path, v) { const ks = path.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (!isObj(a[k])) a[k] = {}; a = a[k]; } a[ks.at(-1)] = v; }
function delPath(o, path) { const ks = path.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (!isObj(a?.[k])) return; a = a[k]; } if (isObj(a)) delete a[ks.at(-1)]; }
function dropSecrets(v) {
  if (Array.isArray(v)) return v.map(dropSecrets);
  if (!isObj(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET.test(k) || /^(tokenEnv|writeTokenEnv)$/.test(k)) out[k] = dropSecrets(x);
  return out;
}
const withoutPersonal = (cfg) => { const c = clone(cfg) ?? {}; for (const p of PERSONAL) delPath(c, p); return c; };

// Is this a profile? → the profile, or throws with what is wrong. A part this engine does not know yet (a profile
// written for a newer engine) is not an error: it is kept, left unused, and named (unknownParts), so the rest works.
export function validate(p) {
  if (!isObj(p) || p.profile !== 1) throw new Error('not an rms-design-system-engine profile ("profile": 1 is missing)');
  if (p.stores != null && !isObj(p.stores)) throw new Error('"stores" is not an object');
  if (p.config != null && !isObj(p.config)) throw new Error('"config" is not an object');
  return p;
}
export const unknownParts = (p) => Object.keys(p?.stores ?? {}).filter((k) => !PARTS.includes(k));

// Read a profile from a file or a link (a GitLab file link, read with the person's GITLAB_TOKEN; any other https link,
// read as it is). opts: { from, env, http }. → { profile, source, sha } | { error }
export async function readProfile(source, { from = process.cwd(), env = process.env, http } = {}) {
  const src = String(source ?? '').trim();
  if (!src) return { error: 'no profile given' };
  let text;
  try {
    if (!/^https?:\/\//i.test(src)) text = readFileSync(resolve(from, src.replace(/^~(?=\/|$)/, homedir())), 'utf8');
    else {
      const get = http?.get ?? plainGet;
      // Inside a GitLab mirror, its .env is in the folder that holds it (gitlab-source.mjs).
      const folders = [from, ...(existsSync(join(from, STATE_FILE)) ? [dirname(resolve(from))] : [])];
      const e = { ...env }; e.GITLAB_HOST = hostEnvFrom(e, folders);
      const p = parseGitlabUrl(src);
      if (p?.kind === 'file') {
        const token = tokenFrom(e, folders) || writeTokenFrom(e, folders);
        const headers = token && tokenAllowedFor(p.host, e) ? { 'PRIVATE-TOKEN': token } : {};
        const { base: api } = await projectApi(p.origin, p.path, (u) => get(u, { headers }));
        let last = 0;
        for (const { ref, file } of refCandidates(p.refAndPath)) {
          const r = await get(`${api}/repository/files/${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(ref)}`, { headers });
          if (r.ok) { text = Buffer.from(await r.arrayBuffer()).toString('utf8'); break; }
          last = r.status;
          if (r.status !== 404 && r.status !== 400) break;
        }
        if (text == null) return { error: last === 401 ? 'GitLab did not accept GITLAB_TOKEN (401)' : last === 404 || last === 403 ? `not found or no access (${last}): GITLAB_TOKEN in .env must read ${p.path}${tokenAllowedFor(p.host, e) ? '' : `, and GITLAB_HOST=${p.host} must be in .env`}` : `GitLab answered ${last}` };
      } else {
        const r = await get(src, { headers: {} });
        if (!r.ok) return { error: `${src} answered ${r.status}` };
        text = Buffer.from(await r.arrayBuffer()).toString('utf8');
      }
    }
  } catch (e) { return { error: e.code === 'ENOENT' ? `no file at ${src}` : e.message }; }
  let profile;
  try { profile = validate(JSON.parse(text)); } catch (e) { return { error: e instanceof SyntaxError ? `${src} is not JSON: ${e.message}` : e.message }; }
  // A file is remembered by its full path: later runs start in the code's folder, not where it was given.
  return { profile, source: /^https?:\/\//i.test(src) ? src : resolve(from, src.replace(/^~(?=\/|$)/, homedir())), sha: hashOf(text) };
}

// The profile written into a person's ds-config.json: its shared keys and stores win, what the person set for themself
// stays, keys the profile does not name stay. → the next config
export function applyProfile(cfg, profile, { source, sha, now = new Date().toISOString() } = {}) {
  const mine = clone(cfg) ?? {};
  const shared = withoutPersonal(dropSecrets(profile.config ?? {}));
  const next = { ...mine };
  for (const [k, v] of Object.entries(shared)) next[k] = isObj(v) && isObj(mine[k]) ? { ...mine[k], ...clone(v) } : clone(v);
  for (const p of PERSONAL) { const v = getPath(mine, p); if (v !== undefined) setPath(next, p, v); else delPath(next, p); }
  if (profile.stores) next.stores = dropSecrets(clone(profile.stores));
  next.profile = { source, sha, ...(profile.name ? { name: profile.name } : {}), ...(profile.command ? { command: String(profile.command).replace(/^\//, '') } : {}), readAt: now };
  return next;
}

// This person's setup as a profile for a colleague: the shared keys and the stores, never a token or a personal key.
export function exportProfile(cfg, { name, project } = {}) {
  const config = withoutPersonal(dropSecrets(cfg));
  const stores = config.stores; delete config.stores;
  return { profile: 1, ...(name ? { name } : {}), ...(project ? { project } : {}), ...(stores ? { stores } : {}), config };
}

// Read the profile ds-config.json remembers, or the one given now, and write it in when it changed.
// → { applied, cfg, lines, error? }
// opts.read: the profile already read this run (project-dir.mjs).
export async function refreshProfile(ROOT, { given = null, read = null, env, http, offline = false } = {}) {
  const file = join(ROOT, 'ds-config.json');
  let cfg = {}; let raw = null;
  try { raw = readFileSync(file, 'utf8'); cfg = JSON.parse(raw); } catch { /* none yet: the profile is the setup */ }
  const source = given ?? cfg.profile?.source;
  if (!source) return { applied: false, cfg, lines: [] };
  if (offline && !given) return { applied: false, cfg, lines: [] };
  const r = read ?? await readProfile(source, { from: ROOT, env, http });
  if (r.error) return { applied: false, cfg, error: r.error, lines: [`⚠️  Profile not read (${r.error})${cfg.profile ? ': the setup already here is used' : ''}`] };
  if (cfg.profile?.source === r.source && cfg.profile?.sha === r.sha) return { applied: false, cfg, lines: [] };
  const next = applyProfile(cfg, r.profile, { source: r.source, sha: r.sha });
  const indent = raw ? (/^\{\n(\s+)"/.exec(raw)?.[1] ?? '  ') : '  ';
  writeFileSync(file, JSON.stringify(next, null, indent) + '\n');
  const who = r.profile.name ? `${r.profile.name}'s profile` : 'the profile';
  const unknown = unknownParts(r.profile);
  const later = unknown.length ? [`ℹ️  ${who} names ${unknown.length === 1 ? 'a part' : 'parts'} this engine does not know yet (${unknown.join(', ')}): left unused until the engine is updated (rms-design-system-engine --update)`] : [];
  return { applied: true, cfg: next, first: !cfg.profile, lines: [...later, `🏢 ${cfg.profile ? `${who} changed: ds-config.json updated from it` : `Set up from ${who}`} (${r.source})`] };
}

// ── The company's command ───────────────────────────────────────────────────────────────────────────────────────────
// The command a decision copied from the style guide starts with, so whoever pastes it runs it for this system and no
// other: the company's own command (/rms-design-system-engine-<client>), named by the profile ("command") or found
// among the commands installed here by the profile it runs; else the engine with the profile's link; else the engine.
export function engineCommand(cfg, { home = homedir() } = {}) {
  const source = cfg?.profile?.source ?? null;
  if (cfg?.profile?.command) return `/${cfg.profile.command}`;
  if (source) {
    const dir = join(home, '.claude', 'skills');
    let found = null;
    try {
      for (const d of readdirSync(dir).filter((x) => x.startsWith(`${SKILL}-`)).sort()) {
        let t = ''; try { t = readFileSync(join(dir, d, 'SKILL.md'), 'utf8'); } catch { continue; }
        if (t.includes(`--profile '${String(source).replace(/'/g, `'\\''`)}'`)) { found = d; break; }
      }
    } catch { /* no commands installed here */ }
    if (found) return `/${found}`;
    return `${SKILL} --profile '${String(source).replace(/'/g, `'\\''`)}'`;
  }
  return SKILL;
}
export const commandName = (client) => `${SKILL}-${String(client ?? '').toLowerCase().replace(/^rms-design-system-engine-/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
export function commandSkill(client, source, { name } = {}) {
  const cmd = commandName(client);
  const who = name || client;
  const q = `'${String(source).replace(/'/g, `'\\''`)}'`;
  return `---
name: ${cmd}
description: rms-design-system-engine set up for ${who}. Use it for any request about ${who}'s design system (check a component, the style guide, the intent layer, a prototype); it reads ${who}'s profile, so nobody sets up where anything is.
---

# /${cmd}

${who}'s setup of /${SKILL}: where the code, the Figma file and each of the engine's files live comes from
${who}'s profile, kept by its maintainers. Your tokens stay in your own .env; what you may write is what GitLab
lets your tokens write.

Run, in the shell, now. With a request, route it first, passing it exactly as the person wrote it:

\`\`\`bash
${SKILL} --profile ${q} --route "$ARGUMENTS"
\`\`\`

With no request: \`${SKILL} --profile ${q}\`. (Not on PATH: \`node ~/.claude/skills/${SKILL}/audit.mjs\` in place of
\`${SKILL}\`.)

Then do what /${SKILL} says for the request: run the \`RUN:\` command the route prints, relay its SUMMARY and follow its
NEXT line. The request is for ${who}'s design system: never another's.
`;
}
// → the file written
export function writeCommand(client, source, { home = homedir(), dir, name } = {}) {
  const cmd = commandName(client);
  if (cmd === `${SKILL}-`) throw new Error('give the client\'s name: --make-command <client>');
  const out = join(dir ? resolve(dir) : join(home, '.claude', 'skills'), cmd, 'SKILL.md');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, commandSkill(client, source, { name }));
  return out;
}
export const commandExists = (client, { home = homedir() } = {}) => existsSync(join(home, '.claude', 'skills', commandName(client), 'SKILL.md'));
