// The same tasks, measured against a design system that belongs to somebody.
//
// The engine's own fixture has four components. A team's real system has hundreds, nested, in several themes, with
// guidelines people have to keep - which is the only place a measurement answers "does this hold at our size?".
//
// Nothing of that system is copied into this repository and nothing is written back to it: the project named is
// one set up with that team's profile, the engine brings in what it reads, each run gets a throwaway copy, and the
// agent writes its prototype only there.
//
// What such a run produces is theirs, though. Their component names sit in the files kept with each row and their
// words in the transcripts. So the whole set is marked private by construction - not left to how a task happens to
// be named - and the recorder drops every row of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { againstOwnProject } from './skill-evals/lib.mjs';
import { pruneRow } from './skill-evals/record.mjs';

const TASKS = [{ id: 'proto-settings', prompt: 'a settings page' }, { id: 'proto-list', prompt: 'a list page' }];

test('with no project of its own, the tasks are left exactly as they were', () => {
  assert.deepEqual(againstOwnProject(TASKS, null), TASKS);
  assert.deepEqual(againstOwnProject(TASKS, undefined), TASKS);
});

test('pointed at somebody\'s project, every task runs there and every task is private', () => {
  const out = againstOwnProject(TASKS, '/some/project');
  assert.deepEqual(out.map((t) => t.source), ['/some/project', '/some/project']);
  assert.ok(out.every((t) => t.private === true));
  assert.deepEqual(out.map((t) => t.id), ['private-proto-settings', 'private-proto-list']);
  assert.equal(out[0].prompt, 'a settings page');   // the task itself is unchanged: it is the project that is theirs
});

test('and the recorder drops every one of those rows, so nothing of theirs is ever committed', () => {
  for (const t of againstOwnProject(TASKS, '/some/project')) {
    assert.equal(pruneRow({ task: t.id, files: { 'src/components/Thing.jsx': 'their code' } }), null, `a row of theirs survived: ${t.id}`);
  }
  // The fixture's own rows still record, or the guard would be a wall rather than a gate.
  for (const t of againstOwnProject(TASKS, null)) assert.ok(pruneRow({ task: t.id, files: {} }), `${t.id} should record`);
});

test('a task already marked private is not marked twice', () => {
  assert.deepEqual(againstOwnProject([{ id: 'private-theirs' }], '/p').map((t) => t.id), ['private-theirs']);
});
