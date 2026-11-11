// The library's own conventions beside its names (system-advice.mjs): a variant option named by its look, spacing off
// the library's own grid, a mode spelled two ways across collections, and a status colour family missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionsNamedByLook, offGrid, modeSpellings, statusFamilies } from '../lib/system-advice.mjs';
import { tokenRules, optionsRule } from '../lib/construction-page.mjs';

test('a variant option named by its look, never a shade number or a role', () => {
  const props = { badgeTag: { properties: { 'Color#1:2': { type: 'VARIANT', variantOptions: ['Blue', 'Dark green', 'Primary'] }, Size: { type: 'VARIANT', variantOptions: ['100', '200'] } } }, _private: { properties: { Tint: { type: 'VARIANT', variantOptions: ['Red'] } } } };
  assert.deepEqual(optionsNamedByLook(props), [{ component: 'badgeTag', prop: 'Color', option: 'Blue' }, { component: 'badgeTag', prop: 'Color', option: 'Dark green' }]);
  assert.deepEqual(optionsRule(props).toFix.map((t) => t.value), ['Color=Blue', 'Color=Dark green'], 'a component with no family is read too');
});

test('spacing off the grid the library keeps: hairlines, pills, fonts and borders aside; no grid kept, nothing said', () => {
  const sizing = { 'space/xs': '4px', 'space/s': '8px', 'space/m': '12px', 'space/l': '16px', 'space/xl': '24px', 'radius/card': '8px', 'radius/pill': '9999px',
    'cardTile/width': '250px', 'gap/row': '20px', 'size/icon': '24px', 'size/avatar': '40px', 'border/width': '1px', 'font/size/body': '15px', 'hairline/height': '1px', 'padding/page': '32px',
    'space/2xl': '48px', 'space/3xl': '64px', 'inset/dialog': '28px', 'offset/tooltip': '4px', 'radius/button': '12px', 'size/control': '44px', 'width/rail': '72px' };
  const g = offGrid({ sizing });
  assert.equal(g.base, 4);
  assert.deepEqual(g.off, [{ name: 'cardTile/width', value: 250 }], '250 is off a 4px grid; 15px is a font, 1px a hairline, 9999 a pill');
  assert.equal(offGrid({ sizing: { 'space/a': '3px', 'space/b': '5px', 'space/c': '7px', 'space/d': '9px', 'space/e': '11px', 'space/f': '13px', 'space/g': '6px', 'space/h': '10px', 'space/i': '14px', 'space/j': '17px' } }), null, 'no grid kept');
  assert.deepEqual(tokenRules({ vars: { sizing, color: {} } }).find((r) => r.id === 'tokens-on-grid').toFix.map((t) => t.value), ['250px']);
});

test('a mode spelled two ways across collections; the same name everywhere is fine', () => {
  const vars = { _collections: { colorModes: ['Light', 'Dark'] }, modeVariants: { Contrast: { modes: [{ name: 'dark mode' }, { name: 'High' }] }, Size: { modes: [{ name: 'Light' }] } } };
  assert.deepEqual(modeSpellings(vars), [{ concept: 'dark', spellings: ['Dark', 'dark mode'] }]);
});

test('a status colour family missing where the others are there, by whichever word the system uses', () => {
  assert.deepEqual(statusFamilies(['feedback/negative/color', 'feedback/positive/color', 'feedback/notice/color']), { have: ['error', 'success', 'info'], missing: ['warning'] });
  assert.equal(statusFamilies(['brand/primary']), null, 'a system with no status colours is not asked for one');
  assert.equal(statusFamilies(['infopanelTile/background', 'error/color']), null, 'a word inside another (infopanel) is no info colour: one family, nothing asked');
});
