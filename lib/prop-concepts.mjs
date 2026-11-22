// prop-concepts.mjs - one idea, one prop name and one set of values, across the whole system.
//
// The family rules hold a family to one name for one thing (family-consistency.mjs) and one set of options for an
// axis it shares (family-rules.mjs). Across families nothing did: a button's words come through label, a chip's
// through text and a badge's through content; a button's size runs S to L, an input's sm to lg. An agent building
// the next component copies whichever it meets first, and the system drifts one component at a time. This reads the
// system's own components against each other, the same way in Figma (its properties) and in the code (its props):
//   • the same idea under two names: props whose names mean the same thing (the system's most used name is the one
//     to keep);
//   • one prop whose values differ from component to component: the same prop taking another set of options, said
//     beside the set most components take, and a set written on another scale (sm, md where most write S, M).
// It also gives the catalog each prop's other names, so an agent that guesses one is answered with the system's.
//
//   conceptOf(name)                     → the idea a prop name stands for, or null
//   nameRule(components) / valueRule(components) → a rule's items ({ component, value, fits }), or null
//     components: [{ name, props: [{ name, values }] }]
//   otherNames(name, used)              → the names of the same idea the system does not use for it
import { norm, sizeGroup } from './prop-vocabulary.mjs';

// Names that stand for the same idea. Each list is one idea; the first name is only its label here, never a preference:
// the system's own most used name is the one kept.
export const CONCEPTS = {
  words: ['label', 'text', 'labeltext', 'content', 'caption'],
  look: ['variant', 'kind', 'appearance', 'look', 'emphasis', 'hierarchy'],
  meaning: ['tone', 'intent', 'status', 'severity', 'sentiment'],
  size: ['size', 'scale', 'dimension'],
  off: ['disabled', 'inactive'],
  shown: ['open', 'expanded', 'visible', 'shown'],
  picked: ['selected', 'active', 'current'],
  reading: ['readonly', 'locked'],
  required: ['required', 'mandatory'],
  wrong: ['invalid', 'error', 'haserror'],
};
const OF = new Map(Object.entries(CONCEPTS).flatMap(([c, names]) => names.map((n) => [n, c])));
// A prop's own name, without the words that only say how it is held: isDisabled is disabled, showLabel is label.
const bare = (name) => norm(String(name).replace(/#.*$/, '').replace(/^(is|has|show)(?=[A-Z_\s-])/, ''));
export const conceptOf = (name) => OF.get(bare(name)) ?? null;

const props = (c) => (c?.props ?? []).filter((p) => p?.name);

// The same idea under two names: for each idea at least two components carry under different names, the name most of
// them use, and each component that writes another. → { says, items } | null
export function nameRule(components = []) {
  const used = new Map();   // concept → name → [component]
  for (const c of components) for (const p of props(c)) {
    const k = conceptOf(p.name);
    if (!k) continue;
    const n = bare(p.name), m = used.get(k) ?? used.set(k, new Map()).get(k);
    (m.get(n) ?? m.set(n, new Set()).get(n)).add(c.name);
  }
  const split = [...used].filter(([, m]) => m.size >= 2);
  if (!split.length) return null;
  const main = new Map(split.map(([k, m]) => [k, [...m].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0][0]]));
  const items = components.filter((c) => props(c).some((p) => main.has(conceptOf(p.name)))).map((c) => {
    const off = props(c).filter((p) => main.has(conceptOf(p.name)) && bare(p.name) !== main.get(conceptOf(p.name))).map((p) => `${p.name}, where the system says ${main.get(conceptOf(p.name))}`);
    return { component: c.name, value: off.join(' · '), fits: !off.length };
  });
  return { says: `One idea has one prop name across the system: ${split.map(([k]) => main.get(k)).join(', ')}`, items };
}

// One prop whose values differ from component to component: for each prop name (or idea) at least three components
// take with a set of options, the set most take; a component whose set differs is listed with both. A set written on
// another scale than most (sm, md for S, M) is said as such. → { says, items } | null
export function valueRule(components = []) {
  const byKey = new Map();
  for (const c of components) for (const p of props(c)) {
    const vals = (p.values ?? []).map(String);
    if (vals.length < 2 || vals.every((v) => /^(true|false)$/i.test(v))) continue;
    const key = conceptOf(p.name) ?? bare(p.name);
    (byKey.get(key) ?? byKey.set(key, []).get(key)).push({ component: c.name, prop: p.name, vals });
  }
  const sets = [...byKey].filter(([, l]) => l.length >= 3 && new Set(l.map((x) => x.vals.map(norm).sort().join('|'))).size > 1);
  if (!sets.length) return null;
  const items = [];
  const says = [];
  for (const [, l] of sets) {
    const count = new Map();
    for (const x of l) { const k = x.vals.map(norm).sort().join('|'); count.set(k, (count.get(k) ?? 0) + 1); }
    const [mainKey] = [...count].sort((a, b) => b[1] - a[1])[0];
    const main = l.find((x) => x.vals.map(norm).sort().join('|') === mainKey).vals;
    says.push(`${l[0].prop} takes ${main.join(', ')}`);
    for (const x of l) {
      const same = x.vals.map(norm).sort().join('|') === mainKey;
      // Another scale: every value of this set is a size whose step most components write another way.
      const scale = !same && x.vals.every((v) => sizeGroup(v)) && x.vals.some((v) => !main.map(norm).includes(norm(v)) && main.some((m) => sizeGroup(m) === sizeGroup(v)));
      items.push({ component: x.component, value: same ? '' : `${x.prop} takes ${x.vals.join(', ')}${scale ? ', on another scale than' : ', where most take'} ${main.join(', ')}`, fits: same });
    }
  }
  return { says: `One prop takes one set of values across the system: ${says.join(' · ')}`, items };
}

// The names of the same idea the system does not use for this prop, for the catalog to answer a guess with the
// system's own. used: every prop name the system's components have.
export function otherNames(name, used = []) {
  const k = conceptOf(name);
  if (!k) return [];
  const mine = new Set(used.map(bare));
  return CONCEPTS[k].filter((n) => n !== bare(name) && !mine.has(n));
}
