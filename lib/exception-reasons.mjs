// exception-reasons.mjs - an exception is paid back only when someone can say why it exists and who it belongs to.
//
// The engine accepts three kinds of exception: a difference kept on purpose (kept.mjs), a value written by hand that
// ds-config.json excuses (knownHardcodedExceptions) and debt accepted at adoption (baseline.mjs). Each one stops a
// finding from failing a run, so each is a decision, and a decision nobody can explain or answer for is never revisited.
// So every exception carries three things: why (its reason), who answers for it (its owner) and since when (its date).
//
// A reason has to say something. One is refused when it is
//   • missing, or too short to explain anything (fewer than three words that carry meaning);
//   • made only of words that say it is on purpose and nothing else ("intentional", "by design", "known", "legacy");
//   • the very words of another exception's reason, so it explains neither;
//   • short and about nothing the finding is about: under five words that carry meaning, none of them the finding's
//     or its component's (said only when the finding is known).
// The engine never writes a reason for anyone: a refusal says what is missing, and the person writes it again.
//
//   reasonRefusal(reason, { others, about }) → why the reason is refused, or null
//   exceptionGaps(entries)                   → [{ entry, label, missing: ['reason' | 'owner' | 'since'], refused }]
//   exceptionGapLines(gaps)                  → lines for the audit

// Words that say only that something is on purpose, or is old, or is somebody else's problem.
const FILLER = new Set(['intentional', 'intentionally', 'intended', 'deliberate', 'deliberately', 'design', 'designed', 'choice',
  'decision', 'decided', 'purpose', 'known', 'legacy', 'expected', 'ok', 'okay', 'fine', 'wip', 'todo', 'temp', 'temporary',
  'ignore', 'ignored', 'exception', 'allowed', 'accepted', 'approved', 'needed', 'required', 'necessary', 'keep', 'kept',
  'fix', 'later', 'n/a', 'na', 'none', 'see', 'ticket', 'issue', 'per', 'request', 'team', 'product', 'reasons', 'reason',
  'for', 'now', 'as', 'is', 'by', 'on', 'the', 'a', 'an', 'it', 'this', 'that', 'we', 'our', 'was', 'be', 'to', 'of', 'and', 'or']);
// Words that carry no meaning of their own, left out when words are counted or compared.
const STOP = new Set(['the', 'a', 'an', 'it', 'its', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'and', 'or', 'but', 'for', 'on', 'in', 'at', 'by', 'with', 'as', 'we', 'our', 'us', 'they', 'so', 'not', 'no',
  'has', 'have', 'had', 'do', 'does', 'from', 'than', 'then', 'there', 'here', 'until', 'while', 'because', 'which', 'who']);

const wordsOf = (s) => String(s ?? '').toLowerCase().replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^a-z0-9/]+/).filter(Boolean);
const content = (s) => wordsOf(s).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
// Two words are one when they share a stem: radius and radii, button and buttons, spacing and space.
const stem = (w) => (/^\d/.test(w) ? w : w.slice(0, Math.max(4, Math.min(w.length, 5))));
const squash = (s) => content(s).join(' ');

export function reasonRefusal(reason, { others = [], about = '' } = {}) {
  const text = String(reason ?? '').trim();
  if (!text) return 'there is no reason: say why the team keeps it';
  const words = content(text);
  if (words.filter((w) => w.length > 2 || /\d/.test(w)).length < 3) return `"${text}" is too short to say why: say what it is for and why the system's value does not fit`;
  if (words.every((w) => FILLER.has(w))) return `"${text}" says only that it is on purpose: say what it is for and why the system's value does not fit`;
  const mine = squash(text);
  if ((others ?? []).some((o) => o && squash(o) === mine)) return `"${text}" is word for word the reason of another exception, so it explains neither: say what is particular to this one`;
  const subject = new Set(content(about).filter((w) => w.length > 2 || /\d/.test(w)).map(stem));
  // Only a short reason has to name it: one that explains at length (a larger tap target, for the height) is about it.
  if (subject.size && words.filter((w) => w.length > 2).length < 5 && !words.some((w) => subject.has(stem(w)))) return `"${text}" names nothing the finding is about: name the component, the value or the case it is for`;
  return null;
}

// What an exception entry says of itself, whichever list it comes from: a string (the oldest form of
// knownHardcodedExceptions) says nothing, an object says what it holds.
const own = (e) => (e && typeof e === 'object' ? e : {});
export const labelOf = (e) => (typeof e === 'string' ? e : e?.pattern ?? e?.key ?? e?.file ?? JSON.stringify(e));

// Every entry with what it lacks: no reason, no owner, no date, or a reason that says nothing. entries: the list, each a
// string or { reason, owner, since | at, … }. about(e): what the entry is about, for the reason to name (its pattern,
// its finding). → [{ entry, label, missing, refused }], only the entries that lack something.
export function exceptionGaps(entries = [], { about = (e) => labelOf(e) } = {}) {
  const out = [];
  const reasons = (entries ?? []).map((e) => own(e).reason ?? own(e).why ?? null);
  (entries ?? []).forEach((e, i) => {
    const o = own(e), reason = reasons[i];
    const missing = [];
    if (!String(reason ?? '').trim()) missing.push('reason');
    if (!String(o.owner ?? '').trim()) missing.push('owner');
    if (!String(o.since ?? o.at ?? '').trim()) missing.push('since');
    const refused = missing.includes('reason') ? null : reasonRefusal(reason, { others: reasons.filter((_, j) => j !== i), about: about(e) });
    if (missing.length || refused) out.push({ entry: e, label: labelOf(e), missing, refused });
  });
  return out;
}

const SAY = { reason: 'why', owner: 'who owns it', since: 'since when' };
export function exceptionGapLines(gaps = [], { list = 'knownHardcodedExceptions', max = 20 } = {}) {
  if (!gaps.length) return [];
  const lines = [`⚠️  ${gaps.length} exception(s) in ${list} cannot say why they exist or who answers for them:`];
  for (const g of gaps.slice(0, max)) lines.push(`     ${g.label}: ${[g.missing.length ? `no ${g.missing.map((m) => SAY[m]).join(', no ')}` : null, g.refused].filter(Boolean).join(' · ')}`);
  if (gaps.length > max) lines.push(`     and ${gaps.length - max} more`);
  lines.push('     Write each as { "file": …, "pattern": …, "reason": …, "owner": …, "since": "YYYY-MM-DD" }, the reason in the words of the person who owns it.');
  return lines;
}
