// intent-examples.mjs - an example drafted into a component page that shows none: the way the products use it most,
// from their own code, in the code's own syntax, with only what its contract has and none of a product's own data; and
// where it goes, as a draft, in a Markdown page and a DSDS page alike, read back, reviewed and dropped whole. An invented
// system (Acme) and invented products (Shop, Admin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callsIn, apiOf, commonCall, exampleText, tagsOf } from '../lib/intent-examples.mjs';
import { sureParts, applyPlan, planOf, mdReview, jsonReview, mdAddExample, jsonAddExample, describeChanges } from '../lib/intent-changes.mjs';
import { entityView } from '../lib/doc-source-dsds.mjs';
import { readMarkdown } from '../lib/doc-source-markdown.mjs';
import { factsFrom } from '../lib/intent-truth.mjs';
import { useReport } from '../lib/intent-layer.mjs';

// The tile's contract: two Figma props bound to code props, one the code has alone, an event and a named slot.
const CONTRACT = {
  name: 'tileMedia',
  source: { code: { file: 'src/tiles/TileMedia.vue', tag: 'TileMedia', syntax: 'vue' } },
  props: [
    { name: 'Size', type: 'enum', options: ['S', 'M'], bindings: { figma: { kind: 'VARIANT', property: 'Size' }, code: { prop: 'size', options: ['small', 'medium'] } } },
    { name: 'Title', type: 'text', bindings: { figma: { kind: 'TEXT', property: 'Title' }, code: { prop: 'title' } } },
  ],
  codeOnly: [{ name: 'items', type: 'array' }, { name: 'dense', type: 'boolean' }],
  events: [{ name: 'select' }],
  codeSlots: [{ name: 'default' }, { name: 'footer' }],
};
const CART = `<template>
  <div class="cart">
    <TileMedia size="small" :items="cart.lines" title="Your basket" class="cart-tile" data-test="tile" @select="pickLine" />
    <TileMedia size="medium" :items="saved" title="Saved for later" @select="openSaved" v-if="saved.length" />
  </div>
</template>`;
const ORDERS = `<template>
  <TileMedia size="small" :items="orders.recent" title="Recent orders" @select="openOrder" :glow-mode="true" />
  <tile-media size="small" :items="orders.old" title="Older" @select="openOld">
    <template #footer><a href="/orders">All orders</a></template>
  </tile-media>
</template>`;
const FILES = [
  { file: 'apps/shop/src/Cart.vue', product: 'Shop', text: CART },
  { file: 'apps/admin/src/Orders.vue', product: 'Admin', text: ORDERS },
  { file: 'src/tiles/TileMedia.vue', text: '<template><TileMedia size="small" /></template>' },
];

test('every call of a component in a file, its attributes as written and what it holds', () => {
  const calls = callsIn(ORDERS, ['TileMedia', 'tile-media']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].attrs.map((a) => a.name), ['size', ':items', 'title', '@select', ':glow-mode']);
  assert.equal(calls[0].children, null, 'self-closing');
  assert.equal(calls[0].line, 2);
  assert.deepEqual(calls[1].slots, ['footer']);
  const jsx = callsIn('<Grid>\n  <TileMedia size="small" items={rows.filter((r) => r.on)} onSelect={() => go("x")} {...rest} dense />\n</Grid>', ['TileMedia']);
  assert.deepEqual(jsx[0].attrs.map((a) => [a.name, a.raw]), [['size', 'small'], ['items', 'rows.filter((r) => r.on)'], ['onSelect', '() => go("x")'], ['...', '...rest'], ['dense', null]]);
  assert.deepEqual([...apiOf(CONTRACT).props.keys()], ['size', 'title', 'items', 'dense']);
  assert.deepEqual(tagsOf(CONTRACT, 'vue'), ['TileMedia', 'tile-media']);
});

test('the most common call, in the code\'s own syntax: only what the contract has, the products\' own data left out', () => {
  const c = commonCall({ contract: CONTRACT, files: FILES });
  // Three of the four calls in the products take this form; the component's own file is not a use.
  assert.equal(c.code, '<TileMedia size="small" :items="items" title="…" @select="onSelect" />');
  assert.deepEqual({ file: c.file, line: c.line, product: c.product, same: c.same, total: c.total, lang: c.lang }, { file: 'apps/shop/src/Cart.vue', line: 3, product: 'Shop', same: 2, total: 4, lang: 'vue' });
  assert.ok(!/basket|cart|class|data-test|glow|v-if|pickLine/.test(c.code), 'no class, no directive, no prop the contract does not have, no product words or expressions');
  assert.equal(exampleText(c), 'The most common way the products use it (2 of the 4 uses read), from apps/shop/src/Cart.vue, line 3, in Shop, with the product\'s own data left out:');
  // A value the prop does not take is the product's own: written as …
  const odd = commonCall({ contract: CONTRACT, files: [{ file: 'a.vue', text: '<TileMedia size="huge" :dense="true" />' }] });
  assert.equal(odd.code, '<TileMedia size="…" :dense="true" />');
  // A slot the contract has is kept, holding …; what it holds otherwise is …
  const slotted = commonCall({ contract: CONTRACT, files: [{ file: 'b.vue', text: ORDERS.split('\n').slice(2).join('\n') }] });
  assert.equal(slotted.code, '<tile-media size="small" :items="items" title="…" @select="onSelect">\n  <template #footer>…</template>\n</tile-media>');
  // JSX writes it in JSX.
  const react = { ...CONTRACT, source: { code: { file: 'src/TileMedia.jsx', tag: 'TileMedia', syntax: 'jsx' } } };
  assert.equal(commonCall({ contract: react, files: [{ file: 'App.jsx', text: '<TileMedia size="medium" items={rows} onSelect={() => go(1)} className="x" dense>Hi there</TileMedia>' }] }).code, '<TileMedia size="medium" items={items} onSelect={onSelect} dense>\n  …\n</TileMedia>');
  assert.equal(commonCall({ contract: CONTRACT, files: [{ file: 'c.vue', text: '<p>No tile here</p>' }] }), null, 'no call, no example');
  assert.equal(commonCall({ contract: { ...CONTRACT, source: { code: { file: 'x.vue' } } }, files: FILES }), null, 'no syntax named, no example');
});

const call = commonCall({ contract: CONTRACT, files: FILES });
const plannedItem = (entity) => ({ entity, page: { name: entity.name, file: entity.file, component: 'tileMedia' }, remove: [], rewrite: [], need: ['example'], example: call });
const facts = factsFrom({ components: { tileMedia: { file: 'src/tiles/TileMedia.vue', props: { size: { options: ['small', 'medium'] } } } } });

test('a Markdown page: the example drafted under Examples as a fenced block, read back as one draft with its code, dropped whole', () => {
  const md = '---\ntitle: Tile media\nkind: component\ncomponent: src/tiles/TileMedia.vue\n---\n\n# Tile media\n\nA tile with a picture.\n\n## When to use\n\n- To show one item with its picture.\n';
  const e = { kind: 'component', layer: 'components', name: 'Tile media', file: 'docs/tile-media.md', code: 'src/tiles/TileMedia.vue', purpose: ['A tile with a picture.'], whenToUse: ['To show one item with its picture.'], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const plan = sureParts([plannedItem(e)], facts);
  assert.deepEqual(plan[0].drafted.map((d) => [d.where, !!d.sure, !!d.example]), [['Examples', false, true]], 'a draft, never written as the team\'s');
  const out = applyPlan(plan, new Map([['docs/tile-media.md', md]])).files.get('docs/tile-media.md');
  assert.match(out, /## Examples\n\n\*\*Draft:\*\* The most common way the products use it \(2 of the 4 uses read\), from apps\/shop\/src\/Cart\.vue, line 3, in Shop, with the product's own data left out:\n\n```vue\n<TileMedia size="small" :items="items" title="…" @select="onSelect" \/>\n```\n/);
  // Read back: one draft, under Examples, holding its code; nothing of it in the page's sections until it is approved.
  const page = readMarkdown(new Map([['docs/tile-media.md', out]]), { root: 'docs' }).entities[0];
  assert.deepEqual(page.drafts.map((d) => [d.where, d.code, d.lang]), [['Examples', call.code, 'vue']]);
  assert.ok(!page.sections.some((s) => /TileMedia/.test(s.text)), 'the drafted code is not the team\'s yet');
  // A page whose example waits for review is not given another.
  const snap = { _source: {}, entities: [page] };
  const report = useReport(snap, new Map([['tileMedia', page]]), { names: ['tileMedia'], wrongOf: () => [] });
  assert.ok(!planOf(snap, report)[0]?.need.includes('example'));
  // Approved: the marker comes off, the code stays. Dropped: the line, its code and the heading left empty go.
  const text = page.drafts[0].text;
  assert.match(mdReview(out, text), /\nThe most common way[^\n]*\n\n```vue\n<TileMedia/);
  const dropped = mdReview(out, text, null);
  assert.ok(!/## Examples|<TileMedia|```/.test(dropped), dropped);
  assert.match(dropped, /- To show one item with its picture\.\n?$/);
  // Into an Examples section the page has: at its end, never twice.
  const had = mdAddExample('# T\n\n## Examples\n\nA tile in a grid.\n\n## Decisions\n\n- None.\n', { text: 'From a.vue:', code: '<TileMedia />', lang: 'vue' });
  assert.match(had, /## Examples\n\nA tile in a grid\.\n\n\*\*Draft:\*\* From a\.vue:\n\n```vue\n<TileMedia \/>\n```\n\n## Decisions/);
  assert.match(describeChanges({ pages: [{ name: 'Tile media', file: e.file, removed: [], rewritten: [], drafted: plan[0].drafted }], held: [] }), /- Drafted, Examples: "The most common way[^\n]*\n\n {2}```vue\n {2}<TileMedia size="small"/);
});

test('a DSDS page: the example drafted as a block titled Examples, where the layer holds its examples; read back and dropped whole', () => {
  const doc = { kind: 'component', id: 'component-tile-media', name: 'Tile media', description: 'A tile with a picture.', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ level: 'should', statement: 'To show one item with its picture.' }] }] };
  const e = { kind: 'component', layer: 'components', name: 'Tile media', id: doc.id, file: 'dsds/tile-media.dsds.json', code: 'src/tiles/TileMedia.vue', purpose: ['A tile with a picture.'], whenToUse: ['x'], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const plan = sureParts([plannedItem(e)], facts);
  const out = JSON.parse(applyPlan(plan, new Map([['dsds/tile-media.dsds.json', JSON.stringify(doc, null, 2) + '\n']])).files.get('dsds/tile-media.dsds.json'));
  const ex = out.sections.find((s) => s.title === 'Examples');
  assert.equal(ex.kind, 'section');
  assert.equal(ex.freeform[0].body, `**Draft:** ${exampleText(call)}\n\n\`\`\`vue\n${call.code}\n\`\`\``);
  const view = entityView(out, 'dsds/tile-media.dsds.json', 'components');
  assert.deepEqual(view.drafts.map((d) => [d.where, d.code]), [['Examples', call.code]]);
  assert.ok(!view.sections.some((s) => s.title === 'Examples'), 'nothing of it read as the team\'s');
  // Never twice; and where the layer's pages keep examples inside another section, it goes there.
  const again = JSON.parse(JSON.stringify(out)); jsonAddExample(again, plan[0].drafted[0]);
  assert.equal(again.sections.filter((s) => s.title === 'Examples').length, 1);
  const inSpec = { sections: [] }; jsonAddExample(inSpec, plan[0].drafted[0], { layout: { shapes: new Map([['examples', 'in:Specification']]), parents: new Set(['specification']) } });
  assert.deepEqual(inSpec.sections.map((s) => [s.title, s.freeform[0].title]), [['Specification', 'Examples']]);
  // Dropped: its block and the section it was alone in go; approved: the marker comes off, the code stays.
  const d1 = JSON.parse(JSON.stringify(out));
  assert.equal(jsonReview(d1, view.drafts[0].text, null), 1);
  assert.deepEqual(d1.sections.map((s) => s.title), ['When to use']);
  const d2 = JSON.parse(JSON.stringify(out));
  assert.equal(jsonReview(d2, view.drafts[0].text), 1);
  assert.match(d2.sections.find((s) => s.title === 'Examples').freeform[0].body, /^The most common way[\s\S]*```vue\n<TileMedia/);
});

test('a page whose component no product uses keeps the example from its own code, as before', () => {
  const e = { kind: 'component', layer: 'components', name: 'Chip One', file: 'specs/dsds/chip-one.dsds.json', code: 'src/chips/ChipOne.vue', purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const f = factsFrom({ components: { chipOne: { file: 'src/chips/ChipOne.vue', props: { size: { options: ['s', 'm'] } } } } });
  const plan = sureParts([{ entity: e, page: { name: e.name, file: e.file, component: 'chipOne' }, remove: [], rewrite: [], need: ['example'] }], f);
  assert.deepEqual(plan[0].drafted.map((d) => `${d.sure ? 'sure ' : ''}${d.where}: ${d.text}`), ['sure Example: `<ChipOne size="s" />`']);
});
