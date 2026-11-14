// lessons.mjs - a proposal names its evidence (the cases it was seen in, and the guard it would write) before anyone
// approves it, one with no case recorded cannot be approved, and a no says what would get it accepted: the proposal
// is held until that is there and comes back saying what changed since, never unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  noteReview, noteEdit, proposedRules, answerProposal, readLessonsFile, recordLesson, lessonsView, lessonsLines,
  evidenceOf, changedSinceNo,
} from '../lib/lessons.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = () => tempDir('lesson-evidence-');
const T = (n) => `2026-10-${String(n).padStart(2, '0')}T09:00:00.000Z`;
const colour = (file, n, at) => noteEdit(file.d, file.rel, [{ line: n, text: `#00000${n} is not a design-system colour; use one of its colour tokens` }], { now: at });
const threeScreens = (d) => noteReview(d, ['Orders', 'Cart', 'Profile'].map((place) => ({ place, kinds: ['primary'] })), { now: T(1) });

test('a proposal lists its evidence and the guard it would write', () => {
  const d = dir();
  threeScreens(d);
  const [p] = proposedRules(d);
  assert.equal(p.id, 'R-page-primary');
  assert.deepEqual(p.evidence.map((c) => [c.where, c.at, c.how]), [['Orders', T(1), 'the page review'], ['Cart', T(1), 'the page review'], ['Profile', T(1), 'the page review']]);
  assert.match(p.place, /the intent layer, the System page, under Rules/, 'the target a yes writes it to');
  const lines = lessonsLines(lessonsView(d, { components: [] })).join('\n');
  assert.match(lines, /seen in: Orders \(2026-10-01\) · Cart \(2026-10-01\) · Profile \(2026-10-01\)/);
  assert.match(lines, /a written rule for the guidelines, in the intent layer/);
  // A yes keeps the evidence it was given on.
  const r = answerProposal(d, 'R-page-primary', 'yes', { at: T(2) });
  assert.equal(r.evidence.count, 3);
  assert.deepEqual(readLessonsFile(d).answers['R-page-primary'].evidence.wheres, ['Orders', 'Cart', 'Profile']);
  // A lesson rests on the correction itself.
  recordLesson(d, { what: 'Wrote the tileOne title by hand', why: 'the title comes from its prop' }, { by: 'QA', at: T(3) });
  assert.deepEqual(evidenceOf(d, 'L1').cases.map((c) => [c.how, c.by]), [['a person said it', 'QA']]);
});

test('a proposal with no evidence recorded cannot be approved, and the refusal says what is missing', () => {
  const d = dir();
  // A rule asked by its id with nothing seen behind it (the engine's record cleared, or never kept).
  assert.throws(() => answerProposal(d, 'R-edit-colour', 'yes'), (e) => {
    assert.match(e.message, /R-edit-colour cannot be approved yet, because it names no evidence/);
    assert.match(e.message, /Missing: the cases it was seen in/);
    assert.doesNotMatch(e.message, /;/, 'plain sentences, no semicolons');
    assert.equal(e.missing.length, 1);
    return true;
  });
  assert.deepEqual(readLessonsFile(d).answers, {}, 'nothing was recorded');
  // A no needs no evidence: turning a rule down is always the person's to say.
  assert.equal(answerProposal(d, 'R-edit-colour', 'no').answer, 'no');
});

test('a refusal records what would get it accepted', () => {
  const d = dir();
  threeScreens(d);
  assert.throws(() => answerProposal(d, 'R-page-primary', 'no', { wouldAccept: 'louder' }), /one of more, new, narrower/);
  assert.throws(() => answerProposal(d, 'R-page-primary', 'yes', { wouldAccept: 'more' }), /goes with a no/);
  answerProposal(d, 'R-page-primary', 'no', { wouldAccept: 'more', because: 'three screens of one flow are one case', by: 'QA', at: T(2) });
  const a = readLessonsFile(d).answers['R-page-primary'];
  assert.deepEqual(a.wouldAccept, { need: 'more', said: 'three screens of one flow are one case' });
  assert.deepEqual([a.evidence.count, a.evidence.wheres, a.evidence.kinds], [3, ['Orders', 'Cart', 'Profile'], ['the Orders screen', 'the Cart screen', 'the Profile screen']]);
  const lines = lessonsLines(lessonsView(d, { components: [] })).join('\n');
  assert.match(lines, /answered no by QA\)\. Held until there is more cases than when it was turned down, because three screens of one flow are one case/);
  // A narrower wording keeps the words the person would accept.
  answerProposal(d, 'R-page-primary', 'no', { wouldAccept: 'narrower', rule: 'each form has one primary action', at: T(3) });
  assert.equal(readLessonsFile(d).answers['R-page-primary'].wouldAccept.wording, 'each form has one primary action');
});

test('the same proposal with no new cases stays held', () => {
  const d = dir();
  threeScreens(d);
  answerProposal(d, 'R-page-primary', 'no', { wouldAccept: 'more', at: T(2) });
  assert.deepEqual(proposedRules(d), [], 'held right after the no');
  // The same screens reviewed again, unchanged: the same findings, no new case.
  noteReview(d, ['Orders', 'Cart', 'Profile'].map((place) => ({ place, kinds: ['primary'] })), { now: T(3) });
  assert.deepEqual(proposedRules(d), [], 'still held: nothing the no asked for');
  // A new kind is asked for, and more cases of a kind already seen do not bring it back.
  const e = dir();
  colour({ d: e, rel: 'a.vue' }, 1, T(1)); colour({ d: e, rel: 'b.vue' }, 2, T(1)); colour({ d: e, rel: 'c.vue' }, 3, T(1));
  answerProposal(e, 'R-edit-colour', 'no', { wouldAccept: 'new', at: T(2) });
  colour({ d: e, rel: 'd.vue' }, 4, T(3));
  assert.deepEqual(proposedRules(e), [], 'one more .vue file is no new kind of case');
  // A final no (nothing said) is never proposed again.
  const g = dir();
  threeScreens(g);
  answerProposal(g, 'R-page-primary', 'no', { at: T(2) });
  noteReview(g, [{ place: 'Settings', kinds: ['primary'] }], { now: T(3) });
  assert.deepEqual(proposedRules(g), []);
});

test('with more cases, or a case of a new kind, it is proposed again and says what changed since the refusal', () => {
  const d = dir();
  threeScreens(d);
  answerProposal(d, 'R-page-primary', 'no', { wouldAccept: 'more', because: 'it needs more than one flow', by: 'QA', at: T(2) });
  noteReview(d, [{ place: 'Settings', kinds: ['primary'] }], { now: T(4) });
  const [p] = proposedRules(d);
  assert.equal(p.id, 'R-page-primary');
  assert.equal(p.again.need, 'more');
  assert.deepEqual(p.again.since, ['1 more case since it was turned down (3 then, 4 now): Settings (2026-10-04)']);
  const lines = lessonsLines(lessonsView(d, { components: [] })).join('\n');
  assert.match(lines, /R-page-primary {2}.*\(proposed again\)/);
  assert.match(lines, /turned down by QA on 2026-10-02 until there was more cases than when it was turned down, because it needs more than one flow/);
  assert.match(lines, /changed since: 1 more case since it was turned down/);
  assert.equal(lessonsView(d, { components: [] }).lessons.filter((l) => l.id === 'R-page-primary').length, 0, 'shown once, as a proposal');
  // A yes now keeps the no it answers.
  answerProposal(d, 'R-page-primary', 'yes', { at: T(5) });
  assert.equal(readLessonsFile(d).answers['R-page-primary'].turnedDown.wouldAccept.need, 'more');

  // A new kind: a .tsx file beside cases in .vue files.
  const e = dir();
  for (const [rel, n] of [['a.vue', 1], ['b.vue', 2], ['c.vue', 3]]) colour({ d: e, rel }, n, T(1));
  answerProposal(e, 'R-edit-colour', 'no', { wouldAccept: 'new', at: T(2) });
  colour({ d: e, rel: 'src/card-tile.tsx' }, 4, T(3));
  const [q] = proposedRules(e);
  assert.deepEqual(q.again.since, ['a case of a kind not seen when it was turned down: .tsx files, in src/card-tile.tsx (2026-10-03)']);

  // A narrower wording given with the no: it comes back in those words, saying the wording changed.
  const g = dir();
  threeScreens(g);
  answerProposal(g, 'R-page-primary', 'no', { wouldAccept: 'narrower', rule: 'each form has one primary action', at: T(2) });
  const [w] = proposedRules(g);
  assert.equal(w.text, 'Each form has one primary action.');
  assert.match(w.again.since[0], /^the wording is narrower now: it read "Each screen has one primary action in view/);
  // Whatever it says, it never comes back unchanged, and nothing it says has a semicolon.
  for (const r of [p, q, w]) { assert.ok(r.again.since.length); for (const s of r.again.since) assert.doesNotMatch(s, /;/); }
});

test('a lesson turned down comes back when a person corrects it again, as the no asked', () => {
  const d = dir();
  recordLesson(d, { what: 'Wrote the tileOne title by hand', why: 'the title comes from its prop' }, { at: T(1) });
  answerProposal(d, 'L1', 'no', { wouldAccept: 'more', at: T(2) });
  assert.equal(lessonsView(d, { components: [] }).counts.waiting, 0, 'held');
  recordLesson(d, { what: 'wrote the tileOne title by hand', why: 'again' }, { by: 'QA', at: T(3) });
  const l = lessonsView(d, { components: [] }).lessons.find((x) => x.id === 'L1');
  assert.equal(l.answer, null);
  assert.match(l.again.since[0], /^1 more case since it was turned down \(1 then, 2 now\)/);
  assert.deepEqual(changedSinceNo({ answer: 'no', at: T(3), wouldAccept: { need: 'more' }, evidence: { count: 2 } }, evidenceOf(d, 'L1'), ''), [], 'no more cases than at that no: nothing changed');
});

test('--lesson-answer no --would-accept holds it, and a yes with no evidence is refused, in plain words', () => {
  const d = dir();
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ writes: { engine: 'ask' } }));
  mkdirSync(join(d, 'contracts'), { recursive: true });
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, CI: '', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  const empty = run('--lesson-answer', 'R-edit-colour', 'yes');
  assert.equal(empty.status, 2);
  assert.match(empty.stdout, /cannot be approved yet, because it names no evidence\. Missing: the cases it was seen in/);
  threeScreens(d);
  assert.equal(run('--lesson-answer', 'R-page-primary', 'yes', '--would-accept', 'more').status, 2, 'what would get it accepted goes with a no');
  const no = run('--lesson-answer', 'R-page-primary', 'no', '--would-accept', 'new', '--why', 'every case is in one flow');
  assert.equal(no.status, 0, no.stdout + no.stderr);
  assert.match(no.stdout, /R-page-primary turned down\. It is held until there is a case of a kind not seen yet, because every case is in one flow, and then it comes back saying what changed\./);
  assert.match(no.stdout, /It rests on 3 cases now: Orders/);
  const said = no.stdout.split('\n').filter((l) => !l.startsWith('NEXT:')).join('\n');
  assert.doesNotMatch(said, /;/);
});
