// open-questions.mjs - the questions a component's documentation leaves open, named before an agent answers them.
//
// The engine knows what each role owes (behaviour-contract.mjs: a combobox's keys, where focus goes when a dialog
// closes, what a disclosure controls) and what the team wrote about the component (its page in the intent layer, its
// description, its props and states). What the role raises and nothing written answers is a question nobody answered:
// where the focus goes when the list closes, what a long label does, whether there is a loading state. An agent that
// builds or reviews fills such a gap with a guess, and two agents guess differently. So each is written on the
// component as open: the contract gives it to agents as a question to ask the person, never one to answer itself, and
// a person's answer is kept as a decision with who gave it (the intent layer's decisions file, question:<name>:<id>),
// after which agents read the answer instead of the question.
//
//   QUESTIONS                                  → [{ id, roles, ask, answered: RegExp }] what each kind of component raises
//   questionsFor(role)                         → the questions a role raises (every component's, then its role's own)
//   writtenOf(contract)                        → the words the system already says of a component, to look for answers in
//   openQuestions(name, role, written, decisions) → { open: [{ key, id, ask }], decided: [{ key, id, ask, answer, by, at }] }
//   questionKey(name, id)                      → 'question:<name>:<id>'
//   questionReport(byComponent)                → [lines] for --open-questions
import { roleKey } from './behaviour-contract.mjs';

// A role's family: the questions are written once for each.
const FIELDS = /^(textbox|searchbox|combobox|spinbutton|slider|checkbox|radio|switch|listbox)$/;
const LISTS = /^(listbox|combobox|grid|table|tree|treegrid|list|menu|tablist|feed)$/;
const ACTIONS = /^(button|link|menuitem|tab|switch|checkbox|radio|option|togglebutton)$/;
const NAMED = /^(button|link|tab|menuitem|option|checkbox|radio|switch|combobox|textbox|heading|togglebutton)$/;

export const QUESTIONS = [
  { id: 'long-label', roles: NAMED, ask: 'What does a long label do: wrap onto more lines, cut off with an ellipsis, or make the component wider?',
    answered: /\b(long|overflow|truncat\w*|ellipsis|wrap\w*|line.?clamp|max(imum)?\s+(length|width|characters?|lines?)|one line|single line)\b/i },
  { id: 'loading', roles: /^(button|combobox|listbox|grid|table|tree|feed|form|search|searchbox)$/, ask: 'Is there a loading state, and what does it show while it waits?',
    answered: /\b(loading|spinner|busy|skeleton|pending|progress|waiting)\b/i },
  { id: 'empty', roles: LISTS, ask: 'What shows when there is nothing to list?',
    answered: /\b(empty|no (results?|items?|data|options?|matches)|nothing (to show|found)|zero (results?|items?))\b/i },
  { id: 'error', roles: FIELDS, ask: 'How is an error shown, and where does its message go?',
    answered: /\b(error|invalid|validation|validate[sd]?)\b/i },
  { id: 'disabled', roles: ACTIONS, ask: 'Can it be disabled, and does a disabled one still take the focus so a person can find out why?',
    answered: /\bdisabled?\b|\baria-disabled\b/i },
  { id: 'focus-on-close', roles: /^(combobox|dialog|alertdialog|menu|listbox)$/, ask: 'Where does the focus go when it closes: back to what opened it, or somewhere else?',
    answered: /\bfocus\w*\b[^.]{0,60}\b(clos\w*|return\w*|back|restor\w*|dismiss\w*)\b|\b(clos\w*|dismiss\w*)\b[^.]{0,60}\bfocus\w*\b/i },
  { id: 'typing', roles: /^(combobox|searchbox)$/, ask: 'What does typing do: filter the list, jump to the first match, or only fill the field?',
    answered: /\b(filter\w*|autocomplete|auto-?complete|typeahead|type-?ahead|search\w*|suggest\w*|match\w*)\b/i },
  { id: 'dismiss', roles: /^(dialog|alertdialog|menu|tooltip|popover)$/, ask: 'What closes it: Escape, a click outside it, a close button, or only an action inside it?',
    answered: /\b(escape|esc|click\w* outside|backdrop|overlay|close button|dismiss\w*)\b/i },
  { id: 'one-or-many', roles: /^(region|disclosure|accordion)$/, ask: 'Can more than one be open at a time?',
    answered: /\b(one at a time|only one|more than one|several|multiple|all at once|single.?expand)\b/i },
  { id: 'activation', roles: /^(tab|tablist)$/, ask: 'Does a tab show its panel as soon as it takes the focus, or only once it is chosen with Enter or Space?',
    answered: /\b(automatic\w*|manual\w*|activat\w*|on focus|when (it is )?(chosen|selected))\b/i },
  { id: 'lifetime', roles: /^(alert|status|log|toast|snackbar)$/, ask: 'How long does it stay, and can a person dismiss it or bring it back?',
    answered: /\b(\d+\s*(s|sec\w*|seconds?|ms)|until (dismiss\w*|closed)|dismiss\w*|stays?|persist\w*|time.?out|auto.?(hide|dismiss|close))\b/i },
  { id: 'tooltip-trigger', roles: /^(tooltip)$/, ask: 'Does it show on keyboard focus as well as on hover, and does it stay while the pointer moves onto it?',
    answered: /\b(focus\w*|keyboard|hover\w*|pointer)\b/i },
];

export const questionKey = (name, id) => `question:${name}:${id}`;

// Every component's questions that apply to its role, in the order above. A role spelled as the code or Figma spells it
// (togglebutton, Tab) is read as behaviour-contract.mjs reads it.
export function questionsFor(role) {
  const r = role ? roleKey(role) : null;
  if (!r) return [];
  return QUESTIONS.filter((q) => q.roles.test(r) || q.roles.test(String(role).toLowerCase()));
}

// The words the system already says of a component: its description, everything its page in the intent layer says,
// its notes and usage, and its props, their options and its states (a loading prop answers whether it has a loading
// state). The accessibility facts are left out: they are the engine's own words, not the team's.
export function writtenOf(contract = {}) {
  const out = [];
  const add = (x) => { if (x == null) return; if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(add); else if (typeof x === 'object') Object.values(x).forEach(add); };
  add(contract.description); add(contract.intent); add(contract.notes); add(contract.usage);
  for (const p of contract.props ?? []) { add(p?.name); add(p?.options); add(p?.values); add(p?.description); }
  add(contract.states); add(contract.variants);
  return out.join('\n');
}

// What the role raises, split into what nothing answers yet and what a person answered (a decision).
// decisions: the intent layer's decisions file ({ [key]: { answer, by, at } }).
export function openQuestions(name, role, written = '', decisions = {}) {
  const open = [], decided = [];
  for (const q of questionsFor(role)) {
    const key = questionKey(name, q.id), d = decisions?.[key];
    if (d?.answer) { decided.push({ key, id: q.id, ask: q.ask, answer: String(d.said ?? d.answer), by: d.by ?? null, at: d.at ?? null }); continue; }
    if (q.answered.test(written)) continue;
    open.push({ key, id: q.id, ask: q.ask });
  }
  return { open, decided };
}

// For --open-questions: each component with what nothing written answers, and what a person answered.
// byComponent: [[name, { role, open, decided }]] → [lines]
export function questionReport(byComponent, { max = 60 } = {}) {
  const withOpen = byComponent.filter(([, q]) => q.open.length);
  const total = withOpen.reduce((n, [, q]) => n + q.open.length, 0);
  const lines = [];
  if (!total) lines.push(`✅ No open questions: what each component's role raises is answered by what is written about it, or by a person.`);
  else lines.push(`❓ ${total} open question${total === 1 ? '' : 's'} on ${withOpen.length} component${withOpen.length === 1 ? '' : 's'}: what each one's role raises that nothing written about it answers. An agent asks these, never guesses.`);
  let shown = 0;
  for (const [name, q] of byComponent) {
    if (!q.open.length && !q.decided.length) continue;
    lines.push(`  ${name} (${q.role})`);
    for (const x of q.open) if (shown++ < max) lines.push(`    ? ${x.ask}  [${x.key}]`);
    for (const x of q.decided) lines.push(`    ✓ ${x.ask} ${x.answer}${x.by ? ` (${x.by}${x.at ? `, ${String(x.at).slice(0, 10)}` : ''})` : ''}`);
  }
  if (shown > max) lines.push(`    … and ${shown - max} more.`);
  return lines;
}
