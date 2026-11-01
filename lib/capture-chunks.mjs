// capture-chunks.mjs - a Figma capture of each component's motion or effects, read in checked answers.
//
// figma-cli and the Figma MCP cut an answer at about 20,000 characters, so the capture (--figma-motion,
// --figma-effects) is read the way the components capture is (figma-capture.mjs):
// - the checksums first: one per component (a set, a component outside a set, or a page's overlays), over what it
//   holds, computed in Figma, read in pages that each say where they started (start) and where the next one starts
//   (next, null when all are read). A page that does not start where the last one stopped is refused.
// - then only the components whose checksum no record kept from an earlier capture has: each read answers as many as
//   fit, every record with its checksum. A record that does not match its checksum (changed or cut while it was saved)
//   is refused; one whose checksum is not the one the first pass read means Figma changed in between, and the
//   checksums are read again (what was read is kept).
// - once every component is held, the records are put together in the file's order, each one checked against its
//   checksum again, and kept (<kind>-kept.json beside the scripts) for the next capture to reuse.
// A capture from a script that reads all in one answer (components, no next) is taken whole, as before.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cyrb53, parseAnswer } from './figma-capture.mjs';

export const FIRST = { page: 0, item: 0 };
export const READ_IDS = 400;   // the components a read is offered, at most (each answer holds as many as fit)
const same = (a, b) => JSON.stringify(a ?? FIRST) === JSON.stringify(b ?? FIRST);
const passOf = (dir, kind) => join(dir, `${kind}-pass.json`);
const keptOf = (dir, kind) => join(dir, `${kind}-kept.json`);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const sumOf = (r) => cyrb53(JSON.stringify(r));

// The records kept from earlier captures: id → { sum, r }, each one checked against its checksum when it is used.
export const readKept = (dir, kind) => readJson(keptOf(dir, kind))?.items ?? {};

// A capture started again from its first answer: the checksums read again; the records kept stay for reuse.
// → the first call: { call: 'sums', start }
export function startChunks(dir, kind) {
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, `${kind}-partial.json`), { force: true });   // the join of the form before
  writeFileSync(passOf(dir, kind), JSON.stringify({ expect: FIRST, sums: [], complete: false, read: 0 }) + '\n');
  return { call: 'sums', start: FIRST };
}

// Each component's record, in the order of the checksums, as one capture: the same answer a script that reads all at
// once gives (a name two components share: the effects of the last, the motion of both; an overlay once).
function assemble(kind, sums, kept) {
  if (kind === 'effects') {
    const components = {};
    for (const [id] of sums) { const { name, rec } = kept[id].r; components[name] = rec; }
    return { components };
  }
  const components = {}, motion = {}, overlays = [], seen = new Set();
  for (const [id] of sums) {
    const r = kept[id].r;
    if (r.transitions) components[r.name] = (components[r.name] ?? []).concat(r.transitions);
    if (r.motion) motion[r.name] = (motion[r.name] ?? []).concat(r.motion);
    for (const o of r.overlays ?? []) { const key = JSON.stringify([o.component, o.transition]); if (!seen.has(key)) { seen.add(key); overlays.push(o); } }
  }
  return { version: 2, components, motion, overlays };
}

// The next step after a saved answer. text: the answer as it came.
// → { error } | { done: true, whole: true, body } (an answer of a script that reads all at once)
//   | { call: 'sums', start, read } (the next page of the checksums; read: how many are read so far)
//   | { call: 'read', ids, todo, of, reused } (the components to read: todo of of, reused unchanged)
//   | { call: 'sums', start, restart: { changed, gone } } (Figma changed after the checksums were read)
//   | { done: true, body, of, read, reused }
export function takeAnswer(dir, kind, text) {
  const raw = typeof text === 'string' ? parseAnswer(text) : text;
  const a = raw?.result && typeof raw.result === 'object' && !raw.capture && !raw.components ? raw.result : raw;
  if (!a || typeof a !== 'object') return { error: `not an answer of the ${kind} capture script` };
  if (a.components && !a.capture) {
    if ('next' in a) return { error: `an answer of the ${kind} capture script before this version: run rms-design-system-engine --figma-${kind} again for this version's script` };
    rmSync(passOf(dir, kind), { force: true });
    return { done: true, whole: true, body: a };
  }
  if (a.capture !== kind) return { error: `not an answer of the ${kind} capture script (no "components", no checksums)` };
  if (a.error) return { error: a.error };
  const pass = readJson(passOf(dir, kind));
  if (!pass) return { error: `no ${kind} capture started: run rms-design-system-engine --figma-${kind} first` };
  const kept = readKept(dir, kind);
  if (a.kind === 'sums') {
    if (pass.complete) return { error: `the checksums are all read already: run the script the last step wrote, unchanged` };
    if (!same(a.start, pass.expect)) return { error: `this answer starts at page ${(a.start ?? FIRST).page + 1}, item ${(a.start ?? FIRST).item + 1}, but the next to read starts at page ${pass.expect.page + 1}, item ${pass.expect.item + 1}: run the script the last step wrote, unchanged` };
    if (!Array.isArray(a.sums) || a.sums.some((e) => !Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string')) return { error: 'its checksums do not read (changed or cut while it was saved)' };
    pass.sums.push(...a.sums);
    if (a.next) { pass.expect = a.next; writeFileSync(passOf(dir, kind), JSON.stringify(pass) + '\n'); return { call: 'sums', start: a.next, read: pass.sums.length }; }
    pass.complete = true;
  } else if (a.kind === 'read') {
    if (!pass.complete) return { error: `the checksums are not all read yet: run the script the last step wrote, unchanged` };
    if (!Array.isArray(a.items)) return { error: 'it holds no components (changed or cut while it was saved)' };
    for (const e of a.items) if (!Array.isArray(e) || sumOf(e[2]) !== e[1]) return { error: `${Array.isArray(e) ? e[0] : 'a component'} does not match its checksum (changed or cut while it was saved)` };
    const want = new Map(pass.sums), changed = [], gone = (a.gone ?? []).filter((id) => want.has(id));
    for (const [id, sum, r] of a.items) {
      kept[id] = { sum, r };   // a record that matches its checksum serves any pass that reads that checksum
      if (want.has(id) && want.get(id) !== sum) changed.push(id);
    }
    pass.read += a.items.length;
    writeKept(dir, kind, kept);
    if (changed.length || gone.length) return { ...startChunks(dir, kind), restart: { changed, gone } };
    if (!a.items.length) return { error: 'the answer holds no component of the ones asked: run the script the last step wrote, unchanged' };
  } else return { error: `not an answer of the ${kind} capture script (kind ${a.kind})` };
  writeFileSync(passOf(dir, kind), JSON.stringify(pass) + '\n');
  // The components no kept record holds with the checksum read, in the file's order.
  const held = ([id, sum]) => kept[id]?.sum === sum && sumOf(kept[id].r) === sum;
  const todo = pass.sums.filter((e) => !held(e)).map(([id]) => id);
  const of = pass.sums.length;
  if (todo.length) return { call: 'read', ids: todo.slice(0, READ_IDS), todo: todo.length, of, reused: of - todo.length - Math.min(pass.read, of - todo.length) };
  const body = assemble(kind, pass.sums, kept);
  // Only what this capture holds is kept for the next one.
  writeKept(dir, kind, Object.fromEntries(pass.sums.map(([id]) => [id, kept[id]])));
  rmSync(passOf(dir, kind), { force: true });
  const read = Math.min(pass.read, of);
  return { done: true, body, of, read, reused: of - read };
}

function writeKept(dir, kind, items) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(keptOf(dir, kind), JSON.stringify({ v: 1, items }) + '\n');
}

// What the command says after a step that writes the next script. kind: 'effects' or 'motion', script: the path of
// the script written, answer: the path to save its answer to.
export function stepLines(r, { kind, script, answer }) {
  const run = `run ${script} the same way (unchanged, with use_figma or figma-cli), save what it returns as ${answer}, then run rms-design-system-engine --figma-${kind} ${answer} again.`;
  if (r.restart) {
    const some = (ids) => `${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''}`;
    return [`Figma changed after the checksums were read (${[r.restart.changed.length ? `changed: ${some(r.restart.changed)}` : '', r.restart.gone.length ? `no longer in the file: ${some(r.restart.gone)}` : ''].filter(Boolean).join('; ')}): the checksums are read again, and what was read is kept.`, `NEXT: ${run}`];
  }
  if (r.call === 'sums') return [`✓ the checksums of ${r.read} components read so far; more did not fit in that answer.`, `NEXT: ${run}`];
  return [`✓ the checksums of ${r.of} components read: ${r.todo} to read${r.reused ? `, ${r.reused} unchanged since the last capture and kept` : ''}${r.todo > r.ids.length ? ` (the next ${r.ids.length} offered in this script, as many as fit in one answer)` : ''}.`, `NEXT: ${run}`];
}
