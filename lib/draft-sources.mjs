// draft-sources.mjs - where a drafted line on an intent-layer page comes from, so the person who reviews it reads it
// beside its source: each prop it names, as the code has it (its file and the values it takes) or as only Figma has it
// (a property of the Figma component, never a prop the code takes), and the line it says again, on the page itself,
// in Figma's description or annotations, or in the code's comment.
// A draft that names a Figma property as a prop is wrong for whoever writes the code: drafting says so (intent-changes.mjs
// keeps no such line), and the review shows it.
// Pure.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ticks = (s) => [...String(s ?? '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim().replace(/^[:@#]/, '').split(/[\s=.]/)[0]).filter(Boolean);
// A sentence that says the name is Figma's ("Figma's `showClock`", "the `showClock` property in Figma").
const SAYS_FIGMA = /\bfigma\b/i;

// The props a component has only in Figma (facts.components[name].props, from: 'Figma'). → Map(norm → name)
const figmaOnlyOf = (facts, component) => new Map(Object.entries(facts?.components?.[component]?.props ?? {}).filter(([, d]) => d?.from === 'Figma').map(([p]) => [norm(p), p]));

// The Figma-only props a line names as if they were props, in a sentence that does not say they are Figma's. → [name]
export function figmaOnlyNamed(text, facts, component) {
  const only = figmaOnlyOf(facts, component);
  if (!only.size) return [];
  const out = [];
  for (const s of String(text ?? '').split(/(?<=[.!?])\s+|\n/)) {
    if (SAYS_FIGMA.test(s)) continue;
    for (const t of ticks(s)) { const p = only.get(norm(t)); if (p && !out.includes(p)) out.push(p); }
  }
  return out;
}

// The words a line is made of, for comparing two lines: those of four letters or more, without accents.
const wordsOf = (s) => new Set(fold(s).replace(/`/g, ' ').match(/[a-z0-9]{4,}/g) ?? []);
// How much two lines share: the words both have, against the words of both (a long table that holds every word of a
// short line is not the line it says again).
const overlap = (a, b) => { const x = wordsOf(a), y = wordsOf(b); if (!x.size || !y.size) return 0; let n = 0; for (const w of x) if (y.has(w)) n++; return (2 * n) / (x.size + y.size); };

// d: { where, text }; component: the page's; facts: intent-truth.mjs's systemFacts; lines: [{ from, text }] the page's
// own lines (not its drafts) and what else is written about the component (Figma's description and annotations, the
// code's comment). → { props: [{ name, from: 'the code' | 'Figma', file?, options? }], figmaOnly?: [name], line?: { from, text } }
export function draftSource(d, { component = null, facts = null, lines = [] } = {}) {
  const c = component ? facts?.components?.[component] : null;
  const props = [];
  for (const t of ticks(d?.text)) {
    const [name, def] = Object.entries(c?.props ?? {}).find(([p]) => norm(p) === norm(t)) ?? [];
    if (!name || props.some((x) => x.name === name)) continue;
    props.push({ name, from: def.from === 'Figma' ? 'Figma' : 'the code', ...(def.from !== 'Figma' && c.file ? { file: c.file } : {}), ...(def.options?.length ? { options: def.options } : {}) });
  }
  const figmaOnly = component ? figmaOnlyNamed(d?.text, facts, component) : [];
  // The line it says again: the one it shares most with, at least half.
  let best = null, score = 0.5;
  for (const l of lines) { if (!l?.text) continue; const s = overlap(d?.text, l.text); if (s >= score) { best = l; score = s; } }
  return { props, ...(figmaOnly.length ? { figmaOnly } : {}), ...(best ? { line: { from: best.from, text: String(best.text) } } : {}) };
}

// What the drafter is told of a Figma-only prop, beside the code's own. → string
export const FIGMA_ONLY_RULE = '- A prop listed in figmaOnly is a property of the Figma component, not one the code takes: never write it as a prop. Say what the code does instead (from its props and what each holds), or name it as Figma\'s ("Figma\'s `showIcon`").';
