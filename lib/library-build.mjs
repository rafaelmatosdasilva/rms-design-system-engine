// library-build.mjs - a whole library built from its written description, in Figma and in code, the same every time.
//
// The engine writes a system down: its tokens in the W3C format (tokens.json), its components as DSDS entries (the view
// in contracts/dsds, contract-dsds.mjs), each linking the contract that holds its props and its anatomy. This reads that
// description back as the source and builds the library from it alone, with no model in the build:
//   - Figma: the variables, one collection a kind, a mode a theme, each value (or the variable it points at); the text
//     styles; each component on a page of its own, its variants, its properties and the variables its frame is bound
//     to, and its description. Written by one plugin script a person says yes to (libraryScript),
//     which finds each piece by its name and writes only what differs from the description: a second run changes only
//     what the description changed, and a run with nothing changed changes nothing.
//   - Code: the tokens as custom properties, and each component's file as spec-to-code.mjs writes one, handed back as a
//     patch, as every file the engine writes for code people own is.
// Each component's documentation beside it is --figma-specs's, drawn from its contract once the file has been read
// again, as for any system. What the description does not say exactly (a collection's name, a font, a part's kind, a layer's place) is listed,
// never guessed. The description is the system's, never a tool's: Figma today, another tool tomorrow, from the same
// files.
//
//   readDescription(dir)            → { system, tokens, themes, components, file } read from a DSDS view (system.dsds.json)
//   libraryPlan(desc)               → { collections, textStyles, components, listed }
//   libraryScript(plan)             → the Figma plugin script that builds it, returning what it made, changed and kept
//   componentModel(component) → { model, listed }: figma-ops.mjs's model of a component, for spec-to-code.mjs
//   tokensCss(plan, { cssVarOf, selectorOf }) → the tokens as custom properties, one block a mode
//
// readDescription reads files. Everything else is pure.
import { readFileSync } from 'node:fs';
import { UNDO_PRELUDE, lit } from './figma-undo.mjs';
import { join, dirname } from 'node:path';

const EXT = 'io.github.rafaelmatosdasilva.rms-design-system-engine';
const MODES_EXT = 'com.rms.design-system-engine';
const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const pointer = (doc, frag) => String(frag ?? '').replace(/^#?\/?/, '').split('/').filter(Boolean).map((p) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~')).reduce((o, k) => (o == null ? undefined : o[k]), doc);

// ── The description, read back ──────────────────────────────────────────────────────────────────────────────────────
// dir: the folder of the DSDS view (system.dsds.json). Each file the index refers to is read, each token's value from
// the DTCG file it points at, and each component's contract from its spec.
export function readDescription(dir) {
  const index = read(join(dir, 'system.dsds.json'));
  if (!index) return { why: `no DSDS view in ${dir} (system.dsds.json): the engine writes one with the contracts` };
  const sys = (index.entries ?? []).find((e) => e?.kind === 'system') ?? {};
  const out = { system: index.name ?? sys.name ?? 'Design system', version: index.schemaVersion ?? null, tokens: [], themes: [], components: [], shared: index.shared ?? [], file: join(dir, 'system.dsds.json') };
  const dtcg = new Map();
  for (const r of index.refs ?? []) {
    if (r?.rel !== 'file' || !r.href) continue;
    const file = join(dir, r.href), doc = read(file);
    if (!doc) continue;
    for (const e of doc.entries ?? []) {
      if (e.kind === 'token') {
        const [path, frag] = String(e.source?.href ?? e.source ?? '').split('#');
        if (!path) continue;
        const at = join(dirname(file), path);
        if (!dtcg.has(at)) dtcg.set(at, read(at));
        const leaf = pointer(dtcg.get(at), frag);
        if (leaf && typeof leaf === 'object' && '$value' in leaf) out.tokens.push({ id: e.id, path: String(frag ?? '').replace(/^#?\/?/, '').split('/').filter(Boolean).map(decodeURIComponent).join('.'), name: e.name, description: e.description, deprecated: e.metadata?.status?.status === 'deprecated' ? e.metadata.status.deprecationNotice ?? true : null, leaf });
      } else if (e.kind === 'theme') {
        const key = (e.$extensions?.[EXT]?.keys ?? []).map((k) => /^mode:(.+)$/.exec(k)?.[1]).find(Boolean) ?? e.id;
        out.themes.push({ id: e.id, name: e.name, key, base: !e.extends?.length });
      } else if (e.kind === 'component') {
        const spec = (e.specs ?? [])[0]?.href;
        out.components.push({ entry: e, contract: spec ? read(join(dirname(file), spec)) : null });
      }
    }
  }
  return out;
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The kind of Figma variable each DTCG type is, and the collection it goes in (one a kind: the description names none).
const KINDS = { color: ['COLOR', 'Color'], dimension: ['FLOAT', 'Dimension'], number: ['FLOAT', 'Number'], fontWeight: ['FLOAT', 'Number'], fontFamily: ['STRING', 'String'], string: ['STRING', 'String'], boolean: ['BOOLEAN', 'Boolean'] };
const REF = /^\{([^{}]+)\}$/;
// '#1f5fd6' or '#1f5fd680' → { r, g, b, a } as Figma keeps a colour; anything else → null.
export function rgba(hex) {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length <= 4 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}
// A DTCG value → what a Figma variable of that kind holds: { value } or { alias: token id }, or { why } when it cannot.
function valueOf(v, type) {
  if (typeof v === 'string' && REF.test(v.trim())) return { alias: REF.exec(v.trim())[1] };
  if (type === 'COLOR') { const c = rgba(v); return c ? { value: c } : { why: `${JSON.stringify(v)} is no colour Figma keeps` }; }
  if (type === 'FLOAT') { const n = typeof v === 'number' ? v : /^-?\d+(\.\d+)?(px)?$/.test(String(v).trim()) ? parseFloat(v) : NaN; return Number.isFinite(n) ? { value: n } : { why: `${JSON.stringify(v)} is no number Figma keeps (only px is read as one)` }; }
  if (type === 'BOOLEAN') return typeof v === 'boolean' ? { value: v } : { why: `${JSON.stringify(v)} is not true or false` };
  return { value: String(v) };
}
// A token's own words: its DTCG description, else its DSDS entry's where the team wrote one (the view's own placeholder,
// "The colour token … Its value is in the DTCG file", is no description).
const ownWords = (t) => t.leaf.$description ?? (t.description && !/Its value is in the DTCG file/.test(t.description) ? t.description : null);

export function libraryPlan(desc) {
  const listed = [];
  const say = (what, why) => { if (!listed.some((l) => l.what === what && l.why === why)) listed.push({ what, why }); };
  // A token by what the description calls it: its DTCG path (what an alias and a contract's {a.b} say), its DSDS id or
  // its name (what a contract's paints say).
  const byId = new Map();
  for (const t of desc.tokens) for (const k of [t.name, t.id, t.path]) if (k && !byId.has(String(k))) byId.set(String(k), t);
  // The modes: one a theme, the base first. A system with no themes has one mode, Figma's own first one.
  const themes = [...desc.themes].sort((a, b) => (b.base ? 1 : 0) - (a.base ? 1 : 0));
  const modes = themes.length ? themes.map((t) => ({ name: t.name, key: t.key })) : [{ name: null, key: null }];
  // ── Variables: one collection a kind, the description naming none.
  const collections = new Map();
  const textStyles = [];
  for (const t of desc.tokens) {
    const type = t.leaf.$type ?? null;
    if (type === 'typography') {
      const v = t.leaf.$value ?? {};
      const px = (x) => (/^-?\d+(\.\d+)?(px)?$/.test(String(x ?? '').trim()) ? parseFloat(x) : null);
      const style = { name: t.name, description: ownWords(t), fontSize: px(v.fontSize), lineHeight: px(v.lineHeight), fontWeight: v.fontWeight != null ? Number(v.fontWeight) : null, fontFamily: v.fontFamily ?? null };
      if (style.fontSize == null) say(`text style ${t.name}`, 'its size is not given in px, so it is left as Figma makes it');
      if (!style.fontFamily) say('text styles', 'the description gives no font family: each text style keeps the font Figma gives a new one, for a person to set');
      if (style.fontWeight != null) say('text styles', 'a weight is a number in the description and a style name in Figma (Bold, Semi Bold), and fonts name their styles differently: each weight is listed on its style, for a person to set');
      textStyles.push(style);
      continue;
    }
    const kind = KINDS[type];
    if (!kind) { say(`token ${t.name}`, `a ${type ?? 'token with no type'} has no Figma variable to hold it`); continue; }
    const [resolvedType, group] = kind;
    if (!collections.has(group)) collections.set(group, { name: group, modes: modes.map((m) => m.name), variables: [] });
    const values = {};
    const own = t.leaf.$extensions?.[MODES_EXT]?.modes ?? {};
    for (const m of modes) {
      const v = m.key && own[m.key] !== undefined ? own[m.key] : t.leaf.$value;
      const got = valueOf(v, resolvedType);
      if (got.why) { say(`token ${t.name}`, got.why); continue; }
      if (got.alias) {
        const to = byId.get(got.alias);
        if (!to) { say(`token ${t.name}`, `it points at ${got.alias}, which the description does not have`); continue; }
        values[m.name ?? ''] = { alias: to.name };
      } else values[m.name ?? ''] = { value: got.value };
    }
    collections.get(group).variables.push({ name: t.name, type: resolvedType, values, description: ownWords(t), ...(t.deprecated ? { deprecated: t.deprecated } : {}) });
  }
  if (collections.size) say('collections', `the description names no collection: the variables are in one a kind (${[...collections.keys()].join(', ')}), which a person can rename`);
  if (!themes.length && collections.size) say('modes', 'the description has no theme: each collection keeps the one mode Figma gives it');
  // ── Components: each from its DSDS entry and its contract.
  const varOf = (ref) => { const id = REF.exec(String(ref ?? '').trim())?.[1]; const t = id ? byId.get(id) : null; return t ? t.name : null; };
  const components = [];
  for (const { entry: e, contract: c } of desc.components) {
    const name = e.name;
    if (!c) { say(name, 'its contract is not where its DSDS entry points: built from its entry alone, with no properties or bindings'); }
    const axes = [], properties = [];
    for (const p of c?.props ?? []) {
      const f = p.bindings?.figma;
      if (!f) continue;
      if (f.kind === 'VARIANT') axes.push({ name: f.property ?? p.name, options: (f.options ?? p.options ?? []).map(String), default: String(f.default ?? p.default ?? (f.options ?? p.options ?? [])[0] ?? '') });
      else if (f.kind === 'TEXT' || f.kind === 'BOOLEAN') properties.push({ name: f.property ?? p.name, kind: f.kind, default: f.default ?? p.default ?? (f.kind === 'BOOLEAN' ? true : '') });
      else say(`${name} ${p.name}`, `a ${String(f.kind).toLowerCase().replace('_', ' ')} property needs the component it swaps in, which the description does not say`);
    }
    // Every variant once: each combination of the axes' options.
    let variants = [{}];
    for (const a of axes) variants = variants.flatMap((v) => a.options.map((o) => ({ ...v, [a.name]: o })));
    if (variants.length > 256) { say(name, `${variants.length} variants: the first 256 are built, and the rest listed for a person`); variants = variants.slice(0, 256); }
    // The frame: its padding, gap, corners and height, as the anatomy says them, each a variable where it names one.
    const root = c?.anatomy?.root ?? {};
    const binds = [];
    const bindTo = (field, ref) => { if (!ref) return; const v = varOf(ref); if (v) binds.push({ layer: '', field, variable: v }); else say(`${name} ${field}`, `${ref} is not a token the description has`); };
    bindTo('paddingTop', root.inset?.blockToken); bindTo('paddingBottom', root.inset?.blockToken);
    bindTo('paddingLeft', root.inset?.inlineToken); bindTo('paddingRight', root.inset?.inlineToken);
    bindTo('gap', root.gapToken); bindTo('radius', root.radiusToken);
    // What each variant paints with (the contract's byVariant): the frame's fill and stroke, and its text's fill.
    for (const v of c?.tokens?.byVariant ?? []) for (const p of v.paints ?? []) {
      const variable = byId.get(String(p.token))?.name ?? null;
      if (!variable) { say(`${name} ${p.field}`, `${p.token} is not a token the description has`); continue; }
      binds.push({ layer: p.text ? 'text' : '', field: p.field === 'strokes' ? 'stroke' : 'fill', variable, where: v.when ?? {} });
    }
    // Its parts: a text property's layer where the anatomy names a part of the same name, set in the text style the
    // anatomy says. Any other part is named and not built: the description says what it is called, not what it is.
    const style = varOf(root.typographyToken);
    const parts = Object.keys(c?.anatomy ?? {}).filter((k) => k !== 'root');
    const layers = [];
    // A component whose anatomy names no part and has one text property holds one text: that property's, in the
    // root's text style. Two or more, and which is which is not said.
    const texts = properties.filter((x) => x.kind === 'TEXT');
    const lone = !parts.length && texts.length === 1;
    for (const p of texts) {
      if (parts.includes(p.name) || lone) layers.push({ name: p.name, type: 'text', text: String(p.default ?? ''), property: p.name, ...(style ? { style } : {}) });
      else say(`${name} ${p.name}`, 'a text property whose layer the anatomy does not name: the property is made, with no layer to drive');
    }
    for (const part of parts.filter((x) => !layers.some((l) => l.name === x))) say(`${name} ${part}`, 'a part the anatomy names but not what it is (an icon, a frame, another component): left for a person to place');
    // What a variant paints its text with goes on its text layer, the one the description has.
    const text = layers[0]?.name ?? null;
    for (const b of binds.filter((x) => x.layer === 'text')) { if (text) b.layer = text; else say(`${name} text ${b.field}`, `${b.variable} paints a text the description builds no layer for`); }
    for (let i = binds.length - 1; i >= 0; i--) if (binds[i].layer === 'text' && !text) binds.splice(i, 1);
    for (const p of properties.filter((x) => x.kind === 'BOOLEAN')) if (!layers.some((l) => l.name === p.name)) say(`${name} ${p.name}`, 'a yes or no property whose layer is not built: made with nothing to show or hide');
    if (root.height != null && !Number.isFinite(Number(root.height))) say(`${name} height`, `${root.height} is not a number of pixels`);
    if ((root.inset || root.gapToken) && !root.direction) say(name, 'the anatomy gives padding and a gap but not the direction its parts run in: laid out across (horizontal), for a person to turn where it runs down');
    const status = Array.isArray(e.metadata?.status) ? e.metadata.status.find((s) => !s.platform)?.status : e.metadata?.status?.status;
    components.push({ name, description: e.description ?? '', ...(status ? { status } : {}), axes, properties, variants, binds, layers, ...(root.height != null && Number.isFinite(Number(root.height)) ? { height: Number(root.height) } : {}), auto: !!(root.inset || root.gapToken) });
  }
  return { system: desc.system, collections: [...collections.values()], textStyles, components, listed };
}

// ── Code ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A component as figma-ops.mjs models one, so spec-to-code.mjs writes its file the way it writes any spec's.
// → { model, listed }: what each option paints with is listed, since a spec's file sets one value a field.
export function componentModel(c) {
  const layers = {}, binds = {}, listed = [];
  for (const l of c.layers) layers[l.name] = { path: l.name, type: l.type === 'text' ? 'TEXT' : 'FRAME', text: l.text, ...(l.style ? { style: l.style } : {}), ...(l.property ? { wired: { characters: l.property } } : {}) };
  for (const b of c.binds) {
    if (b.where && Object.keys(b.where).length) { listed.push(`${c.name} ${Object.entries(b.where).map(([k, v]) => `${k}=${v}`).join(', ')}: ${b.layer ? `its ${b.layer}'s ` : ''}${b.field} is ${b.variable}, for a person to write under that option's class`); continue; }
    const k = `${b.layer}|${b.field}`;
    (binds[k] ??= []).includes(b.variable) || binds[k].push(b.variable);
  }
  return {
    model: { name: c.name, kind: 'component', description: c.description,
      axes: c.axes.map((a) => ({ name: a.name, options: a.options.map((o) => ({ name: o })), default: a.default })),
      properties: c.properties.map((p) => ({ name: p.name, kind: p.kind, default: p.default })), layers, binds, layout: { dir: 'HORIZONTAL' } },
    listed,
  };
}
// The tokens as custom properties: the first mode on :root, each other one under the selector the project gives it.
// cssVarOf(name) → the custom property the naming convention gives a variable; selectorOf(mode) → that mode's selector.
export function tokensCss(plan, { cssVarOf = (n) => `--${String(n).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`, selectorOf = () => null } = {}) {
  const listed = [];
  const blocks = new Map();
  const cssValue = (v, type) => (v.alias ? `var(${cssVarOf(v.alias)})` : type === 'COLOR' ? hexOf(v.value) : type === 'FLOAT' ? `${v.value}px` : JSON.stringify(v.value));
  for (const col of plan.collections) for (const [i, mode] of col.modes.entries()) {
    const sel = i === 0 ? ':root' : selectorOf(mode);
    if (!sel) { listed.push(`the ${mode} mode has no selector in the project (ds-config.json figma.modes cssSelector): its values are not written`); continue; }
    for (const v of col.variables) {
      const val = v.values[mode ?? ''];
      if (!val) continue;
      // A number that is no size (a weight, a ratio) has no unit.
      const text = v.type === 'FLOAT' && !/dimension/i.test(col.name) ? (val.alias ? `var(${cssVarOf(val.alias)})` : String(val.value)) : cssValue(val, v.type);
      if (!blocks.has(sel)) blocks.set(sel, []);
      blocks.get(sel).push(`  ${cssVarOf(v.name)}: ${text};`);
    }
  }
  const css = [...blocks].map(([sel, lines]) => `${sel} {\n${[...new Set(lines)].join('\n')}\n}`).join('\n\n');
  return { css: `/* ${plan.system}'s tokens, written from its description by rms-design-system-engine. */\n${css}\n`, listed: [...new Set(listed)] };
}
const hexOf = ({ r, g, b, a = 1 }) => `#${[r, g, b, ...(a < 1 ? [a] : [])].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;

// ── Figma ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The plugin script that builds the plan in the open file. Every piece is found by its name (a collection, a mode, a
// variable, a text style, a page, a component, a variant, a property, a layer) and written only where it differs from
// the plan, so the script can run again at any time. Each write records what it replaces first (figma-undo.mjs).
// → returns { made, changed, kept, missing, faults, undo, nodes: { component → node id } }
export function libraryScript(plan) {
  const slim = { collections: plan.collections, textStyles: plan.textStyles, components: plan.components.map(({ name, description, axes, properties, variants, binds, layers, height, auto }) => ({ name, description, axes, properties, variants, binds, layers, height, auto })) };
  return `// Written by rms-design-system-engine --build-library, from ${String(plan.system).replace(/[\r\n]/g, ' ')}'s description. Run it with the
// Figma MCP's use_figma only after the person said yes. Run again, it changes only what the description changed.
const plan = ${lit(slim, null, 2)};
const made = [], changed = [], kept = [], missing = [], faults = [];
${UNDO_PRELUDE}
const nodes = {};
const same = (a, b) => {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.type === 'VARIABLE_ALIAS' || b.type === 'VARIABLE_ALIAS') return a.type === b.type && a.id === b.id;
    return ['r', 'g', 'b', 'a'].every((k) => Math.abs((a[k] == null ? 1 : a[k]) - (b[k] == null ? 1 : b[k])) < 0.002);
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.001;
  return a === b;
};
// ── The variables: a collection a kind, a mode a theme, each value or the variable it points at.
const cols = await figma.variables.getLocalVariableCollectionsAsync();
let all = await figma.variables.getLocalVariablesAsync();
const byName = new Map();
for (const c of plan.collections) {
  let col = cols.find((x) => x.name === c.name);
  if (!col) {
    col = figma.variables.createVariableCollection(c.name);
    cols.push(col);
    U.remade('collection ' + c.name, 'left empty once its variables are removed: delete it in Figma\\u0027s variables if it is not wanted');
    if (c.modes[0] != null) col.renameMode(col.modes[0].modeId, c.modes[0]);
    made.push('collection ' + c.name);
  }
  for (const m of c.modes) if (m != null && !col.modes.some((x) => x.name === m)) { col.addMode(m); made.push(c.name + ' mode ' + m); }
  for (const v of c.variables) {
    let x = all.find((y) => y.name === v.name && y.variableCollectionId === col.id);
    if (!x) {
      if (all.some((y) => y.name === v.name)) { faults.push(v.name + ' is a variable of another collection in this file: left there, and not made twice'); continue; }
      x = figma.variables.createVariable(v.name, col, v.type);
      U.madeVariable(x);
      all.push(x);
      made.push('variable ' + v.name);
    } else if (x.resolvedType !== v.type) { faults.push(v.name + ' is a ' + x.resolvedType + ' in this file and a ' + v.type + ' in the description: left for a person'); continue; }
    byName.set(v.name, { x, col, v });
  }
}
// Every variable is there before any value is set, so one can point at another made in this run.
for (const { x, col, v } of byName.values()) {
  let differs = false;
  for (const m of col.modes) {
    const want = v.values[m.name] || (col.modes.length === 1 ? v.values[''] : null);
    if (!want) continue;
    let value = want.value;
    if (want.alias) { const t = byName.get(want.alias); if (!t) { missing.push(v.name + ' points at ' + want.alias); continue; } value = figma.variables.createVariableAlias(t.x); }
    if (same(x.valuesByMode[m.modeId], value)) continue;
    U.variableValue(x, m.modeId);
    x.setValueForMode(m.modeId, value);
    differs = true;
  }
  if ((v.description || '') !== (x.description || '')) { U.variableDescription(x); x.description = v.description || ''; differs = true; }
  if (differs && !made.includes('variable ' + v.name)) changed.push('variable ' + v.name);
  else if (!differs) kept.push('variable ' + v.name);
}
// ── The text styles: their size and line height, as the description gives them.
const styles = await figma.getLocalTextStylesAsync();
for (const t of plan.textStyles) {
  let st = styles.find((x) => x.name === t.name), isNew = false;
  if (!st) { st = figma.createTextStyle(); st.name = t.name; styles.push(st); U.made(st, 'text style ' + t.name); made.push('text style ' + t.name); isNew = true; }
  await figma.loadFontAsync(st.fontName);
  let differs = false;
  if (t.fontSize != null && st.fontSize !== t.fontSize) { st.fontSize = t.fontSize; differs = true; }
  if (t.lineHeight != null && !(st.lineHeight && st.lineHeight.unit === 'PIXELS' && st.lineHeight.value === t.lineHeight)) { st.lineHeight = { unit: 'PIXELS', value: t.lineHeight }; differs = true; }
  if ((t.description || '') !== (st.description || '')) { st.description = t.description || ''; differs = true; }
  if (!isNew) (differs ? changed : kept).push('text style ' + t.name);
}
// ── The components: each on a page of its own name, a variant for each combination of its options.
const named = (a) => Object.entries(a).map(([k, v]) => k + '=' + v).join(', ');
const variantsOf = (s) => (s.type === 'COMPONENT_SET' ? s.children.filter((c) => c.type === 'COMPONENT') : [s]);
const keyOf = (s, name) => Object.keys(s.componentPropertyDefinitions || {}).find((k) => k.replace(/#[^#]*$/, '') === name);
const fonts = async (n) => { if (n.type !== 'TEXT') return; const f = n.fontName === figma.mixed ? n.getRangeAllFontNames(0, n.characters.length) : [n.fontName]; for (const x of f) await figma.loadFontAsync(x); };
const FIELDS = { gap: ['itemSpacing'], radius: ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] };
const bound = (l, f) => ((l.boundVariables || {})[f] || {}).id;
const bindOne = async (l, field, v) => {
  if (field === 'fill' || field === 'stroke') {
    const k = field === 'fill' ? 'fills' : 'strokes';
    const ps = Array.isArray(l[k]) && l[k].length ? l[k] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    if (ps[0].type === 'SOLID' && ((ps[0].boundVariables || {}).color || {}).id === v.id) return false;
    U.paints(l, k);
    l[k] = ps.map((p, i) => (i === 0 && p.type === 'SOLID' ? figma.variables.setBoundVariableForPaint(p, 'color', v) : p));
    return true;
  }
  const fs = FIELDS[field] || [field];
  if (fs.every((f) => bound(l, f) === v.id)) return false;
  await fonts(l);
  for (const f of fs) { U.boundVariable(l, f); l.setBoundVariable(f, v); }
  return true;
};
const newVariant = (name) => {
  const c = figma.createComponent();
  c.name = name; c.layoutMode = 'HORIZONTAL'; c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO'; c.fills = [];
  return c;
};
for (const p of await figma.root.children) if (p.loadAsync) await p.loadAsync();
for (const c of plan.components) {
  let page = figma.root.children.find((p) => p.name === c.name);
  if (!page) { page = figma.createPage(); page.name = c.name; U.made(page, 'page ' + c.name); made.push('page ' + c.name); }
  let set = page.children.find((n) => n.name === c.name && (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT'));
  let first = false;
  const many = c.axes.length > 0;
  if (!set) {
    const comps = c.variants.map((a) => newVariant(many ? named(a) : c.name));
    set = many ? figma.combineAsVariants(comps, page) : comps[0];
    if (!many) page.appendChild(set);
    set.name = c.name; set.x = 0; set.y = 0;
    U.made(set, c.name);
    first = true;
    made.push(c.name + ' (' + comps.length + ' variant' + (comps.length === 1 ? '' : 's') + ')');
  } else if (many && set.type === 'COMPONENT_SET') {
    let y = Math.max(0, ...set.children.map((v) => v.y + v.height)) + 40, x = 0;
    for (const a of c.variants) {
      if (variantsOf(set).some((v) => v.name === named(a))) continue;
      const v = newVariant(named(a)); set.appendChild(v); v.x = x; v.y = y; x += v.width + 20; U.made(v, named(a));
      changed.push(c.name + ': variant ' + named(a));
    }
  } else if (many !== (set.type === 'COMPONENT_SET')) {
    faults.push(c.name + ' is ' + (many ? 'one component in this file and has variants in the description' : 'a set of variants in this file and has none in the description') + ': left for a person'); nodes[c.name] = set.id; continue;
  }
  nodes[c.name] = set.id;
  const before = changed.length;
  if ((c.description || '') !== (set.description || '')) { U.description(set); set.description = c.description || ''; if (!first) changed.push(c.name + ': description'); }
  // Its properties: a text or a yes or no property, and its default.
  for (const p of c.properties) {
    const k = keyOf(set, p.name);
    const def = p.kind === 'BOOLEAN' ? p.default !== false && p.default !== 'false' : String(p.default == null ? '' : p.default);
    if (!k) { set.addComponentProperty(p.name, p.kind, def); U.madeProperty(set, p.name); if (!first) changed.push(c.name + ': property ' + p.name); }
    else if (set.componentPropertyDefinitions[k].defaultValue !== def) { U.propertyDefault(set, p.name, set.componentPropertyDefinitions[k].defaultValue); set.editComponentProperty(k, { defaultValue: def }); if (!first) changed.push(c.name + ': ' + p.name + ' unless set'); }
  }
  for (const v of variantsOf(set)) {
    // Its frame: laid out, of the height the anatomy gives.
    if (c.auto && (!v.layoutMode || v.layoutMode === 'NONE')) { v.layoutMode = 'HORIZONTAL'; v.primaryAxisSizingMode = 'AUTO'; v.counterAxisSizingMode = 'AUTO'; if (!first) changed.push(c.name + ': ' + v.name + ' laid out'); }
    if (c.height != null && v.height !== c.height) { U.resize(v); v.counterAxisSizingMode = 'FIXED'; v.resize(v.width, c.height); if (!first) changed.push(c.name + ': ' + v.name + ' ' + c.height + 'px high'); }
    // Its text layers, each driven by its property and set in its text style.
    for (const l of c.layers) {
      let t = (v.children || []).find((n) => n.name === l.name);
      if (!t) {
        t = figma.createText();
        const st = l.style ? styles.find((s) => s.name === l.style) : null;
        await figma.loadFontAsync(st ? st.fontName : t.fontName);
        if (st) await t.setTextStyleIdAsync(st.id);
        t.characters = l.text || l.name; t.name = l.name;
        v.appendChild(t); U.made(t, c.name + ' ' + l.name);
        if (!first) changed.push(c.name + ': ' + v.name + ' layer ' + l.name);
      }
      const k = l.property ? keyOf(set, l.property) : null;
      if (k && (t.componentPropertyReferences || {}).characters !== k) { await fonts(t); U.propertyRefs(t); t.componentPropertyReferences = { ...(t.componentPropertyReferences || {}), characters: k }; }
    }
  }
  // The variables its frames and texts are bound to, in each variant or those the description names.
  for (const b of c.binds) {
    const v = byName.get(b.variable);
    if (!v) { missing.push(c.name + ' ' + b.field + ': no variable ' + b.variable); continue; }
    for (const x of variantsOf(set)) {
      const axes = Object.fromEntries(String(x.name).split(/,\\s*/).map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2));
      if (b.where && !Object.entries(b.where).every(([k, y]) => axes[k] === y)) continue;
      const l = b.layer ? (x.children || []).find((n) => n.name === b.layer) : x;
      if (!l) continue;
      if (await bindOne(l, b.field, v.x) && !first) changed.push(c.name + ': ' + x.name + ' ' + (b.layer ? b.layer + ' ' : '') + b.field + ' → ' + b.variable);
    }
  }
  if (set.type === 'COMPONENT_SET') {
    let w = 0, h = 0; for (const v of set.children) { w = Math.max(w, v.x + v.width); h = Math.max(h, v.y + v.height); }
    if (set.width < w + 20 || set.height < h + 20) { U.resize(set); set.resizeWithoutConstraints(Math.max(set.width, w + 20), Math.max(set.height, h + 20)); }
  }
  if (!first && changed.length === before) kept.push(c.name);
}
return { made, changed, kept, missing, faults, undo, nodes };
`;
}
