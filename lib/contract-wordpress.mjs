// contract-wordpress.mjs - the component contracts, viewed as what a WordPress theme.json can say of them, for a team
// whose site is a WordPress theme: the system's own button and link in the editor, not WordPress's.
//
//   wordpressComponents(contracts, { refOf, valueOf }) → { styles, variations, mapped, left }
//
// theme.json styles WordPress's own blocks and elements, and nothing else: no PHP, no block of the system's own. So a
// component is written only where WordPress already has its place:
//   - a button   → styles.elements.button (every button the site draws), with its hover, focus and active states
//   - a link     → styles.elements.link, with its hover, focus, active and visited states
//   - a heading  → styles.elements.h1 … h6, by the element its contract says
//   - each other value of a button's variant axis (Secondary, Outline), and every button component after the first,
//     → a block style variation of the Button block (styles/blocks/<name>.json, blockTypes core/button, WordPress 6.6),
//     which the editor offers by name
// What a style says comes from the contract alone, as the other views read it (contract-spec.mjs): its padding, corner
// radius and type style from its anatomy, its fill, text and border colours from what each variant paints with
// (tokens.byVariant). Each token is the theme's own preset where there is one (var:preset|color|brand-fill), else its
// --wp--custom--… variable, else its value, so a change in Figma reaches every style through its token.
//   - a divider (hr), a quote (blockquote), a table, a disclosure (details) → that core block (styles.blocks), and every
//     other one, and each other look, a style of that block, as a button's are
//   - a caption (figcaption, caption) and a citation (cite) → styles.elements.caption and .cite
// A place is read from the element alone, never the name: a quoteCard is not a quote. Proven in a real WordPress
// (test/wordpress-real.test.mjs), which writes each of these into its own stylesheet and ignores a place it has not.
// What has no place (a chip, a tab, a field: no core block; a disabled state: theme.json has none; a height) is listed in
// left with why, never dropped in silence. An element WordPress has more than one place for (a pre is the Code block or the
// Preformatted one) is left with that reason, never with "no place": WordPress has one, and which is the team's to say.
// Pure: nothing is read or written here (wordpress-theme.mjs writes it).
import { isStateAxis } from './contract-code.mjs';
import { WP_SCHEMA } from './token-exports.mjs';

// A state's value, as the pseudo-class theme.json takes for it. Disabled has none.
const PSEUDO = [[/^(hover|hovered)$/i, ':hover'], [/^(focus|focused|focus[- ]?visible)$/i, ':focus'], [/^(active|pressed)$/i, ':active'], [/^visited$/i, ':visited']];
const pseudoOf = (value) => PSEUDO.find(([re]) => re.test(String(value).trim()))?.[1] ?? null;
const slugOf = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const isTrue = (v) => v === true || /^true$/i.test(String(v));
const strip = (t) => String(t ?? '').replace(/^\{|\}$/g, '');

// The core blocks a component's element names exactly, each its theme.json key. The button and the link stay elements.
export const BLOCK_OF = { hr: 'core/separator', blockquote: 'core/quote', table: 'core/table', details: 'core/details' };
// theme.json's own elements beyond the button, the link and the headings, by the element that is each.
const ELEMENT_OF = { figcaption: 'caption', caption: 'caption', cite: 'cite' };
// Elements WordPress has more than one place for: which of them a component is, its element does not say.
const SEVERAL = { pre: 'the Code block and the Preformatted block', code: 'the Code block', img: 'the Image block and the Avatar block', nav: 'the Navigation block' };
// Where WordPress keeps a component, by the element its contract says, else, for the button and the link, by its name.
// → 'button' | 'link' | 'h1'… | 'caption' | 'cite' | 'core/separator' … | null
export function placeOf(c = {}) {
  const el = String(c.semantics?.element ?? c.accessibility?.element?.value ?? '').toLowerCase();
  const role = String(c.accessibility?.role?.value ?? c.semantics?.role ?? '').toLowerCase();
  const name = String(c.name ?? '');
  if (el === 'button' || (!el && /button|btn/i.test(name))) return 'button';
  if (el === 'a' || (!el && /(^|[^a-z])link$|^link/i.test(name))) return 'link';
  if (/^h[1-6]$/.test(el)) return el;
  if (BLOCK_OF[el]) return BLOCK_OF[el];
  if (role === 'separator') return 'core/separator';
  if (ELEMENT_OF[el]) return ELEMENT_OF[el];
  return null;
}
// Why a component has no place, said truly: an element WordPress has several places for is not one it has none for.
export function noPlaceWhy(c = {}) {
  const el = String(c.semantics?.element ?? c.accessibility?.element?.value ?? '').toLowerCase();
  return SEVERAL[el] ? `WordPress has ${SEVERAL[el]} for ${/^[aeiou]/.test(el) ? 'an' : 'a'} ${el}, and which this is its contract does not say: the team's to choose`
    : 'WordPress has no core block or element for it, and theme.json styles only those';
}
const isBlock = (place) => String(place).startsWith('core/');
const blockName = (place) => String(place).replace(/^core\//, '');

export function wordpressComponents(contracts = [], { refOf = () => null, valueOf = () => null } = {}) {
  const styles = { elements: {}, blocks: {} }, variations = [], mapped = [], left = [];
  const say = (component, why) => left.push({ component, why });
  // A token as the theme says it: its preset or custom variable, else its value, else nothing.
  const tok = (t) => { if (!t) return null; const r = refOf(strip(t)); if (r) return r; const v = valueOf(strip(t)); return v == null || typeof v === 'object' ? null : v; };

  // What a component's frame says, in theme.json's words.
  const layout = (c) => {
    const root = c.anatomy?.root ?? {}, s = {};
    const block = tok(root.inset?.blockToken), inline = tok(root.inset?.inlineToken);
    if (block || inline) s.spacing = { padding: { ...(block ? { top: block, bottom: block } : {}), ...(inline ? { left: inline, right: inline } : {}) } };
    const radius = tok(root.radiusToken);
    if (radius) s.border = { radius };
    if (root.typographyToken) {
      const t = valueOf(strip(root.typographyToken));
      if (t && typeof t === 'object') {
        const typo = {};
        if (t.fontFamily) typo.fontFamily = Array.isArray(t.fontFamily) ? t.fontFamily.join(', ') : String(t.fontFamily);
        if (t.fontSize != null) typo.fontSize = refOf(`${strip(root.typographyToken)}.fontSize`) ?? String(t.fontSize);
        if (t.fontWeight != null) typo.fontWeight = String(t.fontWeight);
        if (t.lineHeight != null) typo.lineHeight = String(t.lineHeight);
        if (Object.keys(typo).length) s.typography = typo;
      }
    }
    return s;
  };
  // What a variant paints with, in theme.json's words: its fill, its text and its border colour.
  const paint = (list = []) => {
    const s = {};
    for (const x of list) {
      const v = tok(x.token);
      if (!v) continue;
      if (x.field === 'fills' && x.text) (s.color ??= {}).text = v;
      else if (x.field === 'fills') (s.color ??= {}).background = v;
      else if (x.field === 'strokes') s.border = { ...(s.border ?? {}), color: v, style: 'solid' };
    }
    return s;
  };
  const merge = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out; };
  const differs = (now, was = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(now)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { const d = differs(v, was?.[k] ?? {}); if (Object.keys(d).length) out[k] = d; }
      else if (JSON.stringify(v) !== JSON.stringify(was?.[k])) out[k] = v;
    }
    return out;
  };

  const taken = new Set(), owner = new Map();
  // The component named as its place first (button before buttonIcon), then by name.
  const ordered = [...contracts].filter((c) => c?.name).sort((a, b) => (slugOf(a.name) === placeOf(a) ? -1 : 0) - (slugOf(b.name) === placeOf(b) ? -1 : 0) || String(a.name).localeCompare(String(b.name)));
  for (const c of ordered) {
    const place = placeOf(c);
    if (!place) { say(c.name, noPlaceWhy(c)); continue; }
    const axes = (c.props ?? []).filter((p) => p.bindings?.figma?.kind === 'VARIANT' && Array.isArray(p.options));
    const defaults = Object.fromEntries(axes.map((p) => [p.name, String(p.default ?? p.options[0])]));
    const stateAxes = axes.filter((p) => isStateAxis(p.name, p.options)), lookAxes = axes.filter((p) => !isStateAxis(p.name, p.options));
    const paints = c.tokens?.byVariant ?? [];
    // The variant whose every axis is at its default but the ones named.
    const at = (named) => paints.find((v) => axes.every((p) => String(v.when?.[p.name] ?? defaults[p.name]) === String(named[p.name] ?? defaults[p.name])));
    const base = merge(layout(c), paint(at({})?.paints));
    if (!Object.keys(base).length) { say(c.name, 'its contract holds no padding, radius, type style or colour token to write'); continue; }

    // A second button, or a second of any block, is a style of that block; a second link, heading, caption or citation has
    // no place of its own.
    const blockOf = place === 'button' ? 'core/button' : isBlock(place) ? place : null;
    const said = blockOf ? `the ${blockName(blockOf)[0].toUpperCase()}${blockName(blockOf).slice(1)} block` : null;
    if (taken.has(place)) {
      if (!blockOf) { say(c.name, `WordPress styles one ${place}, and ${owner.get(place)} already is it`); continue; }
      variations.push({ file: `styles/blocks/${slugOf(c.name)}.json`, component: c.name, theme: { $schema: WP_SCHEMA, version: 3, title: c.name, slug: slugOf(c.name), blockTypes: [blockOf], styles: base } });
      mapped.push({ component: c.name, as: `a style of ${said} (${slugOf(c.name)})` });
      continue;
    }
    taken.add(place); owner.set(place, c.name);
    const own = { ...base };
    // Its states, each as the pseudo-class theme.json takes for it: only what changes.
    for (const p of stateAxes) {
      for (const o of p.options) {
        if (String(o) === defaults[p.name]) continue;
        if (/^disabled$/i.test(p.name) ? isTrue(o) : /^disabled$/i.test(String(o))) { say(c.name, `${p.name}=${o}: theme.json has no disabled state`); continue; }
        const pseudo = pseudoOf(o);
        if (pseudo && place !== 'button' && place !== 'link') { say(c.name, `${p.name}=${o}: theme.json takes a state only on the button and the link`); continue; }
        if (!pseudo || (pseudo === ':visited' && place !== 'link')) { say(c.name, `${p.name}=${o}: theme.json has no state for it`); continue; }
        const d = differs(paint(at({ [p.name]: o })?.paints), paint(at({})?.paints));
        if (Object.keys(d).length) own[pseudo] = d;
      }
    }
    if (isBlock(place)) styles.blocks[place] = own; else styles.elements[place] = own;
    mapped.push({ component: c.name, as: isBlock(place) ? `WordPress's ${blockName(place)} block` : `WordPress's ${place} element` });
    // Each other look of a button: a style of the Button block, holding what differs from its default.
    for (const p of lookAxes) {
      for (const o of p.options) {
        if (String(o) === defaults[p.name]) continue;
        const d = differs(merge(layout(c), paint(at({ [p.name]: o })?.paints)), base);
        if (!blockOf) { say(c.name, `${p.name}=${o}: theme.json has a style per block, and WordPress's ${place} is no block`); continue; }
        if (!Object.keys(d).length) { say(c.name, `${p.name}=${o}: the contract holds nothing it paints differently`); continue; }
        const slug = slugOf(`${c.name}-${o}`);
        variations.push({ file: `styles/blocks/${slug}.json`, component: c.name, theme: { $schema: WP_SCHEMA, version: 3, title: `${o}`, slug, blockTypes: [blockOf], styles: d } });
        mapped.push({ component: c.name, as: `${p.name}=${o}, a style of ${said} (${slug})` });
      }
    }
    if (typeof c.anatomy?.root?.height === 'number') say(c.name, `its height (${c.anatomy.root.height}px): theme.json sets no height on a ${isBlock(place) ? blockName(place) : place}`);
  }
  const out = {};
  if (Object.keys(styles.elements).length) out.elements = styles.elements;
  if (Object.keys(styles.blocks).length) out.blocks = styles.blocks;
  return { styles: Object.keys(out).length ? out : null, variations, mapped, left };
}
