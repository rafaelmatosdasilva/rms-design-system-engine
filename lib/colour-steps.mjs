// colour-steps.mjs - whether a colour scale's step means the same thing in every colour.
//
// A system with colour ramps (blue/100 to blue/900, red/100 to red/900) numbers its steps so that a designer can swap one
// colour for another and keep the look: red/600 where blue/600 was. That holds only when the same step is about as light
// in every colour. A yellow is far lighter than a blue at the same number, so the 600 that reads as text in blue can fall
// under 4.5:1 in yellow, and the swap breaks contrast with no warning. Nothing in the names says so, and the contrast
// check measures only the pairs the system already has, never the ones a swap would make.
//
// This reads the ramps from the token names (a family, then a number), measures each step on the system's own surface in
// each mode, and says two things:
//   stepContrast(vars)  → the steps that share a number but not a contrast: on the same surface, the step meets 4.5:1 in
//                         some colours and falls under it in others, with how light each looks (OKLCH lightness)
//   stepSwaps(vars)     → the semantic colours that point at a step today and pass, and would fall under their ratio
//                         if moved to another colour at the same step, with the colours that would break them
// vars: the vars snapshot ({ color: { mode: { token: value } }, aliases: { mode: { token: [chain] } }, figmaTokens? }).
// A ramp needs three steps or more, and a step is compared only where two colours or more have it. A see-through
// colour is left out, since what is under it decides what the eye sees.
//
// Pure: nothing is read or written here.

import { parseColor } from './css-values.mjs';
import { ratio, pairsOf, FOREGROUND } from './token-pairs.mjs';
import { systemSurfaces } from './design-a11y.mjs';
import { deriveContrastPairs } from './pair-derive.mjs';

const TEXT = 4.5, LARGE = 3;
const clean = (n) => String(n ?? '').replace(/\/colou?r$/i, '');
const round = (x) => Math.round(x * 100) / 100;
const opaque = (v) => { const c = parseColor(v); return c && (c[3] == null || c[3] >= 1) ? { r: c[0], g: c[1], b: c[2] } : null; };

// How light a colour looks: OKLab's L, 0 for black and 1 for white, so a yellow and a blue at one number can be compared
// as the eye compares them.
export function lightness({ r, g, b }) {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

// Where a token's name puts it on a ramp: a family, then a number, as its own part (blue/600) or ending its last one
// (Neutral 600, red-600, gray600). null for a name with no step.
export function stepIn(token) {
  const parts = clean(token).split('/');
  const last = parts.at(-1), m = /^(.*?[A-Za-z])[\s_-]?(\d{1,4})$/.exec(last);
  if (/^\d{1,4}$/.test(last)) return parts.length < 2 ? null : { family: parts.slice(0, -1).join('/'), step: String(Number(last)) };
  return m ? { family: [...parts.slice(0, -1), m[1].trim()].join('/'), step: String(Number(m[2])) } : null;
}

// The ramps in a mode: each solid colour whose name puts it on a ramp, grouped by family, three steps or more. A
// primitive may change with the mode (a dark ramp running the other way), so each mode reads its own: the snapshot's
// primitives, then its colours, then Figma's variables, in that mode (the first mode a variable has when it has one).
// mode null: the first mode. → { ramps: Map(family → Map(step → { token, rgb })), at: Map(token → { family, step }) }
export function rampsOf(vars = {}, mode = null) {
  const m = mode ?? Object.keys(vars?.primitives ?? {})[0] ?? Object.keys(vars?.color ?? {})[0] ?? null;
  const values = new Map();
  const take = (map) => { for (const [t, v] of Object.entries(map ?? {})) if (!values.has(clean(t))) values.set(clean(t), v); };
  if (m != null) { take(vars?.primitives?.[m]); take(vars?.color?.[m]); }
  for (const t of vars?.figmaTokens?.tokens ?? []) {
    if (t?.kind && t.kind !== 'COLOR') continue;
    const v = t?.values?.[m] ?? Object.values(t?.values ?? {})[0];
    if (t?.name && v != null && !values.has(clean(t.name))) values.set(clean(t.name), v);
  }
  const ramps = new Map(), at = new Map();
  for (const [token, v] of values) {
    const s = stepIn(token), rgb = s && opaque(v);
    if (!rgb) continue;
    if (!ramps.has(s.family)) ramps.set(s.family, new Map());
    ramps.get(s.family).set(s.step, { token, rgb });
  }
  for (const [family, steps] of [...ramps]) if (steps.size < 3) ramps.delete(family);
  for (const [family, steps] of ramps) for (const [step, { token }] of steps) at.set(token, { family, step });
  return { ramps, at };
}

// The surface each mode puts things on: the system's base or page surface when its names say which, else its first.
// → [{ mode, token, rgb }]
export function pageSurfaces(vars = {}) {
  const out = [];
  for (const [mode, list] of Object.entries(systemSurfaces(vars))) {
    const base = list.find((s) => /(^|\/)(base|default|page|canvas|primary)(\/|$)/i.test(clean(s.token))) ?? list[0];
    const rgb = base && opaque(base.value);
    if (rgb) out.push({ mode, token: clean(base.token), rgb });
  }
  return out;
}

const shortFamily = (f) => f.split('/').at(-1);
const byNumber = (a, b) => Number(a) - Number(b);

// The steps that share a number and not a contrast. → [{ step, mode, surface, pass: [{ family, ratio }], fail: [{ family, ratio }], light: [min, max] }]
export function stepContrast(vars = {}, { min = TEXT } = {}) {
  const out = [];
  let compared = 0;   // each step two colours or more share, in each mode: what the rule counts as followed or not
  for (const surface of pageSurfaces(vars)) {
    const { ramps } = rampsOf(vars, surface.mode);
    if (ramps.size < 2) continue;
    const steps = [...new Set([...ramps.values()].flatMap((s) => [...s.keys()]))].sort(byNumber);
    for (const step of steps) {
    const at = [...ramps].filter(([, s]) => s.has(step)).map(([family, s]) => ({ family, rgb: s.get(step).rgb }));
    if (at.length < 2) continue;
    compared++;
    const measured = at.map((x) => ({ family: x.family, ratio: round(ratio(x.rgb, surface.rgb)), l: lightness(x.rgb) }));
    const pass = measured.filter((x) => x.ratio >= min), fail = measured.filter((x) => x.ratio < min);
    if (!pass.length || !fail.length) continue;
    const ls = measured.map((x) => x.l);
    out.push({ step, mode: surface.mode, surface: surface.token, pass: pass.map(({ family, ratio: r }) => ({ family, ratio: r })), fail: fail.map(({ family, ratio: r }) => ({ family, ratio: r })), light: [round(Math.min(...ls)), round(Math.max(...ls))] });
    }
  }
  out.compared = compared;
  return out;
}

// The step a semantic colour points at in a mode, through its aliases: the first token of its chain that is a ramp's.
const stepOf = (vars, at, mode, token) => {
  const chain = vars?.aliases?.[mode]?.[token] ?? vars?.aliases?.[mode]?.[`${clean(token)}/color`];
  for (const n of Array.isArray(chain) ? chain : chain ? [chain] : []) if (at.has(clean(n))) return at.get(clean(n));
  return null;
};

// The semantic pairs a swap at the same step would break. Each pair the system's names make (token-pairs.mjs pairsOf)
// that meets its ratio today, its text colour or its surface pointing at a ramp's step: the same step of each other
// colour is put in its place, in each mode, against the other side as it is.
// → [{ text, surface, side: 'text' | 'surface', from, step, threshold, breaks: [{ family, mode, ratio }] }]
export function stepSwaps(vars = {}) {
  const { ramps, at } = rampsOf(vars);
  if (ramps.size < 2) return [];
  // A name puts a token on the same ramp in every mode, so where each one sits is read once, from the first mode.
  const modes = Object.keys(vars?.color ?? {});
  const out = [];
  // The pairs the names make, then each text colour with none on the page's own surface, where it is drawn by default.
  // A component's own text on its own background (button/text on button/background), as the contrast check pairs them.
  const all = [...new Set(modes.flatMap((m) => Object.keys(vars.color[m] ?? {})))];
  const passes = (p) => modes.every((m) => { const a = opaque(vars.color[m]?.[p.text]), b = opaque(vars.color[m]?.[p.surface]); return !a || !b || ratio(a, b) >= (p.icon ? LARGE : TEXT); });
  const named = [...pairsOf(vars.color ?? {}).filter((p) => p.by === 'name'), ...deriveContrastPairs(all).map((p) => ({ text: p.text, surface: p.bg, icon: !!p.large }))]
    .filter((p, i, list) => list.findIndex((q) => q.text === p.text && q.surface === p.surface) === i)
    .map((p) => ('ok' in p ? p : { ...p, by: 'name', ok: passes(p) }));
  const page = pageSurfaces(vars), pageToken = page[0] && Object.keys(vars.color[page[0].mode] ?? {}).find((t) => clean(t) === page[0].token);
  const loose = !pageToken ? [] : all
    .filter((t) => FOREGROUND.test(t) && !/(^|\/)disabled(\/|$)/i.test(t) && !at.has(clean(t)) && !named.some((p) => p.text === t))
    .map((t) => ({ text: t, surface: pageToken, icon: /(^|\/)icons?(\/|$)/i.test(t) }))
    .filter(passes)
    .map((p) => ({ ...p, by: 'name', ok: true }));
  let checked = 0;   // each pair a side of which points at a step: what the rule counts as followed or not
  for (const p of [...named, ...loose]) {
    if (!p.ok || at.has(clean(p.text)) || at.has(clean(p.surface))) continue;
    if (modes.some((m) => stepOf(vars, at, m, p.text) || stepOf(vars, at, m, p.surface))) checked++;
    const threshold = p.icon ? LARGE : TEXT;
    for (const side of ['text', 'surface']) {
      const own = side === 'text' ? p.text : p.surface, other = side === 'text' ? p.surface : p.text;
      const breaks = [];
      let from = null;
      for (const mode of modes) {
        const s = stepOf(vars, at, mode, own);
        const against = opaque(vars.color[mode]?.[other]);
        if (!s || !against) continue;
        from = from ?? s;
        for (const [family, steps] of rampsOf(vars, mode).ramps) {
          if (family === s.family || !steps.has(s.step)) continue;
          const r = round(ratio(steps.get(s.step).rgb, against));
          if (r < threshold) breaks.push({ family, mode, ratio: r });
        }
      }
      if (breaks.length) out.push({ text: p.text, surface: p.surface, side, from: from.family, step: from.step, threshold, breaks });
    }
  }
  out.checked = checked;
  return out;
}

// The lines the Rules page shows, one per step or per pair, in plain words.
export function stepContrastLines(found, modes = []) {
  const inMode = (m) => (modes.length > 1 ? ` in ${m}` : '');
  return found.map((f) => ({
    where: `Step ${f.step}${inMode(f.mode)}`,
    value: `on ${f.surface}, ${f.pass.map((x) => shortFamily(x.family)).join(' · ')} ${f.pass.length === 1 ? 'reaches' : 'reach'} ${TEXT}:1 and ${f.fail.map((x) => `${shortFamily(x.family)} is ${x.ratio}:1`).join(' · ')}, with lightness from ${f.light[0]} to ${f.light[1]}`,
  }));
}
export function stepSwapLines(found) {
  return found.map((f) => {
    const worst = new Map();
    for (const b of f.breaks) if (!worst.has(b.family) || b.ratio < worst.get(b.family).ratio) worst.set(b.family, b);
    const list = [...worst.values()].sort((a, b) => a.ratio - b.ratio).map((b) => `${shortFamily(b.family)}/${f.step} is ${b.ratio}:1`);
    return { where: f.side === 'text' ? f.text : f.surface, value: `${f.side === 'text' ? `on ${f.surface}` : `under ${f.text}`}, from ${shortFamily(f.from)}/${f.step}: ${list.join(' · ')}, under ${f.threshold}:1` };
  });
}

// ── The colour pages: each step beside its contrast in every colour ─────────────────────────────────────────────────
// What a designer picking a colour needs to see where they pick it: for each step two colours or more share, each
// colour's token at that step with its contrast on the system's own surface in each mode, and whether it reaches 4.5:1.
// A step that splits (some colours reach it and some do not, in a mode) is marked, with the colours that fall short
// (each with its mode, where the system has more than one).
// varOf(figmaName) → the CSS variable, when the code has one. → [{ step, splits, short: [family], modes: [mode],
// surfaces: { mode: token }, rows: [{ figma, var, family, cells: [{ mode, hex, ratio, reads }] }] }], fewest first.
const hex = ({ r, g, b }) => `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
export function stepTable(vars = {}, { varOf = () => null, min = TEXT } = {}) {
  const surfaces = pageSurfaces(vars);
  if (!surfaces.length) return [];
  const byMode = new Map(surfaces.map((s) => [s.mode, { surface: s, ramps: rampsOf(vars, s.mode).ramps }]));
  const first = byMode.get(surfaces[0].mode).ramps;
  if (first.size < 2) return [];
  const steps = [...new Set([...first.values()].flatMap((s) => [...s.keys()]))].sort(byNumber);
  const out = [];
  for (const step of steps) {
    const families = [...first].filter(([, s]) => s.has(step)).map(([f]) => f);
    if (families.length < 2) continue;
    const rows = families.map((family) => {
      const token = first.get(family).get(step).token;
      const cells = surfaces.map((s) => {
        const at = byMode.get(s.mode).ramps.get(family)?.get(step);
        if (!at) return { mode: s.mode, hex: null, ratio: null, reads: null };
        const r = round(ratio(at.rgb, s.rgb));
        return { mode: s.mode, hex: hex(at.rgb), ratio: r, reads: r >= min };
      });
      return { figma: token, var: varOf(token), family: shortFamily(family), cells };
    });
    const short = new Set();
    let splits = false;
    for (const s of surfaces) {
      const cells = rows.map((r) => r.cells.find((c) => c.mode === s.mode)).filter((c) => c?.ratio != null);
      if (cells.some((c) => c.reads) && cells.some((c) => !c.reads)) { splits = true; rows.forEach((r) => { const c = r.cells.find((x) => x.mode === s.mode); if (c && c.ratio != null && !c.reads) short.add(surfaces.length > 1 ? `${r.family} in ${s.mode}` : r.family); }); }
    }
    out.push({ step, splits, short: [...short], modes: surfaces.map((s) => s.mode), surfaces: Object.fromEntries(surfaces.map((s) => [s.mode, s.token])), rows });
  }
  return out;
}

// The health report's question, from the same lists: can one colour stand in for another at a step? → the answer's
// evidence, or null when the system has no two colour scales to compare.
export function stepStandIn(vars = {}) {
  const table = stepTable(vars), swaps = stepSwaps(vars);
  if (!table.length) return null;
  const split = table.filter((t) => t.splits);
  return { steps: table.length, split: split.map((t) => ({ step: t.step, short: t.short })), swaps: swaps.length, checked: swaps.checked ?? 0 };
}
