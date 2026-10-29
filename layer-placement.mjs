// layer-placement.mjs - a token belongs in the first layer where its value can change.
//
// A collection with modes (Light and Dark, a brand, a density) is the layer where values change with them. A token in
// it whose definition is the same in every mode (the same alias, or the same value) never uses those modes: it can live
// in a layer without them, aliasing the one that changes, and still follow every mode through it. Kept in the moded
// layer, each new mode makes it one more value to set by hand, and a mode added later starts with hundreds of copies.
// So each moded collection says how many of its tokens use none of its modes, by family, with examples: advice, never a
// failure, and a team may keep them there on purpose (Figma's own collections are the team's design). Pure.
//
//   layerPlacement(snap) → [{ collection, modes, total, still: [{ family, count, examples }] , count }]

// colorByMode: { mode: { token: value } }; aliasesByMode: { mode: { token: [target] } }.
export function layerPlacement(snap = {}) {
  const color = snap.color ?? {}, aliases = snap.aliases ?? {};
  const modes = Object.keys(color);
  if (modes.length < 2) return [];
  const defOf = (m, t) => { const a = aliases[m]?.[t]; return a?.length ? `→${a.join(',')}` : `=${String(color[m]?.[t] ?? '').toLowerCase()}`; };
  const tokens = [...new Set(modes.flatMap((m) => Object.keys(color[m] ?? {})))];
  const still = tokens.filter((t) => modes.every((m) => color[m]?.[t] != null) && new Set(modes.map((m) => defOf(m, t))).size === 1);
  if (!still.length) return [];
  const families = new Map();
  for (const t of still) {
    const p = t.split('/'), family = p.length > 2 ? p.slice(0, 2).join('/') : p[0];
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(t);
  }
  const name = snap._collections?.color ?? 'the colour collection';
  return [{ collection: name, modes: snap._collections?.colorModes ?? modes, total: tokens.length, count: still.length,
    still: [...families].map(([family, list]) => ({ family, count: list.length, examples: list.slice(0, 2) })).sort((a, b) => b.count - a.count) }];
}

// The lines for the person.
export function layerPlacementLines(rows = [], { max = 6 } = {}) {
  const lines = [];
  for (const r of rows) {
    lines.push(`${r.collection} changes with its modes (${r.modes.join(', ')}), and ${r.count} of its ${r.total} colour tokens never do: each is defined the same way in every mode (the same alias or value). They belong in a layer without those modes that aliases this one, and still follow every mode through it; a mode added later then needs none of them set again.`);
    for (const f of r.still.slice(0, max)) lines.push(`  ${f.family}: ${f.count} (${f.examples.join(', ')}${f.count > f.examples.length ? ', …' : ''})`);
    if (r.still.length > max) lines.push(`  … and ${r.still.length - max} more families`);
  }
  return lines;
}
