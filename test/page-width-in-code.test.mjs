// The card said what the design drew and nothing of what the code does, so an agent kept a filter button at the width
// the design gave it and laid three beside a search bar the code lets fill the row: every label cut to a letter. The
// code's own width now stands beside the design's, and a difference is a finding about the code.
//
// A difference is never a gap. A gap is what the design system lacks, and that list writes into Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeWidthLine, widthDifferences, boxLine } from '../lib/page-check.mjs';
import { codeWidth, lowCapture } from '../lib/capture-compare.mjs';

const fact = (value, o = {}) => ({ value, rule: '.ds-field, .ds-dropdown', at: 'theme.css:12', confidence: 'measured', ...o });

test('the comparability rule is one function, which the audit and the card both ask', () => {
  // A width that follows its container is the page's, not the component's: both sides must refuse it the same way.
  const rel = codeWidth({ props: { width: { value: '100%', rule: '.x', declared: '100%' } } }, 'width');
  assert.match(rel.why, /follows its container/);
  assert.match(rel.how, /follows what holds it/);
  // A width the page sets on the element is the page's too.
  assert.match(codeWidth({ props: { width: { value: '300px', rule: 'style attribute' } } }, 'width').why, /the page sets this width/);
  // No rule at all: nothing the component decided.
  assert.match(codeWidth({ props: {} }, 'width').why, /follows its content or container/);
  // A real min-width is comparable, and carries where it came from — the shared base rule, not the component's file.
  const min = codeWidth({ props: { minWidth: fact('280px') } }, 'minWidth');
  assert.equal(min.code, 280);
  assert.equal(min.rule, '.ds-field, .ds-dropdown', 'a width living in a shared base resolves, never reads as missing');
  assert.equal(min.unset, false);
  // An unset one is not a width the code gives.
  assert.equal(codeWidth({ props: { maxWidth: fact('none') } }, 'maxWidth').unset, true);
  assert.equal(codeWidth({ props: {} }, 'minWidth'), null);
});

test('a capture with no measured box is no evidence', () => {
  assert.equal(lowCapture({ confidence: 'low' }), true);
  assert.equal(lowCapture({ confidence: 'static-only' }), true);
  assert.equal(lowCapture({ confidence: 'measured' }), false);
});

test('the card says the code\'s width, and how sure the reading is', () => {
  const box = { width: codeWidth({ props: { width: fact('90px') }, size: { width: 90 } }, 'width'),
    minWidth: codeWidth({ props: { minWidth: fact('70px') } }, 'minWidth') };
  assert.equal(codeWidthLine(box), 'fixed at 90px, never under 70px');
  // A reading from one source alone, or one the two readings disagreed on, is never printed as plain fact.
  const shaky = { minWidth: codeWidth({ props: { minWidth: fact('70px', { confidence: 'single-source' }) } }, 'minWidth') };
  assert.match(codeWidthLine(shaky), /never under 70px \(read from one source\)/);
  const argued = { minWidth: codeWidth({ props: { minWidth: fact('70px', { confidence: 'uncertain' }) } }, 'minWidth') };
  assert.match(codeWidthLine(argued), /the two readings disagreed/);
});

test('nothing read is never printed as a width, and never as the literal null', () => {
  assert.equal(codeWidthLine(null), null);
  assert.equal(codeWidthLine({}), null);
  // not-read is the capture saying it could not see: the card says nothing rather than inventing a number.
  assert.equal(codeWidthLine({ minWidth: codeWidth({ props: { minWidth: fact('0px', { confidence: 'not-read' }) } }, 'minWidth') }), null);
  // A width that is not a number never reaches the card as "fixed at null".
  const bad = { width: { field: 'width', code: NaN, value: 'x', confidence: 'measured' } };
  assert.equal(codeWidthLine(bad), null);
  // What the code does instead of a fixed width is said in words, not as a measurement.
  assert.equal(codeWidthLine({ width: codeWidth({ props: { width: { value: '100%', rule: '.x', declared: '100%' } } }, 'width') }), 'follows what holds it (100%)');
});

test('a difference is named with both sides and where the code decided it', () => {
  const design = { sizing: { h: 'FIXED' }, width: 90, minWidth: 200 };
  const code = { minWidth: codeWidth({ props: { minWidth: fact('70px') } }, 'minWidth') };
  assert.deepEqual(widthDifferences(design, code), [
    { field: 'min width', design: 200, code: '70px', rule: '.ds-field, .ds-dropdown' },
  ]);
  // The same number on both sides is no difference.
  assert.deepEqual(widthDifferences({ minWidth: 70 }, code), []);
});

test('what cannot be compared is never called a difference', () => {
  const design = { minWidth: 200, maxWidth: 500 };
  // Follows its container: the page's width, not the component's.
  assert.deepEqual(widthDifferences(design, { minWidth: codeWidth({ props: { minWidth: { value: '50%', rule: '.x', declared: '50%' } } }, 'minWidth') }), []);
  // Unset in code: the code gives no minimum, which is not a disagreement about one.
  assert.deepEqual(widthDifferences(design, { maxWidth: codeWidth({ props: { maxWidth: fact('none') } }, 'maxWidth') }), []);
  // Not read: no evidence either way.
  assert.deepEqual(widthDifferences(design, { minWidth: codeWidth({ props: { minWidth: fact('70px', { confidence: 'not-read' }) } }, 'minWidth') }), []);
  // No capture at all, or no design box: nothing to say.
  assert.deepEqual(widthDifferences(design, null), []);
  assert.deepEqual(widthDifferences(null, { minWidth: codeWidth({ props: { minWidth: fact('70px') } }, 'minWidth') }), []);
});

test('the design\'s own line is untouched', () => {
  assert.equal(boxLine({ sizing: { h: 'FIXED' }, width: 90, minWidth: 200 }), 'fixed at 90px, never under 200px');
});
