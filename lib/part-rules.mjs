// part-rules.mjs - how a component's parts go together, mined from the library itself.
//
// Every other check reads one property of one layer at a time, so the engine knew a component's parts and nothing of
// how they sit together, which is the half an agent gets wrong. These read four relationships. Each is what most of
// the library already does; a library that does none of it has no rule.
//
//   partRules({ skeleton }, { familyOf }) → [{ id, says, items: [{ component, value, fits }] }]
//     skeleton: figma-skeleton.snapshot.json (each component's variants and trees)
//     familyOf: the construction grammar's (the first word of a name: button for buttonPrimary)
//
//   part-one-name   an instance of one component is named as most of the library names it (iconGeneric is Icon)
//   part-order      two parts side by side sit in the order most of their family puts them (Icon before Label)
//   family-holds    a component holds only what others of its family hold (a button holds icons, and no button an avatar)
//   icon-with-label an icon beside a label is the size most of the library puts beside that text style
//
// Pure: nothing is read or written here.

const MIN_SEEN = 3;   // seen in three components or more, as the construction grammar
const MIN_FAMILY = 3; // a family of three or more, as the family shape
const most = (values) => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? [null, 0]; };
// A component's own layers, every variant's: an instance is a part, never opened.
const layersOf = (t, out = []) => { for (const c of t?.c ?? []) { out.push(c); if (c.t !== 'INSTANCE') layersOf(c, out); } return out; };
const framesOf = (t, out = []) => { if (t?.c?.length) { out.push(t); for (const c of t.c) if (c.t !== 'INSTANCE') framesOf(c, out); } return out; };
const key = (s) => String(s ?? '').trim().toLowerCase();

export function partRules({ skeleton = {} } = {}, { familyOf }) {
  const names = Object.keys(skeleton).filter((n) => !n.startsWith('_') && skeleton[n]?.trees?.length).sort();
  const rules = [];
  const push = (id, says, items) => { if (items.length) rules.push({ id, says, items }); };

  // One name for one part: the layer name most components give an instance of the same component. One still named
  // after its component has no name of its own to compare (the layer naming rule asks for one).
  const uses = new Map();   // component held → [[holder, layer name]]
  for (const n of names) {
    const seen = new Map();
    for (const t of skeleton[n].trees) for (const l of layersOf(t)) if (l.t === 'INSTANCE' && l.of?.name && l.of.name !== n && l.n !== l.of.name) { if (!seen.has(l.of.name)) seen.set(l.of.name, new Set()); seen.get(l.of.name).add(l.n); }
    for (const [of, set] of seen) { if (!uses.has(of)) uses.set(of, []); for (const ln of set) uses.get(of).push([n, ln]); }
  }
  const named = [...uses].filter(([, l]) => new Set(l.map(([h]) => h)).size >= MIN_SEEN).map(([of, l]) => [of, l, most(l.map(([, ln]) => ln))[0]]);
  if (named.length) {
    const byHolder = new Map();
    for (const [of, l, main] of named) for (const [h, ln] of l) { if (!byHolder.has(h)) byHolder.set(h, []); byHolder.get(h).push({ of, ln, main }); }
    const [ex] = named.sort((a, b) => b[1].length - a[1].length);
    push('part-one-name', `An instance of a component is named as most of the library names it (${ex[0]} is ${ex[2]})`, [...byHolder].sort().map(([h, l]) => {
      const off = l.filter((x) => x.ln !== x.main);
      return { component: h, value: off.map((x) => `${x.ln}, where the library names ${x.of} ${x.main}`).join('; '), fits: !off.length };
    }));
  }

  // The order of two parts side by side, inside one family: in a frame holding both, which comes first in most of it.
  // Across the library a trailing icon is a design, not a slip; inside a family built alike it is the odd one out.
  const families = {};
  for (const n of names) (families[familyOf(n)] ??= []).push(n);
  const orderItems = new Map();
  let example = null;
  for (const list of Object.values(families).filter((l) => l.length >= MIN_FAMILY)) {
    const orders = new Map();   // "a|b" (a < b by name) -> Map(component -> a first?)
    for (const n of list) for (const t of skeleton[n].trees) for (const f of framesOf(t)) {
      const kids = f.c.map((c) => key(c.n)).filter(Boolean);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        if (kids[i] === kids[j]) continue;
        const [a, b] = [kids[i], kids[j]].sort(), pair = `${a}|${b}`;
        if (!orders.has(pair)) orders.set(pair, new Map());
        if (!orders.get(pair).has(n)) orders.get(pair).set(n, kids[i] === a);
      }
    }
    for (const [pair, m] of orders) {
      if (m.size < MIN_SEEN) continue;
      const [a, b] = pair.split('|'), [aFirst] = most([...m.values()]);
      if (!example || m.size > example.size) example = { size: m.size, first: aFirst ? a : b, then: aFirst ? b : a };
      for (const [n, first] of m) {
        if (!orderItems.has(n)) orderItems.set(n, []);
        if (first !== aFirst) orderItems.get(n).push(aFirst ? `${b} before ${a}, where most of its family puts ${a} first` : `${a} before ${b}, where most of its family puts ${b} first`);
      }
    }
  }
  if (example) push('part-order', `Two parts side by side sit in the order most of their family puts them (${example.first} before ${example.then})`, [...orderItems].sort().map(([n, off]) => ({ component: n, value: off.join('; '), fits: !off.length })));

  // What a family holds: a component of a family of three or more holds only families others of its own family hold.
  const holdItems = [];
  for (const [fam, list] of Object.entries(families).filter(([, l]) => l.length >= MIN_FAMILY)) {
    // A private building block (.main, _base) is the component's own inside, never a family it holds.
    const holds = new Map(list.map((n) => [n, new Set(skeleton[n].trees.flatMap((t) => layersOf(t)).filter((l) => l.t === 'INSTANCE' && l.of?.name && !/^[._]/.test(l.of.name)).map((l) => familyOf(l.of.name)).filter((f) => f && f !== fam))]));
    const holding = list.filter((n) => holds.get(n).size);
    if (holding.length < MIN_FAMILY) continue;
    for (const n of holding) {
      const alone = [...holds.get(n)].filter((f) => !holding.some((o) => o !== n && holds.get(o).has(f))).sort();
      holdItems.push({ component: n, value: alone.length ? `holds ${alone.join(', ')}, which no other ${fam} holds` : '', fits: !alone.length });
    }
  }
  push('family-holds', 'A component holds only what others of its family hold', holdItems);

  // What goes with what: an icon beside a label of one text style is the icon size most of the library puts beside it
  // (its size option, or the size its name ends in: arrow-down-m).
  const iconSize = (o) => (String(o?.variant ?? '').match(/size=([^,]+)/i)?.[1] ?? String(o?.name ?? '').match(/[-_/](xxs|xs|s|m|l|xl|xxl|\d+)$/i)?.[1] ?? null)?.trim().toLowerCase() ?? null;
  const isIcon = (c) => c.t === 'INSTANCE' && c.of?.name && (/icon/i.test(`${c.n} ${c.of.name}`) || /^[a-z0-9]+(-[a-z0-9]+)*-(xxs|xs|s|m|l|xl)$/.test(c.of.name));
  const an = (z) => (/^\d/.test(z) ? 'a' : 'an');   // an xs, an m: a size is said letter by letter
  const pairs = [];   // [component, text style, icon size]
  for (const n of names) for (const t of skeleton[n].trees) for (const f of framesOf(t)) {
    const label = f.c.find((c) => c.t === 'TEXT' && c.styles?.text);
    if (label) for (const c of f.c.filter(isIcon)) { const z = iconSize(c.of); if (z) pairs.push([n, label.styles.text, z]); }
  }
  const mainSize = new Map();
  for (const style of new Set(pairs.map(([, st]) => st))) { const l = pairs.filter(([, st]) => st === style); if (new Set(l.map(([n]) => n)).size >= MIN_SEEN) mainSize.set(style, most(l.map(([, , z]) => z))[0]); }
  if (mainSize.size) {
    const items = new Map();
    for (const [n, st, z] of pairs) { if (!mainSize.has(st)) continue; if (!items.has(n)) items.set(n, new Set()); if (z !== mainSize.get(st)) items.get(n).add(`${an(z)} ${z} icon beside ${st}, where most labels in ${st} have ${an(mainSize.get(st))} ${mainSize.get(st)} one`); }
    const [ex] = [...mainSize].sort((a, b) => pairs.filter(([, s2]) => s2 === b[0]).length - pairs.filter(([, s2]) => s2 === a[0]).length);
    push('icon-with-label', `An icon beside a label is the size most of the library puts beside that text style (${ex[1]} beside ${ex[0]})`, [...items].sort().map(([n, off]) => ({ component: n, value: [...off].join('; '), fits: !off.size })));
  }
  return rules;
}
