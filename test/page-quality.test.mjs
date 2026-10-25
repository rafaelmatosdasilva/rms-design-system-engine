// page-quality.mjs: the habits agents fall into and the states a page owes, read the same from a page in any framework
// (Vue, React, Svelte) and from the engine's own compositions. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkup, splitSource } from '../page-check.mjs';
import { habitReview, owedStates, fromPageTree, fromComposition } from '../page-quality.mjs';

const read = (file, text) => {
  const src = splitSource(file, text);
  const tree = parseMarkup(src.markup, { syntax: src.syntax, line: src.line });
  const mark = (n) => { for (const c of n.children ?? []) { c.system = /^Acme/.test(c.tag) ? c.tag : null; mark(c); } };
  mark(tree);
  return { shape: fromPageTree(tree, src.markup), markup: src.markup, script: src.script };
};
const kinds = (r) => r.findings.map((f) => f.kind).sort();
const SYSTEM = ['AcmeEmpty', 'AcmeFieldError', 'AcmeSkeleton'];

const messy = {
  vue: ['Messy.vue', `<template><AcmePage><h1>Orders</h1><h3>Open</h3><AcmeCard><AcmeCard>Inner</AcmeCard></AcmeCard>
  <AcmeButton variant="primary">Save</AcmeButton><AcmeButton variant="primary">Delete</AcmeButton>
  <input placeholder="Search orders" /><AcmeAlert /><AcmeBanner /><AcmeTable :rows="rows" /></AcmePage></template>
  <script setup>const rows = await fetch('/orders')</script>`],
  react: ['Messy.jsx', `export default function Messy() { const rows = useQuery('orders'); return (<AcmePage><h1>Orders</h1><h3>Open</h3><AcmeCard><AcmeCard>Inner</AcmeCard></AcmeCard>
  <AcmeButton variant="primary">Save</AcmeButton><AcmeButton variant="primary">Delete</AcmeButton>
  <input placeholder="Search orders" /><AcmeAlert /><AcmeBanner />{rows.map((r) => <AcmeRow key={r.id} />)}</AcmePage>); }`],
  svelte: ['Messy.svelte', `<script>const rows = await fetch('/orders');</script><AcmePage><h1>Orders</h1><h3>Open</h3><AcmeCard><AcmeCard>Inner</AcmeCard></AcmeCard>
  <AcmeButton variant="primary">Save</AcmeButton><AcmeButton variant="primary">Delete</AcmeButton>
  <input placeholder="Search orders" /><AcmeAlert /><AcmeBanner /><AcmeTable rows={rows} /></AcmePage>`],
};
for (const [fw, [file, text]] of Object.entries(messy)) {
  test(`${fw}: every habit found, with its line, and the score falls`, () => {
    const { shape, markup, script } = read(file, text);
    const r = habitReview(shape, { templates: ['AcmePage'] });
    assert.deepEqual(kinds(r), ['alerts', 'destructive', 'heading', 'nested', 'placeholder', 'primary']);
    assert.ok(r.findings.every((f) => Number.isInteger(f.line)), 'each at its line');
    assert.ok(r.score <= 2, `scored ${r.score}`);
    assert.deepEqual(owedStates(shape, { markup, script, components: SYSTEM, templates: ['AcmePage'] }).map((s) => s.kind), ['empty', 'error', 'loading']);
  });
}

test('a clean page: 10, and owes nothing it already shows', () => {
  const { shape, markup, script } = read('Clean.jsx', `export default function Clean() { const { rows, loading, error } = useQuery('orders'); return (<AcmePage><h1>Orders</h1><h2>Open</h2>
  <label>Name<input placeholder="Ada" /></label>{error && <AcmeFieldError>{error}</AcmeFieldError>}
  {loading ? <AcmeSkeleton /> : rows.length ? <AcmeTable rows={rows} /> : <AcmeEmpty />}
  <AcmeButton variant="primary">Save</AcmeButton><AcmeButton variant="secondary">Delete</AcmeButton></AcmePage>); }`);
  const r = habitReview(shape, { templates: ['AcmePage'] });
  assert.deepEqual(r.findings, []);
  assert.equal(r.score, 10);
  assert.deepEqual(owedStates(shape, { markup, script, components: SYSTEM, templates: ['AcmePage'] }), []);
});

test('the empty state names the system\'s own component; a template named like a list is not a list', () => {
  const { shape, markup, script } = read('List.vue', '<template><AcmeListPage><AcmeTable :rows="rows" /></AcmeListPage></template>');
  const s = owedStates(shape, { markup, script, components: SYSTEM, templates: ['AcmeListPage'] });
  assert.deepEqual(s.map((x) => x.kind), ['empty']);
  assert.match(s[0].message, /AcmeEmpty/);
  assert.deepEqual(owedStates(read('Page.vue', '<template><AcmeListPage><h1>Hi</h1></AcmeListPage></template>').shape, { components: SYSTEM, templates: ['AcmeListPage'] }), []);
});

test('an action inside a dialog is that layer\'s own; a labelled field is not flagged', () => {
  const { shape } = read('D.vue', `<template><AcmePage><AcmeButton variant="primary">Save</AcmeButton>
  <AcmeDialog><AcmeButton variant="primary">Confirm</AcmeButton></AcmeDialog><input placeholder="Email" aria-label="Email" /></AcmePage></template>`);
  assert.deepEqual(habitReview(shape).findings, []);
});

test('the JSX reader sees a tag right after text inside an element', () => {
  const { shape } = read('L.jsx', 'export default () => (<label>Name<input placeholder="Ada" /></label>);');
  assert.equal(shape.children[0].children[0].tag, 'input');
  assert.equal(parseMarkup('a < b && c', { syntax: 'jsx' }).children.length, 0, 'a comparison is still no tag');
});

test('a composition gets the same habits', () => {
  const tree = { component: 'Page', props: {}, children: [
    { component: 'AcmeCard', props: {}, children: [{ component: 'AcmeCard', props: {} }] },
    { component: 'Text', props: { as: 'h1', text: 'Orders' } }, { component: 'Text', props: { as: 'h4', text: 'Open' } },
    { component: 'AcmeButton', props: { Variant: 'Primary', Label: 'Delete order' } },
  ] };
  assert.deepEqual(kinds(habitReview(fromComposition(tree))), ['destructive', 'heading', 'nested']);
});
