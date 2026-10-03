// screen-layout.mjs - what designed screens say about layout, for a system that has no layout components or templates.
//
// Most design systems have screens before they have templates. Each screen already shows how the system arranges its
// components: the page padding, the spacing between sections, rows and columns, which components sit where. This reads
// the screens (a read-only Plugin API capture, SCREEN_CAPTURE_JS) and turns each one into a prototype starting point:
// the same arrangement in the engine's neutral pieces, the system's own components in their places, with their options.
// Nothing is copied that the system does not own: a frame's own fill or border, a detached look-alike, a typed number,
// a local component, all become lines on the gaps list instead. Across screens it also says what repeats: the spacing
// habits, and structures worth making into templates.
//
// Pure except SCREEN_CAPTURE_JS (run in Figma, never writes).

// Run with use_figma or figma-cli (`figma-cli eval`) on the file, with SCREEN_IDS replaced by the screens' node ids.
// It only reads: no node, variable or style is created or changed.
export const SCREEN_CAPTURE_JS = `
const SCREEN_IDS = __SCREEN_IDS__;
const names = new Map();
async function varName(id) { if (!id) return null; if (names.has(id)) return names.get(id); let n = null; try { const v = await figma.variables.getVariableByIdAsync(id); n = v ? v.name : null; } catch (e) {} names.set(id, n); return n; }
async function bound(node, key) { const b = node.boundVariables && node.boundVariables[key]; const id = Array.isArray(b) ? (b[0] && b[0].id) : (b && b.id); return varName(id); }
async function styleName(id) { if (!id || typeof id !== 'string') return null; try { const s = await figma.getStyleByIdAsync(id); return s ? s.name : null; } catch (e) { return null; } }
async function paintVar(node, key) { const p = Array.isArray(node[key]) ? node[key].find((x) => x.visible !== false) : null; if (!p) return null; const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id; return { var: await varName(id), type: p.type }; }
async function frameFacts(n) {
  const out = { layout: n.layoutMode || 'NONE', wrap: n.layoutWrap === 'WRAP', fillW: n.layoutSizingHorizontal === 'FILL', fillH: n.layoutSizingVertical === 'FILL' };
  if (out.layout !== 'NONE') {
    out.gap = n.itemSpacing; out.gapVar = await bound(n, 'itemSpacing');
    out.pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft];
    out.padVars = [await bound(n, 'paddingTop'), await bound(n, 'paddingRight'), await bound(n, 'paddingBottom'), await bound(n, 'paddingLeft')];
    out.align = n.counterAxisAlignItems; out.justify = n.primaryAxisAlignItems;
    if (n.layoutMode === 'GRID') out.columns = n.gridColumnCount;
  }
  out.fill = await paintVar(n, 'fills'); out.stroke = await paintVar(n, 'strokes');
  out.radius = typeof n.cornerRadius === 'number' ? n.cornerRadius : null; out.radiusVar = await bound(n, 'topLeftRadius');
  return out;
}
async function kids(n, depth) { const out = []; if ('children' in n && depth < 14) for (const k of n.children) { const c = await walk(k, depth + 1); if (c) out.push(c); } return out; }
async function walk(n, depth) {
  if (!n || n.visible === false) return null;
  const base = { name: n.name, w: Math.round(n.width), h: Math.round(n.height) };
  if (n.type === 'INSTANCE') {
    const main = await n.getMainComponentAsync();
    const set = main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
    const props = {};
    for (const [k, v] of Object.entries(n.componentProperties || {})) {
      let value = v.value;
      if (v.type === 'INSTANCE_SWAP' && typeof value === 'string') { try { const sw = await figma.getNodeByIdAsync(value); value = sw ? (sw.parent && sw.parent.type === 'COMPONENT_SET' ? sw.parent.name : sw.name) : value; } catch (e) {} }
      props[k.replace(/#[\\d:]+$/, '')] = value;
    }
    // Its inside too: a screen is often itself a component, and what is not a system component is read as layout.
    // Only a large one that holds other components (a screen, a panel): a button with an icon is just a button.
    const holds = depth === 0 || (n.width * n.height > 20000 && !!(n.findOne && n.findOne((x) => x.type === 'INSTANCE')));
    return { kind: 'instance', ...base, component: set ? set.name : (main ? main.name : n.name), remote: main ? !!main.remote : null, props, ...(holds ? { ...(await frameFacts(n)), children: await kids(n, depth) } : {}) };
  }
  if (n.type === 'TEXT') {
    return { kind: 'text', ...base, text: String(n.characters || '').slice(0, 160), style: await styleName(n.textStyleId), size: typeof n.fontSize === 'number' ? n.fontSize : null, weight: typeof n.fontWeight === 'number' ? n.fontWeight : null, fill: await paintVar(n, 'fills') };
  }
  if ('children' in n) return { kind: 'frame', ...base, type: n.type, ...(await frameFacts(n)), children: await kids(n, depth) };
  return { kind: 'shape', ...base, type: n.type };
}
// Defaults left out, so a whole window fits in one answer: no fill, no padding, no variable, square corners.
function prune(o) {
  if (Array.isArray(o)) return o.map(prune);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === false || (k === 'radius' && v === 0) || (k === 'gap' && v === 0) || (k === 'layout' && v === 'NONE')) continue;
    if (Array.isArray(v) && (!v.length || v.every((x) => x == null || x === 0)) && k !== 'children') continue;
    if ((k === 'align' || k === 'justify') && v === 'MIN') continue;
    out[k] = prune(v);
  }
  return out;
}
const screens = [];
for (const id of SCREEN_IDS) { const node = await figma.getNodeByIdAsync(id); if (node) screens.push({ id, name: node.name, tree: prune(await walk(node, 0)) }); }
return { _captured: new Date().toISOString(), _note: 'Read-only capture of designed screens (screen-layout.mjs).', screens };
`;

export function screenCaptureScript(ids) {
  return SCREEN_CAPTURE_JS.replace('__SCREEN_IDS__', JSON.stringify(ids.map((i) => String(i).replace('-', ':'))));
}

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The spacing token for a gap or a padding: the variable it is bound to, else the token with the same value.
function spacingFor(value, varName, scales, notes, where) {
  if (varName) {
    const t = scales.spacing.find((s) => key(s.name) === key(varName));
    if (t) return t.name;
  }
  if (!value) return 'none';
  const t = scales.spacing.find((s) => parseFloat(s.value) === value);
  if (t) { if (!varName) notes.push({ kind: 'token', need: `${where}: ${value}px typed, not bound to ${t.name}` }); return t.name; }
  notes.push({ kind: 'token', need: `a spacing token for ${value}px (${where} uses it, the system has none)` });
  return 'none';
}

// The text style a text layer uses: its style by name, else the style with its size and weight.
function textStyleFor(node, scales) {
  if (node.style) { const t = scales.text.find((s) => key(s.name) === key(node.style) || key(node.style).endsWith(key(s.name))); if (t) return t.name; }
  const t = scales.text.find((s) => parseFloat(s.size) === node.size && (!node.weight || String(s.weight) === String(node.weight)));
  return t ? t.name : null;
}

// One instance's props, in the catalog's names and values; what the catalog does not list is left out.
function propsFor(node, def) {
  const out = {};
  for (const [k, v] of Object.entries(node.props ?? {})) {
    const name = Object.keys(def.props ?? {}).find((p) => key(p) === key(k));
    if (!name) continue;
    const p = def.props[name];
    if (p.type === 'enum') { const val = (p.values ?? []).find((x) => key(x) === key(v)); if (val != null) out[name] = val; }
    else if (p.type === 'boolean') out[name] = v === true || /^true$/i.test(String(v));
    else if (p.type === 'text' && typeof v === 'string') out[name] = v;
  }
  return out;
}

// The slots inside a component instance (Figma's SLOT frames), outermost first; its own parts are not slots.
function slotsOf(node) {
  const out = [];
  const walk = (n) => { for (const k of n.children ?? []) { if (k.type === 'SLOT') out.push(k); else if (k.kind === 'frame') walk(k); } };
  walk(node);
  return out;
}

// A screen's capture → { prototype: composition, gaps: [...] } in the engine's pieces and the system's components.
export function screenToPrototype(screen, { catalog = { components: {} }, scales = { spacing: [], text: [] } } = {}) {
  const gaps = [];
  const notes = [];
  const comps = catalog.components ?? {};
  const byKey = new Map(Object.keys(comps).map((n) => [key(n), n]));
  const where = screen.name;
  const convert = (node, depth, parentLayout = null) => {
    if (!node) return null;
    if (node.kind === 'instance') {
      const name = byKey.get(key(node.component)) ?? byKey.get(key(String(node.component).split('/').pop()));
      // A system component with slots keeps what the screen put in them, each slot as its own arrangement.
      if (name) { const slots = slotsOf(node).map((sl) => convert({ ...sl, kind: 'frame' }, depth + 1, node.layout ?? 'NONE')).filter(Boolean); return { component: name, props: propsFor(node, comps[name]), ...(slots.length ? { children: slots } : {}) }; }
      // A local component that holds others (a whole screen, a panel) is not a system part: read its inside as layout,
      // and say it is a structure the system could own (a template, or a component).
      if ((node.children ?? []).length) {
        gaps.push({ kind: depth === 0 || node.w * node.h > 200000 ? 'pattern' : 'component', need: `${String(node.component).replace(/^[._]+/, '')} as a system ${depth === 0 || node.w * node.h > 200000 ? 'template' : 'component'} (a local component in Figma, read here as layout)` });
        return convert({ ...node, kind: 'frame' }, depth, parentLayout);
      }
      const icon = /icon|glyph|symbol/i.test(node.component);
      return { component: 'Missing', props: { need: String(node.component), kind: icon ? 'icon' : 'component' } };
    }
    if (node.kind === 'text') {
      const style = textStyleFor(node, scales);
      if (!style && scales.text.length) notes.push({ kind: 'token', need: `text "${node.text.slice(0, 30)}" in ${where} uses no text style (${node.size ?? '?'}px)` });
      return { component: 'Text', props: { text: node.text, ...(style ? { style } : {}), as: depth <= 1 && node.size && scales.text.length && node.size >= Math.max(...scales.text.map((t) => parseFloat(t.size))) ? 'h1' : 'p' } };
    }
    if (node.kind === 'shape') { gaps.push({ kind: 'component', need: `a divider or decoration (${node.type.toLowerCase()} layers in ${where})` }); return null; }
    if (node.kind !== 'frame') return null;
    // A frame with a look of its own (a surface, a border, a corner) is a container the system has no component for.
    if (depth > 0 && (node.fill || node.stroke)) {
      const look = [node.fill && `fill ${node.fill.var ?? 'with no variable'}`, node.stroke && `border ${node.stroke.var ?? 'with no variable'}`, node.radius && `corner ${node.radiusVar ?? node.radius + 'px'}`].filter(Boolean).join(', ');
      gaps.push({ kind: 'pattern', need: `a container component like "${node.name}" (${look})` });
    }
    const kids = (node.children ?? []).map((k) => convert(k, depth + 1, node.layout ?? 'NONE')).filter(Boolean);
    const layout = node.layout ?? 'NONE';
    const piece = depth === 0 ? 'Page' : layout === 'HORIZONTAL' ? 'Row' : layout === 'GRID' ? 'Columns' : 'Stack';
    if (layout === 'NONE' && kids.length > 1) notes.push({ kind: 'layout', need: `"${node.name}" in ${where} has no auto layout: read as a stack` });
    const props = {};
    if (layout !== 'NONE') {
      const gap = spacingFor(node.gap, node.gapVar, scales, notes, `"${node.name}" gap`);
      if (gap !== 'none') props.gap = gap;
      const pad = spacingFor(Math.max(...(node.pad ?? [0])), (node.padVars ?? []).find(Boolean), scales, notes, `"${node.name}" padding`);
      if (pad !== 'none') props.padding = pad;
      if (piece !== 'Columns' && node.align && node.align !== 'MIN') props.align = { CENTER: 'center', MAX: 'end', BASELINE: piece === 'Row' ? 'baseline' : 'start' }[node.align] ?? 'start';
      if (piece === 'Row' && node.justify === 'SPACE_BETWEEN') props.justify = 'between';
      if (piece === 'Row' && node.wrap) props.wrap = true;
      if (piece === 'Columns' && node.columns) props.count = String(Math.min(4, Math.max(2, node.columns)));
    }
    // A wrapper with one child and no spacing of its own adds nothing to the arrangement.
    // Figma's Fill container: along its parent's direction the piece takes the room left (grow); across it, children
    // that all fill make the parent stretch them. The screen's own width sets the page.
    if (depth > 0 && ((parentLayout === 'HORIZONTAL' && node.fillW) || (parentLayout !== 'HORIZONTAL' && node.fillH))) props.grow = true;
    const across = (node.children ?? []).filter((k) => k.kind !== 'text' && k.kind !== 'shape');
    if (piece !== 'Columns' && !props.align && across.length && across.every((k) => (layout === 'HORIZONTAL' ? k.fillH : k.fillW))) props.align = 'stretch';
    if (depth === 0 && node.w) props.width = String(node.w);
    if (depth > 0 && kids.length === 1 && !Object.keys(props).length) return kids[0];
    return { component: piece, props, children: kids };
  };
  const prototype = convert(screen.tree, 0) ?? { component: 'Page', props: {}, children: [] };
  return { prototype, gaps: [...gaps, ...notes].map((g) => ({ ...g, from: where })) };
}

// The arrangement of a composition as a short signature: what a template made from it would hold.
function signature(node, depth = 0) {
  if (!node) return '';
  if (node.component === 'Text') return 'Text';
  if (!['Page', 'Stack', 'Row', 'Columns'].includes(node.component)) return node.component;
  if (depth >= 2) return node.component;
  return `${node.component}(${(node.children ?? []).map((k) => signature(k, depth + 1)).join(',')})`;
}

// Across screens: the spacing habits and the structures that repeat.
export function layoutHabits(results) {
  const gaps = new Map(), pads = new Map(), parts = new Map(), used = new Map();
  const count = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const visit = (node, screen) => {
    if (!node) return;
    if (['Page', 'Stack', 'Row', 'Columns'].includes(node.component)) {
      if (node.props?.gap) count(gaps, node.props.gap);
      if (node.props?.padding) count(pads, node.props.padding);
    } else if (!['Text', 'Missing'].includes(node.component)) { if (!used.has(node.component)) used.set(node.component, new Set()); used.get(node.component).add(screen); }
    (node.children ?? []).forEach((k) => visit(k, screen));
  };
  for (const r of results) {
    visit(r.prototype, r.name);
    for (const k of r.prototype?.children ?? []) { const s = signature(k, 1); if (/\(/.test(s) || k.children?.length) { if (!parts.has(s)) parts.set(s, new Set()); parts.get(s).add(r.name); } }
  }
  const sorted = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  return {
    gaps: sorted(gaps), paddings: sorted(pads),
    pagePadding: [...new Set(results.map((r) => r.prototype?.props?.padding).filter(Boolean))],
    components: [...used].map(([name, s]) => ({ name, screens: [...s] })).sort((a, b) => b.screens.length - a.screens.length),
    repeated: [...parts].filter(([, s]) => s.size > 1).map(([structure, s]) => ({ structure, screens: [...s] })),
  };
}
