import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutCaptureScript, compareLayout, layoutLines } from '../showroom-compare.mjs';

test('the layout capture only reads, a part at a time', () => {
  const s = layoutCaptureScript('76:18817', { from: 80, count: 40 });
  assert.match(s, /Read-only/);
  assert.match(s, /FROM = 80, COUNT = 40/);
  assert.doesNotMatch(s, /\.(remove|resize|setProperties|appendChild)\(/);
});

test('each Figma text is matched by its words, compared by its start and its middle; what the frame cuts is left out', () => {
  const figma = { size: [100, 100], texts: [{ text: 'Central', x: 10, y: 10, w: 80, h: 20, size: 35, under: ['headerPagePrimary'] }, { text: 'Hidden row', x: 10, y: 140, w: 50, h: 20 }], instances: [{ component: 'tabGroup', x: 0, y: 50, w: 100, h: 80 }] };
  const drawn = { texts: [{ text: 'Central', x: 18, y: 14, w: 60, h: 20, size: 35 }], parts: [{ component: 'tabGroup', x: 0, y: 58, w: 100, h: 48 }] };
  const rows = compareLayout(figma, drawn, { tol: 1 });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual(Object.keys(by).sort(), ['Central', 'tabGroup']);
  assert.deepEqual([by.Central.dx, by.Central.dy], [8, 4]);
  assert.ok(layoutLines(rows).some((l) => /"Central" \(in headerPagePrimary\): 8px right, 4px lower/.test(l)));
  // A part Figma lets run past the frame is compared as tall as the frame shows it (50 → 100), the drawing's too.
  assert.deepEqual([by.tabGroup.dy, by.tabGroup.dh], [8, -8]);
});
