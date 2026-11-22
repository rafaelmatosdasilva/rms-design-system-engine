// request-issues.mjs - the requests answered on GitHub and GitLab by the engine itself, with no tooling of the team's.
//
// A team's tracker is tied to its requests by an exchange (requests.mjs): the open requests written out by key, and a
// file of answers read back. A team whose tracker the engine does not know writes its own bridge. One on GitHub or
// GitLab needs none: the engine already opens issues there (issues.mjs, issues-github.mjs, issues-gitlab.mjs), so
// here each open request gets one issue, keyed as every issue the engine opens is keyed, and its state is the answer.
//
//   requestIssue(row)                   → { key, title, body }: the issue a request opens
//   trackerAnswers(rows, issues)        → { answers: { key: { state, link, reason } }, adopted: [{ key, iid, title }] }
//   requestPlan(rows, issues)           → { open, close, already }: what to open and what to close
//
// Never twice. An issue is found by the key in its body. Before one is opened, an issue a person opened for the same
// need (its title says the need) is taken as that request's: it is read as the answer and nothing is opened beside it.
// The tracker's answer: an open issue is open, a closed one closed, one closed as not planned is declined (its reason
// kept as the decision agents are told), and one closed as a duplicate is closed with that said. An issue the engine
// opened whose request no prototype asks for any more, and nobody decided, is closed with the run that closed it.
import { keyLine, keyIn } from './issues.mjs';
import { DECISIONS } from './requests.mjs';

const OPEN = new Set(['new', 'decided', 'look again']);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const requestIssueKey = (key) => `request:${key}`;

export function requestIssue(r) {
  const asked = (r.asked ?? []).length ? `Asked for by ${r.asked.length === 1 ? 'one prototype' : `${r.asked.length} prototypes`}: ${r.asked.join(' · ')}.` : 'No prototype asks for it now.';
  const body = [
    `A ${r.kind ?? 'component'} the design system does not have: **${r.need}**.`, '',
    asked,
    ...(r.closest ? [`The nearest the system has: ${r.closest}.`] : []),
    ...(r.used ? [`Used meanwhile: ${r.used}.`] : []),
    ...(r.decision ? ['', `Decided: ${DECISIONS[r.decision]?.said ?? r.decision}${r.why ? `, because ${r.why}` : ''}${r.by ? ` (${r.by})` : ''}.`] : []),
    '', 'Close this issue when it is done, or close it as not planned to keep it out of the system: the design system\'s style guide reads its state back. Closed as not planned, its last comment or its closing reason is what agents are told.',
    '', keyLine(requestIssueKey(r.key)),
  ].join('\n');
  return { key: requestIssueKey(r.key), title: `Request: ${r.need}`, body };
}

// The issue a request already has: the engine's own, by its key, else one a person opened for the same need.
const ownOf = (issues, key) => issues.find((i) => keyIn(i.body) === requestIssueKey(key));
const personsOf = (issues, need) => { const n = norm(need); return n ? issues.find((i) => !keyIn(i.body) && i.state !== 'closed' && norm(i.title).includes(n)) : null; };

const answerOf = (i) => {
  if (i.state !== 'closed') return { state: 'open', ...(i.url ? { link: i.url } : {}) };
  const declined = i.reason === 'not_planned' || (i.labels ?? []).some((l) => /declined|won'?t ?(fix|do)|not planned/i.test(l));
  if (declined) return { state: 'declined', reason: 'declined in the team\'s tracker', ...(i.url ? { link: i.url } : {}) };
  return { state: 'closed', ...(i.reason === 'duplicate' ? { reason: 'a duplicate in the team\'s tracker' } : {}), ...(i.url ? { link: i.url } : {}) };
};

// issues: every issue of the project, open and closed, as the host modules give them.
export function trackerAnswers(rows = [], issues = []) {
  const answers = {}, adopted = [];
  for (const r of rows) {
    const own = ownOf(issues, r.key);
    if (own) { answers[r.key] = answerOf(own); continue; }
    const theirs = OPEN.has(r.status) ? personsOf(issues, r.need) : null;
    if (theirs) { answers[r.key] = answerOf(theirs); adopted.push({ key: r.key, iid: theirs.iid, title: theirs.title }); }
  }
  return { answers, adopted };
}

export function requestPlan(rows = [], issues = []) {
  const open = [], close = [];
  let already = 0;
  const rowOf = new Map(rows.map((r) => [requestIssueKey(r.key), r]));
  for (const r of rows) {
    if (!OPEN.has(r.status)) continue;
    if (ownOf(issues, r.key) || personsOf(issues, r.need)) { already++; continue; }
    open.push(requestIssue(r));
  }
  // The engine's own, still open, for a request that is gone: nobody asks for it and nobody decided it.
  for (const i of issues) {
    const k = keyIn(i.body);
    if (!k || !k.startsWith('request:') || i.state === 'closed') continue;
    const r = rowOf.get(k);
    if (!r || r.status === 'built') close.push({ iid: i.iid, key: k, title: i.title, note: r ? 'Closed by rms-design-system-engine: it is built, and no prototype lacks it any more.' : 'Closed by rms-design-system-engine: no prototype asks for it any more, and nobody decided it.' });
  }
  return { open, close, already };
}
