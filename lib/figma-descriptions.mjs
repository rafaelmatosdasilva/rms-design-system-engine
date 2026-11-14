// figma-descriptions.mjs - what each token and component is for, and where to use it, written into Figma's own
// descriptions, so an agent reading the file (through a Figma tool) knows where each one belongs, and a designer too.
//
// The engine drafts what each piece is for in the intent layer and a person approves it there; Figma's variables and
// component sets stayed empty, or restated their own names. This decides what to write; the hand-back writes it
// (figma-edits.mjs), only after the person says yes, with the way back beside it (figma-undo.mjs).
//
// What a description says, every line either the team's approved words or a fact the engine read:
//   • a token: what it is for, when to use it and when not (the intent layer), which components use it (their
//     contracts), what it points at (its alias in Figma), and its name in the code;
//   • a component: what it is for, when to use it and when not (the intent layer), what to use instead (its contract),
//     and its file in the code.
// Nothing is written at the point of writing. A line that is the same sentence on many pages with only the name
// changed is left out (judged as the layer's own reading judges it, lineShape in doc-source-dsds.mjs, without the
// exception that keeps a token's template for the agents), and so is a line that repeats one already said or only
// leads into a list. A token with nothing to say but its code name is left alone: Dev Mode's code syntax says that.
//
// A description Figma already holds is never written over: one that says the same is left, one that says something
// else is listed for a person to decide. A token is found by the system's naming (tokenToVar), a component by the
// intent layer's own pairing (matchComponents); one that pairs with nothing is said, never guessed at.
//
//   descriptionPlan({ entities, variables, components, toVar, usedBy, aliases }) → { write, already, differs, leftOut, unpaired, counts }
//   tokenText / componentText → the lines of one description
//   usedByOf(contracts) → Map variable → [component]
//   chunkOf(plan, n, size) → the n-th part of what is to write, so a file of thousands goes in more than one run
// Pure.

import { lineShape } from './doc-source-dsds.mjs';

export const CHUNK = 300;

// An entity's approved lines of one field (purpose, whenToUse, whenNotToUse…), never its drafts.
const fieldLines = (e, f) => (e?.[f] ?? []).map((x) => String(x?.text ?? x).trim()).filter(Boolean);
const lines = (e) => fieldLines(e, 'purpose');
export const FIELDS = ['purpose', 'whenToUse', 'whenNotToUse'];

// The lines of each kind that are the same sentence on many pages, judged as the layer's own reading judges them
// (doc-source-dsds.mjs): the page's own name taken out (lineShape), and a shape repeated on half its kind, or one with
// the name taken out on five pages or more, or one with no code in it on a fifth of its kind. The layer keeps a
// token's templated line for the agents on purpose; here the rule for every other kind applies to tokens too, since
// it says nothing about the one piece being read.
export const shapeOf = (text, e) => lineShape(e ?? {}, text);
export function templatedLines(entities = []) {
  const byKind = new Map();
  for (const e of entities) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind).push(e); }
  const out = new Set();
  for (const list of byKind.values()) {
    if (list.length < 5) continue;
    for (const f of FIELDS) {
      const count = new Map();
      for (const e of list) for (const k of new Set(fieldLines(e, f).map((l) => shapeOf(l, e)))) count.set(k, (count.get(k) ?? 0) + 1);
      const min = Math.max(5, Math.ceil(list.length / 2));
      for (const [k, n] of count) if (n >= min || (k.includes('{}') && n >= 5) || (!/`/.test(k) && n >= Math.max(10, Math.ceil(list.length / 5)))) out.add(k);
    }
  }
  return out;
}

// One field's own lines, the templated ones left out. A line that only leads into a list ("Do not use it when:")
// says nothing on its own, so it is skipped for the lines that do. → { lines, left }
function own(e, f, templated) {
  const all = fieldLines(e, f);
  const kept = all.filter((l) => !templated.has(shapeOf(l, e)) && !/:\s*$/.test(l));
  return { lines: kept, left: all.length - kept.length };
}
// Lines not already said: the layer often opens "when to use" with its purpose sentence again.
const fresh = (xs, said) => xs.filter((x) => { const k = x.toLowerCase().replace(/\s+/g, ' ').trim(); if (said.has(k)) return false; said.add(k); return true; });
// The purpose's own words (kept for the tests and any caller that wants the plain sentence). → { text, left }
export function wordsFor(e, templated) {
  const o = own(e, 'purpose', templated);
  return { text: o.lines.join(' '), left: o.left };
}

const some = (xs, n = 6) => (xs.length > n ? `${xs.slice(0, n).join(', ')} and ${xs.length - n} more` : xs.join(', '));
const first = (xs, n = 2) => xs.slice(0, n).join(' ');

// What an agent reading Figma needs to use a token where it belongs, from the team's approved words and what the
// engine read from Figma and the code: what it is for, which components use it, what it points at, its name in the
// code. Every line is one of those; none is written at the point of writing. → [line]
export function tokenText({ entity = null, templated = new Set(), usedBy = [], alias = null, css = null } = {}) {
  const out = [], said = new Set();
  if (entity) { const p = fresh(own(entity, 'purpose', templated).lines, said); if (p.length) out.push(p.join(' ')); }
  if (entity) { const w = fresh(own(entity, 'whenToUse', templated).lines, said); if (w.length) out.push(`Use for: ${first(w)}`); }
  if (entity) { const w = fresh(own(entity, 'whenNotToUse', templated).lines, said); if (w.length) out.push(`Not for: ${first(w)}`); }
  if (usedBy.length) out.push(`Used by: ${some([...new Set(usedBy)].sort())}`);
  if (alias) out.push(`Points at: ${alias}`);
  if (out.length && css) out.push(`Code: var(${css})`);
  return out;
}
// And a component's: what it is for, when to use it and when not, what to use instead, where it lives in the code.
export function componentText({ entity = null, templated = new Set(), contract = null } = {}) {
  const out = [];
  if (entity) {
    const said = new Set();
    const p = fresh(own(entity, 'purpose', templated).lines, said), w = fresh(own(entity, 'whenToUse', templated).lines, said), n = fresh(own(entity, 'whenNotToUse', templated).lines, said);
    if (p.length) out.push(p.join(' '));
    if (w.length) out.push(`Use when: ${first(w)}`);
    if (n.length) out.push(`Not when: ${first(n)}`);
  }
  const instead = [contract?.useInstead ?? contract?.intent?.useInstead].flat().filter(Boolean);
  if (instead.length) out.push(`Use instead: ${instead.join(', ')}`);
  const file = contract?.source?.code?.file;
  if (out.length && file) out.push(`Code: ${file}`);
  return out;
}

// variables: [{ name, description }]; components: { <name>: { nodeId, description, entity, contract } }
// usedBy: Map variable name → [component]; aliases: { <mode key>: { <variable>: [chain] } }
export function descriptionPlan({ entities = [], variables = [], components = {}, toVar = (n) => n, usedBy = new Map(), aliases = {} } = {}) {
  const templated = templatedLines(entities);
  const tokens = new Map(entities.filter((e) => e.kind === 'token').map((e) => [e.name, e]));
  const write = [], differs = [], leftOut = [], unpaired = [];
  let already = 0;
  // words: whether the description holds the team's own words, or only facts the engine read. Where it holds only
  // facts and a designer already wrote something, the suggestion keeps their sentence and adds the facts below it;
  // where the team approved words of its own, it is one wording against the other, for the person to choose.
  const judge = (target, text, why, words = true) => {
    if (!text) { if (why) leftOut.push({ ...target, why }); return; }
    const now = String(target.figmaNow ?? '').trim();
    delete target.figmaNow;
    const has = new Set(now.split('\n').map((l) => l.trim())), mine = text.split('\n').map((l) => l.trim());
    const missingLines = mine.filter((l) => !has.has(l));
    if (!now) write.push({ ...target, text });
    // Every line the engine would write is in Figma already.
    else if (!missingLines.length) already++;
    // Figma holds the designer's words, and the engine only has lines to add below them (or holds that very sentence).
    else if (!words || mine.includes(now)) differs.push({ ...target, figma: now, layer: `${now}\n${missingLines.join('\n')}`, adds: true });
    // Two wordings: the team's approved words against the designer's, for the person to choose.
    else differs.push({ ...target, figma: now, layer: text });
  };
  const aliasOf = (name) => { for (const m of Object.values(aliases ?? {})) { const c = m?.[name]; if (c?.length) return c[0]; } return null; };
  for (const v of variables) {
    let css;
    try { css = toVar(v.name); } catch { css = null; }
    const e = css ? tokens.get(css) ?? null : null;
    const lines_ = tokenText({ entity: e, templated, usedBy: usedBy.get(v.name) ?? [], alias: aliasOf(v.name), css });
    const templatedOnly = e && fieldLines(e, 'purpose').length && !own(e, 'purpose', templated).lines.length;
    const words = !!e && FIELDS.some((f) => own(e, f, templated).lines.length);
    judge({ kind: 'variable', name: v.name, figmaNow: v.description }, lines_.join('\n'),
      templatedOnly ? 'its approved line is the same sentence as on many other pages, and no component uses it and it points at nothing, so there is nothing particular to say' : null, words);
  }
  for (const [component, c] of Object.entries(components)) {
    if (!c?.nodeId) { unpaired.push({ kind: 'component', name: component, why: 'no node in the Figma capture' }); continue; }
    if (!c.entity && !c.contract) { unpaired.push({ kind: 'component', name: component }); continue; }
    judge({ kind: 'component', name: component, nodeId: c.nodeId, figmaNow: c.description }, componentText({ entity: c.entity, templated, contract: c.contract }).join('\n'),
      c.entity ? 'its approved lines are the same sentences as on many other pages' : null);
  }
  const counts = {
    write: write.length, already, differs: differs.length, leftOut: leftOut.length, unpaired: unpaired.length,
    variables: write.filter((x) => x.kind === 'variable').length, components: write.filter((x) => x.kind === 'component').length,
  };
  return { write, already, differs, leftOut, unpaired, counts };
}

// Which components use each token, from their contracts (each contract's tokens.used). → Map variable → [component]
export function usedByOf(contracts = []) {
  const out = new Map();
  for (const c of contracts) for (const t of [c?.tokens?.used ?? []].flat()) { const l = out.get(t) ?? []; if (c.name && !l.includes(c.name)) l.push(c.name); out.set(t, l); }
  return out;
}

// The n-th part (1-based) of what is to write. → { items, n, of }
export function chunkOf(plan, n = 1, size = CHUNK) {
  const of = Math.max(1, Math.ceil((plan?.write?.length ?? 0) / size));
  const k = Math.min(Math.max(1, Number(n) || 1), of);
  return { items: (plan?.write ?? []).slice((k - 1) * size, k * size), n: k, of };
}
