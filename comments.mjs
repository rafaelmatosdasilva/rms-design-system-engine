// comments.mjs - what a person said about a prototype, kept with it.
//
// A prototype is reviewed by a person saying what is wrong with it, usually in a chat window that nobody reads again.
// The agent that then changes the page has the request and the check's findings, and not the one thing that matters
// most: what the person who asked for it actually said when they saw it.
//
// A comment is kept beside the prototype (prototypes/<name>.comments.json, committed), pinned to a component or a
// line when it is about one, and shown to whoever works on that page next. Closing one records what changed, so a
// change can be traced back to the comment that asked for it rather than to a commit message nobody wrote.
//
// Deliberately not a review tool. There is no approval, no thread, no assignment: those belong where a team already
// works. This is the smallest thing that stops a person's words being lost between seeing a page and changing it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const commentsPath = (ROOT, name) => join(ROOT, 'prototypes', `${name}.comments.json`);

export function readComments(ROOT, name) {
  try { const j = JSON.parse(readFileSync(commentsPath(ROOT, name), 'utf8')); return Array.isArray(j.comments) ? j.comments.filter((c) => c && typeof c.id === 'string') : []; } catch { return []; }
}

function write(ROOT, name, comments) {
  const p = commentsPath(ROOT, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ version: 1, $description: `What people said about the ${name} prototype, and what each change answered. Written by rms-design-system-engine --prototype ${name} --comment; commit it.`, comments }, null, 1) + '\n');
}

// The next id, counted from what is there rather than from how many are open: an id is never reused, so a change
// that names c3 means the same comment a year later.
const nextId = (comments) => `c${comments.reduce((n, c) => Math.max(n, Number(String(c.id).replace(/\D/g, '')) || 0), 0) + 1}`;

// Say something about a prototype. `on`: { component } or { line }, when it is about one thing; a comment about the
// whole page is pinned to nothing, which is a normal thing for a comment to be.
export function addComment(ROOT, name, says, { by = null, on = null, at = new Date().toISOString() } = {}) {
  const text = String(says ?? '').trim();
  if (!text) throw new Error('a comment needs something said');
  const comments = readComments(ROOT, name);
  const c = { id: nextId(comments), says: text, by: by || null, at, ...(on && (on.component || on.line) ? { on: { ...(on.component ? { component: on.component } : {}), ...(on.line ? { line: Number(on.line) } : {}) } } : {}), done: null };
  comments.push(c);
  write(ROOT, name, comments);
  return c;
}

// Close one, with what changed because of it. The answer is the point: a comment closed with nothing said is a
// comment nobody can learn from, and the engine's own evaluations read these to see what people actually ask for.
export function closeComment(ROOT, name, id, { answer, by = null, at = new Date().toISOString() } = {}) {
  const said = String(answer ?? '').trim();
  if (!said) throw new Error('closing a comment needs what changed because of it');
  const comments = readComments(ROOT, name);
  const c = comments.find((x) => x.id === id);
  if (!c) return null;
  c.done = { answer: said, by: by || null, at };
  write(ROOT, name, comments);
  return c;
}

export const openComments = (comments) => comments.filter((c) => !c.done);

// What whoever works on this page next should read: the open ones, oldest first, since the oldest is the one that
// has been ignored longest. Closed ones are kept in the file and left out here.
export function commentLines(comments, { most = 12 } = {}) {
  const open = openComments(comments).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (!open.length) return [];
  const where = (c) => (c.on?.component ? ` (${c.on.component}${c.on.line ? `, line ${c.on.line}` : ''})` : c.on?.line ? ` (line ${c.on.line})` : '');
  return [
    `What people said about this page and nobody has answered: ${open.length}.`,
    ...open.slice(0, most).map((c) => `  ${c.id}${where(c)}: ${c.says}${c.by ? ` — ${c.by}` : ''}`),
    ...(open.length > most ? [`  …and ${open.length - most} more in ${'prototypes/<name>.comments.json'}`] : []),
  ];
}

// Every change a comment was closed with, newest first: what asking for something actually produced. Read by whoever
// wants to know what people ask of this system, which is the thing no checklist can be written from in advance.
export function answered(comments) {
  return comments.filter((c) => c.done).sort((a, b) => String(b.done.at).localeCompare(String(a.done.at)))
    .map((c) => ({ id: c.id, said: c.says, answer: c.done.answer, by: c.done.by, at: c.done.at, on: c.on ?? null }));
}
