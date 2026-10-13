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
