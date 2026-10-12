// rendered-expect.mjs - where a rendered assertion's expected value comes from (Gate [24], Renders correctly).
//
// A colour typed into an assertion goes stale the day its Figma variable changes, and the gate then fails on a value
// nobody chose. An assertion that names the variable instead (`figmaVar: 'input/border/default'`) takes its expected
// colour from the Figma snapshot, in the assertion's mode, on every run.
import { parseColor, sameColor } from './css-values.mjs';
import { modeSwitchFor } from './mode-resolver.mjs';

// The rgb()/rgba() string getComputedStyle gives for a colour.
const computedColor = (hex) => {
  const c = parseColor(hex);
  if (!c) return null;
  const [r, g, b] = c.slice(0, 3).map((x) => Math.round(x));
  return c[3] < 1 ? `rgba(${r}, ${g}, ${b}, ${+c[3].toFixed(3)})` : `rgb(${r}, ${g}, ${b})`;
};

// assertions: RENDERED_ASSERTIONS · color: the vars snapshot's `color` ({ <modeKey>: { <figma path>: hex } }) · modes:
// loadModes(cfg) · defaultScheme: rendered.colorScheme or 'light'.
// → { assertions, skipped: [why] }: each figmaVar assertion with its expected colour filled in; one whose variable or
// mode the snapshot does not hold is skipped with the reason, never compared against a guess.
export function expandFigmaVars(assertions, color = {}, modes = [], defaultScheme = 'light') {
  const keyOf = new Map();
  for (const m of modes) { keyOf.set(String(m.snapshotKey).toLowerCase(), m.snapshotKey); keyOf.set(String(m.name).toLowerCase(), m.snapshotKey); }
  const out = [], skipped = [];
  for (const a of assertions) {
    if (!a.figmaVar) { out.push(a); continue; }
    const scheme = a.colorScheme ?? defaultScheme;
    const key = keyOf.get(String(scheme).toLowerCase()) ?? String(scheme).toLowerCase();
    const inMode = color[key];
    const path = String(a.figmaVar).replace(/\/color$/, '');
    const hex = inMode?.[path] ?? inMode?.[`${path}/color`];
    const expected = hex ? computedColor(hex) : null;
    if (!expected) { skipped.push(`${a.plugin} ${a.selector} → ${a.prop}: ${inMode ? `Figma variable '${a.figmaVar}' is not in the snapshot's '${scheme}' mode` : `the Figma snapshot has no '${scheme}' mode`}`); continue; }
    out.push({ ...a, expected, note: a.note ?? `Figma ${path} (${scheme})` });
  }
  return { assertions: out, skipped };
}

// The rendered value against the expected one: the same text, the same colour written another way, the same length to
// a hundredth of a pixel (a letter spacing Figma gives in em), or no letter spacing written as normal or as 0px.
const px = (v) => (/^-?\d*\.?\d+px$/.test(String(v ?? '').trim()) ? parseFloat(v) : null);
export const renderedMatches = (got, expected) => {
  if (got === expected || sameColor(got, expected) === true) return true;
  const zero = (v) => v === 'normal' || px(v) === 0;
  if (zero(got) && zero(expected)) return true;
  return px(got) != null && px(expected) != null && Math.abs(px(got) - px(expected)) < 0.01;
};

// A Figma text style from the typography snapshot, as the values getComputedStyle gives: size, weight and line height,
// letter spacing (px, or em of the style's size, as the snapshot writes it; none is normal) and text case (none when
// Figma keeps the original case). A facet the style does not have (an auto line height) is left out.
export function textStyleExpectations(style) {
  const out = { fontSize: style.size, fontWeight: style.weight, lineHeight: style.lh };
  const ls = String(style.ls ?? '').trim();
  if (!ls) out.letterSpacing = 'normal';
  else if (/em$/.test(ls) && px(style.size) != null) out.letterSpacing = `${+(parseFloat(ls) * px(style.size)).toFixed(3)}px`;
  else out.letterSpacing = ls;
  out.textTransform = style.textTransform ?? 'none';
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
}

// How to put an assertion's mode (its colorScheme, a mode's name or snapshot key) on the page: the project's own switch
// for that mode (a class, a data attribute, a media query), or prefers-color-scheme for a scheme no mode names.
export function schemeSwitch(scheme, modes = []) {
  const want = String(scheme).toLowerCase();
  const mode = modes.find((m) => String(m.snapshotKey).toLowerCase() === want || String(m.name).toLowerCase() === want);
  if (!mode) return { media: [{ name: 'prefers-color-scheme', value: want === 'dark' ? 'dark' : 'light' }] };
  return modeSwitchFor(mode);
}
