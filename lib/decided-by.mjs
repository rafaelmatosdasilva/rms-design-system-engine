// decided-by.mjs - who made a decision: the name a person gives (--by "<name>"), else the name their git uses
// (git config user.name), else none. Every decision the engine records keeps it with the day, so a decision is never
// only a date and a commit. And who is to make one (ownerOf, below): what waits on a person is shown with the name of
// the one it waits on.
import { spawnSync } from 'node:child_process';
import { runOf } from './who-did-it.mjs';

export function decidedBy(ROOT, argv = process.argv) {
  const i = argv.indexOf('--by');
  const given = i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  if (given) return String(given).trim();
  const git = spawnSync('git', ['config', 'user.name'], { cwd: ROOT, encoding: 'utf8' });
  return String(git.stdout ?? '').trim() || null;
}

// Who ran it, for a commit the engine makes in a team's store: the person decidedBy names, with the address their git
// uses. A store is usually written with the team's own token (a pipeline's), so without this every commit reads as
// that token and nobody can tell whose run made which change. GitLab keeps the token's owner as the committer either
// way, which is what its roles and its audit trail are about; this names the author, as git always has.
// Both or neither: GitLab takes an author only as a name and an address together. A checkout with no git identity of
// its own (a pipeline's) gets null, and its commits read as the token, exactly as they do today.
// In a pipeline, the git identity is configuration rather than a person, so who started the pipeline is used instead
// (who-did-it.mjs): the one who pushed, ran it by hand or opened the merge request. A scheduled pipeline has nobody
// behind it, so it gets null and its commits read as the token, with a Run-by trailer saying so (stores.mjs): the
// schedule's owner did nothing that night and is never named as if they had. A name given with --by still wins.
export function runBy(ROOT, argv = process.argv, env = process.env) {
  const email = String(spawnSync('git', ['config', 'user.email'], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '').trim();
  const i = argv.indexOf('--by');
  const given = i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? String(argv[i + 1]).trim() : null;
  if (given) return email ? { name: given, email } : null;
  const run = runOf(env);
  if (run) return run.how === 'person' && run.name && run.email ? { name: run.name, email: run.email } : null;
  const name = decidedBy(ROOT, []);
  return name && email ? { name, email } : null;
}

// Who is to decide: ds-config.json → owners, each component, area or glob to the person or team that owns it, "*" for
// the rest. A value is a name ("Cards team"), or { team, decides } when the person who decides is not the team's name.
//   ownerOf(owners, ...about) → { name, team, key } | null: about is what waits (a component's name, then its area, such
//     as "patterns/Checkout"); the longest key that fits wins: the name itself, a glob ("tile*", "patterns/*"), a prefix
//     ending in "/" ("patterns/"), else "*". name is who decides; team, who owns it.
//   notTheOwner(by, owner) → true when a recorded answer was given by someone else than the owner: said, never blocked.
const flat = (s) => String(s ?? '').trim().toLowerCase();
const globOf = (k) => new RegExp(`^${flat(k).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
export function ownerOf(owners, ...about) {
  if (!owners || typeof owners !== 'object') return null;
  const keys = Object.keys(owners).filter((k) => k !== '*' && !k.startsWith('_')).sort((a, b) => b.length - a.length);
  const fits = (k, a) => { const kl = flat(k), al = flat(a); return al === kl || (kl.includes('*') ? globOf(k).test(al) : kl.endsWith('/') && al.startsWith(kl)); };
  const whom = (k) => { const v = owners[k]; if (typeof v === 'string' && v.trim()) return { name: v.trim(), team: v.trim(), key: k }; if (v && typeof v === 'object' && (v.decides || v.team)) return { name: String(v.decides ?? v.team).trim(), team: String(v.team ?? v.decides).trim(), key: k }; return null; };
  for (const a of about.filter(Boolean)) for (const k of keys) if (fits(k, a)) { const w = whom(k); if (w) return w; }
  return owners['*'] ? whom('*') : null;
}
export const notTheOwner = (by, owner) => !!(by && owner?.name && flat(by) !== flat(owner.name) && flat(by) !== flat(owner.team));

// How many wait on each person: [{ name, n }], most first. items: [{ decider: { name } | null }].
export function waitingOn(items = []) {
  const n = new Map();
  for (const x of items) if (x?.decider?.name) n.set(x.decider.name, (n.get(x.decider.name) ?? 0) + 1);
  return [...n].map(([name, k]) => ({ name, n: k })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
export const waitingLine = (list) => list.map((w) => `${w.n} waiting on ${w.name}`).join(', ');
