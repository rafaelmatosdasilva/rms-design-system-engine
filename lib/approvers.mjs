// approvers.mjs - who may say yes to each kind of change, by name.
//
// Every check the engine runs ends with a person saying yes: to a token added to the system, a component's new option,
// a new value for a shared token, an exception, a new reference picture, a change an agent made. The sign-off already
// refuses the one who made a change (sign-off.mjs). It did not say who may sign it, so any name passed: the person
// nearest the keyboard signed off a change to the brand colours. This says it, per kind, from what the team already wrote:
//   1. ds-config.json → review.approvers: { "<kind>": ["name", "@handle", …] }, the team's own word, first;
//   2. else the repository's code owners (CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS): the owners of the file the
//      change is in, as GitHub and GitLab read them (the last rule that matches the file wins).
// Nothing named for a kind means anyone but the author may approve it, as before.
//
// The kinds: token (a token added to the theme), option (a component's new option), value (a shared token given another
// value), exception (a kept difference, an excused value, accepted debt), reference (a new reference picture), agent (any
// change an agent made, when nothing more particular is named).
//
//   KINDS
//   kindOfFile(file, cfg)                       → the kind a change to this file is, or null
//   readCodeOwners(root)                        → [{ pattern, owners }], in the file's order
//   ownersOf(file, rules)                       → [owner] of the last rule that matches
//   approversFor({ kind, file, cfg, rules, agent }) → { names, from } | null
//   approvalRefusal({ reviewer, approvers, kind }) → why this reviewer may not approve it, or null
//   missingApprovals(held, signOffs, ctx)       → [{ what, kind, names, from }] for each held change no one signed
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PROJECT } from './names.mjs';

export const KINDS = ['token', 'option', 'value', 'exception', 'reference', 'agent'];
const norm = (p) => String(p ?? '').split('\\').join('/').replace(/^\.\//, '');
const who = (s) => String(s ?? '').trim().replace(/^@/, '').toLowerCase();

// The kind of change an edit of this file is, by where it is. A theme file is a token change, the engine's lists of
// exceptions an exception, its reference pictures a reference; anything else is said by what the edit adds.
export function kindOfFile(file, cfg = {}) {
  const f = norm(file), b = basename(f);
  if ([cfg.paths?.themeCSS ?? 'src/theme.css'].flat().map(norm).includes(f)) return 'token';
  if ([PROJECT.kept.now, PROJECT.baseline.now, cfg.baseline?.path && basename(cfg.baseline.path)].includes(b) || b === 'ds-config.json') return 'exception';
  if (f.startsWith(`${PROJECT.refs.now}/`) || f.includes(`/${PROJECT.refs.now}/`)) return 'reference';
  return null;
}

// The repository's code owners, in the order the file writes them. A rule is a pattern and its owners; a line with no
// owner (a pattern that clears ownership) is kept, so it wins where it is last.
export function readCodeOwners(root) {
  const file = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS', '.gitlab/CODEOWNERS'].map((f) => join(root, f)).find((f) => existsSync(f));
  if (!file) return [];
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return []; }
  return text.split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter((l) => l && !/^\[.*\]$/.test(l) && !/^\^?\[/.test(l))
    .map((l) => { const [pattern, ...owners] = l.split(/\s+/); return { pattern, owners }; });
}

// A code owners pattern as a test of a path: a leading / anchors it at the root, a trailing / is a folder and all in it,
// * is any name and ** any depth; a pattern with no / matches the name anywhere.
function matcher(pattern) {
  let p = String(pattern);
  const anchored = p.startsWith('/') || p.slice(0, -1).includes('/');
  p = p.replace(/^\//, '');
  const folder = p.endsWith('/');
  if (folder) p = p.slice(0, -1);
  const re = p.split('/').map((seg) => (seg === '**' ? '.*' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))).join('/').replace(/\.\*\//g, '(?:.*/)?');
  return new RegExp(`${anchored ? '^' : '(^|/)'}${re}${folder ? '/' : '(/|$)'}`);
}
export function ownersOf(file, rules = []) {
  const f = norm(file);
  let hit = null;
  for (const r of rules) if (matcher(r.pattern).test(f)) hit = r;
  return hit ? hit.owners : [];
}

// Who may approve this change. agent: whether an agent made it (its kind falls back to the agent rule).
export function approversFor({ kind = null, file = null, cfg = {}, rules = [], agent = false } = {}) {
  const named = cfg.review?.approvers ?? {};
  const list = (k) => (Array.isArray(named[k]) ? named[k] : typeof named[k] === 'string' ? [named[k]] : []).map(String).filter(Boolean);
  if (kind && list(kind).length) return { names: list(kind), from: `ds-config.json review.approvers.${kind}` };
  if (agent && list('agent').length) return { names: list('agent'), from: 'ds-config.json review.approvers.agent' };
  const owners = file ? ownersOf(file, rules) : [];
  if (owners.length) return { names: owners, from: 'CODEOWNERS' };
  return null;
}

// A reviewer the team did not name for this kind of change. A second agent review counts only where the team named an
// agent among the approvers ("agent" in the list).
export function approvalRefusal({ reviewer = null, approvers = null, kind = null } = {}) {
  if (!approvers?.names?.length || !reviewer) return null;
  const names = approvers.names.map(who);
  const mine = reviewer.kind === 'agent' ? 'agent' : who(reviewer.name);
  if (names.includes(mine)) return null;
  const what = kind ? { token: 'a new token', option: 'a new option of a component', value: 'a new value for a shared token', exception: 'an exception', reference: 'a new reference picture', agent: 'a change an agent made' }[kind] ?? 'this change' : 'this change';
  return `${reviewer.kind === 'agent' ? 'A second agent review' : reviewer.name} may not approve ${what}: ${approvers.names.join(', ')} may (${approvers.from}). Ask one of them.`;
}

// Each change the guard held that nobody signed off yet, with who may sign it. held: sign-off.mjs readHeld's map.
export function missingApprovals(held = {}, signOffs = [], { cfg = {}, rules = [] } = {}) {
  const signed = new Set((signOffs ?? []).filter((s) => s.by).map((s) => s.what));
  return Object.values(held ?? {}).filter((h) => h && !signed.has(h.what)).map((h) => {
    const kind = h.kind ?? kindOfFile(h.file, cfg);
    const a = approversFor({ kind, file: h.file, cfg, rules, agent: h.author?.kind === 'agent' });
    return { what: h.what, kind, names: a?.names ?? [], from: a?.from ?? null };
  });
}
export const missingLine = (m) => `${m.what}: waits for ${m.names.length ? `${m.names.join(' or ')} (${m.from})` : 'a named person other than whoever made it'}`;
