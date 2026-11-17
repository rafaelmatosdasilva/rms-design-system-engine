// merge-stalled.mjs - a pull request that cannot merge, while looking as though it will.
//
// Every pull request here merges itself: it is opened, labelled, and auto-merge goes on, so GitHub merges it the
// moment its checks are green. Nobody watches one afterwards, which is right - until it cannot merge. Then it sits
// with a green tick and auto-merge on, indistinguishable from one merging in a minute, and the only thing that finds
// it is somebody wondering why a branch never landed. Two have sat for days that way.
//
// Three ways one stops without saying so:
//   • it conflicts with main - auto-merge waits for a rebase that no one has been asked for;
//   • a required check failed - auto-merge waits for a green that will never come without a push;
//   • auto-merge was never turned on - the rule says it goes on every pull request, and one without it waits for a
//     person who is not coming.
//
// A pull request is only stalled once it has had time to merge: a new one with checks still running is not stalled,
// it is new. So each needs an age, and the age is deliberately short - the point is to find it the same day.
export const WAITING_HOURS = 6;

// GitHub's own words for what it is: MERGEABLE, CONFLICTING, UNKNOWN (still being worked out, which is not a stall).
export function stalled(prs = [], now = new Date(), { hours = WAITING_HOURS } = {}) {
  const old = (pr) => (now.getTime() - Date.parse(pr.updatedAt ?? pr.createdAt ?? 0)) / 3600000 >= hours;
  const out = [];
  for (const pr of prs) {
    if (pr.isDraft) continue;                       // a draft is waiting on its author, and says so
    if (!old(pr)) continue;                         // not yet had time to merge
    const failed = (pr.statusCheckRollup ?? []).filter((c) => /FAILURE|TIMED_OUT|CANCELLED|ERROR|ACTION_REQUIRED/.test(c.conclusion ?? '')).map((c) => c.name ?? c.context).filter(Boolean);
    const why = pr.mergeable === 'CONFLICTING' ? 'it conflicts with main, and auto-merge waits for a rebase nobody has been asked for'
      : failed.length ? `${failed.join(', ')} failed, and auto-merge waits for a green that will not come on its own`
        : !pr.autoMergeRequest ? 'auto-merge is off, so it waits for a person, and every pull request here is meant to merge itself'
          : null;
    if (why) out.push({ number: pr.number, title: pr.title, why, hours: Math.floor((now.getTime() - Date.parse(pr.updatedAt ?? pr.createdAt)) / 3600000) });
  }
  return out;
}

const hoursSaid = (h) => (h >= 48 ? `${Math.floor(h / 24)} days` : `${h} hours`);
export function stallLines(list = []) {
  if (!list.length) return [];
  return [`${list.length} pull request${list.length === 1 ? '' : 's'} cannot merge, with nothing saying so:`,
    ...list.map((p) => `- **#${p.number}** ${p.title} — ${p.why} (${hoursSaid(p.hours)})`)];
}

// ── Asking GitHub, and keeping one issue current ─────────────────────────────────
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'A pull request cannot merge';
const gh = (args) => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };

export const openPulls = (repo) => { try { return JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number,title,isDraft,mergeable,autoMergeRequest,createdAt,updatedAt,statusCheckRollup']) || '[]'); } catch { return []; } };
const openIssue = (repo) => { try { return JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title']) || '[]').find((i) => i.title === ISSUE_TITLE) ?? null; } catch { return null; } };

export const issueBody = (lines, repo = '') => [
  'Every pull request here merges itself once its checks are green. These cannot, and nothing else would have said so:',
  '', ...lines, '',
  'Each is one push away: rebase the branch onto main, fix what failed, or turn auto-merge on. This issue closes when they are moving again.',
  '', `Asked daily by \`.github/workflows/merge-stalled.yml\`${repo ? ` in ${repo}` : ''}.`,
].join('\n');

export function run(mode = 'report', { repo = process.env.GITHUB_REPOSITORY ?? '', now = new Date(), prs = null } = {}) {
  const list = stalled(prs ?? openPulls(repo), now);
  const lines = stallLines(list);
  for (const l of lines) console.log(l);
  if (!lines.length) console.log('Every open pull request is merging itself, or is too new to say.');
  if (mode !== 'check' || !repo) return list;
  const existing = openIssue(repo);
  if (lines.length && !existing) { gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(lines, repo)]); console.log('opened an issue: a pull request cannot merge'); }
  else if (lines.length && existing) { gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(lines, repo)]); console.log(`issue #${existing.number} brought up to date`); }
  else if (!lines.length && existing) { gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', 'Every open pull request is merging itself again.']); console.log(`issue #${existing.number} closed`); }
  return list;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'report';
  if (!['report', 'check'].includes(mode)) { console.error('usage: node lib/merge-stalled.mjs [report | check]'); process.exit(2); }
  process.exit(run(mode, { repo: process.env.GITHUB_REPOSITORY || 'rafaelmatosdasilva/rms-design-system-engine' }).length ? 1 : 0);
}
