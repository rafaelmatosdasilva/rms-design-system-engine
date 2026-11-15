import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakeParts, mistakeLine, mistakeGaps, mistakeGapLines, KNOWN } from '../lib/mistakes.mjs';
import { commonOf } from '../lib/common-set.mjs';

test('a written mistake is read as the wrong use, why it fails and what to use instead', () => {
  assert.deepEqual(mistakeParts('Showing a status by colour alone. People who cannot tell colours apart miss it. Put the status in words beside the colour.'),
    { wrong: 'Showing a status by colour alone.', why: 'People who cannot tell colours apart miss it.', instead: 'Put the status in words beside the colour.' });
  assert.deepEqual(mistakeParts('Disabling the submit button because the form is invalid — use inline errors instead.'),
    { wrong: 'Disabling the submit button because the form is invalid.', why: null, instead: 'Use inline errors instead.' });
  assert.deepEqual(mistakeParts('Nesting cards.'), { wrong: 'Nesting cards.', why: null, instead: null });
  assert.equal(mistakeLine('Nesting cards. It draws a box in a box. Lay its parts out in one card.'), 'Nesting cards. It draws a box in a box. Lay its parts out in one card.');
});

test('every known mistake says why it fails and what to use instead, with no semicolon', () => {
  for (const [kind, list] of Object.entries(KNOWN)) for (const m of list) {
    const p = mistakeParts(m);
    assert.ok(p.wrong && p.why && p.instead, `${kind}: ${m}`);
    assert.doesNotMatch(m, /;/);
  }
});

test('a page is told the known mistakes of its kind it does not say, and each of its own that leaves out why or instead', () => {
  const entities = [{ layer: 'components', name: 'statusBadge', mistakes: ['Showing a status by its colour only, nothing else.'] }, { layer: 'components', name: 'Button', mistakes: [] }];
  const gaps = mistakeGaps(entities, ['statusBadge', 'Button', 'Chip'], { kindOf: commonOf });
  const by = Object.fromEntries(gaps.map((g) => [g.component, g]));
  assert.deepEqual(by.statusBadge.missing, []);
  assert.deepEqual(by.statusBadge.partial[0].lacks, ['why it fails', 'what to use instead']);
  assert.equal(by.Button.missing.length, 2);
  assert.ok(!by.Chip);
  const lines = mistakeGapLines(gaps);
  assert.match(lines[0], /2 component pages could say more/);
});
