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
//   text-style-as-described  a component a text style's description names is set in that style somewhere
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
    return { component: n, value: off.join(' · '), fits: !off.length };
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

  // A text style used as its description says. A description names the components it is for by their own words
  // ("For example: Chip Labels, Toolbar Titles, Field and Picker Hints"); each one named is held to the style: some
  // component of that name sets a text in it. Only what the description names is read, never what a layer is called
  // (Label, Text say nothing of a text's role), and a description that names no component of the file says nothing.
  const styleUses = new Map();   // component → its own texts' styles
  for (const n of names) { const own = new Map(); const w = (t) => { for (const c of t?.c ?? []) { if (c.t === 'TEXT' && c.styles?.text && !c.hidden) own.set(low(c.styles.text), (own.get(low(c.styles.text)) ?? 0) + 1); if (c.t !== 'INSTANCE') w(c); } }; for (const t of skeleton[n].trees) w(t); styleUses.set(n, own); }
  const items = [];
  for (const s of styles) {
    const d = meta[low(s)]?.description;
    if (!d) continue;
    for (const { phrase, components } of namedIn(d, names)) {
      const sets = components.filter((c) => styleUses.get(c)?.has(low(s)));
      const theirs = new Map(); for (const c of components) for (const [st, k] of styleUses.get(c) ?? []) theirs.set(st, (theirs.get(st) ?? 0) + k);
      const [usual] = most([...theirs].flatMap(([st, k]) => Array(k).fill(st)));
      items.push({ where: s, value: sets.length ? '' : `its description names ${phrase}, and no ${phrase} component sets a text in it${usual ? ` (they use ${usual})` : ''}`, fits: sets.length > 0 });
    }
  }
  if (items.length >= MIN) push('text-style-as-described', 'documentation', 'A component a text style\'s description names sets a text in that style', items);
  return rules;
}

// The components a description names: in the part that gives examples (after "for example", "e.g.", "such as"), else
// the whole of it, each phrase's words before its last (Chip Labels: the labels of chips; Field and Picker Hints:
// both), held against the start of each component's name, longest first (status pill, then status). One name a phrase,
// the first (Panel Footer Note is a panel's, never a footer's), and only a whole name: the words every component it
// starts share (side never names sideSheet, whose name is side sheet), or one component's name in full (Status Pill).
// A word no component begins with is passed over. → [{ phrase, components }]
const squash = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
const wordsOfName = (n) => String(n).split('/')[0].replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export function namedIn(description, names = []) {
  const text = String(description ?? '');
  const at = text.search(/\b(for example|for instance|e\.g\.|such as|examples?)\b\s*:?/i);
  const part = at >= 0 ? text.slice(at).replace(/^\s*(for example|for instance|e\.g\.|such as|examples?)\s*:?/i, '') : text;
  // Every word-start of every name, squashed: buttonPrimary gives button, buttonprimary.
  const starts = new Map(), full = new Set();
  for (const n of names) { const w = wordsOfName(n); full.add(w.join('')); for (let i = 1; i <= w.length; i++) { const k = w.slice(0, i).join(''); (starts.get(k) ?? starts.set(k, new Set()).get(k)).add(n); } }
  // A start that is a whole name: one component's in full, or the words all the components it starts share.
  // Written as text, so toolTip and tooltip are one name.
  const whole = (k) => {
    if (full.has(k)) return true;
    const set = [...starts.get(k)], sq = set.map((n) => wordsOfName(n).join(''));
    return !set.some((n) => { const w = wordsOfName(n); for (let i = 1; i <= w.length; i++) { const p = w.slice(0, i).join(''); if (p.length > k.length && sq.every((x) => x.startsWith(p))) return true; } return false; });
  };
  const out = [], seen = new Set();
  for (const clause of part.split(/[,.;:\n()]+/)) {
    const pieces = clause.split(/\s+(?:and|or|&)\s+|\//i).map((x) => x.trim().split(/\s+/).filter((w) => /[a-z]/i.test(w))).filter((w) => w.length);
    pieces.forEach((w, i) => {
      // The last piece's last word is the head (Labels), unless with it the words are one component's name in full.
      const head = i === pieces.length - 1 && w.length > 1;
      let hit = null;
      const end = head ? w.length - 1 : w.length;
      for (let a = 0; a < end && !hit; a++) for (let b = w.length; b > a && !hit; b--) {
        const k = squash(w.slice(a, b).join(''));
        for (const key of [k, k.replace(/s$/, '')]) if (!hit && key.length > 2 && starts.has(key) && (b <= end ? whole(key) : full.has(key))) hit = { key, phrase: w.slice(a, b).join(' ') };
      }
      if (hit && !seen.has(hit.key)) { seen.add(hit.key); out.push({ phrase: hit.phrase.toLowerCase(), components: [...starts.get(hit.key)].sort() }); }
    });
  }
  return out;
}
