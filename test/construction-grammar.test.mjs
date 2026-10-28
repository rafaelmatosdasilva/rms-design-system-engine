// How a system builds a component in Figma, mined from its own components (construction-grammar.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grammarOf, grammarLines, fixOf, caseOf, caseFits, isAutoNamed, wordsOf } from '../construction-grammar.mjs';

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

test('most components follow it: the others are to fix; a rule only once every one does', () => {
  const g = grammarOf({ props, structure, values });
  assert.equal(g.figma.components, 5);
  const names = rule(g, 'component-name-case');
  assert.equal(names.says, 'A component is named in camelCase');
  assert.deepEqual([names.follows, names.of, names.status, names.by], [4, 5, 'fix', 'majority']);
  assert.deepEqual(names.toFix, [{ component: 'Promo Banner', value: 'Promo Banner' }]);
  assert.match(rule(g, 'boolean-property-prefix').says, /begins with "show"/);
  assert.match(rule(g, 'text-property-suffix').says, /ends with "Content"/);
  assert.equal(rule(g, 'variant-boolean-options').says, 'A yes/no variant\'s options are true and false');
  assert.deepEqual(rule(g, 'variant-boolean-options').toFix.map((e) => [e.value, e.prop]), [['Wide=False', 'Wide'], ['Wide=True', 'Wide']]);
  const opts = rule(g, 'variant-option-case');
  assert.deepEqual([opts.status, opts.toFix.length], ['rule', 0], 'default, selected and inProgress are camelCase alike: every one follows it');
});

test('layers, auto layout and variables: named layers, auto layout everywhere, the shared variables', () => {
  const g = grammarOf({ props, structure, values });
  const named = rule(g, 'layers-named');
  assert.deepEqual(named.toFix, [{ component: 'Promo Banner', value: 'Frame 12, Rectangle 3' }]);
  const laid = rule(g, 'auto-layout');
  assert.deepEqual(laid.toFix, [{ component: 'Promo Banner', value: 'its frame, 1 variant' }]);
  const colour = rule(g, 'colour-variables');
  assert.match(colour.says, /shared variables/);
  assert.deepEqual(colour.toFix, [{ component: 'Promo Banner', value: 'advanced/Promo Banner/background/color' }]);
});

test('fewer follow it: the team decides; a yes makes it one to fix, a no drops it', () => {
  // Three of five components carry a description.
  const g = grammarOf({ props, structure, values });
  const d = rule(g, 'description');
  assert.deepEqual([d.status, d.follows, d.of], ['decide', 3, 5]);
  assert.ok(g.questions.some((q) => q.id === 'description' && /3 of 5 do\. Is it the rule\? If it is, 2 are to fix\./.test(q.ask)));
  const yes = grammarOf({ props, structure, values }, { answers: { description: true } });
  assert.deepEqual([rule(yes, 'description').status, rule(yes, 'description').by], ['fix', 'team']);
  assert.ok(!yes.questions.some((q) => q.id === 'description'));
  const no = grammarOf({ props, structure, values }, { answers: { description: false } });
  assert.equal(rule(no, 'description'), undefined);
  // However few follow it, it is still the team's to decide (one of four describes itself), never left unsaid.
  const few = grammarOf({ props: Object.fromEntries(['cardTile', 'chipFilter', 'listRow', 'tagStatus'].map((n, i) => [n, { ...props[n], description: i === 0 ? 'x' : '' }])) });
  assert.deepEqual([rule(few, 'description').status, rule(few, 'description').follows], ['decide', 1]);
  // Fewer than three components say nothing.
  assert.equal(rule(grammarOf({ props: { a: props.cardTile, b: props['Promo Banner'] } }), 'component-name-case'), undefined);
});

test('a part\'s name is written in the system\'s case on each side of its slash', () => {
  const g = grammarOf({ props: { ...props, 'cardTile/row': { properties: {} }, 'cardTile/footNote': { properties: {} }, 'Layout/Header': { properties: {} } } });
  const names = rule(g, 'component-name-case');
  assert.deepEqual(names.toFix.map((e) => e.component), ['Layout/Header', 'Promo Banner']);
});

test('each fix: a rename the engine can write, or what only a person can do', () => {
  const g = grammarOf({ props, structure, values });
  const fix = (id, i = 0) => fixOf(rule(g, id), rule(g, id).toFix[i]);
  assert.deepEqual(fix('component-name-case'), { what: 'component', from: 'Promo Banner', to: 'promoBanner', say: 'Rename the component to promoBanner' });
  assert.deepEqual(fix('variant-boolean-options', 1), { what: 'option', prop: 'Wide', from: 'True', to: 'true', say: 'Rename the option True of Wide to true' });
  assert.deepEqual(fixOf({ id: 'boolean-property-prefix', says: 'A boolean property begins with "show" (showThing)' }, { value: 'withIcon' }).to, 'showWithIcon');
  assert.deepEqual(fixOf({ id: 'text-property-suffix', says: 'A text property ends with "Content" (thingContent)' }, { value: 'Label' }).to, 'labelContent');
  assert.deepEqual(fixOf({ id: 'boolean-property-case', says: 'A boolean property is named in camelCase' }, { value: 'Show Hint Text' }).to, 'showHintText');
  assert.equal(fix('layers-named').what, null);
  assert.deepEqual(fix('layers-named').layers, ['Frame 12', 'Rectangle 3']);
  assert.equal(fix('auto-layout').what, null);
});

test('the variant axes already used are a vocabulary, and the grammar reads in a few lines', () => {
  const g = grammarOf({ props, structure, values });
  assert.deepEqual(g.figma.vocabulary.variantAxes.map((a) => [a.name, a.components]), [['size', 2], ['state', 2]]);
  assert.deepEqual(g.figma.vocabulary.variantAxes.find((a) => a.name === 'state').options, ['default', 'selected', 'inProgress', 'error']);
  const lines = grammarLines(g);
  assert.match(lines[0], /from its 5 components/);
  assert.ok(lines.includes('- A component is named in camelCase: 4 of 5 follow it, 1 to fix.'));
  assert.ok(lines.includes('- A variant option is written in camelCase (default, inProgress): the rule, every component follows it.'));
  assert.ok(lines.some((l) => /carries a description in Figma: 3 of 5 follow it; the team decides whether it is the rule \(then 2 to fix\)/.test(l)));
  assert.ok(lines.some((l) => /^- Variant axes it already uses: size \(s \| m \| l\); state \(default \| selected \| inProgress \| error\)/.test(l)));
  assert.deepEqual(grammarLines({}), []);
});

test('the variables a component binds: two ways, put side by side until the team says which', () => {
  const g = grammarOf({ props, structure, values });
  const c = rule(g, 'colour-variables');
  assert.equal(c.way, 'shared');
  assert.deepEqual(c.ways.map((w) => [w.way, w.follows]), [['shared', 4], ['own', 1]]);
  assert.match(c.ways[1].says, /use variables made for it \(advanced\/<component>\/…\), never the shared ones directly/);
  assert.match(fixOf(c, c.toFix[0]).say, /^It binds advanced\/Promo Banner\/background\/color, a variable made for it: bind the shared variable it points at instead$/);
  const own = rule(grammarOf({ props, structure, values }, { answers: { 'colour-variables': 'own' } }), 'colour-variables');
  assert.deepEqual([own.way, own.status, own.by, own.toFix.map((t) => t.component)], ['own', 'fix', 'team', ['cardTile', 'chipFilter', 'listRow', 'tagStatus']]);
  assert.match(fixOf(own, own.toFix[0]).say, /^It binds .* directly: bind a variable made for it/);
});

test('the variables bound on the layers inside a component count, named by the vars snapshot; another library\'s are left out', () => {
  const nested = { ...values, listRow: { hygiene: { binds: { 'V:9': { TEXT_FILL: 'listRow/Body/Title' }, 'V:8': { GAP: 'listRow/Body' }, 'V:7': { FRAME_FILL: 'listRow/Body' } } } } };
  const varNames = { 'V:9': { name: 'advanced/listRow/title/color' }, 'V:8': { name: 'spacing/gap/s' } };
  const g = grammarOf({ props, structure, values: nested, varNames });
  const c = rule(g, 'colour-variables');
  assert.deepEqual(c.toFix.map((t) => [t.component, t.value]), [['Promo Banner', 'advanced/Promo Banner/background/color'], ['listRow', 'advanced/listRow/title/color']]);
});
