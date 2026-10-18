// text-styles.mjs - the text styles a variables snapshot holds (its `typography`), read the same way everywhere.
// A capture keys each style by its full Figma name, lowercased ("xl/regular"), so two styles that share their last
// segment ("xl/regular", "m/regular") stay two. Snapshots captured before keyed a style by that last segment only
// ("regular"), and a project's map names a style by whatever key it was written with ('m'). So a style is found by
// its key as written, else by its last segment when that names one style only.

export const styleKey = (name) => String(name ?? '').trim().toLowerCase();
const last = (k) => styleKey(k).split('/').pop();

// The style a key names: its own entry, else the one style whose last segment is that key, else null.
export function textStyle(typo, key) {
  if (!typo || key == null || key === '') return null;
  if (Object.prototype.hasOwnProperty.call(typo, key)) return typo[key];
  const k = styleKey(key);
  if (Object.prototype.hasOwnProperty.call(typo, k)) return typo[k];
  const hits = Object.keys(typo).filter((n) => last(n) === k || last(n) === last(k));
  return hits.length === 1 ? typo[hits[0]] : null;
}

// The key a style is stored under for a name, or null (textStyle's lookup, giving the key).
export function textStyleKey(typo, key) {
  const hit = textStyle(typo, key);
  return hit ? Object.keys(typo).find((n) => typo[n] === hit) ?? null : null;
}

// Each style's short name: its last segment when no other style shares it, else its full name.
// → [[key, shortName], ...] in the snapshot's order.
export function shortStyleNames(typo = {}) {
  const keys = Object.keys(typo ?? {});
  const count = new Map();
  for (const k of keys) count.set(last(k), (count.get(last(k)) ?? 0) + 1);
  return keys.map((k) => [k, count.get(last(k)) === 1 ? last(k) : k]);
}

// Every name a style answers to (its key, and its short name): for the lists of token names docs are checked against.
export function styleNames(typo = {}) {
  return new Set(shortStyleNames(typo).flatMap(([k, s]) => [k, s]));
}

// Does a key a project wrote (a map entry's 'm') name this stored key ('body/m')?
export const namesStyle = (typo, written, stored) => textStyleKey(typo, written) === stored;

// The styles of a text scale ('s' → 's/regular', 's/strong'): each style whose name is the scale and one more segment.
export function scaleStyles(typo, scale) {
  const k = styleKey(scale);
  if (!typo || !k) return [];
  return Object.keys(typo).filter((n) => { const s = styleKey(n), i = s.lastIndexOf('/'); return i > 0 && s.slice(0, i) === k; });
}

// The key of the style a component's text uses. A component whose size is bound to a scale's variable
// (typography/s/font-size) records the scale ('s'), not a style: a key that names a style is that style, else the
// scale's style that matches the weight it recorded (a style's name or last segment, or its weight value), else the
// scale's regular one, else its first. null when the key names neither.
export function componentStyleKey(typo, key, weight = null) {
  const own = textStyleKey(typo, key);
  if (own) return own;
  const list = scaleStyles(typo, key);
  if (list.length <= 1) return list[0] ?? null;
  const w = styleKey(weight);
  const byWeight = w ? list.find((n) => styleKey(n) === w || last(n) === w || last(n) === last(w) || String(typo[n]?.weight ?? '').trim().toLowerCase() === w) : null;
  return byWeight ?? list.find((n) => /^(regular|normal|default|book)$/.test(last(n))) ?? list[0];
}

// The style a component's text uses (componentStyleKey), or null.
export const componentStyle = (typo, key, weight = null) => { const k = componentStyleKey(typo, key, weight); return k ? typo[k] : null; };

// ── What the token check compares in each text style ────────────────────────────────────────────────────────────────
// A style's own fields, as the capture writes them: size, weight, line height (lh), letter spacing (ls), paragraph
// spacing (ps) and case (textTransform). Its family is checked once for every style (familyGroups), its variables
// (vars: the Figma variable each bound field takes its value from) say where each value comes from.
export const STYLE_FIELDS = ['size', 'weight', 'lh', 'ls', 'ps', 'textTransform'];
export const styleFields = (entry) => STYLE_FIELDS.filter((f) => entry?.[f] != null && entry[f] !== '');

// The styles and fields a TYPO map entry names. [key, field]: key one style ('s/regular', or an old snapshot's 'm'), or
// a scale ('s') whose every style it feeds; [[keys], field] several; or a list of [key, field] pairs.
// → [{ style, field }] for the styles the snapshot has.
export function typoTargets(typo, entry) {
  if (!Array.isArray(entry)) return [];
  const pairs = typeof entry[1] === 'string' ? [].concat(entry[0]).map((k) => [k, entry[1]]) : entry.filter((p) => Array.isArray(p) && typeof p[1] === 'string');
  const out = [];
  for (const [key, field] of pairs) {
    const own = textStyleKey(typo, key);
    for (const style of own ? [own] : scaleStyles(typo, key)) if (!out.some((o) => o.style === style && o.field === field)) out.push({ style, field });
  }
  return out;
}

// Every field of every text style, with the CSS variable it is compared with. A TYPO map entry that names it wins;
// else the Figma variable the style binds for it, named by the naming convention (varOf(variable name) → '--x' or
// null), so a variable several styles bind is compared in each of them, with no map entry. variable: the Figma
// variable the field is bound to (null when none), which says whether the value changes with a mode.
// → { pairs: [{ style, field, cssVar, variable, via: 'map'|'variable' }], unpaired: [{ style, field }],
//     unknown: [{ cssVar, key, field }] (a map entry that names no style the snapshot has) }
export function typographyPairs(typo = {}, TYPO = {}, varOf = () => null) {
  const byMap = new Map(), unknown = [];
  for (const [cssVar, entry] of Object.entries(TYPO ?? {})) {
    const targets = typoTargets(typo, entry);
    if (!targets.length) { const [key, field] = typeof entry?.[1] === 'string' ? entry : (entry?.[0] ?? []); unknown.push({ cssVar, key: [].concat(key ?? '').join(', '), field: field ?? '' }); continue; }
    for (const t of targets) if (!byMap.has(`${t.style}\u0000${t.field}`)) byMap.set(`${t.style}\u0000${t.field}`, cssVar);
  }
  const pairs = [], unpaired = [];
  for (const [style, entry] of Object.entries(typo ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    for (const field of styleFields(entry)) {
      const variable = entry.vars?.[field] ?? null;
      const mapped = byMap.get(`${style}\u0000${field}`);
      const cssVar = mapped ?? (variable ? varOf(variable) : null);
      if (cssVar) pairs.push({ style, field, cssVar, variable, via: mapped ? 'map' : 'variable' });
      else unpaired.push({ style, field });
    }
  }
  return { pairs, unpaired, unknown };
}

// The family of the text styles, checked once: the styles grouped by the family they use and the variable it comes from
// (null when the style sets the family itself). → [{ family, variable, styles: [key, ...] }], in Figma's order.
export function familyGroups(typo = {}) {
  const groups = [];
  for (const [style, entry] of Object.entries(typo ?? {})) {
    if (!entry?.family) continue;
    const variable = entry.vars?.family ?? null;
    let g = groups.find((x) => x.variable === variable && sameFamily(x.family, entry.family));
    if (!g) groups.push(g = { family: entry.family, variable, styles: [] });
    g.styles.push(style);
  }
  return groups;
}

// A font family as one name: the first of a list, without quotes, lowercased ("'Inter', sans-serif" = "inter").
export const familyName = (v) => String(v ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
export const sameFamily = (a, b) => familyName(a) !== '' && familyName(a) === familyName(b);

// The font family the code's page text uses: the last font-family (or font shorthand's family) set on html, body or
// :root in the CSS, with var() resolved by resolveVar(name) → value. null when the CSS sets none.
export function bodyFontFamily(cssText, resolveVar = () => null) {
  // Outside @media and the like: the page's own rule, whatever the screen.
  const css = String(cssText ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{};]+\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');
  let found = null;
  for (const m of css.matchAll(/([^{};@]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (!sels.some((s) => /^(html|body|:root)$/i.test(s))) continue;
    for (const d of m[2].matchAll(/(?:^|;)\s*font-family\s*:\s*([^;]+)/gi)) found = d[1].trim();
    for (const d of m[2].matchAll(/(?:^|;)\s*font\s*:\s*([^;]+)/gi)) { const f = d[1].match(/[\d.]+(?:px|rem|em|%|pt|vw|vh|ch|ex)(?:\s*\/\s*[\w.%-]+)?\s+(.+)$/); if (f) found = f[1].trim(); }
  }
  if (!found) return null;
  for (let i = 0; i < 8; i++) {
    const v = found.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)\s*(?:,.*)?$/);
    if (!v) break;
    const next = resolveVar(v[1]) ?? v[2] ?? null;
    if (next == null) return null;
    found = String(next).trim();
  }
  return found;
}
