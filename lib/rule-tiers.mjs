// rule-tiers.mjs - the rules an agent reads, in tiers, from the most general to the most specific.
//
// Three kinds of rule reach an agent at once, and nothing today says which wins when two disagree:
//   • the engine's own, true of any design system it checks (ask for the contract, write no value by hand);
//   • the design system's, written by the team that owns it (its guidelines, its intent layer, each component's page);
//   • a product's own, written by the team that builds on the system (a product page or flow in the intent layer, the
//     project's own instruction file for agents).
// The ladder is the same one people use without saying it: the more specific wins, because whoever wrote it knew more
// about the case at hand. A product's rule beats the system's, and the system's beats the engine's own.
//
// That ladder is worth more than its one line of text. It turns most disagreements into something already settled - a
// product saying the system's general rule does not hold here is how a design system is used, not a fault - and leaves
// as a real decision only the pairs inside one tier, where two people writing with the same authority said opposite
// things. rules-sweep.mjs reads it that way, so a person is handed the few pairs nobody has decided rather than every
// place a rule is narrowed.
//
// Pure: a rule is placed by where it was written, never by what it says.

// From the most general to the most specific: a rule of a later tier wins over one of an earlier tier.
export const TIERS = ['universal', 'system', 'product'];
// What each tier is called where a person or an agent reads it.
export const TIER_SAID = {
  universal: "The engine's own rules, true of any design system",
  system: "The design system's own rules",
  product: "This product's own rules",
};
// The layers of the design intent that belong to a product rather than to the system.
const PRODUCT_LAYERS = new Set(['pages', 'flows']);

// Where a rule sits: by its layer, by the file it was written in, else the system's - the team that owns the system
// wrote it. → 'universal' | 'system' | 'product'
export function tierOf(rule = {}) {
  if (TIERS.includes(rule.tier)) return rule.tier;
  if (rule.agent) return 'product';                                   // the project's own instruction file
  if (rule.layer) return PRODUCT_LAYERS.has(rule.layer) ? 'product' : 'system';
  // Without a layer of its own (an older catalog, a rule read back from a file), its title says which layer it is from.
  const m = /\(([a-z]+),\s*(?:intent layer|design intent)\)/i.exec(rule.title ?? rule.from ?? '');
  if (m) return PRODUCT_LAYERS.has(m[1].toLowerCase()) ? 'product' : 'system';
  return 'system';
}

// The rules in tiers, each tier in order, a tier with nothing in it left out. → [{ tier, said, rules }]
export function byTier(rules = []) {
  const by = new Map(TIERS.map((t) => [t, []]));
  for (const r of rules) by.get(tierOf(r)).push(r);
  return TIERS.filter((t) => by.get(t).length).map((t) => ({ tier: t, said: TIER_SAID[t], rules: by.get(t) }));
}

// Which of two rules the ladder settles: the one written closer to the case at hand, or null when both were written
// with the same authority and only a person can say which holds.
export function beats(a, b) {
  const x = TIERS.indexOf(tierOf(a)), y = TIERS.indexOf(tierOf(b));
  return x === y ? null : x > y ? a : b;
}

// The one line that says the ladder, where the rules are put in front of an agent. Named tiers only: the engine's own
// rules are already in the project's instruction file, and saying them twice is what the sweep exists to find.
export function ladderLine(shown = TIERS) {
  const named = TIERS.filter((t) => shown.includes(t));
  return `Read in this order, and where two disagree the more specific one wins (${named.map((t) => TIER_SAID[t].toLowerCase()).join(', then ')}):`;
}
