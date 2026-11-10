// shape-rules.mjs - more readings of how a library builds a component: how a shadow and a hover change between
// variants, whether one kind of content is a slot or an instance swap, and the gap the system puts between two parts.
//
//   shapeRules({ skeleton }) → [{ id, area, says, items: [{ component, value, fits }] }]
//     skeleton: figma-skeleton.snapshot.json (each component's variants, trees, swaps and binds)
//
//   shadow-one-way  a shadow changes between variants the way most components change theirs: the layer's own effect
//                   (its count or its style) or a shadow layer shown and hidden
//   slot-or-swap    a property for one kind of content (Icon, Content) is a slot, or an instance swap, as most
//                   properties of that name are
//   state-one-way   a hover or press shows the way most components show theirs: the frame's fill, a layer shown over
//                   it (a state layer) or its opacity
//   size-scale-height  at each size, the frame's minimum height most components set there (s is 40, m is 48)
//   size-scale-icon    at each size, the icon size most components hold there
//   part-gap        two parts side by side are spaced by the variable most frames holding them bind, at the same size
//
// Each is what most of the library already does; one that none of it does is no rule. Pure: nothing is read or written.

const MIN = 3;
const clean = (k) => String(k).replace(/#[^#]*$/, '');
const keyOf = (k) => clean(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const most = (values) => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? [null, 0]; };
// Each layer of a tree by its place ('' the variant, '0.1' its first child's second child); an instance is never opened.
const flat = (t, p = '', out = {}) => { out[p] = t; if (t?.t !== 'INSTANCE') (t?.c ?? []).forEach((c, i) => flat(c, p ? `${p}.${i}` : String(i), out)); return out; };
const sizeOf = (vn) => (String(vn).match(/(?:^|,\s*)size\s*=\s*([^,]+)/i) ?? [])[1]?.trim().toLowerCase() ?? '';

export function shapeRules({ skeleton = {} } = {}) {
  const rules = [];
  const push = (id, area, says, items) => { if (items.length) rules.push({ id, area, says, items }); };
  const names = Object.keys(skeleton).filter((n) => !/^[_.]/.test(n) && skeleton[n]?.trees?.length).sort();

  // How a shadow changes between variants: at one place in every variant's tree, a layer whose effect differs (its
  // count or its effect style) changes the effect; one with a shadow that is hidden in some is a layer shown and hidden.
  const ways = names.map((n) => {
    const trees = skeleton[n].trees.map((t) => flat(t));
    if (trees.length < 2) return null;
    const w = new Set();
    for (const p of Object.keys(trees[0]).filter((x) => trees.every((f) => f[x]))) {
      const at = trees.map((f) => f[p]);
      if (!at.some((l) => l.effects)) continue;
      if (new Set(at.map((l) => `${l.effects ?? 0}|${l.styles?.effect ?? ''}`)).size > 1) w.add('its own effect');
      if (new Set(at.map((l) => !!l.hidden)).size > 1) w.add('a shadow layer shown and hidden');
    }
    return w.size === 1 ? [n, [...w][0]] : null;
  }).filter(Boolean);
  if (ways.length >= MIN) {
    const [main] = most(ways.map(([, w]) => w));
    push('shadow-one-way', 'styles', `A shadow changes between variants by ${main}, as most do`, ways.map(([n, w]) => ({ component: n, value: w === main ? '' : `it changes ${w}`, fits: w === main })));
  }

  // How a component shows its hover or press: between the variant at rest and the one in that state (every other
  // option the same), its frame's fill binds another variable, a layer hidden at rest is shown (a state layer), or its
  // opacity changes.
  const axesOf = (vn) => Object.fromEntries(String(vn).split(/,\s*/).map((p) => p.split('=').map((x) => x.trim().toLowerCase())).filter((p) => p.length === 2));
  const REST = /^(default|rest|enabled|idle|normal)$/, TOUCH = /^(hover|hovered|press|pressed|active)$/;
  const stateWays = names.map((n) => {
    const s = skeleton[n], vs = (s.variants ?? []).map(([vn, i]) => [vn, axesOf(vn), i]);
    const axis = Object.keys(vs[0]?.[1] ?? {}).find((k) => /state/.test(k));
    if (!axis) return null;
    const w = new Set();
    for (const [rvn, ra, ri] of vs.filter(([, a]) => REST.test(a[axis] ?? ''))) for (const [tvn, ta, ti] of vs.filter(([, a]) => TOUCH.test(a[axis] ?? ''))) {
      if (!Object.keys(ra).every((k) => k === axis || ra[k] === ta[k])) continue;
      const rf = s.binds?.[rvn]?.['']?.fills, tf = s.binds?.[tvn]?.['']?.fills;
      if (rf && tf && JSON.stringify(rf) !== JSON.stringify(tf)) w.add('its frame\'s fill');
      const r = flat(s.trees[ri] ?? {}), t = flat(s.trees[ti] ?? {});
      if (Object.keys(r).some((p) => r[p]?.hidden && t[p] && !t[p].hidden)) w.add('a layer shown over it');
      const ro = s.looks?.[rvn]?.['']?.opacity ?? 1, to = s.looks?.[tvn]?.['']?.opacity ?? 1;
      if (ro !== to) w.add('its opacity');
    }
    return w.size === 1 ? [n, [...w][0]] : null;
  }).filter(Boolean);
  if (stateWays.length >= MIN) {
    const [main] = most(stateWays.map(([, w]) => w));
    push('state-one-way', 'styles', `A hover or press shows by ${main}, as most components show it`, stateWays.map(([n, w]) => ({ component: n, value: w === main ? '' : `it shows by ${w}`, fits: w === main })));
  }

  // The library's size scale: at each size option, at rest, the frame's minimum height most components set there, and
  // the size of the icon most of them hold (its size option, or the size its name ends in: arrow-down-m). With it a new
  // size is built from the scale rather than copied from a neighbour.
  const restBySize = (n) => { const out = new Map(); for (const [vn, i] of skeleton[n].variants ?? []) { const a = axesOf(vn); if (!a.size || out.has(a.size) || Object.values(a).some((x) => /hover|press|focus|disabled|active/.test(x))) continue; out.set(a.size, skeleton[n].trees[i]); } return out; };
  const iconOf = (t) => { const ic = Object.values(flat(t ?? {})).find((l) => l?.t === 'INSTANCE' && l.of?.name && /icon/i.test(`${l.n} ${l.of.name}`)); return ic ? (String(ic.of.variant ?? '').match(/size=([^,]+)/i)?.[1] ?? String(ic.of.name).match(/[-_/](xxs|xs|s|m|l|xl|xxl|\d+)$/i)?.[1] ?? null)?.trim().toLowerCase() ?? null : null; };
  for (const [id, says, read, unit] of [
    ['size-scale-height', 'At each size, a component is as tall at least as most components are at that size', (t) => t?.limits?.minHeight ?? null, (v) => `a minimum height of ${v}`],
    ['size-scale-icon', 'At each size, a component holds the icon size most components hold at that size', iconOf, (v) => `${/^\d/.test(v) ? 'a' : 'an'} ${v} icon`],
  ]) {
    const at = new Map();   // size -> [[component, value]]
    for (const n of names) for (const [size, t] of restBySize(n)) { const v = read(t); if (v == null) continue; if (!at.has(size)) at.set(size, []); at.get(size).push([n, v]); }
    const items = new Map();
    for (const [size, have] of at) {
      if (have.length < MIN) continue;
      const [main] = most(have.map(([, v]) => v));
      for (const [n, v] of have) { if (!items.has(n)) items.set(n, []); if (v !== main) items.get(n).push(`at ${size} ${unit(v)}, where most have ${unit(main)}`); }
    }
    push(id, 'layout', says, [...items].sort().map(([n, off]) => ({ component: n, value: off.join('; '), fits: !off.length })));
  }

  // One kind of content, one kind of property: the type most properties of that name are.
  const byName = new Map();
  for (const n of names) for (const [k, s] of Object.entries(skeleton[n].swaps ?? {})) if (s?.type) { const key = keyOf(k); if (!byName.has(key)) byName.set(key, []); byName.get(key).push([n, clean(k), s.type]); }
  const kinds = [...byName].filter(([, l]) => l.length >= MIN).map(([key, l]) => [key, l, most(l.map(([, , t]) => t))[0]]);
  if (kinds.length) {
    const items = new Map();
    for (const [, l, main] of kinds) for (const [n, k, t] of l) { if (!items.has(n)) items.set(n, []); if (t !== main) items.get(n).push(`${k} is ${t === 'SLOT' ? 'a slot' : 'an instance swap'}, where most ${k} properties are ${main === 'SLOT' ? 'slots' : 'instance swaps'}`); }
    push('slot-or-swap', 'wiring', 'A property for one kind of content is a slot or an instance swap, as most of that name are', [...items].sort().map(([n, off]) => ({ component: n, value: off.join('; '), fits: !off.length })));
  }

  // The gap between two parts: every frame holding exactly the two, by their names and the variant's size, and the
  // variable its gap binds there.
  const gaps = new Map();   // "a|b|size" -> [[component, variable]]
  for (const n of names) {
    const s = skeleton[n];
    for (const [vn, i] of s.variants ?? []) {
      const b = s.binds?.[vn]; if (!b) continue;
      for (const [p, l] of Object.entries(flat(s.trees[i] ?? {}))) {
        const kids = (l?.c ?? []).map((c) => String(c.n ?? '').toLowerCase()).filter(Boolean);
        const v = b[p]?.itemSpacing;
        if (kids.length !== 2 || !v || Array.isArray(v)) continue;
        const key = `${kids.slice().sort().join(' and ')}|${sizeOf(vn)}`;
        if (!gaps.has(key)) gaps.set(key, []);
        if (!gaps.get(key).some(([c]) => c === n)) gaps.get(key).push([n, v]);
      }
    }
  }
  const spaced = [...gaps].filter(([, l]) => l.length >= MIN).map(([key, l]) => [key, l, most(l.map(([, v]) => v))[0]]);
  if (spaced.length) {
    const items = new Map();
    for (const [key, l, main] of spaced) { const [pair, size] = key.split('|'); for (const [n, v] of l) { if (!items.has(n)) items.set(n, []); if (v !== main) items.get(n).push(`${pair}${size ? ` at ${size}` : ''} are spaced by ${v}, where most are by ${main}`); } }
    push('part-gap', 'variables', 'Two parts side by side are spaced by the variable most frames holding them bind', [...items].sort().map(([n, off]) => ({ component: n, value: off.join('; '), fits: !off.length })));
  }
  return rules;
}
