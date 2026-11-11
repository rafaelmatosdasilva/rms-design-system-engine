// capture-waits.mjs - the Figma checks that wait on a fresh read of Figma, and what each needs.
//
// A rule that reads what only a newer capture keeps (each layer's bindings, its opacity and border, a nested
// component's exposure, the designer's annotations) finds nothing on a capture taken before it, and silence reads as a
// library with nothing wrong. So the skeleton snapshot says what its capture keeps (_keeps, written on import), and
// what a rule needs that it does not keep is said instead: which checks wait, and what to ask for.
//
//   KEEPS                      the fields the current recipe keeps (skeletonOf in cookbook/refresh-figma.md)
//   captureWaits(skeleton)     → [{ field, what, rules: [rule ids] }], empty when the capture keeps all of it
//   waitLine(waits)            → one line for a summary, or null
//
// Pure: nothing is read or written here.

export const KEEPS = ['binds', 'looks', 'exposed', 'notes'];

// What each field is, in words, and the rules that read it.
const NEEDS = {
  binds: { what: 'what each layer binds', rules: ['state-tokens', 'own-tokens', 'text-colour-tokens', 'no-base-tokens', 'family-radius', 'shared-tokens-shared', 'own-tokens-used', 'corners-one-variable', 'part-gap', 'family-padding', 'family-fill'] },
  looks: { what: 'each layer\'s opacity and border', rules: ['opacity-bound', 'border-bound', 'border-align'] },
  exposed: { what: 'whether a nested component shows its properties in the parent\'s panel', rules: ['nested-exposed'] },
  notes: { what: 'the designer\'s own annotations', rules: ['family-annotated'] },
};
export const REFRESH = '/rms-design-system-engine refresh the Figma data';

export function captureWaits(skeleton = {}) {
  const comps = Object.entries(skeleton ?? {}).filter(([n, s]) => !n.startsWith('_') && s?.trees?.length).map(([, s]) => s);
  if (!comps.length) return [];
  const keeps = Array.isArray(skeleton._keeps) ? new Set(skeleton._keeps) : null;
  // A capture from before _keeps was written: what it holds shows in the components themselves, where it can show.
  const has = (field) => (keeps ? keeps.has(field) : field === 'binds' ? comps.some((s) => s.binds) : field === 'looks' ? comps.some((s) => s.looks) : false);
  return Object.entries(NEEDS).filter(([field]) => !has(field)).map(([field, n]) => ({ field, what: n.what, rules: n.rules }));
}

export function waitLine(waits = []) {
  if (!waits.length) return null;
  const n = waits.reduce((k, w) => k + w.rules.length, 0);
  return `${n} Figma check${n === 1 ? '' : 's'} wait on a fresh read of Figma, which the last capture predates (${waits.map((w) => w.what).join('; ')}): ask "${REFRESH}".`;
}
