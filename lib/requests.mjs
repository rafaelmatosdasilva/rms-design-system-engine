// requests.mjs - what teams ask the system for, and what the system's team decided.
//
// A prototype that needs something the system lacks says so (a Missing box, a gap: prototype-pieces.mjs), and the
// check keeps every prototype's gaps (gaps.json). They reached the team only as documentation drafts, text to approve,
// while a gap is a decision to make: build it, use something the system has, or say no. So each need becomes a
// request, one however many prototypes ask for it (its key is the kind and the need, as mergeGaps groups them), with
// who asked and what it uses meanwhile, and the team's decision beside it.
//
// The decisions are the team's, kept in design-system-engine-requests.json (committed): kept out of the system,
// accepted in the product, accepted for now (with a day to look again), or brought into the system. A request brought
// in is Built by itself once no prototype lacks it any more. One kept out is a decision agents are told
// (decisions.mjs), so nobody asks again.
//
// A team's tracker is never talked to: the tie is an exchange. The open requests are written out with their keys
// (.design-system-engine-out/requests/requests.json), and a file of answers the team's own tooling writes is read back
// (design-system-engine-requests.answers.json: each key with its state, the ticket's link, and a reason), so the
// matching against the tracker and the ticket are that tooling's. A request leaves the open list by whichever comes
// first: the tracker closes or declines it, or the checks stop finding the gap.
//
//   requestKey(gap)                         → the key a request keeps however many prototypes ask for it
//   DECISIONS                               → the decisions a request takes, by their key in the file
//   readDecisions(ROOT), readAnswers(ROOT)  → the team's decisions, the tracker's answers
//   requestsFrom({ merged, decisions, answers, today }) → the rows, open first
//   decideRequest(ROOT, key, decision, opts) → writes the decision, by the person who gave it
//   exportRequests(ROOT, rows)              → { file, open }: the open requests, for a team's tracker
//   requestLines(rows)                      → the report a terminal prints
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { projectPath, OUT_DIR } from './names.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const requestKey = (g) => `${g?.kind ?? 'component'}|${norm(g?.need)}`;

export const DECISIONS = {
  out: { said: 'kept out of the system', rules: true },
  product: { said: 'accepted in the product', rules: false },
  'for-now': { said: 'accepted for now', rules: false },
  system: { said: 'brought into the system', rules: false },
};

const json = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
export const readDecisions = (ROOT) => json(resolve(ROOT, projectPath(ROOT, 'requests')), {}).requests ?? {};
export const readAnswers = (ROOT, cfg = {}) => json(resolve(ROOT, cfg.requests?.answers ?? projectPath(ROOT, 'requestAnswers')), {}).answers ?? {};

// merged: the gaps of every prototype as mergeGaps groups them. decisions, answers: by key. today: YYYY-MM-DD.
// status: new (nobody decided) · decided · look again (accepted for now and its day has come) · built (brought in and no
// prototype lacks it) · closed (the tracker closed or declined it) · merged (the tracker says it is another's duplicate).
export function requestsFrom({ merged = [], decisions = {}, answers = {}, today = new Date().toISOString().slice(0, 10) } = {}) {
  const rows = new Map();
  for (const g of merged) {
    const key = requestKey(g), was = rows.get(key);
    const asked = [...new Set([...(was?.asked ?? []), ...(g.prototypes ?? [])])];
    rows.set(key, { key, need: was?.need ?? g.need, kind: g.kind ?? 'component', asked, count: asked.length, closest: was?.closest ?? g.closest ?? null, used: was?.used ?? g.used ?? null, found: true });
  }
  // A request decided before whose gap no prototype has now: still a row, so a request brought in is seen as Built.
  for (const [key, d] of Object.entries(decisions)) if (!rows.has(key) && d?.need) rows.set(key, { key, need: d.need, kind: d.kind ?? key.split('|')[0], asked: [], count: 0, closest: null, used: null, found: false });
  const out = [];
  for (const r of rows.values()) {
    const d = decisions[r.key] ?? null, a = answers[r.key] ?? null;
    const row = { ...r, decision: d?.decision ?? null, why: d?.why ?? null, by: d?.by ?? null, at: d?.at ?? null, lookAgain: d?.lookAgain ?? null, ticket: a?.link ?? null };
    if (a?.state === 'duplicate' && a.of) { row.status = 'merged'; row.of = a.of; }
    else if (a?.state === 'closed' || a?.state === 'declined') { row.status = 'closed'; row.closedBy = a.state; row.reason = a.reason ?? null; }
    else if (!r.found && d?.decision === 'system') row.status = 'built';
    else if (!r.found && !d) continue;                                   // nobody asks any more and nobody decided: gone
    else if (d?.decision === 'for-now' && d.lookAgain && d.lookAgain <= today) row.status = 'look again';
    else row.status = d ? 'decided' : 'new';
    // A request declined in the tracker is a decision too: kept out, with the tracker's reason.
    if (a?.state === 'declined' && !d) { row.decision = 'out'; row.why = a.reason ?? 'declined in the team\'s tracker'; }
    out.push(row);
  }
  const order = { new: 0, 'look again': 1, decided: 2, built: 3, merged: 4, closed: 5 };
  return out.sort((x, y) => order[x.status] - order[y.status] || y.count - x.count || x.need.localeCompare(y.need));
}

// A decision is a person's: written with their name and the day, kept with the need so the row outlives the gap.
export function decideRequest(ROOT, key, decision, { why = null, by = null, lookAgain = null, need = null, kind = null, at = new Date().toISOString() } = {}) {
  if (!DECISIONS[decision]) throw new Error(`a request is decided ${Object.keys(DECISIONS).join(', ')}, not "${decision}"`);
  if (decision === 'for-now' && !lookAgain) throw new Error('accepted for now needs a day to look again (--look-again YYYY-MM-DD)');
  if (decision === 'out' && !why) throw new Error('kept out of the system needs its reason (--why "…"): it is what agents are told');
  const file = resolve(ROOT, projectPath(ROOT, 'requests'));
  const all = json(file, { requests: {} });
  all.requests ??= {};
  all.requests[key] = { decision, ...(why ? { why } : {}), ...(by ? { by } : {}), at: at.slice(0, 10), ...(lookAgain ? { lookAgain } : {}), need: need ?? all.requests[key]?.need ?? key.split('|').slice(1).join('|'), kind: kind ?? all.requests[key]?.kind ?? key.split('|')[0] };
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  return { file, decision: all.requests[key] };
}

// The open requests, for whatever bridges them to the team's tracker: the key it answers by, and what a ticket needs.
export function exportRequests(ROOT, rows = []) {
  const open = rows.filter((r) => ['new', 'decided', 'look again'].includes(r.status))
    .map((r) => ({ key: r.key, need: r.need, kind: r.kind, asked: r.asked, count: r.count, closest: r.closest, decision: r.decision, why: r.why, ticket: r.ticket }));
  const file = join(ROOT, OUT_DIR, 'requests', 'requests.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ about: 'The open requests to the design system, by key. A tool that bridges them to a tracker writes its answers to design-system-engine-requests.answers.json: { "answers": { "<key>": { "state": "open|closed|declined|duplicate", "link": "<ticket>", "reason": "…", "of": "<key>" } } }.', requests: open }, null, 2) + '\n');
  return { file, open: open.length };
}

const STATUS_SAID = { new: 'New', 'look again': 'Look again', decided: 'Decided', built: 'Built', merged: 'Merged into another', closed: 'Closed' };
export function requestLines(rows = []) {
  if (!rows.length) return ['No requests: no prototype lacks anything the system has to decide.'];
  const out = [`REQUESTS  ${rows.filter((r) => r.status === 'new').length} new · ${rows.filter((r) => ['decided', 'look again'].includes(r.status)).length} decided · ${rows.filter((r) => r.status === 'built').length} built · ${rows.filter((r) => ['closed', 'merged'].includes(r.status)).length} closed`];
  for (const r of rows) {
    const d = r.decision ? ` · ${DECISIONS[r.decision].said}${r.why ? `: ${r.why}` : ''}${r.lookAgain ? ` (look again ${r.lookAgain})` : ''}` : '';
    out.push(`   ${STATUS_SAID[r.status]}  ${r.kind} "${r.need}"${r.count ? `, asked by ${r.count} (${r.asked.slice(0, 3).join(', ')}${r.asked.length > 3 ? ', …' : ''})` : ''}${r.closest ? `, nearest: ${r.closest}` : ''}${d}${r.ticket ? ` · ${r.ticket}` : ''}${r.of ? ` · duplicate of ${r.of}` : ''}${r.reason && r.status === 'closed' ? ` · ${r.reason}` : ''}`);
    out.push(`      key: ${r.key}`);
  }
  return out;
}
