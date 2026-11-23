// difference-cause.mjs - each difference sorted by why it is there, only where the engine can read it.
//
// The same difference needs a different person and a different fix depending on why it is there: the code got it
// wrong, the spec never said, the system disagrees with itself, a product is on an older version, or it is kept on
// purpose. Who acts follows from the cause. A cause is given only where something the engine keeps says it:
//   - kept on purpose: the team's kept differences (listed apart already, never open);
//   - a product on an older version: the product's pinned version of the system is behind the system's own;
//   - the code got it wrong: what Figma and the code last agreed on (agreed.mjs) says the code moved since, or that
//     Figma moved and the code has not followed.
// Anything else is left unsorted, with the question that would settle it, never a guess. "The spec never said" and
// "the system disagrees with itself" are not read here yet: nothing the engine keeps says either for certain.
//
//   causeOf(item, { products, latest, compare }) → { cause, who, why } | { cause: 'unsorted', question }
//   sortByCause(d, opts)                        → d with each open item's cause, and d.causes the counts
//   causeLine(c)                                → the words a list shows beside an item

export const CAUSES = {
  code: 'the code got it wrong',
  spec: 'the spec never said',
  self: 'the system disagrees with itself',
  older: 'a product is on an older version',
  kept: 'kept on purpose',
  unsorted: 'not sorted yet',
};

// The labels structure-check.mjs writes on a measured difference, from agreed.mjs's MOVED_LABEL.
const CODE_MOVED = /\[code moved, Figma is behind\]/;
const FIGMA_MOVED = /\[Figma moved, code is behind\]/;
const BOTH_MOVED = /\[both moved since they agreed\]/;

// products: [{ name, uses }] (releases.mjs productsOf); latest: the system's own version (systemVersion);
// compare: releases.mjs compareVersions.
export function causeOf(item = {}, { products = [], latest = null, compare = null } = {}) {
  const what = String(item.what ?? '');
  if (item.product && latest && compare) {
    const p = products.find((x) => x.name === item.product);
    if (p?.uses && compare(String(p.uses), String(latest)) < 0) return { cause: 'older', who: `${item.product}'s team`, why: `${item.product} uses ${p.uses} of the system, which is at ${latest}: moving it up may settle this` };
  }
  if (CODE_MOVED.test(what)) return { cause: 'code', who: 'the code', why: 'the code changed since Figma and the code last agreed, and Figma did not' };
  if (FIGMA_MOVED.test(what)) return { cause: 'code', who: 'the code', why: 'Figma changed since they last agreed, and the code has not followed' };
  if (BOTH_MOVED.test(what)) return { cause: 'unsorted', question: 'both sides changed since they last agreed: which one is right?' };
  return { cause: 'unsorted', question: item.side === 'figma'
    ? 'is this Figma\'s own work, or does the system disagree with itself?'
    : 'did the code get it wrong, or did the spec never say? Once the two sides agree on it, a later change here says which side moved' };
}

export function sortByCause(d = {}, opts = {}) {
  const counts = Object.fromEntries(Object.keys(CAUSES).map((k) => [k, 0]));
  for (const g of d.groups ?? []) for (const it of g.items ?? []) { it.cause = causeOf(it, opts); counts[it.cause.cause]++; }
  counts.kept = (d.kept ?? []).length;
  for (const k of Object.keys(counts)) if (!counts[k]) delete counts[k];
  d.causes = counts;
  return d;
}

export const causeLine = (c) => !c ? '' : c.cause === 'unsorted' ? `not sorted: ${c.question}` : `${CAUSES[c.cause]} (${c.why}) · ${c.who} acts`;
export const causesSummary = (counts = {}) => Object.entries(counts).map(([k, n]) => `${n} ${CAUSES[k]}`).join(' · ');
