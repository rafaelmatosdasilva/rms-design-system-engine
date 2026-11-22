// The colour scales' steps on the colour pages (colour-steps.mjs stepTable) and in the health report (stepStandIn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepTable, stepStandIn } from '../lib/colour-steps.mjs';

const vars = {
  color: {
    light: { 'surface/page/color': '#ffffff', 'text/primary/color': '#111111' },
    dark: { 'surface/page/color': '#101010', 'text/primary/color': '#f2f2f2' },
  },
  primitives: {
    light: { 'blue/400': '#5b8def', 'blue/600': '#1f5fd6', 'blue/800': '#123c88', 'yellow/400': '#ffe066', 'yellow/600': '#f2c200', 'yellow/800': '#8a6d00' },
    dark: { 'blue/400': '#5b8def', 'blue/600': '#1f5fd6', 'blue/800': '#123c88', 'yellow/400': '#ffe066', 'yellow/600': '#f2c200', 'yellow/800': '#8a6d00' },
  },
};

test('each shared step, every colour at it with its contrast on the page in each mode, a split marked', () => {
  const t = stepTable(vars, { varOf: (n) => (n === 'blue/600' ? '--blue-600' : null) });
  assert.deepEqual(t.map((x) => x.step), ['400', '600', '800']);
  const s600 = t.find((x) => x.step === '600');
  assert.equal(s600.splits, true);
  assert.deepEqual(s600.short, ['yellow in light', 'blue in dark'], 'each colour that falls short, with its mode');
  assert.deepEqual(s600.modes, ['light', 'dark']);
  const blue = s600.rows.find((r) => r.family === 'blue');
  assert.equal(blue.var, '--blue-600');
  assert.equal(blue.cells[0].reads, true);
  assert.ok(blue.cells[0].ratio >= 4.5);
  assert.equal(s600.rows.find((r) => r.family === 'yellow').cells[0].reads, false);
  assert.deepEqual(stepTable({ color: vars.color }), [], 'no colour scales: nothing to show');
});

test('the health report reads the same lists', () => {
  const s = stepStandIn(vars);
  assert.equal(s.steps, 3);
  assert.ok(s.split.some((x) => x.step === '600' && x.short.includes('yellow in light')));
  assert.equal(stepStandIn({ color: vars.color }), null);
});
