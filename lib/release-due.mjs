// release-due.mjs - what one version covers, whether one is due, and when releasing has stopped.
//
// A version covers a set amount of work, never a date: it goes out once RELEASE_EVERY commits on main are in no
// release yet, and the step (patch, minor or major) comes from those pull requests' own labels (release-version.mjs).
// The release workflow asks this question once a day, so two versions never land the same day and none covers a
// handful of commits. Before this, a release was the week's record, and the dates said nothing: v3.5.0 held 37
// commits, v3.6.0 six of them two hours later, and of 18 release runs exactly one came from the Monday schedule -
// every other was started by hand (test/skill-evals/FINDINGS.md).
//
// Releases are automatic, which means nobody watches them. On 5 November a run computed a version below the one npm
// already held, npm refused it, the run went red, and 37 commits then waited four days: every gate did its job and
// told no one. A schedule that never fires looks exactly the same from outside, and that happened too.
//
// So this asks the state, never the event: is a version due, and how long has it been due? That one question catches
// a failed run, a schedule that did not fire, and a release nobody remembered, because it reads the outcome instead
// of any particular cause.
//
//   node lib/release-due.mjs due       -> "yes"/"no" and what is waiting, for release.yml's own gate
//   node lib/release-due.mjs check     -> says what it found; opens or updates one issue when a release is overdue
//   node lib/release-due.mjs report    -> says what it found and writes nothing (what a person runs by hand)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// What one version covers. A floor, not a target: fewer commits than this is no version at all, however long they
// have waited, because a six-commit version told the owner nothing about what had happened. The owner sets it
// (15 since 14 November 2026, shorter notes still; 25 from 11 November, 50 for the two days before that, which
// read the wrong way round: a version is a set of notes somebody has to read, and 45 entries in one list is nobody's
// changelog. Half of that is still a comparable piece of work and stays short enough to read.
export const RELEASE_EVERY = 15;
// Once the group is complete the next daily run releases it, so a day is the whole wait. Two allows for the hours
// between the group completing and that run, so a release that is merely pending is never called a failure.
export const OVERDUE_DAYS = 2;
export const ISSUE_TITLE = 'Releasing has stopped';
export const ISSUE_LABEL = 'needs triage';

const DAY = 86400000;
const sh = (args, cwd) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };

// The highest version among the tags HEAD can reach - the same question release.yml asks, and for the same reason:
// the nearest tag by ancestry is a lower version whenever tags do not land in version order.
export function lastTag(cwd = '.') { return sh(['tag', '--list', 'v[0-9]*', '--merged', 'HEAD', '--sort=-v:refname'], cwd).split('\n')[0] ?? ''; }

// What is waiting: the tag it is waiting on, how many commits, how long the oldest has waited, whether that is a
// version yet and how long it has been one.
// → { tag, commits, days, due, dueDays, overdue }
export function waiting(cwd = '.', now = new Date()) {
  const tag = lastTag(cwd);
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const commits = Number(sh(['rev-list', '--count', range], cwd) || 0);
  if (!commits) return { tag, commits: 0, days: 0, due: false, dueDays: 0, overdue: false };
  // Every waiting commit by when it was committed, oldest first: a branch written last week and merged today has
  // waited since today, which is when it reached the people a release is for.
  const at = sh(['log', range, '--format=%cI', '--reverse'], cwd).split('\n').filter(Boolean).map((d) => new Date(d));
  const days = Math.floor((now - at[0]) / DAY);
  const due = commits >= RELEASE_EVERY;
  // The commit that completed the group, not the oldest: fifty commits gathered slowly became a version on the day
  // the fiftieth landed, and nothing was late before that.
  const dueDays = due ? Math.floor((now - at[RELEASE_EVERY - 1]) / DAY) : 0;
  return { tag, commits, days, due, dueDays, overdue: due && dueDays >= OVERDUE_DAYS };
}

// What the issue says. Written here, never built in a shell: the same rule the issue triage follows.
export function issueBody({ tag, commits, days, dueDays }, repo = '') {
  const runs = repo ? `https://github.com/${repo}/actions/workflows/release.yml` : 'the release workflow';
  return [
    `${commits} commits on \`main\` are in no release, and the oldest has waited ${days} days. A version covers ${RELEASE_EVERY} commits, so this one has been due for ${dueDays} days. The last version is \`${tag || 'none'}\`.`,
    '',
    'Releases run on their own, asked once a day, so nothing here is waiting on a person — which is exactly why a release that stops stays stopped. Three things look the same from outside, and the runs say which it is:',
    '',
    `- **A run went red.** Check ${runs}. On 5 November one computed a version below the one npm already held and npm refused it, correctly; nobody saw the red for four days.`,
    '- **The schedule did not fire.** A workflow can be scheduled and still not run. The run list shows the event of each run: a stretch with no `schedule` run in it is this.',
    `- **Nothing is wrong and this is noise.** Then ${RELEASE_EVERY} commits a version is the wrong number, not the release. Say so and change it.`,
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

// What is waiting, in one line a person reads.
export function said(w) {
  if (!w.commits) return `nothing waiting: ${w.tag || 'no tag'} covers main`;
  const since = `${w.commits} commit${w.commits === 1 ? '' : 's'} since ${w.tag || 'the first commit'}, the oldest ${w.days} day${w.days === 1 ? '' : 's'} old`;
  if (!w.due) return `${since} — ${RELEASE_EVERY - w.commits} short of a version`;
  return `${since} — a version is due${w.overdue ? `, and has been for ${w.dueDays} days: overdue, the ceiling is ${OVERDUE_DAYS}` : ''}`;
}

export function run(mode = 'report', { cwd = '.', repo = process.env.GITHUB_REPOSITORY ?? '', now = new Date() } = {}) {
  const w = waiting(cwd, now);
  // The release workflow's own gate reads the first word, so it comes first and nothing is printed before it.
  if (mode === 'due') { console.log(`${w.due ? 'yes' : 'no'} ${said(w)}`); return w; }
  console.log(said(w));
  if (mode !== 'check' || !repo) return w;
  const existing = openIssue(repo);
  if (w.overdue && !existing) {
    gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(w, repo), '--label', ISSUE_LABEL]);
    console.log('opened an issue: releasing has stopped');
  } else if (w.overdue && existing) {
    gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(w, repo)]);
    console.log(`issue #${existing.number} brought up to date`);
  } else if (!w.overdue && existing) {
    // A release went out, or the group is not complete yet: the issue says what it was for and closes, rather than
    // being left for somebody to tidy.
    gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', `${said(w)}.`]);
    console.log(`issue #${existing.number} closed: releasing started again`);
  }
  return w;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  run(arg === 'check' || arg === 'due' ? arg : 'report');
}
