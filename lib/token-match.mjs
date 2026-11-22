// token-match.mjs - a value written by hand, matched to the system's token, and the fix ready for a yes.
//
// The engine already says a colour or a size is written by hand, and names the token when one holds that exact value.
// Where none does, the person was left to find the right one, and in Figma nothing named a variable at all. This names
// it, on both sides, the same way:
//   • the token of the same kind with that value, a semantic one before a primitive when both hold it;
//   • else the nearest, with how far it is: a colour by how it looks (OKLab, the difference said as ΔE), a size by its
//     px; a colour too far from any (ΔE over 4, visibly another colour) has none, and says so;
//   • and the fix, for a person to apply: in the code, a patch that writes var(--token) where the value was (the engine
//     never edits the code itself); in Figma, the bindings as the operations --figma-change takes, which a person signs
//     off before its script is written. Only exact matches go into a fix: a nearest one changes how it looks, so it is
//     named and left for the person to choose.
//
//   nearestColour(hex, entries)        → { name, hex, delta, exact } | null      entries: [[name, hex]]
//   nearestSize(px, entries)           → { name, px, diff, exact } | null        entries: [[name, px]]
//   matchLine(m)                       → the words for one match
//   figmaMatches(values, vars)         → [{ component, at, field, value, match }]
//   bindOps(matches)                   → { [component]: [{ op: 'bind', layer, field, variable, where? }] }
//   codeFixes(files, read)             → { patch, count }   files: the census's, each finding with its token

const hexRgb = (hex) => { const h = String(hex).replace('#', ''); const f = h.length <= 4 ? h.slice(0, 3).split('').map((c) => c + c).join('') : h.slice(0, 6); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); };
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
// sRGB → OKLab (Björn Ottosson's published matrices).
export function oklab(hex) {
  const [r, g, b] = hexRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export const deltaE = (a, b) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100; };
const FAR = 4;   // beyond this the shade is visibly another colour: none is offered
// A primitive is named for its place on a scale (blue-500, grey/100, palette…): a semantic token holding the same value
// is the one to write.
const primitive = (name) => /(^|[/.-])(\d{2,4}|palette|primitive|base|core)($|[/.-])/i.test(String(name));
const bySemantic = (a, b) => primitive(a[0]) - primitive(b[0]) || String(a[0]).localeCompare(String(b[0]));
const sameHex = (a, b) => String(a).toLowerCase().slice(0, 7) === String(b).toLowerCase().slice(0, 7);

export function nearestColour(hex, entries = []) {
  if (!/^#[0-9a-f]{3,8}$/i.test(String(hex)) || !entries.length) return null;
  const exact = entries.filter(([, h]) => sameHex(h, hex)).sort(bySemantic);
  if (exact.length) return { name: exact[0][0], hex: exact[0][1], delta: 0, exact: true };
  const near = entries.filter(([, h]) => /^#[0-9a-f]{3,8}$/i.test(String(h))).map(([n, h]) => [n, h, deltaE(hex, h)]).sort((a, b) => a[2] - b[2] || bySemantic(a, b))[0];
  return near && near[2] <= FAR ? { name: near[0], hex: near[1], delta: Math.round(near[2] * 10) / 10, exact: false } : null;
}
export function nearestSize(px, entries = []) {
  const v = Number(px);
  if (!Number.isFinite(v) || !entries.length) return null;
  const exact = entries.filter(([, p]) => Number(p) === v).sort(bySemantic);
  if (exact.length) return { name: exact[0][0], px: v, diff: 0, exact: true };
  const near = entries.map(([n, p]) => [n, Number(p), Math.abs(Number(p) - v)]).filter((x) => Number.isFinite(x[1])).sort((a, b) => a[2] - b[2] || bySemantic(a, b))[0];
  return near ? { name: near[0], px: near[1], diff: Math.round((near[1] - v) * 100) / 100, exact: false } : null;
}
export const matchLine = (m) => (!m ? 'the system has no token near it' : m.exact ? `the system's ${m.name} holds it` : m.hex ? `the nearest is ${m.name} (${m.hex}, ΔE ${m.delta})` : `the nearest is ${m.name} (${m.px}px, ${m.diff > 0 ? '+' : ''}${m.diff}px)`);

// ── Figma: each value with no variable, matched to one ─────────────────────────────────────────────────────────────
// values: the values capture ({ component: { hygiene: { raw: [{ at, field, value }] } } }); vars: the vars snapshot
// (color: { mode: { name: hex } }, sizing: { name: value }). A colour is matched in the first mode, as Figma draws it.
const COLOUR_FIELDS = new Set(['fill', 'stroke']);
const SIZE_FIELDS = new Set(['radius', 'gap', 'border']);
export function figmaMatches(values = {}, vars = {}) {
  const firstMode = Object.values(vars?.color ?? {})[0] ?? {};
  const colours = Object.entries(firstMode).filter(([, h]) => typeof h === 'string');
  const sizes = Object.entries(vars?.sizing ?? {}).map(([n, v]) => [n, parseFloat(v)]).filter(([, p]) => Number.isFinite(p));
  const out = [];
  for (const [component, v] of Object.entries(values ?? {})) {
    if (component.startsWith('_')) continue;
    for (const r of v?.hygiene?.raw ?? []) {
      const match = COLOUR_FIELDS.has(r.field) ? nearestColour(r.value, colours) : SIZE_FIELDS.has(r.field) ? nearestSize(parseFloat(r.value), sizes) : null;
      if (COLOUR_FIELDS.has(r.field) || SIZE_FIELDS.has(r.field)) out.push({ component, at: r.at, field: r.field, value: r.value, match });
    }
  }
  return out;
}
// The bindings for the exact matches, as --figma-change takes them: the layer by its path inside the component, the
// variant it is on as `where`. A border is its stroke's weight.
const FIELD = { fill: 'fill', stroke: 'stroke', radius: 'radius', gap: 'gap', border: 'strokeWeight' };
const axesOf = (vn) => Object.fromEntries(String(vn).split(/,\s*/).map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0]));
export function bindOps(matches = []) {
  const out = {};
  for (const m of matches) {
    if (!m.match?.exact || !FIELD[m.field]) continue;
    const [variant, ...path] = String(m.at).split('/');
    const where = axesOf(variant);
    const op = { op: 'bind', layer: path.join('/'), field: FIELD[m.field], variable: m.match.name, ...(Object.keys(where).length ? { where } : {}) };
    (out[m.component] ??= []).push(op);
  }
  return out;
}

// ── Code: a patch that writes each exact token where its value was ───────────────────────────────────────────────
// files: [{ file, text, findings: [{ line, value, token, kind }] }] (the census's, with each file's text). A finding's
// token is "var(--x)" or "var(--x) (or …)": the first is written. → { patch, count }
// read(file): the file's text, when a finding's file does not carry it.
export async function codeFixes(files = [], read = () => '') {
  const { linesDiff } = await import('./rename-sweep.mjs');
  const byFile = new Map();
  let count = 0;
  for (const f of files) {
    const lines = String(f.text ?? read(f.file) ?? '').split('\n'), changes = new Map();
    for (const x of f.findings ?? []) {
      const tok = /^var\(--[\w-]+\)/.exec(String(x.token ?? ''))?.[0];
      if (!tok || !x.value) continue;
      const now = changes.get(x.line) ?? lines[x.line - 1];
      if (now == null || !now.includes(x.value)) continue;
      changes.set(x.line, now.replace(x.value, tok));
      count++;
    }
    if (changes.size) byFile.set(f.file, { lines, changes });
  }
  return { patch: byFile.size ? linesDiff(byFile) : '', count };
}
