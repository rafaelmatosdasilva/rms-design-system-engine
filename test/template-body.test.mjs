// What a template's body holds, against what the documentation says it holds. The check read that a page started
// from a template and never read what the template was filled with: an agent put radio buttons inside a filters
// panel where the team uses dropdowns, nothing in the documentation said which control a filter takes, and the
// check had nothing to hold the page to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateSaid, namedIn, templateBodies, bodyFindings, pointsNowhere, nowhereQuestions, ruleName, MOST_NAMED } from '../lib/template-body.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { checkPage, pageSystem } from '../lib/page-check.mjs';
import { tempDir } from './helpers.mjs';

const put = (root, rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

const comps = (...names) => Object.fromEntries(names.map((n) => [n, {}]));
// page-check's own node shape: a flat list, each knowing its parent.
const node = (id, component, parent = null, line = 1) => ({ id, component, children: [], parent, line });

test('a template\'s documentation is its own page and every section of it, however the name is written', () => {
  const context = { components: comps('FiltersPanel'), rules: [
    { title: 'Filters panel (templates, intent layer)', text: 'The panel a list is narrowed with.', layer: 'templates' },
    { title: 'Filters panel · Body (templates, intent layer)', text: 'Each filter is a `Dropdown`.', layer: 'templates' },
    { title: 'List page (templates, intent layer)', text: 'Something else entirely.', layer: 'templates' },
  ] };
  const said = templateSaid(context, 'FiltersPanel');
  assert.match(said, /narrowed with/);
  assert.match(said, /Dropdown/);
  assert.doesNotMatch(said, /entirely/, 'another template\'s page is not this one\'s');
  assert.equal(templateSaid(context, 'Nothing'), '', 'a template nothing is written about says nothing');
  assert.equal(ruleName('Filters panel · Body (templates, intent layer)'), 'Filters panel');
});

test('a component is named by its name, by a word of prose, or by an alias', () => {
  const names = ['Dropdown', 'RadioGroup', 'DataTable'];
  assert.deepEqual([...namedIn('Each filter is a `Dropdown`.', names)], ['Dropdown']);
  assert.deepEqual([...namedIn('Use a dropdown for each filter.', names)], ['Dropdown'], 'prose counts');
  assert.deepEqual([...namedIn('Use a <ds-dropdown>.', names, { 'ds-dropdown': 'Dropdown' })], ['Dropdown']);
  assert.deepEqual([...namedIn('Nothing of the system here.', names)], []);
  assert.deepEqual([...namedIn('Dropdown', [])], [], 'no components read is no names');
});

test('a component in a described body that the documentation never names is this prototype\'s choice', () => {
  const context = { components: comps('FiltersPanel', 'Dropdown', 'RadioGroup'), rules: [
    { title: 'Filters panel (templates, intent layer)', text: 'Each filter is a `Dropdown`.', layer: 'templates' },
  ] };
  const nodes = [node('n1', 'FiltersPanel'), node('n2', 'Dropdown', 'n1', 4), node('n3', 'RadioGroup', 'n1', 7)];
  const [b] = templateBodies(nodes, context, ['FiltersPanel']);
  assert.deepEqual(b.body, ['Dropdown', 'RadioGroup']);
  assert.deepEqual(b.unnamed, [{ component: 'RadioGroup', line: 7 }], 'the one the documentation never names');
  const [f] = bodyFindings([b]);
  assert.equal(f.level, 'warning', 'the page may be right; what is wrong is that nobody decided it');
  assert.equal(f.line, 7);
  assert.match(f.message, /FiltersPanel's documentation says what its body holds and never names RadioGroup: it is this prototype's choice/);
  assert.match(f.message, /put the question to the team/);
});

test('a template the documentation says nothing about is said once, with what went into it', () => {
  // Among templates somebody did write up: a team that documented none of them is not told so on every page.
  const context = { components: comps('FiltersPanel', 'ListPage', 'Dropdown', 'RadioGroup'), rules: [
    { title: 'List page (templates, intent layer)', text: 'A list of records starts here.', layer: 'templates' },
  ] };
  const nodes = [node('n1', 'FiltersPanel'), node('n2', 'RadioGroup', 'n1', 3), node('n3', 'Dropdown', 'n1', 5), node('n4', 'RadioGroup', 'n1', 9)];
  const [b] = templateBodies(nodes, context, ['FiltersPanel', 'ListPage']);
  assert.deepEqual(b.body, ['RadioGroup', 'Dropdown'], 'each component once, never once a use');
  const found = bodyFindings([b]);
  assert.equal(found.length, 1, 'one finding a template, not one a component');
  assert.match(found[0].message, /FiltersPanel's documentation never says what its body holds, and this page put RadioGroup, Dropdown in it/);
  assert.match(found[0].message, /Ask the team what belongs in a FiltersPanel/);
});

test('a long body is counted rather than listed, so the finding can be read', () => {
  const many = Array.from({ length: MOST_NAMED + 3 }, (_, i) => `Part${i}`);
  const context = { components: comps('Shell', 'ListPage', ...many), rules: [
    { title: 'List page (templates, intent layer)', text: 'A list of records starts here.', layer: 'templates' },
  ] };
  const nodes = [node('n0', 'Shell'), ...many.map((m, i) => node(`n${i + 1}`, m, 'n0', i + 2))];
  const [f] = bodyFindings(templateBodies(nodes, context, ['Shell', 'ListPage']));
  assert.match(f.message, new RegExp(`${many.slice(0, MOST_NAMED).join(', ')} and 3 more`));
});

test('a body the documentation covers says nothing, and so does a page with no documentation read', () => {
  const context = { components: comps('FiltersPanel', 'Dropdown'), rules: [
    { title: 'Filters panel (templates, intent layer)', text: 'Each filter is a `Dropdown`.', layer: 'templates' },
  ] };
  const nodes = [node('n1', 'FiltersPanel'), node('n2', 'Dropdown', 'n1', 4)];
  assert.deepEqual(bodyFindings(templateBodies(nodes, context, ['FiltersPanel'])), []);
  // Nothing read is nothing said: the worst outcome here would be a page questioned on no evidence.
  assert.deepEqual(templateBodies(nodes, null, ['FiltersPanel']), []);
  assert.deepEqual(templateBodies(nodes, { components: {}, rules: [] }, ['FiltersPanel']), []);
  assert.deepEqual(templateBodies(nodes, context, []), []);
  // No template in the whole documentation: a fact about the documentation, not about this page, and said nowhere
  // near once a page.
  assert.deepEqual(templateBodies(nodes, { components: comps('FiltersPanel', 'Dropdown'), rules: [] }, ['FiltersPanel']), []);
  // A component outside every template is the page around it, not a body.
  assert.deepEqual(templateBodies([node('n1', 'Dropdown')], context, ['FiltersPanel']), []);
});

test('a page whose documentation is only a pointer nobody can follow is no documentation', () => {
  const context = { components: comps('DataTable'), rules: [
    { title: 'Orders (pages, intent layer)', text: 'See the Filters family spec.', layer: 'pages', file: 'intent/orders.md' },
    { title: 'Invoices (pages, intent layer)', text: 'See the Tables family spec.', layer: 'pages' },
    { title: 'Tables (patterns, intent layer)', text: 'Every table is a `DataTable`.', layer: 'patterns' },
    { title: 'Customers (pages, intent layer)', text: 'See the Filters spec.\nThe list is narrowed before it is read.', layer: 'pages' },
    { title: 'Filters panel (templates, intent layer)', text: 'See the Orders page.', layer: 'templates' },
  ] };
  const gone = pointsNowhere(context);
  assert.deepEqual(gone.map((g) => g.page), ['Orders'], 'only the pointer with nothing at the end of it');
  assert.equal(gone[0].points, 'Filters');
  assert.equal(gone[0].from, 'intent/orders.md');

  const [q] = nowhereQuestions(gone);
  assert.equal(q.name, 'Orders');
  assert.equal(q.layer, 'pages');
  assert.match(q.text, /only a pointer to Filters, and there is no Filters to read/);
  // The thing left open, not a question: the line that prints it asks "How should it be on this page?" around it.
  assert.doesNotMatch(q.text, /\?$/);
  assert.deepEqual(pointsNowhere({ rules: [], components: {} }), []);
});

test('the page check reports it as a warning, naming the template and the choice', async () => {
  // A system of its own: a filters panel with a body, and the two controls a filter could be.
  const root = tempDir('template-body-');
  put(root, 'ds-config.json', '{}');
  put(root, 'src/components/templates/FiltersPanel.vue', '<template><aside class="filters-panel"><slot/></aside></template>\n<script setup>\nconst props = defineProps({ title: { type: String, default: \'\' } })\n</script>');
  put(root, 'src/components/library/selects/Dropdown.vue', '<template><select class="dropdown"/></template>\n<script setup>\nconst props = defineProps({ options: { type: Array, default: () => [] } })\n</script>');
  put(root, 'src/components/library/choices/RadioGroup.vue', '<template><div class="radio-group"><slot/></div></template>\n<script setup>\nconst props = defineProps({ options: { type: Array, default: () => [] } })\n</script>');
  const catalog = { components: { filtersPanel: { props: {} }, dropdown: { props: {} }, radioGroup: { props: {} } } };
  const system = await pageSystem(root, {}, catalog);
  const context = { components: { FiltersPanel: {}, Dropdown: {}, RadioGroup: {} }, templates: ['FiltersPanel'], limits: [], inside: [],
    rules: [{ title: 'Filters panel (templates, intent layer)', text: 'Each filter is a `Dropdown`.', layer: 'templates' }] };
  const page = `<template>
  <filters-panel title="Narrow">
    <radio-group :options="[]"/>
  </filters-panel>
</template>
<script setup>
import FiltersPanel from '@/components/templates/FiltersPanel'
import RadioGroup from '@/components/library/choices/RadioGroup'
</script>`;
  const { findings } = checkPage('prototypes/Orders.vue', page, system, { context });
  const said = findings.filter((f) => /never names RadioGroup/.test(f.message));
  assert.equal(said.length, 1, `one finding, got: ${findings.map((f) => f.message).join(' | ')}`);
  assert.equal(said[0].level, 'warning', 'the page may be right; what is wrong is that nobody decided it');
  assert.equal(said[0].component, 'FiltersPanel', 'the finding sits on the template whose body it is about');
  assert.equal(said[0].line, 3, 'the line the choice was written on');

  // The body the documentation does name is not questioned.
  const right = page.replace('<radio-group :options="[]"/>', '<dropdown :options="[]"/>').replace("import RadioGroup from '@/components/library/choices/RadioGroup'", "import Dropdown from '@/components/library/selects/Dropdown'");
  assert.deepEqual(checkPage('prototypes/Right.vue', right, system, { context }).findings.filter((f) => f.kind === 'rule').map((f) => f.message), []);
});
