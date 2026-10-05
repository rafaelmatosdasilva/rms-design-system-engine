// component-changelog.mjs - each component's changelog and links, for the style guide, from what the project already
// holds: its git history, its repository, its release tags and the Figma file key. No network.
//
// repoUrl(ROOT) → 'https://github.com/owner/repo' | null (package.json repository, else the origin remote)
// changelogs(ROOT, comps, { max }) → { name: [{ sha, short, date, subject, release, pr }] }
//   comps: [{ name, files, pattern? }]: its own files, and when they are shared (a theme stylesheet), the pattern a
//   changed line must hold (its class), so only the commits that touched it are listed.
// commitUrl / prUrl: links in the repository's own host form (GitHub, GitLab).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (ROOT, args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); return r.status === 0 ? r.stdout : ''; };

export function normalizeRepo(url) {
  let u = String(url ?? '').trim().replace(/^git\+/, '').replace(/\.git$/, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(u);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  u = u.replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  return /^https?:\/\/[^/]+\/.+/.test(u) ? u.replace(/\/$/, '') : null;
}

export function repoUrl(ROOT) {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const r = normalizeRepo(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url);
    if (r) return r;
  } catch { /* no package.json */ }
  return normalizeRepo(git(ROOT, ['remote', 'get-url', 'origin']).trim());
}

const gitlab = (repo) => /gitlab/i.test(repo ?? '');
export const commitUrl = (repo, sha) => (repo && sha ? `${repo}${gitlab(repo) ? '/-' : ''}/commit/${sha}` : null);
export const prUrl = (repo, n) => (repo && n ? `${repo}${gitlab(repo) ? '/-/merge_requests/' : '/pull/'}${n}` : null);
export const fileUrl = (repo, branch, file, line) => (repo && file ? `${repo}${gitlab(repo) ? '/-' : ''}/blob/${branch}/${file}${line ? `#L${line}` : ''}` : null);
// The branch the repository publishes from: the origin's default, else main.
export const defaultBranch = (ROOT) => git(ROOT, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '') || 'main';

export function changelogs(ROOT, comps = [], { max = 15 } = {}) {
  const out = {};
  for (const c of comps) {
    if (!c.files?.length) continue;
    const args = ['log', `--max-count=${max}`, '--no-merges', '--format=%H%x1f%aI%x1f%s', ...(c.pattern ? ['-G', c.pattern] : []), '--', ...c.files];
    const rows = git(ROOT, args).split('\n').filter(Boolean).map((l) => { const [sha, date, subject] = l.split('\x1f'); return { sha, short: sha.slice(0, 7), date, subject }; });
    if (rows.length) out[c.name] = rows;
  }
  const shas = [...new Set(Object.values(out).flat().map((r) => r.sha))];
  if (!shas.length) return out;
  // The release each one shipped in: the nearest version tag that holds it (v2.0.1~3 → v2.0.1); none yet, none.
  const names = git(ROOT, ['name-rev', '--tags', '--refs=v[0-9]*', '--name-only', ...shas]).split('\n');
  const release = Object.fromEntries(shas.map((s, i) => [s, /^(v[\d.]+[\w.-]*?)(?:[~^]\d*)*$/.exec(names[i] ?? '')?.[1] ?? null]));
  // The pull request each one came in with: its own subject (#12), else the merge that brought it in.
  const pr = {};
  for (const line of git(ROOT, ['log', '--merges', '--format=%H%x1f%s', '-200']).split('\n').filter(Boolean)) {
    const [m, s] = line.split('\x1f'); const n = /#(\d+)/.exec(s)?.[1]; if (!n) continue;
    for (const sha of git(ROOT, ['rev-list', `${m}^1..${m}^2`]).split('\n').filter(Boolean)) pr[sha] ??= n;
  }
  for (const list of Object.values(out)) for (const r of list) { r.release = release[r.sha]; r.pr = /\(#(\d+)\)/.exec(r.subject)?.[1] ?? pr[r.sha] ?? null; }
  return out;
}
