// build-rules.mjs - what a component is built with, layer by layer, and what the file's text styles say of themselves.
//
// The capture keeps, beside each variant's tree, what each layer binds (binds) and how it looks (looks: its opacity
// under 1 and its border). Nothing asked them anything about corners, opacity or borders, and nothing asked a text
// style's own description anything. Each rule is what most of the library already does; one that none of it does is
// no rule.
//
//   buildRules({ skeleton, vars }) → [{ id, area, says, items: [{ component | where, value, fits }] }]
//     skeleton: figma-skeleton.snapshot.json (trees, binds, looks); vars: figma-vars.snapshot.json (typography, textStyleMeta)
//
//   corners-one-variable  a layer whose corners are bound binds one variable for all four
//   opacity-bound         an opacity under 1 is a variable, never a number typed in
//   border-bound          a border's weight is a variable
//   border-align          a border sits where most borders sit (inside, centre or outside)
//   text-style-described  a text style says what it is for, in its description
//   text-style-used       a text style is used by a component
//
// Pure: nothing is read or written here.

const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const WEIGHTS = ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
const MIN = 3;
const most = (values) => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? [null, 0]; };

// A layer's name from its place in a variant's tree ('' the variant itself, '0.1' its first child's second child).
function nameAt(tree, path) {
  let n = tree;
  for (const i of path ? path.split('.') : []) n = n?.c?.[Number(i)];
  return n?.n ?? (path ? path : 'the component');
}

export function buildRules({ skeleton = {}, vars = {} } = {}) {
  const rules = [];
  const push = (id, area, says, items) => { if (items.length) rules.push({ id, area, says, items }); };
  const names = Object.keys(skeleton).filter((n) => !n.startsWith('_') && skeleton[n]?.trees?.length).sort();
  // Every layer of every variant, with what it binds and how it looks: [component, layer name, binds, looks].
  const places = (n) => {
    const s = skeleton[n], out = [], treeOf = new Map((s.variants ?? []).map(([vn, i]) => [vn, s.trees[i]]));
    for (const vn of new Set([...Object.keys(s.binds ?? {}), ...Object.keys(s.looks ?? {})])) {
      const b = s.binds?.[vn] ?? {}, l = s.looks?.[vn] ?? {};
      for (const p of new Set([...Object.keys(b), ...Object.keys(l)])) out.push({ layer: nameAt(treeOf.get(vn) ?? s.trees[0], p), binds: b[p] ?? {}, looks: l[p] ?? {} });
    }
    return out;
  };
  const per = (test) => names.map((n) => {
    const hits = places(n).map((x) => test(x)).filter((x) => x !== null);
    if (!hits.length) return null;
    const off = [...new Set(hits.filter((x) => x !== true))];
    return { component: n, value: off.join('; '), fits: !off.length };
  }).filter(Boolean);

  push('corners-one-variable', 'variables', 'A layer whose corners are bound binds one variable for all four', per(({ layer, binds }) => {
    const c = CORNERS.filter((k) => binds[k]);
    if (!c.length) return null;
    const vs = new Set(c.map((k) => String(binds[k])));
    return c.length === 4 && vs.size === 1 ? true : `${layer}: ${c.length < 4 ? `${c.length} of its four corners bound` : `its corners bind ${[...vs].join(', ')}`}`;
  }));
  push('opacity-bound', 'variables', 'An opacity under 1 is a variable, never a number typed in', per(({ layer, binds, looks }) =>
    looks.opacity == null || looks.opacity === 0 ? null : binds.opacity ? true : `${layer} at ${Math.round(looks.opacity * 100)}%`));
  push('border-bound', 'variables', 'A border\'s weight is a variable', per(({ layer, binds, looks }) =>
    !looks.border ? null : WEIGHTS.some((k) => binds[k]) ? true : `${layer}, ${[].concat(looks.border.w).join(' ')}px`));
  const aligns = names.flatMap((n) => places(n).map((x) => x.looks.border?.align).filter(Boolean));
  const [align, seen] = most(aligns);
  if (aligns.length >= MIN && seen < aligns.length) push('border-align', 'layout', `A border sits ${String(align).toLowerCase()} its layer, as most do`, per(({ layer, looks }) =>
    !looks.border?.align ? null : looks.border.align === align ? true : `${layer}'s sits ${looks.border.align.toLowerCase()}`));

  // The file's text styles, by name: whether each says what it is for, and whether a component uses it.
  // The typography snapshot keys a style by its name in lower case; the descriptions and the layers keep Figma's own.
  const low = (x) => String(x).toLowerCase();
  const styles = Object.keys(vars.typography ?? {}), meta = Object.fromEntries(Object.entries(vars.textStyleMeta ?? {}).map(([k, v]) => [low(k), v]));
  const said = (s) => !!meta[low(s)]?.description;
  if (styles.length >= MIN && styles.filter(said).length >= MIN)
    push('text-style-described', 'documentation', 'A text style says what it is for, in its description', styles.map((s) => ({ where: s, value: said(s) ? '' : 'no description', fits: said(s) })));
  const used = new Set(), walk = (t) => { for (const c of t?.c ?? []) { if (c.styles?.text) used.add(low(c.styles.text)); if (c.t !== 'INSTANCE') walk(c); } };
  for (const n of names) for (const t of skeleton[n].trees) walk(t);
  if (styles.length >= MIN && used.size)
    push('text-style-used', 'documentation', 'A text style is used by a component', styles.map((s) => ({ where: s, value: used.has(low(s)) ? '' : 'no component uses it', fits: used.has(low(s)) })));
  return rules;
}
