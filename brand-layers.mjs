// brand-layers.mjs - how each brand is layered over the brand it extends (figma-brands.mjs reads them).
//
//   brandLayering(snap) → [{ brand, parent, own, same: [{ variable, mode }] }]
//
// A brand may set any of the system's variables, a component's own and ones nothing reads yet included: that is what a
// brand is for, and none of it is listed. What is listed is a value a brand sets that it already inherits from the
// brand it extends: it changes nothing today, and pins the value, so the brand no longer follows its parent when the
// parent changes it. That is right when the brand must keep it, and a leftover otherwise: whoever keeps the brand
// decides (advice, never a failure). A brand extending the system's own collections inherits the system's values,
// which this does not read: only a brand that extends another brand is compared.
import { brandList } from './figma-brands.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function brandLayering(snap) {
  const brands = brandList(snap);
  const byKey = new Map(brands.map((b) => [b.key, b]));
  const out = [];
  for (const b of brands) {
    const own = b.ownOverrides ?? {};
    const parent = b.parent ? byKey.get(b.parent) : null;
    const pinned = [];
    if (parent) for (const [v, byMode] of Object.entries(own)) for (const [mode, val] of Object.entries(byMode ?? {})) {
      const up = parent.overrides?.[v]?.[mode];
      if (up !== undefined && same(up, val)) pinned.push({ variable: v, mode });
    }
    pinned.sort((x, y) => x.variable.localeCompare(y.variable) || x.mode.localeCompare(y.mode));
    out.push({ brand: b.name, parent: parent?.name ?? null, own: Object.keys(own).length, same: pinned });
  }
  return out;
}

// The advice lines, for the audit's System health. → [line] (each sub-line starts with "   · ")
export function brandLayerLines(rows, { max = 5 } = {}) {
  const same = rows.filter((r) => r.same.length);
  if (!same.length) return [];
  return [
    `${same.length === 1 ? '1 brand sets values it inherits' : `${same.length} brands set values they inherit`} as they are from the brand ${same.length === 1 ? 'it extends' : 'each extends'}, which pins them: they no longer follow when that brand changes them (keep each the brand must hold, remove the rest):`,
    ...same.map((r) => `   · ${r.brand} (over ${r.parent}): ${r.same.length} (${r.same.slice(0, max).map((s) => `${s.variable} ${s.mode}`).join(', ')}${r.same.length > max ? ', …' : ''})`),
  ];
}
