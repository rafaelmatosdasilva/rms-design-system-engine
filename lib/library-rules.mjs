// library-rules.mjs - three readings of a Figma library the construction rules did not make: whether an agent can tell
// from a property's name which layer it drives, whether two components do the same job, and, where a team declared its
// token tiers, which token points across them.
//
//   libraryRules({ skeleton, props, tokens, tiers }, { familyOf, shapeOf }) → [{ id, area, says, items }]
//     skeleton, props: the Figma capture's (figma-skeleton, figma-component-props snapshots)
//     tokens: the vars snapshot's figmaTokens; tiers: ds-config.json "tiers" (tier-check.mjs), when the team declared them
//     familyOf, shapeOf: the construction grammar's
//
//   property-names-say-layer  a boolean, text or swap property's name says which layer it drives (showIcon, the Icon layer):
//                             the properties panel is all an agent sees of a component
//   no-twins                  no two components are built the same and take the same properties: a pair worth a
//                             person's eye, never one the engine merges
//   declared-tiers            a token points only where its declared tier may (tier-check.mjs, the team's own model)
//   nested-exposed            a nested component with properties of its own shows them in the parent's panel
//
// Pure: nothing is read or written here.
import { checkTiers } from './tier-check.mjs';

const clean = (k) => String(k).replace(/#[^#]*$/, '');
const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
// Words a property's name carries for what it does rather than what it drives: show, has, is. Content, text, label and
// icon stay: they are as often the layer's own name (showBody drives Body).
const VERB = new Set(['show', 'has', 'is', 'with', 'visible', 'display', 'enable', 'enabled', 'swap', 'instance']);
const KIND = { COLOR: 'color', FLOAT: 'sizing', STRING: 'string', BOOLEAN: 'boolean' };

export function libraryRules({ skeleton = {}, props = {}, tokens = null, tiers = null } = {}, { familyOf, shapeOf }) {
  const rules = [];
  const names = Object.keys(skeleton).filter((n) => !n.startsWith('_') && skeleton[n]?.trees?.length).sort();
  const layersOf = (t, out = []) => { for (const c of t?.c ?? []) { out.push(c); if (c.t !== 'INSTANCE') layersOf(c, out); } return out; };

  // A property's name says which layer it drives: a word of it, besides show or has, is a word of the layer's name.
  const nameItems = names.map((n) => {
    const wired = new Map();
    // A nested component still named after its component (buttonTertiary) has no name of its own to match: the layer
    // naming rule asks for one, so it is no case here.
    for (const t of skeleton[n].trees) for (const l of layersOf(t)) { if (l.t === 'INSTANCE' && l.of?.name && l.n === l.of.name) continue; for (const p of Object.values(l.wired ?? {})) if (!wired.has(p)) wired.set(p, l.n); }
    const own = Object.entries(props[n]?.properties ?? {}).filter(([, d]) => ['BOOLEAN', 'TEXT', 'INSTANCE_SWAP'].includes(d?.type)).map(([k]) => clean(k)).filter((k) => wired.has(k));
    if (!own.length) return null;
    const off = own.filter((k) => {
      const layer = new Set(words(wired.get(k))), said = words(k).filter((w) => !VERB.has(w));
      return !said.some((w) => layer.has(w) || [...layer].some((x) => x.startsWith(w) || w.startsWith(x)));
    }).map((k) => `${k} drives ${wired.get(k)}`);
    return { component: n, value: off.join(' · '), fits: !off.length };
  }).filter(Boolean);
  if (nameItems.length) rules.push({ id: 'property-names-say-layer', area: 'naming', says: 'A property\'s name says which layer it drives (showIcon drives Icon)', items: nameItems });

  // Two components that do the same job: built in one shape and given the same properties, at least two of them.
  const resting = (n) => skeleton[n].trees[(skeleton[n].variants ?? [])[0]?.[1] ?? 0];
  const sig = (n) => {
    const p = Object.entries(props[n]?.properties ?? {}).map(([k, d]) => `${clean(k).toLowerCase()}:${d?.type}${d?.type === 'VARIANT' ? `=${(d.variantOptions ?? []).map(String).sort().join('|')}` : ''}`).sort();
    return p.length >= 2 ? `${shapeOf(resting(n), { generic: true })} | ${p.join(', ')}` : null;
  };
  const bySig = new Map();
  for (const n of names) { const s = sig(n); if (s) { if (!bySig.has(s)) bySig.set(s, []); bySig.get(s).push(n); } }
  const twinItems = names.filter((n) => sig(n)).map((n) => {
    const others = bySig.get(sig(n)).filter((x) => x !== n);
    return { component: n, value: others.length ? `built and given like ${others.join(', ')}` : '', fits: !others.length };
  });
  if (twinItems.length) rules.push({ id: 'no-twins', area: 'architecture', says: 'No two components are built the same and take the same properties', items: twinItems });

  // The team's declared tiers, read where the style guide can see them: each token that points somewhere, and where
  // its tier says it may not.
  if (Array.isArray(tiers) && tiers.length && tokens?.tokens?.length) {
    const list = tokens.tokens.filter((t) => t?.name);
    const aliases = new Map(list.map((t) => [t.name, [...new Set(Object.values(t.aliases ?? {}))]]));
    const kinds = new Map(list.map((t) => [t.name, KIND[t.kind] ?? null]));
    const { violations } = checkTiers(list.map((t) => t.name), (t) => aliases.get(t) ?? [], tiers, (t) => kinds.get(t));
    const byToken = new Map();
    for (const v of violations) { if (!byToken.has(v.token)) byToken.set(v.token, []); byToken.get(v.token).push(v.reason); }
    const items = list.filter((t) => (aliases.get(t.name) ?? []).length || byToken.has(t.name)).map((t) => ({ where: t.name, value: (byToken.get(t.name) ?? []).join(' · '), fits: !byToken.has(t.name) }));
    if (items.length) rules.push({ id: 'declared-tiers', area: 'tokens', says: 'A token points only where its declared tier may (ds-config.json tiers)', items });
  }
  // A nested component's own properties shown in the parent's properties panel (exposed), as most of the library's
  // nested components with properties are: the panel is all an agent sees, and a property it cannot reach it cannot set.
  // Read only from a capture that says so (exposed on an instance), never from one taken before.
  const nested = (n) => skeleton[n].trees.flatMap((t) => layersOf(t)).filter((l) => l.t === 'INSTANCE' && l.with && Object.keys(l.with).length);
  if (names.some((n) => nested(n).some((l) => l.exposed))) rules.push({ id: 'nested-exposed', area: 'wiring', says: 'A nested component with properties of its own shows them in the parent\'s properties panel',
    items: names.map((n) => { const l = nested(n); if (!l.length) return null; const hidden = [...new Set(l.filter((x) => !x.exposed).map((x) => x.n))]; return { component: n, value: hidden.length ? `${hidden.join(', ')} keep${hidden.length === 1 ? 's' : ''} its properties out of the panel` : '', fits: !hidden.length }; }).filter(Boolean) });
  return rules;
}
