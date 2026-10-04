// figma-cli-import.mjs - Figma read through figma-cli (github.com/silships/figma-cli) instead of the Figma MCP.
//
// figma-cli talks to Figma Desktop on the person's computer: no API key, no rate limit, and every variable comes
// with all its modes and alias chains. Its `figma-cli snapshot` writes design.json. This module turns that file into
// the engine's own snapshots, so every gate reads it unchanged:
//   • figma-vars.snapshot.json             colours per mode (aliases resolved), the alias chains, sizing, strings, booleans
//   • figma-component-props.snapshot.json  each component set's variant props, their options and default
//   • figma-structure.snapshot.json        each component's default variant: height, padding, gap, radius, the
//                                          variables bound to them, and its fill, text and stroke colours
// What design.json does not hold is kept from the snapshots already there, never erased: text styles, the other
// variants of a component, text and boolean props, descriptions and annotations. Those still come from a capture
// through the Figma MCP.
//
// Pure except importFigmaCli (reads and writes files).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const FIGMA_CLI_FORMAT = 2;   // design.json `version` this reader knows

const isAlias = (v) => v && typeof v === 'object' && 'alias' in v;
const px = (n) => `${Math.round(n * 1000) / 1000}px`;
// figma-cli binds `collection:name`; the engine keys a token by its Figma name alone.
const tokenName = (bound) => (typeof bound === 'string' && bound !== '?' ? bound.replace(/^[^:]*:/, '') : null);
const firstBound = (v) => tokenName(Array.isArray(v) ? v[0] : v);

// A variable's value in a mode, following aliases (by name and collection) to the end. Returns { value, chain }.
function resolveVar(byKey, col, name, mode, depth = 0) {
  const v = byKey.get(`${col}\u0000${name}`);
  if (!v || depth > 10) return { value: null, chain: [] };
  const own = v.values?.[mode] ?? Object.values(v.values ?? {})[0];
  if (!isAlias(own)) return { value: own ?? null, chain: [] };
  const targetCol = own.collection ?? col;
  const target = byKey.get(`${targetCol}\u0000${own.alias}`);
  // An alias into a collection with other modes reads that collection's own mode of the same name, else its first.
  const targetMode = target && Object.prototype.hasOwnProperty.call(target.values ?? {}, mode) ? mode : Object.keys(target?.values ?? {})[0];
  const next = resolveVar(byKey, targetCol, own.alias, targetMode, depth + 1);
  return { value: next.value, chain: [own.alias, ...next.chain] };
}

// design.json → the vars snapshot's token keys. cfg: ds-config.json (figma.modes, colorCollection, sizingCollection,
// primitivePrefix), read the way the MCP capture reads them.
export function varsFromDesign(design, cfg = {}) {
  const cols = design?.variables ?? [];
  const byKey = new Map();
  for (const c of cols) for (const v of c.variables ?? []) byKey.set(`${c.name}\u0000${v.name}`, v);
  const prefix = cfg.figma?.primitivePrefix ?? 'primitives/';
  const colourCol = cols.find((c) => c.name === (cfg.figma?.colorCollection ?? 'Color'))
    ?? cols.find((c) => (c.variables ?? []).some((v) => v.type === 'COLOR') && (c.modes ?? []).length > 1)
    ?? cols.find((c) => (c.variables ?? []).some((v) => v.type === 'COLOR'));
  const modes = cfg.figma?.modes?.length ? cfg.figma.modes
    : (colourCol?.modes ?? []).map((name) => ({ name, snapshotKey: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
  const color = {}, aliases = {}, sizing = {}, strings = {}, booleans = {};
  if (colourCol) {
    for (const m of modes) {
      if (!(colourCol.modes ?? []).includes(m.name)) continue;
      color[m.snapshotKey] = {}; aliases[m.snapshotKey] = {};
      for (const v of colourCol.variables ?? []) {
        if (v.type !== 'COLOR' || v.name.startsWith(prefix)) continue;
        const { value, chain } = resolveVar(byKey, colourCol.name, v.name, m.name);
        color[m.snapshotKey][v.name] = typeof value === 'string' ? value.toLowerCase() : null;
        if (chain.length) aliases[m.snapshotKey][v.name] = chain;
      }
    }
  }
  const sizingCol = cfg.figma?.sizingCollection ? cols.find((c) => c.name === cfg.figma.sizingCollection) : null;
  for (const c of sizingCol ? [sizingCol] : cols.filter((x) => x !== colourCol)) {
    const base = (c.modes ?? [])[0];
    for (const v of c.variables ?? []) {
      if (v.name.startsWith(prefix)) continue;
      const { value } = resolveVar(byKey, c.name, v.name, base);
      if (v.type === 'FLOAT' && typeof value === 'number') sizing[v.name] = px(value);
      else if (v.type === 'STRING' && value != null) strings[v.name] = String(value);
      else if (v.type === 'BOOLEAN' && value != null) booleans[v.name] = String(value);
    }
  }
  // Figma's own order of each collection's modes (Dark before Light when the file has it so), by snapshot key, so a
  // page that lists the modes lists them as Figma does.
  const keyOf = (name) => modes.find((m) => m.name === name)?.snapshotKey ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const modeOrder = Object.fromEntries(cols.filter((c) => (c.modes ?? []).length > 1).map((c) => [c === colourCol ? 'color' : c.name, c.modes.map(keyOf)]));
  return { color, aliases, sizing, strings, booleans, modeOrder };
}

// Every component set (and lone component) in design.json's page trees.
export function componentNodes(design) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.t === 'COMPONENT_SET') { out.push(n); return; }
    if (n.t === 'COMPONENT') { out.push(n); return; }
    for (const k of n.kids ?? []) walk(k);
  };
  for (const p of design?.pages ?? []) for (const f of p.frames ?? []) walk(f);
  return out;
}

const parseVariant = (name) => Object.fromEntries(String(name ?? '').split(/,\s*/).filter((s) => s.includes('=')).map((s) => s.split('=').map((x) => x.trim())));

// The variant props of a component set: { Size: { type: 'VARIANT', defaultValue, variantOptions } }. The default is
// the variant design.json walked (the set's first child, the one Figma shows first).
export function propsFromComponent(node) {
  if (node.t !== 'COMPONENT_SET' || !node.vp) return {};
  const first = parseVariant(node.kids?.[0]?.n);
  const out = {};
  for (const [prop, def] of Object.entries(node.vp)) {
    const options = def?.values ?? [];
    out[prop] = { type: 'VARIANT', defaultValue: first[prop] ?? options[0] ?? null, variantOptions: options };
  }
  return out;
}

// One colour: the variable bound to it, else its raw value (the engine names a raw value as Figma's own).
function colourOf(node, kind) {
  const bound = firstBound(node.bv?.[kind]);
  if (bound) return { token: bound };
  const raw = (node[kind] ?? []).find((p) => /^#[0-9a-f]{6}/i.test(p));
  return raw ? { hex: raw.slice(0, 7).toLowerCase() } : null;
}

// The structure the engine compares, from a component's default variant.
export function structureFromComponent(node) {
  const v = node.t === 'COMPONENT_SET' ? node.kids?.[0] : node;
  if (!v) return {};
  const s = {};
  if (typeof v.h === 'number') s.h = v.h;
  const bv = v.bv ?? {};
  const tb = firstBound(bv.paddingTop) ?? firstBound(bv.paddingBottom), lr = firstBound(bv.paddingLeft) ?? firstBound(bv.paddingRight);
  if (tb || lr) s.paddingVar = { tb, lr };
  if (firstBound(bv.itemSpacing)) s.gapVar = firstBound(bv.itemSpacing);
  const radius = firstBound(bv.topLeftRadius) ?? firstBound(bv.cornerRadius);
  if (radius) s.innerRadiusVar = radius;
  s.strokeOnDefault = Array.isArray(v.strokes) && v.strokes.length > 0;
  const colors = {};
  const fill = colourOf(v, 'fills'); if (fill) colors.fill = fill;
  if (s.strokeOnDefault) { const stroke = colourOf(v, 'strokes'); if (stroke) colors.stroke = stroke; }
  const text = (function find(n) { if (n?.t === 'TEXT') return n; for (const k of n?.kids ?? []) { const t = find(k); if (t) return t; } return null; })(v);
  if (text) { const t = colourOf(text, 'fills'); if (t) colors.text = t; }
  if (Object.keys(colors).length) s.colors = colors;
  if (node.t === 'COMPONENT_SET' && v.n) s.defaultVariant = v.n;
  return s;
}

// Merge design.json into the three snapshots. Returns { vars, props, structure, counts }.
export function snapshotsFromDesign(design, cfg = {}, existing = {}, now = new Date().toISOString()) {
  if (design?.version !== FIGMA_CLI_FORMAT) throw new Error(`design.json format v${design?.version ?? '?'}; this engine reads v${FIGMA_CLI_FORMAT}. Update figma-cli or the engine, then run figma-cli snapshot again.`);
  const source = `figma-cli design.json${design.meta?.file ? ` (${design.meta.file})` : ''}`;
  const t = varsFromDesign(design, cfg);
  const prevVars = existing.vars ?? {};
  const vars = { ...prevVars, _updated: now, _source: source, _modeOrder: t.modeOrder, color: t.color, aliases: t.aliases, sizing: t.sizing,
    strings: { ...(prevVars.strings ?? {}), ...t.strings }, booleans: { ...(prevVars.booleans ?? {}), ...t.booleans } };
  for (const k of ['typography', 'breakpoints', 'animation', 'primitives']) vars[k] = prevVars[k] ?? {};
  const props = { ...(existing.props ?? {}), _updated: now, _source: source };
  const prevStruct = existing.structure ?? {};
  const components = { ...(prevStruct.components ?? {}) };
  const names = [];
  for (const node of componentNodes(design)) {
    const name = node.n;
    if (!name || name.startsWith('_') || name.startsWith('.')) continue;   // private components are not part of the system
    names.push(name);
    const p = propsFromComponent(node);
    const prevProps = props[name]?.properties ?? {};
    // Variant props are replaced; text and boolean props design.json does not hold are kept.
    const kept = Object.fromEntries(Object.entries(prevProps).filter(([, d]) => d?.type !== 'VARIANT'));
    props[name] = { ...(props[name] ?? {}), properties: { ...kept, ...p } };
    components[name] = { ...(components[name] ?? {}), ...structureFromComponent(node) };
  }
  const structure = { ...prevStruct, _updated: now, _source: source, components };
  const colourCount = Object.values(t.color).reduce((n, m) => n + Object.keys(m).length, 0);
  return { vars, props, structure, counts: { modes: Object.keys(t.color).length, colours: colourCount, sizing: Object.keys(t.sizing).length, components: names.length } };
}

// Read design.json, write the snapshots at the paths ds-config.json names. Returns the counts and the paths written.
export function importFigmaCli(ROOT, cfg = {}, file = 'design.json') {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) throw new Error(`${file} not found. Make it on a computer with Figma Desktop open: figma-cli snapshot`);
  const design = JSON.parse(readFileSync(abs, 'utf8'));
  const paths = {
    vars: cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json',
    props: cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json',
    structure: cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json',
  };
  const read = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return undefined; } };
  const out = snapshotsFromDesign(design, cfg, { vars: read(paths.vars), props: read(paths.props), structure: read(paths.structure) });
  for (const k of ['vars', 'props', 'structure']) {
    mkdirSync(dirname(join(ROOT, paths[k])), { recursive: true });
    writeFileSync(join(ROOT, paths[k]), JSON.stringify(out[k], null, 2) + '\n');
  }
  return { counts: out.counts, paths };
}
