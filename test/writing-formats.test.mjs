// writing-formats.mjs - the dates the code writes, against the format the intent layer's writing rules give. An invented
// system (Acme) with a dates helper file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryFormat, ruleFormats, codeFormats, writingFindings } from '../writing-formats.mjs';

const RULES = 'Dates. Use `d mmm yyyy, hh:mm` when date and time are both present. Use `d mmm yyyy` for a date. The day has no leading zero (`5 jun 2025`, not `05 jun 2025`). Examples: 26 jan 2025, 13:45';
const DATES = `import moment from 'moment'
export const shortDate = (d) => \`\${moment(d).format('D')} \${moment(d).format('MMM').charAt(0).toUpperCase()}\${moment(d).format('MMM').slice(1)} \${moment(d).format('YYYY')}\`
export const dateTime = (d) => moment(d).format('D MMM YYYY, HH:mm')
export const padded = (d) => moment(d).format('DD MMM YYYY')
export const apiDate = (d) => moment(d).format('YYYY-MM-DD')
`;

test('a format written for a person is read as a date library writes it; the rules\' examples say how the month is written', () => {
  assert.equal(libraryFormat('d mmm yyyy, hh:mm:ss'), 'D MMM YYYY, HH:mm:ss');
  assert.equal(libraryFormat('dd/mm/yyyy'), 'DD/MM/YYYY');
  assert.deepEqual(ruleFormats(RULES), { formats: ['D MMM YYYY, HH:mm', 'D MMM YYYY'], month: 'lower', example: '5 jun 2025' });
  const h = codeFormats([{ file: 'src/dates.js', text: DATES }]);
  assert.deepEqual(h.map((x) => [x.name, x.formats, x.capital]), [['shortDate', ['D MMM YYYY'], true], ['dateTime', ['D MMM YYYY, HH:mm'], false], ['padded', ['DD MMM YYYY'], false], ['apiDate', ['YYYY-MM-DD'], false]]);
});

test('a month with a capital the rules write in lowercase, a padded day no rule gives, and two helpers that disagree; a machine\'s date is left alone', () => {
  const f = writingFindings({ rules: RULES, files: [{ file: 'src/dates.js', text: DATES }] });
  assert.deepEqual(f.map((x) => x.kind), ['case', 'format', 'unlike']);
  assert.match(f[0].says, /^shortDate \(src\/dates\.js:2\) writes the month with a capital; the writing rules write it in lowercase \(5 jun 2025\)\./);
  assert.match(f[1].says, /^padded \(src\/dates\.js:4\) writes a date as DD MMM YYYY; the writing rules give D MMM YYYY, HH:mm, D MMM YYYY\./);
  assert.match(f[2].says, /shortDate writes the month with a capital and dateTime, padded without/);
  assert.ok(!f.some((x) => /apiDate/.test(x.says)), 'YYYY-MM-DD is for a machine, not a person');
  assert.deepEqual(writingFindings({ rules: 'No format here.', files: [{ file: 'src/dates.js', text: DATES }] }), [], 'no rule, nothing to compare');
});
