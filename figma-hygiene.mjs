// figma-hygiene.mjs - the Figma file's own readiness (idea I23).
//
// The parity compares code with Figma and so assumes the Figma file is in order. When it is not, the code has
// nothing reliable to match, and an agent that reads the file copies its raw values. Recorded per component
// in component-values.snapshot.json (the same sweep that scopes the literal check), and listed as advice for
// whoever keeps the Figma file:
//   • a value with no variable and no style: a solid fill or stroke colour, a corner radius, a padding, a gap
//     in an auto layout, a text layer with no text style and no bound font size;
//   • a frame detached from an instance (the Plugin API capture only: REST has no such flag);
//   • a variant with two or more layers and no auto layout;
//   • a component with no description;
//   • an instance whose layer carries its component's name written another way ("Button Tertiary" for
//     buttonTertiary): an agent reading the file through an MCP sees the layer's name and writes it as the
//     component's. A layer renamed to its role ("Save") is a choice, not this.
// Vector artwork is left out (its colour follows the icon's, currentColor in code), and so is an instance
// with everything inside it: those are the instance's own component's values, recorded on their own. Hidden layers count,
// a boolean property can show them; a hidden paint does not. The parity never changes Figma.

// One component's record. Plain JavaScript with no imports, so the Plugin API capture in the cookbook carries
// this same function (a test checks the two are identical). Works on a Plugin API node and on a REST /nodes
// document: styles are `node.styles.fill` in REST and `node.fillStyleId` in the plugin, bound variables are
// `boundVariables` in both. `budget` ({ n }) bounds a REST walk. `names` maps a REST instance's componentId to its
// component's name (the set's, for a variant); the plugin reads mainComponent.
export function hygieneOf(root, description, budget = { n: Infinity }, names = {}) {
  const out = { raw: [], rawCount: 0, noAutoLayout: [], description: !!String(description ?? '').trim() };
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mainName = (n) => {
    if (names[n.componentId]) return names[n.componentId];
    try { const m = n.mainComponent; return m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : null; } catch (e) { return null; }
  };
  const has = (o, k) => { const v = o ? o[k] : null; return Array.isArray(v) ? v.some(Boolean) : !!v; };
  const bound = (n, k) => has(n.boundVariables, k);
  const styled = (n, kind) => has(n.styles, kind) || (typeof n[kind + 'StyleId'] === 'string' && n[kind + 'StyleId'] !== '');
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round((x || 0) * 255).toString(16).padStart(2, '0')).join('');
  const num = (v) => typeof v === 'number' && isFinite(v) && v > 0;
  const kids = (n) => (Array.isArray(n.children) ? n.children : []);
  const artwork = /^(VECTOR|BOOLEAN_OPERATION|STAR|LINE|POLYGON|REGULAR_POLYGON)$/;
  const raw = (at, field, value) => { out.rawCount++; if (out.raw.length < 12) out.raw.push({ at, field, value }); };
  const corners = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const sides = [['paddingTop', 'top'], ['paddingRight', 'right'], ['paddingBottom', 'bottom'], ['paddingLeft', 'left']];
  let detached = null;
  const walk = (n, at) => {
    if (!n || typeof n !== 'object' || budget.n <= 0) return;
    budget.n--;
    if (n.type === 'INSTANCE') {   // an instance, overrides included, reads as its own component's values
      const main = mainName(n);
      if (main && n.name !== main && key(n.name) === key(main)) { out.renamed = out.renamed || []; out.renamed.push({ at, layer: n.name, component: main }); }
      return;
    }
    if (n.detachedInfo !== undefined) { detached = detached || []; if (n.detachedInfo) detached.push(at); }
    if (!artwork.test(n.type)) {
      for (const [list, kind] of [['fills', 'fill'], ['strokes', 'stroke']]) {
        const paints = Array.isArray(n[list]) ? n[list] : [];
        paints.forEach((p, i) => {
          if (!p || p.type !== 'SOLID' || p.visible === false || !p.color) return;
          const viaNode = n.boundVariables && Array.isArray(n.boundVariables[list]) && n.boundVariables[list][i];
          if (has(p.boundVariables, 'color') || viaNode || styled(n, kind)) return;
          raw(at, kind, hex(p.color));
        });
      }
    }
    const radii = Array.isArray(n.rectangleCornerRadii) ? n.rectangleCornerRadii : corners.map((k) => n[k]);
    const radius = num(n.cornerRadius) ? n.cornerRadius : Math.max(0, ...radii.filter(num));
    if (radius > 0 && !bound(n, 'cornerRadius') && !corners.some((k) => bound(n, k))) raw(at, 'radius', radius);
    const loose = sides.filter(([k]) => num(n[k]) && !bound(n, k)).map(([k, w]) => `${w} ${n[k]}`);
    if (loose.length) raw(at, 'padding', loose.join(', '));
    const auto = n.layoutMode && n.layoutMode !== 'NONE';
    if (auto && num(n.itemSpacing) && kids(n).length > 1 && !bound(n, 'itemSpacing')) raw(at, 'gap', n.itemSpacing);
    if (n.type === 'TEXT' && !styled(n, 'text') && !bound(n, 'fontSize')) {
      const size = typeof n.fontSize === 'number' ? n.fontSize : n.style && n.style.fontSize;
      raw(at, 'text style', size ? `${size}px` : 'mixed');
    }
    for (const c of kids(n)) walk(c, `${at}/${c.name}`);
  };
  const variants = root && root.type === 'COMPONENT_SET' ? kids(root) : [root];
  for (const v of variants) {
    if (!v) continue;
    if (kids(v).length > 1 && (!v.layoutMode || v.layoutMode === 'NONE')) out.noAutoLayout.push(v.name);
    walk(v, v.name);
  }
  if (detached) out.detached = detached;
  return out;
}

// A scoped run keeps to its components (names compared without case or separators).
const scoped = (only) => {
  const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const keep = only && only.length ? new Set(only.map(key)) : null;
  return (name) => !keep || keep.has(key(name));
};

// The findings, component by component.
export function hygieneFindings(values, { only = null } = {}) {
  const inScope = scoped(only);
  const out = [];
  for (const [name, v] of Object.entries(values ?? {})) {
    const h = v && v.hygiene;
    if (name.startsWith('_') || !h || !inScope(name)) continue;
    for (const r of h.raw ?? []) out.push({ component: name, kind: 'raw', text: `${r.field} ${r.value} on ${r.at} has no variable or style` });
    const more = (h.rawCount ?? 0) - (h.raw?.length ?? 0);
    if (more > 0) out.push({ component: name, kind: 'raw', count: more, text: `and ${more} more value${more === 1 ? '' : 's'} with no variable or style` });
    for (const d of h.detached ?? []) out.push({ component: name, kind: 'detached', text: `${d} is detached from its instance` });
    const nl = h.noAutoLayout ?? [];
    if (nl.length) out.push({ component: name, kind: 'layout', count: nl.length, text: nl.length === 1 ? `${nl[0]} has no auto layout` : `${nl.length} variants have no auto layout (${nl.slice(0, 3).join('; ')}${nl.length > 3 ? '; …' : ''})` });
    for (const r of h.renamed ?? []) out.push({ component: name, kind: 'renamed', text: `${r.at} is an instance of ${r.component} named "${r.layer}": an agent reading the file writes "${r.layer}"; name the layer ${r.component}, or after its role` });
    if (h.description === false) out.push({ component: name, kind: 'description', text: 'no description' });
  }
  return out;
}

// How many components in scope carry a record, and how many of them have no finding.
export function hygieneScore(values, { only = null } = {}) {
  const inScope = scoped(only);
  const n = Object.entries(values ?? {}).filter(([name, v]) => !name.startsWith('_') && v && v.hygiene && inScope(name)).length;
  const flagged = new Set(hygieneFindings(values, { only }).map((f) => f.component)).size;
  return { n, clean: n - flagged };
}

// The block the audit prints. [] when no component carries a record.
export function hygieneBlock(values, { only = null, all = false, max = 15 } = {}) {
  const found = hygieneFindings(values, { only });
  const { n } = hygieneScore(values, { only });
  if (!n) return [];
  if (!found.length) return [`🎨 Figma file hygiene: ${n} component${n === 1 ? '' : 's'}, every value bound to a variable or style, every variant in auto layout, each with a description.`];
  const sum = (k) => found.filter((f) => f.kind === k).reduce((a, f) => a + (f.count ?? 1), 0);
  const parts = [['raw', (x) => `${x} value${x === 1 ? '' : 's'} with no variable or style`], ['detached', (x) => `${x} detached instance${x === 1 ? '' : 's'}`],
    ['layout', (x) => `${x} variant${x === 1 ? '' : 's'} with no auto layout`], ['renamed', (x) => `${x} instance${x === 1 ? '' : 's'} named unlike ${x === 1 ? 'its' : 'their'} component`], ['description', (x) => `${x} with no description`]]
    .filter(([k]) => sum(k)).map(([k, w]) => w(sum(k)));
  const comps = new Set(found.map((f) => f.component)).size;
  const lines = [`🎨 Figma file hygiene: ${comps} of ${n} component${n === 1 ? '' : 's'} (${parts.join(' · ')}). For whoever keeps the Figma file: code can only match what Figma states. The parity never changes Figma. Advisory.`];
  for (const f of found.slice(0, all ? found.length : max)) lines.push(`     ${f.component}: ${f.text}`);
  if (!all && found.length > max) lines.push(`     and ${found.length - max} more; run with --hygiene to list them all.`);
  return lines;
}
