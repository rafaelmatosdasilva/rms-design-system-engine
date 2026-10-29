// capture-chunks.mjs - a Figma capture read in several answers, joined in order.
//
// figma-cli and the Figma MCP cut an answer at about 20,000 characters, so a capture of a large file (each component's
// effects, its motion) is read in answers that each hold what fits and say where the next one starts (next, null when
// all are read) and where this one started (start). Each answer saved is joined to the ones before it in
// <kind>-partial.json beside the scripts; one that does not start where the last one stopped (a script run twice, an
// old answer) is refused, and nothing is joined. A capture from a script that reads all in one answer (no next) is
// taken whole, as before.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIRST = { page: 0, item: 0 };
const same = (a, b) => JSON.stringify(a ?? FIRST) === JSON.stringify(b ?? FIRST);
const partialOf = (dir, kind) => join(dir, `${kind}-partial.json`);

// A capture started again from its first answer: what an earlier one joined is dropped.
export function startChunks(dir, kind) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(partialOf(dir, kind), JSON.stringify({ expect: FIRST, body: null }) + '\n');
}

// One saved answer joined to the ones before it. merge(prev, body) → the two as one.
// → { done: true, body } | { done: false, next, body } | { error }
export function joinChunk(dir, kind, answer, merge) {
  const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
  const body = a?.components ? a : a?.result?.components ? a.result : null;
  if (!body) return { error: `not a ${kind} capture (no "components")` };
  const f = partialOf(dir, kind);
  if (!('next' in body)) { rmSync(f, { force: true }); return { done: true, body }; }
  let part = null; try { part = JSON.parse(readFileSync(f, 'utf8')); } catch { /* the first answer */ }
  const expect = part?.expect ?? FIRST;
  if (!same(body.start, expect)) return { error: `this answer starts at page ${(body.start ?? FIRST).page + 1}, item ${(body.start ?? FIRST).item + 1}, but the next to join starts at page ${expect.page + 1}, item ${expect.item + 1}: run the script the last step wrote, unchanged` };
  const joined = part?.body ? merge(part.body, body) : body;
  if (body.next) { mkdirSync(dir, { recursive: true }); writeFileSync(f, JSON.stringify({ expect: body.next, body: joined }) + '\n'); return { done: false, next: body.next, body: joined }; }
  rmSync(f, { force: true });
  return { done: true, body: joined };
}

// Two answers' components as one: each component's entry, a list joined (transitions, keyframes), overlays once each.
export function mergeCapture(prev, body) {
  const lists = (x, y) => { const out = { ...(x ?? {}) }; for (const [k, v] of Object.entries(y ?? {})) out[k] = Array.isArray(v) && Array.isArray(out[k]) ? out[k].concat(v) : v; return out; };
  const seen = new Set(), overlays = [];
  for (const o of [...(prev.overlays ?? []), ...(body.overlays ?? [])]) { const key = JSON.stringify([o.component, o.transition]); if (!seen.has(key)) { seen.add(key); overlays.push(o); } }
  return { ...body, components: lists(prev.components, body.components), ...(prev.motion || body.motion ? { motion: lists(prev.motion, body.motion) } : {}), ...(prev.overlays || body.overlays ? { overlays } : {}) };
}
