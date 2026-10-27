// component-parts.mjs - the components that are only pieces of another (a root), never placed on their own.
//
// A row of a dropdown, a cell of a table, a legend of a chart: Figma and the code keep each as a component, but nobody
// uses one outside the component it belongs to. Listed beside the system's components it reads as one more to choose
// from, and its documentation is asked for as if somebody placed it. A part is shown inside its root, documented in its
// root's page (under Parts, a section of its own), and agents are told to place the root.
//
// The engine says a component is a part only when two things it reads agree, never from one alone:
//   - path: its Figma name sits under another component's (grid/Row is grid's; grid/Cell/amount too);
//   - else name and nesting: its name carries the root's (tileList + Row; case aside) or the two share a stem
//     of two words or more that only their last word tells apart (tileCard Row, tileCard Bank), AND the root
//     holds it (its markup or its file names it) while it does not hold the root.
// One alone is a question for the team: a name only (pillBackground, which pill does not hold), or two that
// each hold the other. A component the longer name holds is the other way round (chipGroup holds chip:
// a group of it, not a part of it) and asks nothing. Another component holding it as well (a search listing every
// dropdown's row) changes nothing: the root is the one its name says.
//
// The team's answer wins over both: "Part of: <root>" in Figma's description, a part's heading under its root's Parts
// (### <part>), or a decision on its page ("<part> is a component of its own"). An answer is asked once and kept.
//
//   import { partsOf } from './component-parts.mjs'
//   partsOf({ names: ['tileList', 'tileListRow'], uses: { tileList: ['tileListRow'] } })
//   → { partOf: { tileListRow: { root: 'tileList', by: 'name and nesting' } }, partsByRoot: { tileList: ['tileListRow'] }, questions: [] }

const low = (s) => String(s ?? '').toLowerCase();
const words = (n) => String(n).split(/(?=[A-Z])/).filter(Boolean);
// Its name carries the root's, at a word: tileListRow carries tileList, pickerChip
// carries picker (case aside); buttonQuiet does not carry button+Advertising.
const carries = (n, root) => n.length > root.length && low(n).startsWith(low(root)) && /^[A-Z0-9]/.test(n.slice(root.length));
// Every word but the last, when there are three words or more: tileCardRow and tileCardBank share tileCard.
const stem = (n) => { const w = words(n); return w.length >= 3 ? low(w.slice(0, -1).join('')) : null; };
// The words a piece of something is named with: a component named so that nothing holds is asked about (its root may
// be missing from the system), never taken for a part.
const PIECE = /^(row|item|cell|header|footer|legend|option|segment)$/i;

// The team's word, when it said: { part: root | null } (null: a component of its own).
function answered(said = {}, name) { return Object.prototype.hasOwnProperty.call(said, name) ? said[name] : undefined; }

export function partsOf({ names = [], uses = {}, said = {} } = {}) {
  const all = [...new Set(names)];
  const has = new Set(all);
  const holds = (a, b) => (uses[a] ?? []).includes(b);
  const partOf = {}, questions = [];
  for (const n of all) {
    const told = answered(said, n);
    if (told !== undefined) { if (told && has.has(told) && told !== n) partOf[n] = { root: told, by: 'the team' }; continue; }
    // Under another component's path in Figma: the nearest one.
    const segs = n.split('/');
    let root = null;
    for (let i = segs.length - 1; i > 0 && !root; i--) { const p = segs.slice(0, i).join('/'); if (has.has(p)) root = p; }
    if (root) { partOf[n] = { root, by: 'its Figma path' }; continue; }
    if (n.includes('/')) continue;
    const named = all.filter((p) => p !== n && !p.includes('/') && (carries(n, p) || (stem(n) && stem(n) === stem(p))));
    const roots = named.filter((p) => holds(p, n) && !holds(n, p));
    if (roots.length === 1) { partOf[n] = { root: roots[0], by: 'name and nesting' }; continue; }
    const both = named.filter((p) => holds(p, n) && holds(n, p));
    if (both.length) { questions.push({ part: n, roots: both, why: `${n} and ${both.join(', ')} share a name and each holds the other, so the engine cannot tell which one is the root` }); continue; }
    for (const p of named.filter((p) => carries(n, p) && !holds(n, p))) questions.push({ part: n, roots: [p], why: `${n} carries ${p}'s name, but ${p} does not hold it` });
    const last = words(n).pop();
    if (!named.length && PIECE.test(last) && words(n).length > 1 && !all.some((p) => holds(p, n))) questions.push({ part: n, roots: [], why: `${n} is named as a piece of something (${last}), but nothing holds it and no component carries its name` });
  }
  // A question both ways about one pair is asked once, about the one whose name carries the other's (or the first).
  const seen = new Set();
  const asked = questions.filter((q) => { const k = [q.part, ...q.roots].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
  // A root that is itself a part (grid/Cell/text under grid/Cell under grid): its parts go to the top one.
  const top = (r) => { const s = new Set(); while (partOf[r] && !s.has(r)) { s.add(r); r = partOf[r].root; } return r; };
  for (const p of Object.keys(partOf)) partOf[p] = { ...partOf[p], root: top(partOf[p].root) };
  const partsByRoot = {};
  for (const [p, { root }] of Object.entries(partOf)) (partsByRoot[root] ??= []).push(p);
  for (const r of Object.keys(partsByRoot)) partsByRoot[r].sort();
  return { partOf, partsByRoot, questions: asked };
}

// What the team said, from Figma's descriptions ("Part of: tileList", "Part of tileList") and the
// intent layer (a root page's Parts headings; a decision saying a component is one of its own).
export function partAnswers({ descriptions = {}, rootParts = {}, ownComponents = [] } = {}) {
  const said = {};
  for (const [n, d] of Object.entries(descriptions)) { const m = /^\s*part of:?\s+([\w/.-]+)/im.exec(String(d ?? '')); if (m) said[n] = m[1]; }
  for (const [root, parts] of Object.entries(rootParts)) for (const p of parts) said[p] = root;
  for (const n of ownComponents) said[n] = null;
  return said;
}

// Where the style guide's build keeps what it found, for the contracts and llms.txt the next run writes.
export const PARTS_FILE = 'parts.json';
export function readParts(ROOT, outDir, { readFileSync, join }) {
  try { const j = JSON.parse(readFileSync(join(ROOT, outDir, PARTS_FILE), 'utf8')); return j && typeof j.partOf === 'object' ? j : null; } catch { return null; }
}

// The line a decision on a component's page says when the team keeps it a component of its own.
export const OWN_COMPONENT = /^\s*`?([\w/.()-]+)`? is a component of its own\b/i;

// The lines an answer writes in the intent layer: under the root's Parts (### the part) and as a decision (History
// shows it), or a decision that the component stands on its own.
export const partLines = (part, root) => root
  ? { heading: part, said: `Part of ${root}, placed only inside it.`, decision: `${part} is a part of ${root}, placed only inside it.` }
  : { decision: `${part} is a component of its own, placed on its own.` };
