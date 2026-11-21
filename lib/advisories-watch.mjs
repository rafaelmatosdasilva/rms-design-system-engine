// advisories-watch.mjs - an advisory nothing can fix is said, not left to lower the score.
//
// Dependabot closes every advisory a newer version closes, and its pull requests merge themselves. Two kinds slip
// past that and are found only when somebody happens to look:
//
//   • one with no newer version to move to, or whose range is the advisory's own mistake (a "3.x" range with no end
//     matches 4.x too). It stays flagged, nothing opens, and the score falls with nobody told;
//   • one already answered in an `osv-scanner.toml`, where every entry carries the date to look again. That date
//     passes in silence, and the answer the team wrote stops applying without anyone deciding it should.
//
// This reads both and says what a person has to act on. It proposes nothing: an advisory is either fixed, reported
// upstream, or listed with its reason and a new date, and which of the three is never a machine's call.
//
//   entriesIn(text, folder)   → the answers one osv-scanner.toml holds
//   dueSoon(entries, now)     → the ones expiring, and the ones already expired
//   unanswered(flagged, …)    → an advisory flagged with no answer and no Dependabot pull request open
//   watchLines(state)         → what to say, for an issue or a run
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SOON_DAYS = 30;

// One file's entries. Only the three fields an answer is made of are read - the id, the date to look again, and why
// it stays - because those are the three a person needs to decide again. A TOML reader for the rest would be a
// dependency this repository does not have and does not need.
export function entriesIn(text = '', folder = '') {
  const out = [];
  for (const block of String(text).split(/\[\[IgnoredVulns\]\]/).slice(1)) {
    const id = /^\s*id\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (!id) continue;
    const until = /^\s*ignoreUntil\s*=\s*(\d{4}-\d{2}-\d{2})/m.exec(block)?.[1] ?? null;
    const reason = /^\s*reason\s*=\s*"([^"]*)"/m.exec(block)?.[1] ?? '';
    out.push({ id, until, reason, folder });
  }
  return out;
}

// Every answer the repository holds, wherever it keeps them.
export function answers(root, { skip = /node_modules|\.git/ } = {}) {
  const found = [];
  const walk = (dir) => {
    let names; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (skip.test(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'osv-scanner.toml') { try { found.push(...entriesIn(readFileSync(p, 'utf8'), slashed(relative(root, dir)) || '.')); } catch { /* unreadable */ } }
    }
  };
  walk(root);
  return found;
}

const days = (from, to) => Math.round((Date.parse(to) - from.getTime()) / 86400000);

// The answers that are running out. An entry with no date never expires and is said once, separately: it is an
// answer nobody will look at again, which is the thing an expiry date exists to prevent.
export function dueSoon(entries = [], now = new Date(), { soon = SOON_DAYS } = {}) {
  const expired = [], soonest = [], undated = [];
  for (const e of entries) {
    if (!e.until) { undated.push(e); continue; }
    const left = days(now, e.until);
    if (left < 0) expired.push({ ...e, days: left });
    else if (left <= soon) soonest.push({ ...e, days: left });
  }
  const by = (a, b) => a.days - b.days;
  return { expired: expired.sort(by), soon: soonest.sort(by), undated };
}

// An advisory the scanner still flags, with no answer written and no Dependabot pull request open for it: nothing
// is coming, and nobody has decided it may stay.
export function unanswered(flagged = [], entries = [], open = []) {
  const answered = new Set(entries.map((e) => e.id));
  const coming = open.map((t) => String(t ?? '')).join('\n');
  return flagged.filter((id) => !answered.has(id) && !coming.includes(id));
}

export function watchLines({ expired = [], soon = [], undated = [], unanswered: none = [] } = {}) {
  const lines = [];
  const say = (e) => `- \`${e.id}\` in ${e.folder}${e.days === undefined ? '' : e.days < 0 ? `, ${-e.days} day${-e.days === 1 ? '' : 's'} ago` : `, in ${e.days} day${e.days === 1 ? '' : 's'}`}${e.reason ? ` — ${e.reason}` : ''}`;
  if (expired.length) lines.push(`${expired.length} answer${expired.length === 1 ? ' has' : 's have'} run out, and the scanner counts ${expired.length === 1 ? 'it' : 'them'} again:`, ...expired.map(say));
  if (soon.length) lines.push(`${soon.length} answer${soon.length === 1 ? '' : 's'} to look at again within ${SOON_DAYS} days:`, ...soon.map(say));
  if (none.length) lines.push(`${none.length} advisory${none.length === 1 ? '' : ' advisories'} flagged with nothing coming and no answer written:`, ...none.map((id) => `- \`${id}\` — fix it, report the range upstream, or answer it in that folder's osv-scanner.toml with the reason and a date`));
  if (undated.length) lines.push(`${undated.length} answer${undated.length === 1 ? '' : 's'} with no date to look again, which is what a date is for:`, ...undated.map(say));
  return lines;
}

// ── What is flagged now, and what is coming ──────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slashed } from './shown-path.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO = 'rafaelmatosdasilva/rms-design-system-engine';
export const ISSUE_TITLE = 'An advisory nothing can fix';

// The advisories the published Scorecard still counts. It is read rather than run: the run is the one GitHub makes,
// which is the score people see. → [id]
export async function flaggedNow({ fetchImpl = fetch, repo = REPO } = {}) {
  try {
    const r = await fetchImpl(`https://api.securityscorecards.dev/projects/github.com/${repo}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ids: [], why: `the Scorecard answered ${r.status}` };
    const j = await r.json();
    const v = (j?.checks ?? []).find((c) => /vulnerabilities/i.test(c.name ?? ''));
    if (!v) return { ids: [], why: 'the Scorecard has no Vulnerabilities check yet' };
    const ids = [...new Set((v.details ?? []).flatMap((d) => [...String(d).matchAll(/\b(GHSA-[\w-]+|CVE-\d{4}-\d+)\b/g)].map((m) => m[1])))];
    return { ids, score: v.score ?? null, why: null };
  } catch (e) { return { ids: [], why: `the Scorecard could not be read: ${String(e?.message ?? e).split('\n')[0]}` }; }
}

const gh = (args) => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
export const dependabotOpen = (repo = REPO) => { try { return JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'title,headRefName']) || '[]').map((p) => `${p.title} ${p.headRefName}`); } catch { return []; } };
const openIssue = (repo) => { try { return JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title']) || '[]').find((i) => i.title === ISSUE_TITLE) ?? null; } catch { return null; } };

export function issueBody(state, lines) {
  return [
    'Dependabot closes every advisory a newer version closes. These are the ones it cannot:',
    '', ...lines, '',
    'Each is one of three things, and which is never a machine\'s call: **fix it** (a newer version exists after all), **report the range upstream** (the advisory matches versions it was fixed in), or **answer it** in that folder\'s `osv-scanner.toml` with the reason and a date to look again.',
    '', `Asked every week by \`.github/workflows/advisories.yml\`, and this issue closes when there is nothing left to say.`,
  ].join('\n');
}

export async function run(mode = 'report', { root = ENGINE, repo = process.env.GITHUB_REPOSITORY || REPO, now = new Date(), fetchImpl = fetch } = {}) {
  const entries = answers(root);
  const due = dueSoon(entries, now);
  const flagged = await flaggedNow({ fetchImpl, repo });
  const state = { ...due, unanswered: unanswered(flagged.ids, entries, dependabotOpen(repo)) };
  const lines = watchLines(state);
  if (flagged.why) console.log(`ℹ️  ${flagged.why}: only the answers already written were read.`);
  for (const l of lines) console.log(l);
  if (!lines.length) console.log(`Nothing to act on: ${entries.length} answer${entries.length === 1 ? '' : 's'} written, none running out, and nothing flagged that nothing is coming for.`);
  if (mode !== 'check' || !process.env.GITHUB_REPOSITORY) return { state, lines };
  const existing = openIssue(repo);
  if (lines.length && !existing) { gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(state, lines)]); console.log('opened an issue: an advisory nothing can fix'); }
  else if (lines.length && existing) { gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(state, lines)]); console.log(`issue #${existing.number} brought up to date`); }
  else if (!lines.length && existing) { gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', 'Every advisory is fixed, answered with a date, or has something coming.']); console.log(`issue #${existing.number} closed`); }
  return { state, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'report';
  if (!['report', 'check'].includes(mode)) { console.error('usage: node lib/advisories-watch.mjs [report | check]'); process.exit(2); }
  const { lines } = await run(mode);
  process.exit(lines.length ? 1 : 0);
}
