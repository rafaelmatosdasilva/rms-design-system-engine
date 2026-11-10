// need-rules.mjs - whether the library needed a component: one nothing uses, and one that is another with an option
// that other already has.
//
// The review reads how a component is built, never whether it should exist. Two that are built alike are a pair
// already (no-twins, library-rules.mjs); these are the other two ways a library holds a thing it did not need. Each is
// a component for a person to look at, never one the engine removes or merges.
//
//   needRules({ props, skeleton, examples }) → [{ id, area, says, items: [{ component, value, fits }] }]
//     props: figma-component-props.snapshot.json; skeleton: figma-skeleton.snapshot.json (each tree's instances);
//     examples: figma-examples.snapshot.json (each component's instances placed on the file's pages)
//
//   component-used     a component is used: placed on a page of the file, or held by another component
//   no-option-twins    a component is not another with an option that other already has (buttonLarge beside a
//                      button whose Size takes large)
//
// Pure: nothing is read or written here.

const clean = (k) => String(k).replace(/#[^#]*$/, '');
const low = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
const layersOf = (t, out = []) => { for (const c of t?.c ?? []) { out.push(c); if (c.t !== 'INSTANCE') layersOf(c, out); } return out; };

export function needRules({ props = {}, skeleton = {}, examples = null } = {}) {
  const rules = [];
  const push = (id, area, says, items) => { if (items.length) rules.push({ id, area, says, items }); };
  const names = Object.keys(props).filter((n) => !/^[_.]/.test(n)).sort();

  // Used: placed on a page (an example), or held inside another component's tree. Without the examples a component
  // nothing holds may still be placed on a page, so the rule needs them.
  if (examples?.components) {
    const held = new Set();
    for (const [n, s] of Object.entries(skeleton)) for (const t of s?.trees ?? []) for (const l of layersOf(t)) if (l.t === 'INSTANCE' && l.of?.name && l.of.name !== n) held.add(l.of.name);
    for (const list of Object.values(examples.components)) for (const e of list ?? []) for (const i of e?.items ?? []) if (i?.component) held.add(i.component);
    push('component-used', 'architecture', 'A component is used: placed on a page of the file, or held by another component', names.map((n) => {
      const used = (examples.components[n] ?? []).length > 0 || held.has(n);
      return { component: n, value: used ? '' : 'nothing places or holds it', fits: used };
    }));
  }

  // Another with an option: a name that is another component's name and one of its variant options (buttonLarge,
  // button-large), where that other component's axis already takes the option.
  const optionsOf = (n) => Object.entries(props[n]?.properties ?? {}).filter(([, d]) => d?.type === 'VARIANT').flatMap(([k, d]) => (d.variantOptions ?? []).map((o) => [clean(k), String(o)]));
  const bases = names.map((n) => [n, low(n), optionsOf(n)]).filter(([, , o]) => o.length);
  push('no-option-twins', 'architecture', 'A component is not another with an option that other already has', names.map((n) => {
    const me = low(n);
    const hit = bases.find(([b, bl, opts]) => b !== n && me.startsWith(bl) && me.length > bl.length && opts.some(([, o]) => low(o) === me.slice(bl.length)));
    if (!hit) return { component: n, value: '', fits: true };
    const [b, bl, opts] = hit, [axis, o] = opts.find(([, x]) => low(x) === me.slice(bl.length));
    return { component: n, value: `it is ${b} with ${axis}=${o}, which ${b} already takes`, fits: false };
  }));
  return rules;
}
