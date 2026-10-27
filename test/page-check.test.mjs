// A prototype written in the system's own code is held to the system: only its components, each given only what it
// takes, where the documentation puts it. An invented Acme system, in Vue and in JSX.
import { test } from 'node:test';
import { docCoverage } from '../doc-coverage.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { docFields, readLiteral, literalBindings, shapeFindings, requiredKeys, UNKNOWN } from '../prop-shapes.mjs';
import { parseMarkup, splitSource, pageSystem, checkPage, usageCards, pageConventions, pageCache, pageHookCheck, importedComponents, recordInventions } from '../page-check.mjs';

const put = (root, rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

function acme() {
  const root = mkdtempSync(join(tmpdir(), 'acme-page-'));
  put(root, 'ds-config.json', '{}');
  put(root, 'src/components/library/tabs/TabStrip.vue', `<template><div class="tab-strip"><button v-for="t in tabs" :key="t.id" @click="emit('picked', t.id)">{{ t.label }}</button></div></template>
<script setup>
const emit = defineEmits(['picked'])
/** Props received:
@tabs {Array} the tabs to show
	- id {String, Number} what picked sends back
	- label {String} the words on the tab
	- selected {Boolean} the tab shown
@look {String} how it looks [main (default), quiet]
*/
const props = defineProps({ tabs: { type: Array, required: true }, look: { type: String, default: 'main' }, compact: { type: Boolean, default: false } })
</script>`);
  put(root, 'src/components/library/toolbars/Toolbar.vue', `<template><div class="toolbar"><slot name="start"/><slot/></div></template>
<script setup>
const props = defineProps({ divided: { type: Boolean, default: false } })
</script>`);
  put(root, 'src/components/library/search/SearchField.vue', `<template><input class="search-field" :placeholder="placeholder" @keyup.enter="emit('enter')"/></template>
<script setup>
const emit = defineEmits(['enter'])
const props = defineProps({ placeholder: { type: String, default: '' } })
</script>`);
  put(root, 'src/components/templates/ListPage.vue', `<template><main class="list-page"><header><slot name="header"/></header><slot/></main></template>
<script setup>
const props = defineProps({ title: { type: String, default: '' } })
</script>`);
  put(root, 'src/components/library/badges/Badge.jsx', `export function Badge({ tone = 'info', label, onDismiss }) {
  return <span className="badge">{label}</span>
}
Badge.propTypes = {}
/** @tone {String} its colour [info (default), warn] */
`);
  put(root, 'src/views/Orders.vue', `<template><list-page title="Orders"><template #header><tab-strip :tabs="tabs" @picked="pick"/></template></list-page></template>
<script setup>
import { ref } from 'vue'
import ListPage from '@/components/templates/ListPage'
import TabStrip from '@/components/library/tabs/TabStrip'
const tabs = ref([{ id: 'a', label: 'Open' }, { id: 'b', label: 'Closed' }, { id: 'c', label: 'All', selected: true }])
const pick = () => {}
</script>`);
  const catalog = { components: { tabStrip: { props: {} }, toolbar: { props: {} }, searchField: { props: {} }, listPage: { props: {} }, badge: { props: {} } } };
  const context = {
    inside: [{ component: 'SearchField', within: ['Toolbar'], sentence: '`searchField` only inside the toolbar.', from: 'Orders page', owned: false }],
    limits: [], components: {},
    rules: [{ title: 'List Page Template (templates, intent layer)', text: 'A list of records starts here.' }],
  };
  return { root, catalog, context };
}

test('a doc comment\'s fields, a literal as written, and the data a component is given against what it takes', () => {
  const f = docFields('/** @tabs {Array} the tabs\n\t- id {String, Number} x\n\t- badge {Object} with:\n\t\t-tone {String} y\n@look {String} z */');
  assert.deepEqual(Object.keys(f.tabs), ['id', 'badge']);
  assert.deepEqual(Object.keys(f.tabs.badge.fields), ['tone']);
  const v = readLiteral("ref([{ id: 1, label: 'A', ...rest }, { id, label: `B` }])");
  assert.equal(v[0].label, 'A');
  assert.equal(v[1].id, UNKNOWN, 'a shorthand key is there, its value unknown');
  assert.deepEqual(Object.keys(literalBindings('const tabs = ref([{ id: 1 }])\nlet n = 2\nconst [items, setItems] = useState([])')), ['tabs', 'n', 'items']);
  assert.deepEqual(shapeFindings([{ id: 1, lable: 'x' }], f.tabs, { required: ['id'] }).map((x) => `${x.kind}:${x.key}`), ['unknown:lable']);
  assert.deepEqual(requiredKeys([[{ id: 1, label: 'a' }, { id: 2, label: 'b', x: 1 }, { id: 3, label: 'c' }]]), ['id', 'label']);
});

test('the markup reader sees multi-line tags, each framework\'s props, events, two-way bindings and slots', () => {
  const vue = parseMarkup('<tab-strip\n  look="quiet"\n  :tabs="tabs"\n  @picked="pick"\n  v-model:open="o"/>\n<template #header>x</template>', { syntax: 'vue' });
  const a = vue.children[0].attrs.map((x) => `${x.kind}:${x.name}`);
  assert.deepEqual(a, ['prop:look', 'prop:tabs', 'event:picked', 'model:open']);
  assert.equal(vue.children[1].attrs[0].kind, 'slot');
  const svelte = parseMarkup('<TabStrip {tabs} on:picked={pick} bind:open slot="header"/>', { syntax: 'svelte' });
  assert.deepEqual(svelte.children[0].attrs.map((x) => `${x.kind}:${x.name}`), ['prop:tabs', 'event:picked', 'model:open', 'slotTarget:header']);
  const jsx = parseMarkup('const x = a < b; return (<Badge tone="warn" onDismiss={() => close(1)}>{items.map((i) => <Badge key={i} />)}</Badge>)', { syntax: 'jsx' });
  assert.equal(jsx.children[0].tag, 'Badge');
  assert.equal(jsx.children[0].children[0].tag, 'Badge', 'a tag inside an expression is a child');
  assert.equal(splitSource('P.vue', '<template><div><template v-if="x"><b/></template></div></template>\n<script>let y</script>').markup, '<div><template v-if="x"><b/></template></div>');
});

test('a Vue page with invented parts, wrong data and a misplaced part is refused line by line; one written right passes', async () => {
  const { root, catalog, context } = acme();
  const page = await pageSystem(root, {}, catalog);
  // No intent layer: the system is its code's own component files, Figma never read.
  assert.deepEqual(Object.keys(page.components).sort(), ['Badge', 'ListPage', 'SearchField', 'TabStrip', 'Toolbar']);
  const bad = `<template>
  <list-page :titel="'Orders'">
    <template #footer>x</template>
    <tab-strip look="loud" compact="false" :tabs="[{ id: 1, lable: 'Open' }, { label: 'Closed' }]" @pick="go"/>
    <search-field placeholder="Find"/>
    <fancy-grid/>
    <home-pill/>
  </list-page>
  <div data-missing="order timeline" data-searched="tabStrip, listPage" data-why="nothing shows events in time"/>
</template>
<script setup>
import ListPage from '@/components/templates/ListPage'
import TabStrip from '@/components/library/tabs/TabStrip'
import SearchField from '@/components/library/search/SearchField'
import FancyGrid from '@/components/library/grids/FancyGrid'
import HomePill from './HomePill.vue'
</script>`;
  const r = checkPage('prototypes/Orders.vue', bad, page, { context });
  const msgs = r.findings.filter((f) => f.level === 'error').map((f) => `${f.line} ${f.message}`);
  const has = (re) => assert.ok(msgs.some((m) => re.test(m)), `${re} in:\n${msgs.join('\n')}`);
  has(/^2 list-page has no prop "titel" \(did you mean title\?\)/);
  has(/^3 list-page has no slot "footer" \(its slots: default, header\)/);
  has(/^4 tab-strip look="loud" is not one of main, quiet/);
  has(/^4 tab-strip compact="false" is the text "false", which turns it on: write :compact="false"/);
  has(/^4 tab-strip tabs: "lable" is not a field it takes \(did you mean label\?\)/);
  has(/^4 tab-strip tabs: item 2 has no "id", which every use in the code gives \(src\/views\/Orders\.vue:1\)/);
  has(/^4 tab-strip emits no "pick" \(did you mean picked\?\)/);
  has(/^5 SearchField is not inside Toolbar/);
  has(/^6 <fancy-grid> is imported from @\/components\/library\/grids\/FancyGrid, which is not a file of the system/);
  has(/^7 <home-pill> is a component of its own \(from \.\/HomePill\.vue\), not the system's/);
  assert.deepEqual(r.gaps.map((g) => g.need), ['order timeline']);

  const good = `<template>
  <list-page title="Orders">
    <template #header><tab-strip look="quiet" :compact="false" :tabs="tabs" @picked="pick"/></template>
    <toolbar><template #start><search-field placeholder="Find" @enter="find"/></template></toolbar>
  </list-page>
</template>
<script setup>
import { ref } from 'vue'
import ListPage from '@/components/templates/ListPage'
import TabStrip from '@/components/library/tabs/TabStrip'
import Toolbar from '@/components/library/toolbars/Toolbar'
import SearchField from '@/components/library/search/SearchField'
const tabs = ref([{ id: 'o', label: 'Open', selected: true }, { id: 'c', label: 'Closed' }])
const pick = () => {}
const find = () => {}
</script>`;
  const ok = checkPage('prototypes/Orders.vue', good, page, { context });
  assert.deepEqual(ok.findings, []);

  const noTemplate = checkPage('prototypes/Bare.vue', '<template><toolbar/></template>\n<script setup>\nimport Toolbar from \'@/components/library/toolbars/Toolbar\'\n</script>', page, { context });
  assert.ok(noTemplate.findings.some((f) => /starts from no template: the documentation chooses a template first \(ListPage\)/.test(f.message)));
});

test('a JSX page is held to the same checks, as JSX writes a prop and a listener', async () => {
  const { root, catalog, context } = acme();
  const page = await pageSystem(root, {}, catalog);
  const r = checkPage('prototypes/Alerts.jsx', `import { Badge } from '@/components/library/badges/Badge'
import ListPage from '@/components/templates/ListPage'
export default function Alerts() {
  return (<ListPage title="Alerts"><Badge tone="loud" label="New" onDismiss={() => {}} onClose={() => {}} /></ListPage>)
}`, page, { context });
  const msgs = r.findings.map((f) => f.message);
  assert.ok(msgs.some((m) => /Badge tone="loud" is not one of info, warn/.test(m)), msgs.join('\n'));
  assert.ok(msgs.some((m) => /Badge has no "onClose"/.test(m)), msgs.join('\n'));
  assert.ok(!msgs.some((m) => /onDismiss/.test(m)), 'a prop the component takes');
});

test('each component\'s card says how to import it, what it takes and emits, and its use in the code', async () => {
  const { root, catalog } = acme();
  const page = await pageSystem(root, {}, catalog);
  const lines = usageCards(page, ['TabStrip'], { importLine: (c) => page.importSeen[c.name] }).join('\n');
  assert.match(lines, /TabStrip {2}import TabStrip from '@\/components\/library\/tabs\/TabStrip'/);
  assert.match(lines, /props: tabs\* list of \{id, label, selected\} · look main\|quiet = main · compact boolean/);
  assert.match(lines, /events: @picked/);
  assert.match(lines, /slots: none: nothing goes inside it/);
  assert.match(lines, /in the code \(src\/views\/Orders\.vue:1\): <tab-strip :tabs="tabs" @picked="pick"\/>/);
  assert.match(lines, /tabs = ref\(\[\{ id: 'a', label: 'Open' \}/);
  assert.match(pageConventions(page).join('\n'), /no component takes a two-way binding/);
  assert.deepEqual(importedComponents(page, "```vue\nimport TabStrip from '@/components/library/tabs/TabStrip'\n```"), ['TabStrip']);
});

test('the edit hook holds a page in prototypes/ to the same check, from the system the last run kept', async () => {
  const { root, catalog, context } = acme();
  const page = await pageSystem(root, {}, catalog);
  put(root, '.design-system-engine-out/prototypes/page-system.json', JSON.stringify(pageCache(page, context)));
  put(root, 'prototypes/Orders.vue', '<template><list-page><search-field/></list-page></template>\n<script setup>\nimport ListPage from \'@/components/templates/ListPage\'\nimport SearchField from \'@/components/library/search/SearchField\'\n</script>');
  const out = pageHookCheck({ tool_input: { file_path: join(root, 'prototypes/Orders.vue') } }, { root });
  assert.match(out, /prototypes\/Orders\.vue:1 {2}SearchField is not inside Toolbar/);
  put(root, 'src/views/Other.vue', '<template><search-field/></template>');
  assert.equal(pageHookCheck({ tool_input: { file_path: join(root, 'src/views/Other.vue') } }, { root }), null, 'only a page in prototypes/');
});

test('each mistake is kept with why: a gap in the documentation, or written and not followed', async () => {
  const { root, catalog, context } = acme();
  const page = await pageSystem(root, {}, catalog);
  const ctx = { ...context, components: { TabStrip: { intentLayer: { examples: [] } }, ListPage: { intentLayer: { examples: ['<ListPage title="A" />'] } } } };
  const r = checkPage('prototypes/P.vue', `<template><list-page :titel="'x'"><tab-strip :tabs="[{ lable: 'A' }]" @pick="go"/><search-field/></list-page></template>
<script setup>
import ListPage from '@/components/templates/ListPage'
import TabStrip from '@/components/library/tabs/TabStrip'
import SearchField from '@/components/library/search/SearchField'
</script>`, page, { context: ctx });
  const { rec, items } = recordInventions(root, '.design-system-engine-out', 'prototypes/P.vue', r, { page, context: ctx });
  const why = (c, k) => items.find((x) => x.component === c && x.kind === k);
  assert.deepEqual([why('TabStrip', 'event').gap, why('TabStrip', 'event').need], [true, 'example'], 'its page shows no example');
  assert.deepEqual([why('ListPage', 'prop').gap, why('ListPage', 'prop').why], [false, 'its page has an example; the agent wrote it otherwise']);
  assert.deepEqual([why('SearchField', 'rule').gap, why('SearchField', 'rule').why], [false, 'the rule is written; the agent did not follow it']);
  assert.equal(why('SearchField', 'rule').component, 'SearchField');
  assert.equal(rec.byComponent.TabStrip.needs.example.n >= 1, true);
  assert.equal(rec.runs.length, 1);
});

test('an example the intent layer gets is the product\'s own use of the component, its product attributes left out', async () => {
  const { withRealUses, briefOf, exampleOf } = await import('../intent-changes.mjs');
  const { root, catalog, context } = acme();
  const page = await pageSystem(root, {}, catalog);
  put(root, '.design-system-engine-out/prototypes/page-system.json', JSON.stringify(pageCache(page, context)));
  const facts = withRealUses(root, { components: { TabStrip: { file: 'src/components/library/tabs/TabStrip.vue', props: {} } } });
  assert.equal(exampleOf(briefOf('TabStrip', facts)), '`<tab-strip :tabs="tabs" @picked="pick"/>`');
});

test('what an agent cannot learn from the documentation: props, events, slots and lists no comment and no page explains', async () => {
  const { docCoverage, coverageLines } = await import('../doc-coverage.mjs');
  const { root, catalog } = acme();
  const page = await pageSystem(root, {}, catalog);
  const ctx = { components: { TabStrip: { purpose: 'Switches views.', intentLayer: { whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: ['Send picked with the id of the tab.'], examples: [] } } } };
  const cov = docCoverage(page, ctx);
  const tab = cov.components.TabStrip.missing.map((m) => `${m.kind}:${m.what}`);
  assert.ok(tab.includes('example:TabStrip'), tab.join(' '));
  assert.ok(tab.includes('prop:compact'), 'a prop no comment names');
  assert.ok(!tab.includes('prop:tabs') && !tab.includes('fields:tabs'), 'its comment says what tabs holds');
  assert.ok(!tab.includes('event:picked'), 'its page names the event');
  assert.ok(cov.components.Toolbar.missing.some((m) => m.kind === 'page'));
  assert.ok(cov.components.Toolbar.missing.some((m) => m.kind === 'slot' && m.what === 'start'));
  assert.match(coverageLines(cov).join('\n'), /^What an agent cannot learn from the documentation: \d+ of \d+ things unsaid/);
});

test('the documentation under load: needs turned into "which component?" scenarios, graded; requests from its own pages', async () => {
  const { scenariosFrom, runChoices, gradeChoices, sweepRequests, menuOf, codeOf } = await import('../doc-stress.mjs');
  const { root, catalog } = acme();
  const page = await pageSystem(root, {}, catalog);
  const ctx = {
    components: {
      TabStrip: { purpose: 'Switches between views of one page.', intentLayer: { whenToUse: ['Use TabStrip when people switch between sibling views of the same record.', 'Use it with `Toolbar` above.'] } },
      SearchField: { purpose: 'Finds records by their words.', intentLayer: { whenToUse: ['Use it when people look for a record by typing part of its name.'] } },
    },
    rules: [{ title: 'Orders page (pages, intent layer)', text: 'The orders page lists every order a customer made, newest first.' }, { title: 'Orders page · Rules (pages, intent layer)', text: 'x' }],
  };
  const sc = scenariosFrom(ctx, page);
  assert.deepEqual(sc.map((s) => [s.component, s.text]).sort(), [['SearchField', 'Use it when people look for a record by typing part of its name.'], ['TabStrip', 'Use it when people switch between sibling views of the same record.']], 'its own name taken out; a need that names another component left out');
  const byName = Object.fromEntries(sc.map((s) => [s.component, s.id]));
  assert.match(menuOf(ctx, page), /TabStrip: Switches between views of one page\./);
  const answers = runChoices(sc, 'menu', () => JSON.stringify({ [byName.TabStrip]: 'TabStrip', [byName.SearchField]: 'tab-strip' }));
  const g = gradeChoices(sc, answers, page);
  assert.equal(g.right, 1);
  assert.deepEqual(g.confusions, { SearchField: [{ chose: 'TabStrip', text: 'Use it when people look for a record by typing part of its name.' }] }, 'a tag answers for its component');
  assert.deepEqual(sweepRequests(ctx).map((r) => r.from), ['Orders page'], 'a whole page, not one of its sections');
  assert.equal(codeOf('Here:\n```vue\n<template/>\n```'), '<template/>\n');
  const { sharedLines, withoutOwnUse } = await import('../doc-stress.mjs');
  const twins = { components: { TabStrip: { intentLayer: { whenToUse: ['People pick one of several.'] } }, Toolbar: { intentLayer: { whenToUse: ['People pick one of several.', 'Actions sit above a list.'] } } } };
  assert.deepEqual(sharedLines(twins, page).map((x) => x.components), [['TabStrip', 'Toolbar']]);
  assert.deepEqual(withoutOwnUse(twins, page), ['TabStrip'], 'a line of its own sets Toolbar apart');
});

test('a need the system has a component for is not a gap, unless the page says it looked at it and why it does not fit', async () => {
  const { systemFor } = await import('../page-check.mjs');
  const comps = { secretField: {}, rateGrid: {}, drawerPanel: {}, tickBoxPrimary: {} };
  assert.deepEqual(systemFor('a secret field for the login', comps), ['secretField']);
  assert.deepEqual(systemFor('a grid of rates', comps), ['rateGrid']);
  assert.deepEqual(systemFor('fields for the filter panel', comps), [], 'a word every name shares says nothing');
  const { root, catalog } = acme();
  const page = await pageSystem(root, {}, catalog);
  const r = checkPage('prototypes/P.vue', '<template><list-page><div data-missing="tab strip for the views"/><div data-missing="tab strip again" data-searched="TabStrip" data-why="it cannot hold icons"/></list-page></template>\n<script setup>\nimport ListPage from \'@/components/templates/ListPage\'\n</script>', page, {});
  assert.ok(r.findings.some((f) => f.level === 'error' && /"tab strip for the views" is not missing: the system has TabStrip/.test(f.message)));
  assert.ok(!r.findings.some((f) => f.level === 'error' && /tab strip again/.test(f.message)), 'looked at and said why');
});

test('coverage asks the questions an agent actually gets stuck on: which value, what the keyboard does, which of two alike', () => {
  const page = { components: {
    // Documented in every old way, and still silent on which size to pick and on the keyboard.
    menu: { props: { size: { description: 'how big', options: ['s', 'm', 'l'] } }, commentWords: ['size'] },
    // The pair an agent confuses, with purposes made of the same words.
    card: { props: {} }, cards: { props: {} },
    // Its keyboard is the browser's own: never asked for.
    icon: { props: {} },
  } };
  const il = (purpose, extra = {}) => ({ intentLayer: { purpose, whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], examples: ['<x/>'], ...extra }, purpose });
  const context = { components: {
    menu: il('a list of actions'),
    card: il('a box that holds content'),
    cards: il('a box that holds content'),
    icon: il('a small picture'),
  } };
  const kinds = (cov, n) => cov.components[n].missing.map((m) => m.kind);

  const cov = docCoverage(page, context);
  assert.ok(kinds(cov, 'menu').includes('values'), JSON.stringify(kinds(cov, 'menu')));
  assert.ok(kinds(cov, 'menu').includes('keyboard'));
  assert.ok(kinds(cov, 'card').includes('apart') && kinds(cov, 'cards').includes('apart'), 'the pair is a gap for both');
  assert.equal(kinds(cov, 'icon').includes('keyboard'), false, 'an icon has no keyboard of its own to describe');

  // Said, and the questions stop being asked of it.
  const better = { components: {
    menu: il('a list of actions. Use s inside a toolbar, m everywhere, l only on a touch screen. Tab moves between items and Escape closes it'),
    card: il('a box that holds one thing'), cards: il('a grid of several boxes'), icon: il('a small picture'),
  } };
  const cov2 = docCoverage(page, { components: better.components });
  assert.equal(kinds(cov2, 'menu').includes('values'), false, JSON.stringify(cov2.components.menu.missing));
  assert.equal(kinds(cov2, 'menu').includes('keyboard'), false);
  assert.equal(kinds(cov2, 'card').includes('apart'), false, 'two purposes with words of their own tell them apart');

  // A component is never counted as fully said while a question about it is unanswered.
  assert.ok(cov.components.menu.total >= cov.components.menu.said + 2);
});

test('coverage asks the edges a screen meets first: content that does not fit, and one action where there are two', async () => {
  const { docCoverage, coverageLines } = await import('../doc-coverage.mjs');
  const page = { components: {
    // A dialog with two actions and a place for content.
    sheet: { props: { primaryButtonLabel: {}, secondaryButtonLabel: {}, description: {} }, slots: { named: ['body'] } },
    // Nothing it holds can overflow, and it has one action: neither question is asked.
    dot: { props: { tone: {} } },
  } };
  const il = (purpose, rules = []) => ({ intentLayer: { purpose, whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules, examples: ['<x/>'] }, purpose });
  const kinds = (cov, n) => cov.components[n].missing.map((m) => m.kind);
  const silent = docCoverage(page, { components: { sheet: il('asks the person to confirm'), dot: il('a status mark') } });
  assert.ok(kinds(silent, 'sheet').includes('overflow') && kinds(silent, 'sheet').includes('oneAction'), JSON.stringify(kinds(silent, 'sheet')));
  assert.deepEqual(kinds(silent, 'dot').filter((k) => k === 'overflow' || k === 'oneAction'), []);
  assert.match(coverageLines(silent).join('\n'), /sheet: .*nothing on content that does not fit · nothing on one action only/);
  // Said on its page, and asked no more.
  const said = docCoverage(page, { components: { sheet: il('asks the person to confirm', ['Its body scrolls past 60% of the window; the title and buttons stay.', 'With one button only, the primary one stays, full width.']), dot: il('a status mark') } });
  assert.deepEqual(kinds(said, 'sheet').filter((k) => k === 'overflow' || k === 'oneAction'), []);
});
