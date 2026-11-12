// use-rules.mjs - what the file's own evidence says of a component: its swap and slot properties' preferred
// components, and the examples the design team drew with it.
//
// The examples (figma-examples.mjs) are read so the Playground opens a component as it is really used; nothing asked
// them what a component's default should be, or how its words are written. A swap or slot property can list the
// components it prefers, which is all an agent has to go on when it fills one; nothing asked whether it does. Each rule
// is what most of the library already does; one that none of it does is no rule.
//
//   useRules({ props, skeleton, examples }) → [{ id, area, says, items: [{ component, value, fits }] }]
//     props: figma-component-props.snapshot.json; skeleton: figma-skeleton.snapshot.json (swaps);
//     examples: figma-examples.snapshot.json ({ components: { name: [{ props, texts, items }] } })
//
//   swap-preferred    a swap or slot property lists the components it prefers
//   default-in-use    a property starts on a value its uses take, never one most of them change (its own examples
//                     and each time it sits inside another's)
//   words-case        a component's words are written in the case most components' are (Sentence case, Title Case)
//
// Pure: nothing is read or written here.

const MIN = 3;          // three examples, or three components, before anything is said
const SHARE = 0.8;      // most: FIX_SHARE, as the construction grammar
const clean = (k) => String(k).replace(/#[^#]*$/, '');
const low = (v) => String(v).toLowerCase();

// The case a short label is written in: words of letters only, two to four of them, so a single word or a sentence
// with a name in it says nothing.
export function caseOf(text) {
  const w = String(text ?? '').trim().split(/\s+/);
  if (w.length < 2 || w.length > 4 || !w.every((x) => /^[A-Za-z]+$/.test(x))) return null;
  if (w.every((x) => x === x.toUpperCase())) return 'UPPER CASE';
  if (w.every((x) => /^[A-Z][a-z]*$/.test(x))) return 'Title Case';
  if (/^[A-Z][a-z]*$/.test(w[0]) && w.slice(1).every((x) => x === x.toLowerCase())) return 'Sentence case';
  if (w.every((x) => x === x.toLowerCase())) return 'lower case';
  return null;
}

export function useRules({ props = {}, skeleton = {}, examples = null } = {}) {
  const rules = [];
  const push = (id, area, says, items) => { if (items.length) rules.push({ id, area, says, items }); };
  const names = [...new Set([...Object.keys(props), ...Object.keys(skeleton)])].filter((n) => !/^[_.]/.test(n)).sort();

  // Preferred components on a swap or slot property.
  push('swap-preferred', 'wiring', 'A swap or slot property lists the components it prefers', names.map((n) => {
    const swaps = Object.entries(skeleton[n]?.swaps ?? {});
    if (!swaps.length) return null;
    const bare = swaps.filter(([, s]) => !(s?.preferred ?? []).length).map(([k]) => clean(k));
    return { component: n, value: bare.length ? `${bare.join(', ')} prefer${bare.length === 1 ? 's' : ''} nothing` : '', fits: !bare.length };
  }).filter(Boolean));

  const ex = examples?.components ?? {};
  // Every use of a component the examples show: its own, and each time it sits inside another's (a bar's tabs).
  const uses = new Map(names.map((n) => [n, [...(ex[n] ?? [])]]));
  for (const list of Object.values(ex)) for (const e of list ?? []) for (const i of e?.items ?? []) if (uses.has(i.component)) uses.get(i.component).push(i);
  // A property's default against what its uses set: a variant or boolean most of them move off.
  push('default-in-use', 'wiring', 'A property starts on a value its examples use, never one most of them change', names.map((n) => {
    const list = uses.get(n).filter((e) => e?.props && Object.keys(e.props).length);
    if (list.length < MIN) return null;
    const off = [];
    for (const [k, d] of Object.entries(props[n]?.properties ?? {})) {
      if (!['VARIANT', 'BOOLEAN'].includes(d?.type) || d.defaultValue == null) continue;
      const key = clean(k), set = list.map((e) => e.props[key] ?? e.props[k]).filter((v) => v != null);
      if (set.length < MIN) continue;
      const other = set.filter((v) => low(v) !== low(d.defaultValue));
      if (other.length < set.length * SHARE) continue;
      const c = new Map(); for (const v of other) c.set(low(v), (c.get(low(v)) ?? 0) + 1);
      const [top] = [...c].sort((a, b) => b[1] - a[1])[0];
      off.push(`${key} starts on ${d.defaultValue}, where ${other.length} of ${set.length} uses change it, most to ${top}`);
    }
    return { component: n, value: off.join('; '), fits: !off.length };
  }).filter(Boolean));

  // The case a component's words are in, read from its examples' own short labels; the library's is the one most use.
  const caseByComp = names.map((n) => {
    const c = new Map();
    for (const e of uses.get(n)) for (const t of e.texts ?? []) { const k = caseOf(t); if (k) c.set(k, (c.get(k) ?? 0) + 1); }
    const [top] = [...c].sort((a, b) => b[1] - a[1])[0] ?? [];
    return top ? [n, top] : null;
  }).filter(Boolean);
  if (caseByComp.length >= MIN) {
    const c = new Map(); for (const [, k] of caseByComp) c.set(k, (c.get(k) ?? 0) + 1);
    const [main] = [...c].sort((a, b) => b[1] - a[1])[0];
    push('words-case', 'content', `A component's words are written in ${main}, as most are`, caseByComp.map(([n, k]) => ({ component: n, value: k === main ? '' : `its examples are in ${k}`, fits: k === main })));
  }
  return rules;
}
