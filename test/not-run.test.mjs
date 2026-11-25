// A section of a report that could not run says so: one line per reason, the sections that share a reason named
// together, and nothing at all for a section that ran and found nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notRunLine, notRunLines, browserWhy, NO_SCREEN } from '../lib/not-run.mjs';

const OFF = 'the browser was not asked for (--no-browser)';

test('a section that did not run says so, with its reason', () => {
  assert.deepEqual(notRunLines([{ label: '📱 EVERY SIZE', ran: false, why: OFF }]),
    [`⏭  📱 EVERY SIZE  Not run: ${OFF}`]);
});

test('sections that share a reason are one line, and the reason is said once', () => {
  const lines = notRunLines([
    { label: '📏 AGAINST THE DESIGNED SCREEN', ran: false, why: OFF },
    { label: '🎨 DESIGN REVIEW', ran: false, why: OFF },
    { label: '📱 EVERY SIZE AND STATE', ran: false, why: OFF },
  ]);
  assert.equal(lines.length, 1, 'one reason, one line');
  assert.equal(lines[0], `⏭  📏 AGAINST THE DESIGNED SCREEN · 🎨 DESIGN REVIEW · 📱 EVERY SIZE AND STATE  Not run: ${OFF}`);
  assert.equal(lines[0].match(/Not run:/g).length, 1, 'the reason is not repeated on each');
});

test('one line per reason, in the order the sections are given', () => {
  assert.deepEqual(notRunLines([
    { label: '📱 EVERY SIZE', ran: false, why: OFF },
    { label: '🖱  HOW IT WORKS', ran: false, why: 'nothing on this page can be clicked' },
  ]), [`⏭  📱 EVERY SIZE  Not run: ${OFF}`, '⏭  🖱  HOW IT WORKS  Not run: nothing on this page can be clicked']);
});

// The mistake this exists to stop: a section that ran and found nothing read as a section that did not run. The two
// are opposite statements, and the whole point of the module is to keep them apart.
test('a section that ran is never reported as not run', () => {
  assert.deepEqual(notRunLines([{ label: '📱 EVERY SIZE', ran: true, why: OFF }]), [],
    'it ran: nothing here says otherwise');
  assert.deepEqual(notRunLines([{ label: '📱 EVERY SIZE', ran: false, why: null }]), [],
    'no reason is nothing to say, never a reason made up here');
  assert.deepEqual(notRunLines([]), []);
  assert.deepEqual(notRunLines(), []);
  assert.deepEqual(notRunLines([null, undefined]), [], 'a section that is not one is left alone');
});

test('why the browser sections did not run, most telling first', () => {
  assert.equal(browserWhy({ asked: false, errors: 3, seen: { why: 'Chrome not found' } }), OFF,
    'not asked for comes first: the rest was never reached');
  assert.equal(browserWhy({ asked: true, errors: 1 }), 'the page has 1 error, so nothing was drawn to measure');
  assert.equal(browserWhy({ asked: true, errors: 2 }), 'the page has 2 errors, so nothing was drawn to measure');
  assert.equal(browserWhy({ asked: true, errors: 0, seen: { why: 'Chrome not found' } }), 'Chrome not found',
    'what the browser itself said');
  assert.equal(browserWhy({ asked: true, errors: 0, seen: { fit: {} } }), null, 'it ran');
  assert.equal(browserWhy({}), null, 'nothing said against it is not a reason');
});

test('a page the product designed no screen for says that, not that it matches', () => {
  const lines = notRunLines([{ label: '📏 AGAINST THE DESIGNED SCREEN', ran: false, why: NO_SCREEN }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /nothing to hold it against/);
});

test('a label is printed as given, trimmed, and several are joined the system\'s way', () => {
  assert.equal(notRunLine('  📱 EVERY SIZE  ', 'why'), '⏭  📱 EVERY SIZE  Not run: why');
  assert.equal(notRunLine(['a', 'b'], 'why'), '⏭  a · b  Not run: why');
});
