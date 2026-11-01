// A Figma property paired with a code prop says what it is for, in the code's own words: the doc comment right above
// the prop (a Vue props object, a defineProps type, a TypeScript interface), else what the component's comment says of
// it. The team's words (contract.authored.json propDescriptions) still come first, and Figma's when the code says none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts } from '../contract-gen.mjs';
import { extractPropComments, textComponentApi } from '../component-source.mjs';
import { docgenComponents, loadTypeScript, typescriptComponentApi } from '../component-api.mjs';

const TS = loadTypeScript(process.env.TS_FOR_TESTS ?? process.cwd());

const VUE = `<template><div class="card-tile">{{ title }}</div></template>
<script>
export default {
  props: {
    /** The words at the top of the card. */
    title: { type: String, default: '' },
    // How much room it takes:
    // compact in a list.
    size: { type: String, default: 'm' },
    pinned: Boolean,
  },
};
</script>
`;
const TSX = `import React from 'react';
export interface TileOneProps {
  /**
   * What the tile shows.
   * @default 'Caption'
   */
  caption?: string;
  /** How it reads. */
  tone?: 'calm' | 'loud';
  disabled?: boolean;
}
export function TileOne({ caption = 'Caption', tone = 'calm', disabled }: TileOneProps) {
  return <button className="tile-one" disabled={disabled}>{caption}</button>;
}
`;

test('the comment right above each prop, in a Vue props object and a TypeScript interface', () => {
  assert.deepEqual(Object.fromEntries(extractPropComments(VUE)), { title: 'The words at the top of the card.', size: 'How much room it takes: compact in a list.' });
  assert.deepEqual(Object.fromEntries(extractPropComments(TSX)), { caption: 'What the tile shows.', tone: 'How it reads.' });
  const vue = textComponentApi('CardTile.vue', VUE).props;
  assert.equal(vue.title.description, 'The words at the top of the card.');
  assert.equal(vue.pinned.description, undefined);
  assert.equal(textComponentApi('TileOne.tsx', TSX).props.tone.description, 'How it reads.');
  // docgen's own descriptions are read too.
  const [d] = docgenComponents([{ displayName: 'TileOne', description: 'A tile.', props: { tone: { description: 'How it reads.', tsType: { name: 'string' } } } }]);
  assert.deepEqual([d.description, d.props.tone.description], ['A tile.', 'How it reads.']);
});

test('the TypeScript reading takes each member\'s doc comment too', { skip: TS ? false : 'no TypeScript compiler available' }, () => {
  const a = typescriptComponentApi(TS, 'TileOne.tsx', TSX, 'TileOne');
  assert.deepEqual([a.props.caption.description, a.props.tone.description, a.props.disabled.description], ['What the tile shows.', 'How it reads.', undefined]);
  const v = typescriptComponentApi(TS, 'Tag.vue', '<script setup lang="ts">\ndefineProps<{\n  /** How loud it is. */\n  tone?: \'info\' | \'warn\'\n}>()\n</script>', 'Tag');
  assert.equal(v.props.tone.description, 'How loud it is.');
});

const project = () => makeFixture({
  'vars.json': { light: {} },
  'struct.json': { components: { cardTile: { nodeId: '1:1', h: 40 }, tileOne: { nodeId: '1:2', h: 40 } } },
  'props.json': {
    cardTile: { nodeId: '1:1', properties: {
      'title#1:0': { type: 'TEXT', defaultValue: 'Title' },
      size: { type: 'VARIANT', defaultValue: 'm', variantOptions: ['s', 'm'] },
      pinned: { type: 'BOOLEAN', defaultValue: false, description: 'Kept at the top, as Figma says.' },
    } },
    tileOne: { nodeId: '1:2', properties: {
      'caption#2:0': { type: 'TEXT', defaultValue: 'Caption' },
      tone: { type: 'VARIANT', defaultValue: 'calm', variantOptions: ['calm', 'loud'] },
    } },
  },
  'src/components/CardTile.vue': VUE,
  'src/components/TileOne.tsx': TSX,
});
const cfg = {
  paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' },
  componentFiles: { cardTile: 'src/components/CardTile.vue', tileOne: 'src/components/TileOne.tsx' },
  contracts: { gitignore: false },
};

test('a prop paired Figma to code takes the code\'s description; Figma\'s when the code has none; the team\'s words first', async () => {
  const dir = project();
  const r = await generateContracts(dir, cfg, { force: true });
  assert.deepEqual(r.invalid, [], JSON.stringify(r.invalid));
  const read = (n) => JSON.parse(readFileSync(join(r.outDir, `${n}.contract.json`), 'utf8'));
  const said = (n) => Object.fromEntries(read(n).props.map((p) => [p.name, p.description ?? null]));
  assert.deepEqual(said('cardTile'), { title: 'The words at the top of the card.', size: 'How much room it takes: compact in a list.', pinned: 'Kept at the top, as Figma says.' });
  assert.deepEqual(said('tileOne'), { caption: 'What the tile shows.', tone: 'How it reads.' });
  assert.equal(read('cardTile').props.find((p) => p.name === 'title').bindings.code.description, 'The words at the top of the card.');
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  authored.components.cardTile = { propDescriptions: { title: 'The team\'s words.' } };
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored));
  const again = await generateContracts(dir, cfg, { force: true });
  const c = JSON.parse(readFileSync(join(again.outDir, 'cardTile.contract.json'), 'utf8'));
  assert.equal(c.props.find((p) => p.name === 'title').description, 'The team\'s words.');
});
