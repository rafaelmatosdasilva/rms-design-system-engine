// What a person checks by hand: the few short steps that make two people check the same way, and a record that says
// what the check was made with. The expiry (a component changes, the row reads To check again) is checked in
// checked.test.mjs; this is about saying how to check, and with what.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { WCAG22 } from '../lib/wcag21.mjs';
import { recordCheck, readChecked, checksFor } from '../lib/checked.mjs';
import { templateText } from '../lib/styleguide-template.mjs';
import { route } from '../lib/route.mjs';

test('every criterion a person judges says how to check it, in a few short steps', () => {
  const byPerson = WCAG22.filter((k) => k.person);
  assert.equal(byPerson.length, 11, 'nine only a person decides, and two the checks try but a person settles');
  for (const k of byPerson) {
    assert.ok(Array.isArray(k.steps) && k.steps.length >= 2, `${k.sc} says how to check it`);
    assert.ok(k.steps.length <= 3, `${k.sc}: a few steps, not a procedure`);
    for (const s of k.steps) {
      assert.ok(s.length > 20 && s.length < 180, `${k.sc}: "${s}"`);
      assert.match(s, /^[A-Z]/, `${k.sc}: a step reads as a sentence`);
      assert.match(s, /[.?]$/, `${k.sc}: "${s}"`);
    }
    // The first step opens with something to do, never with a question: a person has to look before they can judge.
    const opens = k.steps[0].split(/(?<=[.?])\s/)[0];
    assert.doesNotMatch(opens, /\?$/, `${k.sc}: the first step opens with a thing to do, not a question ("${opens}")`);
  }
  // A criterion no person judges says nothing about how: it is tried by a machine.
  for (const k of WCAG22.filter((x) => !x.person)) assert.equal(k.steps, undefined, k.sc);
});

test('a check records what it was made with, when the person says, and leaves it out when they do not', () => {
  const root = tempDir('rms-checked-');
  recordCheck(root, { component: 'cardTile', sc: '1.4.5', by: 'QA', using: 'Chrome 141 · VoiceOver', signature: 'a1b2c3' });
  recordCheck(root, { component: 'cardTile', sc: '1.3.3', by: 'QA', signature: 'a1b2c3' });
  const checks = readChecked(root);
  assert.equal(checks.find((c) => c.sc === '1.4.5').using, 'Chrome 141 · VoiceOver');
  assert.equal('using' in checks.find((c) => c.sc === '1.3.3'), false, 'nothing is invented when they do not say');
  // As the style guide reads them: current while the component is as it was, with what it was checked with.
  const now = checksFor(checks, 'cardTile', 'a1b2c3');
  assert.equal(now['1.4.5'].using, 'Chrome 141 · VoiceOver');
  assert.equal(now['1.4.5'].current, true);
  assert.equal(checksFor(checks, 'cardTile', 'changed')['1.4.5'].current, false, 'the component changed: to check again');
  // The file is the one a person commits, and says so.
  assert.match(readFileSync(join(root, 'design-system-engine-checked.json'), 'utf8'), /commit it/);
});

test('the style guide shows the steps, the command that records them, and what it was checked with', () => {
  const page = templateText();
  assert.match(page, /r\.k\.steps && r\.k\.steps\.length && r\.st === 'check'/, 'the steps show while it is still to check');
  assert.match(page, /<ol class="pg-a11y-steps">/);
  assert.match(page, /--checked ' \+ esc\(c\.name\) \+ ' ' \+ esc\(r\.k\.sc\) \+ ' --by "&lt;name&gt;" --with "&lt;browser and screen reader&gt;"/, 'the command names the component and its criterion');
  // Checked, and checked before the component changed, both say what it was checked with - and when the person said
  // nothing, the row says that too rather than leaving a reader to assume.
  assert.match(page, /var withSaid = ok && ok\.using \? ', in ' \+ ok\.using : ', and they did not say what they checked with';/);
  assert.match(page, /'Said by ' \+ ok\.by \+ ' on ' \+ String\(ok\.at\)\.slice\(0, 10\) \+ withSaid \+ ': their word, not a measurement the engine made\. ' \+ k\.person/);
  assert.match(page, /withSaid \+ ', before ' \+ c\.name \+ ' changed - and their word, not a measurement\. ' \+ person/, 'a check made before the component changed says what it was made with');
});

// A record is testimony: a person's word that they looked, with nothing confirming the screen reader was running or
// that it said what they report. It is better than a row that says nothing, and it is not a measurement - so the page
// says whose word it is, what they checked with, and what the claim of meeting the standard rests on.
test('a check made by hand is shown as a person\'s word, and what meets the standard says how much of it rests on one', () => {
  const page = templateText();
  // The row carries it, the table marks it, and the badge counts it.
  assert.match(page, /said: said/, 'the row keeps whether a person answered it');
  assert.match(page, /r\.said \? ' data-said="1"' : ''/, 'the table marks the row');
  assert.match(page, /function saidRest\(rows\)/, 'the badge counts them');
  assert.match(page, /' criterion on a person\\'s word' : ' criteria on a person\\'s word'/);
  assert.match(page, /Meets WCAG 2\.2 at level A and AA' \+ saidRest\(a11yEl\.rows\)/, 'the claim says what it rests on');
  // Where the row was read from is their word, never a measurement.
  assert.match(page, /A person\\'s word \(' \+ \(sb\.by \|\| 'someone'\)/);
});

test('what the person says they checked it with reaches the command, and nothing is guessed', () => {
  const ctx = { hasConfig: true, components: ['badge', 'button', 'chip', 'field'] };
  const first = (ask) => (route(ask, ctx).run ?? [])[0];
  assert.equal(first('badge 1.3.3 is checked'), 'rms-design-system-engine --checked badge 1.3.3', 'they said nothing: nothing is added');
  assert.equal(first('badge 1.3.3 is checked in Chrome with VoiceOver'), 'rms-design-system-engine --checked badge 1.3.3 --with "Chrome with VoiceOver"');
  assert.equal(first('I checked badge 1.4.5 with NVDA'), 'rms-design-system-engine --checked badge 1.4.5 --with "NVDA"');
  // The person writes in their own language, and their words are kept as they wrote them.
  assert.equal(first('verifiquei o badge 1.3.3 com o VoiceOver'), 'rms-design-system-engine --checked badge 1.3.3 --with "VoiceOver"');
  // The page is rebuilt after, as it always was.
  assert.equal((route('badge 1.3.3 is checked with NVDA', ctx).run ?? []).at(-1), 'rms-design-system-engine --styleguide');
});
