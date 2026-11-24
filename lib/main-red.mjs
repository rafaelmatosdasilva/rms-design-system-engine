// main-red.mjs - main's own suite has been failing, and nothing was going to say so.
//
// Every pull request here merges itself, and main's ruleset does not make a branch catch up first (strict is off, on
// purpose: with a quarter-hour suite and seven pull requests in a day, making every open branch rebase and run again
// after each merge would serialize all of them). The cost of that choice is a pair of changes that are each right
// alone and wrong together, and on 24 November 2026 it was paid. #701's run started at 09:00:51 against main as it
// then stood. #699 merged at 09:02:28, putting one more badge in the README. #701's quarters finished green at
// 09:11-09:19, having never seen that README, and auto-merge landed it at 09:23:18 against a list that did not know
// the badge. main was red from that moment, through #702 and #703, and what found it was somebody running the suite
// on their own machine for an unrelated reason, forty minutes later.
//
// Nothing here was broken. release-due.yml watches releases, merge-stalled.yml watches pull requests that cannot
// land, badges.yml watches the README's badges - and not one of them watches main. So this asks the same way they
// do, the state and never the event: how many runs in a row has main's suite failed? That one question catches a
// change that broke it, two changes that only broke it together, and a run wedged and reporting nothing, because it
// reads the outcome rather than any particular cause.
//
// ── Why it counts runs in a row, and why three ────────────────────────────────────
//
// Speaking at the first red run would be useless, because some red runs here mean nothing. Of main's last 25 runs,
// four failed on their own and were green again on the very next run: the browser checks on Windows lose their
// browsing context now and then (a Firefox BiDi DiscardedBrowsingContextError, which the fix/bidi branches are
// separately chasing), and a quarter of the suite has flaked once too. A watcher that spoke for each of those would
// be noise, and a noisy watcher gets turned off, which is worse than none.
//
// What told the real breakage apart was not which job failed - the genuinely broken quarter and one of the flakes
// were the same job - but that it did not stop. The flakes were one run each. The breakage was four in a row. So the
// signal is the streak, not the name, and the names are reported underneath as detail rather than used to decide.
//
// Three in a row is the floor, which in those 25 runs no flake ever reached and the one real breakage passed on its
// third. Three merges is usually under an hour here. But a red main is also a reason to stop merging, and a streak
// that stops growing would never speak at all - so a streak of two that has stood for RED_HOURS with nothing green
// since says it too. One lone red run never speaks, however long it stands, because one lone red run is the thing
// that is usually nothing.
//
//   node lib/main-red.mjs report   -> says what it found and writes nothing
//   node lib/main-red.mjs check    -> opens, updates or closes the one issue

// How many failures in a row before it is worth saying. Tuned from main's own history, above.
export const RED_RUNS = 3;
// Or two, standing this long with nothing green after them: a red main is a reason not to merge, and no merges means
// no further runs, so the streak can stop growing exactly when it matters most.
export const RED_HOURS = 6;
// The check main's ruleset requires is the sum of the quarters, so it fails whenever any of them does. It is named
// last in the issue, after the jobs that actually failed, because on its own it says only "something did".
export const SUMMARY_JOB = 'test';

const hours = (iso, now) => (now.getTime() - Date.parse(iso)) / 3600000;
const SETTLED = new Set(['success', 'failure', 'timed_out', 'startup_failure']);

/**
 * How long main has been red, and what has been failing while it was.
 *
 * @param {object[]} runs  main's own runs of the suite, newest first:
 *                         { status, conclusion, createdAt, failed: string[], url, title }
 * @param {Date} now
 * @returns {null|object}  null while there is nothing to say; otherwise the streak, when it started, the jobs that
 *                         failed in every run of it, and the ones that failed in only some.
 */
export function red(runs = [], now = new Date(), { redRuns = RED_RUNS, redHours = RED_HOURS } = {}) {
  // A run still going, or cancelled, is neither a pass nor a failure: it neither extends a streak nor breaks one,
  // so it is left out rather than guessed at.
  const settled = runs.filter((r) => r.status === 'completed' && SETTLED.has(r.conclusion));
  if (!settled.length || settled[0].conclusion === 'success') return null;

  const streak = [];
  for (const r of settled) {
    if (r.conclusion === 'success') break;
    streak.push(r);
  }
  const since = streak[streak.length - 1].createdAt;
  const stood = hours(since, now);
  // Three in a row, or two that have stood long enough that no more are coming. Never one.
  if (!(streak.length >= redRuns || (streak.length >= 2 && stood >= redHours))) return null;

  // Each job with the number of the streak's runs it failed in, rather than a verdict on which are flaking: a streak
  // that opens with a flake would otherwise show the real cause as the intermittent one, which is what main's own
  // history does (09:14 was the browsers on Windows, 09:23 and 09:30 were a quarter of the suite). The counts say
  // the same thing without having to be right about it.
  const counted = new Map();
  for (const r of streak) for (const job of new Set(r.failed ?? [])) counted.set(job, (counted.get(job) ?? 0) + 1);
  const order = (a, b) => (a === SUMMARY_JOB ? 1 : b === SUMMARY_JOB ? -1 : a.localeCompare(b));
  const jobs = [...counted].map(([name, failed]) => ({ name, failed }))
    .sort((a, b) => b.failed - a.failed || order(a.name, b.name));
  return { runs: streak.length, since, hours: Math.floor(stood), jobs, latest: streak[0] };
}

/** A run that started and never finished says as little as one that failed, and looks like nothing at all. */
export function stuck(runs = [], now = new Date(), { redHours = RED_HOURS } = {}) {
  const top = runs[0];
  if (!top || top.status === 'completed') return null;
  const waited = hours(top.createdAt, now);
  return waited >= redHours ? { hours: Math.floor(waited), run: top } : null;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const said = (n) => (n.hours >= 48 ? `${Math.floor(n.hours / 24)} days` : plural(n.hours, 'hour'));

export function lines(state, wedged) {
  const out = [];
  if (state) {
    out.push(`main's suite has failed ${plural(state.runs, 'run')} in a row, the oldest ${said(state)} ago.`);
    if (state.jobs.length) {
      out.push('', `What failed, and in how many of those ${state.runs}:`);
      for (const j of state.jobs) {
        out.push(`- \`${j.name}\` in ${j.failed}${j.name === SUMMARY_JOB
          ? ' — the check the ruleset requires, which fails whenever any quarter does' : ''}`);
      }
    }
    if (state.latest?.url) out.push('', `The latest: ${state.latest.url}`);
  }
  if (wedged) {
    out.push(...(out.length ? [''] : []),
      `main's latest run has been going for ${said(wedged)} without finishing, which reports nothing at all.`);
    if (wedged.run?.url) out.push('', `It is here: ${wedged.run.url}`);
  }
  return out;
}

// ── Asking GitHub, and keeping one issue current ─────────────────────────────────
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'main is failing';
export const ISSUE_LABEL = 'needs triage';
// Enough to see a streak well past the floor without asking after each one's jobs for nothing.
export const LOOK_BACK = 8;

const gh = (args) => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
const json = (args, fallback) => { try { return JSON.parse(gh(args) || JSON.stringify(fallback)); } catch { return fallback; } };

/** main's own runs of the suite, newest first, each with the jobs that failed in it. */
export function mainRuns(repo, limit = LOOK_BACK) {
  const runs = json(['run', 'list', '--repo', repo, '--workflow', 'tests.yml', '--branch', 'main',
    '--limit', String(limit), '--json', 'databaseId,status,conclusion,createdAt,url,displayTitle'], []);
  return runs.map((r) => ({
    ...r,
    title: r.displayTitle,
    // Only a failed run is asked after: a green one's jobs are never read, and a streak stops at the first green.
    failed: r.conclusion === 'failure' || r.conclusion === 'timed_out'
      ? json(['run', 'view', String(r.databaseId), '--repo', repo, '--json', 'jobs'], { jobs: [] })
        .jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name)
      : [],
  }));
}

const openIssue = (repo) => json(['issue', 'list', '--repo', repo, '--state', 'open', '--search',
  `"${ISSUE_TITLE}" in:title`, '--json', 'number,title'], []).find((i) => i.title === ISSUE_TITLE) ?? null;

export const issueBody = (body, repo = '') => [
  'Every pull request here merges itself once its checks are green, and main is not made to catch up first. That is',
  'deliberate, and this is its cost: two changes that are each right alone can be wrong together, and the one that',
  'lands second is green when it lands.',
  '', ...body, '',
  'This is not opened for a single red run, because a single red run here is usually a browser losing its context.',
  'It is opened once failing has carried on, so it is worth a look. It closes itself when a run on main goes green.',
  '', `Asked by \`.github/workflows/main-red.yml\`${repo ? ` in ${repo}` : ''}; \`node lib/main-red.mjs report\` asks the same and writes nothing.`,
].join('\n');

export function run(mode = 'report', { repo = process.env.GITHUB_REPOSITORY ?? '', now = new Date(), runs = null } = {}) {
  const got = runs ?? (repo ? mainRuns(repo) : []);
  const state = red(got, now);
  const wedged = stuck(got, now);
  const body = lines(state, wedged);
  for (const l of body.length ? body : ['main is green, or has not failed for long enough to be worth saying.']) console.log(l);
  if (mode !== 'check' || !repo) return { state, wedged };

  const existing = openIssue(repo);
  if (body.length && !existing) {
    gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(body, repo), '--label', ISSUE_LABEL]);
    console.log('opened an issue: main is failing');
  } else if (body.length && existing) {
    gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(body, repo)]);
    console.log(`issue #${existing.number} brought up to date`);
  } else if (!body.length && existing) {
    gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', 'A run on main has gone green again.']);
    console.log(`issue #${existing.number} closed: main is green`);
  }
  return { state, wedged };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'report';
  if (!['report', 'check'].includes(mode)) {
    console.error('usage: node lib/main-red.mjs [report | check]');
    process.exit(2);
  }
  run(mode, { repo: process.env.GITHUB_REPOSITORY || 'rafaelmatosdasilva/rms-design-system-engine' });
}
