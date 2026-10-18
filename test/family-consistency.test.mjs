// family-consistency.mjs — components of one type built the same way in Figma. Every name below is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyFindings, familyLine } from '../family-consistency.mjs';
import { plainAction, plainDifference } from '../run-diff.mjs';

const onOff = { type: 'VARIANT', variantOptions: ['false', 'true'] };
const state = (...o) => ({ type: 'VARIANT', variantOptions: o });
const text = { type: 'TEXT' }, bool = { type: 'BOOLEAN' };
const snap = {
  tileOne: { properties: { labelContent: text, disabled: onOff, showIcon: bool } },
  tileTwo: { properties: { labelContent: text, disabled: onOff, showIcon: bool } },
  tileThree: { properties: { labelContent: text, 'state#1:2': state('default', 'disabled'), showIcon: bool } },
  tileFour: { properties: { Label: text, disabled: onOff } },
  chipOne: { properties: { disabled: onOff } }, chipTwo: { properties: { 'state': state('default', 'disabled') } },
};

test('one state shaped one way, one thing called one name, what most of them have', () => {
  const f = familyFindings(snap);
  assert.deepEqual(f.map((x) => [x.component, x.kind, x.name]), [['tileThree', 'shape', 'disabled'], ['tileFour', 'name', 'Label'], ['tileFour', 'missing', 'showIcon']]);
  assert.equal(familyLine(f[0]), 'tileThree is built differently from the other tile components: its disabled state is built differently (3 of the 4 tiles with a disabled state make it a property of its own (on or off)); make disabled a property of its own (on or off), or keep it as a known exception');
  // Two chips, one each way: no type of three, and no way most of them use, so nothing to follow.
  assert.ok(!f.some((x) => x.family === 'chip'));
});

test('each finding reads plainly and keeps the exception as an option', () => {
  const [shape, , missing] = familyFindings(snap);
  assert.equal(plainDifference(familyLine(shape), 'tileThree'), 'In Figma, its disabled state is built differently from the other tile components: 3 of the 4 tiles with a disabled state make it a property of its own (on or off).');
  assert.deepEqual(plainAction(familyLine(shape), 'tileThree'), { who: 'both', todo: 'In Figma, make disabled a property of its own (on or off), as the other tile components do, or keep it as a known exception.' });
  assert.deepEqual(plainAction(familyLine(missing), 'tileFour'), { who: 'both', todo: 'In Figma, check whether it needs showIcon (most tile components have it), or keep it as a known exception.' });
});

test('a type named in two words when every one of them starts so', () => {
  const f = familyFindings({ menuItemOne: { properties: { disabled: onOff } }, menuItemTwo: { properties: { disabled: onOff } }, menuItemThree: { properties: { state: state('disabled') } } });
  assert.equal(f[0].family, 'menuItem');
});
