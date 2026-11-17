// A long table opens on its first rows, and its one button shows every row left, never another batch (the owner's,
// 17 November 2026). The button says how many are left, so a click that showed only the next hundred said one thing
// and did another. History, which drew every change at once, opens the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateText } from '../lib/styleguide-template.mjs';

const tpl = templateText();

test('a table opens on its first rows, and its button shows all the rest', () => {
  assert.match(tpl, /var ROWS_SHOWN = 100;/, 'the first rows, the same on every table');
  assert.match(tpl, /if \(e\.target\.closest\('\[data-rows-more\]'\) && sec\.contains\(e\.target\)\) \{ shown = Infinity; draw\(\); \}/, 'one click shows every row left');
  assert.doesNotMatch(tpl, /shown \+= ROWS_SHOWN/, 'never another batch');
  assert.match(tpl, /if \(!e\.target\.closest\('\.sg-chip-menu'\)\) shown = ROWS_SHOWN;/, 'a new filter starts from the first rows again');
});

test('History opens on its first changes, a moment\'s rows together, and one button shows the rest', () => {
  assert.match(tpl, /var logShown = ROWS_SHOWN;/, 'the same first rows as a table');
  assert.match(tpl, /if \(!tr\.classList\.contains\('sg-log-more'\)\) later = !tr\.hidden && \+\+n > logShown;/, 'counted by moment: the rows under one move with it');
  assert.match(tpl, /if \(later && !tr\.hidden\) \{ tr\.hidden = true; tr\.setAttribute\('data-later', ''\); \}/, 'a row put away is told apart from one a filter hid');
  // The same button as every table's, drawn by the same code, so History cannot drift from the other pages.
  assert.match(tpl, /function rowsFoot\(t, rest, attr\) \{/, 'one button under every long table');
  assert.equal((tpl.match(/tfoot\.sg-rows-more/g) ?? []).length, 1, 'drawn in one place only');
  assert.match(tpl, /rowsFoot\(trs\.length \? trs\[0\]\.closest\('table'\) : null, rest, 'data-rows-more'\)/, 'a table\'s');
  assert.match(tpl, /rowsFoot\(logTable, tb\.querySelectorAll\(':scope > tr\[data-later\]'\)\.length, 'data-log-rest'\);/, 'History\'s, counting rows as its chips do, so the numbers add up');
  assert.match(tpl, /if \(e\.target\.closest\('\[data-log-rest\]'\)\) \{ logShown = Infinity; logPage\(false\); return; \}/, 'and it shows them all');
  // A chip or a ticket sets every row's hidden again, so the page counts from there; a sort keeps them, so it takes
  // back only its own rows first. Either way, a filter starts from the first changes again.
  assert.match(tpl, /wn\.addEventListener\('sg-chip', function \(\) \{ onlyBar\.hidden = true; onlyBar\.innerHTML = ''; logShown = ROWS_SHOWN; logPage\(true\); \}\);/, 'a chip');
  assert.match(tpl, /logShown = ROWS_SHOWN; logPage\(true\);\n {4}\};/, 'a ticket');
  assert.match(tpl, /box\.addEventListener\('sg-sorted', function \(\) \{ logPage\(false\); \}\);/, 'a sort');
  assert.match(tpl, /if \(!fresh\) tr\.hidden = false; tr\.removeAttribute\('data-later'\);/, 'only its own rows taken back');
});
