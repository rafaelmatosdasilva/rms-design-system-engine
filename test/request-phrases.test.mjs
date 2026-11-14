// What a request asks for, read in pairs rather than one word at a time. Run on a real design system, "sign in
// with a one-time code" came back with a signature image (sign), a timeline (one-TIME) and a syntax-highlighted
// code snippet (code), beside the one component that was right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairsOf, sharedWith, surety, matchNote, needsNothingMeets, needLines, THIN } from '../lib/request-phrases.mjs';
import { wordsOf } from '../lib/prototype-context.mjs';

const OTP = 'sign in with an email, then a one-time code, then a success page';

test('a request is paired as it was written', () => {
  // Small words are not pairs, but taking them out first made words that were never adjacent into pairs: "a
  // picker and a drag-and-drop file well" offered "picker drag", which names nothing.
  const p = pairsOf('a page with a colour picker and a drag-and-drop file well');
  assert.ok(p.includes('colour picker'), p.join('|'));
  assert.ok(!p.includes('picker drag'), 'never adjacent in what was written');
  // A hyphen separates words: drag-and-drop is three, not one.
  assert.ok(!p.some((x) => x.startsWith('drag ') && x !== 'drag and'), p.join('|'));
  assert.deepEqual(pairsOf(''), []);
});

test('two words of the request is a sense; one is a coincidence', () => {
  const right = sharedWith('Use OneTimeField when the user enters a one-time password or verification code', OTP);
  assert.equal(right.sure, 'sense');
  assert.ok(right.words.length >= 2, right.words.join(','));
  // The three that were wrong, each on a single word of a different sense.
  assert.equal(sharedWith('Use Code Snippet to display formatted syntax-highlighted code', OTP).sure, THIN);
  assert.equal(sharedWith('Use timelines to display ordered events with date status metadata', OTP).sure, 'none');
  assert.equal(sharedWith('Use Signature Image to display a validated image-based signature', OTP).sure, 'none');
  assert.equal(surety({ pairs: ['x y'], words: [] }), 'sense', 'a pair is a sense on its own');
  assert.equal(surety({ pairs: [], words: [] }), 'none');
});

test('a thin match says it is thin, where it is shown', () => {
  const thin = sharedWith('Use Code Snippet to display formatted syntax-highlighted code', OTP);
  assert.match(matchNote(thin), /only the word "code" — check this is the sense you meant/);
  const sure = sharedWith('Use OneTimeField when the user enters a one-time password or verification code', OTP);
  assert.doesNotMatch(matchNote(sure), /only the word/);
});

test('a thing the request names that nothing answers is the finding', () => {
  // The system had no colour picker, and two date pickers came back on the word "picker" alone: the one thing
  // that should have been reported as missing was covered over by a wrong match.
  const comps = [
    { name: 'fileWell', said: 'Use File Well when people add, replace, view or delete files' },
    { name: 'timePicker', said: 'Time picker in 24-hour format with hours and minutes' },
  ];
  const needs = needsNothingMeets('a page with a colour picker and a file well', comps);
  assert.ok(needs.some((n) => n.need === 'colour picker'), JSON.stringify(needs));
  assert.deepEqual(needs.find((n) => n.need === 'colour picker').nearest, ['timePicker']);
  // What a component does answer is not a need: the stemmer used to make "files" and "file" different words, so
  // a request naming files did not find the component whose own text says files.
  assert.ok(!needs.some((n) => n.need === 'file well'), JSON.stringify(needs));
  assert.deepEqual(needsNothingMeets('', comps), []);
});

test('singular and plural are one word', () => {
  // The bug under all of it: `es` came off everywhere, so "files" became "fil" while "file" stayed "file".
  for (const [a, b] of [['files', 'file'], ['tables', 'table'], ['boxes', 'box'], ['classes', 'class']]) {
    assert.deepEqual(wordsOf(a), wordsOf(b), `${a} and ${b} have to be one word`);
  }
});

test('what a person reads about a need', () => {
  const said = needLines([{ need: 'colour picker', nearest: ['timePicker'], why: 'matched on one word only, which is not the same thing' }]).join('\n');
  assert.match(said, /ASKED FOR, NOT FOUND {2}1 thing\(s\)/);
  assert.match(said, /colour picker — nearest: timePicker/);
  assert.match(said, /Do not use the nearest as if it were the thing/);
  assert.deepEqual(needLines([]), []);
});
