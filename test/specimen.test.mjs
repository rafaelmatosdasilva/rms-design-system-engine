// The theme editor's specimen (lib/specimen.mjs): the components it may place, each one the code renders and the
// catalog's own check lets through, in families named the way the industry names them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyOf, codeRendered, specimenPlan } from '../lib/specimen.mjs';

const comp = (name, extra = {}) => ({ name, renders: [{ markup: `<div class="${name}">x</div>` }], ...extra });
const catalog = (...names) => ({ components: Object.fromEntries(names.map((n) => [n, { props: {} }])) });

test('a component\'s family comes from its name; a part of another (a row, a cell, a/b) is none', () => {
  assert.equal(familyOf('buttonPrimary'), 'button');
  assert.equal(familyOf('inputTextArea'), 'textarea');
  assert.equal(familyOf('selectMenu'), 'select');
  assert.equal(familyOf('checkboxGroup'), 'checkbox');
  assert.equal(familyOf('dialogAcme'), 'overlay');
  assert.equal(familyOf('cardTile'), 'card');
  assert.equal(familyOf('timeline'), 'data');
  assert.equal(familyOf('mascotPanel'), 'other');
  assert.equal(familyOf('table/Cell/text'), null);
  assert.equal(familyOf('selectMenuRow'), null);
});

test('only what the code renders: its renderings, or markup read from its code, never one drawn from its role', () => {
  assert.equal(codeRendered(comp('chip')), true);
  assert.equal(codeRendered({ name: 'chip', markup: '<div></div>', markupFrom: 'jsx' }), true);
  assert.equal(codeRendered({ name: 'chip', markup: '<div></div>', markupFrom: 'role' }), false);
  assert.equal(codeRendered({ name: 'chip' }), false);
});

test('every placed component passes the catalog\'s check; one it refuses is left off and said, main actions first', () => {
  const plan = specimenPlan([comp('buttonLink'), comp('buttonSecondary'), comp('buttonPrimary'), comp('inputAcme'), comp('ghostWidget'), { name: 'tag', markup: '<i></i>', markupFrom: 'role' }],
    catalog('buttonLink', 'buttonSecondary', 'buttonPrimary', 'inputAcme', 'tag'));
  assert.deepEqual(plan.sections.map((s) => [s.key, s.components]), [['actions', ['buttonPrimary', 'buttonSecondary', 'buttonLink']], ['forms', ['inputAcme']]]);
  assert.deepEqual(plan.refused.map((r) => r.name), ['ghostWidget'], 'not in the catalog: never drawn');
  assert.ok(plan.refused[0].why[0].includes('not in the catalog'));
  assert.deepEqual(plan.check, { placed: 4, refused: 1 });
  assert.deepEqual(plan.composition.children.map((c) => c.component), ['buttonPrimary', 'buttonSecondary', 'buttonLink', 'inputAcme']);
});

test('no catalog yet (no audit has run): nothing is placed, since nothing can be checked', () => {
  const plan = specimenPlan([comp('buttonPrimary')], null);
  assert.deepEqual(plan.sections, []);
  assert.equal(plan.unchecked, true);
});
