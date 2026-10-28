// What the Construction page adds beside each component's skeleton (construction-grammar.mjs): where padding sits, the
// order a frame's layers come in, each component on its family's page, a yes/no variant that should be a boolean
// property; and the rules the team decided, which a run fails on beside the gates (decidedRules, constructionLines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grammarOf, fixOf, decidedRules, constructionLines } from '../construction-grammar.mjs';

const rule = (g, id) => g.figma.rules.find((r) => r.id === id);
const look = { paddingPx: [8, 8, 8, 8], gapPx: 4, radiusPx: [4, 4, 4, 4], fontSize: 14, colors: { fill: { token: 'surface' }, text: { token: 'text' }, stroke: null } };
// Two yes/no variants restyle (disabled changes the fill), two only show a layer (a boolean in all but name).
const variants = (prop, restyles) => ({
  [`${prop}=true`]: { ...look, inFlow: restyles ? 2 : 3, layers: restyles ? ['Background', 'Content', 'Label'] : ['Background', 'Content', 'Label', 'Icon'], ...(restyles ? { colors: { ...look.colors, fill: { token: 'surface/disabled' } } } : {}) },
  [`${prop}=false`]: { ...look, inFlow: 2, layers: ['Background', 'Content', 'Label'] },
});
const yesNo = (prop) => ({ properties: { [prop]: { type: 'VARIANT', variantOptions: ['true', 'false'] } } });
const props = { buttonPrimary: yesNo('disabled'), buttonSecondary: yesNo('disabled'), buttonTertiary: yesNo('showIcon'), buttonGhost: yesNo('showIcon'), buttonIcon: { properties: {} }, icon: { properties: {} } };
const structure = {
  buttonPrimary: { paddingVar: { tb: 'p/s' }, variants: variants('disabled', true) },
  buttonSecondary: { paddingVar: { tb: 'p/s' }, variants: variants('disabled', true) },
  buttonTertiary: { paddingVar: { tb: 'p/s' }, variants: variants('showIcon', false) },
  buttonGhost: { paddingVar: { tb: 'p/s' }, variants: variants('showIcon', false) },
  buttonIcon: { childFramePadding: [{ name: 'Content' }] },
};
// The skeleton: each one's resting tree (its frame's layers, the system's icon nested), its page.
const tree = (...roots) => ({ trees: [{ layout: { dir: 'HORIZONTAL' }, c: [...roots.map((n) => ({ t: 'FRAME', n })), { t: 'INSTANCE', n: 'icon', of: { name: 'icon' } }] }], variants: [['state=default', 0]] });
const skeleton = {
  buttonPrimary: { ...tree('Background', 'Content'), page: 'Buttons' }, buttonSecondary: { ...tree('Background', 'Content'), page: 'Buttons' },
  buttonTertiary: { ...tree('Background', 'Content'), page: 'Buttons' }, buttonGhost: { ...tree('Content', 'Background'), page: 'Buttons' },
  buttonIcon: { ...tree('Background', 'Content'), page: 'Misc' },
};

test('padding sits where most components put it', () => {
  const pad = rule(grammarOf({ props, structure }), 'padding-where');
  assert.equal(pad.says, 'A component\'s padding sits on its own frame, not on a layer inside it');
  assert.equal(pad.area, 'layout');
  assert.deepEqual(pad.toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'Content']]);
  assert.equal(fixOf(pad, pad.toFix[0]).say, 'Its padding is on Content: move it to its own frame');
});

test('a frame\'s layers come in one order, and each component sits on its family\'s page', () => {
  const g = grammarOf({ props, structure, skeleton });
  const order = rule(g, 'layer-order');
  assert.equal(order.says, 'A component\'s layers come in one order: Background, Content');
  assert.equal(order.area, 'layers');
  assert.deepEqual(order.toFix.map((x) => [x.component, x.value]), [['buttonGhost', 'Content, Background']]);
  const page = rule(g, 'family-page');
  assert.equal(page.area, 'placement');
  assert.deepEqual(page.toFix.map((x) => [x.component, x.value]), [['buttonIcon', 'on Misc, where its family (button…) is on Buttons']]);
  assert.equal(fixOf(page, page.toFix[0]).say, 'It is on Misc, where its family (button…) is on Buttons: move it to its family\'s page');
});

test('a yes/no variant that only shows a layer is a boolean property in all but name; one that restyles is a variant', () => {
  const r = rule(grammarOf({ props, structure }), 'yes-no-variant-restyles');
  assert.equal(r.says, 'A yes/no variant changes how the component looks; one that only shows or hides layers is a boolean property');
  assert.equal(r.area, 'wiring');
  assert.deepEqual(r.toFix.map((x) => [x.component, x.value]), [['buttonGhost', 'showIcon: Icon'], ['buttonTertiary', 'showIcon: Icon']]);
  assert.equal(r.status, 'decide', 'half do: the team says whether it is the rule');
  assert.equal(fixOf(r, r.toFix[0]).say, 'showIcon only shows or hides Icon: make that a boolean property on the layer, and remove the showIcon variant');
});

test('a layer swapped for another keeps it a variant', () => {
  const swap = { inputA: yesNo('filled'), inputB: yesNo('filled'), inputC: yesNo('filled') };
  const st = Object.fromEntries(Object.keys(swap).map((n) => [n, { variants: { 'filled=true': { ...look, layers: ['Value'] }, 'filled=false': { ...look, layers: ['Placeholder'] } } }]));
  assert.equal(rule(grammarOf({ props: swap, structure: st }), 'yes-no-variant-restyles').toFix.length, 0, 'the value in place of the placeholder');
});

test('a run fails on the rules the team decided, beside the gates, and says nothing until the team decided one', () => {
  assert.deepEqual(constructionLines(grammarOf({ props, structure, skeleton })), [], 'nothing decided: nothing to fail');
  const g = grammarOf({ props, structure, skeleton }, { answers: { 'padding-where': true, 'layer-order': true } });
  const { decided, broken } = decidedRules(g);
  assert.deepEqual([decided.length, broken.length], [2, 2]);
  const lines = constructionLines(g);
  assert.equal(lines[0], '**Construction.** 2 of the 2 rules the team decided are broken, by 2 components:');
  assert.equal(lines[1], '- A component\'s padding sits on its own frame, not on a layer inside it: buttonIcon');
  const kept = constructionLines(grammarOf({ props, structure, skeleton }, { answers: { 'family-page': true } }));
  assert.equal(kept[0], '**Construction.** 1 of the 1 rules the team decided is broken, by 1 component:');
});

test('the layer order names only the few layers most components have, and holds together', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const sk = Object.fromEntries(['cardOne', 'cardTwo', 'cardThree', 'cardFour'].map((n, k) => [n, { trees: [{ c: (k === 3 ? [...names].reverse() : names).map((l) => ({ t: 'FRAME', n: l })) }], variants: [['state=default', 0]] }]));
  const r = rule(grammarOf({ props: {}, skeleton: sk }), 'layer-order');
  assert.equal(r.says, 'A component\'s layers come in one order: A, B, C, D, E, F', 'six at most, each where it sits on average');
  assert.deepEqual(r.toFix.map((x) => x.component), ['cardFour']);
});
