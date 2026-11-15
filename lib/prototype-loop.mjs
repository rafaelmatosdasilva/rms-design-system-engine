// prototype-loop.mjs - the whole loop on one screen, so a person can tell whether it is working.
//
// The engine already does each part of this and prints each part in its own place, at its own time, to whoever
// happened to run that command. Somebody picking it up for the first time cannot see the loop from that, and the
// loop is the thing: patterns are read from the pages already made, agents draw a page, their mistakes are kept with
// why each one happened, what the documentation owed is written into the intent layer, what needs judgement is left
// for a person to review, and the next page should be better. Six steps, one question - is it working? - and no
// place that answered it.
//
// Nothing is measured here. Every number comes from a file some earlier run already wrote, and where a file is not
// there yet the step says what to run rather than showing a zero: a zero and "not yet" look the same and mean
// opposite things.
//
// Pure: the caller reads the files.
import { progressOf, progressLines } from './prototype-progress.mjs';

// Each step of the loop, in the order it happens. `have`: what that step needs to have been run.
export const STEPS = ['patterns', 'mistakes', 'written', 'review', 'better', 'reading'];

const pct = (n) => `${Math.round(n * 100)}%`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What the loop looks like now, from what earlier runs kept.
//   conventions: deriveConventions(...)      pages: how many pages they were read from
//   inventions:  prototypes/inventions.json  checks: prototypes/<name>.check.json  coverage: prototypes/doc-coverage.json
//   cards:       cards-read.mjs → cardsRead(ROOT)   autoFix: whether the intent layer is fixed on each run
// → [{ step, said, lines, next }] - next: what to run when this step has nothing yet.
export function loopState({ conventions = null, pages = 0, inventions = null, checks = null, coverage = null, cards = null, autoFix = false, cmd = 'rms-design-system-engine' } = {}) {
  const out = [];
  const step = (step, said, lines = [], next = null) => out.push({ step, said, lines, next });

  // 1. The patterns: how the pages already made are arranged, which is what a new page is held to. A convention is
  // a leaf with a value (page.padding, intents.save.label), never the group holding it: counting the groups said
  // "0 patterns" on a project that had plenty.
  const conv = [];
  const leaves = (node, path = []) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) if (x?.component) conv.push([path.join('.') || 'frame', x.component]); return; }
    if (node.value != null) { conv.push([path.join('.'), String(node.value)]); return; }
    for (const [k, v] of Object.entries(node)) leaves(v, [...path, k]);
  };
  leaves(conventions ?? {});
  if (!pages) step('patterns', 'No page has been drawn yet and none of the product\'s own pages could be read, so there are no patterns to hold a new one to.', [], `${cmd} --prototype --catalog --for "<the screen you want>"`);
  else if (!conv.length) step('patterns', `${plural(pages, 'page')} read, and nothing shared between them yet: a new page is held to nothing.`, [], `${cmd} --prototype --catalog --for "<the screen you want>"`);
  else step('patterns', `${plural(conv.length, 'pattern')} read from ${plural(pages, 'page')} already made: a new page is held to these.`,
    conv.slice(0, 4).map(([k, v]) => `  ${k}: ${v}`));

  // 2. The mistakes, with the half a person can act on told from the half the agent owes.
  // Two stores, because a prototype is checked two ways and each keeps what it can. A page written as code is read
  // by the page check, which works out whose fault each mistake was (inventions.json). A composition drawn from the
  // catalog is checked without that reading, and its record is kept beside it (prototypes/<name>.check.json): it
  // knows what went wrong, not whose fault it was. Reading only the first said "no page has been checked yet" to
  // anyone who draws compositions, which is every designer the prototype route is for.
  const runs = inventions?.runs ?? [];
  const drawn = Object.values(checks ?? {});
  const items = runs.flatMap((r) => r.items ?? []);
  const drawnItems = drawn.flatMap((c) => c.items ?? []);
  const checked = runs.length + drawn.length, wrong = items.length + drawnItems.length;
  const gaps = items.filter((i) => i.gap).length;
  // Whose fault a mistake was is known only where a page was read for it. Where every mistake was, the split is the
  // headline, as it has always been. Where some were not, the headline counts them all and the split says plainly
  // how many it speaks for: a percentage of a number a reader cannot see is worse than no percentage.
  const unread = wrong - items.length;
  if (!checked) step('mistakes', 'No page has been checked yet, so nothing is known about what agents get wrong here.', [], `${cmd} --prototype <page>`);
  // Nothing wrong is news, and reads as news: three zeros in a row read as a step that has not run.
  else if (!wrong) step('mistakes', `Nothing invented across ${plural(checked, 'check')}: every page so far is made only of what the system has.`, []);
  else if (!unread) step('mistakes', `${plural(wrong, 'mistake')} across ${plural(checked, 'check')}: ${gaps} the documentation did not say, ${wrong - gaps} written and not followed.`,
    [`  ${pct(gaps / wrong)} of them are yours to write; the rest are the agent not following what is there.`]);
  else step('mistakes', `${plural(wrong, 'mistake')} across ${plural(checked, 'check')}.`,
    items.length ? [`  of the ${items.length} read for whose fault it was, ${pct(gaps / items.length)} are yours to write; the rest are the agent not following what is there.`]
      : [`  none of them was read for whose fault it was: a composition's check finds what is wrong, not whose fault it is.`]);

  // 3. What the engine wrote into the intent layer by itself, and what is waiting to be.
  const needs = new Set(items.filter((i) => i.gap && i.need).map((i) => i.need));
  if (!checked) step('written', 'Nothing to write yet.', []);
  else if (autoFix) step('written', `What the code says for certain is written into the intent layer on every run${needs.size ? `; what is still owed: ${[...needs].join(', ')}` : ', and nothing is owed'}.`, []);
  else step('written', `The intent layer is not written by itself here${needs.size ? `, and ${plural(needs.size, 'kind')} of thing is owed: ${[...needs].join(', ')}` : ''}.`, [], `${cmd} --intent-changes`);

  // 4. What no machine can close: for a person, on the Documentation page.
  const missing = Object.values(coverage?.components ?? {}).reduce((n, c) => n + (c.missing ?? []).length, 0);
  if (!coverage) step('review', 'What an agent cannot learn from the documentation has not been looked at yet.', [], `${cmd} --prototype --coverage`);
  else step('review', `${plural(missing, 'thing')} an agent cannot learn from the documentation, each on the Documentation page with where to write it.`, [], missing ? `${cmd} --styleguide` : null);

  // 5. The question the rest of it is for.
  const p = progressOf(inventions ?? {});
  step('better', p.say.charAt(0).toUpperCase() + p.say.slice(1), progressLines(p).slice(1, 2).map((l) => `  ${l.trim()}`));

  // 6. And whether the agents are reading what they are given, which is upstream of all of it.
  if (!cards || !cards.size) step('reading', 'Nothing says yet whether agents read a component\'s card before using it.', [], `${cmd} --prototype --catalog`);
  else step('reading', `${plural(cards.size, 'component')} had ${cards.size === 1 ? 'its card' : 'their cards'} read in the last half day, so a page drawn now is held to what ${cards.size === 1 ? 'it says' : 'they say'}.`, []);

  return out;
}

// What a person reads: one line a step, the command under any step that has nothing yet.
export function loopLines(state = [], { cmd = 'rms-design-system-engine' } = {}) {
  const out = [`🔁 The prototype loop, as it stands here. Run ${cmd} --prototype --loop again after writing what it asks for.`];
  const n = { patterns: '1', mistakes: '2', written: '3', review: '4', better: '5', reading: '6' };
  for (const s of state) {
    out.push(`  ${n[s.step]}. ${s.said}`);
    for (const l of s.lines) out.push(`  ${l}`);
    if (s.next) out.push(`     → ${s.next}`);
  }
  return out;
}
