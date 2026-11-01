// figma-cli-import.mjs - Figma read through figma-cli (github.com/silships/figma-cli) instead of the Figma MCP.
//
// figma-cli talks to Figma Desktop on the person's computer: no API key, no rate limit, and every variable comes
// with all its modes and alias chains. Its `figma-cli snapshot` writes design.json. This module turns that file into
// the engine's own snapshots, so every gate reads it unchanged:
//   • figma-vars.snapshot.json             colours per mode (aliases resolved), the alias chains, sizing, strings, booleans
//   • figma-component-props.snapshot.json  each component set's variant props, their options and default
//   • figma-structure.snapshot.json        each component's default variant: height, padding, gap, radius, the
//                                          variables bound to them, and its fill, text and stroke colours
// What design.json does not hold is kept from the snapshots already there, never erased: text styles, the variables'
// scopes and descriptions, Figma's own order of the modes (design.json sorts them by name), the other variants of a
// component, text and boolean props, descriptions and annotations. With figma-cli connected, --refresh-figma reads the
// variables, text styles and effect styles through the capture recipe's own scripts (figma-capture.mjs), so they are
// the snapshot a capture through the Figma tool gives.
//
// Pure except importFigmaCli (reads and writes files).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildStamp, mayWrite } from './stamp.mjs';
import { motionValue } from './figma-capture.mjs';

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

const isPrivate = (name) => !String(name ?? '').trim() || /^[_.]/.test(String(name).replace(/^[^A-Za-z0-9_.]+/, ''));

// The tokens an earlier chunked read kept (figmaTokens), each one design.json holds with its values and links in every
// mode taken from design.json, written as that read writes them (a size keeps the unit it had there); the rest as kept.
export function tokensFromDesign(design, tokens = []) {
  const byKey = new Map();
  for (const c of design?.variables ?? []) for (const v of c.variables ?? []) byKey.set(`${c.name}\u0000${v.name}`, v);
  const shown = (x, before, kind) => {
    if (x != null && (typeof x === 'object' || kind === 'TIMING')) { const mv = motionValue(x, kind); if (mv) return mv; }   // an easing, a timing
    if (x == null || typeof x === 'object') return undefined;   // a value it cannot write: the one kept stands
    if (typeof x === 'number') { const n = Math.round(x * 1000) / 1000, unit = /(%|px)$/.exec(String(before ?? 'px'))?.[1] ?? ''; return n + unit; }
    return typeof x === 'string' && /^#[0-9a-f]{6,8}$/i.test(x) ? x.toLowerCase() : String(x);
  };
  return tokens.map((t) => {
    if (!byKey.has(`${t.collection}\u0000${t.name}`)) return t;
    const values = {}, aliases = {};
    for (const m of Object.keys(t.values ?? {})) {
      const { value, chain } = resolveVar(byKey, t.collection, t.name, m);
      values[m] = shown(value, t.values[m], t.kind) ?? t.values[m];
      if (chain.length) aliases[m] = chain[0];
    }
    const { aliases: _, ...rest } = t;
    return { ...rest, values, ...(Object.keys(aliases).length ? { aliases } : {}) };
  });
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
  // The configured colour modes, else (none of them in the file: setup's guess before a first capture) the file's own.
  const modes = cfg.figma?.modes?.some((m) => (colourCol?.modes ?? []).includes(m.name)) ? cfg.figma.modes
    : (colourCol?.modes ?? []).map((name) => ({ name, snapshotKey: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
  const color = {}, aliases = {}, sizing = {}, strings = {}, booleans = {}, primitives = {};
  if (colourCol) {
    for (const m of modes) {
      if (!(colourCol.modes ?? []).includes(m.name)) continue;
      color[m.snapshotKey] = {}; aliases[m.snapshotKey] = {}; primitives[m.snapshotKey] = {};
      for (const v of colourCol.variables ?? []) {
        // The primitives as Figma has them in each mode (the ramp the rest points at), kept apart from the tokens.
        if (v.type === 'COLOR' && v.name.startsWith(prefix)) { const { value } = resolveVar(byKey, colourCol.name, v.name, m.name); if (typeof value === 'string') primitives[m.snapshotKey][v.name] = value.toLowerCase(); continue; }
        if (v.type !== 'COLOR' || v.name.startsWith(prefix)) continue;
        const { value, chain } = resolveVar(byKey, colourCol.name, v.name, m.name);
        color[m.snapshotKey][v.name] = typeof value === 'string' ? value.toLowerCase() : null;
        if (chain.length) aliases[m.snapshotKey][v.name] = chain;
      }
    }
  }
  const sizingCol = cfg.figma?.sizingCollection ? cols.find((c) => c.name === cfg.figma.sizingCollection) : null;
  const sizedBy = new Set();
  const otherAliases = {};   // every token other than a colour that points at another, by name: its chain
  for (const c of sizingCol ? [sizingCol] : cols.filter((x) => x !== colourCol)) {
    const base = (c.modes ?? [])[0];
    for (const v of c.variables ?? []) {
      if (v.name.startsWith(prefix)) continue;
      const { value, chain } = resolveVar(byKey, c.name, v.name, base);
      if (chain?.length) otherAliases[v.name] = chain;   // the token it points at (base/border/top → base/border/left)
      if (v.type === 'FLOAT' && typeof value === 'number') { sizing[v.name] = px(value); sizedBy.add(c.name); }
      else if (v.type === 'STRING' && value != null) strings[v.name] = String(value);
      else if (v.type === 'BOOLEAN' && value != null) booleans[v.name] = String(value);
    }
  }
  // Figma's own order of each collection's modes (Dark before Light when the file has it so), by snapshot key, so a
  // page that lists the modes lists them as Figma does.
  const keyOf = (name) => modes.find((m) => m.name === name)?.snapshotKey ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const modeOrder = Object.fromEntries(cols.filter((c) => (c.modes ?? []).length > 1).map((c) => [c === colourCol ? 'color' : c.name, c.modes.map(keyOf)]));
  // A variable that points at one no longer in the file: its alias names a collection the file has but a variable that
  // collection no longer holds (an alias into a collection the file does not have is a library's, and is left alone).
  const colNames = new Set(cols.map((c) => c.name));
  const brokenAliases = [];
  for (const c of cols) for (const v of c.variables ?? []) for (const [mode, own] of Object.entries(v.values ?? {})) {
    if (!isAlias(own)) continue;
    const targetCol = own.collection ?? c.name;
    if (colNames.has(targetCol) && !byKey.has(`${targetCol}\u0000${own.alias}`)) brokenAliases.push({ name: v.name, mode, target: own.alias });
  }
  // The collections read, by name: what setup could not know before the first capture.
  // Each variable's own collection, as Figma groups them (the style guide's Tokens page shows them so).
  const collectionOf = {};
  for (const c of cols) for (const v of c.variables ?? []) if (!v.name.startsWith(prefix) && !(v.name in collectionOf)) collectionOf[v.name] = c.name;
  const collections = { color: colourCol?.name ?? null, colorModes: colourCol?.modes ?? [], sizing: [...sizedBy], of: collectionOf };
  // Every collection with two or more modes, as the capture recipe keeps it (modeVariants): each variable whose
  // value changes with the mode, in each mode, its kind from its type. The colour collection's colours are in color.
  // The colour modes keep their snapshot keys, any other mode its name.
  const KIND = { COLOR: 'color', FLOAT: 'scalar', STRING: 'string', BOOLEAN: 'boolean' };
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const scalar = (v) => (typeof v === 'number' ? px(v) : typeof v === 'boolean' ? String(v) : typeof v === 'string' && /^#[0-9a-f]{6,8}$/i.test(v) ? v.toLowerCase() : v == null ? null : String(v));
  const configured = new Map((cfg.figma?.collections ?? []).map((c) => [c.name, c]));
  const modeVariants = {};
  for (const c of cols) {
    if ((c.modes ?? []).length < 2) continue;
    const own = configured.get(c.name);
    const keyed = c.modes.map((name) => ({ name, snapshotKey: own?.modes?.find((m) => m.name === name)?.snapshotKey ?? (c === colourCol ? keyOf(name) : slug(name)) }));
    const vars = {};
    for (const v of c.variables ?? []) {
      if (v.name.startsWith(prefix)) continue;
      const kind = KIND[v.type] ?? 'scalar';
      if (kind === 'color' && c === colourCol) continue;
      const values = {};
      const aliasOf = {};
      for (const m of keyed) { const { value, chain } = resolveVar(byKey, c.name, v.name, m.name); values[m.snapshotKey] = kind === 'color' ? (typeof value === 'string' ? value.toLowerCase() : null) : scalar(value); if (chain?.length) aliasOf[m.snapshotKey] = chain[0]; }
      if (new Set(Object.values(values).map(String)).size > 1) vars[v.name] = { kind, values, ...(Object.keys(aliasOf).length ? { aliases: aliasOf } : {}) };
    }
    if (Object.keys(vars).length) modeVariants[c.name] = { modes: keyed, vars };
  }
  return { color, aliases, sizing, strings, booleans, primitives, modeOrder, brokenAliases, collections, modeVariants, otherAliases };
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

// A state a person brings about, by any of its words (draggingOver), as the capture recipe's restingVariant has it.
const BROUGHT = ['disabled', 'error', 'invalid', 'warning', 'success', 'negative', 'positive', 'alert', 'danger', 'critical', 'selected', 'active', 'pressed', 'hover', 'hovered', 'focus', 'focused', 'done', 'completed', 'loading', 'checked', 'indeterminate', 'undetermined', 'readonly', 'open', 'expanded', 'dragging'];
const brought = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).some((w) => BROUGHT.includes(w));

// The variant a set shows at rest, the one the chunked capture reads (refresh recipe, restingVariant): the State axis's
// first value no person brings about, with Disabled and Selected false; of several, Figma's default (its first child)
// when it is one, else the first. Never the first child alone: Figma keeps a disabled or error variant first as often
// as not.
export function restingKid(node) {
  const kids = (node?.kids ?? []).filter((k) => k?.n);
  if (!kids.length) return node?.kids?.[0];
  const axes = (k) => Object.fromEntries(Object.entries(parseVariant(k.n)).map(([a, v]) => [a.toLowerCase(), v]));
  const atRest = (a) => (!('disabled' in a) || a.disabled.toLowerCase() === 'false') && (!('selected' in a) || a.selected.toLowerCase() === 'false');
  const stateKey = Object.keys(node.vp ?? {}).find((k) => k.trim().toLowerCase() === 'state');
  const values = (stateKey ? node.vp[stateKey]?.values : null) ?? [...new Set(kids.map((k) => axes(k).state).filter((s) => s != null))];
  const pick = values.find((s) => !brought(s)) ?? values[0];
  const first = pick == null ? null : String(pick).trim().toLowerCase();
  const rest = kids.filter((k) => { const a = axes(k); return (first == null || String(a.state ?? '').toLowerCase() === first) && atRest(a); });
  return rest[0] ?? kids[0];
}

// The structure the engine compares, from a component's resting variant.
export function structureFromComponent(node) {
  const v = node.t === 'COMPONENT_SET' ? restingKid(node) : node;
  if (!v) return {};
  const s = {};
  if (typeof v.h === 'number') s.h = v.h;
  const bv = v.bv ?? {};
  const tb = firstBound(bv.paddingTop) ?? firstBound(bv.paddingBottom), lr = firstBound(bv.paddingLeft) ?? firstBound(bv.paddingRight);
  if (tb || lr) s.paddingVar = { tb, lr };
  if (firstBound(bv.itemSpacing)) s.gapVar = firstBound(bv.itemSpacing);
  const radius = firstBound(bv.topLeftRadius) ?? firstBound(bv.cornerRadius);
  if (radius) s.innerRadiusVar = radius;
  // A hidden stroke paint (a weight left on with its paint turned off) draws nothing, so it is not a stroke.
  s.strokeOnDefault = Array.isArray(v.strokes) && v.strokes.some((p) => p?.visible !== false);
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
  const vars = { ...prevVars, _updated: now, _source: source, _modeOrder: t.modeOrder, _collections: t.collections, color: t.color, aliases: t.aliases, otherAliases: t.otherAliases, brokenAliases: t.brokenAliases, sizing: t.sizing, modeVariants: t.modeVariants,
    strings: { ...(prevVars.strings ?? {}), ...t.strings }, booleans: { ...(prevVars.booleans ?? {}), ...t.booleans } };
  for (const k of ['typography', 'breakpoints', 'animation']) vars[k] = prevVars[k] ?? {};
  // Figma's own tokens an earlier chunked read kept (figmaTokens): each one design.json holds takes its values and
  // links in every mode from it, the fresher read, so a switch turned on since then (a link replaced by true) shows.
  if (prevVars.figmaTokens?.tokens?.length) vars.figmaTokens = { ...prevVars.figmaTokens, tokens: tokensFromDesign(design, prevVars.figmaTokens.tokens) };
  // The primitives Figma gives now, else those an earlier capture kept.
  vars.primitives = Object.values(t.primitives ?? {}).some((m) => Object.keys(m).length) ? t.primitives : prevVars.primitives ?? {};
  // A name with nothing in it, or starting with _ or . (a status mark in front or not: 🟡 .tableRow), is private to the
  // file, not part of the system, as the chunked read has it; one an earlier import kept is dropped.
  const own = ([name]) => name.startsWith('_') || !isPrivate(name);
  const props = { ...Object.fromEntries(Object.entries(existing.props ?? {}).filter(own)), _updated: now, _source: source };
  const prevStruct = existing.structure ?? {};
  const components = Object.fromEntries(Object.entries(prevStruct.components ?? {}).filter(own));
  const names = [];
  for (const node of componentNodes(design)) {
    const name = node.n;
    if (isPrivate(name)) continue;
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

// When design.json read Figma: its extractedAt, and when that is a day with no time, the time the file was written
// that day (within a day of it, so a time zone never moves it to another).
export function readAt(extractedAt, file, mtime = (f) => { try { return statSync(f).mtime; } catch { return null; } }) {
  if (!extractedAt) return null;
  const day = new Date(extractedAt);
  if (Number.isNaN(day.getTime())) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(extractedAt).trim())) return day.toISOString();
  const written = mtime(file);
  return written && Math.abs(written.getTime() - day.getTime()) < 2 * 86400000 ? written.toISOString() : day.toISOString();
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
  // What they were read from: when Figma was read; a snapshot read later than this design.json stays. figma-cli
  // records the day alone (extractedAt "2026-10-20", midnight once parsed), so a snapshot it made that afternoon read
  // as older than one read that morning: the time the file was written, when it is on that day, says when.
  const stamp = buildStamp(ROOT, { figma: null, figmaRead: readAt(design.meta?.extractedAt, abs) ?? out.vars._updated });
  const kept = [];
  for (const k of ['vars', 'props', 'structure']) {
    const may = mayWrite(join(ROOT, paths[k]), stamp, { ROOT, label: paths[k] });
    if (!may.ok) { kept.push(may.line); continue; }
    mkdirSync(dirname(join(ROOT, paths[k])), { recursive: true });
    writeFileSync(join(ROOT, paths[k]), JSON.stringify({ ...out[k], _built: stamp }, null, 2) + '\n');
  }
  return { counts: out.counts, paths, ...(kept.length ? { kept } : {}) };
}
