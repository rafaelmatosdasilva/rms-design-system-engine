// badges.mjs - writing the README's two live badges, and noticing when one has stopped being true.
//
// The badges live on the `badges` branch, an orphan branch holding nothing but them, and the README points straight
// at raw.githubusercontent.com. Why they are drawn here at all, rather than by an outside renderer, is in
// badge-svg.mjs: every other README image is already served that way and never breaks, and the two that were not
// were the only two GitHub proxied, so the only two that did.
//
// Each badge is written by the run that produces its number, so it is live without anything being fetched when the
// README is read: the suite writes its count as it finishes (tests.yml), and the Scorecard badge is written from the
// public API that this repository's own scorecard.yml publishes to, daily (badges.yml). A badge is only rewritten
// when it would actually change, so the branch does not take a commit per push.
//
// Drawing them here moves one risk, though, and it is worth saying plainly: an outside renderer that fails shows a
// broken image, which anybody can see, while a writer that fails leaves the last badge sitting there, still a badge,
// quietly out of date. Nobody would notice. So `check` asks the state the way release-due.mjs does, never the event:
// does the Scorecard badge still say what the API says, and has the suite's badge been written lately? Either answer
// going wrong for long enough opens one issue, kept current while it lasts and closed when it comes right.
//
//   node lib/badges.mjs tests <count> [--failing]  -> writes the suite's badge
//   node lib/badges.mjs scorecard                  -> reads the score and writes the Scorecard badge
//   node lib/badges.mjs check                      -> opens, updates or closes the one issue
//   node lib/badges.mjs report                     -> says what it found and writes nothing
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PRESETS } from './badge-svg.mjs';

export const BRANCH = 'badges';
export const TESTS = 'tests.svg';
export const SCORECARD = 'scorecard.svg';
// How long a badge may disagree with its source, or go unwritten, before it is worth an issue. The suite writes on
// every push to main and the Scorecard badge daily, so four days is several missed turns, not one slow afternoon.
export const STALE_DAYS = 4;
const ISSUE_TITLE = 'A README badge has stopped being written';
const ISSUE_LABEL = 'maintenance';

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
// Asking after something that may not be there yet is a normal answer here, not a fault, so what gh says about it
// stays out of the run's log. `--jq` is never used to pull a value out: it prints a bare string, which is not JSON.
const ghJson = (args) => {
  try { return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return null; }
};
const days = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

/** The score the OpenSSF publishes for this repository, as the badge should say it. */
export async function scorecardScore(repo) {
  const r = await fetch(`https://api.securityscorecards.dev/projects/github.com/${repo}`);
  if (!r.ok) throw new Error(`the Scorecard API answered ${r.status}`);
  const { score } = await r.json();
  if (typeof score !== 'number') throw new Error('the Scorecard API returned no score');
  // One decimal, as the API gives it and as the badge has always shown it.
  return score.toFixed(1);
}

/** What a badge on the branch says now, and when it was last written. Null when it is not there yet. */
export function badgeNow(repo, file) {
  const got = ghJson(['api', `repos/${repo}/contents/${file}?ref=${BRANCH}`]);
  if (!got?.content) return null;
  const svg = Buffer.from(got.content, 'base64').toString('utf8');
  const commits = ghJson(['api', `repos/${repo}/commits?sha=${BRANCH}&path=${file}&per_page=1`]);
  const commit = commits?.[0]?.commit?.committer?.date ?? null;
  // The badge says what it says in its own title, which is also what a screen reader reads out.
  const said = svg.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  return { sha: got.sha, svg, said, written: commit };
}

/** Writes one badge, and only when it would change. Returns what it did, for the run's own log. */
export function publish(repo, file, svg, message) {
  const now = badgeNow(repo, file);
  if (now && now.svg === svg) return `already says: ${now.said}`;
  gh(['api', '-X', 'PUT', `repos/${repo}/contents/${file}`,
    '-f', `message=${message}`,
    '-f', `branch=${BRANCH}`,
    '-f', `content=${Buffer.from(svg, 'utf8').toString('base64')}`,
    ...(now ? ['-f', `sha=${now.sha}`] : [])]);
  return `now says: ${svg.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''}`;
}

/** Is either badge wrong, and for how long? One answer, whatever the cause. */
export async function stale(repo) {
  const wrong = [];

  // The Scorecard badge is checked against the API it is drawn from, which is the whole truth of it. A fresh
  // difference is only the daily run not having come round yet, so it has to have lasted to count.
  try {
    const score = await scorecardScore(repo);
    const now = badgeNow(repo, SCORECARD);
    if (!now) wrong.push(`the Scorecard badge has never been written (the score is ${score})`);
    else if (!now.said.endsWith(` ${score}`) && days(now.written) > STALE_DAYS) {
      wrong.push(`the Scorecard badge says "${now.said}" and the API says ${score}, `
        + `and it has said so for ${Math.floor(days(now.written))} days`);
    }
  } catch (e) {
    wrong.push(`the Scorecard score could not be read: ${e.message}`);
  }

  // The suite's badge is written by the run that counts the tests, so what says it is current is that the run
  // itself keeps finishing. It runs on every push to main, so a gap of days is a gap in the writing, not a quiet week.
  const runs = ghJson(['run', 'list', '--repo', repo, '--workflow', 'tests.yml', '--branch', 'main',
    '--status', 'success', '--limit', '1', '--json', 'createdAt']);
  const last = runs?.[0]?.createdAt ?? null;
  if (!last) wrong.push('the suite has no successful run on main to write its badge');
  else if (days(last) > STALE_DAYS) {
    wrong.push(`the suite last finished on main ${Math.floor(days(last))} days ago, so its badge is that old`);
  }

  return wrong;
}

const issueBody = (wrong, repo) => [
  'The README shows two badges this repository writes itself, on the `badges` branch. One of them has stopped',
  'being written, or no longer says what it is drawn from.',
  '',
  ...wrong.map((w) => `- ${w}`),
  '',
  'A badge that is not written does not break: it keeps showing its last value, which is why this asks rather than',
  'waiting to be told. `node lib/badges.mjs report` says the same from a terminal.',
  '',
  `Written by \`lib/badges.mjs\` for ${repo}.`,
].join('\n');

const openIssue = (repo) => ghJson(['issue', 'list', '--repo', repo, '--state', 'open', '--search',
  `"${ISSUE_TITLE}" in:title`, '--json', 'number,title'])?.[0] ?? null;

export async function run(mode = 'report') {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set');

  if (mode === 'tests') {
    const failing = process.argv.includes('--failing');
    const count = process.argv[3] && process.argv[3] !== '--failing' ? process.argv[3] : '0';
    const svg = PRESETS.tests(count, failing);
    console.log(publish(repo, TESTS, svg, `tests: ${failing ? 'failing' : count}`));
    return;
  }
  if (mode === 'scorecard') {
    const score = await scorecardScore(repo);
    console.log(publish(repo, SCORECARD, PRESETS.scorecard(score), `scorecard: ${score}`));
    return;
  }

  const wrong = await stale(repo);
  console.log(wrong.length ? wrong.join('\n') : 'both badges are being written and say what they are drawn from');
  if (mode !== 'check') return wrong;

  const existing = openIssue(repo);
  if (wrong.length && !existing) {
    gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(wrong, repo),
      '--label', ISSUE_LABEL]);
    console.log('opened an issue: a badge has stopped being written');
  } else if (wrong.length && existing) {
    gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(wrong, repo)]);
    console.log(`issue #${existing.number} brought up to date`);
  } else if (!wrong.length && existing) {
    gh(['issue', 'close', String(existing.number), '--repo', repo,
      '--comment', 'Both badges are being written again.']);
    console.log(`issue #${existing.number} closed: the badges are current`);
  }
  return wrong;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  run(['tests', 'scorecard', 'check'].includes(arg) ? arg : 'report').catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
