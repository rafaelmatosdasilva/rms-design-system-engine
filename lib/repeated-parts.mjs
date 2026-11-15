// repeated-parts.mjs - the same part built by hand in prototype after prototype, gathered under one need.
//
// Every prototype keeps what the system had nothing for (prototypes/gaps.json). Merged across prototypes, that
// list is the design team's own backlog: a part built by hand once is a one-off, the same part built by hand in
// four prototypes is the system asking for a component.
//
// It could not say that. mergeGaps keyed each need on its exact words (`${kind}|${need.toLowerCase()}`), and a
// designer writes the need in their own words every time - "a top bar", "the bar at the top", "top bars". Three
// wordings, three needs, each seen once, and the one signal worth having is invisible however many prototypes
// build it.
//
// So needs are gathered by what they say rather than by how they are spelled, with the prototype route's own
// reading of a word (prototype-context.mjs wordsOf: stems, and the words every request shares left out).
//
// What it gathers is a rewording, never a renaming: "a top bar" and "the bar at the top" are one need because
// the words about the part are the same two; "a top bar" and "page header bar" stay two, because header and page
// are words one says of the part and the other does not. Reading those as one would need a model or a list of
// synonyms, and both would group needs that are not the same - which tells a team a part repeats when it does
// not, the one mistake this must not make. Every wording gathered is shown, so a reader can say it was gathered
// wrongly.
//
// Nothing here creates, names or writes a component: it counts, and hands the count to a person. The engine
// never writes code, and a part the team decides against stays decided against.
import { wordsOf } from './prototype-context.mjs';

// Two needs are the same job when what they say of the part is the same. The kind must match - a layout piece and
// a component are not one need - and the words left after the ones every gap uses must be the same set.
// NOISE: what a gap says about being a gap, never about the part. "built in code" is on every stand-in's need.
export const NOISE = new Set(['built', 'code', 'component', 'components', 'need', 'needs', 'needed', 'missing',
  'system', 'thing', 'element', 'piece', 'part', 'layout', 'use', 'used', 'uses']);

// What a need says about the part, as a set of words. The team's own wording is kept; this is only for matching.
export function jobOf(need) {
  return new Set(wordsOf(need).filter((w) => !NOISE.has(w)));
}

// Whether two needs describe the same part. Both ways round, so neither being longer decides it: every word one
// says of the part, the other says too. "a top bar" and "the bar at the top" are one job; "a top bar" and "a
// filter bar" are two, because filter is a word about the part that only one of them says.
export function sameJob(a, b) {
  const x = jobOf(a), y = jobOf(b);
  if (!x.size || !y.size) return false;
  if (x.size !== y.size) return false;
  for (const w of x) if (!y.has(w)) return false;
  return true;
}

// A wording to show the group under: the one most prototypes wrote, then the shortest, so the line reads as
// somebody's own sentence rather than a sentence the engine assembled. Ties go to the first written, which keeps a run
// repeatable.
export function clearest(wordings = []) {
  const count = new Map();
  for (const w of wordings) count.set(w, (count.get(w) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || wordings.indexOf(a[0]) - wordings.indexOf(b[0]))[0]?.[0] ?? '';
}

// The merged gaps gathered by job. gaps: what mergeGaps returned ([{ need, kind, prototypes, closest, … }]).
// → [{ need, kind, prototypes, wordings, closest, said }], most prototypes first. Nothing is dropped: a need that
// matches nothing else is a group of one, and still listed, because a gap the team never sees is a gap it cannot
// decide.
export function byJob(gaps = []) {
  const groups = [];
  for (const g of gaps) {
    const at = groups.find((x) => x.kind === g.kind && sameJob(x.wordings[0], g.need));
    if (at) {
      at.wordings.push(g.need);
      for (const p of g.prototypes ?? []) if (!at.prototypes.includes(p)) at.prototypes.push(p);
      at.closest ??= g.closest ?? null;
      at.said.push(g);
      continue;
    }
    groups.push({ kind: g.kind, wordings: [g.need], prototypes: [...(g.prototypes ?? [])], closest: g.closest ?? null, said: [g] });
  }
  return groups
    .map((x) => ({ ...x, need: clearest(x.wordings) }))
    .sort((a, b) => b.prototypes.length - a.prototypes.length || (a.kind === 'layout') - (b.kind === 'layout') || a.need.localeCompare(b.need));
}

// Built by hand in this many prototypes before it is worth a person's attention. Two is the least that can be a
// pattern: one is the prototype that needed it, and the team already has that gap on its list.
export const AGAIN = 2;

// The groups a person is asked about: a part built by hand again, in more than one prototype.
export const builtAgain = (groups = [], { again = AGAIN } = {}) => groups.filter((g) => g.prototypes.length >= again);

// What a person is told, for them to decide. Never a failure, and never a component: a count, the prototypes it
// was counted in, and the team's own words for it. Whether the system grows one is the design team's to say.
export function repeatedLines(groups = [], { again = AGAIN } = {}) {
  const over = builtAgain(groups, { again });
  if (!over.length) return [];
  const out = ['', `🧱 BUILT BY HAND AGAIN  ${over.length} part(s) the system had nothing for in more than one prototype:`];
  for (const g of over) {
    out.push(`   ${g.need} — built by hand in ${g.prototypes.length} prototypes: ${g.prototypes.join(', ')}${g.closest ? `; closest in the system: ${g.closest}` : ''}`);
    // The other words it was written in, so a reader can see what was gathered and say it was gathered wrongly.
    const others = [...new Set(g.wordings)].filter((w) => w !== g.need);
    if (others.length) out.push(`      also written as: ${others.join('; ')}`);
  }
  out.push('   Each is the design team\'s to decide: a component of its own, an option on one that exists, or left as it is.');
  return out;
}
