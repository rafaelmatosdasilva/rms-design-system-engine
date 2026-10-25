// decided-by.mjs - who made a decision: the name a person gives (--by "<name>"), else the name their git uses
// (git config user.name), else none. Every decision the engine records keeps it with the day, so a decision is never
// only a date and a commit.
import { spawnSync } from 'node:child_process';

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
export function runBy(ROOT, argv = process.argv) {
  const name = decidedBy(ROOT, argv);
  const email = String(spawnSync('git', ['config', 'user.email'], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '').trim();
  return name && email ? { name, email } : null;
}
