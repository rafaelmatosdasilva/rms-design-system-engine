// token-exports.mjs - the same tokens, in the shape a team's own pipeline reads.
//
// The engine writes its tokens once, as a W3C DTCG dictionary (contract-gen.mjs): groups nested by dot-path, each
// leaf a $type and a $value, every other mode under $extensions. A team whose pipeline is built on Style Dictionary
// or Tokens Studio reads neither directly and converts it by hand, which goes stale on the first change.
//
// Every format is written from that one dictionary and nothing else, so there is one model and several views of it:
//
//   fromVariables(allVars)   → the dictionary itself, from the style guide's list of Figma's variables (every
//                              collection, every mode, each alias as a reference): what its Download tokens saves
//   styleDictionary(tokens)  → its own nested JSON: `value`, `type`, `comment` - the same tree without the $
//   tokensStudio(tokens)     → a set per collection, a set per other mode holding what differs in it, and a theme
//                              per mode choosing them (Tokens Studio's own way of keeping modes)
//   wordpressTheme(tokens)   → a WordPress theme.json: colours, font sizes, font families and spacing in its presets,
//                              everything else under settings.custom
//
// What neither invents: a value the dictionary does not hold. A type the engine does not emit has no mapping here
// and the token keeps its own word rather than being guessed into one of theirs - a wrong type silently changes what
// a pipeline builds, where an unknown one stops it and asks.
//
// Modes: the dictionary keeps every mode under $extensions (com.rms.design-system-engine.modes). Tokens Studio carries
// them as sets and themes. Style Dictionary and WordPress have no place for them: there the first mode is written, and
// the count of tokens with another is said, so a team reading dark values knows those files do not carry them.

// Tokens Studio names its types its own way, and only the three the engine emits are mapped (`color`, `dimension`,
// `typography`). A dimension is `sizing` there unless the group it sits in says otherwise - spacing and radius are
// its own types, and a pipeline given `sizing` for a radius builds the wrong thing.
import { tokenText, colorValue, dimensionValue, DTCG_VERSION } from './dtcg.mjs';

// The engine's own place in a token's $extensions (contract-gen.mjs writes the same).
export const NS = 'com.rms.design-system-engine';
const ext = (leaf) => (leaf?.$extensions && leaf.$extensions[NS]) || {};

const STUDIO_BY_GROUP = [[/^spacing(\.|$)/, 'spacing'], [/^(radius|corner|borderRadius)(\.|$)/, 'borderRadius'],
  [/^(border|stroke)(\.|$)/, 'borderWidth'], [/^(breakpoint|screen)(\.|$)/, 'sizing'], [/^opacity(\.|$)/, 'opacity']];
const STUDIO_TYPE = { color: 'color', typography: 'typography', fontFamily: 'fontFamilies', fontWeight: 'fontWeights', number: 'number' };
export function studioType(dtcgType, path = '') {
  if (STUDIO_TYPE[dtcgType]) return STUDIO_TYPE[dtcgType];
  if (dtcgType === 'dimension') return STUDIO_BY_GROUP.find(([re]) => re.test(path))?.[1] ?? 'sizing';
  return dtcgType ?? null;   // one the engine does not emit: its own word, never a guess at theirs
}

const isLeaf = (v) => v && typeof v === 'object' && '$value' in v;
const isGroup = (v) => v && typeof v === 'object' && !Array.isArray(v) && !('$value' in v);

// Walk the dictionary, leaf by leaf, with the dot-path each sits at. $-prefixed keys are the format's own
// ($description on a group, $extensions), never a token.
export function* leaves(tokens = {}, path = []) {
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('$')) continue;
    if (isLeaf(value)) yield { path: [...path, key], leaf: value };
    else if (isGroup(value)) yield* leaves(value, [...path, key]);
  }
}

const setDeep = (root, path, leaf) => { let at = root; for (const k of path.slice(0, -1)) at = (at[k] ??= {}); at[path.at(-1)] = leaf; };

// Style Dictionary's own JSON: the same tree, `value` and `type` without the $, and a description as `comment`,
// which is the word it has always used.
export function styleDictionary(tokens = {}) {
  const out = {};
  for (const { path, leaf } of leaves(tokens)) {
    setDeep(out, path, { value: tokenText(leaf.$value), ...(leaf.$type ? { type: leaf.$type } : {}),
      ...(leaf.$description ? { comment: leaf.$description } : {}),
      ...(leaf.$deprecated ? { deprecated: leaf.$deprecated } : {}) });
  }
  return out;
}

// A leaf's value in each mode, by the mode's name (none when it has one value). The first is its $value.
export function modesOf(leaf) {
  const m = ext(leaf).modes;
  return m && typeof m === 'object' && Object.keys(m).length > 1 ? m : null;
}
const sameValue = (a, b) => JSON.stringify(tokenText(a)) === JSON.stringify(tokenText(b));

// Tokens Studio: a set per collection (the dictionary's own `set` when a token names none), nested as the dictionary
// nests, each leaf its `value` and its `type`. A collection with modes has its first mode in its own set, and a set
// for each other mode holding only the tokens whose value differs in it ("Theme/Dark"); a theme per mode chooses them,
// grouped by the collection, which is how Tokens Studio itself keeps Figma's modes. Every set is named, because the
// format keeps sets by name and a file with none is read as having lost it.
export function tokensStudio(tokens = {}, { set = 'global' } = {}) {
  const sets = new Map(), cols = [], modesIn = new Map();
  const into = (name, path, leaf) => { if (!sets.has(name)) sets.set(name, {}); setDeep(sets.get(name), path, leaf); };
  for (const { path, leaf } of leaves(tokens)) {
    const col = ext(leaf).collection || set;
    if (!cols.includes(col)) cols.push(col);
    const type = studioType(leaf.$type, path.join('.'));
    const one = (v) => ({ value: tokenText(v), ...(type ? { type } : {}), ...(leaf.$description ? { description: leaf.$description } : {}) });
    into(col, path, one(leaf.$value));
    const modes = modesOf(leaf);
    if (!modes) continue;
    const known = modesIn.get(col) ?? [];
    for (const n of Object.keys(modes)) if (!known.includes(n)) known.push(n);
    modesIn.set(col, known);
    for (const n of Object.keys(modes).slice(1)) if (!sameValue(modes[n], leaf.$value)) into(`${col}/${n}`, path, one(modes[n]));
  }
  // Each collection's set, then its modes' sets in its modes' order: a later set is laid over an earlier one.
  const order = cols.flatMap((col) => [col, ...(modesIn.get(col) ?? []).map((n) => `${col}/${n}`).filter((x) => sets.has(x))]);
  const out = Object.fromEntries(order.map((name) => [name, sets.get(name)]));
  const themes = [...modesIn].flatMap(([col, names]) => names.map((n, i) => ({ id: `${col}-${n}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: n, group: col,
    selectedTokenSets: { [col]: 'enabled', ...(i > 0 && sets.has(`${col}/${n}`) ? { [`${col}/${n}`]: 'enabled' } : {}) } })));
  if (themes.length) out.$themes = themes;
  out.$metadata = { tokenSetOrder: order };
  return out;
}

// What it styles, as the style guide reads it (a token from Figma's variables says it), else its first group's word.
const stylesOf = (path, leaf) => ext(leaf).styles || (/^(spacing|space|gap|padding|margin)$/i.test(path[0]) ? 'spacing' : /^(radius|radii|corner)/i.test(path[0]) ? 'radius' : /^(type|typography|font|text)/i.test(path[0]) ? 'typography' : null);

// A reference ("{edge.left}") read to the value it stands for, in a mode when the token it names has that mode.
export function resolveValue(tokens, value, mode = null, depth = 0) {
  const ref = typeof value === 'string' && /^\{([^}]+)\}$/.exec(value.trim());
  if (!ref || depth > 16) return value;
  let at = tokens;
  for (const k of ref[1].split('.')) { at = at && typeof at === 'object' ? at[k] : undefined; }
  if (!at || !('$value' in at)) return value;
  const m = mode && modesOf(at)?.[mode];
  return resolveValue(tokens, m !== undefined && m !== null && mode ? m : at.$value, mode, depth + 1);
}

// WordPress's theme.json (version 3). Its presets are closed lists: a colour goes in the palette, a font size in
// fontSizes, a family in fontFamilies, a spacing in spacingSizes. What has none of those homes (a radius, a border, a
// shadow, a duration) goes under settings.custom, which WordPress writes as --wp--custom--… variables. Each preset's
// slug is the code's own variable without its dashes when the code declares one, so the names a team already uses
// carry over. theme.json has no modes: the first mode is written, and modes counts the tokens that had another.
export function wordpressTheme(tokens = {}, { name = null } = {}) {
  const palette = [], fontSizes = [], fontFamilies = [], spacingSizes = [], custom = {}, slugs = new Set();
  const slugOf = (path, leaf) => {
    const base = (ext(leaf).code ? String(ext(leaf).code).replace(/^--/, '') : path.join('-')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'token';
    let s = base, i = 2; while (slugs.has(s)) s = `${base}-${i++}`; slugs.add(s); return s;
  };
  const label = (path) => path.join(' ');
  let modes = 0;
  for (const { path, leaf } of leaves(tokens)) {
    if (modesOf(leaf)) modes++;
    const value = resolveValue(tokens, leaf.$value), text = tokenText(value), styles = stylesOf(path, leaf);
    if (leaf.$type === 'color') { palette.push({ slug: slugOf(path, leaf), color: text, name: label(path) }); continue; }
    if (leaf.$type === 'typography' && value && typeof value === 'object') {
      if (value.fontSize != null) fontSizes.push({ slug: slugOf(path, leaf), size: tokenText(value.fontSize), name: label(path) });
      if (value.fontFamily) { const fam = Array.isArray(value.fontFamily) ? value.fontFamily.join(', ') : String(value.fontFamily); if (!fontFamilies.some((f) => f.fontFamily === fam)) fontFamilies.push({ slug: slugOf([fam], {}), fontFamily: fam, name: String(fam).split(',')[0].trim() }); }
      continue;
    }
    if (leaf.$type === 'fontFamily') { const fam = Array.isArray(text) ? text.join(', ') : String(text); fontFamilies.push({ slug: slugOf(path, leaf), fontFamily: fam, name: label(path) }); continue; }
    if (leaf.$type === 'dimension' && styles === 'spacing') { spacingSizes.push({ slug: slugOf(path, leaf), size: text, name: label(path) }); continue; }
    if (leaf.$type === 'dimension' && styles === 'typography' && /size/i.test(path.join(' '))) { fontSizes.push({ slug: slugOf(path, leaf), size: text, name: label(path) }); continue; }
    setDeep(custom, path, typeof text === 'object' && text !== null ? JSON.stringify(text) : text);
  }
  const settings = {};
  if (palette.length) settings.color = { palette };
  if (fontSizes.length || fontFamilies.length) settings.typography = { ...(fontFamilies.length ? { fontFamilies } : {}), ...(fontSizes.length ? { fontSizes } : {}) };
  if (spacingSizes.length) settings.spacing = { spacingSizes };
  if (Object.keys(custom).length) settings.custom = custom;
  return { theme: { $schema: 'https://schemas.wp.org/trunk/theme.json', version: 3, ...(name ? { title: name } : {}), settings }, modes };
}

// The dictionary from the style guide's list of Figma's variables (styleguide-data.mjs allVariables): each token at its
// Figma name's path, its value in DTCG's official shape (dtcg.mjs), an alias as the standard reference to the token it
// points at, every mode of its collection under $extensions with the collection, what it styles and the code's
// variable. A value DTCG has no type for (a word, a yes or no) is kept as it is with no $type, never typed by a guess.
// Two tokens at one path (a leaf and a group, or the same name in two collections) cannot both be written: the second
// is left out and named in dropped, never lost in silence.
export function fromVariables(allVars = [], { name = null } = {}) {
  const pathOf = (n) => String(n).split('/').map((x) => x.trim()).filter(Boolean);
  const names = new Set(allVars.map((v) => v.figma));
  const out = { $description: `${name ? `${name} tokens` : 'Design-system tokens'} (W3C DTCG ${DTCG_VERSION}), from Figma's variables.` };
  const dropped = [];
  const typed = (v, raw) => {
    const s = String(raw ?? '').trim(), n = String(v.figma).toLowerCase(), type = v.type;
    if (raw === true || raw === false || /^(true|false)$/i.test(s)) return { value: /^true$/i.test(s) };
    if (type === 'colour' || /^(#[0-9a-f]{3,8}|rgba?\(.+\)|transparent)$/i.test(s)) { const c = colorValue(s); return typeof c === 'object' ? { $type: 'color', value: c } : { value: s }; }
    if (/cubic-bezier\(/i.test(s)) { const p = s.match(/-?[\d.]+/g)?.map(Number); return p?.length === 4 ? { $type: 'cubicBezier', value: p } : { value: s }; }
    if (/^-?[\d.]+m?s$/i.test(s) || (type === 'motion' && /duration|delay/.test(n) && /^-?[\d.]+$/.test(s))) { const m = /^(-?[\d.]+)(m?s)?$/i.exec(s); return { $type: 'duration', value: { value: Number(m[1]), unit: (m[2] || 'ms').toLowerCase() } }; }
    if (/^-?[\d.]+(px|rem)?$/i.test(s) || typeof raw === 'number') {
      if (type === 'typography' && /weight/.test(n)) return { $type: 'fontWeight', value: Number(parseFloat(s)) };
      if (/px|rem/i.test(s) || ['spacing', 'radius', 'border', 'size', 'shadow'].includes(type) || (type === 'typography' && !/line-?height|weight/.test(n))) return { $type: 'dimension', value: dimensionValue(s) };
      return { $type: 'number', value: Number(s) };
    }
    if (/family|^font$|\/font$/.test(n)) return { $type: 'fontFamily', value: s };
    return { value: s };
  };
  for (const v of allVars) {
    const path = pathOf(v.figma);
    if (!path.length) continue;
    const modes = (v.modes ?? []).length ? v.modes : ['Value'];
    const per = modes.map((m, i) => {
      const target = v.aliases?.[i];
      if (target && names.has(target) && target !== v.figma) return { ref: `{${pathOf(target).join('.')}}`, ...typed(v, v.values?.[i]) };
      return typed(v, v.values?.[i]);
    }).map((x, i) => ({ ...x, mode: modes[i], raw: v.values?.[i] }));
    const known = per.filter((x) => x.raw !== null && x.raw !== undefined);
    if (!known.length) continue;
    const valueOf = (x) => x.ref ?? x.value, first = known[0];
    const leaf = { ...(first.$type ? { $type: first.$type } : {}), $value: valueOf(first) };
    if (v.description) leaf.$description = v.description;
    const mine = { ...(v.collection ? { collection: v.collection } : {}), ...(v.type ? { styles: v.type } : {}), ...(v.var ? { code: v.var } : {}) };
    if (known.length > 1 && known.some((x) => !sameValue(valueOf(x), valueOf(first)))) mine.modes = Object.fromEntries(known.map((x) => [x.mode, valueOf(x)]));
    if (Object.keys(mine).length) leaf.$extensions = { [NS]: mine };
    let at = out, ok = true;
    for (const k of path.slice(0, -1)) { if (at[k] == null) at[k] = {}; else if (typeof at[k] !== 'object' || '$value' in at[k]) { ok = false; break; } at = at[k]; }
    if (!ok || at[path.at(-1)] !== undefined) { dropped.push(v.figma); continue; }
    at[path.at(-1)] = leaf;
  }
  return { tokens: out, dropped };
}

// How many tokens carry a mode the one-mode formats do not: said by the run, never left for somebody to notice.
export const withOtherModes = (tokens = {}) => [...leaves(tokens)].filter(({ leaf }) => modesOf(leaf)).length;

export function exportLines({ styleDictionaryFile = null, tokensStudioFile = null, count = 0, modes = 0 } = {}) {
  const out = [];
  if (styleDictionaryFile) out.push(`🎨 ${count} token${count === 1 ? '' : 's'} for Style Dictionary → ${styleDictionaryFile}`);
  if (tokensStudioFile) out.push(`🎨 ${count} token${count === 1 ? '' : 's'} for Tokens Studio → ${tokensStudioFile}${modes ? ', every mode a set of its own' : ''}`);
  if (styleDictionaryFile && modes) out.push(`   ${modes} of them have a value in another mode, which Style Dictionary's file does not carry: those stay in tokens.json`);
  return out;
}
