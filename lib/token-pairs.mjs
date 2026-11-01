// token-pairs.mjs - which surfaces each text colour can be read on, derived from the token
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
  for (const fg of names.filter(isForeground)) {
    const ok = names.filter((bg) => bg !== fg && !isForeground(bg) && !notASurface(bg)).filter((bg) => {
      const both = modes.filter((m) => m?.[fg] != null && m?.[bg] != null);
      return both.length > 0 && both.every((m) => { const a = opaque(m[fg]), b = opaque(m[bg]); return a && b && ratio(a, b) >= min; });
    });
    if (ok.length) out[fg] = ok;
  }
  return out;
}

// ── The pair a text colour was made for ────────────────────────────────────────
// Readable on is a list of what would work; a pair is the one the system meant. A design system says it in the
// names: `content/on-interactive` goes with `surface/interactive`, `text/primary` with `surface/primary`. So the
// pair is read from the names and confirmed against the values, and an agent is given the answer rather than the
// shortlist - picking any readable surface is how a page ends up correct and wrong at once, every card a different
// grey. Icon colours are read the same way: an icon on a surface is a colour pair like any other.
//
// A pair whose names say they belong together and whose values do not meet 4.5:1 is the loudest thing here: the
// system's own words and its own values disagree. It is kept, with its ratio, never dropped for failing.

// The words that name a surface rather than the thing on it.
const SURFACE_WORD = /^(surface|background|bg|fill|container|canvas|base|layer|elevation)$/i;
const DROP = /^(color|colour|default)$/i;
// A name in either shape: a token's path (content/on-interactive/color) or the custom property a theme declares for
// it (--content-on-interactive). Split by the separator the name itself uses, so neither shape is read as the other.
const parts = (name) => {
  const n = String(name).replace(/^--/, '');
  return (n.includes('/') ? n.split('/') : n.split(/[-_]/)).map((x) => x.trim()).filter((x) => x && !DROP.test(x));
};
// The words that make a token a foreground: its role (text, icon), an `on x`, or its last part ending in one (badgeText).
const ROLE = /^(text|fg|foreground|content|icons?|label|title|subtitle|heading|caption|description|placeholder|helper|hint)$/i;
const roleAt = (p) => p.findIndex((x, i) => ROLE.test(x) || /^on([-_].+)?$/i.test(x) || (i === p.length - 1 && /[a-z](Text|Label|Icon|Foreground)$/.test(x)));   // badgeText last, never noteText/background
// What a foreground is for: the `on x` it names, else its own last word (text/primary → primary); none when that word
// is only its role (button/text/color says what it is, not what it goes on).
const madeFor = (fg) => {
  const p = parts(fg);
  for (let i = 0; i < p.length; i++) {
    const m = /^on[-_ ]?(.*)$/i.exec(p[i]);
    if (!m) continue;
    return (m[1] || p.slice(i + 1).join('-')).toLowerCase() || null;
  }
  return p.length > 1 && !ROLE.test(p[p.length - 1]) && roleAt(p) < p.length - 1 ? p[p.length - 1].toLowerCase() : null;
};
// Where a token belongs: the parts before its role (advanced/buttonLink for advanced/buttonLink/text/hover/color).
const scopeOf = (n) => { const p = parts(n), i = roleAt(p); return (i > 0 ? p.slice(0, i) : p.slice(0, -1)).join('/').toLowerCase(); };
const inScope = (bg, scope) => parts(bg).map((x) => x.toLowerCase()).join('/').startsWith(scope + '/');
// A foreground or a surface, read the same way in either shape.
const isForeground = (n) => roleAt(parts(n)) >= 0;
const notASurface = (n) => parts(n).some((x) => /^(border|stroke|outline|divider|separator|shadow|focus|ring)$/i.test(x));
const worstRatio = (modes, fg, bg) => {
  const opaque = (v) => { const c = parseColor(v); return c && (c[3] == null || c[3] >= 1) ? { r: c[0], g: c[1], b: c[2] } : null; };
  const both = modes.filter((m) => m?.[fg] != null && m?.[bg] != null).map((m) => [opaque(m[fg]), opaque(m[bg])]).filter(([a, b]) => a && b);
  return both.length ? Math.min(...both.map(([a, b]) => ratio(a, b))) : null;
};

// The pairs the system meant, each with the contrast its values give in the mode where they are closest.
// → [{ text, surface, ratio, by: 'name' | 'only', icon, ok }], a text colour at most once.
export function pairsOf(colorByMode, { min = 4.5 } = {}) {
  const modes = Object.values(colorByMode ?? {});
  const names = [...new Set(modes.flatMap((m) => Object.keys(m ?? {})))];
  const surfaces = names.filter((n) => !isForeground(n) && !notASurface(n));
  const readable = readableOn(colorByMode, { min });
  const out = [];
  for (const fg of names.filter(isForeground)) {
    const want = madeFor(fg);
    // A token of one component (two parts or more before its role) goes on that component's own surfaces: never on
    // another's that shares a word with it (one's hover text on another's hover background).
    const scope = scopeOf(fg), own = scope.includes('/') ? surfaces.filter((bg) => inScope(bg, scope)) : null;
    const pool = own ?? surfaces;
    const surfaceFirst = (a, b) => Number(parts(b).some((s) => SURFACE_WORD.test(s))) - Number(parts(a).some((s) => SURFACE_WORD.test(s)));
    // The surfaces whose names carry the same word (a whole word), the ones named as a surface first; for a
    // component's token with no such word, its surface at rest.
    const named = want ? pool.filter((bg) => parts(bg).some((s) => s.toLowerCase() === want) || parts(bg).join('-').toLowerCase().endsWith('-' + want)).sort(surfaceFirst)
      : own ? own.filter((bg) => parts(bg).some((s) => SURFACE_WORD.test(s)) && !parts(bg).some((s) => /^(hover|press(ed)?|active|focus|selected|current|disabled|error)$/i.test(s))).sort(surfaceFirst) : [];
    // Nothing in the names: a text colour readable on exactly one surface has its pair by elimination.
    const only = !named.length && readable[fg]?.length === 1 ? readable[fg] : [];
    const surface = named[0] ?? only[0] ?? null;
    if (!surface) continue;
    const r = worstRatio(modes, fg, surface);
    out.push({ text: fg, surface, ratio: r == null ? null : Math.round(r * 100) / 100, by: named.length ? 'name' : 'only', icon: parts(fg).some((x) => /^icons?$/i.test(x)), ok: r != null && r >= min });
  }
  return out.sort((a, b) => a.text.localeCompare(b.text));
}

// The pairs the names promise and the values break: the system's own words against its own numbers.
export const brokenPairs = (pairs) => pairs.filter((p) => p.by === 'name' && !p.ok);

// A text colour put on a surface it was not made for. used: [{ text, surface, where }] as a page or an edit writes
// them. → [{ text, surface, where, meant, ratio, readable }]: meant, the surface the system made it for; readable,
// whether the one used still meets 4.5:1 (it may read fine and still be the wrong grey on every other card).
export function wrongPairs(used = [], pairs = [], colorByMode = {}, { min = 4.5 } = {}) {
  const modes = Object.values(colorByMode ?? {});
  const meantFor = new Map(pairs.map((p) => [p.text, p.surface]));
  const out = [];
  for (const u of used) {
    const meant = meantFor.get(u.text);
    if (!meant || meant === u.surface) continue;
    const r = worstRatio(modes, u.text, u.surface);
    out.push({ ...u, meant, ratio: r == null ? null : Math.round(r * 100) / 100, readable: r != null && r >= min });
  }
  return out;
}

// What a person or an agent reads: the pair, and the contrast where the two are closest.
export function pairLines(pairs = []) {
  if (!pairs.length) return [];
  const broken = brokenPairs(pairs);
  return [`${pairs.length} colour pair${pairs.length === 1 ? '' : 's'} the system made (a text or icon colour with the surface it goes on):`,
    ...pairs.map((p) => `  ${p.text} on ${p.surface}${p.ratio == null ? '' : ` (${p.ratio}:1${p.ok ? '' : ', under 4.5:1'})`}${p.by === 'only' ? ' - the only surface it reads on; the names do not say so' : ''}`),
    ...(broken.length ? [`${broken.length} of them the names promise and the values break: ${broken.map((p) => `${p.text} on ${p.surface} (${p.ratio}:1)`).join('; ')}`] : [])];
}

// ── The same pairs, in the names a stylesheet writes ───────────────────────────
// A theme declares the tokens as custom properties, and an edit writes those property names, not the token paths.
// Read in that shape, the whole check needs no map between the two: the pair is derived from the same names the
// edit uses. A block whose selector says dark is the dark mode; :root and html are the light one; everything else
// is a component's rule, never a token declaration.
const RULES = /([^{}]+)\{([^{}]*)\}/g;
const COLOUR = /^(#|rgb|hsl|oklch|lab|color\()/i;

// A theme's colour custom properties, by mode. → { light: { '--x': value }, dark: { … } }
export function varsByMode(css) {
  const out = {};
  for (const [, sel, body] of String(css ?? '').matchAll(RULES)) {
    const s = sel.trim();
    const mode = /\bdark\b/i.test(s) ? 'dark' : /(^|,)\s*(:root|html|body)\b/.test(s) ? 'light' : null;
    if (!mode) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      const v = value.trim();
      if (!COLOUR.test(v)) continue;
      (out[mode] ??= {})[name] = v;
    }
  }
  return out;
}

// The colour pairs a stylesheet writes: every rule that sets both a text colour and the surface under it, each with
// the line it is on. A rule that sets only one of the two pairs nothing: what is under the text is then whatever the
// page puts there, and only the browser can say. → [{ text, surface, where, line }]
export function pairsInCss(css, { file = null } = {}) {
  const text = String(css ?? '');
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  const out = [];
  for (const m of text.matchAll(RULES)) {
    const body = m[2];
    const fg = /(?:^|[;{\s])color\s*:\s*var\(\s*(--[\w-]+)/.exec(body)?.[1];
    const bg = /(?:^|[;{\s])background(?:-color)?\s*:\s*var\(\s*(--[\w-]+)/.exec(body)?.[1];
    if (!fg || !bg) continue;
    const line = lineAt(m.index + m[0].indexOf(fg));
    out.push({ text: fg, surface: bg, line, where: file ? `${file}:${line}` : String(line) });
  }
  return out;
}
