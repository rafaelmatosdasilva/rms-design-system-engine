// Every exception says why, who owns it and since when, and a reason that says nothing is refused (exception-reasons.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonRefusal, exceptionGaps, exceptionGapLines } from '../lib/exception-reasons.mjs';

test('a reason that says nothing is refused, each for what it lacks', () => {
  assert.match(reasonRefusal(''), /no reason/);
  assert.match(reasonRefusal('needed'), /too short/);
  assert.match(reasonRefusal('Intentional, by design, known legacy choice'), /only that it is on purpose/);
  assert.match(reasonRefusal('The marketing banner keeps its own blue', { others: ['the marketing banner keeps its own BLUE!'] }), /word for word/);
  assert.match(reasonRefusal('Brand team asked us', { about: 'Token values radii/tag tag' }), /names nothing the finding is about/);
  assert.equal(reasonRefusal('The tag radius matches the print guide', { about: 'Token values radii/tag tag' }), null, 'a short reason naming what it is about');
  assert.equal(reasonRefusal('The product needs a larger tap target on kiosks', { about: 'chip Structure chip height 32px' }), null, 'a long one explains by itself');
});

test('each exception without a reason, an owner or a date is listed with what it lacks', () => {
  const list = [
    'gap: 6px',
    { file: 'src/a.css', pattern: 'width: 100%', reason: 'A full-width layout wrapper for the page', owner: 'Web lead', since: '2026-11-01' },
    { file: 'src/b.css', pattern: 'top: 3px', reason: 'intentional' },
  ];
  const gaps = exceptionGaps(list);
  assert.deepEqual(gaps.map((g) => [g.label, g.missing, !!g.refused]), [['gap: 6px', ['reason', 'owner', 'since'], false], ['top: 3px', ['owner', 'since'], true]]);
  const lines = exceptionGapLines(gaps);
  assert.match(lines[0], /2 exception\(s\) in knownHardcodedExceptions/);
  assert.match(lines[1], /gap: 6px: no why, no who owns it, no since when/);
  assert.match(lines[2], /top: 3px: no who owns it, no since when · "intentional" is too short/);
  assert.deepEqual(exceptionGapLines([]), []);
});

test('a rule every component followed is held: broken later it fails the check, without anyone deciding it', async () => {
  const { holdRules, checkSeverities } = await import('../lib/construction-grammar.mjs');
  const rule = (id, toFix, extra = {}) => ({ id, area: 'naming', says: id, follows: 3 - toFix.length, of: 3, toFix, status: toFix.length ? 'decide' : 'rule', by: 'majority', ...extra });
  const before = { _built: { at: '2026-11-01T09:00:00Z' }, figma: { rules: [rule('a', []), rule('b', [{ component: 'x', value: 'v' }])] }, code: { rules: [rule('code-c', [], { held: { since: '2026-10-01' } })] } };
  const now = { figma: { rules: [rule('a', [{ component: 'chip', value: 'Chip Big' }]), rule('b', [{ component: 'x', value: 'v' }]), rule('d', [])] }, code: { rules: [rule('code-c', [{ component: 'tag', value: 'v' }])] }, questions: [{ id: 'a' }, { id: 'b' }] };
  holdRules(now, before, { at: '2026-11-22T10:00:00Z' });
  const by = Object.fromEntries([...now.figma.rules, ...now.code.rules].map((r) => [r.id, r]));
  assert.deepEqual(by.a.held, { since: '2026-11-01' }, 'followed by every component at the last build');
  assert.equal(by.a.status, 'fix');
  assert.equal(by.b.held, undefined, 'never followed by all: still the team\'s to decide');
  assert.deepEqual(by.d.held, { since: '2026-11-22' }, 'followed by all now: held from today');
  assert.deepEqual(by['code-c'].held, { since: '2026-10-01' }, 'the date it was first held is kept');
  assert.deepEqual(now.questions.map((q) => q.id), ['b']);
  const { errors, warnings } = checkSeverities(now);
  assert.deepEqual(errors.map((r) => r.id).sort(), ['a', 'code-c']);
  assert.deepEqual(warnings.map((r) => r.id), ['b']);
});

test('a deprecation warns for one release of the system after its date, then fails where it is still used', async () => {
  const { graceOf, releasesOf, pastGrace, graceLine } = await import('../lib/migrations.mjs');
  const releases = releasesOf('.', () => 'v2.3.0 2026-09-01T10:00:00+00:00\nnightly 2026-09-02T10:00:00+00:00\nv2.4.0 2026-10-01T10:00:00+00:00\nv2.5.0 2026-11-01T10:00:00+00:00\n');
  assert.deepEqual(releases.map((r) => r.version), ['v2.3.0', 'v2.4.0', 'v2.5.0'], 'only tags that read as versions');
  assert.equal(graceOf({ since: '2026-09-15' }, releases).state, 'fail', 'two releases since its date');
  assert.equal(graceOf({ since: '2026-10-15' }, releases).state, 'warn', 'one release since: still its grace');
  assert.equal(graceOf({ since: '2.3.0' }, releases).state, 'fail', 'a version: the releases after it');
  assert.equal(graceOf({ since: '2.4' }, releases).state, 'warn');
  assert.equal(graceOf({ since: null }, releases).state, 'warn', 'no date, no clock');
  const steps = [{ kind: 'component', name: 'oldChip', from: '.old-chip', toName: 'chip', since: '2026-09-15', count: 3 }, { kind: 'component', name: 'newish', from: '.newish', since: '2026-10-15', count: 2 }];
  const past = pastGrace(steps, releases);
  assert.deepEqual(past.map((x) => x.name), ['oldChip']);
  assert.equal(graceLine(past[0]), 'oldChip was deprecated on 2026-09-15 and 2 releases have shipped since (v2.4.0, v2.5.0): 3 places still use it, move to chip');
});
