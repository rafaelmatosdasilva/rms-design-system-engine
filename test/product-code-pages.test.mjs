// product-code-pages.mjs - how this product's own pages are actually built, read from its code. A project with no
// prototypes and no designed screens - every project on its first day - still has these, and they are the strongest
// signal there is against a new page being arranged however the agent felt like arranging it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { codePageFiles, codePages, pageShape } from '../lib/product-code-pages.mjs';
import { pageFacts } from '../lib/product-conventions.mjs';
import { parseMarkup } from '../lib/page-check.mjs';

const dir = () => tempDir('code-pages-');
const write = (root, rel, text) => { mkdirSync(join(root, rel, '..').replace(/\/\.\.$/, '').split('/').slice(0, -1).join('/') || root, { recursive: true }); mkdirSync(join(root, rel).split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(join(root, rel), text); };

test('a page is a file where a product keeps its pages, or the app\'s own root; a component never is', () => {
  const root = dir();
  for (const f of ['src/views/Settings.vue', 'src/pages/Profile.jsx', 'src/screens/Inbox.tsx', 'src/App.vue',
    'src/components/Button.vue', 'src/utils/helpers.js', 'node_modules/x/views/Thing.vue', 'src/views/__tests__/Settings.test.jsx']) write(root, f, '<template><div/></template>');
  const found = codePageFiles(root).map((x) => x.file).sort();
  assert.deepEqual(found, ['src/App.vue', 'src/pages/Profile.jsx', 'src/screens/Inbox.tsx', 'src/views/Settings.vue']);
  // Oldest first: where nothing is shared yet, the page made first sets the product's decisions, as the prototypes do.
  assert.deepEqual(codePageFiles(root).map((x) => typeof x.made), ['number', 'number', 'number', 'number']);
  assert.equal(codePageFiles(root, { most: 2 }).length, 2);
  assert.deepEqual(codePageFiles(dir()), [], 'a project with no pages says nothing rather than guessing');
});

// A page of the product: a heading, a field, and the actions at the end, written as people write pages.
const PAGE = `<template>
  <main class="page">
    <header class="page__head"><h1>Account</h1></header>
    <section class="page__body">
      <Field label="Name" />
      <Field label="Email" />
    </section>
    <footer class="page__actions"><Button label="Save" /><Button label="Cancel" /></footer>
  </main>
</template>`;
const system = { components: { Field: {}, Button: {} } };
const treeOf = (markup) => {
  const t = parseMarkup(markup, { syntax: 'vue' });
  const mark = (n) => { if (n.tag && system.components[n.tag]) n.system = n.tag; (n.children ?? []).forEach(mark); };
  mark(t);
  return t;
};

test('the shape the conventions read: the system\'s components by name, headings as Text, the rest seen through', () => {
  const shape = pageShape(treeOf(PAGE), { markup: PAGE, actionNames: ['Button'] });
  const names = [];
  const walk = (n) => { names.push(n.component); (n.children ?? []).forEach(walk); };
  walk(shape);
  // A product's own wrappers are arrangement, so the frame is read through them rather than stopped by them; and the
  // one holding nothing but actions is a row of actions, whatever element it was written as.
  assert.deepEqual(shape.children.map((c) => c.component), ['Stack', 'Stack', 'Row'], names.join(','));
  // The page's own wrapper is lifted away: left in, the page looks like it holds one part and where its actions sit
  // cannot be read at all.
  assert.equal(shape.children.length, 3, 'the <main> is the page, not a part of it');
  assert.deepEqual(names.filter((n) => n === 'Field' || n === 'Button'), ['Field', 'Field', 'Button', 'Button']);
  assert.equal(names.includes('Text'), true, 'the h1 is a heading, whatever tag it is written as');
  // A label is read however the code writes it: a prop, or the words between the tags.
  const facts = pageFacts(shape, { actionNames: ['Button'] });
  assert.deepEqual(facts.intents.map((i) => `${i.intent}:${i.label}`), ['save:Save', 'cancel:Cancel']);
  assert.deepEqual(facts.heading, { style: null, as: 'h1' });
  assert.equal(facts.actions.at, 'end');
});

test('a file with none of the system in it says nothing, and a prototype already drawn is never replaced', () => {
  const read = (f) => ({ tree: treeOf(f === 'src/views/Account.vue' ? PAGE : '<template><div><p>About us</p></div></template>'), markup: f === 'src/views/Account.vue' ? PAGE : '' });
  const facts = (tree) => pageFacts(tree, { actionNames: ['Button'] });
  const out = codePages('.', [{ file: 'src/views/Account.vue', made: 1 }, { file: 'src/views/About.vue', made: 2 }], read, facts, { actionNames: ['Button'] });
  assert.deepEqual(Object.keys(out), ['Account'], 'a page with none of the system says nothing about how the system is composed');
  assert.equal(out.Account.fromCode, true);
  assert.match(out.Account.label, /this product's own page/);
  assert.equal(out.Account.designed, false);
  // The same name twice is read once: the first file wins, as the oldest page does.
  const twice = codePages('.', [{ file: 'src/views/Account.vue', made: 1 }, { file: 'src/pages/Account.vue', made: 2 }], read, facts);
  assert.deepEqual(Object.keys(twice), ['Account']);
  // Nothing readable gives nothing, never an empty page that would set a convention of its own.
  assert.deepEqual(codePages('.', [{ file: 'x.vue', made: 1 }], () => null, facts), {});
});
