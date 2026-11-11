// How a system builds a component in Figma, mined from its own components (construction-grammar.mjs).
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grammarOf, grammarLines, fixOf, caseOf, caseFits, isAutoNamed, wordsOf, rowsByHand } from '../lib/construction-grammar.mjs';

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
  assert.ok(isAutoNamed('Frame'), 'Figma names a frame "Frame" as readily as "Frame 2"');
  assert.ok(!isAutoNamed('Body'));
  assert.ok(isAutoNamed('Union'), 'Figma names a boolean operation after the operation, with no number');
  assert.ok(isAutoNamed('Subtract 2'));
  assert.ok(isAutoNamed('Group') && isAutoNamed('Vector') && isAutoNamed('Arrow'), 'with no number, still Figma\'s name');
  assert.ok(!isAutoNamed('Text') && isAutoNamed('Text 3'), 'a text layer is named after its words: "Text" alone is somebody\'s choice');
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

test('layers-named reads every layer of every variant in the skeleton, never what is inside an instance', () => {
  // Frame 1 binds nothing and has no gap or toggle of its own: only the skeleton has it. Its own icon's insides are the
  // icon's to name, and the variant itself is named by its options.
  const tree = (kids) => ({ t: 'COMPONENT', n: 'state=default', c: kids });
  const skeleton = {
    tabNav: { trees: [tree([{ t: 'FRAME', n: 'Content', c: [{ t: 'FRAME', n: 'Frame 1', c: [{ t: 'TEXT', n: 'Label' }] }, { t: 'INSTANCE', n: 'Icon', c: [{ t: 'VECTOR', n: 'Vector 7' }] }] }])] },
    checkTick: { trees: [tree([{ t: 'FRAME', n: 'Box', c: [{ t: 'BOOLEAN_OPERATION', n: 'Union', c: [{ t: 'RECTANGLE', n: 'Rectangle 4' }] }] }])] },
  };
  const g = grammarOf({ props: { tabNav: { properties: {} }, checkTick: { properties: {} }, ...props }, structure, values, skeleton });
  const named = rule(g, 'layers-named');
  assert.deepEqual(named.toFix.filter((e) => e.component !== 'Promo Banner'), [{ component: 'checkTick', value: 'Union, Rectangle 4' }, { component: 'tabNav', value: 'Frame 1' }]);
});

test('layers-named reads the building blocks too: a component the library does not publish is still built by someone', () => {
  const tree = (kids) => ({ t: 'COMPONENT', n: 'Default', c: kids });
  const skeleton = { _blocks: { '.rowShade': { trees: [tree([{ t: 'FRAME', n: 'Frame 3', c: [{ t: 'TEXT', n: 'Label' }] }])] }, '_base': { trees: [tree([{ t: 'FRAME', n: 'Body' }])] } } };
  const g = grammarOf({ props, structure, values, skeleton });
  const named = rule(g, 'layers-named');
  assert.deepEqual(named.toFix.filter((e) => e.component.startsWith('.') || e.component.startsWith('_')), [{ component: '.rowShade', value: 'Frame 3' }], 'a block named well is not listed');
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

test('architecture, from the skeleton: styles, wiring, nesting, layout, placement, and each family\'s shape', () => {
  const row = (c, extra = {}) => ({ layout: { dir: 'HORIZONTAL', w: 'HUG', h: 'FIXED', main: 'CENTER', cross: 'CENTER', pad: [8, 16, 8, 16], gap: 8 }, c, ...extra });
  const icon = (wired = true) => ({ t: 'INSTANCE', n: 'Icon', of: { name: 'iconBase' }, ...(wired ? { wired: { visible: 'showIcon' } } : {}) });
  const text = (styled = true) => ({ t: 'TEXT', n: 'Label', ...(styled ? { styles: { text: 'Body/M' } } : {}), wired: { characters: 'labelContent' } });
  const skel = (tree, extra = {}) => ({ trees: [tree], variants: [['state=default', 0], ['state=hover', 0]], page: 'Components', section: 'Buttons', ...extra });
  const skeleton = {
    buttonPrimary: skel(row([icon(), text()]), { reactions: { 'state=default': [{ on: 'ON_HOVER', do: ['CHANGE_TO state=hover'] }] } }),
    buttonSecondary: skel(row([icon(), text()])),
    buttonGhost: skel(row([icon(), text(false), { t: 'VECTOR', n: 'Arrow' }])),
    buttonLink: skel(row([text(), { t: 'FRAME', n: 'Frame 9', hidden: true }]), { section: undefined }),
  };
  const props = Object.fromEntries(Object.keys(skeleton).map((n) => [n, { properties: { 'showIcon#1:0': { type: 'BOOLEAN' }, 'labelContent#1:1': { type: 'TEXT' } } }]));
  const g = grammarOf({ props, skeleton });
  const r = (id) => g.figma.rules.find((x) => x.id === id);
  assert.deepEqual([r('text-styles').follows, r('text-styles').toFix.map((t) => [t.component, t.value])], [3, [['buttonGhost', 'Label']]]);
  assert.deepEqual(r('icons-are-instances').toFix.map((t) => t.value), ['Arrow']);
  assert.deepEqual(r('hidden-layers-wired').toFix.map((t) => [t.component, t.value]), [['buttonLink', 'Frame 9']]);
  assert.deepEqual(r('properties-wired').toFix.map((t) => [t.component, t.value]), [['buttonLink', 'showIcon']]);
  assert.deepEqual(r('states-interactive').toFix.map((t) => t.component), ['buttonGhost', 'buttonLink', 'buttonSecondary']);
  assert.equal(r('in-a-section').toFix[0].component, 'buttonLink');
  const fam = r('family-button');
  assert.equal(fam.says, 'A button is built as horizontal auto layout: a component? → text');
  assert.deepEqual([fam.follows, fam.of, fam.toFix.map((t) => t.component)], [2, 4, ['buttonGhost', 'buttonLink']]);
  assert.deepEqual(g.figma.families.map(({ shapes, ...f }) => f), [{ family: 'button', components: 4, shape: 'horizontal auto layout: a component? → text', follow: 2, depths: [1, 1, 1, 1] }]);
  assert.match(fixOf(fam, fam.toFix[0]).say, /^Rebuild it as the family is built \(horizontal auto layout: a component\? → text\); now /);
});

test('a yes/no is named by one case rule whether Figma makes it a boolean or a variant of true and false; "show" stays a boolean\'s', () => {
  const g = grammarOf({ props, structure, values });
  const c = rule(g, 'boolean-property-case');
  assert.equal(c.says, 'A yes/no property (a boolean, or a variant of true and false) is named in camelCase');
  assert.equal(c.area, 'naming');
  const p = rule(g, 'boolean-property-prefix');
  assert.match(p.says, /^A boolean property begins with "show"/);
  assert.ok(!p.toFix.some((x) => /disabled|active|Wide/.test(x.value)), 'a state is never told to begin with "show"');
  assert.ok(g.figma.rules.every((r) => ['naming', 'layout', 'variables', 'documentation', 'architecture'].includes(r.area)), 'each rule in a kind of rule: names together (a component that repeats another with an option is read from the properties alone)');
});

test('on the Construction page each row is a rule, a decision included: never a question', () => {
  const tpl = templateText();
  const page = tpl.slice(tpl.indexOf('if (DATA.construction)'), tpl.indexOf('if (DATA.construction)') + 12000);
  assert.doesNotMatch(page, /shared, or made for each component\?/);
  // The two ways a family is built are said as what most of it does, with the other beside it: the panel suggests one.
  assert.match(page, /Choose one; the others are then changed to match\./);
  assert.match(page, /copyBtn\(k \? 'change' : 'approve', \(k \? '' : 'Suggested: '\) \+ WAY_HEAD\[w\.way\]/);
  // Five areas, each holding more than a row or two, and none of them a side: Code and Products are gone, a Figma
  // variable and a style are both Tokens, and the rest of how a component is built inside is Structure.
  assert.match(page, /var AREA = \{\n\s*naming: 'Naming',\n\s*layout: 'Structure', layers: 'Structure', nesting: 'Structure', placement: 'Structure', wiring: 'Structure', interactions: 'Structure',\n\s*architecture: 'Properties', products: 'Properties',\n\s*variables: 'Tokens', tokens: 'Tokens', styles: 'Tokens',\n\s*documentation: 'Documentation', code: 'Documentation'\n\s*\};/);
  assert.deepEqual([...new Set((page.match(/'(Naming|Structure|Properties|Tokens|Documentation)'/g) || []))].length, 5, 'five areas, no more');
  assert.match(page, /var AREA_ORDER = \['Naming', 'Properties', 'Structure', 'Tokens', 'Documentation'\];/, 'read in the order a person meets them, never A to Z');
});

test('bindings, from every variant\'s layers: a state\'s own token, a component\'s own tokens, a text colour on a text', () => {
  // Two buttons, a chip and a card, each with a label; a default and a disabled variant sharing one tree.
  const tree = { layout: { dir: 'HORIZONTAL' }, c: [{ t: 'TEXT', n: 'Label', id: '1' }] };
  const comp = (rest, disabled) => ({ trees: [tree], variants: [['State=Default', 0], ['State=Disabled', 0]], binds: { 'State=Default': rest, 'State=Disabled': disabled } });
  const skeleton = {
    buttonPrimary: comp({ '0': { fills: 'color/button/text/default' } }, { '0': { fills: 'color/button/text/disabled' } }),
    // Its disabled variant keeps the default's text colour, though the system has one for disabled.
    buttonSecondary: comp({ '0': { fills: 'color/button/text/default' } }, { '0': { fills: 'color/button/text/default' } }),
    // Its background is the button's.
    chip: comp({ '': { fills: 'color/button/bg' }, '0': { fills: 'color/chip/text/default' } }, { '': { fills: 'color/button/bg' }, '0': { fills: 'color/chip/text/disabled' } }),
    // Its label is a surface colour; and the system has no disabled colour for a card, so it is no case for the state rule.
    card: comp({ '0': { fills: 'color/surface/default' } }, { '0': { fills: 'color/surface/default' } }),
  };
  const names = ['color/button/text/default', 'color/button/text/disabled', 'color/chip/text/default', 'color/chip/text/disabled', 'color/button/bg', 'color/surface/default', 'color/text/primary'];
  const varNames = Object.fromEntries(names.map((name, i) => [`VariableID:${i}`, { name }]));
  const g = grammarOf({ props: {}, skeleton, varNames });
  const rule = (id) => g.figma.rules.find((r) => r.id === id);

  const state = rule('state-tokens');
  assert.equal(state.area, 'variables');
  assert.equal(state.of, 3, 'the card has no disabled token to bind, so it is left out');
  assert.deepEqual(state.toFix.map((x) => x.component), ['buttonSecondary']);
  assert.match(state.toFix[0].value, /Label fills in State=Disabled binds color\/button\/text\/default, where color\/button\/text\/disabled exists/);
  assert.equal(state.status, 'decide', 'two of three: the team decides');

  const own = rule('own-tokens');
  assert.deepEqual(own.toFix, [{ component: 'chip', value: 'color/button/bg' }], 'a chip on the button\'s background');
  assert.equal(rule('text-colour-tokens').toFix[0].component, 'card');
  assert.match(rule('text-colour-tokens').toFix[0].value, /Label binds color\/surface\/default/);
  // on-surface and other text colours are text colours.
  const fine = { ...skeleton, card: comp({ '0': { fills: 'color/on-surface' } }, { '0': { fills: 'color/on-surface' } }) };
  assert.equal(grammarOf({ props: {}, skeleton: fine, varNames }).figma.rules.find((r) => r.id === 'text-colour-tokens').toFix.length, 0);
  // Each says what to do.
  assert.match(fixOf(state, state.toFix[0]).say, /^Bind each state's own token: /);
  // A capture from before the bindings were kept: no binding rule, never one every component "follows".
  const old = Object.fromEntries(Object.entries(skeleton).map(([n, s]) => [n, { trees: s.trees, variants: s.variants }]));
  assert.equal(grammarOf({ props: {}, skeleton: old, varNames }).figma.rules.some((r) => /tokens$/.test(r.id) && r.id !== 'variables'), false);
});

test('bindings against the token layers: no base token, one radius a family, a shared token shared, an own token used', () => {
  const t = (collection, name, to) => ({ name, collection, kind: 'COLOR', values: { Light: '#000' }, ...(to ? { aliases: { Light: to } } : {}) });
  const tokens = { collections: [], tokens: [
    t('Primitives', 'prim/blue'), t('Primitives', 'prim/gray'), t('Primitives', 'prim/r4'), t('Primitives', 'prim/r8'),
    t('Semantic', 'sem/action', 'prim/blue'), t('Semantic', 'sem/text', 'prim/gray'), t('Semantic', 'sem/radius/m', 'prim/r8'),
    t('Semantic', 'sem/radius/s', 'prim/r4'), t('Semantic', 'sem/surface', 'prim/gray'), t('Semantic', 'sem/lonely', 'prim/blue'),
    t('Component', 'button/bg', 'sem/action'), t('Component', 'button/unused', 'sem/action'), t('Component', 'chip/bg', 'sem/action'),
  ] };
  const tree = { layout: { dir: 'HORIZONTAL' }, c: [{ t: 'TEXT', n: 'Label', id: '1' }] };
  const comp = (root) => ({ trees: [tree], variants: [['State=Default', 0]], binds: { 'State=Default': { '': root, '0': { fills: 'sem/text' } } } });
  const skeleton = {
    buttonPrimary: comp({ fills: 'button/bg', topLeftRadius: 'sem/radius/m' }),
    buttonSecondary: comp({ fills: 'button/bg', topLeftRadius: 'sem/radius/m' }),
    // A primitive on its frame, and the small radius where the buttons round with the medium one.
    buttonGhost: comp({ fills: 'prim/blue', topLeftRadius: 'sem/radius/s' }),
    chip: comp({ fills: 'chip/bg', strokes: 'sem/surface' }),
    card: comp({ fills: 'sem/surface', strokes: 'sem/lonely' }),
  };
  const g = grammarOf({ props: {}, skeleton, tokens });
  const rule = (id) => g.figma.rules.find((r) => r.id === id);
  assert.match(rule('no-base-tokens').says, /above the Primitives layer/);
  assert.deepEqual(rule('no-base-tokens').toFix.map((x) => [x.component, x.value]), [['buttonGhost', 'the component fills binds prim/blue']]);
  assert.deepEqual(rule('family-radius').toFix, [{ component: 'buttonGhost', value: 'binds sem/radius/s, where its family binds sem/radius/m' }]);
  assert.deepEqual(rule('shared-tokens-shared').toFix.map((x) => x.where).sort(), ['sem/lonely', 'sem/radius/s'], 'shared tokens only one component binds');
  assert.deepEqual(rule('own-tokens-used').toFix, [{ where: 'button/unused', value: 'nothing binds it or points at it' }]);
  // Without the tokens, none of these four: the first three binding rules stand alone.
  assert.equal(grammarOf({ props: {}, skeleton }).figma.rules.some((r) => ['no-base-tokens', 'family-radius', 'shared-tokens-shared', 'own-tokens-used'].includes(r.id)), false);
});

test('a row of content inside a variant placed by hand is to lay out with auto layout; a drawing, an overlay and an instance\'s insides are not', () => {
  const T = (n, extra = {}) => ({ t: 'TEXT', n, ...extra }), I = (n) => ({ t: 'INSTANCE', n, c: [{ t: 'FRAME', n: 'inside', c: [T('a'), T('b')] }] });
  const tree = { t: 'COMPONENT', n: 'state=open', layout: { dir: 'HORIZONTAL' }, c: [{ t: 'FRAME', n: 'Content', layout: { dir: 'VERTICAL' }, c: [
    { t: 'GROUP', n: 'step2', c: [I('Divider'), I('stepLabel')] },                                   // 0.0: a divider and its label side by side
    { t: 'FRAME', n: 'Stack', c: [T('Title'), T('Meta')] },                                         // 0.1: one under the other
    { t: 'FRAME', n: 'Chart', c: [{ t: 'VECTOR', n: 'slice' }, T('Share')] },                        // 0.2: artwork in it
    { t: 'FRAME', n: 'Pins', c: [I('pin'), I('pin')] },                                             // 0.3: scattered
    { t: 'FRAME', n: 'Overlay', c: [I('photo'), T('Caption')] },                                    // 0.4: one on top of the other
    { t: 'FRAME', n: 'Hidden row', hidden: true, c: [T('x'), T('y')] },
    I('Nested'),
  ] }] };
  const at = (x, y, w, h) => ({ at: [x, y, w, h] });
  const looks = { 'state=open': {
    '0.0.0': at(0, 0, 16, 16), '0.0.1': at(20, 0, 32, 16),
    '0.1.0': at(0, 0, 100, 20), '0.1.1': at(0, 24, 100, 16),
    '0.2.0': at(0, 0, 50, 50), '0.2.1': at(60, 0, 40, 16),
    '0.3.0': at(0, 0, 10, 10), '0.3.1': at(80, 60, 10, 10),
    '0.4.0': at(0, 0, 200, 100), '0.4.1': at(10, 80, 100, 16),
    '0.5.0': at(0, 0, 10, 10), '0.5.1': at(20, 0, 10, 10),
  } };
  const sk = { trees: [tree], variants: [['state=open', 0], ['state=closed', 0]], looks: { ...looks, 'state=closed': looks['state=open'] } };
  assert.deepEqual(rowsByHand(sk), ['Content/step2', 'Content/Stack'], 'each row once, whichever variants have it');
  assert.deepEqual(rowsByHand({ trees: [tree], variants: [['state=open', 0]] }), [], 'no places recorded (an older capture): nothing said');
  const g = grammarOf({ props, structure: { ...structure, crumbTrail: { layout: 'HORIZONTAL' } }, values, skeleton: { crumbTrail: sk } });
  assert.deepEqual(rule(g, 'auto-layout').toFix.find((e) => e.component === 'crumbTrail'), { component: 'crumbTrail', value: 'Content/step2, Content/Stack' });
});
