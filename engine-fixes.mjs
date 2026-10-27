// engine-fixes.mjs - what the engine knows for certain, written into the files it owns.
//
// A project with no intent layer gets everything the Documentation page finds as a list and nothing else: somebody
// has to carry each line into a file by hand, and most of them never are. Yet some of those lines the engine is not
// guessing at. It read the component's code and saw the element it renders. It can see that an authored note says
// what the description already said. It knows the product's own first use of a component, because a check read it.
// Those are facts, and a fact nobody wrote down is a fact an agent will get wrong.
//
// So the engine writes them, into the files that are its own - the authored contract and nothing else - and only
// where the project says it may (writes.mjs → `engine`). What needs a person stays a task: a role that is a choice
// rather than a reading, Figma's annotations, words only a designer can give.
//
// Two lines are never crossed. What is certain is written as final; what is judgement is written as a draft, marked
// so, and a draft is for a person to approve, never for a check to read as the team's word. And nothing already
// written by a person is ever overwritten: the engine fills what is empty and removes what repeats, and a sentence
// somebody chose stays as they chose it, even when the engine would say it differently.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DRAFT = '**Draft:**';
// An element that says what a component is. A div or a span is a box: it says nothing, and writing it down as the
// component's semantics would be the engine inventing a fact rather than reading one.
const SAYS_NOTHING = new Set(['div', 'span', 'template', 'slot', 'fragment']);
// The element a component renders, in every framework the engine reads. Vue says it inside its template, Svelte
// writes its markup at the top level, and JSX returns it. Only a plain element counts: a tag that is another
// component says what that one renders, not what this one is, and the engine would be reading a name rather than a
// fact. A component whose root the engine cannot find is simply left alone.
export function rootElement(codeText = '') {
  const text = String(codeText ?? '');
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(text)?.[1];
  if (tpl) return /<\s*([a-z][\w-]*)/.exec(tpl)?.[1] ?? null;
  // JSX: the element the component returns, the parentheses it is usually wrapped in and any comment before it
  // stepped over.
  const ret = /\breturn\s*\(?\s*(?:\{\s*\/\*[\s\S]*?\*\/\s*\}\s*)*</.exec(text);
  if (ret) return /^<\s*([a-z][\w-]*)/.exec(text.slice(ret.index + ret[0].length - 1))?.[1] ?? null;
  // Svelte and plain HTML: the markup is the file, with its script and style blocks out of the way.
  const markup = text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').trim();
  return /^<\s*([a-z][\w-]*)/.exec(markup)?.[1] ?? null;
}

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// One text saying what another already says: either holds the other, once both are read as plain words.
const repeats = (a, b) => { const x = key(a), y = key(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

// What the engine is sure of, per component. → [{ component, kind, field, from, to, why, draft }]
//   semantics   the element its code renders, where the authored contract names none          (certain)
//   note        an authored note that says what its description already says, removed          (certain)
//   example     the product's own first use of it, drafted for a person to approve             (a draft)
// components: { name: { codeText, description, realUse } }; authored: contract.authored.json as read.
export function sureFixes({ components = {}, authored = {} } = {}) {
  const out = [];
  // A component is one component however each file spells it: the code calls it Chip, the authored contract may
  // call it chip. Writing under the spelling the code uses would quietly give the project two of everything.
  const byKey = new Map(Object.keys(authored?.components ?? {}).map((n) => [key(n), n]));
  for (const [name, c] of Object.entries(components)) {
    const at = byKey.get(key(name)) ?? name;
    const a = authored?.components?.[at] ?? {};

    // The element its code renders. Read, never chosen: a component whose root says nothing is left alone, and one
    // the team already answered for keeps its answer.
    const el = rootElement(c.codeText);
    if (el && !SAYS_NOTHING.has(el) && !a.semantics?.element) {
      out.push({ component: at, kind: 'semantics', field: 'semantics.element', from: null, to: el, why: `its code renders <${el}>`, draft: false });
    }

    // A note that says what the description already says. The agent is shown both and reads the same thing twice,
    // which is how a card that could have said something new says nothing.
    if (a.notes && c.description && repeats(a.notes, c.description)) {
      out.push({ component: at, kind: 'note', field: 'notes', from: a.notes, to: null, why: 'it says what its description already says', draft: false });
    }

    // The product's own first use, as an example. Certain that the code is real; a judgement that it is the one to
    // show, so it is a draft.
    const use = String(c.realUse ?? '').trim();
    if (use && !(a.guidance?.examples ?? []).length) {
      out.push({ component: at, kind: 'example', field: 'guidance.examples', from: null, to: `${DRAFT} ${use}`, why: "the product's own first use of it", draft: true });
    }
  }
  return out;
}

// The authored contract with the fixes in it. Pure: the caller decides whether to write the file.
export function withFixes(authored = {}, fixes = []) {
  const next = { ...authored, components: { ...(authored.components ?? {}) } };
  for (const f of fixes) {
    const c = { ...(next.components[f.component] ?? {}) };
    if (f.kind === 'semantics') c.semantics = { ...(c.semantics ?? {}), element: f.to };
    if (f.kind === 'note') delete c.notes;
    if (f.kind === 'example') c.guidance = { ...(c.guidance ?? {}), examples: [...(c.guidance?.examples ?? []), f.to] };
    next.components[f.component] = c;
  }
  return next;
}

// The fixes written, where the project lets the engine write its own files. → { written, file } or { written: 0 }.
export function applyFixes(ROOT, fixes, { file = 'contract.authored.json' } = {}) {
  if (!fixes.length) return { written: 0, file: null };
  const path = resolve(ROOT, file);
  let authored = {};
  if (existsSync(path)) { try { authored = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`${file} is not valid JSON: nothing was written`); } }
  writeFileSync(path, JSON.stringify(withFixes(authored, fixes), null, 2) + '\n');
  return { written: fixes.length, file };
}

// What a person reads, and what happens next, by what the project allows (writes.mjs → `engine`).
export function fixLines(fixes = [], { may = 'ask', why = null, file = 'contract.authored.json' } = {}) {
  if (!fixes.length) return [];
  const sure = fixes.filter((f) => !f.draft), drafts = fixes.filter((f) => f.draft);
  const said = (f) => `  ${f.component} · ${f.field}: ${f.kind === 'note' ? `take out "${String(f.from).replace(/\s+/g, ' ').slice(0, 80)}"` : f.to} - ${f.why}`;
  const head = may === 'yes' ? `written into ${file}`
    : may === 'ask' ? `to write into ${file}, once you say yes`
      : `a task for whoever owns ${file} (${why ?? 'this project does not let the engine write its own files'})`;
  return [`🧾 ${fixes.length} thing${fixes.length === 1 ? '' : 's'} the engine is sure of, ${head}:`,
    ...sure.map(said),
    ...(drafts.length ? [`  and ${drafts.length} draft${drafts.length === 1 ? '' : 's'} for a person to approve (marked ${DRAFT}, never read as the team's own word):`, ...drafts.map(said)] : [])];
}
