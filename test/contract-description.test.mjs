// A contract's description, from the best source that says what the component is for: the team's own words
// (contract.authored.json), its intent layer page's purpose, the comment its code file writes on it, Figma's
// description, and only then the engine's placeholder. descriptionFrom says which; a component nothing describes has
// no descriptionFrom and is counted as having no description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts, descriptionOf } from '../contract-gen.mjs';
import { componentComment, commentWords } from '../component-source.mjs';
import { syncIntentLayer } from '../intent-layer.mjs';

test('the code\'s own comment on a component: Vue, Svelte, React and TypeScript, never a licence or a lint switch', () => {
  assert.equal(componentComment('CardTile.vue', '<!--\n  A tile for one subject:\n  its picture and its title.\n\n  Internal notes.\n-->\n<template><div class="card-tile" /></template>'), 'A tile for one subject: its picture and its title.');
  assert.equal(componentComment('CardTile.vue', '<template><div /></template>\n<script>\n/**\n * A tile for one subject.\n * @displayName Card tile\n */\nexport default { name: "CardTile" }\n</script>'), 'A tile for one subject.');
  assert.equal(componentComment('CardTile.vue', '<script setup>\n/** A tile for one subject. */\ndefineOptions({ name: "CardTile" })\n</script>'), 'A tile for one subject.');
  assert.equal(componentComment('CardTile.svelte', '<!--\n  @component\n  A tile for one subject.\n-->\n<div class="card-tile"></div>'), 'A tile for one subject.');
  assert.equal(componentComment('CardTile.tsx', 'import x from "y";\n/**\n * A tile for one subject.\n *\n * @param props its props\n */\nexport function CardTile(props: Props) { return <div className="card-tile" />; }'), 'A tile for one subject.');
  assert.equal(componentComment('CardTile.tsx', '/** A tile for one subject. */\nexport const CardTile: React.FC<Props> = () => null;'), 'A tile for one subject.');
  assert.equal(componentComment('card-tile.ts', '/** A tile for one subject. */\n@customElement("card-tile")\nexport class CardTile extends LitElement {}'), 'A tile for one subject.');
  assert.equal(componentComment('CardTile.tsx', '/** Formats a date. */\nfunction formatDate(d) { return d; }\nexport function CardTile() { return null; }'), '', 'a helper\'s comment is not the component\'s');
  assert.equal(componentComment('CardTile.tsx', '/** @license MIT */\nexport function CardTile() { return null; }'), '');
  assert.equal(componentComment('CardTile.tsx', '/** Copyright 2026 Acme. */\nexport function CardTile() { return null; }'), '');
  assert.equal(componentComment('CardTile.vue', '<!-- eslint-disable vue/no-v-html -->\n<template><div /></template>'), '');
  assert.equal(componentComment('CardTile.vue', '<template><div /></template>'), '');
  assert.equal(commentWords('/**\n * Words here.\n * @deprecated use cardTile\n */'), 'Words here.');
});

test('the best source wins: the team\'s words, the intent page, the code, Figma, a structure note, else nothing', () => {
  const all = { authored: 'Team words.', intent: 'Page words.\n\nMore on the page.', code: 'Code words.', figma: 'Figma words.', note: 'A note.' };
  assert.deepEqual(descriptionOf(all), { text: 'Team words.', from: 'authored' });
  assert.deepEqual(descriptionOf({ ...all, authored: '' }), { text: 'Page words.', from: 'intent' }, 'the page\'s first paragraph');
  assert.deepEqual(descriptionOf({ ...all, authored: null, intent: null }), { text: 'Code words.', from: 'code' });
  assert.deepEqual(descriptionOf({ figma: 'Figma words.', note: 'A note.' }), { text: 'Figma words.', from: 'figma' });
  assert.deepEqual(descriptionOf({ note: 'A note.' }), { text: 'A note.', from: 'authored' });
  assert.equal(descriptionOf({}), null);
  const long = `${'A long first sentence that goes on '.repeat(6)}and ends here. Then a second one.`;
  assert.ok(descriptionOf({ intent: long }).text.length <= 300);
  assert.equal(descriptionOf({ figma: 'x'.repeat(400) }).text.length, 300, 'Figma\'s, cut as it always was');
  assert.equal(descriptionOf({ figma: 'x'.repeat(400), full: true }).text.length, 400, 'published: the whole of it');
});

const project = () => makeFixture({
  'package.json': { name: 'northwind-ds' },
  'vars.json': { light: {} },
  'docs/components/card-tile.md': '---\ntitle: Card Tile\n---\n\nShows one subject with its picture and title.\n\n## When to use\n\n- To open one subject.\n',
  'struct.json': { components: { cardTile: { nodeId: '1:1', h: 40 }, tileOne: { nodeId: '1:2', h: 40 }, badgeTile: { nodeId: '1:3', h: 20 }, plainTile: { nodeId: '1:4', h: 20 } } },
  'props.json': {
    cardTile: { nodeId: '1:1', description: 'Figma words for the card.', properties: {} },
    tileOne: { nodeId: '1:2', description: 'Figma words for the tile.', properties: {} },
    badgeTile: { nodeId: '1:3', description: 'Figma words for the badge.', properties: {} },
    plainTile: { nodeId: '1:4', properties: {} },
  },
  'src/components/CardTile.vue': '<!-- What the code says of the card. -->\n<template><div class="card-tile" /></template>\n',
  'src/components/TileOne.vue': '<!--\n  One subject, as a tile.\n-->\n<template><div class="tile-one" /></template>\n',
  'src/components/BadgeTile.vue': '<template><span class="badge-tile" /></template>\n',
  'src/components/PlainTile.vue': '<template><span class="plain-tile" /></template>\n',
});
const cfg = {
  paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' },
  componentFiles: { cardTile: 'src/components/CardTile.vue', tileOne: 'src/components/TileOne.vue', badgeTile: 'src/components/BadgeTile.vue', plainTile: 'src/components/PlainTile.vue' },
  intentLayer: 'docs',
  contracts: { gitignore: false },
};

test('each contract says what its component is for, and where that came from', async () => {
  const dir = project();
  await syncIntentLayer(dir, cfg, {});
  const r = await generateContracts(dir, cfg, { force: true });
  assert.deepEqual(r.invalid, [], JSON.stringify(r.invalid));
  const read = (n) => JSON.parse(readFileSync(join(r.outDir, `${n}.contract.json`), 'utf8'));
  const said = (n) => [read(n).description, read(n).descriptionFrom ?? null];
  assert.deepEqual(said('cardTile'), ['Shows one subject with its picture and title.', 'intent'], 'the intent page first, over the code and Figma');
  assert.equal(read('cardTile').intent.purpose, 'Shows one subject with its picture and title.');
  assert.deepEqual(said('tileOne'), ['One subject, as a tile.', 'code'], 'the code\'s comment, over Figma');
  assert.deepEqual(said('badgeTile'), ['Figma words for the badge.', 'figma']);
  assert.deepEqual(said('plainTile'), ['plainTile — captured from Figma by rms-design-system-engine.', null], 'nothing says: the placeholder, and no source');
  // The team's own words win over all of them.
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  authored.components.cardTile = { description: 'The team\'s words.' };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored));
  const again = await generateContracts(dir, cfg, { force: true });
  const c = JSON.parse(readFileSync(join(again.outDir, 'cardTile.contract.json'), 'utf8'));
  assert.deepEqual([c.description, c.descriptionFrom], ['The team\'s words.', 'authored']);
});

test('published into the intent layer, a contract never takes the page\'s words back as its description', async () => {
  const dir = project();
  await syncIntentLayer(dir, cfg, {});
  const r = await generateContracts(dir, cfg, { publishTo: 'pub', force: true });
  const c = JSON.parse(readFileSync(join(r.outDir, 'src/components/card-tile.contract.json'), 'utf8'));
  assert.deepEqual([c.description, c.descriptionFrom], ['What the code says of the card.', 'code']);
  assert.ok(c.intentPage, 'the page is linked instead');
});
