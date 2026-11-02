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
const shared = (a, b) => { const x = wordsOf(a), y = wordsOf(b); let n = 0; for (const w of x) if (y.has(w)) n++; return { n, of: x.size + y.size }; };
const overlap = (a, b) => { const { n, of } = shared(a, b); return of ? (2 * n) / of : 0; };

// The line a text says again: of lines ([{ text }]), the one it shares most words with, at least half (and at least
// words of them: a short line that shares one word with another does not say it again). → that line, or null
export function saidAgain(text, lines = [], { words = 1 } = {}) {
  let best = null, score = 0.5;
  for (const l of lines) { if (!l?.text || shared(text, l.text).n < words) continue; const s = overlap(text, l.text); if (s >= score) { best = l; score = s; } }
  return best;
}

// d: { where, text }; component: the page's; facts: intent-truth.mjs's systemFacts; lines: [{ from, text }] the page's
// own lines (not its drafts) and what else is written about the component (Figma's description and annotations, the
// code's comment). → { props: [{ name, from: 'the code' | 'Figma', file?, options? }], figmaOnly?: [name], rewrite?,
// carriers?: { name: { prop, field? } }, line?: { from, text } }
export function draftSource(d, { component = null, facts = null, lines = [] } = {}) {
  const c = component ? facts?.components?.[component] : null;
  const props = [];
  for (const t of ticks(d?.text)) {
    const [name, def] = Object.entries(c?.props ?? {}).find(([p]) => norm(p) === norm(t)) ?? [];
    if (!name || props.some((x) => x.name === name)) continue;
    props.push({ name, from: def.from === 'Figma' ? 'Figma' : 'the code', ...(def.from !== 'Figma' && c.file ? { file: c.file } : {}), ...(def.options?.length ? { options: def.options } : {}) });
  }
  const figmaOnly = component ? figmaOnlyNamed(d?.text, facts, component) : [];
  // A draft that names one is offered a rewrite (rewriteOf), with what carries each in the code.
  const carriers = Object.fromEntries(figmaOnly.map((p) => [p, carrierOf(p, c)]).filter(([, k]) => k));
  const fix = figmaOnly.length ? { rewrite: rewriteOf(d?.text, facts, component), ...(Object.keys(carriers).length ? { carriers } : {}) } : {};
  const best = saidAgain(d?.text, lines);
  return { props, ...(figmaOnly.length ? { figmaOnly } : {}), ...fix, ...(best ? { line: { from: best.from, text: String(best.text) } } : {}) };
}

// Where the code carries a property only Figma has: the code's prop, or a field of one, whose name is the property's
// (showIcon → icon, a "show", "has", "with", "is" or "display" taken off) or whose doc comment names it ("- time {String}:
// shown as a clock" carries showClock). → { prop, field? } or null
const BARE = /^(show|has|with|is|display|enable|use)(?=.{3,})/;
const sing = (s) => s.replace(/s$/, '');
export function carrierOf(name, c) {
  const whole = norm(name), bare = whole.replace(BARE, '');
  const keys = new Set([whole, bare].map(sing));
  const code = Object.entries(c?.props ?? {}).filter(([, d]) => d?.from !== 'Figma').map(([p]) => p);
  for (const p of code) if (keys.has(sing(norm(p)))) return { prop: p };
  const doc = c?.doc ?? [];
  for (const l of doc) if (l.field && keys.has(sing(norm(l.field)))) return { prop: l.prop, field: l.field };
  // Its doc comment's words: the word the property is named after, written in what a prop or field is said to do.
  const word = new RegExp(`\\b${bare.replace(/[^a-z0-9]/g, '')}s?\\b`, 'i');
  if (bare.length >= 3) for (const l of [...doc].sort((a, b) => (b.field ? 1 : 0) - (a.field ? 1 : 0))) if (word.test(fold(l.says))) return l.field ? { prop: l.prop, field: l.field } : { prop: l.prop };
  return null;
}

// The draft as it could read instead: each Figma-only property it names as a prop, named as Figma's, with what carries
// it in the code when the code says ("Figma's `showClock` (in the code, the `time` field of `savedAt`)"). A line it
// names none in comes back as it was. → string
export function rewriteOf(text, facts, component) {
  const c = facts?.components?.[component];
  const only = figmaOnlyOf(facts, component);
  if (!only.size) return String(text ?? '');
  const parts = String(text ?? '').split(/((?<=[.!?])\s+|\n)/);
  return parts.map((s, i) => (i % 2 || SAYS_FIGMA.test(s) ? s : s.replace(/`([^`\n]+)`/g, (m, inner) => {
    const t = inner.trim().replace(/^[:@#]/, '').split(/[\s=.]/)[0];
    const p = only.get(norm(t)); if (!p) return m;
    const k = carrierOf(p, c);
    return `Figma's ${m}` + (k ? ` (in the code, ${k.field ? `the \`${k.field}\` field of \`${k.prop}\`` : `the \`${k.prop}\` prop`})` : '');
  }))).join('');
}

// What the drafter is told of a Figma-only prop, beside the code's own. → string
export const FIGMA_ONLY_RULE = '- A prop listed in figmaOnly is a property of the Figma component, not one the code takes: never write it as a prop. Say what the code does instead (from its props and what each holds), or name it as Figma\'s ("Figma\'s `showIcon`").';
