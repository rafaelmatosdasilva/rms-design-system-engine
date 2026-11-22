// handoff-notes.mjs - the part of a handoff that only people can write, and who stands behind each piece of it.
//
// The handoff page says what the check can: where the prototype was read, what it is made of, what the system lacks,
// what changed. A developer needs more than that, and it is never in the prototype: how a screen behaves where the
// prototype does not show it, which rule is the front end's and which a service's, what data to try it with, what to
// watch for, what is still undecided. Left out, that lives in a chat or a separate document and is lost by the next
// version.
//
// So each prototype has a notes file beside it (<prototype.dir>/<name>.handoff-notes.md), the people's own. The
// engine writes it once, with its parts and an owner line under each, and never again: from then on every word in it
// is a person's. The handoff page carries it as written, with who owns each part and when they last stood behind it,
// and says which parts are still empty. The file lives with the prototype, so the next version starts from what the
// last one said; a handoff given at a tag reads it as that tag holds it, so a version says what was true when it was
// given.
//
//   NOTE_PARTS                     → the parts, in the order a developer reads them
//   notesTemplate(name)            → the file as the engine first writes it
//   readNotes(text)                → { parts: [{ id, title, owner, date, body, empty }], empty: [ids], other: [titles] }
//   ensureNotes(dir, name, opts)   → { file, created, text }: written only when absent
//   notesLines(notes, { given })   → the handoff page's lines for it
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The engine's own parts. A heading a team adds beside them is kept and shown under its own name.
export const NOTE_PARTS = [
  { id: 'states', title: 'Off the happy path', hint: 'What each screen does when something fails, while it waits, when there is nothing to show, and when the connection is slow.' },
  { id: 'data', title: 'Data that shows each state', hint: 'The accounts, records and cases to open each of those states with.' },
  { id: 'rules', title: 'Where each rule is decided', hint: 'Which rule the screen applies itself, and which a service decides and the screen only shows.' },
  { id: 'onpurpose', title: 'Decided on purpose', hint: 'Where it departs from the system or the designed screen on purpose, and why, so nobody puts it back.' },
  { id: 'questions', title: 'Open questions', hint: 'What is not decided yet, and who answers each one.' },
  { id: 'beforeship', title: 'Before it ships', hint: 'What looks simple here and is not, for whoever builds it.' },
];
export const NOT_ASSIGNED = 'not assigned';
const OWNER = /^Owner:\s*(.*?)\s*(?:·\s*Date:\s*(.*?)\s*)?$/i;

export function notesTemplate(name) {
  const out = [`# ${name}: what only people can say`, '',
    'Write under each heading, and put your name and the date on its Owner line when you stand behind it. The engine wrote this file once and never writes it again: the handoff page carries it as you leave it.', ''];
  for (const p of NOTE_PARTS) out.push(`## ${p.title}`, '', `Owner: ${NOT_ASSIGNED} · Date: —`, '', `<!-- ${p.hint} -->`, '');
  return out.join('\n');
}

// A part is empty while nothing but the hint is under it. Its owner is "not assigned" until someone writes a name.
export function readNotes(text) {
  if (text == null) return null;
  const sections = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = { title: h[1], lines: [] }; sections.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  const parts = [], other = [];
  for (const s of sections) {
    const known = NOTE_PARTS.find((p) => p.title.toLowerCase() === s.title.toLowerCase());
    const ownerLine = s.lines.find((l) => OWNER.test(l.trim()));
    const m = ownerLine ? OWNER.exec(ownerLine.trim()) : null;
    const owner = m && m[1] && m[1].toLowerCase() !== NOT_ASSIGNED ? m[1] : null;
    const date = m && m[2] && m[2] !== '—' ? m[2] : null;
    const body = s.lines.filter((l) => l !== ownerLine).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
    const part = { id: known?.id ?? null, title: s.title, owner, date, body, empty: !body };
    if (known) parts.push(part); else { other.push(s.title); parts.push(part); }
  }
  // A part the file no longer has is said as empty, never dropped: the developer still needs to know it is missing.
  for (const p of NOTE_PARTS) if (!parts.some((x) => x.id === p.id)) parts.push({ id: p.id, title: p.title, owner: null, date: null, body: '', empty: true, gone: true });
  const order = (x) => { const i = NOTE_PARTS.findIndex((p) => p.id === x.id); return i < 0 ? NOTE_PARTS.length : i; };
  parts.sort((a, b) => order(a) - order(b));
  return { parts, empty: parts.filter((p) => p.empty && p.id).map((p) => p.id), other };
}

// The notes file beside the prototype, written only when there is none: never over a person's words.
export function ensureNotes(dir, name, { write = true } = {}) {
  const file = join(dir, `${name}.handoff-notes.md`);
  if (existsSync(file)) return { file, created: false, text: readFileSync(file, 'utf8') };
  const text = notesTemplate(name);
  if (write) { try { mkdirSync(dir, { recursive: true }); writeFileSync(file, text); } catch { return { file, created: false, text: null }; } }
  return { file, created: write, text };
}

const titleOf = (id) => NOTE_PARTS.find((p) => p.id === id)?.title ?? id;

// given: the handoff is given at a tag, so a part still empty is said as given empty, not as still to write.
export function notesLines(notes, { given = false, file = null } = {}) {
  if (!notes) return [];
  const out = ['## What the people who made it say', ''];
  const written = notes.parts.filter((p) => !p.empty);
  if (!written.length) out.push(`Nothing written yet${file ? ` in \`${file}\`` : ''}: every part below is empty.`, '');
  for (const p of notes.parts) {
    if (p.empty) continue;
    out.push(`### ${p.title}`, '', `*${p.owner ? `${p.owner}${p.date ? `, ${p.date}` : ''}` : 'No owner yet'}*`, '', p.body, '');
  }
  if (notes.empty.length) {
    out.push(`${given ? 'Given with these parts empty' : 'Still to write before it is given'}: ${notes.empty.map(titleOf).join(' · ')}${file ? ` (\`${file}\`)` : ''}.`, '');
  }
  const unowned = written.filter((p) => !p.owner).map((p) => p.title);
  if (unowned.length) out.push(`Written with no owner: ${unowned.join(' · ')}.`, '');
  return out;
}

// What moved in the notes between two versions: a part written, emptied, changed, or taken by another owner.
export function notesDiff(before, now) {
  if (!before || !now) return null;
  const by = (n) => new Map((n.parts ?? []).filter((p) => p.id || p.title).map((p) => [p.id ?? p.title, p]));
  const b = by(before), n = by(now), changed = [];
  for (const [k, p] of n) {
    const was = b.get(k);
    if (!was || was.empty !== p.empty || was.body !== p.body) changed.push({ title: p.title, how: !was || was.empty ? (p.empty ? null : 'written') : p.empty ? 'emptied' : 'changed' });
    else if (was.owner !== p.owner) changed.push({ title: p.title, how: `now owned by ${p.owner ?? NOT_ASSIGNED}` });
  }
  return changed.filter((c) => c.how);
}
