// colour-merges.mjs - colours a person cannot tell apart, offered as merges.
//
// A system grows colours that each do one job in the code and look the same on screen: twenty doing the work of eleven,
// and every designer, developer and agent picks between them. The engine finds near-copies of components; this finds
// them among colours. Each colour token the theme declares with a value of its own is measured against the others by
// how different they look (OKLab, the space where equal distances look equally different), in every mode both of them
// are given a value in. Those no person can tell apart in any of those modes are one group, offered as one merge:
// which one stays, which ones would point at it, and every component the merge reaches. A token that already points
// at another (var(--x)) is that one, never a candidate of its own. Nothing is changed: a person decides.
//
//   colourTokens(sources)                    → Map(name → Map(scope → [r, g, b, a]))
//     sources: [{ file, text }], the theme's CSS. A scope is where a value is set (:root, [data-theme="dark"], an
//     @media), so a token is compared mode by mode.
//   colourMerges(tokens, { uses, within })   → [{ keep, merge: [name], reaches: [component], apart }]
//     uses: { '--x': { direct: [component], via: [{ name }] } }, which components use each token (token-uses.json).
//     within: how far apart two colours may be and still look the same (OKLab ×100, 1 by default: under the step a
//     person notices side by side, so two neighbouring steps of a grey scale stay apart). apart: the largest difference found between the kept one and one it absorbs.
//   mergeLines(groups)                       → the System health lines
// Pure.
import { walkCss } from './css-source.mjs';
import { parseColor } from './css-values.mjs';

export const WITHIN = 1;

// sRGB 0-255 to OKLab (Björn Ottosson), ×100 so a difference of 1 is about the smallest step that shows.
function oklab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s].map((x) => x * 100);
}
export function lookApart(a, b) {
  const [x, y] = [oklab(a), oklab(b)];
  // A see-through colour is another colour wherever it is laid: a difference in how see-through counts as much.
  const alpha = Math.abs((a[3] ?? 1) - (b[3] ?? 1)) * 100;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2], alpha);
}

export function colourTokens(sources = []) {
  const out = new Map();
  for (const { file = '', text = '' } of sources) {
    let rules = [];
    try { rules = walkCss(text, file); } catch { continue; }
    for (const r of rules) {
      const scope = [...(r.atRules ?? []), (r.selectors ?? []).join(', ')].join(' ');
      for (const d of r.decls ?? []) {
        if (!String(d.prop).startsWith('--')) continue;
        const v = String(d.value).trim();
        if (!out.has(d.prop)) out.set(d.prop, new Map());
        // A pointer is kept as one, so a token that points at another is never offered as its twin.
        const c = /^var\(/.test(v) ? 'alias' : parseColor(v);
        if (c) out.get(d.prop).set(scope, c);
      }
    }
  }
  for (const [n, m] of out) if (!m.size) out.delete(n);
  return out;
}

const usersOf = (uses, n) => { const u = uses?.[n]; return u ? [...new Set([...(u.direct ?? []), ...(u.via ?? []).map((x) => x.name ?? x)])] : []; };

export function colourMerges(tokens, { uses = null, within = WITHIN } = {}) {
  // Only a token that holds a colour of its own in every scope it is set in.
  const own = [...tokens].filter(([, m]) => [...m.values()].every((c) => c !== 'alias'));
  const look = (a, b) => {
    const shared = [...a[1].keys()].filter((s) => b[1].has(s));
    if (!shared.length) return null;
    let most = 0;
    for (const s of shared) { const d = lookApart(a[1].get(s), b[1].get(s)); if (d > within) return null; most = Math.max(most, d); }
    return most;
  };
  // Groups by union: a and b alike, b and c alike, is one group only when a and c are alike too, so a long chain of
  // small steps (a whole scale) is never one colour.
  const groups = [];
  for (const t of own) {
    const g = groups.find((x) => x.every((y) => look(t, y) != null));
    if (g) g.push(t); else groups.push([t]);
  }
  const used = (n) => usersOf(uses, n).length;
  return groups.filter((g) => g.length > 1).map((g) => {
    const [keep, ...rest] = [...g].sort((a, b) => used(b[0]) - used(a[0]) || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    const reaches = [...new Set(rest.flatMap(([n]) => usersOf(uses, n)))].sort();
    return { keep: keep[0], merge: rest.map(([n]) => n).sort(), reaches, apart: Math.round(Math.max(...rest.map((r) => look(keep, r))) * 10) / 10 };
  }).sort((a, b) => b.merge.length - a.merge.length || a.keep.localeCompare(b.keep));
}

export function mergeLines(groups = [], { shown = 8 } = {}) {
  if (!groups.length) return [];
  const n = groups.reduce((k, g) => k + g.merge.length + 1, 0);
  const out = [`${n} colour tokens look the same as another in every mode they share, in ${groups.length} group${groups.length === 1 ? '' : 's'}: each could be one colour (keep one, point the others at it, or say why they stay apart):`];
  for (const g of groups.slice(0, shown)) {
    out.push(`   · keep ${g.keep}, point ${g.merge.join(', ')} at it${g.reaches.length ? ` (reaches ${g.reaches.slice(0, 6).join(', ')}${g.reaches.length > 6 ? `, … ${g.reaches.length} components` : ''})` : ''}`);
  }
  if (groups.length > shown) out.push(`   · … ${groups.length - shown} more`);
  return out;
}
