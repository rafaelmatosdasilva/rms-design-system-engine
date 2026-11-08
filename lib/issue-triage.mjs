// issue-triage.mjs - what happens to an issue once it is sent, for .github/workflows/issues.yml.
//
// Every issue is read and answered (CONTRIBUTING.md, What happens to your issue). Three kinds of label say where it
// stands, set by the maintainer at triage except where said:
//   state     needs triage (each new issue, set here), needs info, confirmed, planned; a declined one is wontfix, a
//             repeated one duplicate, each with the reason in a comment
//   part      the part of the features page it is about, from the form's own "Which part" answer (set here), so
//             issues are sorted by the same names people read on that page
//   priority  high, medium, low, by the rule the engine's own work is ranked by: high is a problem found in use or one
//             that stops the part doing what the features page promises; medium moves a part forward or delivers what
//             it already promises; low is later
// An issue that waits on its reporter (needs info) is closed after 14 days with no reply, with a note that a reply
// reopens it; the reporter's reply sends it back to triage, reopened if it was closed.
// The parts are read from docs/features.md, so a part renamed there is renamed here; a test keeps the forms' answers
// and these labels in step with it.
//
//   node lib/issue-triage.mjs label <event.json>   the labels a new or edited issue takes, added with gh
//   node lib/issue-triage.mjs reply <event.json>   a reporter's reply to an issue waiting on them: back to triage
//   node lib/issue-triage.mjs sync                 every label below created or brought up to date, with gh
//   node lib/issue-triage.mjs stale                each issue waiting on its reporter for 14 days, closed with a note
// The issue's text is never run or put in a shell: it is read here, and gh is given fixed label names as arguments.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FEATURES = new URL('../docs/features.md', import.meta.url);

// The parts of the features page, in its order: the first column of each table in its overview.
export function featureParts(text = readFileSync(FEATURES, 'utf8')) {
  const head = text.split(/\n## /)[0];
  return [...head.matchAll(/^\| \[([^\]]+)\]\(#[^)]+\) \|/gm)].map((m) => m[1]);
}
// What a reporter can answer besides a part.
export const OTHER = ['Setting up or updating it', 'Not sure'];
// The question every form asks, and the answer each part's label is named after.
export const PART_QUESTION = 'Which part';
export const partLabel = (part) => `part: ${part}`;

export const STATE = [
  ['needs triage', 'ededed', 'New: not read yet'],
  ['needs info', 'fbca04', 'Waiting on the reporter; closed after 14 days with no reply'],
  ['confirmed', '0e8a16', 'Reproduced or agreed; not planned yet'],
  ['planned', '1d76db', 'On the way; the fix closes it'],
  ['wontfix', 'ffffff', 'Declined, with the reason in a comment'],
];
export const PRIORITY = [
  ['priority: high', 'b60205', 'A problem found in use, or one that stops a part doing what it promises'],
  ['priority: medium', 'd93f0b', 'Moves a part forward, or delivers what it already promises'],
  ['priority: low', 'c5def5', 'Later'],
];
// Every label this keeps: [name, colour, description].
export function triageLabels(parts = featureParts()) {
  return [...STATE, ...PRIORITY, ...[...parts, OTHER[0]].map((p) => [partLabel(p), 'bfd4f2', `About ${p === OTHER[0] ? 'setting up or updating the engine' : `the features page's ${p}`}`])];
}

// A form's answer to one question, as GitHub writes an issue form's body: "### <question>\n\n<answer>".
export function formAnswer(body = '', question = PART_QUESTION) {
  const m = String(body).match(new RegExp(`^### ${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+([^\\n]*)`, 'm'));
  const a = m ? m[1].trim() : '';
  return a && a !== '_No response_' ? a : null;
}

// The labels an issue takes: needs triage when it is opened, and its part's label when its form names one. A label
// the issue already has is not added twice.
export function labelsFor(issue = {}, { action = 'opened', parts = featureParts() } = {}) {
  const has = new Set((issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)));
  const out = [];
  if (action === 'opened') out.push('needs triage');
  const part = formAnswer(issue.body);
  if (part && (parts.includes(part) || part === OTHER[0])) out.push(partLabel(part));
  return out.filter((l) => !has.has(l));
}

// The issues waiting on their reporter for `days` with no activity: [{ number, updatedAt }] → their numbers.
export function staleOf(issues = [], { now = Date.now(), days = 14 } = {}) {
  return issues.filter((i) => now - Date.parse(i.updatedAt) >= days * 24 * 3600 * 1000).map((i) => i.number);
}
export const STALE_NOTE = 'Closed after 14 days waiting on the information asked for above. Reply with it and the issue is reopened.';

// A reply from the reporter to an issue waiting on them: back to triage, and reopened when it was closed for waiting.
// event: an issue_comment event. → null, or what to do.
export function replyOf(event = {}) {
  const issue = event.issue ?? {}, labels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  if (event.action !== 'created' || issue.pull_request || !labels.includes('needs info')) return null;
  if (!event.comment?.user?.login || event.comment.user.login !== issue.user?.login) return null;
  return { number: issue.number, reopen: issue.state === 'closed' };
}

const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh ${args[0]} ${args[1]}: ${String(r.stderr).trim()}`);
  return r.stdout;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, file] = process.argv.slice(2);
  if (mode === 'label') {
    const event = JSON.parse(readFileSync(file, 'utf8'));
    const add = labelsFor(event.issue, { action: event.action });
    if (add.length) gh(['issue', 'edit', String(event.issue.number), '--add-label', add.join(',')]);
    console.log(add.length ? `#${event.issue.number}: ${add.join(', ')}` : `#${event.issue.number}: nothing to add`);
  } else if (mode === 'reply') {
    const r = replyOf(JSON.parse(readFileSync(file, 'utf8')));
    if (r) {
      if (r.reopen) gh(['issue', 'reopen', String(r.number)]);
      gh(['issue', 'edit', String(r.number), '--remove-label', 'needs info', '--add-label', 'needs triage']);
    }
    console.log(r ? `#${r.number}: back to triage${r.reopen ? ', reopened' : ''}` : 'not a reply the issue was waiting on');
  } else if (mode === 'sync') {
    for (const [name, color, description] of triageLabels()) gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
    console.log(`${triageLabels().length} labels in step`);
  } else if (mode === 'stale') {
    const waiting = JSON.parse(gh(['issue', 'list', '--state', 'open', '--label', 'needs info', '--json', 'number,updatedAt', '--limit', '200']));
    for (const n of staleOf(waiting)) gh(['issue', 'close', String(n), '--comment', STALE_NOTE]);
    console.log(`${staleOf(waiting).length} closed`);
  } else {
    console.error('Usage: node lib/issue-triage.mjs label <event.json> | reply <event.json> | sync | stale');
    process.exit(2);
  }
}
