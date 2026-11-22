import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightness, rampsOf, pageSurfaces, stepContrast, stepSwaps, stepSwapLines, stepContrastLines } from '../lib/colour-steps.mjs';
import { tokenRules } from '../lib/construction-page.mjs';

const ramps = {
  'primitives/blue/100': '#dbeafe', 'primitives/blue/300': '#93c5fd', 'primitives/blue/600': '#1d4ed8',
  'primitives/yellow/100': '#fef9c3', 'primitives/yellow/300': '#fde047', 'primitives/yellow/600': '#ca8a04',
  'primitives/green/100': '#dcfce7', 'primitives/green/300': '#86efac', 'primitives/green/600': '#15803d',
};
const vars = {
  color: {
    light: { ...ramps, 'surface/base/color': '#ffffff', 'text/accent/color': '#1d4ed8' },
    dark: { ...ramps, 'surface/base/color': '#111111', 'text/accent/color': '#93c5fd' },
  },
  aliases: {
    light: { 'text/accent/color': ['primitives/blue/600'] },
    dark: { 'text/accent/color': ['primitives/blue/300'] },
  },
};

test('lightness: black is 0, white is 1, and yellow looks lighter than blue', () => {
  assert.equal(Math.round(lightness({ r: 0, g: 0, b: 0 }) * 100), 0);
  assert.equal(Math.round(lightness({ r: 255, g: 255, b: 255 }) * 100), 100);
  assert.ok(lightness({ r: 0xca, g: 0x8a, b: 0x04 }) > lightness({ r: 0x1d, g: 0x4e, b: 0xd8 }));
});

test('the ramps are read from the names, a family then a number, three steps or more', () => {
  const { ramps: r, at } = rampsOf({ color: { light: { ...ramps, 'primitives/red/500': '#ef4444', 'primitives/red/600': '#dc2626' } } });
  assert.deepEqual([...r.keys()].sort(), ['primitives/blue', 'primitives/green', 'primitives/yellow'], 'a family of two steps is no ramp');
  assert.deepEqual(at.get('primitives/yellow/600'), { family: 'primitives/yellow', step: '600' });
  assert.deepEqual(pageSurfaces(vars).map((s) => [s.mode, s.token]), [['light', 'surface/base'], ['dark', 'surface/base']]);
});

test('a step that reaches 4.5:1 in one colour and not in another is said, in the mode where it splits', () => {
  const found = stepContrast(vars);
  const light600 = found.find((f) => f.step === '600' && f.mode === 'light');
  assert.ok(light600, 'on white, blue and green 600 reach 4.5:1 and yellow 600 does not');
  assert.deepEqual(light600.pass.map((x) => x.family).sort(), ['primitives/blue', 'primitives/green']);
  assert.deepEqual(light600.fail.map((x) => x.family), ['primitives/yellow']);
  assert.ok(light600.light[1] > light600.light[0]);
  assert.ok(!found.some((f) => f.step === '100' && f.mode === 'light'), 'a step that fails in every colour is no split');
  const [line] = stepContrastLines([light600], ['light', 'dark']);
  assert.equal(line.where, 'Step 600 in light');
  assert.match(line.value, /blue · green reach 4.5:1 and yellow is \d+(\.\d+)?:1/);
  assert.doesNotMatch(line.value, /;/);
});

test('a semantic colour that would fall under its ratio at the same step of another colour is said, with the colours that break it', () => {
  const found = stepSwaps(vars);
  const accent = found.find((f) => f.text === 'text/accent/color' && f.side === 'text');
  assert.ok(accent, 'text/accent points at blue/600 on white: yellow/600 there is under 4.5:1');
  assert.ok(accent.breaks.some((b) => b.family === 'primitives/yellow' && b.mode === 'light'));
  assert.ok(!accent.breaks.some((b) => b.family === 'primitives/green' && b.mode === 'light'), 'green/600 still reaches it');
  const [line] = stepSwapLines([accent]);
  assert.equal(line.where, 'text/accent/color');
  assert.match(line.value, /from blue\/600: yellow\/600 is/);
});

test('one ramp, or none, says nothing', () => {
  const one = { color: { light: { 'primitives/blue/100': '#dbeafe', 'primitives/blue/300': '#93c5fd', 'primitives/blue/600': '#1d4ed8', 'surface/base/color': '#fff' } } };
  assert.deepEqual(stepContrast(one), []);
  assert.deepEqual(stepSwaps(one), []);
  assert.deepEqual(stepContrast({}), []);
});

test('the Rules page says both as the tokens\' to decide, and nothing when the scales hold', () => {
  const rules = tokenRules({ vars });
  const steps = rules.find((r) => r.id === 'tokens-step-contrast'), swaps = rules.find((r) => r.id === 'tokens-step-swap');
  assert.equal(steps.status, 'decide');
  assert.equal(swaps.status, 'decide');
  assert.equal(steps.who, 'figma');
  const even = { color: { light: { 'primitives/blue/100': '#dbeafe', 'primitives/blue/300': '#93c5fd', 'primitives/blue/600': '#1d4ed8', 'primitives/green/100': '#dcfce7', 'primitives/green/300': '#86efac', 'primitives/green/600': '#15803d', 'surface/base/color': '#ffffff' } } };
  const held = tokenRules({ vars: even });
  assert.equal(held.find((r) => r.id === 'tokens-step-contrast').status, 'rule');
  assert.ok(!tokenRules({ vars: { color: { light: { 'surface/base/color': '#fff' } } } }).some((r) => r.id === 'tokens-step-contrast'), 'a system with no ramps has no such rule');
});

test('a step written in the name (Neutral 600, red-600) is a step, and each mode reads its own ramps', () => {
  const p = (pre, list) => Object.fromEntries(list.map(([s, v]) => [`primitives/${pre}${s}`, v]));
  const light = { ...p('Sand ', [[100, '#fef3c7'], [300, '#fcd34d'], [600, '#d97706']]), ...p('Sea-', [[100, '#dbeafe'], [300, '#93c5fd'], [600, '#1d4ed8']]) };
  const dark = { ...p('Sand ', [[100, '#78350f'], [300, '#b45309'], [600, '#fbbf24']]), ...p('Sea-', [[100, '#1e3a8a'], [300, '#1d4ed8'], [600, '#93c5fd']]) };
  const v = { primitives: { light, dark }, color: { light: { 'surface/base/color': '#ffffff' }, dark: { 'surface/base/color': '#111111' } } };
  assert.deepEqual([...rampsOf(v).ramps.keys()].sort(), ['primitives/Sand', 'primitives/Sea']);
  assert.equal(rampsOf(v, 'dark').ramps.get('primitives/Sea').get('600').token, 'primitives/Sea-600');
  const found = stepContrast(v);
  assert.ok(found.some((f) => f.mode === 'light' && f.step === '600' && f.fail[0].family === 'primitives/Sand'), 'on white, Sand 600 falls under where Sea 600 reaches it');
  assert.ok(!found.some((f) => f.mode === 'dark' && f.step === '600'), 'in dark the ramps run the other way, and both 600s reach it on the dark surface');
});
