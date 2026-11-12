// figma-descriptions.mjs - what the intent layer says each token and component is for, written into Figma's own
// descriptions, where a designer reading the file finds it.
//
// The engine drafts what each piece is for in the intent layer and a person approves it there; Figma's variables and
// component sets stayed empty, so a designer saw none of it. This decides what to write; the hand-back writes it
// (figma-edits.mjs), only after the person says yes, with the way back beside it (figma-undo.mjs).
//
// What is written, and what never is:
//   • only what the layer holds as the team's word: an entity's approved lines (its purpose), never its drafts, and
//     nothing written at the point of writing;
//   • a line that is the same sentence on many pages of its kind with only the name changed is left out, and listed:
//     it says nothing about the one piece a designer is looking at. The layer's own reading keeps a token's templated
//     line on purpose, since an agent still learns what it colours from it (doc-source-dsds.mjs); a designer reading
//     Figma does not, so the same shape-and-count is applied here without that exception;
//   • a description Figma already holds is never written over. One that says the same is left as it is; one that
//     says something else is listed for a person to decide, because a designer typed it;
//   • a token is found in Figma by the system's own naming (tokenToVar), a component by the pairing the intent layer
//     already makes (matchComponents). One that pairs with nothing is said, never guessed at.
//
//   descriptionPlan({ entities, variables, components, toVar }) → { write, already, differs, leftOut, unpaired, counts }
//     entities:   the intent layer's (kind 'token' | 'component', name, purpose[])
//     variables:  Figma's, [{ name, description }] (figmaTokens.tokens in the vars snapshot)
//     components: Figma's, { <component>: { nodeId, description, entity } } with the intent page paired to each
//     toVar:      a Figma variable's name → the name the intent layer gives the token (its CSS custom property)
//   chunkOf(plan, n, size) → the n-th part of what is to write, so a file of thousands goes in more than one run
// Pure.

import { lineShape } from './doc-source-dsds.mjs';

export const CHUNK = 300;

const lines = (e) => (e?.purpose ?? []).map((x) => String(x?.text ?? x).trim()).filter(Boolean);

// The lines of each kind that are the same sentence on many pages, judged as the layer's own reading judges them
// (doc-source-dsds.mjs): the page's own name taken out (lineShape), and a shape repeated on half its kind, or one with
// the name taken out on five pages or more, or one with no code in it on a fifth of its kind. The layer keeps a
// token's templated line for the agents on purpose; here the rule for every other kind applies to tokens too, since a
// designer reading Figma learns nothing from it.
export const shapeOf = (text, e) => lineShape(e ?? {}, text);
export function templatedLines(entities = []) {
  const byKind = new Map();
  for (const e of entities) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind).push(e); }
  const out = new Set();
  for (const list of byKind.values()) {
    if (list.length < 5) continue;
    const count = new Map();
    for (const e of list) for (const k of new Set(lines(e).map((l) => shapeOf(l, e)))) count.set(k, (count.get(k) ?? 0) + 1);
    const min = Math.max(5, Math.ceil(list.length / 2));
    for (const [k, n] of count) if (n >= min || (k.includes('{}') && n >= 5) || (!/`/.test(k) && n >= Math.max(10, Math.ceil(list.length / 5)))) out.add(k);
  }
  return out;
}

// The words to write for one piece: its approved lines, the templated ones left out. → { text, left }
export function wordsFor(e, templated) {
  const all = lines(e);
  const own = all.filter((l) => !templated.has(shapeOf(l, e)));
  return { text: own.join(' '), left: all.length - own.length };
}

export function descriptionPlan({ entities = [], variables = [], components = {}, toVar = (n) => n } = {}) {
  const templated = templatedLines(entities);
  const tokens = new Map(entities.filter((e) => e.kind === 'token').map((e) => [e.name, e]));
  const write = [], differs = [], leftOut = [], unpaired = [];
  let already = 0;
  const judge = (target, e, figmaNow) => {
    const { text, left } = wordsFor(e, templated);
    if (!text) {
      if (left) leftOut.push({ ...target, why: 'every approved line is the same sentence as on many other pages, with only the name changed' });
      return;
    }
    const now = String(figmaNow ?? '').trim();
    if (!now) write.push({ ...target, text });
    else if (now === text) already++;
    else differs.push({ ...target, figma: now, layer: text });
  };
  for (const v of variables) {
    let name;
    try { name = toVar(v.name); } catch { name = null; }
    const e = name ? tokens.get(name) : null;
    if (!e) continue;
    judge({ kind: 'variable', name: v.name }, e, v.description);
  }
  for (const [component, c] of Object.entries(components)) {
    if (!c?.entity) { unpaired.push({ kind: 'component', name: component }); continue; }
    if (!c.nodeId) { unpaired.push({ kind: 'component', name: component, why: 'no node in the Figma capture' }); continue; }
    judge({ kind: 'component', name: component, nodeId: c.nodeId }, c.entity, c.description);
  }
  const counts = {
    write: write.length, already, differs: differs.length, leftOut: leftOut.length, unpaired: unpaired.length,
    variables: write.filter((x) => x.kind === 'variable').length, components: write.filter((x) => x.kind === 'component').length,
  };
  return { write, already, differs, leftOut, unpaired, counts };
}

// The n-th part (1-based) of what is to write. → { items, n, of }
export function chunkOf(plan, n = 1, size = CHUNK) {
  const of = Math.max(1, Math.ceil((plan?.write?.length ?? 0) / size));
  const k = Math.min(Math.max(1, Number(n) || 1), of);
  return { items: (plan?.write ?? []).slice((k - 1) * size, k * size), n: k, of };
}
