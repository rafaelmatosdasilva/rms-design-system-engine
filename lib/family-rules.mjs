// family-rules.mjs - the components of one family built alike, compared on what makes a family one.
//
// The family check compares how a type sets its states, names its properties and the shape most of it has. Components
// of one type built apart make every person and agent guess which way this one goes, so this compares the rest: the
// variant grid, the options an axis takes, its default, the order of the properties, how the frame sizes, the states
// most of the family answers and how its text fits. Each is what most of the family already does; a family of one or
// two has no "most" and no rule.
//
//   familyRules({ skeleton, props }, { familyOf }) → [{ id, says, items: [{ component, value, fits }] }]
//     skeleton: figma-skeleton.snapshot.json (each component's variants and trees); props: figma-component-props.snapshot.json
//     familyOf: the construction grammar's (the first word of a name: button for buttonPrimary)
//
// Pure: nothing is read or written here.

const MIN_FAMILY = 3;   // a family of three or more, as the family shape (construction-grammar.mjs)
const SHARE = 0.8;      // most of a family: FIX_SHARE
const clean = (k) => String(k).replace(/#[^#]*$/, '');
const axesOf = (vn) => Object.fromEntries(String(vn).split(/,\s*/).map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0]));
const most = (values) => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? [null, 0]; };
const REST = /^(default|rest|enabled|idle|normal|off|false)$/i;
const INTERACTIVE = /^(hover|hovered|press|pressed|active|focus|focused|disabled)$/i;

export function familyRules({ skeleton = {}, props = {} } = {}, { familyOf }) {
  const names = [...new Set([...Object.keys(props), ...Object.keys(skeleton)])].filter((n) => !n.startsWith('_')).sort();
  const variantProps = (n) => Object.entries(props[n]?.properties ?? {}).filter(([, d]) => d?.type === 'VARIANT' && (d.variantOptions ?? []).length).map(([k, d]) => [clean(k), d]);
  const families = {};
  for (const n of names) (families[familyOf(n)] ??= []).push(n);
  const big = Object.values(families).filter((l) => l.length >= MIN_FAMILY);
  const rules = [];
  const push = (id, says, items) => { if (items.length) rules.push({ id, says, items }); };

  // The variant grid: a variant for every combination of a component's options (a grid of at most 64 to keep it a grid).
  push('variant-grid', 'A component has a variant for every combination of its options', names.map((n) => {
    const axes = variantProps(n), have = new Set((skeleton[n]?.variants ?? []).map(([vn]) => JSON.stringify(Object.entries(axesOf(vn)).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]).sort())));
    if (axes.length < 2 || !have.size) return null;
    let combos = [[]];
    for (const [k, d] of axes) combos = combos.flatMap((c) => d.variantOptions.map((o) => [...c, [k.toLowerCase(), String(o).toLowerCase()]]));
    if (combos.length > 64) return null;
    const missing = combos.filter((c) => !have.has(JSON.stringify(c.slice().sort())));
    return { component: n, value: missing.slice(0, 3).map((c) => c.map(([k, v]) => `${k}=${v}`).join(', ')).join('; ') + (missing.length > 3 ? `; ${missing.length - 3} more` : ''), fits: !missing.length };
  }).filter(Boolean));

  // An axis a family shares: the options most of it takes, and the default most of it starts on.
  const optionItems = [], defaultItems = [];
  for (const list of big) {
    const byAxis = {};
    // A state axis is each component's own (a calendar button has selected, a link has not): family-states compares
    // the states a family answers, so it is left out of the options and the defaults.
    for (const n of list) for (const [k, d] of variantProps(n)) if (!/state|status/i.test(k)) (byAxis[k.toLowerCase()] ??= []).push([n, d]);
    for (const [axis, members] of Object.entries(byAxis).filter(([, m]) => m.length >= MIN_FAMILY)) {
      const set = (d) => d.variantOptions.map((o) => String(o).toLowerCase()).sort().join(', ');
      const [mainSet] = most(members.map(([, d]) => set(d)));
      for (const [n, d] of members) optionItems.push({ component: n, value: set(d) === mainSet ? '' : `${axis}: ${set(d)}, where its family takes ${mainSet}`, fits: set(d) === mainSet });
      const same = members.filter(([, d]) => set(d) === mainSet);
      const [mainDefault] = most(same.map(([, d]) => String(d.defaultValue).toLowerCase()));
      for (const [n, d] of same) defaultItems.push({ component: n, value: String(d.defaultValue).toLowerCase() === mainDefault ? '' : `${axis} starts on ${d.defaultValue}, where its family starts on ${mainDefault}`, fits: String(d.defaultValue).toLowerCase() === mainDefault });
    }
  }
  push('family-axis-options', 'An axis a family shares takes the options most of the family takes', optionItems);
  push('family-defaults', 'A component of a family starts on the option most of the family starts on', defaultItems);

  // The properties a family shares, in the order most of it lists them.
  const orderItems = [];
  for (const list of big) {
    const keys = (n) => Object.keys(props[n]?.properties ?? {}).map(clean);
    const withProps = list.filter((n) => keys(n).length);
    if (withProps.length < MIN_FAMILY) continue;
    const shared = keys(withProps[0]).filter((k) => withProps.every((n) => keys(n).includes(k)));
    if (shared.length < 2) continue;
    const orderOf = (n) => keys(n).filter((k) => shared.includes(k)).join(', ');
    const [mainOrder] = most(withProps.map(orderOf));
    for (const n of withProps) orderItems.push({ component: n, value: orderOf(n) === mainOrder ? '' : `${orderOf(n)}, where its family lists ${mainOrder}`, fits: orderOf(n) === mainOrder });
  }
  push('family-property-order', 'The properties a family shares come in the order most of it lists them', orderItems);

  // How the frame sizes at rest: hug, fill or fixed on each side, as most of the family.
  const restingTree = (n) => { const s = skeleton[n]; if (!s?.trees?.length) return null; const v = (s.variants ?? []).find(([vn]) => Object.values(axesOf(vn)).every((x) => !INTERACTIVE.test(x))) ?? s.variants?.[0]; return s.trees[v?.[1] ?? 0]; };
  const sizing = (t) => { const l = t?.layout ?? t?.size; return l?.w && l?.h ? `${String(l.w).toLowerCase()} × ${String(l.h).toLowerCase()}` : null; };
  const sizeItems = [];
  for (const list of big) {
    const have = list.map((n) => [n, sizing(restingTree(n))]).filter(([, s]) => s);
    if (have.length < MIN_FAMILY) continue;
    const [main] = most(have.map(([, s]) => s));
    for (const [n, s] of have) sizeItems.push({ component: n, value: s === main ? '' : `sizes ${s}, where its family sizes ${main}`, fits: s === main });
  }
  push('family-sizing', 'A component of a family sizes its frame as most of the family does (hug, fill or fixed)', sizeItems);

  // The interactive states most of a family answers: a state axis's options, hover, press, focus, disabled.
  const stateItems = [];
  for (const list of big) {
    const statesOf = (n) => { const a = variantProps(n).find(([k]) => /state/i.test(k)); return a ? new Set(a[1].variantOptions.map((o) => String(o).toLowerCase()).filter((o) => INTERACTIVE.test(o))) : null; };
    const have = list.map((n) => [n, statesOf(n)]).filter(([, s]) => s);
    if (have.length < MIN_FAMILY) continue;
    const all = [...new Set(have.flatMap(([, s]) => [...s]))];
    const expected = all.filter((x) => have.filter(([, s]) => s.has(x)).length >= have.length * SHARE);
    if (!expected.length) continue;
    for (const [n, s] of have) { const missing = expected.filter((x) => !s.has(x)); stateItems.push({ component: n, value: missing.length ? `no ${missing.join(', no ')}, which its family has` : '', fits: !missing.length }); }
  }
  push('family-states', 'A component of a family answers the interactive states most of the family does', stateItems);

  // How its first text fits: grows or truncates, as most of the family's does.
  const firstText = (t) => { if (!t) return null; for (const c of t.c ?? []) { if (c.t === 'TEXT') return c; if (c.t !== 'INSTANCE') { const x = firstText(c); if (x) return x; } } return null; };
  const fit = (x) => (x ? [x.text?.resize ? String(x.text.resize).toLowerCase().replace(/_/g, ' ') : 'fixed', x.text?.truncate ? `truncates${x.text.maxLines ? ` at ${x.text.maxLines} line${x.text.maxLines === 1 ? '' : 's'}` : ''}` : 'wraps'].join(', ') : null);
  const textItems = [];
  for (const list of big) {
    const have = list.map((n) => [n, fit(firstText(restingTree(n)))]).filter(([, f]) => f);
    // Only a capture that keeps how text fits says anything: a family none of whose texts says so is left alone.
    if (have.length < MIN_FAMILY || !list.some((n) => firstText(restingTree(n))?.text)) continue;
    const [main] = most(have.map(([, f]) => f));
    for (const [n, f] of have) textItems.push({ component: n, value: f === main ? '' : `its text is ${f}, where its family's is ${main}`, fits: f === main });
  }
  push('family-text-fit', 'A component of a family fits its text as most of the family does (grows or truncates)', textItems);
  return rules;
}
