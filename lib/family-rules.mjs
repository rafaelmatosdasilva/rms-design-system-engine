// family-rules.mjs - the components of one family built alike, compared on what makes a family one.
//
// The family check compares how a type sets its states, names its properties and the shape most of it has. Components
// of one type built apart make every person and agent guess which way this one goes, so this compares the rest: the
// variant grid, the options an axis takes, its default, the order of the properties, how the frame sizes, the states
// most of the family answers, how its text fits, how its content is aligned, which part fills it, its padding, its
// minimum and maximum, the steps between its sizes, how each part is shown, what each property changes and how its
// fill is bound.
// Each is what most of the family already does; a family of one or two has no "most" and no rule.
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

  // Alike inside a family: the members built from the same parts (the same names on the frame's own layers), so a
  // button with an icon and a label is held against the others that have them, never against a list of buttons.
  const partsOf = (n) => (restingTree(n)?.c ?? []).map((c) => String(c.n ?? '').toLowerCase()).sort().join('|');
  const alike = big.flatMap((list) => { const g = new Map(); for (const n of list) { const k = partsOf(n); if (!g.has(k)) g.set(k, []); g.get(k).push(n); } return [...g.values()].filter((l) => l.length >= MIN_FAMILY); });
  const WORD = { min: 'start', max: 'end', center: 'centre', space_between: 'spread', baseline: 'baseline' };
  const said = (x) => WORD[String(x ?? 'MIN').toLowerCase()] ?? String(x).toLowerCase();

  // How its content is aligned at rest, along the frame and across it, as most of those alike in its family.
  const alignOf = (t) => (t?.layout?.main || t?.layout?.cross ? `${said(t.layout.main)} along, ${said(t.layout.cross)} across` : null);
  const alignItems = [];
  for (const list of alike) {
    const have = list.map((n) => [n, alignOf(restingTree(n))]).filter(([, a]) => a);
    if (have.length < MIN_FAMILY) continue;
    const [main] = most(have.map(([, a]) => a));
    for (const [n, a] of have) alignItems.push({ component: n, value: a === main ? '' : `its content is aligned ${a}, where its family's is ${main}`, fits: a === main });
  }
  push('family-align', 'A component of a family aligns its content as most of the family does', alignItems);

  // Which of its parts stretches to fill: the one most of those alike let grow (none is an answer too).
  const growing = (t) => (t?.c ? ([...new Set(t.c.filter((c) => c.grow || c.stretch || c.size?.w === 'FILL' || c.layout?.w === 'FILL').map((c) => String(c.n ?? '').toLowerCase()))].sort().join(', ') || 'none') : null);
  const growItems = [];
  for (const list of alike) {
    const have = list.map((n) => [n, growing(restingTree(n))]).filter(([, g]) => g);
    if (have.length < MIN_FAMILY || have.every(([, g]) => g === 'none')) continue;
    const [main] = most(have.map(([, g]) => g));
    for (const [n, g] of have) growItems.push({ component: n, value: g === main ? '' : `${g === 'none' ? 'no part' : g} fills its frame, where in its family ${main === 'none' ? 'no part does' : `${main} does`}`, fits: g === main });
  }
  push('family-stretch', 'A component of a family lets the part most of the family lets fill its frame', growItems);

  // The padding variables on its frame at each size, as most of the family binds them there.
  const PAD = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  const sizeOf = (vn) => Object.entries(axesOf(vn)).find(([k]) => /^size$/i.test(k))?.[1]?.toLowerCase() ?? '';
  const padItems = [];
  for (const list of big) {
    const at = new Map();   // size -> [[component, padding]]
    for (const n of list) {
      const seen = new Set();
      for (const [vn] of skeleton[n]?.variants ?? []) {
        const b = skeleton[n].binds?.[vn]?.[''], size = sizeOf(vn);
        if (!b || seen.has(size) || !PAD.some((k) => b[k])) continue;
        seen.add(size);
        if (!at.has(size)) at.set(size, []);
        at.get(size).push([n, PAD.map((k) => b[k] ?? '-').join(' ')]);
      }
    }
    for (const [size, have] of at) {
      if (have.length < MIN_FAMILY) continue;
      const [main] = most(have.map(([, p]) => p));
      for (const [n, p] of have) padItems.push({ component: n, value: p === main ? '' : `its padding${size ? ` at ${size}` : ''} is ${p}, where its family's is ${main}`, fits: p === main });
    }
  }
  push('family-padding', 'A component of a family binds the padding most of the family binds at the same size', padItems);

  // Its frame's minimum and maximum at each size, as most of those alike in its family set them.
  const limitsOf = (t) => (t?.limits ? Object.entries(t.limits).sort().map(([k, v]) => `${k.replace(/([A-Z])/, ' $1').toLowerCase()} ${v}`).join(', ') : 'none');
  const limitItems = [];
  for (const list of alike) {
    const at = new Map();
    for (const n of list) { const seen = new Set(); for (const [vn, i] of skeleton[n]?.variants ?? []) { const size = sizeOf(vn); if (seen.has(size)) continue; seen.add(size); if (!at.has(size)) at.set(size, []); at.get(size).push([n, limitsOf(skeleton[n].trees[i])]); } }
    for (const [size, have] of at) {
      if (have.length < MIN_FAMILY || have.every(([, l]) => l === 'none')) continue;
      const [main] = most(have.map(([, l]) => l));
      for (const [n, l] of have) limitItems.push({ component: n, value: l === main ? '' : `its limits${size ? ` at ${size}` : ''} are ${l}, where its family's are ${main}`, fits: l === main });
    }
  }
  push('family-limits', 'A component of a family sets the minimum and maximum most of the family sets at the same size', limitItems);

  // How its frame's fill is bound at rest: to a token of its own (one named after it or its family), to a shared one,
  // or to none, as most of those alike bind theirs. Which token is the variant's own (a primary button and a secondary
  // one bind different ones); the way they bind it is the family's.
  const fillKind = (n) => {
    const s = skeleton[n], v = (s?.variants ?? []).find(([vn]) => Object.values(axesOf(vn)).every((x) => !INTERACTIVE.test(x))) ?? s?.variants?.[0];
    if (!v || !s.binds) return null;
    const f = s.binds[v[0]]?.['']?.fills, name = String(Array.isArray(f) ? f[0] : f ?? '').toLowerCase(), own = [n.toLowerCase(), familyOf(n).toLowerCase()];
    return !f ? 'binds no fill' : name.split('/').some((x) => own.includes(x) || x.startsWith(familyOf(n).toLowerCase())) ? 'binds a fill token of its own' : 'binds a shared fill token';
  };
  const fillItems = [];
  for (const list of alike) {
    const have = list.map((n) => [n, fillKind(n)]).filter(([, k]) => k);
    if (have.length < MIN_FAMILY) continue;
    const [main] = most(have.map(([, k]) => k));
    for (const [n, k] of have) fillItems.push({ component: n, value: k === main ? '' : `its frame ${k}, where its family's ${main.replace(/^binds/, 'bind')}`, fits: k === main });
  }
  push('family-fill', 'A component of a family binds its frame\'s fill the way most of the family does (its own token, a shared one or none)', fillItems);

  // The steps between its sizes: the frame's padding and gap in pixels at each size, at rest, as most of those alike.
  const restAt = (n) => { const out = new Map(); for (const [vn, i] of skeleton[n]?.variants ?? []) { const a = axesOf(vn), size = sizeOf(vn); if (!size || out.has(size) || Object.values(a).some((x) => INTERACTIVE.test(x))) continue; out.set(size, skeleton[n].trees[i]); } return out; };
  const stepOf = (t) => (t?.layout ? `padding ${(t.layout.pad ?? []).join(' ')}, gap ${t.layout.gap ?? 0}` : null);
  const stepItems = [];
  for (const list of alike) {
    const at = new Map();
    for (const n of list) for (const [size, t] of restAt(n)) { const st = stepOf(t); if (!st) continue; if (!at.has(size)) at.set(size, []); at.get(size).push([n, st]); }
    for (const [size, have] of at) {
      if (have.length < MIN_FAMILY) continue;
      const [main] = most(have.map(([, x]) => x));
      for (const [n, x] of have) stepItems.push({ component: n, value: x === main ? '' : `at ${size} its ${x}, where its family's ${main}`, fits: x === main });
    }
  }
  push('family-size-steps', 'A component of a family is padded and spaced in pixels at each size as most of the family is', stepItems);

  // How each part is shown: always there, by a yes/no property (wired to its visibility), or by a variant (hidden in
  // some variants with nothing wired), as most of those alike that have the part.
  const shownOf = (n) => {
    const trees = skeleton[n]?.trees ?? [], out = new Map();
    for (const t of trees) for (const c of t?.c ?? []) {
      const k = String(c.n ?? '').toLowerCase(), was = out.get(k) ?? { hidden: false, shown: false, wired: false };
      out.set(k, { hidden: was.hidden || !!c.hidden, shown: was.shown || !c.hidden, wired: was.wired || !!c.wired?.visible });
    }
    return new Map([...out].map(([k, x]) => [k, x.wired ? 'by a yes/no property' : x.hidden && x.shown ? 'by a variant' : x.hidden ? 'hidden' : 'always']));
  };
  const shownItems = [];
  for (const list of alike) {
    const ways = new Map(list.map((n) => [n, shownOf(n)]));
    const parts = [...new Set([...ways.values()].flatMap((m) => [...m.keys()]))];
    const mainOf = new Map(parts.map((k) => [k, most(list.map((n) => ways.get(n).get(k)).filter(Boolean))[0]]));
    for (const n of list) {
      const say = (w) => ({ always: 'always there', hidden: 'always hidden' })[w] ?? `shown ${w}`;
      const off = [...ways.get(n)].filter(([k, w]) => w !== mainOf.get(k)).map(([k, w]) => `${k} is ${say(w)}, where in its family it is ${say(mainOf.get(k))}`);
      shownItems.push({ component: n, value: off.join('; '), fits: !off.length });
    }
  }
  push('family-parts-shown', 'A component of a family shows each part the way most of the family does (always, by a yes/no property or by a variant)', shownItems);

  // What each property changes: between two variants that differ by it alone, the parts and attributes that change
  // (the frame's padding and gap, a part's text style, a field bound to another variable), as most of those alike.
  const changesOf = (n, axis) => {
    const s = skeleton[n], vs = (s?.variants ?? []).map(([vn, i]) => [vn, axesOf(vn), i]);
    for (const [av, aa, ai] of vs) for (const [bv, ba, bi] of vs) {
      if (av === bv || aa[axis] === ba[axis] || !Object.keys(aa).every((k) => k === axis || aa[k] === ba[k])) continue;
      const A = s.trees[ai], B = s.trees[bi], out = new Set();
      if (JSON.stringify(A?.layout?.pad) !== JSON.stringify(B?.layout?.pad)) out.add('the frame: padding');
      if ((A?.layout?.gap ?? 0) !== (B?.layout?.gap ?? 0)) out.add('the frame: gap');
      (A?.c ?? []).forEach((c, i) => { const d = B?.c?.[i]; if (d && c.n === d.n && (c.styles?.text ?? '') !== (d.styles?.text ?? '')) out.add(`${String(c.n).toLowerCase()}: text style`); });
      const ab = s.binds?.[av] ?? {}, bb = s.binds?.[bv] ?? {};
      for (const p of new Set([...Object.keys(ab), ...Object.keys(bb)])) for (const f of new Set([...Object.keys(ab[p] ?? {}), ...Object.keys(bb[p] ?? {})])) {
        if (JSON.stringify(ab[p]?.[f]) === JSON.stringify(bb[p]?.[f])) continue;
        let node = A; for (const x of p ? p.split('.') : []) node = node?.c?.[Number(x)];
        out.add(`${p ? String(node?.n ?? p).toLowerCase() : 'the frame'}: ${f}`);
      }
      return [...out].sort().join(', ') || 'nothing';
    }
    return null;
  };
  const changeItems = [];
  for (const list of alike) {
    const axes = [...new Set(list.flatMap((n) => (skeleton[n]?.variants ?? []).flatMap(([vn]) => Object.keys(axesOf(vn)))))].filter((k) => !/state|status/i.test(k));
    for (const axis of axes) {
      const have = list.map((n) => [n, changesOf(n, axis)]).filter(([, c]) => c);
      if (have.length < MIN_FAMILY) continue;
      const [main] = most(have.map(([, c]) => c));
      for (const [n, c] of have) changeItems.push({ component: n, value: c === main ? '' : `${axis} changes ${c}, where across its family it changes ${main}`, fits: c === main });
    }
  }
  push('family-property-changes', 'A property of a family changes the parts most of the family changes with it', changeItems);
  return rules;
}
