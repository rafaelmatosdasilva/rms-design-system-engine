// dtcg.mjs - the token values in the shape of DTCG's official version, and back to the text the engine shows.
//
// The engine writes the tokens as one W3C Design Tokens (DTCG) dictionary, tokens.json. It wrote the draft's shape,
// a colour and a size as strings ("#0a84ff", "24px"). DTCG's official version is 2025.10, the Final Community Group
// Report of 28 October 2025 and the first stable one (designtokens.org/TR/2025.10): a colour is an object of its
// colour space and components, with an optional alpha and a hex fallback (the Color module, 4.1), and a dimension is
// a number with its unit, px or rem (the Format module). The engine follows that version, and only that one: a
// draft's shape is never written (the finished-standards rule).
//
// Whatever the engine shows a person or an agent (an answer, a fix, the catalog, another tool's export) reads the
// value back as the text CSS writes, so nothing anyone reads changes shape.
//
//   DTCG_VERSION
//   colorValue(css)        → { colorSpace, components, alpha?, hex } | the text as it was, when it is no colour CSS spells
//   dimensionValue(css)    → { value, unit } | the text as it was, for a unit DTCG has no place for (%, em, vw)
//   typographyValue({ size, weight, lh }) → { fontSize, fontWeight, lineHeight }
//   tokenText(value)       → the value as CSS writes it ("#0a84ff", "#0a84ff80", "24px"), whatever its shape

export const DTCG_VERSION = '2025.10';

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const hex2 = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');

// A colour as CSS spells it in a hex or an rgb()/rgba() form: the sRGB components, 0 to 1, and its alpha.
function rgbaOf(css) {
  const s = String(css).trim();
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const ch = (v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255);
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [ch(m[1]), ch(m[2]), ch(m[3]), a];
  }
  if (/^transparent$/i.test(s)) return [0, 0, 0, 0];
  return null;
}

export function colorValue(css) {
  if (css && typeof css === 'object') return css;   // already the official shape
  if (typeof css === 'string' && /^\{[^}]+\}$/.test(css.trim())) return css;   // an alias: a reference, not a value
  const c = rgbaOf(css);
  if (!c) return css;
  const [r, g, b, a] = c;
  return { colorSpace: 'srgb', components: [round(r), round(g), round(b)], ...(a < 1 ? { alpha: round(a) } : {}), hex: `#${hex2(r)}${hex2(g)}${hex2(b)}` };
}

export function dimensionValue(css) {
  if (css && typeof css === 'object') return css;
  if (typeof css === 'number') return { value: css, unit: 'px' };
  const s = String(css ?? '').trim();
  if (/^\{[^}]+\}$/.test(s)) return s;
  const m = /^(-?[\d.]+)(px|rem)?$/i.exec(s);
  return m ? { value: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() } : css;
}

// A line height the design file gives in px is a multiple of the font size in DTCG 2025.10 (Format module, typography:
// lineHeight "SHOULD be interpreted as a multiplier of the fontSize"). One with no size to divide by is kept as given.
export function typographyValue({ size, weight, lh } = {}) {
  const fontSize = dimensionValue(size);
  const px = (v) => (v && typeof v === 'object' && v.unit === 'px' ? v.value : null);
  const lhDim = dimensionValue(lh), sizePx = px(fontSize), lhPx = px(lhDim);
  const lineHeight = typeof lh === 'number' ? lh : sizePx && lhPx ? round(lhPx / sizePx) : lhDim;
  const w = Number(weight);
  return { fontSize, fontWeight: Number.isFinite(w) ? w : weight, lineHeight };
}

export function tokenText(v) {
  if (v == null) return v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v;
  if ('colorSpace' in v) {
    if (v.hex && v.colorSpace === 'srgb') return v.alpha != null && v.alpha < 1 ? `${v.hex}${hex2(v.alpha)}` : v.hex;
    if (v.colorSpace === 'srgb' && Array.isArray(v.components)) { const [r, g, b] = v.components; return `#${hex2(r)}${hex2(g)}${hex2(b)}${v.alpha != null && v.alpha < 1 ? hex2(v.alpha) : ''}`; }
    return v.hex ?? `color(${v.colorSpace} ${(v.components ?? []).join(' ')}${v.alpha != null ? ` / ${v.alpha}` : ''})`;
  }
  if ('value' in v && 'unit' in v && Object.keys(v).length === 2) return `${v.value}${v.unit}`;
  // A composite (typography): each part as text.
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tokenText(x)]));
}
