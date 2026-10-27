// layer-questions.mjs - two questions an agent asks the documentation, answered from the intent layer (and Figma's
// descriptions) with no model run, scored beside the coverage of each component's own questions (doc-coverage.mjs).
//
//   tokenByPurpose(tokens, { layer, describe }) → { asked, answered: [{ token, from }], missing: [token] }
//     Which token is for this? Asked of each token the components use. Answered when something an agent reads says
//     what it is for: its Figma description, its own entry in the intent layer, or a line on a page that names it.
//     An entry whose purpose only repeats the token's name and modes ("x has Light and Dark mode values from Figma")
//     says nothing an agent can choose by, and is no answer.
//   absentComponent(names, { layer }) → { rule: { where, text } | null, kinds: [{ kind, said }], asked, answered }
//     Is there a toast? Asked of the components agents commonly reach for that the system does not have. The
//     documentation answers no when it says what to do when no component fits (a rule, anywhere in the layer) or names
//     the missing kind and what to use instead. Without either, an agent builds one of its own.
//
// Pure. layer: the intent layer snapshot (intent-layer.mjs readIntentLayer).

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const lines = (e) => [e.summary, ...(e.purpose ?? []), ...(e.whenToUse ?? []), ...(e.whenNotToUse ?? []), ...(e.mistakes ?? []), ...(e.limitations ?? []), ...(e.rules ?? []).map((r) => r?.text ?? r), ...(e.sections ?? []).map((s) => s?.text ?? '')]
  .flatMap((t) => String(t ?? '').split(/\n+/)).map((t) => t.trim()).filter(Boolean);

// A purpose that says nothing but the token's own name, its modes or what it points at (aliases --primitives-yellow).
const FILLER = new Set(['has', 'have', 'the', 'a', 'an', 'and', 'or', 'mode', 'modes', 'value', 'values', 'from', 'figma', 'light', 'dark', 'in', 'of', 'with', 'for', 'is', 'token', 'variable', 'its', 'aliases', 'alias', 'points', 'to', 'same', 'as']);
export function saysSomething(text, name) {
  const own = new Set(String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const words = String(text ?? '').toLowerCase().replace(/`[^`]*`/g, ' ').replace(/--[\w-]+/g, ' ').replace(/\b[\w-]+(\/[\w-]+)+/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  return words.filter((w) => !FILLER.has(w) && !own.has(w) && !own.has(w.replace(/s$/, '')) && !/^\d+$/.test(w)).length >= 2;
}

// Where an agent learns what one token is for, or null. tokens may be named with or without their /color.
export function tokenAnswerer({ layer = null, describe = () => null } = {}) {
  const entries = new Map((layer?.entities ?? []).filter((e) => e.kind === 'token').map((e) => [norm(String(e.name).replace(/\/colou?r$/, '')), e]));
  // Every line on the layer's other pages (foundations, patterns, components): one that names a token says what it is for.
  const prose = (layer?.entities ?? []).filter((e) => e.kind !== 'token').flatMap((e) => lines(e).map((t) => ({ t, page: e.name })));
  return (token) => {
    if (describe(token)) return 'Figma';
    const bare = String(token).replace(/\/colou?r$/, ''), own = entries.get(norm(bare));
    if (own && (own.purpose ?? []).some((p) => saysSomething(p, own.name))) return 'its entry in the intent layer';
    // Named on a page: its full name, or its CSS name (button/background/color → --button-background-color).
    const names = [bare, bare + '/color', '--' + bare.replace(/\//g, '-'), '--' + bare.replace(/\//g, '-') + '-color'];
    const hit = prose.find(({ t }) => names.some((n) => t.includes(n)) && saysSomething(names.reduce((x, n) => x.split(n).join(' '), t), bare));
    return hit ? `the ${hit.page} page` : null;
  };
}
export function tokenByPurpose(tokens, opts = {}) {
  const answer = tokenAnswerer(opts), answered = [], missing = [];
  for (const token of tokens) { const from = answer(token); if (from) answered.push({ token, from }); else missing.push(token); }
  return { asked: tokens.length, answered, missing };
}

// What agents most often reach for, by the words a request uses for it.
export const COMMON_KINDS = ['toast', 'snackbar', 'modal', 'dialog', 'drawer', 'tooltip', 'popover', 'accordion', 'tabs', 'carousel', 'stepper', 'breadcrumb', 'pagination', 'avatar', 'badge', 'chip', 'tag', 'slider', 'switch', 'toggle', 'datepicker', 'dropdown', 'menu', 'table', 'card', 'alert', 'banner', 'spinner', 'skeleton', 'progress', 'rating', 'timeline'];
// A rule that says what to do when the system has no component for what is needed.
const NO_FIT = [
  /\b(no|none of the)\b[^.]{0,40}\bcomponents?\b[^.]{0,40}\b(fits?|exists?|matches|available|covers?)\b/i,
  /\bnot (in|part of) the (design )?(system|catalog|library)\b/i,
  /\b(do not|don't|never)\b[^.]{0,20}\b(invent|make up)\b[^.]{0,30}\bcomponents?\b/i,
  /\b(do not|don't|never)\b[^.]{0,20}\b(create|build|add)\b (a |any )?(new|custom|your own|one-off|bespoke) components?\b/i,
  /\bwithout a component\b/i,
];
// more: other texts agents read, as [{ name, lines }] (the project's own AGENTS.md).
export function absentComponent(names, { layer = null, more = [] } = {}) {
  const have = [...names].map(norm);
  const pages = [{ name: 'the system', lines: (layer?.system?.sections ?? []).flatMap((s) => String(s?.text ?? '').split(/\n+/)) }, ...(layer?.entities ?? []).filter((e) => e.kind !== 'token').map((e) => ({ name: e.name, lines: lines(e) })), ...more];
  // Only a rule for every case: one about a kind or a component in particular (alerts, `cardSlot`) answers
  // for that one alone.
  const kindWord = new RegExp(`\\b(${COMMON_KINDS.join('|')})s?\\b`, 'i');
  let rule = null;
  const general = (l) => !kindWord.test(l) && !/`/.test(l) && !have.some((n) => n.length > 3 && norm(l).includes(n));
  for (const p of pages) { const t = p.lines.find((l) => NO_FIT.some((re) => re.test(l)) && general(l)); if (t) { rule = { where: p.name, text: t.replace(/^[-*]\s*/, '').trim().slice(0, 240) }; break; } }
  const text = pages.flatMap((p) => p.lines).join('\n').toLowerCase();
  const kinds = COMMON_KINDS.filter((k) => !have.some((n) => n.includes(k))).map((kind) => ({ kind, said: new RegExp(`\\b${kind}s?\\b`).test(text) }));
  const answered = kinds.filter((k) => rule || k.said).length;
  return { rule, kinds, asked: kinds.length, answered };
}

// The lines a report prints. → [line]
export function questionLines(tok, absent, { max = 6 } = {}) {
  const out = [];
  if (tok?.asked) out.push(`Which token is for this? ${tok.answered.length} of the ${tok.asked} tokens the components use say what they are for${tok.missing.length ? `; ${tok.missing.length} say nothing an agent can choose by (${tok.missing.slice(0, max).join(', ')}${tok.missing.length > max ? ', …' : ''})` : ''}.`);
  if (absent?.asked) out.push(absent.rule
    ? `Is there a component the system does not have? Answered: ${absent.rule.where} says what to do when none fits ("${absent.rule.text}").`
    : `Is there a component the system does not have? None of the intent layer's pages says what to do when none fits, so an agent asked for ${absent.kinds.filter((k) => !k.said).slice(0, max).map((k) => `a ${k.kind}`).join(', ')}${absent.kinds.filter((k) => !k.said).length > max ? ' or another' : ''} builds one of its own. Write it once on the system's page, for example "Use only the components in this system. If none fits, say so and ask before building one."`);
  return out;
}
