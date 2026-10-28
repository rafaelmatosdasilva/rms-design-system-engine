// How a system builds a component in Figma, mined from its own components (construction-grammar.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grammarOf, grammarLines, caseOf, caseFits, isAutoNamed, wordsOf } from '../construction-grammar.mjs';

// Four components that agree, and one (Promo Banner) that breaks most of it.
const props = {
  _updated: 'today',
  cardTile: { properties: { 'showIcon#1:0': { type: 'BOOLEAN', defaultValue: true }, 'titleContent#1:1': { type: 'TEXT', defaultValue: 'Title' }, size: { type: 'VARIANT', defaultValue: 'm', variantOptions: ['s', 'm', 'l'] } }, description: 'A tile.' },
  chipFilter: { properties: { 'showLabel#2:0': { type: 'BOOLEAN', defaultValue: true }, 'labelContent#2:1': { type: 'TEXT', defaultValue: 'Label' }, state: { type: 'VARIANT', defaultValue: 'default', variantOptions: ['default', 'selected', 'inProgress'] } }, description: 'A chip.' },
  listRow: { properties: { 'showDivider#3:0': { type: 'BOOLEAN', defaultValue: true }, 'textContent#3:1': { type: 'TEXT', defaultValue: 'Text' }, size: { type: 'VARIANT', defaultValue: 's', variantOptions: ['s', 'm'] }, disabled: { type: 'VARIANT', defaultValue: 'false', variantOptions: ['false', 'true'] } }, description: 'A row.' },
  tagStatus: { properties: { 'showDot#4:0': { type: 'BOOLEAN', defaultValue: true }, 'labelContent#4:1': { type: 'TEXT', defaultValue: 'Tag' }, state: { type: 'VARIANT', defaultValue: 'default', variantOptions: ['default', 'error'] }, active: { type: 'VARIANT', defaultValue: 'false', variantOptions: ['false', 'true'] } } },
  'Promo Banner': { properties: { 'Has Image#5:0': { type: 'BOOLEAN', defaultValue: true }, 'Headline#5:1': { type: 'TEXT', defaultValue: 'Hello' }, Wide: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] } } },
};
const box = (layout) => ({ layout, box: { layout } });
const structure = {
  cardTile: { ...box('VERTICAL'), paddingVar: { tb: 'spacing/padding/m', lr: 'spacing/padding/m' }, gapVar: 'spacing/gap/s', colors: { fill: { token: 'surface/base/color' }, text: { token: 'text/primary/color' } }, childFrameGaps: [{ name: 'Body', gapVar: 'spacing/gap/s' }] },
  chipFilter: { ...box('HORIZONTAL'), gapVar: 'spacing/gap/xs', colors: { fill: { token: 'surface/subtle/color' } }, toggles: { showLabel: ['Label'] } },
  listRow: { ...box('HORIZONTAL'), paddingVar: { tb: 'spacing/padding/s', lr: 'spacing/padding/m' }, colors: { text: { token: 'text/primary/color' } }, toggles: { showDivider: ['Divider'] } },
  tagStatus: { ...box('HORIZONTAL'), gapVar: 'spacing/gap/xs', colors: { fill: { token: 'surface/subtle/color' } }, toggles: { showDot: ['Dot'] } },
  'Promo Banner': { ...box('NONE'), gapVar: 'advanced/Promo Banner/gap', colors: { fill: { token: 'advanced/Promo Banner/background/color' } }, childFrameGaps: [{ name: 'Frame 12', gapVar: null }] },
};
const values = {
  cardTile: { hygiene: { binds: { 'V:1': { TEXT_FILL: 'cardTile/Body/Title' } }, noAutoLayout: [], description: true } },
  'Promo Banner': { hygiene: { binds: { 'V:2': { FILL: 'Promo Banner/Frame 12/Rectangle 3' } }, noAutoLayout: ['Wide=True'], description: false } },
};
const rule = (g, id) => g.figma.rules.find((r) => r.id === id);

test('names: the case each is written in, and Figma\'s own names for a layer nobody named', () => {
  assert.equal(caseOf('showBadgeDot'), 'camelCase');
  assert.equal(caseOf('state'), 'lower');
  assert.equal(caseOf('Promo Banner'), 'Title Case');
  assert.equal(caseOf('DropDown'), 'PascalCase');
  assert.ok(caseFits('state', 'camelCase'));
  assert.ok(caseFits('Label', 'Title Case'));
  assert.ok(!caseFits('Has Image', 'camelCase'));
  assert.ok(isAutoNamed('Frame 235'));
  assert.ok(isAutoNamed('Rectangle 3'));
  assert.ok(!isAutoNamed('Frame'));
  assert.ok(!isAutoNamed('Body'));
  assert.deepEqual(wordsOf('showBadgeDot'), ['show', 'badge', 'dot']);
});

test('a rule is what most components do, with how many follow it and which do not', () => {
  const g = grammarOf({ props, structure, values });
  assert.equal(g.figma.components, 5);
  const names = rule(g, 'component-name-case');
  assert.equal(names.says, 'A component is named in camelCase');
  assert.deepEqual([names.follows, names.of, names.status, names.by], [4, 5, 'rule', 'majority']);
  assert.deepEqual(names.exceptions, [{ component: 'Promo Banner', value: 'Promo Banner' }]);
  assert.match(rule(g, 'boolean-property-prefix').says, /begins with "show"/);
  assert.match(rule(g, 'text-property-suffix').says, /ends with "Content"/);
  assert.equal(rule(g, 'variant-boolean-options').says, 'A yes/no variant\'s options are true and false');
  assert.deepEqual(rule(g, 'variant-boolean-options').exceptions.map((e) => e.value), ['Wide=False', 'Wide=True']);
  assert.equal(rule(g, 'variant-option-case').exceptions.length, 0, 'default, selected and inProgress are camelCase alike');
});

test('layers, auto layout and variables: named layers, auto layout everywhere, the shared variables', () => {
  const g = grammarOf({ props, structure, values });
  const named = rule(g, 'layers-named');
  assert.deepEqual(named.exceptions, [{ component: 'Promo Banner', value: 'Frame 12, Rectangle 3' }]);
  const laid = rule(g, 'auto-layout');
  assert.deepEqual(laid.exceptions, [{ component: 'Promo Banner', value: 'its frame, 1 variant' }]);
  const colour = rule(g, 'colour-variables');
  assert.match(colour.says, /shared variables/);
  assert.deepEqual(colour.exceptions, [{ component: 'Promo Banner', value: 'advanced/Promo Banner/background/color' }]);
});

test('between half and three quarters it is a question; the team\'s answer makes it a rule or drops it', () => {
  // Three of five components carry a description: neither the rule nor no rule.
  const g = grammarOf({ props, structure, values });
  const d = rule(g, 'description');
  assert.equal(d.status, 'question');
  assert.deepEqual([d.follows, d.of], [3, 5]);
  assert.ok(g.questions.some((q) => q.id === 'description' && /3 of 5 do/.test(q.ask)));
  const yes = grammarOf({ props, structure, values }, { answers: { description: true } });
  assert.deepEqual([rule(yes, 'description').status, rule(yes, 'description').by], ['rule', 'team']);
  assert.ok(!yes.questions.some((q) => q.id === 'description'));
  const no = grammarOf({ props, structure, values }, { answers: { description: false } });
  assert.equal(rule(no, 'description'), undefined);
});

test('below half the system has no rule there, and says so; fewer than three components say nothing', () => {
  const few = grammarOf({ props: { a: props.cardTile, b: props['Promo Banner'] } });
  assert.equal(rule(few, 'component-name-case'), undefined);
  const mixed = grammarOf({ props: Object.fromEntries(['cardTile', 'chipFilter', 'listRow', 'tagStatus'].map((n, i) => [n, { ...props[n], description: i === 0 ? 'x' : '' }])) });
  assert.equal(rule(mixed, 'description'), undefined);
  assert.deepEqual(mixed.figma.unsettled.find((u) => u.id === 'description'), { id: 'description', area: 'documentation', says: 'Every component carries a description in Figma', follows: 1, of: 4 });
});

test('a part\'s name is written in the system\'s case on each side of its slash', () => {
  const g = grammarOf({ props: { ...props, 'cardTile/row': { properties: {} }, 'cardTile/footNote': { properties: {} }, 'Layout/Header': { properties: {} } } });
  const names = rule(g, 'component-name-case');
  assert.deepEqual(names.exceptions.map((e) => e.component), ['Layout/Header', 'Promo Banner']);
});

test('the variant axes already used are a vocabulary, and the grammar reads in a few lines', () => {
  const g = grammarOf({ props, structure, values });
  assert.deepEqual(g.figma.vocabulary.variantAxes.map((a) => [a.name, a.components]), [['size', 2], ['state', 2]]);
  assert.deepEqual(g.figma.vocabulary.variantAxes.find((a) => a.name === 'state').options, ['default', 'selected', 'inProgress', 'error']);
  const lines = grammarLines(g);
  assert.match(lines[0], /from its 5 components/);
  assert.ok(lines.includes('- A component is named in camelCase: 4 of 5.'));
  assert.ok(lines.some((l) => /carries a description in Figma \(a question for the team\): 3 of 5/.test(l)));
  assert.ok(lines.some((l) => /^- Variant axes it already uses: size \(s \| m \| l\); state \(default \| selected \| inProgress \| error\)/.test(l)));
  assert.deepEqual(grammarLines({}), []);
});
