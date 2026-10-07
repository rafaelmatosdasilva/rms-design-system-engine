// pair-derive.mjs - derive text/background contrast pairs from token NAMES (I14).
//
// I28 checks WCAG contrast for text/bg token pairs, but only ones the project AUTHORS in
// a11y.tokenPairs - authored data someone must maintain. Most DSes already encode the role in the
// token NAME by convention (`menuList/text/default/color`, `menuList/background/hover/color`), so
// the pairs can be DERIVED: within one component, pair each text/label/icon token with the background
// token that shares its qualifier (state or variant), falling back to the component's default/only
// background. Component-scoped + qualifier-matched, so it never explodes into every-text × every-bg.
// A component with no background token is skipped (we never invent the surface it sits on). Pure.

const TEXT_ROLES = new Set(['text', 'label', 'content', 'foreground', 'fg', 'icontext', 'caption', 'title', 'heading', 'placeholder', 'link']);
const ICON_ROLES = new Set(['icon', 'iconprimary', 'iconsecondary', 'stroke']);   // non-text: WCAG 3:1 (large)
// Component boundaries (WCAG 1.4.11): borders, outlines and focus rings at 3:1. Opt in with
// { boundaries: true } (ds-config a11y.nonTextPairs) - a border is often decorative, so it is not
// imposed. Dividers are decorative and never paired.
const BOUNDARY_ROLES = new Set(['border', 'outline', 'focus', 'focusring', 'ring']);
const BG_ROLES   = new Set(['background', 'bg', 'fill', 'surface', 'container']);

// tokenNames: the color token keys for one mode (names are mode-independent; values are resolved per
// mode later by the caller). Returns [{ name, text, bg, large }] - text/bg are exact token names.
export function deriveContrastPairs(tokenNames, { boundaries = false } = {}) {
  const byComp = new Map();
  for (const name of (tokenNames || [])) {
    if (typeof name !== 'string') continue;
    const segs = name.split('/');
    if (segs.length < 3 || segs[segs.length - 1] !== 'color') continue;   // need comp/role/.../color
    const comp = segs[0];
    const role = segs[1].toLowerCase();
    const qualifier = segs.slice(2, -1).join('/');                        // between role and "color"
    // WCAG exempts inactive controls: a disabled text or surface is never a contrast finding.
    if (/(^|\/)disabled(\/|$)/i.test(segs.slice(1, -1).join('/'))) continue;
    let b = byComp.get(comp);
    if (!b) { b = { texts: [], bgs: [] }; byComp.set(comp, b); }
    if (TEXT_ROLES.has(role))      b.texts.push({ token: name, qualifier, large: false });
    else if (ICON_ROLES.has(role) || (boundaries && BOUNDARY_ROLES.has(role))) b.texts.push({ token: name, qualifier, large: true });
    else if (BG_ROLES.has(role))   b.bgs.push({ token: name, qualifier });
  }

  const pairs = [];
  const seen = new Set();
  for (const [, { texts, bgs }] of byComp) {
    if (!texts.length || !bgs.length) continue;
    const bgByQual = new Map(bgs.map((x) => [x.qualifier, x.token]));
    const fallbackBg = bgByQual.get('default') ?? bgByQual.get('') ?? (bgs.length === 1 ? bgs[0].token : null);
    for (const t of texts) {
      const bg = bgByQual.get(t.qualifier) ?? fallbackBg;
      if (!bg || bg === t.token) continue;
      const key = `${t.token}|${bg}`;
      if (seen.has(key)) continue; seen.add(key);
      pairs.push({ name: `${t.token} on ${bg}`, text: t.token, bg, large: t.large });
    }
  }
  return pairs;
}

// What Figma draws, from the structure snapshot: drawnOn ([{ fg, on, icon }] per component, a text or icon colour
// token and the fill token of the layer right under it, 'surface' when nothing in the component paints under it)
// and fills (every fill token the component's own layers paint). A name-derived pair is left out when Figma paints
// its background in the same component as the text but never under it (a checkbox's selected text sits beside its
// box, not on it); a background another component paints (a segment's control) is not known here, so the pair
// stays. Each pair Figma draws on a token is added. Pure.
export function applyDrawnOn(derived, structure) {
  const together = new Set(), apartIn = new Map(), drawn = [];
  for (const c of Object.values(structure ?? {})) {
    const list = Array.isArray(c?.drawnOn) ? c.drawnOn.filter((d) => d?.fg && d.on) : [];
    const fills = new Set(Array.isArray(c?.fills) ? c.fills : []);
    for (const d of list) { together.add(`${d.fg}|${d.on}`); drawn.push(d); }
    for (const fg of new Set(list.map((d) => d.fg))) {
      for (const f of fills) if (!list.some((d) => d.fg === fg && d.on === f)) apartIn.set(`${fg}|${f}`, true);
    }
  }
  if (!drawn.length) return { pairs: derived || [], apart: [], added: 0 };
  const pairs = [], apart = [], seen = new Set();
  for (const p of derived || []) {
    const key = `${p.text}|${p.bg}`;
    if (apartIn.has(key) && !together.has(key)) { apart.push(p); continue; }
    seen.add(key); pairs.push(p);
  }
  let added = 0;
  const disabled = (t) => /(^|\/)disabled(\/|$)/i.test(t);
  for (const d of drawn) {
    if (d.on === 'surface' || d.on === 'unbound' || d.on === d.fg || disabled(d.fg) || disabled(d.on)) continue;
    const key = `${d.fg}|${d.on}`;
    if (seen.has(key)) continue; seen.add(key);
    pairs.push({ name: `${d.fg} on ${d.on}`, text: d.fg, bg: d.on, large: !!d.icon }); added++;
  }
  return { pairs, apart, added };
}
