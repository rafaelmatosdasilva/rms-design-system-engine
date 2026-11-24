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
//   wordpressTheme(tokens)   → a WordPress theme.json: colours, font sizes, font families, spacing, radii and
//                              shadows in its presets, everything else under settings.custom
//   wordpressFiles(tokens)   → that theme.json and a style variation per other mode (styles/<mode>.json)
//   mergeTheme(theirs, ours) → a theme's own theme.json with the system's presets in it, the rest of it kept
//
// What neither invents: a value the dictionary does not hold. A type the engine does not emit has no mapping here
// and the token keeps its own word rather than being guessed into one of theirs - a wrong type silently changes what
// a pipeline builds, where an unknown one stops it and asks.
//
// Modes: the dictionary keeps every mode under $extensions (com.rms.design-system-engine.modes). Tokens Studio carries
// them as sets and themes. WordPress carries a look a site switches to (Dark) as a style variation, and screen widths as
// fluid font sizes. Style Dictionary has no place for them: there the first mode is written, and the count of tokens
// with another is said, so a team reading dark values knows that file does not carry them.

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

// Screen widths, narrowest first: the words the Tokens page sorts a collection's modes by (10-tokens.js TK_SCREEN).
export const SCREEN_ORDER = ['watch', 'phone', 'mobile', 'small', 'tablet', 'medium', 'laptop', 'large', 'desktop', 'wide', 'xl'];
// A token's modes when every one is a screen width (a word of SCREEN_ORDER, or a number of pixels), narrowest first.
// Those are not looks a site switches between: they are one value growing with the screen. Any other modes are null.
export function screenModes(leaf) {
  const m = modesOf(leaf);
  if (!m) return null;
  const names = Object.keys(m), word = (n) => String(n).trim().toLowerCase();
  const px = (n) => { const x = /^(\d{3,4})\s*(px)?$/i.exec(String(n).trim()); return x ? Number(x[1]) : null; };
  if (names.every((n) => px(n) != null)) return [...names].sort((a, b) => px(a) - px(b));
  if (names.every((n) => SCREEN_ORDER.includes(word(n)))) return [...names].sort((a, b) => SCREEN_ORDER.indexOf(word(a)) - SCREEN_ORDER.indexOf(word(b)));
  return null;
}

export const WP_SCHEMA = 'https://schemas.wp.org/trunk/theme.json';
// theme.json's presets, each a list kept by slug: where it sits under settings, and the field that holds its value.
export const WP_PRESETS = [['color', 'palette', 'color'], ['typography', 'fontSizes', 'size'], ['typography', 'fontFamilies', 'fontFamily'],
  ['spacing', 'spacingSizes', 'size'], ['border', 'radiusSizes', 'size'], ['shadow', 'presets', 'shadow']];
const wpSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A shadow as CSS writes it: DTCG's shadow (one or a list), or a token that already holds the CSS ("0 1px 2px #0003").
const SHADOW_CSS = /^(inset\s+)?-?[\d.]+(px|rem|em)?\s+-?[\d.]+(px|rem|em)?(\s|$)/i;
function shadowCss(v) {
  if (Array.isArray(v)) return v.map(shadowCss).join(', ');
  if (!v || typeof v !== 'object') return String(v);
  return [v.inset ? 'inset' : '', v.offsetX, v.offsetY, v.blur, v.spread, v.color].filter((x) => x !== '' && x != null).map((x) => tokenText(x)).join(' ');
}

// WordPress's theme.json (version 3). Its presets are closed lists: a colour goes in the palette, a font size in
// fontSizes, a family in fontFamilies, a spacing in spacingSizes, a radius in border.radiusSizes (WordPress 6.9) and a
// shadow in shadow.presets, each of which the editor offers by name. What has none of those homes (a border, a
// duration, a number) goes under settings.custom, which WordPress writes as --wp--custom--… variables. Each preset's
// slug is the code's own variable without its dashes when the code declares one, so the names a team already uses
// carry over.
// Modes: `mode` writes every token in that mode (a token without it keeps its value, a reference reads its target in
// it), which is what a style variation holds. A font size whose modes are screen widths is written fluid, from its
// narrowest screen's value to its widest, so WordPress scales it between them, and every other font size is said not
// fluid, since fluid on would scale them all. modes counts the tokens with a value in another mode this one file still
// does not carry; screensLeft, the ones of those whose modes are screen widths (no variation carries those).
export function wordpressTheme(tokens = {}, { name = null, mode = null } = {}) {
  const palette = [], fontSizes = [], fontFamilies = [], spacingSizes = [], radiusSizes = [], shadows = [], custom = {}, slugs = new Set();
  const slugOf = (path, leaf) => {
    const base = wpSlug(ext(leaf).code ? String(ext(leaf).code).replace(/^--/, '') : path.join('-')) || 'token';
    let s = base, i = 2; while (slugs.has(s)) s = `${base}-${i++}`; slugs.add(s); return s;
  };
  const label = (path) => path.join(' ');
  const inMode = (leaf, m) => { const ms = modesOf(leaf); return resolveValue(tokens, m && ms && m in ms ? ms[m] : leaf.$value, m); };
  // A font size, fluid when its modes are screen widths and it differs between the narrowest and the widest.
  let modes = 0, screensLeft = 0, fluid = 0;
  const fontSize = (path, leaf, sizeOf) => {
    const screens = screenModes(leaf);
    const entry = { slug: slugOf(path, leaf), size: tokenText(sizeOf(inMode(leaf, mode))), name: label(path) };
    if (screens) {
      const min = tokenText(sizeOf(inMode(leaf, screens[0]))), max = tokenText(sizeOf(inMode(leaf, screens.at(-1))));
      if (min != null && max != null && min !== max) { fluid++; modes--; screensLeft--; Object.assign(entry, { size: max, fluid: { min, max } }); }
    }
    fontSizes.push(entry);
  };
  for (const { path, leaf } of leaves(tokens)) {
    if (modesOf(leaf)) { modes++; if (screenModes(leaf)) screensLeft++; }
    const value = inMode(leaf, mode), text = tokenText(value), styles = stylesOf(path, leaf);
    if (leaf.$type === 'color') { palette.push({ slug: slugOf(path, leaf), color: text, name: label(path) }); continue; }
    if (leaf.$type === 'typography' && value && typeof value === 'object') {
      if (value.fontSize != null) fontSize(path, leaf, (v) => v?.fontSize);
      if (value.fontFamily) { const fam = Array.isArray(value.fontFamily) ? value.fontFamily.join(', ') : String(value.fontFamily); if (!fontFamilies.some((f) => f.fontFamily === fam)) fontFamilies.push({ slug: slugOf([fam], {}), fontFamily: fam, name: String(fam).split(',')[0].trim() }); }
      continue;
    }
    if (leaf.$type === 'fontFamily') { const fam = Array.isArray(text) ? text.join(', ') : String(text); fontFamilies.push({ slug: slugOf(path, leaf), fontFamily: fam, name: label(path) }); continue; }
    if (leaf.$type === 'dimension' && styles === 'spacing') { spacingSizes.push({ slug: slugOf(path, leaf), size: text, name: label(path) }); continue; }
    if (leaf.$type === 'dimension' && styles === 'radius') { radiusSizes.push({ slug: slugOf(path, leaf), size: text, name: label(path) }); continue; }
    if (leaf.$type === 'dimension' && styles === 'typography' && /size/i.test(path.join(' '))) { fontSize(path, leaf, (v) => v); continue; }
    if (leaf.$type === 'shadow' || (styles === 'shadow' && typeof text === 'string' && SHADOW_CSS.test(text.trim()))) { shadows.push({ slug: slugOf(path, leaf), shadow: leaf.$type === 'shadow' ? shadowCss(value) : text.trim(), name: label(path) }); continue; }
    setDeep(custom, path, typeof text === 'object' && text !== null ? JSON.stringify(text) : text);
  }
  if (fluid) for (const f of fontSizes) if (!f.fluid) f.fluid = false;
  const settings = {};
  if (palette.length) settings.color = { palette };
  if (fontSizes.length || fontFamilies.length) settings.typography = { ...(fluid ? { fluid: true } : {}), ...(fontFamilies.length ? { fontFamilies } : {}), ...(fontSizes.length ? { fontSizes } : {}) };
  if (spacingSizes.length) settings.spacing = { spacingSizes };
  if (radiusSizes.length) settings.border = { radiusSizes };
  if (shadows.length) settings.shadow = { presets: shadows };
  if (Object.keys(custom).length) settings.custom = custom;
  return { theme: { $schema: WP_SCHEMA, version: 3, ...(name ? { title: name } : {}), settings }, modes, screensLeft, fluid };
}

// What one settings object holds that another does not: each preset list that differs, whole (a style variation's
// list replaces the theme's, so a partial one would lose the rest), and each custom value that differs, alone (custom
// is merged key by key).
function settingsThatDiffer(base = {}, other = {}) {
  const out = {};
  for (const [g, k] of WP_PRESETS) {
    if (!other[g]?.[k] || JSON.stringify(other[g][k]) === JSON.stringify(base[g]?.[k])) continue;
    (out[g] ??= {})[k] = other[g][k];
    if (g === 'typography' && other.typography.fluid) out.typography.fluid = other.typography.fluid;
  }
  const walk = (a, b, path) => {
    for (const [key, v] of Object.entries(b ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(a?.[key], v, [...path, key]);
      else if (JSON.stringify(v) !== JSON.stringify(a?.[key])) setDeep((out.custom ??= {}), [...path, key], v);
    }
  };
  walk(base.custom, other.custom, []);
  return out;
}

// Every file a WordPress theme takes from the dictionary: theme.json with each token's first mode, and a style
// variation for each other mode a site can switch to (styles/<mode>.json: Dark, High contrast, a second brand), holding
// what differs in it, which the Site Editor offers under Styles. Modes that are screen widths are no look to switch to:
// their font sizes are fluid in theme.json, and left counts the tokens whose other screens no file carries (a
// spacing that grows with the screen, which theme.json has no fluid form for).
export function wordpressFiles(tokens = {}, { name = null } = {}) {
  const one = wordpressTheme(tokens, { name });
  const names = [];
  for (const { leaf } of leaves(tokens)) {
    const m = modesOf(leaf);
    if (!m || screenModes(leaf)) continue;
    for (const n of Object.keys(m).slice(1)) if (!names.includes(n)) names.push(n);
  }
  const variations = [], used = new Set();
  for (const n of names) {
    const settings = settingsThatDiffer(one.theme.settings, wordpressTheme(tokens, { name, mode: n }).theme.settings);
    if (!Object.keys(settings).length) continue;
    const base = wpSlug(n) || 'mode';
    let slug = base, i = 2; while (used.has(slug)) slug = `${base}-${i++}`; used.add(slug);
    variations.push({ file: `styles/${slug}.json`, mode: n, theme: { $schema: WP_SCHEMA, version: 3, title: n, settings } });
  }
  return { theme: one.theme, variations, fluid: one.fluid, left: one.screensLeft };
}

// The theme's own theme.json (or style variation) with the system's presets in it, and nothing of the theme's lost:
// each preset the system has, by its slug, takes the system's value (its name, and anything else the theme gave it,
// a font's files among them, are kept), a preset the theme lacks is added, and one only the theme has stays, named in
// onlyTheirs for a person to take to Figma or remove. custom takes the system's values key by key. Everything else in
// the file (styles, templates, layout, the theme's own settings) is left as it is. Nothing is written here.
export function mergeTheme(theirs = null, ours = {}) {
  const out = theirs && typeof theirs === 'object' ? structuredClone(theirs) : {};
  const changed = [], added = [], onlyTheirs = [];
  if (!theirs) Object.assign(out, { $schema: ours.$schema ?? WP_SCHEMA, version: ours.version ?? 3, ...(ours.title ? { title: ours.title } : {}) });
  const os = ours.settings ?? {}, ts = (out.settings ??= {});
  for (const [g, k, field] of WP_PRESETS) {
    const mine = os[g]?.[k];
    if (!Array.isArray(mine) || !mine.length) continue;
    const group = (ts[g] && typeof ts[g] === 'object') ? ts[g] : (ts[g] = {});
    const list = Array.isArray(group[k]) ? group[k] : (group[k] = []);
    for (const p of mine) {
      const at = list.find((x) => x && x.slug === p.slug);
      if (!at) { list.push({ ...p }); added.push(`${k} ${p.slug}`); continue; }
      let moved = false;
      if (JSON.stringify(at[field]) !== JSON.stringify(p[field])) { at[field] = p[field]; moved = true; }
      if ('fluid' in p && JSON.stringify(at.fluid) !== JSON.stringify(p.fluid)) { at.fluid = p.fluid; moved = true; }
      if (moved) changed.push(`${k} ${p.slug}`);
    }
    for (const x of list) if (x?.slug && !mine.some((p) => p.slug === x.slug)) onlyTheirs.push(`${k} ${x.slug}`);
  }
  // Fluid turned on makes every font size scale that does not say otherwise: the theme's own keep their size.
  if (os.typography?.fluid && !ts.typography?.fluid) {
    ts.typography.fluid = os.typography.fluid;
    for (const x of ts.typography.fontSizes ?? []) if (x && !('fluid' in x)) x.fluid = false;
    changed.push('typography fluid');
  }
  const walk = (b, at, path) => {
    for (const [key, v] of Object.entries(b ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { if (!at[key] || typeof at[key] !== 'object') at[key] = {}; walk(v, at[key], [...path, key]); continue; }
      if (!(key in at)) { at[key] = v; added.push(`custom ${[...path, key].join('.')}`); }
      else if (JSON.stringify(at[key]) !== JSON.stringify(v)) { at[key] = v; changed.push(`custom ${[...path, key].join('.')}`); }
    }
  };
  if (os.custom) { if (!ts.custom || typeof ts.custom !== 'object') ts.custom = {}; walk(os.custom, ts.custom, []); }
  return { theme: out, changed, added, onlyTheirs };
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
