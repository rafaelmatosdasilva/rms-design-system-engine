// figma-hygiene.mjs - the Figma file's own readiness.
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
//     component's. A layer renamed to its role ("Save") is a choice, not this;
//   • variable scoping, with the scopes the vars snapshot records (variableScopes): a property bound to a
//     variable scoped to other properties (a spacing variable on a corner radius), and, for the whole file, the
//     variables left on all scopes, offered for every property.
// Vector artwork is left out (its colour follows the icon's, currentColor in code), and so is an instance
// with everything inside it: those are the instance's own component's values, recorded on their own. Hidden layers count,
// a boolean property can show them; a hidden paint does not. The parity never changes Figma.

// One component's record. Plain JavaScript with no imports, so the Plugin API capture in the cookbook carries
// this same function (a test checks the two are identical). Works on a Plugin API node and on a REST /nodes
// document: styles are `node.styles.fill` in REST and `node.fillStyleId` in the plugin, bound variables are
// `boundVariables` in both. Every property is read through `get`: the Figma tool throws on reading one a layer type
// does not have (fills on a group, rectangleCornerRadii, which only REST has), and a mixed value (figma.mixed) is
// never a number. `budget` ({ n }) bounds a REST walk. `names` maps a REST instance's componentId to its
// component's name (the set's, for a variant); the plugin reads mainComponent.
export function hygieneOf(root, description, budget = { n: Infinity }, names = {}) {
  // values: how many values were read (raw or bound), variants: how many variants hold two or more layers; with rawCount
  // and noAutoLayout they say how far the file can be trusted for a comparison.
  const out = { raw: [], rawCount: 0, values: 0, noAutoLayout: [], variants: 0, description: !!String(description ?? '').trim() };
  const get = (n, k) => { try { return n != null && typeof n === 'object' && k in n ? n[k] : undefined; } catch (e) { return undefined; } };
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mainName = (n) => {
    const id = get(n, 'componentId');
    if (id != null && names[id]) return names[id];
    try { const m = n.mainComponent; return m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : null; } catch (e) { return null; }
  };
  const has = (o, k) => { const v = o ? o[k] : null; return Array.isArray(v) ? v.some(Boolean) : !!v; };
  const bound = (n, k) => has(get(n, 'boundVariables'), k);
  const styled = (n, kind) => { const id = get(n, kind + 'StyleId'); return has(get(n, 'styles'), kind) || (typeof id === 'string' && id !== ''); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round((x || 0) * 255).toString(16).padStart(2, '0')).join('');
  const num = (v) => typeof v === 'number' && isFinite(v) && v > 0;
  const kids = (n) => { const c = get(n, 'children'); return Array.isArray(c) ? c : []; };
  const paintsOf = (n, list) => { const p = get(n, list); return Array.isArray(p) ? p : []; };
  const artwork = /^(VECTOR|BOOLEAN_OPERATION|STAR|LINE|POLYGON|REGULAR_POLYGON)$/;
  const raw = (at, field, value) => { out.rawCount++; if (out.raw.length < 12) out.raw.push({ at, field, value }); };
  const corners = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  // The scope Figma gives each property a variable can be bound to; a fill's depends on the layer.
  const SCOPE = { width: 'WIDTH_HEIGHT', height: 'WIDTH_HEIGHT', minWidth: 'WIDTH_HEIGHT', maxWidth: 'WIDTH_HEIGHT', minHeight: 'WIDTH_HEIGHT', maxHeight: 'WIDTH_HEIGHT',
    itemSpacing: 'GAP', counterAxisSpacing: 'GAP', paddingTop: 'GAP', paddingRight: 'GAP', paddingBottom: 'GAP', paddingLeft: 'GAP', gridRowGap: 'GAP', gridColumnGap: 'GAP',
    topLeftRadius: 'CORNER_RADIUS', topRightRadius: 'CORNER_RADIUS', bottomRightRadius: 'CORNER_RADIUS', bottomLeftRadius: 'CORNER_RADIUS',
    strokeWeight: 'STROKE_FLOAT', strokeTopWeight: 'STROKE_FLOAT', strokeRightWeight: 'STROKE_FLOAT', strokeBottomWeight: 'STROKE_FLOAT', strokeLeftWeight: 'STROKE_FLOAT',
    strokes: 'STROKE_COLOR', opacity: 'OPACITY', characters: 'TEXT_CONTENT', fontFamily: 'FONT_FAMILY', fontStyle: 'FONT_STYLE', fontWeight: 'FONT_WEIGHT', fontSize: 'FONT_SIZE',
    lineHeight: 'LINE_HEIGHT', letterSpacing: 'LETTER_SPACING', paragraphSpacing: 'PARAGRAPH_SPACING', paragraphIndent: 'PARAGRAPH_INDENT' };
  // binds: { <variable id>: { <scope>: the first layer bound that way } }, only when something is bound.
  const bind = (a, scope, at) => {
    if (!a || a.type !== 'VARIABLE_ALIAS' || !a.id) return;
    out.binds = out.binds || {};
    const b = (out.binds[a.id] = out.binds[a.id] || {});
    if (!b[scope]) b[scope] = at;
  };
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
    const detachedInfo = get(n, 'detachedInfo');
    if (detachedInfo !== undefined) { detached = detached || []; if (detachedInfo) detached.push(at); }
    const fillScope = n.type === 'TEXT' ? 'TEXT_FILL' : /^(FRAME|COMPONENT|SECTION)$/.test(n.type) ? 'FRAME_FILL' : 'SHAPE_FILL';
    const bvs = get(n, 'boundVariables') || {};
    for (const [k, v] of Object.entries(bvs)) {
      const scope = k === 'fills' ? fillScope : SCOPE[k];
      if (scope) for (const a of [].concat(v)) bind(a, scope, at);
    }
    for (const [list, scope] of [['fills', fillScope], ['strokes', 'STROKE_COLOR']]) {
      for (const p of paintsOf(n, list)) if (p && p.boundVariables) bind(p.boundVariables.color, scope, at);
    }
    if (!artwork.test(n.type)) {
      for (const [list, kind] of [['fills', 'fill'], ['strokes', 'stroke']]) {
        paintsOf(n, list).forEach((p, i) => {
          if (!p || p.type !== 'SOLID' || p.visible === false || !p.color) return;
          out.values++;
          const viaNode = Array.isArray(bvs[list]) && bvs[list][i];
          if (has(p.boundVariables, 'color') || viaNode || styled(n, kind)) return;
          raw(at, kind, hex(p.color));
        });
      }
    }
    const rectRadii = get(n, 'rectangleCornerRadii'), cornerRadius = get(n, 'cornerRadius');
    const radii = Array.isArray(rectRadii) ? rectRadii : corners.map((k) => get(n, k));
    const radius = num(cornerRadius) ? cornerRadius : Math.max(0, ...radii.filter(num));
    if (radius > 0) out.values++;
    if (radius > 0 && !bound(n, 'cornerRadius') && !corners.some((k) => bound(n, k))) raw(at, 'radius', radius);
    if (sides.some(([k]) => num(get(n, k)))) out.values++;
    const loose = sides.filter(([k]) => num(get(n, k)) && !bound(n, k)).map(([k, w]) => `${w} ${get(n, k)}`);
    if (loose.length) raw(at, 'padding', loose.join(', '));
    const layoutMode = get(n, 'layoutMode'), gap = get(n, 'itemSpacing');
    const auto = layoutMode && layoutMode !== 'NONE';
    if (auto && num(gap) && kids(n).length > 1) out.values++;
    if (auto && num(gap) && kids(n).length > 1 && !bound(n, 'itemSpacing')) raw(at, 'gap', gap);
    if (n.type === 'TEXT') out.values++;
    if (n.type === 'TEXT' && !styled(n, 'text') && !bound(n, 'fontSize')) {
      const fontSize = get(n, 'fontSize'), style = get(n, 'style');
      const size = typeof fontSize === 'number' ? fontSize : style && style.fontSize;
      raw(at, 'text style', size ? `${size}px` : 'mixed');
    }
    for (const c of kids(n)) walk(c, `${at}/${c.name}`);
  };
  const variants = root && root.type === 'COMPONENT_SET' ? kids(root) : [root];
  for (const v of variants) {
    if (!v) continue;
    const mode = get(v, 'layoutMode');
    if (kids(v).length > 1) out.variants++;
    if (kids(v).length > 1 && (!mode || mode === 'NONE')) out.noAutoLayout.push(v.name);
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

// Variable scopes in words, and whether a scope list lets a property of that scope use the variable.
const SCOPE_WORDS = { WIDTH_HEIGHT: 'width and height', GAP: 'gap and padding', CORNER_RADIUS: 'corner radius', STROKE_FLOAT: 'stroke width',
  STROKE_COLOR: 'stroke colour', OPACITY: 'opacity', TEXT_CONTENT: 'text', FONT_FAMILY: 'font family', FONT_STYLE: 'font style', FONT_WEIGHT: 'font weight',
  FONT_SIZE: 'font size', LINE_HEIGHT: 'line height', LETTER_SPACING: 'letter spacing', PARAGRAPH_SPACING: 'paragraph spacing', PARAGRAPH_INDENT: 'paragraph indent',
  TEXT_FILL: 'text fill', FRAME_FILL: 'frame fill', SHAPE_FILL: 'shape fill', ALL_FILLS: 'every fill', EFFECT_COLOR: 'effect colour', EFFECT_FLOAT: 'effects' };
const words = (s) => SCOPE_WORDS[s] ?? String(s).toLowerCase().replace(/_/g, ' ');
const fits = (scopes, s) => scopes.includes('ALL_SCOPES') || scopes.includes(s) || (/_FILL$/.test(s) && scopes.includes('ALL_FILLS'));

// The findings, component by component; first, for a whole-file run, the variables left on all scopes.
// scopes: the vars snapshot's variableScopes, { <variable id>: { name, scopes } }.
export function hygieneFindings(values, { only = null, scopes = null } = {}) {
  const inScope = scoped(only);
  const out = [];
  if (scopes && !(only && only.length)) {
    const all = Object.values(scopes).filter((v) => v && Array.isArray(v.scopes) && v.scopes.includes('ALL_SCOPES')).map((v) => v.name).sort();
    if (all.length) out.push({ component: null, kind: 'allScopes', count: all.length, text: `${all.length} variable${all.length === 1 ? ' is' : 's are'} offered for every property (all scopes): ${all.slice(0, 5).join(', ')}${all.length > 5 ? ', …' : ''}. Scope each to the properties it is for, and a primitive to none, so only the tokens that alias it are offered` });
  }
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
    for (const [id, by] of Object.entries(scopes && h.binds ? h.binds : {})) {
      const v = scopes[id];
      if (!v || !Array.isArray(v.scopes)) continue;   // a library's variable, or one the snapshot does not record
      for (const [s, at] of Object.entries(by)) {
        if (!fits(v.scopes, s)) out.push({ component: name, kind: 'scope', text: `the ${words(s)} of ${at} is bound to ${v.name}, a variable scoped to ${v.scopes.length ? v.scopes.map(words).join(', ') : 'nothing'}: bind one scoped to ${words(s)}, or add that scope to ${v.name}` });
      }
    }
  }
  return out;
}

// Is the Figma file reliable enough to compare? The share of its values bound to a variable or style and of its
// variants in auto layout, over the components whose record counts them (a record from before has no counts).
// reliable: both at 90% or more; not reliable: either under 60%, where a match or a difference can be chance;
// partly between. least: the components with the lowest share of bound values, three or more values each.
export function reliability(values, { only = null } = {}) {
  const inScope = scoped(only);
  let read = 0, raw = 0, variants = 0, loose = 0;
  const per = [];
  for (const [name, v] of Object.entries(values ?? {})) {
    const h = v && v.hygiene;
    if (name.startsWith('_') || !h || typeof h.values !== 'number' || !inScope(name)) continue;
    read += h.values; raw += h.rawCount ?? 0; variants += h.variants ?? 0; loose += (h.noAutoLayout ?? []).length;
    if (h.values >= 3) per.push({ name, share: (h.values - (h.rawCount ?? 0)) / h.values });
  }
  if (!read) return null;
  const bound = (read - raw) / read, layout = variants ? (variants - loose) / variants : 1;
  const level = bound >= 0.9 && layout >= 0.9 ? 'reliable' : bound < 0.6 || layout < 0.6 ? 'unreliable' : 'partly';
  const least = per.filter((x) => x.share < 0.9).sort((a, b) => a.share - b.share || a.name.localeCompare(b.name)).slice(0, 3);
  return { level, bound, layout, values: read, variants, least };
}
// The reliability as one line for the summary, or null when the file is reliable or nothing was counted.
export function reliabilityLine(r) {
  if (!r || r.level === 'reliable') return null;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const facts = `${pct(r.bound)} of its values have a variable or style and ${pct(r.layout)} of its variants use auto layout`;
  const least = r.least.length ? ` Least reliable: ${r.least.map((x) => `${x.name} (${pct(x.share)})`).join(', ')}.` : '';
  return r.level === 'unreliable'
    ? `**The Figma file is not reliable enough to compare.** ${facts}, so a match or a difference with the code can be chance.${least} Fix the file first (the Figma file hygiene block lists what).`
    : `**The Figma file is only partly reliable to compare.** ${facts}.${least} The Figma file hygiene block lists what to fix.`;
}

// How many components in scope carry a record, and how many of them have no finding.
export function hygieneScore(values, { only = null, scopes = null } = {}) {
  const inScope = scoped(only);
  const n = Object.entries(values ?? {}).filter(([name, v]) => !name.startsWith('_') && v && v.hygiene && inScope(name)).length;
  const flagged = new Set(hygieneFindings(values, { only, scopes }).filter((f) => f.component).map((f) => f.component)).size;
  return { n, clean: n - flagged };
}

// The block the audit prints. [] when no component carries a record.
export function hygieneBlock(values, { only = null, all = false, max = 15, scopes = null } = {}) {
  const found = hygieneFindings(values, { only, scopes });
  const { n } = hygieneScore(values, { only, scopes });
  if (!n) return [];
  if (!found.length) return [`🎨 Figma file hygiene: ${n} component${n === 1 ? '' : 's'}, every value bound to a variable or style, every variant in auto layout, each with a description.`];
  const sum = (k) => found.filter((f) => f.kind === k).reduce((a, f) => a + (f.count ?? 1), 0);
  const parts = [['raw', (x) => `${x} value${x === 1 ? '' : 's'} with no variable or style`], ['detached', (x) => `${x} detached instance${x === 1 ? '' : 's'}`],
    ['layout', (x) => `${x} variant${x === 1 ? '' : 's'} with no auto layout`], ['renamed', (x) => `${x} instance${x === 1 ? '' : 's'} named unlike ${x === 1 ? 'its' : 'their'} component`], ['description', (x) => `${x} with no description`],
    ['scope', (x) => `${x} propert${x === 1 ? 'y' : 'ies'} bound outside ${x === 1 ? 'its' : 'their'} variable's scope`], ['allScopes', (x) => `${x} variable${x === 1 ? '' : 's'} on all scopes`]]
    .filter(([k]) => sum(k)).map(([k, w]) => w(sum(k)));
  const comps = new Set(found.filter((f) => f.component).map((f) => f.component)).size;
  const lines = [`🎨 Figma file hygiene: ${comps ? `${comps} of ${n} component${n === 1 ? '' : 's'}` : 'the variables'} (${parts.join(' · ')}). For whoever keeps the Figma file: code can only match what Figma states. The parity never changes Figma. Advisory.`];
  for (const f of found.slice(0, all ? found.length : max)) lines.push(`     ${f.component ? `${f.component}: ` : ''}${f.text}`);
  if (!all && found.length > max) lines.push(`     and ${found.length - max} more; run with --hygiene to list them all.`);
  return lines;
}
