// token-pairs.mjs - which surfaces each text colour can be read on (idea I14), derived from the token
// values, never authored. A text colour (named text, fg, foreground, content, icon, label or on-…) is
// readable on another colour token (not a border, divider, shadow or focus ring) when their WCAG contrast is at least 4.5:1 in every mode that defines
// both. A see-through colour is left out (its contrast depends on what is under it). The tokens file
// carries the list, so an agent picking a text colour for a surface reads the answer instead of guessing.
import { parseColor } from './css-values.mjs';

export const FOREGROUND = /(^|\/)(text|fg|foreground|content|icon|label|on[-_ ]?[a-z0-9]*)(\/|$)/i;
// Lines and effects are never a surface text sits on.
const NOT_A_SURFACE = /(^|\/)(border|stroke|outline|divider|separator|shadow|focus|ring)(\/|$)/i;
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// colorByMode: { modeKey: { token: '#hex' } } → { textToken: [surfaceToken, …] } (only text tokens with at least one).
export function readableOn(colorByMode, { min = 4.5 } = {}) {
  const modes = Object.values(colorByMode ?? {});
  const names = [...new Set(modes.flatMap((m) => Object.keys(m ?? {})))];
  const opaque = (v) => { const c = parseColor(v); return c && (c[3] == null || c[3] >= 1) ? { r: c[0], g: c[1], b: c[2] } : null; };   // [r, g, b, a]
  const out = {};
  for (const fg of names.filter((n) => FOREGROUND.test(n))) {
    const ok = names.filter((bg) => bg !== fg && !FOREGROUND.test(bg) && !NOT_A_SURFACE.test(bg)).filter((bg) => {
      const both = modes.filter((m) => m?.[fg] != null && m?.[bg] != null);
      return both.length > 0 && both.every((m) => { const a = opaque(m[fg]), b = opaque(m[bg]); return a && b && ratio(a, b) >= min; });
    });
    if (ok.length) out[fg] = ok;
  }
  return out;
}
