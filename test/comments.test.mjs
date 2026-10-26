// comments.mjs - what a person said about a prototype, kept with it, so the agent that changes the page next has the
// one thing it otherwise never gets: what the person who asked for it said when they saw it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addComment, closeComment, readComments, openComments, commentLines, answered, commentsPath } from '../comments.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'comments-'));

test('a comment is kept with its prototype, pinned to a thing when it is about one', () => {
  const d = dir();
  assert.deepEqual(readComments(d, 'Signup'), []);
  assert.throws(() => addComment(d, 'Signup', '   '), /needs something said/);

  const a = addComment(d, 'Signup', 'the password field should let you see what you typed', { by: 'QA', on: { component: 'input', line: 12 } });
  assert.equal(a.id, 'c1');
  assert.deepEqual(a.on, { component: 'input', line: 12 });
  assert.equal(a.done, null);
  // A comment about the whole page is pinned to nothing, which is normal.
  const b = addComment(d, 'Signup', 'too much going on above the fold', { by: 'QA' });
  assert.equal(b.id, 'c2');
  assert.equal('on' in b, false);

  assert.equal(readComments(d, 'Signup').length, 2);
  assert.equal(JSON.parse(readFileSync(commentsPath(d, 'Signup'), 'utf8')).version, 1);
  // Another prototype's comments are its own.
  assert.deepEqual(readComments(d, 'Welcome'), []);
});

test('closing one records what changed, and an id is never reused', () => {
  const d = dir();
  addComment(d, 'Signup', 'first');
  addComment(d, 'Signup', 'second');
  assert.throws(() => closeComment(d, 'Signup', 'c1', { answer: '' }), /needs what changed/);
  assert.equal(closeComment(d, 'Signup', 'nope', { answer: 'x' }), null, 'a comment that is not there');

  const c = closeComment(d, 'Signup', 'c1', { answer: 'the field now has a reveal button', by: 'Claude' });
  assert.equal(c.done.answer, 'the field now has a reveal button');
  assert.deepEqual(openComments(readComments(d, 'Signup')).map((x) => x.id), ['c2']);

  // The next id counts from every comment there has been, not from the open ones: c3, never c2 again.
  assert.equal(addComment(d, 'Signup', 'third').id, 'c3');

  // What asking for something actually produced, newest first.
  const got = answered(readComments(d, 'Signup'));
  assert.deepEqual(got.map((x) => [x.id, x.answer]), [['c1', 'the field now has a reveal button']]);
});

test('the lines name the open ones, oldest first, and say nothing when there are none', () => {
  const d = dir();
  assert.deepEqual(commentLines(readComments(d, 'Signup')), []);
  addComment(d, 'Signup', 'older', { at: '2026-10-01T09:00:00Z', on: { component: 'chip' } });
  addComment(d, 'Signup', 'newer', { at: '2026-10-20T09:00:00Z', by: 'QA' });
  closeComment(d, 'Signup', 'c1', { answer: 'done' });
  addComment(d, 'Signup', 'oldest of the open', { at: '2026-09-01T09:00:00Z' });

  const lines = commentLines(readComments(d, 'Signup'));
  assert.match(lines[0], /nobody has answered: 2/);
  // Oldest first: the one ignored longest reads first.
  assert.match(lines[1], /c3: oldest of the open/);
  assert.match(lines[2], /c2: newer — QA/);
  assert.ok(!lines.join('\n').includes('older'), 'a closed one is kept in the file, not in the lines');
});
