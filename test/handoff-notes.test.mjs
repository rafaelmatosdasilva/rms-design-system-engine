// The part of a handoff only people can write: its parts, who stands behind each, and what moved between versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { NOTE_PARTS, notesTemplate, readNotes, ensureNotes, notesLines, notesDiff } from '../lib/handoff-notes.mjs';

test('the file as first written: every part, each with an owner line and nothing written', () => {
  const n = readNotes(notesTemplate('Checkout'));
  assert.deepEqual(n.parts.map((p) => p.id), NOTE_PARTS.map((p) => p.id));
  assert.deepEqual(n.empty, NOTE_PARTS.map((p) => p.id), 'the hints are not words anyone wrote');
  assert.ok(n.parts.every((p) => p.owner === null && p.date === null));
});

test('a part is written when someone writes under it, signed when they put their name on it, and a team\'s own heading is kept', () => {
  const text = notesTemplate('Checkout')
    .replace('## Data that shows each state\n\nOwner: not assigned · Date: —', '## Data that shows each state\n\nOwner: QA · Date: 2026-11-22\n\nAn account with a lapsed card.')
    + '\n## Analytics\n\nOwner: Product · Date: 2026-11-20\n\nTrack the second step.\n';
  const n = readNotes(text);
  const data = n.parts.find((p) => p.id === 'data');
  assert.deepEqual([data.owner, data.date, data.body, data.empty], ['QA', '2026-11-22', 'An account with a lapsed card.', false]);
  assert.deepEqual(n.other, ['Analytics']);
  assert.equal(n.parts.at(-1).title, 'Analytics', 'after the engine\'s own parts');
  assert.ok(!n.empty.includes('data'));
});

test('a part the file lost is still said, as empty: the developer needs to know it is missing', () => {
  const text = notesTemplate('Checkout').replace(/## Open questions[\s\S]*$/, '');
  const n = readNotes(text);
  assert.equal(n.parts.find((p) => p.id === 'questions').empty, true);
  assert.ok(n.empty.includes('questions'));
});

test('the notes file is written once and never over a person\'s words', () => {
  const dir = tempDir('notes-');
  const first = ensureNotes(dir, 'Checkout');
  assert.equal(first.created, true);
  writeFileSync(first.file, 'my own words');
  const again = ensureNotes(dir, 'Checkout');
  assert.deepEqual([again.created, again.text], [false, 'my own words']);
  assert.equal(readFileSync(join(dir, 'Checkout.handoff-notes.md'), 'utf8'), 'my own words');
  assert.equal(ensureNotes(tempDir('notes-'), 'Other', { write: false }).created, false, 'at a tag nothing is written');
});

test('on the page: what was written with who stands behind it, and what is still empty, said as given at a tag', () => {
  const n = readNotes(notesTemplate('Checkout').replace('## Open questions\n\nOwner: not assigned · Date: —', '## Open questions\n\nOwner: not assigned · Date: —\n\nWho decides the refund rule?'));
  const draft = notesLines(n, { file: 'prototypes/Checkout.handoff-notes.md' }).join('\n');
  assert.match(draft, /### Open questions\n\n\*No owner yet\*\n\nWho decides the refund rule\?/);
  assert.match(draft, /Still to write before it is given: Off the happy path · Data that shows each state · Where each rule is decided · Decided on purpose · Before it ships \(`prototypes\/Checkout\.handoff-notes\.md`\)/);
  assert.match(draft, /Written with no owner: Open questions/);
  assert.match(notesLines(n, { given: true }).join('\n'), /Given with these parts empty:/);
  assert.match(notesLines(readNotes('')).join('\n'), /Nothing written yet: every part below is empty/);
});

test('between two versions: a part written, emptied, changed or taken by another owner', () => {
  const v1 = readNotes(notesTemplate('C').replace('## Data that shows each state\n\nOwner: not assigned · Date: —', '## Data that shows each state\n\nOwner: QA · Date: 2026-11-20\n\nA lapsed card.'));
  const v2 = readNotes(notesTemplate('C')
    .replace('## Data that shows each state\n\nOwner: not assigned · Date: —', '## Data that shows each state\n\nOwner: Support · Date: 2026-11-22\n\nA lapsed card.')
    .replace('## Before it ships\n\nOwner: not assigned · Date: —', '## Before it ships\n\nOwner: QA · Date: 2026-11-22\n\nThe total rounds twice.'));
  assert.deepEqual(notesDiff(v1, v2), [{ title: 'Data that shows each state', how: 'now owned by Support' }, { title: 'Before it ships', how: 'written' }]);
  assert.deepEqual(notesDiff(v2, v2), []);
  assert.equal(notesDiff(null, v2), null);
});

test('a hint is never left half-taken: one built to survive a single pass is gone, and so is a stray marker', () => {
  const text = '## Open questions\n\nOwner: QA · Date: 2026-11-22\n\n<!<!-- -->-- hidden -->Who decides? <!-- left open';
  const body = readNotes(text).parts.find((p) => p.id === 'questions').body;
  assert.ok(!body.includes('<!--') && !body.includes('-->'), body);
  assert.match(body, /Who decides\?/);
});
