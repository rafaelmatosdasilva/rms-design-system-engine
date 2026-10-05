// The design review of a drawn prototype: alignment, spacing rhythm, one main action, hierarchy, line length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualFindings, visualLines } from '../prototype-visual.mjs';

const box = (path, name, left, top, w = 100, h = 20) => ({ path, name, left, right: left + w, top, bottom: top + h });
const clean = {
  containers: [{ path: '0', name: 'Page', engine: true, row: false, grid: false, align: 'flex-start', kids: [box('0.0', 'Text', 16, 16), box('0.1', 'field', 16, 48), box('0.2', 'Row', 16, 80)], gaps: [12, 12] },
    { path: '0.2', name: 'Row', engine: true, row: true, grid: false, align: 'flex-start', kids: [box('0.2.0', 'buttonPrimary', 16, 80), box('0.2.1', 'buttonSecondary', 124, 80)], gaps: [8] }],
  texts: [{ text: 'Billing', chars: 7, size: 20, weight: 700, level: 1, lines: 1, path: '0.0' }, { text: 'Card number', chars: 11, size: 13, weight: 400, level: 0, lines: 1, path: '0.1' }],
  primaries: [{ path: '0.2.0', name: 'buttonPrimary', text: 'Save' }],
};

test('a page aligned, on one rhythm, with one main action and a clear hierarchy scores 10', () => {
  assert.deepEqual(visualFindings(clean), { score: 10, findings: [] });
  assert.deepEqual(visualFindings(null), { score: null, findings: [] });
});

test('each problem is named with what to do, and takes points off', () => {
  const messy = structuredClone(clean);
  messy.containers[0].kids[1].left = 22;                       // a component's margin pushes it in
  messy.containers[0].gaps = [12, 20];                         // two spacings in one arrangement
  messy.primaries.push({ path: '0.2.1', name: 'buttonPrimary', text: 'Cancel' });
  messy.texts[0].size = 12;                                     // the main heading smaller than body text
  messy.texts.push({ text: 'x'.repeat(240), chars: 240, size: 13, weight: 400, level: 0, lines: 2, path: '0.3' });
  messy.texts.push({ text: 'Payment', chars: 7, size: 13, weight: 400, level: 2, lines: 1, path: '0.4' });
  const v = visualFindings(messy);
  assert.deepEqual(v.findings.map((f) => f.kind), ['align', 'rhythm', 'primary', 'hierarchy', 'hierarchy', 'reading']);
  assert.equal(v.score, 10 - (1 + 1 + 2 + 2 + 2 + 1));
  const lines = visualLines(v).join('\n');
  assert.match(lines, /the parts of Page \(0\) do not start on one line: field \(0\.1\) sits 6px in/);
  assert.match(lines, /the space between the parts of Page \(0\) changes \(12, 20px\)/);
  assert.match(lines, /2 primary actions in view \(buttonPrimary "Save", buttonPrimary "Cancel"\): keep one/);
  assert.match(lines, /the main heading "Billing" \(12px\) is not the largest text on the page \(13px\)/);
  assert.match(lines, /the heading "Payment" \(h2, 13px\) is larger than a heading above it in rank/);
  assert.match(lines, /runs about 120 characters a line: keep lines under 90/);
  assert.doesNotMatch(lines, /"Billing" looks like body text/, 'one line for one heading');
});

test('a heading no larger or heavier than the text it heads reads as body text', () => {
  const c = structuredClone(clean);
  c.texts.push({ text: 'Payment', chars: 7, size: 13, weight: 400, level: 2, lines: 1, path: '0.4' });
  assert.deepEqual(visualLines(visualFindings(c)), ['⚠️  the heading "Payment" looks like body text (13px, weight 400): use a larger or heavier text style']);
});

test('a column centred on purpose is not misaligned, and many spacings across the page are one line', () => {
  const c = structuredClone(clean);
  c.containers[0].align = 'center';
  c.containers[0].kids[1].left = 40;
  c.containers.push({ path: '0.5', name: 'Stack', engine: true, row: false, grid: false, align: 'stretch', kids: [box('a', 'x', 16, 0), box('b', 'x', 16, 30), box('c', 'x', 16, 60)], gaps: [4, 4] });
  c.containers.push({ path: '0.6', name: 'Stack', engine: true, row: false, grid: false, align: 'stretch', kids: [box('d', 'x', 16, 0), box('e', 'x', 16, 30)], gaps: [24] });
  c.containers.push({ path: '0.7', name: 'Stack', engine: true, row: false, grid: false, align: 'stretch', kids: [box('f', 'x', 16, 0), box('g', 'x', 16, 30)], gaps: [32] });
  const v = visualFindings(c);
  assert.deepEqual(v.findings.map((f) => f.kind), ['spacings']);
  assert.match(v.findings[0].message, /5 different spaces between parts \(4, 8, 12, 24, 32px\)/);
});
