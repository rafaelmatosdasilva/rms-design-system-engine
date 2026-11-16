// Each pattern the style guide draws has one implementation, used everywhere (the owner's rule, 16 November 2026): a
// component's Rules, Accessibility, Documentation and History areas are the very table and panel of the page of the same
// name, a list of names is shown as pills with one "N more", a date is said by one of the shared helpers, and a side
// panel's cards come from one helper. These tests keep a second way from coming back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'styleguide', 'js');
const PARTS = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const part = (prefix) => readFileSync(join(DIR, PARTS.find((f) => f.startsWith(prefix))), 'utf8');
// Each line of code with its file and number, comments left out.
const lines = () => PARTS.flatMap((f) => readFileSync(join(DIR, f), 'utf8').split('\n').map((text, i) => ({ f, n: i + 1, text })))
  .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l.text));

test('a date is said only by the shared helpers (when, whenShort, dayShort)', () => {
  const HELPERS = /var (when|whenShort|dayShort) = function/;
  const found = lines().filter((l) => /toLocaleDateString|toLocaleString\('en-GB'|\.getMonth\(\)/.test(l.text) && !HELPERS.test(l.text));
  assert.deepEqual(found.map((l) => `${l.f}:${l.n}`), [], 'format the date with when, whenShort or dayShort (00-start.js)');
});

test('"N more" is only the shared pills chevron', () => {
  // Words in a sentence, not a list of names: a card's one-line summary of its props, and the words a screen reader says.
  const PROSE = [/ps\.slice\(0, 3\)\.join/, /spokenOrder\.slice\(0, 8\)/];
  const found = lines().filter((l) => /' more'|more<\/|and ' \+ \(/.test(l.text) && !/function pillsMore/.test(l.text) && !PROSE.some((p) => p.test(l.text)));
  assert.deepEqual(found.map((l) => `${l.f}:${l.n}`), [], 'show a list of names with namePills, its "N more" with pillsMore (00-start.js)');
});

test('a side panel builds its cards with panelCard', () => {
  // The row panel, the Rules, Documentation and History panels, and Accessibility's: no card opened by hand.
  const PANELS = ['07-', '22-', '27-', '30-'];
  const found = lines().filter((l) => PANELS.some((p) => l.f.startsWith(p)) && /<div class="pg-inspect[" ]/.test(l.text));
  assert.deepEqual(found.map((l) => `${l.f}:${l.n}`), [], 'use panelCard (00-start.js)');
});

test("a component's areas are the pages' own tables and panels", () => {
  const comp = part('33-');
  assert.match(comp, /RULES_PAGE\.of\(c\.name\)/, 'Rules area from the Rules page');
  assert.match(comp, /RULES_PAGE\.wire\(/, 'Rules area wired as the Rules page');
  assert.match(comp, /DOC_PAGE\.of\(c\.name\)/, 'Documentation area from the Documentation page');
  assert.match(comp, /DOC_PAGE\.wire\(/, 'Documentation area wired as the Documentation page');
  assert.match(comp, /a11yArea\(/, 'Accessibility area from the Accessibility page');
  assert.match(comp, /fillHistoryArea\(/, 'History area from the History page');
  assert.match(part('27-'), /historyTable\(/, 'History area draws the History page table');
  assert.doesNotMatch(comp, /issueTableHTML\(\s*ruleRows/, 'no second Rules table');
});

test('one list of names: pillList and namesShown are the shared helpers', () => {
  const h = part('07-');
  assert.match(h, /pillList = namePills/);
  assert.doesNotMatch(h, /function pillsMore|PILLS_SHOWN = /, 'the pills helpers live once, in 00-start.js');
});
