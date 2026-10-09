// rendered-expect.mjs - where a rendered assertion's expected value comes from (Gate [24], Renders correctly).
//
// A colour typed into an assertion goes stale the day its Figma variable changes, and the gate then fails on a value
// nobody chose. An assertion that names the variable instead (`figmaVar: 'input/border/default'`) takes its expected
// colour from the Figma snapshot, in the assertion's mode, on every run.
import { parseColor, sameColor } from './css-values.mjs';

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

// The rendered value against the expected one: the same text, or the same colour written another way.
export const renderedMatches = (got, expected) => got === expected || sameColor(got, expected) === true;
