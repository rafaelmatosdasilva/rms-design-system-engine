// token-layers.mjs - how a system layers its tokens, read from its own aliases.
//
// The tier check (tier-check.mjs) runs only where a team declares its tiers, and few do, so the engine never said how a
// system's tokens are layered. They say it themselves: a collection whose tokens point nowhere is a base, one whose
// tokens point at another sits on it. So each collection's layer is read from where its aliases go, as the
// construction grammar reads how components are built, and nothing is imposed: what most of a collection's tokens do is
// the rule, and a system whose tokens point at nothing has no layers and no rule.
//
//   tokenLayers(figmaTokens) → { collections: [{ name, tokens, aliasing, through, layer }], targetsOf(token), depthOf(token) }
//     figmaTokens: the vars snapshot's figmaTokens ({ collections, tokens: [{ name, collection, aliases?: { mode: name } }] })
//     through: the collection most of its aliasing tokens point at, other than its own (null: none clearly)
//     layer: 1 for a base, one more than the layer it goes through (null: a ring of collections pointing at each other)
//   tokenRules(figmaTokens, { components }) → [{ id, says, items: [{ where, value, fits }] }], for the construction
//     grammar to judge: the layer rules here (a token points down its layers, never past one, up or across at another
//     component's, read from the library's component names), and the name rules of token-grammar.mjs
//
// Pure: nothing is read or written here.
import { nameRules } from './token-grammar.mjs';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SHARE = 0.8;   // the share of a collection's names that makes their first word its own (FIX_SHARE, as the grammar)

const firstWord = (n) => String(n).split(/[/.]/)[0].toLowerCase();

export function tokenLayers(figmaTokens) {
  const all = (figmaTokens?.tokens ?? []).filter((t) => t?.name && t.collection);
  const byName = new Map();
  for (const t of all) { if (!byName.has(t.name)) byName.set(t.name, []); byName.get(t.name).push(t); }
  // The tokens a token points at, in any mode. A name two collections share resolves to the first; never to itself.
  const targetsOf = (t) => [...new Set(Object.values(t.aliases ?? {}))].map((n) => (byName.get(n) ?? []).find((x) => x !== t)).filter(Boolean);
  // Where a system keeps its layers: in collections of their own (Primitives, Semantic), or inside one collection as
  // groups of names (primitives/…, semantic/…). A collection whose aliases mostly stay inside it keeps them as groups,
  // so its first words are its layers; any other is one layer.
  const inside = {}, aliasingIn = {};
  for (const t of all) { const ts = targetsOf(t); if (!ts.length) continue; aliasingIn[t.collection] = (aliasingIn[t.collection] ?? 0) + 1; if (ts.some((x) => x.collection === t.collection)) inside[t.collection] = (inside[t.collection] ?? 0) + 1; }
  // Layers are few and large (primitives, semantic, component): two to six groups of three or more names that hold
  // nearly all of it. A collection of many small groups, one per component, is one layer that names its components.
  const layered = (c) => {
    const own = all.filter((t) => t.collection === c), count = {};
    for (const t of own) count[firstWord(t.name)] = (count[firstWord(t.name)] ?? 0) + 1;
    const big = Object.values(count).filter((n) => n >= 3);
    return big.length >= 2 && big.length <= 6 && big.reduce((x, y) => x + y, 0) >= own.length * 0.9;
  };
  const grouped = new Set(Object.keys(aliasingIn).filter((c) => inside[c] >= aliasingIn[c] / 2 && layered(c)));
  const unitOf = (t) => (grouped.has(t.collection) ? `${t.collection} › ${firstWord(t.name)}` : t.collection);
  const labelOf = (u) => (u.includes(' › ') ? u.split(' › ')[1] : u);
  const tokens = all.map((t) => ({ ...t, unit: unitOf(t) }));
  const unitByName = new Map(tokens.map((t) => [t.name, t.unit]));
  const targetsWithUnit = (t) => targetsOf(t).map((x) => ({ ...x, unit: unitByName.get(x.name) ?? x.collection }));
  const info = new Map();
  for (const t of tokens) {
    if (!info.has(t.unit)) info.set(t.unit, { name: t.unit, label: labelOf(t.unit), collection: t.collection, tokens: 0, aliasing: 0, to: {} });
    const i = info.get(t.unit), ts = targetsWithUnit(t);
    i.tokens++;
    if (ts.length) i.aliasing++;
    for (const u of new Set(ts.map((x) => x.unit))) if (u !== t.unit) i.to[u] = (i.to[u] ?? 0) + 1;
  }
  for (const i of info.values()) {
    const [top, n] = Object.entries(i.to).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    i.through = top && n >= i.aliasing / 2 ? top : null;
  }
  // Two that go through each other: the one whose tokens mostly hold values is the base, and its few aliases point up.
  for (const i of info.values()) {
    const o = i.through && info.get(i.through);
    if (o?.through !== i.name) continue;
    const share = (x) => x.aliasing / x.tokens;
    if (share(i) < share(o) || (share(i) === share(o) && i.name < o.name)) i.through = null;
  }
  const layerOf = (name, seen = new Set()) => {
    const i = info.get(name);
    if (!i) return null;
    if ('layer' in i) return i.layer;
    if (!i.through) { i.layer = 1; return 1; }
    if (seen.has(name)) return null;
    seen.add(name);
    const l = layerOf(i.through, seen);
    i.layer = l == null ? null : l + 1;
    return i.layer;
  };
  for (const name of info.keys()) layerOf(name);
  // How many steps a token's alias takes to reach a value, in its longest mode; Infinity when it comes back on itself.
  const depthOf = (t) => {
    let most = 0;
    for (const start of new Set(Object.values(t.aliases ?? {}))) {
      const seen = new Set([t.name]);
      let at = start, steps = 0;
      for (;;) {
        steps++;
        if (seen.has(at)) return Infinity;
        seen.add(at);
        const next = (byName.get(at) ?? [])[0];
        const on = next ? Object.values(next.aliases ?? {})[0] : null;
        if (!on) break;
        at = on;
      }
      most = Math.max(most, steps);
    }
    return most;
  };
  return { collections: [...info.values()], targetsOf: targetsWithUnit, depthOf, tokens };
}

export function tokenRules(figmaTokens, { components = [] } = {}) {
  return [...layerRules(figmaTokens, components), ...nameRules(figmaTokens)];
}

function layerRules(figmaTokens, components = []) {
  const { collections, targetsOf, depthOf, tokens } = tokenLayers(figmaTokens);
  const col = new Map(collections.map((c) => [c.name, c]));
  const label = (u) => col.get(u)?.label ?? u;
  const rules = [];
  // A system with one layer, or none, has no layer to skip.
  if (!collections.some((c) => (c.layer ?? 0) >= 2)) return rules;

  // A component token names its component first (button/bg). One that points at a token named for another component
  // points across, at that component's, and a change to one moves the other. Read only from the library's own component
  // names: a semantic token pointing at another semantic group (text/… at surface/…) is no component's.
  const squash = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = new Set((components ?? []).map(squash).filter(Boolean));
  const componentOf = (n) => (named.has(squash(firstWord(n))) ? squash(firstWord(n)) : null);
  const layerOfUnit = (u) => col.get(u)?.layer ?? null;
  // Each collection that goes through another: its tokens point at that one (or at their own), never past it, up, or
  // across at another component's.
  for (const c of collections.filter((x) => x.through && x.layer >= 2).sort((a, b) => b.layer - a.layer || a.name.localeCompare(b.name))) {
    const items = tokens.filter((t) => t.unit === c.name).map((t) => {
      const ts = targetsOf(t);
      if (!ts.length) return null;
      const off = ts.filter((x) => (componentOf(t.name) && componentOf(x.name) && componentOf(x.name) !== componentOf(t.name)) || (x.unit !== c.name && x.unit !== c.through));
      const how = (x) => {
        if (componentOf(t.name) && componentOf(x.name) && componentOf(x.name) !== componentOf(t.name)) return 'another component\'s';
        const l = layerOfUnit(x.unit);
        return l != null && l < (layerOfUnit(c.through) ?? 0) ? 'past it' : l != null && l > c.layer ? 'up' : 'elsewhere';
      };
      return { where: t.name, value: off.map((x) => `${x.name} (${label(x.unit)}, ${how(x)})`).join(', '), fits: !off.length };
    }).filter(Boolean);
    rules.push({ id: `token-layer-${slug(c.name)}`, says: `A ${c.label} token points at a ${label(c.through)} token`, items });
  }

  // A base holds values: what sits on it points down at it, and a base token that points up at one of them makes the
  // layer below move with the one above (a primitive named after a semantic token).
  for (const c of collections.filter((x) => x.layer === 1 && collections.some((y) => y.through === x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const items = tokens.filter((t) => t.unit === c.name).map((t) => {   // a token that holds its value fits too
      const up = targetsOf(t).filter((x) => x.unit !== c.name && (layerOfUnit(x.unit) ?? 0) > 1);
      return { where: t.name, value: up.map((x) => `${x.name} (${label(x.unit)}, up)`).join(', '), fits: !up.length };
    });
    if (items.length) rules.push({ id: `token-base-${slug(c.name)}`, says: `A ${c.label} token points at no token of a layer above it`, items });
  }

  // Alias chains: no longer than most of the system's, and never back on themselves.
  const aliasing = tokens.filter((t) => targetsOf(t).length).map((t) => ({ t, d: depthOf(t) }));
  const finite = aliasing.map((x) => x.d).filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length) {
    const norm = finite[Math.min(finite.length - 1, Math.ceil(finite.length * SHARE) - 1)];
    rules.push({ id: 'token-alias-chains', says: `An alias reaches its value in ${norm} ${norm === 1 ? 'step' : 'steps'} or fewer, and never comes back on itself`,
      items: aliasing.map(({ t, d }) => ({ where: t.name, value: d === Infinity ? 'comes back on itself' : `${d} steps`, fits: Number.isFinite(d) && d <= norm })) });
  }

  // A token's name begins as its collection's names do: the first word most of a collection's tokens share.
  const first = firstWord;
  const prefix = new Map();
  for (const c of collections.filter((x) => x.name === x.collection)) {
    const own = tokens.filter((t) => t.collection === c.name), count = {};
    for (const t of own) count[first(t.name)] = (count[first(t.name)] ?? 0) + 1;
    const [w, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (w && own.length >= 3 && n / own.length >= SHARE) prefix.set(c.name, w);
  }
  const words = new Set(prefix.values());
  if (prefix.size >= 2 && words.size === prefix.size) {
    const owner = new Map([...prefix].map(([c, w]) => [w, c]));
    rules.push({ id: 'token-name-collection', says: 'A token\'s name begins as its collection\'s names do',
      items: tokens.filter((t) => prefix.has(t.collection)).map((t) => {
        const w = first(t.name), other = w !== prefix.get(t.collection) && owner.get(w);
        return { where: t.name, value: other ? `in ${t.collection}, named like ${other} (${w}/…)` : '', fits: !other };
      }) });
  }
  return rules;
}
