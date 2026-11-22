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
  for (const surface of pageSurfaces(vars)) {
    const { ramps } = rampsOf(vars, surface.mode);
    if (ramps.size < 2) continue;
    const steps = [...new Set([...ramps.values()].flatMap((s) => [...s.keys()]))].sort(byNumber);
    for (const step of steps) {
    const at = [...ramps].filter(([, s]) => s.has(step)).map(([family, s]) => ({ family, rgb: s.get(step).rgb }));
    if (at.length < 2) continue;
    const measured = at.map((x) => ({ family: x.family, ratio: round(ratio(x.rgb, surface.rgb)), l: lightness(x.rgb) }));
    const pass = measured.filter((x) => x.ratio >= min), fail = measured.filter((x) => x.ratio < min);
    if (!pass.length || !fail.length) continue;
    const ls = measured.map((x) => x.l);
    out.push({ step, mode: surface.mode, surface: surface.token, pass: pass.map(({ family, ratio: r }) => ({ family, ratio: r })), fail: fail.map(({ family, ratio: r }) => ({ family, ratio: r })), light: [round(Math.min(...ls)), round(Math.max(...ls))] });
    }
  }
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
  const named = pairsOf(vars.color ?? {}).filter((p) => p.by === 'name');
  const page = pageSurfaces(vars), pageToken = page[0] && Object.keys(vars.color[page[0].mode] ?? {}).find((t) => clean(t) === page[0].token);
  const loose = !pageToken ? [] : [...new Set(modes.flatMap((m) => Object.keys(vars.color[m] ?? {})))]
    .filter((t) => FOREGROUND.test(t) && !/(^|\/)disabled(\/|$)/i.test(t) && !at.has(clean(t)) && !named.some((p) => p.text === t))
    .map((t) => ({ text: t, surface: pageToken, icon: /(^|\/)icons?(\/|$)/i.test(t) }))
    .filter((p) => modes.every((m) => { const a = opaque(vars.color[m]?.[p.text]), b = opaque(vars.color[m]?.[p.surface]); return !a || !b || ratio(a, b) >= (p.icon ? LARGE : TEXT); }))
    .map((p) => ({ ...p, by: 'name', ok: true }));
  for (const p of [...named, ...loose]) {
    if (!p.ok || at.has(clean(p.text)) || at.has(clean(p.surface))) continue;
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
  return out;
}

// The lines the Rules page shows, one per step or per pair, in plain words.
export function stepContrastLines(found, modes = []) {
  const inMode = (m) => (modes.length > 1 ? ` in ${m}` : '');
  return found.map((f) => ({
    where: `Step ${f.step}${inMode(f.mode)}`,
    value: `on ${f.surface}, ${f.pass.map((x) => shortFamily(x.family)).join(' · ')} reach ${TEXT}:1 and ${f.fail.map((x) => `${shortFamily(x.family)} is ${x.ratio}:1`).join(' · ')}, with lightness from ${f.light[0]} to ${f.light[1]}`,
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
