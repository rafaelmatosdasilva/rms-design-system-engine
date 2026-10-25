// What keeps a prototype to the real system: a catalog short enough to be read whole, the code's own props, and the
// documentation's "goes only inside" rules held as errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextFrom, intentLayerOf, purposeLines, ruleLines, detailFor, insideFrom, insideFindings } from '../prototype-context.mjs';
import { buildCatalog, checkUi } from '../ui-catalog.mjs';
import { componentIntent } from '../intent-layer.mjs';

test('an intent layer page says each line once, its role and its examples apart from its rules', () => {
  const il = intentLayerOf({
    purpose: 'Switches between sibling views.',
    mistakes: ['Do not use tabs for navigation.', 'Do not use tabs for navigation.'],
    rules: ['Keep labels short. (should)', 'Keep labels short.', 'Role: tablist', 'Example: <Tabs :items="views" />'],
    whenToUse: [], whenNotToUse: [], limitations: [],
  });
  assert.deepEqual(il.mistakes, ['Do not use tabs for navigation.']);
  assert.deepEqual(il.rules, ['Keep labels short. (should)'], 'the same rule with or without its level is one rule');
  assert.equal(il.role, 'tablist');
  assert.deepEqual(il.examples, ['<Tabs :items="views" />']);
});

test('a split page\'s pointer to its family spec is not what the component is for', () => {
  const e = { name: 'Tabs Main', file: 'x', purpose: ['Use the family spec (Tabs) for the rules every tabs component shares.', 'The main tab style.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  assert.equal(componentIntent(e, {}).purpose, 'The main tab style.');
});

test('a component with nothing from Figma or the code takes its purpose and role from the intent layer', () => {
  const intent = { components: { tabs: { design: { annotations: [] }, code: {}, intentLayer: { purpose: 'Switches views.', rules: ['Role: tablist'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [] } } } };
  const ctx = contextFrom({ components: { tabs: { props: {} } } }, intent, []);
  assert.equal(ctx.components.tabs.purpose, 'Switches views.');
  assert.equal(ctx.components.tabs.role, 'tablist');
  const lines = purposeLines(ctx, ['tabs']).join('\n');
  assert.match(lines, /tabs\s+Switches views\. Role tablist\./);
  assert.doesNotMatch(lines, /intent: rule Role/);
});

test('a large catalog shows in full only what is asked, every other component and rule in a line', () => {
  const ctx = contextFrom({ components: { tabs: { description: 'Switches views.', props: {} }, card: { description: 'Groups one subject.', props: {} } } }, {
    components: { tabs: { design: { annotations: [] }, code: {}, intentLayer: { rules: ['Keep labels short.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [] } }, card: { design: { annotations: [] }, code: {}, intentLayer: { rules: ['One subject per card.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [] } } },
  }, []);
  const lines = purposeLines(ctx, ['tabs', 'card'], { full: new Set(['tabs']) }).join('\n');
  assert.match(lines, /Keep labels short/);
  assert.match(lines, /card\s+Groups one subject\./);
  assert.doesNotMatch(lines, /One subject per card/);
  const rules = ruleLines({ rules: [{ title: 'Settings · Rules (pages, intent layer)', text: 'A' }, { title: 'Settings · Copy (pages, intent layer)', text: 'B' }, { title: 'brand/blue (foundations, intent layer)', text: 'C', kind: 'token' }, { title: 'Checkout', text: 'D' }] }, { full: new Set(['Checkout']) });
  assert.deepEqual(rules, ['  Checkout: D', '  also: Settings', '  and 1 token page: a prototype takes its tokens from the scales below']);
});

test('what a request needs in full: what it points to, and what their documentation names as code writes it', () => {
  const ctx = { components: {
    tabItem: { purpose: 'One tab.', guidelines: null, mistakes: ['Do not place `TabItem` without `TabStrip`.'], whenToUse: [], intentLayer: null },
    tabStrip: { purpose: 'Holds tabs.', mistakes: [], whenToUse: [], intentLayer: null },
    item: { purpose: 'A list item.', mistakes: [], whenToUse: [], intentLayer: null },
  }, rules: [{ title: 'Settings', text: 'x' }] };
  const want = detailFor(ctx, { components: [{ name: 'tabItem', score: 3 }, { name: 'item', score: 1 }], sections: [], screens: [], pages: [], ruledOut: [] }, ['settings']);
  assert.deepEqual([...want.components].sort(), ['tabItem', 'tabStrip'], 'a single shared word is not enough; a plain word names no component');
  assert.deepEqual([...want.rules], ['Settings'], 'a rule asked for by its title');
});

test('"only inside" and "never without" rules become checks; vaguer sentences stay words', () => {
  const names = ['searchField', 'toolbar', 'tabItem', 'tabStrip', 'readOnlyText', 'detailPage'];
  const components = Object.fromEntries(names.map((n) => [n, { mistakes: [], intentLayer: null }]));
  components.tabStrip.intentLayer = { rules: ['Do not place `TabItem` manually without `TabStrip` unless another component lays it out.'], mistakes: [], whenNotToUse: [] };
  const inside = insideFrom(components, [
    { title: 'Orders page', text: '- `searchField` only inside the toolbar.\n- Use `ReadOnlyText` when the value is read-only in detailPage.\n- Key amounts must not exist only inside hover popovers.' },
  ], names);
  assert.deepEqual(inside.map((r) => `${r.component}>${r.within}${r.owned ? ' owned' : ''}`).sort(), ['searchField>toolbar', 'tabItem>tabStrip owned']);

  const nodes = [
    { id: 'p', component: 'Page', children: ['s', 'g', 't', 'c'] },
    { id: 's', component: 'Stack', children: ['a', 'b'] },
    { id: 'a', component: 'searchField', children: [] }, { id: 'b', component: 'tabItem', children: [] },
    { id: 'g', component: 'tabStrip', children: ['i'] }, { id: 'i', component: 'tabItem', children: [] },
    { id: 't', component: 'toolbar', children: ['ok'] }, { id: 'ok', component: 'searchField', children: [] },
    { id: 'c', component: 'detailPage', children: ['own'] }, { id: 'own', component: 'tabItem', children: [] },
  ];
  const f = insideFindings(inside, nodes, ['Page', 'Stack']);
  assert.deepEqual(f.map((x) => x.id).sort(), ['a', 'b'], 'loose in the engine\'s layout: errors; in its container, or owned by another component: fine');
  assert.ok(f.every((x) => x.level === 'error'));
  assert.match(f.find((x) => x.id === 'a').message, /searchField is not inside toolbar: "`searchField` only inside the toolbar\."/);
});

test('the catalog lists the code\'s own props Figma has no property for, and the check takes them and suggests the right name', () => {
  const built = [{ name: 'tabStrip', contract: { description: 'Tabs.', props: [{ name: 'showArrows', type: 'boolean', default: true }] } }];
  const code = { api: { tabStrip: { props: { showArrows: { type: 'boolean' }, variant: { type: 'string', options: ['main', 'quiet'], default: 'main' }, fullSpan: { type: 'boolean' }, tabs: { type: 'array' } } } } };
  const cat = buildCatalog(built, { code });
  assert.equal(cat.components.tabStrip.props.showArrows.codeName, 'showArrows');
  assert.deepEqual(cat.components.tabStrip.props.variant, { type: 'enum', codeName: 'variant', codeOnly: true, values: ['main', 'quiet'], default: 'main' });
  assert.equal(cat.components.tabStrip.props.fullSpan.codeOnly, true);
  assert.equal(cat.components.tabStrip.props.tabs, undefined, 'data a composition cannot write is left out');
  const ok = checkUi({ component: 'tabStrip', props: { variant: 'quiet', fullSpan: true } }, cat);
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  const bad = checkUi({ component: 'tabStrip', props: { varient: 'secondary', variant: 'loud' } }, cat);
  assert.ok(bad.findings.some((x) => /has no prop "varient" \(did you mean variant\?\)/.test(x.message)));
  assert.ok(bad.findings.some((x) => /variant = "loud" is not one of main, quiet/.test(x.message)));
});
