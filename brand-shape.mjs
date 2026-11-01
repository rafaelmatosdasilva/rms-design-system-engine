// brand-shape.mjs - a brand changes values, never structure.
//
// A brand is the same system in other values: its colours, fonts, corners and sizes. The elements a component draws,
// how they are laid out and which of them show stay the same in every brand. A rule written for one brand that hides
// a part, adds one, or lays it out another way makes that brand a different component, and a fix made for one brand
// then breaks another. The capture reads each component's shape in every mode (SHAPE_JS: each element it draws, by tag
// and class, with how it is laid out and whether it shows); this compares the shape of each brand with the first's and
// says what is laid out differently. Values are never compared here: the other gates check those. Advice, never a
// failure, as whoever keeps the brand decides.

// Run in the page, inside the capture's measurement, with `el` the component's element: up to 120 elements of it, each
// "tag.classes display position flex-direction shown", ::before and ::after as elements of their own when they draw.
export const SHAPE_JS = `(() => {
  const out = [];
  const pseudo = (n, p) => { const s = getComputedStyle(n, p); return s.content && s.content !== 'none' && s.content !== 'normal' ? [p + ' ' + s.display + ' ' + s.position] : []; };
  const walk = (n, depth) => {
    if (out.length >= 120) return;
    const s = getComputedStyle(n), r = n.getBoundingClientRect();
    const cls = [...n.classList].filter((c) => !/^(is|has)-|--|^data-v-/.test(c)).sort().join('.');
    const shown = s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0);
    out.push('  '.repeat(depth) + n.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' ' + s.display + ' ' + s.position + (s.display.includes('flex') ? ' ' + s.flexDirection : '') + (shown ? '' : ' hidden'));
    for (const p of [...pseudo(n, '::before'), ...pseudo(n, '::after')]) out.push('  '.repeat(depth + 1) + p);
    if (s.display !== 'none') for (const c of n.children) walk(c, depth + 1);
  };
  walk(el, 0);
  return out;
})()`;

// The shapes of one component, by mode, kept only when two modes differ (most never do, and the snapshot stays small).
// perMode: { modeKey: { shape: [...] } } → { modeKey: [...] } | null
export function shapesOf(perMode = {}) {
  const shapes = Object.fromEntries(Object.entries(perMode ?? {}).filter(([, v]) => Array.isArray(v?.shape)).map(([k, v]) => [k, v.shape]));
  const seen = new Set(Object.values(shapes).map((s) => s.join('\n')));
  return seen.size > 1 ? shapes : null;
}

const parse = (line) => {
  const depth = (/^ */.exec(line)[0].length) / 2;
  const [what, ...rest] = line.trim().split(' ');
  return { depth, what, layout: rest.filter((x) => x !== 'hidden').join(' '), shown: !rest.includes('hidden') };
};

// What one brand lays out differently from the base brand: elements added or gone, an element shown in one and hidden
// in the other, an element laid out another way. → ['span.icon: shown in base, hidden here', …]
export function shapeChanges(base = [], other = []) {
  const a = base.map(parse), b = other.map(parse);
  const out = [];
  const key = (x) => `${x.depth}|${x.what}`;
  const counts = (xs) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());
  const ca = counts(a), cb = counts(b);
  for (const [k, n] of cb) if (n > (ca.get(k) ?? 0)) out.push(`${k.split('|')[1]}: drawn only here`);
  for (const [k, n] of ca) if (n > (cb.get(k) ?? 0)) out.push(`${k.split('|')[1]}: not drawn here`);
  // Elements both draw, in order: how each is laid out and whether it shows.
  const used = new Set();
  for (const x of a) {
    const j = b.findIndex((y, i) => !used.has(i) && key(y) === key(x));
    if (j < 0) continue;
    used.add(j);
    const y = b[j];
    if (x.shown !== y.shown) out.push(`${x.what}: ${x.shown ? 'shown in the base brand, hidden here' : 'hidden in the base brand, shown here'}`);
    else if (x.layout !== y.layout) out.push(`${x.what}: laid out ${x.layout} in the base brand, ${y.layout} here`);
  }
  return [...new Set(out)];
}

// For each component whose shape differs between brands: each brand that differs from the first, with what changed.
// components: { name: { shapes?: { modeKey: [...] } } }, brands: mode keys of the brands, the first the base.
// → [{ component, brand, base, changes }]
export function brandShapeDiffs(components = {}, brands = []) {
  const out = [];
  if (!brands || brands.length < 2) return out;
  for (const [component, c] of Object.entries(components ?? {})) {
    const shapes = c?.shapes;
    if (!shapes) continue;
    const base = brands.find((b) => Array.isArray(shapes[b]));
    if (!base) continue;
    for (const brand of brands) {
      if (brand === base || !Array.isArray(shapes[brand])) continue;
      const changes = shapeChanges(shapes[base], shapes[brand]);
      if (changes.length) out.push({ component, brand, base, changes });
    }
  }
  return out;
}

// The advice lines the audit prints.
export function brandShapeLines(rows = [], { max = 12 } = {}) {
  if (!rows.length) return [];
  const lines = [`${rows.length} component(s) change structure between brands, not only values: a rule for one brand lays them out another way.`];
  for (const r of rows.slice(0, max)) lines.push(`  ${r.component} in ${r.brand} (against ${r.base}): ${r.changes.slice(0, 3).join('; ')}${r.changes.length > 3 ? `; and ${r.changes.length - 3} more` : ''}`);
  if (rows.length > max) lines.push(`  … ${rows.length - max} more`);
  lines.push('  Advice: whoever keeps the brand decides; a brand that only changes tokens keeps every brand the same component.');
  return lines;
}
