// rules-sweep.mjs - the rules the agent reads, held against each other.
//
// Everything written for whoever composes a prototype arrives in one place: the team's guidelines, each layer of the
// design intent, every component's own page, and the project's own instruction file for agents (AGENTS.md and the
// rest, read for what they say about the system and nothing else). They were written at different times by different
// people, and three faults grow there. All three cost the same thing — the agent reads more and trusts less:
//   • two rules that say opposite things about the same component, so whichever it reads last wins;
//   • one rule said twice in different words, which reads as two rules and takes the room of two;
//   • a rule that names nothing the system has and no check reads, which is advice rather than a rule.
// None of them is fixed here. Each is listed with both sentences and where each came from, for a person to settle or
// to place: the engine never rewrites what a team wrote about its own system, and a contradiction is usually a
// decision nobody has made yet rather than a mistake in the words.
//
// What it can prove, it says; what it cannot, it leaves alone. Opposite words ("never" against "always"), two counts
// of the same component ("exactly one" against "several") and two places the same component may only go are decided
// by what is written. Two rules that disagree about where a thing sits ("above the field" against "underneath it")
// read the same to a word count, and are left to the person who knows the system.
//
// Pure: everything reads the context prototype-context.mjs built (ctx.components, ctx.rules, ctx.inside).
import { wordsOf } from './prototype-context.mjs';

// The words that carry a rule's force rather than its subject: "never place a modal over a modal" and "always place a
// modal over a modal" are about the same thing, and only these tell them apart. Dropped before two rules are
// compared, so a pair shows up as one subject said two ways.
const FORCE = new Set(['never', 'always', 'must', 'should', 'avoid', 'don', 'dont', 'doesn', 'cannot', 'mistake', 'common', 'limitation', 'rule', 'rules', 'intent', 'layer', 'instead', 'rather', 'prefer']);
// How a line says it is about a use being ruled out or allowed, before any of its words are read.
const SAYS_NO = /^(not when|common mistake|don'?t|do not|never|limitation|avoid)\s*:/i;
const SAYS_YES = /^(use when|do|role|example)\s*:/i;
const NO_WORDS = /\b(never|not|n't|avoid|without|instead of|rather than|no longer)\b/i;
// How many of a component a rule allows. Only a count said in so many words counts: "a button" is not a claim that
// there is one.
const ONE = /\b(exactly one|only one|a single|one single|just one|no more than one|at most one|one and only one)\b/i;
const MANY = /\b(several|multiple|many|more than one|two or more|any number of|as many)\b/i;
// A rule may name something the system has without writing it in code voice. These are the system's own furniture:
// a rule that names one of them is about the system, however it is written.
const SYSTEM_WORDS = new Set(['token', 'colour', 'color', 'palette', 'spacing', 'space', 'gap', 'padding', 'margin', 'radius', 'shadow', 'elevation', 'font', 'typography', 'typeface', 'weight', 'scale', 'grid', 'breakpoint', 'icon', 'state', 'focu', 'hover', 'contrast', 'accessibility', 'a11y', 'keyboard', 'aria', 'label', 'theme', 'motion', 'animation', 'border', 'width', 'height']);

// How alike two rules must be before the pair is worth a person's time. Said apart because a repeat has to be a much
// closer match than a contradiction: two rules can contradict while one of them says far more than the other.
export const ALIKE = { least: 3, contradiction: 0.4, twice: 0.6 };

const label = (s) => String(s).replace(/^(use when|not when|common mistake|don'?t|do|limitation|intent layer|role|example)\s*:\s*/i, '').trim();
const key = (s) => label(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const subject = (s) => wordsOf(label(s)).filter((w) => !FORCE.has(w));

// Whether a line allows a use or rules one out: how it opens, else whether it carries a negation.
export function forceOf(text) {
  if (SAYS_NO.test(text)) return 'no';
  if (SAYS_YES.test(text)) return 'yes';
  return NO_WORDS.test(label(text)) ? 'no' : 'yes';
}
// How many of a component a line allows, where it says: 'one', 'many', or null for a line that does not count.
export function countOf(text) {
  const t = label(text);
  if (MANY.test(t)) return 'many';
  if (ONE.test(t)) return 'one';
  return null;
}

// One rule per sentence, from every place a rule reaches the agent: the product's own rules and each layer of the
// design intent (ctx.rules), each component's guidelines, mistakes, limitations and intent layer page, and the
// project's instruction file for agents (agents: [{ file, text }]). An instruction file is mostly about the project
// rather than the system — how to build it, how to test it — so only the sentences in it that name a component or
// something the system has are read here, and those are read against what the design system says.
// → [{ text, about, from, force, agent }], about: the component whose page it is on, null for a rule of the product.
export function rulesRead(ctx = {}, { agents = [] } = {}) {
  const out = [], seen = new Set();
  const add = (text, about, from, agent = false) => {
    for (const line of String(text ?? '').split(/\n+/).flatMap((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').split(/(?<=[.!?])\s+/))) {
      const t = line.trim().replace(/^#+\s*/, '');
      // A heading, a bare name or a fragment is not a rule: a rule is a sentence with something in it.
      if (!t || t.length < 12 || subject(t).length < 2) continue;
      const k = `${about ?? ''}|${key(t)}|${from}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ text: t, about, from, force: forceOf(t), ...(agent ? { agent: true } : {}) });
    }
  };
  for (const r of ctx.rules ?? []) if (r.kind !== 'token') add(r.text, null, r.title);
  for (const [name, k] of Object.entries(ctx.components ?? {})) {
    const page = k.intentLayer;
    add(k.guidelines, name, `${name}, the team's guidelines`);
    for (const m of k.mistakes ?? []) add(`Common mistake: ${m}`, name, `${name}'s usage`);
    for (const l of k.limitations ?? []) add(`Limitation: ${l}`, name, `${name}'s usage`);
    for (const d of k.donts ?? []) add(`Don't: ${d}`, name, `${name}'s Do and Don't`);
    if (k.notFor) add(`Not when: ${k.notFor}`, name, `${name}'s When not to use`);
    const from = `${name}'s intent layer page`;
    for (const r of page?.rules ?? []) add(r, name, from);
    for (const m of page?.mistakes ?? []) add(`Common mistake: ${m}`, name, from);
    for (const l of page?.limitations ?? []) add(`Limitation: ${l}`, name, from);
    for (const u of page?.whenNotToUse ?? []) add(`Not when: ${u}`, name, from);
    for (const u of page?.whenToUse ?? []) add(`Use when: ${u}`, name, from);
  }
  const names = Object.keys(ctx.components ?? {});
  const at = out.length;
  for (const a of agents) add(a.text, null, a.file, true);
  // Of an instruction file, only what is about the system: the rest is the project's own, and not this sweep's to read.
  return [...out.slice(0, at), ...out.slice(at).filter((r) => aboutOf(r, names)[0] !== '*' || subject(r.text).some((w) => SYSTEM_WORDS.has(w)))];
}

// Which components a rule is about: the one whose page it is on, and every name it calls by name. A rule of the
// product that names a component is read beside that component's own rules, which is where the two meet.
function aboutOf(rule, names) {
  const out = new Set(rule.about ? [rule.about] : []);
  const t = rule.text.toLowerCase();
  for (const n of names) if (new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(t)) out.add(n);
  return out.size ? [...out] : ['*'];
}

// How much the two rules are the same rule: what they share against everything either of them says. Taken both ways
// round on purpose — a short sentence sits inside a long one too easily for the smaller one to be the measure.
const alike = (a, b) => {
  const A = new Set(subject(a.text)), B = new Set(subject(b.text));
  if (!A.size || !B.size) return { shared: 0, of: 0 };
  const shared = [...A].filter((w) => B.has(w)).length;
  return { shared, of: shared / (A.size + B.size - shared) };
};

// Every pair of rules read side by side, once each, within the components they are both about.
function pairs(rules, names) {
  const buckets = new Map();
  rules.forEach((r, i) => { for (const b of aboutOf(r, names)) { if (!buckets.has(b)) buckets.set(b, []); buckets.get(b).push(i); } });
  const out = [], seen = new Set();
  for (const [about, list] of buckets) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = list[x], j = list[y], k = `${i}:${j}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // The same sentence read twice in the same place is one rule, not two.
      if (rules[i].from === rules[j].from && key(rules[i].text) === key(rules[j].text)) continue;
      out.push({ a: rules[i], b: rules[j], about: about === '*' ? null : about, ...alike(rules[i], rules[j]) });
    }
  }
  return out;
}

// Two rules that cannot both be followed. Three ways one is told from the other, each decided by what is written:
//   words:  alike in subject, apart in force — "never put it in a toolbar" against "put it in the toolbar";
//   count:  two counts of the same component — "exactly one per screen" against "several, one to a section";
//   place:  two places the same component may only go.
// → [{ about, why, said, against, shared }], the closest match first: that pair is the hardest to tell apart when read.
export function contradictions(ctx = {}, { least = ALIKE.least, of = ALIKE.contradiction, agents = [] } = {}) {
  const rules = rulesRead(ctx, { agents }), names = Object.keys(ctx.components ?? {});
  const all = pairs(rules, names);
  const out = all.filter((p) => p.a.force !== p.b.force && p.shared >= least && p.of >= of)
    .map((p) => ({ about: p.about, why: 'words', said: p.a.force === 'yes' ? p.a : p.b, against: p.a.force === 'yes' ? p.b : p.a, shared: p.shared, of: p.of }));
  // A count is a contradiction on its own: two rules about the same component, one allowing one of it and the other
  // allowing several, disagree whatever else their sentences say.
  for (const p of all) {
    if (!p.about) continue;
    const ca = countOf(p.a.text), cb = countOf(p.b.text);
    if (ca && cb && ca !== cb) out.push({ about: p.about, why: 'count', said: ca === 'one' ? p.a : p.b, against: ca === 'one' ? p.b : p.a, shared: p.shared, of: p.of });
  }
  // And so is a place: a component the documentation says only goes inside one thing, said of two different things.
  const places = new Map();
  for (const i of ctx.inside ?? []) {
    if (!/\bonly\b/i.test(i.sentence)) continue;                    // "may go in a toolbar" rules nothing out
    for (const w of i.within ?? []) {
      if (!places.has(i.component)) places.set(i.component, []);
      places.get(i.component).push({ text: i.sentence, from: i.from, force: 'yes', within: w });
    }
  }
  for (const [about, list] of places) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      if (list[x].within === list[y].within) continue;
      out.push({ about, why: 'place', said: list[x], against: list[y], shared: 0, of: 1 });
    }
  }
  const seen = new Set();
  return out.sort((x, y) => y.of - x.of || y.shared - x.shared)
    .filter((c) => { const k = [key(c.said.text), key(c.against.text)].sort().join('|'); return !seen.has(k) && seen.add(k); });
}

// One rule written twice in different words, in two places. The longer is kept as the one said: the shorter says
// nothing it does not, and whoever settles the pair keeps the sentence that says more.
// → [{ about, kept, repeat, shared }]
export function saidTwice(ctx = {}, { least = ALIKE.least, of = ALIKE.twice, agents = [] } = {}) {
  const rules = rulesRead(ctx, { agents }), names = Object.keys(ctx.components ?? {});
  const out = pairs(rules, names).filter((p) => p.a.force === p.b.force && p.shared >= least && p.of >= of)
    .map((p) => { const [kept, repeat] = subject(p.a.text).length >= subject(p.b.text).length ? [p.a, p.b] : [p.b, p.a]; return { about: p.about, kept, repeat, shared: p.shared, of: p.of }; });
  // The same repeat found under two components is one repeat.
  const seen = new Set();
  return out.sort((x, y) => y.of - x.of || y.shared - x.shared)
    .filter((r) => { const k = [key(r.kept.text), key(r.repeat.text)].sort().join('|'); return !seen.has(k) && seen.add(k); });
}

// A rule that names nothing the system has — no component, no token, none of the system's own furniture, nothing
// written in code voice — and that no check reads: no limit ("one per screen"), nowhere a component may go, no use
// ruled out. It is advice rather than a rule: the agent reads it with every request it will ever answer, and nothing
// can say whether a prototype followed it. → [{ text, from }]
export function namesNothing(ctx = {}) {
  const names = Object.keys(ctx.components ?? {});
  const checked = new Set();
  for (const l of ctx.limits ?? []) checked.add(key(l.sentence));
  for (const i of ctx.inside ?? []) checked.add(key(i.sentence));
  for (const k of Object.values(ctx.components ?? {})) for (const n of k.never ?? []) { checked.add(key(n.sentence)); if (n.clause) checked.add(key(n.clause)); }
  return rulesRead(ctx).filter((r) => {
    if (aboutOf(r, names)[0] !== '*') return false;                      // it names a component
    if (/`[^`]+`|--[a-z]/.test(r.text)) return false;                    // it names a token, or writes in code voice
    if (subject(r.text).some((w) => SYSTEM_WORDS.has(w))) return false;  // it names the system's own furniture
    const k = key(r.text);
    for (const c of checked) if (c === k || c.includes(k) || k.includes(c)) return false;
    return true;
  }).map((r) => ({ text: r.text, from: r.from }));
}

// The three read in one pass, with how many rules they were read from.
export function sweepRules(ctx = {}, opts = {}) {
  return { read: rulesRead(ctx, opts).length, contradictions: contradictions(ctx, opts), twice: saidTwice(ctx, opts), nothing: namesNothing(ctx) };
}

const WHY = { words: 'one allows what the other rules out', count: 'two counts of the same component', place: 'two places it may only go' };
const where = (r) => `${r.text}  (${r.from})`;
// What a person reads. Nothing here is an error: every line is a pair to settle or a sentence to place, and the
// engine says which of the three it is, never what the answer should be.
export function sweepLines(s, { most = 12 } = {}) {
  const out = [];
  if (!s.read) return out;
  out.push(`📖 ${s.read} rule${s.read === 1 ? '' : 's'} are in front of the agent. Read against each other:`);
  const part = (list, head, line) => {
    if (!list.length) return;
    out.push(`   ${head}`);
    for (const x of list.slice(0, most)) for (const l of line(x)) out.push(`     ${l}`);
    if (list.length > most) out.push(`     …and ${list.length - most} more`);
  };
  part(s.contradictions, `${s.contradictions.length} pair${s.contradictions.length === 1 ? '' : 's'} cannot both be followed — whichever the agent reads last wins, so each is a decision nobody has made:`,
    (c) => [`${c.about ? `${c.about}: ` : ''}${where(c.said)}`, `against (${WHY[c.why]}): ${where(c.against)}`]);
  part(s.twice, `${s.twice.length} rule${s.twice.length === 1 ? '' : 's'} said twice in different words — two rules to read, one rule to follow:`,
    (t) => [`${t.about ? `${t.about}: ` : ''}${where(t.kept)}`, `again: ${where(t.repeat)}`]);
  part(s.nothing, `${s.nothing.length} rule${s.nothing.length === 1 ? '' : 's'} name nothing the system has and no check reads — advice the agent carries into every request, with nothing able to say whether a prototype followed it:`,
    (n) => [where(n)]);
  if (out.length === 1) out.push('   nothing to settle: no pair contradicts, nothing is said twice, every rule names something the system has.');
  return out;
}
