// prop-vocabulary.mjs - which prop values mean the same thing, and the wrong names an agent will guess (idea I58).
//
// Props do not converge like tokens: every library names them its own way, and the stable thing is what a value
// means. This pairs a value with its counterpart by meaning (L and large, error and danger), so a finding can say
// which value corresponds to which. It never makes them equal: a different name for the same value is still a
// parity difference, and every check that compares names keeps failing on it. The pairing only explains the
// difference and builds the table of rejected names that tells an agent the right one.
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Words different libraries use for the same value.
export const SYNONYMS = [
  ['danger', 'error', 'critical', 'negative', 'destructive'], ['warning', 'caution', 'warn'], ['success', 'positive', 'ok'],
  ['info', 'informative', 'information'], ['neutral', 'subtle'], ['primary', 'brand', 'main'],
];
export const SIZES = [['xs', 'xsmall', 'extrasmall'], ['s', 'sm', 'small'], ['m', 'md', 'medium'], ['l', 'lg', 'large'], ['xl', 'xlarge', 'extralarge']];
export const sizeGroup = (v) => SIZES.find((g) => g.includes(norm(v))) ?? null;
const synGroup = (v) => SYNONYMS.find((g) => g.includes(norm(v))) ?? null;

// The value in `candidates` that means the same as `value` under another name, or null. An exact name is not a
// counterpart: it is the same value.
export function counterpart(value, candidates = []) {
  if (candidates.some((c) => norm(c) === norm(value))) return null;
  const s = synGroup(value), g = sizeGroup(value);
  return candidates.find((c) => (s && s.includes(norm(c))) || (g && sizeGroup(c) === g)) ?? null;
}

// Wrong name → the right one, for one enum prop. The right names are the code's when it has its own (an agent
// writes code), else Figma's. Wrong names: the other side's name for the same value, and the synonyms and size
// spellings of each right value that are not themselves right.
export function rejectedNames({ figma = [], code = [] } = {}) {
  const right = code.length ? code : figma;
  const isRight = (v) => right.some((r) => norm(r) === norm(v));
  const out = {};
  const add = (wrong, to) => { if (wrong && !isRight(wrong) && !(norm(wrong) in lower(out))) out[wrong] = to; };
  if (code.length) for (const f of figma) { const c = counterpart(f, code); if (c) add(f, c); }
  for (const r of right) for (const w of [...(synGroup(r) ?? []), ...(sizeGroup(r) ?? [])]) add(w, r);
  return out;
}
const lower = (o) => Object.fromEntries(Object.keys(o).map((k) => [norm(k), 1]));

// The right name for a wrong one, from a rejected table, ignoring letter case.
export const rightFor = (rejected, value) => Object.entries(rejected ?? {}).find(([w]) => norm(w) === norm(value))?.[1] ?? null;
