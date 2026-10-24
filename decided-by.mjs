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
