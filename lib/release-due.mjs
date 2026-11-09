// release-due.mjs - says when releasing has stopped, and raises an issue so somebody knows.
//
// Releases are automatic (`.github/workflows/release.yml`, every Monday), which means nobody watches them. On
// 5 November a run computed a version below the one npm already held, npm refused it, the run went red, and
// 37 commits then waited four days: every gate did its job and told no one. The same silence covers a schedule
// that never fires, which is the other thing that happened - of 18 release runs only one came from the schedule,
// every other was started by hand.
//
// So this asks the state, never the event: is there work on main that no tag covers, and how old is it? That one
// question catches a failed run, a schedule that did not fire, and a release nobody remembered, because it reads
// the outcome instead of any particular cause.
//
//   node lib/release-due.mjs check     -> says what it found; opens or updates one issue when a release is overdue
//   node lib/release-due.mjs report    -> says what it found and writes nothing (what a person runs by hand)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// A release is due weekly (CLAUDE.md, Releases). Overdue allows one day past that, so the hours between a Monday
// and the schedule's own run are never called a failure.
export const OVERDUE_DAYS = 8;
export const ISSUE_TITLE = 'Releasing has stopped';
export const ISSUE_LABEL = 'needs triage';

const sh = (args, cwd) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };

// The highest version among the tags HEAD can reach - the same question release.yml asks, and for the same reason:
// the nearest tag by ancestry is a lower version whenever tags do not land in version order.
export function lastTag(cwd = '.') { return sh(['tag', '--list', 'v[0-9]*', '--merged', 'HEAD', '--sort=-v:refname'], cwd).split('\n')[0] ?? ''; }

// What is waiting: the tag it is waiting on, how many commits, and how long the oldest has waited.
// → { tag, commits, days, overdue }
export function waiting(cwd = '.', now = new Date()) {
  const tag = lastTag(cwd);
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const commits = Number(sh(['rev-list', '--count', range], cwd) || 0);
  if (!commits) return { tag, commits: 0, days: 0, overdue: false };
  // The oldest commit no tag covers, by when it was committed: a branch written last week and merged today has
  // waited since today, which is when it reached the people a release is for.
  const oldest = sh(['log', range, '--format=%cI', '--reverse'], cwd).split('\n').filter(Boolean)[0];
  const days = oldest ? Math.floor((now - new Date(oldest)) / 86400000) : 0;
  return { tag, commits, days, overdue: days >= OVERDUE_DAYS };
}

// What the issue says. Written here, never built in a shell: the same rule the issue triage follows.
export function issueBody({ tag, commits, days }, repo = '') {
  const runs = repo ? `https://github.com/${repo}/actions/workflows/release.yml` : 'the release workflow';
  return [
    `${commits} commit${commits === 1 ? '' : 's'} on \`main\` are in no release, and the oldest has waited ${days} days. The last version is \`${tag || 'none'}\`.`,
    '',
    'Releases run on their own every Monday, so nothing here is waiting on a person — which is exactly why a release that stops stays stopped. Three things look the same from outside, and the runs say which it is:',
    '',
    `- **A run went red.** Check ${runs}. On 5 November one computed a version below the one npm already held and npm refused it, correctly; nobody saw the red for four days.`,
    '- **The schedule did not fire.** A workflow can be scheduled and still not run. The run list shows the event of each run: a stretch with no `schedule` run in it is this.',
    '- **Nothing is wrong and this is noise.** Then the ceiling here is wrong, not the release. Say so and change it.',
    '',
    'This issue is opened once and kept up to date while the wait lasts; it closes itself when a release goes out.',
  ].join('\n');
}

// The one issue this opens, so a wait that lasts days is one issue kept current and never a new one each run.
function openIssue(repo) {
  const out = gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title']);
  try { return (JSON.parse(out || '[]').find((i) => i.title === ISSUE_TITLE) ?? null); } catch { return null; }
}
const gh = (args) => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };

export function run(mode = 'report', { cwd = '.', repo = process.env.GITHUB_REPOSITORY ?? '', now = new Date() } = {}) {
  const w = waiting(cwd, now);
  const said = w.commits
    ? `${w.commits} commit${w.commits === 1 ? '' : 's'} since ${w.tag || 'the first commit'}, the oldest ${w.days} day${w.days === 1 ? '' : 's'} old${w.overdue ? ` — overdue, the ceiling is ${OVERDUE_DAYS}` : ''}`
    : `nothing waiting: ${w.tag || 'no tag'} covers main`;
  console.log(said);
  if (mode !== 'check' || !repo) return w;
  const existing = openIssue(repo);
  if (w.overdue && !existing) {
    gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(w, repo), '--label', ISSUE_LABEL]);
    console.log('opened an issue: releasing has stopped');
  } else if (w.overdue && existing) {
    gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(w, repo)]);
    console.log(`issue #${existing.number} brought up to date`);
  } else if (!w.overdue && existing) {
    // A release went out: the issue says what it was for and closes, rather than being left for somebody to tidy.
    gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', `A release went out: ${w.commits ? `${w.commits} commit${w.commits === 1 ? '' : 's'} waiting, the oldest ${w.days} days` : `nothing is waiting, ${w.tag} covers main`}.`]);
    console.log(`issue #${existing.number} closed: releasing started again`);
  }
  return w;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2] === 'check' ? 'check' : 'report');
}
