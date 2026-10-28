// How a component is built, beside its family and the system (construction-grammar.mjs → Architecture), and the rules
// the team decided, which a run fails on beside the gates (decidedRules, constructionLines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grammarOf, fixOf, decidedRules, constructionLines } from '../construction-grammar.mjs';

const rule = (g, id) => g.figma.rules.find((r) => r.id === id);
const boxed = (layout, h = 'HUG') => ({ box: { layout, sizing: { h, v: 'HUG' } } });
const look = { paddingPx: [8, 8, 8, 8], gapPx: 4, radiusPx: [4, 4, 4, 4], fontSize: 14, colors: { fill: { token: 'surface' }, text: { token: 'text' }, stroke: null } };

// Four buttons laid out in a row, one in a column; four cards in a column. Each a yes/no variant: two only show a
// layer (a boolean in all but name), two restyle (disabled changes the fill).
const yes = (name, prop, restyles) => ({ properties: { [prop]: { type: 'VARIANT', variantOptions: ['true', 'false'] } }, _v: { restyles } });
const props = {
  buttonPrimary: yes('buttonPrimary', 'disabled', true), buttonSecondary: yes('buttonSecondary', 'disabled', true),
  buttonTertiary: yes('buttonTertiary', 'showIcon', false), buttonGhost: yes('buttonGhost', 'showIcon', false), buttonIcon: { properties: {} },
  cardTile: { properties: {} }, cardStat: { properties: {} }, cardInfo: { properties: {} }, cardQuote: { properties: {} },
};
const variants = (prop, restyles) => ({
  [`${prop}=true`]: { ...look, inFlow: restyles ? 2 : 3, layers: restyles ? ['Background', 'Content', 'Label'] : ['Background', 'Content', 'Label', 'Icon'], ...(restyles ? { colors: { ...look.colors, fill: { token: 'surface/disabled' } } } : {}) },
  [`${prop}=false`]: { ...look, inFlow: 2, layers: ['Background', 'Content', 'Label'] },
});
// The layers on its frame, then the system's icon nested in its Content.
const sk = (...roots) => [...roots.map((n) => ({ d: 1, t: 'FRAME', n })), { d: 2, t: 'INSTANCE', n: 'Icon', of: 'icon' }];
const structure = {
  buttonPrimary: { ...boxed('HORIZONTAL'), paddingVar: { tb: 'p/s', lr: 'p/m' }, variants: variants('disabled', true), skeleton: sk('Background', 'Content'), page: 'Buttons' },
  buttonSecondary: { ...boxed('HORIZONTAL'), paddingVar: { tb: 'p/s', lr: 'p/m' }, variants: variants('disabled', true), skeleton: sk('Background', 'Content'), page: 'Buttons' },
  buttonTertiary: { ...boxed('HORIZONTAL'), paddingVar: { tb: 'p/s', lr: 'p/m' }, variants: variants('showIcon', false), skeleton: sk('Background', 'Content'), page: 'Buttons' },
  buttonGhost: { ...boxed('HORIZONTAL'), paddingVar: { tb: 'p/s', lr: 'p/m' }, variants: variants('showIcon', false), skeleton: sk('Content', 'Background'), page: 'Buttons' },
  buttonIcon: { ...boxed('VERTICAL', 'FIXED'), childFramePadding: [{ name: 'Content' }], skeleton: [...sk('Background', 'Content'), { d: 2, t: 'INSTANCE', n: 'Glyph', of: 'Old icon kit' }], page: 'Misc' },
  cardTile: { ...boxed('VERTICAL', 'FILL'), paddingVar: { tb: 'p/m' }, page: 'Cards' }, cardStat: { ...boxed('VERTICAL', 'FILL'), paddingVar: { tb: 'p/m' }, page: 'Cards' },
  cardInfo: { ...boxed('VERTICAL', 'FILL'), paddingVar: { tb: 'p/m' }, page: 'Cards' }, cardQuote: { ...boxed('VERTICAL', 'FILL'), paddingVar: { tb: 'p/m' }, page: 'Cards' },
};
// The system's own components, and the icon one nests.
structure.icon = { ...boxed('NONE') };

test('a component lays out, sizes its width and sits on a page the way its family does', () => {
  const g = grammarOf({ props, structure });
  const layout = rule(g, 'family-layout');
  assert.equal(layout.area, 'architecture');
  assert.deepEqual(layout.toFix.map((x) => x.component), ['buttonIcon']);
  assert.equal(layout.toFix[0].value, 'vertically, where its family (button…) lays out horizontally');
  assert.deepEqual(rule(g, 'family-sizing').toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'has a fixed width, where its family (button…) hugs its content']]);
  assert.deepEqual(rule(g, 'family-page').toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'on Misc, where its family (button…) is on Buttons']]);
  assert.equal(fixOf(layout, layout.toFix[0]).say, 'It lays out vertically, where its family (button…) lays out horizontally: lay it out as its family does');
});

test('padding sits where most components put it; layers come in one order; only the system\'s components are nested', () => {
  const g = grammarOf({ props, structure });
  const pad = rule(g, 'padding-where');
  assert.equal(pad.says, 'A component\'s padding sits on its own frame, not on a layer inside it');
  assert.deepEqual(pad.toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'Content']]);
  const order = rule(g, 'layer-order');
  assert.equal(order.says, 'A component\'s layers come in one order: Background, Content');
  assert.deepEqual(order.toFix.map((x) => [x.component, x.value]), [['buttonGhost', 'Content, Background']]);
  const nests = rule(g, 'nests-system');
  assert.deepEqual(nests.toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'Old icon kit']]);
  assert.equal(nests.follows, 4, 'an instance of the system\'s icon is its own');
});

test('a yes/no variant that only shows a layer is a boolean property in all but name; one that restyles is a variant', () => {
  const g = grammarOf({ props, structure });
  const r = rule(g, 'yes-no-variant-restyles');
  assert.equal(r.says, 'A yes/no variant changes how the component looks; one that only shows or hides layers is a boolean property');
  assert.deepEqual(r.toFix.map((x) => [x.component, x.value]), [['buttonGhost', 'showIcon: Icon'], ['buttonTertiary', 'showIcon: Icon']]);
  assert.equal(r.status, 'decide', 'half do: the team says whether it is the rule');
  assert.equal(fixOf(r, r.toFix[0]).say, 'showIcon only shows or hides Icon: make that a boolean property on the layer, and remove the showIcon variant');
});

test('a layer swapped for another, or a style that changes with it, keeps it a variant', () => {
  const swap = { buttonA: yes('buttonA', 'filled', false), buttonB: yes('buttonB', 'filled', false), buttonC: yes('buttonC', 'filled', false) };
  const st = Object.fromEntries(Object.keys(swap).map((n) => [n, { variants: { 'filled=true': { ...look, layers: ['Value'] }, 'filled=false': { ...look, layers: ['Placeholder'] } } }]));
  assert.equal(rule(grammarOf({ props: swap, structure: st }), 'yes-no-variant-restyles').toFix.length, 0, 'the value in place of the placeholder');
});

test('a run fails on the rules the team decided, beside the gates, and says nothing until the team decided one', () => {
  assert.deepEqual(constructionLines(grammarOf({ props, structure })), [], 'nothing decided: nothing to fail');
  const g = grammarOf({ props, structure }, { answers: { 'family-layout': true, 'padding-where': true, 'family-sizing': true } });
  const { decided, broken } = decidedRules(g);
  assert.equal(decided.length, 3);
  assert.equal(broken.length, 3);
  const lines = constructionLines(g);
  assert.equal(lines[0], '**Construction.** 3 of the 3 rules the team decided are broken, by 3 components:');
  assert.match(lines[1], /^- A component lays out the way its family does .*: buttonIcon$/);
  const told = constructionLines(grammarOf({ props, structure }, { answers: { description: true } }));
  assert.equal(told[0], '**Construction.** 1 of the 1 rules the team decided is broken, by 9 components:', 'a component counted once');
});
