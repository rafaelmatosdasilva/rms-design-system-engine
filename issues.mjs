// issues.mjs - one issue per difference, never twice, closed when the check stops finding it.
//
// A difference the engine finds reaches whoever can fix it only if somebody carries it there by hand, and a list that
// is read once is a list nobody acts on. The engine can open the issue itself, in the project the team names for
// them. Three things make that bearable rather than a flood:
//
//   • Never twice. An issue is keyed the way a kept difference is keyed - its check and its words, without the icon
//     and without a line number - so the same difference found again finds its own issue instead of opening another.
//   • Closed by the check, not by hand. An issue the next run no longer finds is closed, with the run that closed it
//     named. Nobody has to tidy up after the engine.
//   • A difference kept on purpose never opens one. The team already decided it; reopening it as an issue every week
//     is how a team learns to ignore the engine.
//
// Nothing here talks to a host. The plan is computed from what the run found and what is already open, written to a
// file, and sent only where the project says the engine may (writes.mjs → `issues`). What a person reads is the plan,
// whether or not it is sent.
import { keptKey } from './kept.mjs';

// The mark an issue carries so the engine knows its own, and the key inside it. A person may edit an issue's title
// and body freely; this line is how it is still found.
export const MARK = 'rms-design-system-engine';
export const keyLine = (key) => `<!-- ${MARK}: ${key} -->`;
export const keyIn = (text) => new RegExp(`<!--\\s*${MARK}:\\s*(.+?)\\s*-->`).exec(String(text ?? ''))?.[1] ?? null;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);

// One issue per difference a run found, with the evidence and who acts. Kept differences are left out: the team
// already decided them. → [{ key, title, body, component, check, who }]
export function issuesFor(findings = [], { kept = [], who = null } = {}) {
  const decided = new Set(kept.map((d) => d.key));
  const out = [], seen = new Set();
  for (const f of findings) {
    if (!f?.difference) continue;
    const key = keptKey(`${f.check} :: ${f.evidence}`);
    if (decided.has(key) || seen.has(key)) continue;
    seen.add(key);
    const title = cut(`${f.component ? `${f.component}: ` : ''}${clean(f.evidence)}`, 120);
    out.push({
      key, title, component: f.component ?? null, check: f.check ?? null,
      who: f.who ?? who ?? null,
      body: [`**${f.check}**`, '', clean(f.evidence), '',
        f.component ? `Component: \`${f.component}\`` : '', f.who || who ? `Who acts: ${f.who ?? who}` : '',
        '', 'Found by rms-design-system-engine. It closes itself when a run no longer finds this difference; a difference the team decides to keep is taken off this list rather than closed by hand.',
        '', keyLine(key)].filter((l) => l !== '').join('\n'),
    });
  }
  return out;
}

// What to open and what to close, against the issues already there. open: [{ iid, title, body, state }] as the host
// gives them. → { open: [issue], close: [{ iid, key, title }], already: n }
export function issuePlan(wanted = [], open = []) {
  const mine = new Map();
  for (const i of open) { const k = keyIn(i.body); if (k && i.state !== 'closed') mine.set(k, i); }
  const want = new Map(wanted.map((w) => [w.key, w]));
  return {
    open: wanted.filter((w) => !mine.has(w.key)),
    close: [...mine].filter(([k]) => !want.has(k)).map(([key, i]) => ({ iid: i.iid, key, title: i.title })),
    already: wanted.filter((w) => mine.has(w.key)).length,
  };
}

// What a person reads, and what happens next by what the project allows (writes.mjs → `issues`).
export function issueLines(plan, { may = 'ask', where = 'the issues project', why = null } = {}) {
  const n = plan.open.length + plan.close.length;
  if (!n) return plan.already ? [`🎟  ${plan.already} issue${plan.already === 1 ? '' : 's'} already open in ${where} for what this run found; nothing to open or close.`] : [];
  const head = may === 'yes' ? `opened and closed in ${where}`
    : may === 'ask' ? `to open and close in ${where}, once you say yes`
      : `a task for whoever owns ${where} (${why ?? 'this project does not let the engine open issues'})`;
  return [`🎟  ${n} issue${n === 1 ? '' : 's'} ${head}:`,
    ...plan.open.map((i) => `  open: ${i.title}`),
    ...plan.close.map((i) => `  close #${i.iid}: ${i.title} - no run finds it any more`),
    ...(plan.already ? [`  (${plan.already} already open for what this run found, left alone)`] : [])];
}

// The plan carried out against a host. send(what) does one call and returns what the host said; it is given
// everything it needs and nothing about this project, so a host's own module decides how to talk to it.
// → { opened, closed, failed: [{ what, why }] }
export async function sendIssues(plan, send) {
  const out = { opened: 0, closed: 0, failed: [] };
  for (const i of plan.open) {
    try { await send({ do: 'open', title: i.title, body: i.body }); out.opened++; }
    catch (e) { out.failed.push({ what: `open ${i.title}`, why: e.message }); }
  }
  for (const i of plan.close) {
    try { await send({ do: 'close', iid: i.iid, note: 'Closed by rms-design-system-engine: no run finds this difference any more.' }); out.closed++; }
    catch (e) { out.failed.push({ what: `close #${i.iid}`, why: e.message }); }
  }
  return out;
}
