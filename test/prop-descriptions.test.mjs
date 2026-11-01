// The props whose contract says nothing of what they are for (prop-descriptions.mjs): each listed with where its
// description goes, one sentence drafted from facts only for each code prop, and the patch that writes the drafts as
// comments in the file's own style. The patch applies as it is, and the next contract build reads each one back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { generateContracts } from '../lib/contract-gen.mjs';
import { contractsIn } from '../lib/contract-changes.mjs';
import { draftDescription, undescribed, propDescriptionsOf, writePropDescriptions, placesIn, propUses } from '../lib/prop-descriptions.mjs';
import { writeHandback } from '../lib/handback.mjs';
import { extractReact } from '../lib/component-source.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = '.design-system-engine-out';

test('a draft says what the facts hold, and less when they are thin', () => {
  assert.equal(draftDescription({ prop: 'size', code: 'size', options: ['s', 'm', 'l'], default: 'm' }, { component: 'chip' }), 'Size of the chip: s, m or l. Default m.');
  assert.equal(draftDescription({ prop: 'size', code: 'size' }, { component: 'chip' }), 'Size of the chip.');
  assert.equal(draftDescription({ prop: 'showIcon', code: 'showIcon', type: 'boolean', default: true }, { component: 'cardTile' }), 'Whether the card tile shows its icon. On by default.');
  assert.equal(draftDescription({ prop: 'hasBorder', code: 'hasBorder', type: 'boolean', default: false }, { component: 'chip' }), 'Whether the chip has a border. Off by default.');
  assert.equal(draftDescription({ prop: 'isOpen', code: 'isOpen', type: 'boolean' }, { component: 'menu' }), 'Whether the menu is open.');
  assert.equal(draftDescription({ prop: 'disabled', code: 'disabled', type: 'boolean' }, { component: 'chip' }), 'Whether the chip is disabled.');
  assert.equal(draftDescription({ prop: 'disabled', code: 'disabled', default: false }, { component: 'button' }), 'Whether the button is disabled. Off by default.', 'no type written: a default of false is a boolean');
  assert.equal(draftDescription({ prop: 'closeOnSelect', code: 'closeOnSelect', type: 'boolean' }, { component: 'menu' }), 'Turns close on select on or off for the menu.', 'a name that reads as no state says only what it turns on');
  assert.equal(draftDescription({ prop: 'label', code: 'label', type: 'string', required: true, default: 'x' }, { component: 'chip' }), 'Label of the chip, as text. Required.');
  assert.equal(draftDescription({ prop: 'items', code: 'items', type: 'array' }, { component: 'menu' }), 'Items of the menu, as a list.');
  assert.equal(draftDescription({ prop: 'onPick', code: 'onPick' }, { component: 'menu' }), 'Handler for pick on the menu.');
  // The Figma property it pairs with, when it is named otherwise, and what Figma draws when the code lists no values.
  assert.equal(draftDescription({ prop: 'tone', code: 'tone', figma: 'Appearance', type: 'string', figmaOptions: ['Calm', 'Loud'], default: 'calm' }, { component: 'chip' }), 'Tone of the chip, as text. Figma draws Calm or Loud. Default calm. Figma calls it Appearance.');
  assert.equal(draftDescription({ prop: 'icon', code: 'icon', type: 'string', setBy: ['Show icon'] }, { component: 'chip' }), 'Icon of the chip, as text. Set through Figma\'s Show icon.');
  // How its uses set it.
  assert.equal(draftDescription({ prop: 'size', code: 'size', options: ['s', 'm'], uses: { total: 5, n: 3, values: [['s', 2], ['m', 1]] } }, { component: 'chip' }), 'Size of the chip: s or m. Set in 3 of its 5 uses (s, m).');
  assert.equal(draftDescription({ prop: 'dense', code: 'dense', type: 'boolean', uses: { total: 1, n: 0, values: [] } }, { component: 'chip' }), 'Whether the chip is dense. Left unset in its one use.');
  // Nothing a comment cannot hold.
  assert.doesNotMatch(draftDescription({ prop: 'x', code: 'x', options: ['*/', '@a', '{b}'] }, { component: 'c' }), /\*\/|@|[{}]/);
});

test('the props that say nothing: a paired one, one only the code has, a Figma property with no code prop', () => {
  const contract = { name: 'chip', props: [
    { name: 'Label', description: 'What it says.', bindings: { figma: {}, code: { prop: 'label', as: 'prop' } } },
    { name: 'Size', bindings: { figma: { kind: 'VARIANT', options: ['S', 'M'] }, code: { prop: 'size', as: 'prop', options: ['s', 'm'], default: 'm' } } },
    { name: 'Badge', bindings: { figma: { kind: 'INSTANCE_SWAP' }, code: { slot: 'badge', as: 'slot' } } },
    { name: 'Elevation', bindings: { figma: { kind: 'VARIANT', options: ['low', 'high'] }, code: null } },
  ], codeOnly: [{ name: 'id', type: 'string' }, { name: 'dense', type: 'boolean', description: 'Tighter.' }] };
  assert.deepEqual(undescribed(contract).map((x) => [x.prop, x.kind, x.code]), [['size', 'paired', 'size'], ['Badge', 'figma', null], ['Elevation', 'figma', null], ['id', 'code', 'id']]);
});

test('uses: each tag of the component in the files it lives in, and what each one sets', () => {
  const files = { 'a.vue': '<template><Chip size="s" dense /><Chip :size="x" /><chip size="m"></chip></template>', 'b.jsx': 'export const B = () => <Chip size="s" onClick={() => go("x > y")} />;' };
  const u = propUses({ name: 'chip', livesIn: { files: [{ file: 'a.vue' }, { file: 'b.jsx' }] } }, (f) => files[f]);
  // A tag in lower case is another element unless it has a dash, as usage-map.mjs counts it.
  assert.equal(u.total, 3);
  assert.deepEqual(u.props.get('size'), { n: 3, values: [['s', 2]] });
  assert.equal(u.props.get('dense').n, 1);
});

test('a TypeScript props type is read by its members, never by a word of its comments or a function\'s parameter', () => {
  const names = extractReact('export interface TileProps {\n  /** Tone of the tile: calm or loud. Does it shine? */\n  tone?: string;\n  onPick?: (id: string) => void;\n  // Its size: s or m.\n  size: string\n}');
  assert.deepEqual([...names].sort(), ['onPick', 'size', 'tone']);
});

const VUE = `<template><div class="card-tile">{{ title }}</div></template>
<script>
export default {
  props: {
    /** The words at the top of the card. */
    title: { type: String, default: '' },
    size: { type: String, default: 'm' },
    pinned: Boolean,
    // eslint-disable-next-line vue/require-default-prop
    count: Number,
  },
};
</script>
`;
const VUE_TS = `<template><span class="tag-chip">{{ text }}</span></template>
<script setup lang="ts">
defineProps<{
  /**
   * The words it shows.
   */
  text: string
  tone?: 'info' | 'warn'
}>()
</script>
`;
const VUE_DOC = `<template><div class="note-box">{{ body }}</div></template>
<script setup>
/** Props received:
 * @body {String} the words in the box
 * @level {String} how loud it reads, can be [calm (default), loud]
 */
defineProps({ body: String, level: { type: String, default: 'calm' }, wide: Boolean })
</script>
`;
const TSX = `import React from 'react';
export interface TileOneProps {
  /** What the tile shows. */
  caption?: string;
  tone?: 'calm' | 'loud';
  disabled?: boolean;
  onPick?: (id: string) => void;
}
export function TileOne({ caption = 'Caption', tone = 'calm', disabled }: TileOneProps) {
  return <button className="tile-one" disabled={disabled}>{caption}</button>;
}
`;
const BADGE = `import React from 'react';
type BadgeTagProps = {
  tone?: 'info' | 'warn';
  dense?: boolean;
};
export const BadgeTag = ({ tone = 'info', dense = false }: BadgeTagProps) => <span className="badge-tag">{tone}{dense}</span>;
`;
const PAGE = `<template><div><CardTile size="s" pinned /><CardTile size="m" /><card-tile /></div></template>
<script setup>import CardTile from '../components/CardTile.vue';</script>
`;
const files = () => ({
  'ds-config.json': {
    paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' },
    componentFiles: { cardTile: 'src/components/CardTile.vue', tagChip: 'src/components/TagChip.vue', noteBox: 'src/components/NoteBox.vue', tileOne: 'src/components/TileOne.tsx', badgeTag: 'src/components/BadgeTag.tsx' },
    codeReading: { docgen: 'docgen.json' },
    contracts: { gitignore: false },
  },
  'vars.json': { light: {} },
  'struct.json': { components: { cardTile: { nodeId: '1:1', h: 40 }, tagChip: { nodeId: '1:2', h: 20 }, noteBox: { nodeId: '1:3', h: 40 }, tileOne: { nodeId: '1:4', h: 40 }, badgeTag: { nodeId: '1:5', h: 20 } } },
  'props.json': {
    cardTile: { nodeId: '1:1', properties: { 'title#1:0': { type: 'TEXT', defaultValue: 'Title' }, Size: { type: 'VARIANT', defaultValue: 'm', variantOptions: ['s', 'm'] }, Elevation: { type: 'VARIANT', defaultValue: 'low', variantOptions: ['low', 'high'] } } },
    tagChip: { nodeId: '1:2', properties: { 'text#2:0': { type: 'TEXT', defaultValue: 'Tag' }, tone: { type: 'VARIANT', defaultValue: 'info', variantOptions: ['info', 'warn'] } } },
    noteBox: { nodeId: '1:3', properties: {} },
    tileOne: { nodeId: '1:4', properties: { 'caption#4:0': { type: 'TEXT', defaultValue: 'Caption' }, tone: { type: 'VARIANT', defaultValue: 'calm', variantOptions: ['calm', 'loud'] } } },
    badgeTag: { nodeId: '1:5', properties: { tone: { type: 'VARIANT', defaultValue: 'info', variantOptions: ['info', 'warn'] } } },
  },
  // docgen's reading of the badge (react-docgen's CLI shape): its props, with no description.
  'docgen.json': { 'src/components/BadgeTag.tsx': [{ displayName: 'BadgeTag', props: {
    tone: { tsType: { name: 'union', elements: [{ name: 'literal', value: "'info'" }, { name: 'literal', value: "'warn'" }] }, required: false, defaultValue: { value: "'info'" } },
    dense: { tsType: { name: 'boolean' }, required: false, defaultValue: { value: 'false' } },
  } }] },
  'src/components/CardTile.vue': VUE,
  'src/components/TagChip.vue': VUE_TS,
  'src/components/NoteBox.vue': VUE_DOC,
  'src/components/TileOne.tsx': TSX,
  'src/components/BadgeTag.tsx': BADGE,
  'src/pages/Home.vue': PAGE,
});
const cfgOf = (dir) => JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
const build = async (dir) => contractsIn((await generateContracts(dir, cfgOf(dir), { force: true })).outDir);
const byName = (r) => Object.fromEntries(r.components.map((c) => [c.name, Object.fromEntries(c.missing.map((m) => [m.prop, m]))]));

test('Vue, TSX and docgen: each prop that says nothing is listed with its file and line, drafted, and patched in the file\'s own style', { timeout: budget(120000) }, async () => {
  const dir = makeFixture(files());
  const r = propDescriptionsOf(dir, await build(dir));
  const m = byName(r);
  // Where each one goes: the line its comment goes above, or the authored file when no code prop is.
  assert.equal(m.cardTile.size.where, 'src/components/CardTile.vue:7');
  assert.equal(m.cardTile.pinned.where, 'src/components/CardTile.vue:8');
  assert.equal(m.cardTile.Elevation.where, 'contract.authored.json (propDescriptions)');
  assert.equal(m.cardTile.Elevation.draft, undefined, 'a Figma property with no code prop is written by a person');
  assert.equal(m.cardTile.count.inPatch, false, 'a lint line above it: never put a comment between the two');
  assert.equal(m.cardTile.title, undefined, 'a prop the code describes is not listed');
  assert.equal(m.tagChip.tone.where, 'src/components/TagChip.vue:8');
  assert.equal(m.tagChip.text, undefined);
  assert.equal(m.tileOne.tone.where, 'src/components/TileOne.tsx:5');
  assert.equal(m.tileOne.caption, undefined);
  assert.equal(m.badgeTag.tone.where, 'src/components/BadgeTag.tsx:3');
  // The drafts, from facts only: its uses in the product's page among them.
  assert.equal(m.cardTile.size.draft, 'Size of the card tile, as text. Figma draws s or m. Default m. Set in 2 of its 3 uses (m, s).');
  assert.equal(m.cardTile.pinned.draft, 'Whether the card tile is pinned. Off by default. Set in 1 of its 3 uses.');
  assert.equal(m.tileOne.tone.draft, 'Tone of the tile one: calm or loud. Default calm.');
  assert.equal(m.badgeTag.dense.draft, 'Whether the badge tag is dense. Off by default.');
  // A component whose props are described in its own comment gets the new one there (@wide {Boolean} …).
  assert.equal(m.noteBox.wide.how, 'block');
  assert.equal(m.noteBox.body, undefined);

  const w = writePropDescriptions(dir, OUT, r.components);
  assert.equal(w.path, `${OUT}/handback/prop-descriptions.diff`);
  const diff = readFileSync(join(dir, w.path), 'utf8');
  assert.match(diff, /\+    \/\*\* Size of the card tile, as text\. .* \*\/\n     size: \{ type: String, default: 'm' \},/, 'one line of /** */ in a Vue props object');
  assert.match(diff, /\+  \/\*\*\n\+   \* Tone of the tag chip: info or warn\.\n\+   \*\/\n   tone\?: 'info' \| 'warn'/, 'a block like the one beside it, in defineProps\' type');
  assert.match(diff, /\+ \* @wide \{Boolean\} Whether the note box is wide\. Off by default\.\n  \*\//, 'a line in the component\'s own comment');
  assert.match(diff, /\+  \/\*\* Tone of the tile one: calm or loud\. Default calm\. \*\/\n   tone\?: 'calm' \| 'loud';/);
  assert.match(diff, /\+  \/\*\* Whether the badge tag is dense\. Off by default\. \*\/\n   dense\?: boolean;/);
  assert.doesNotMatch(diff, /rms-design-system-engine|drafted|engine/i, 'nothing marks a comment as written by the engine');

  // It applies as it is, and the next build reads each one back, word for word, with no prop made of a comment's words.
  execFileSync('git', ['apply', '--check', w.path], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['apply', w.path], { cwd: dir, stdio: 'pipe' });
  const after = await build(dir);
  const said = (name) => { const c = after.find((x) => x.name === name); return Object.fromEntries([...c.props.map((p) => [p.bindings?.code?.prop ?? p.name, p.description ?? null]), ...(c.codeOnly ?? []).map((p) => [p.name, p.description ?? null])]); };
  for (const [comp, props] of Object.entries(m)) for (const [prop, x] of Object.entries(props)) if (x.inPatch) assert.equal(said(comp)[prop], x.draft, `${comp}.${prop} read back`);
  assert.deepEqual(Object.keys(said('tileOne')).sort(), ['caption', 'disabled', 'onPick', 'tone']);
  const again = propDescriptionsOf(dir, after);
  assert.deepEqual(again.components.flatMap((c) => c.missing.map((x) => `${c.name}.${x.prop}`)).sort(), ['cardTile.Elevation', 'cardTile.count']);
  assert.equal(writePropDescriptions(dir, OUT, again.components).path, null, 'nothing left to draft: the patch is gone');
  assert.equal(existsSync(join(dir, w.path)), false);
});

test('a comment style the file already uses is kept: // lines', () => {
  const text = 'export interface ChipProps {\n  // What it says.\n  label: string;\n  size?: string;\n}\n';
  const at = placesIn('Chip.tsx', text, [{ prop: 'size', type: 'string', draft: 'Size of the chip, as text.' }]);
  assert.deepEqual(at.get('size'), { line: 4, how: 'above', lines: ['  // Size of the chip, as text.'] });
});

test('the measured run\'s hand-back keeps the drafted descriptions beside its own files', () => {
  const dir = makeFixture({ 'x.txt': '' });
  mkdirSync(join(dir, OUT, 'handback'), { recursive: true });
  writeFileSync(join(dir, OUT, 'handback', 'prop-descriptions.diff'), 'kept');
  writeFileSync(join(dir, OUT, 'handback', 'code-changes.diff'), 'old');
  writeHandback(dir, OUT, { codeDiffs: [], figmaItems: [], linkFor: () => null });
  assert.equal(readFileSync(join(dir, OUT, 'handback', 'prop-descriptions.diff'), 'utf8'), 'kept');
  assert.equal(existsSync(join(dir, OUT, 'handback', 'code-changes.diff')), false);
});

const cli = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: budget(120000), env: { ...process.env, NO_COLOR: '1' } });

test('--prop-descriptions lists each one with its draft and writes the patch, applied only when asked', { timeout: budget(240000) }, () => {
  const dir = makeFixture(files());
  const r = cli(dir, '--prop-descriptions');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /props say what they are for/);
  assert.match(r.stdout, /cardTile: \d+ of \d+ props with no description\n\s+size \(Figma Size\)\s+src\/components\/CardTile\.vue:7\n\s+drafted: Size of the card tile/);
  assert.match(r.stdout, /Elevation\s+contract\.authored\.json \(propDescriptions\)/);
  assert.match(r.stdout, /Drafted, to approve: \d+ comments in 5 files, \.design-system-engine-out\/handback\/prop-descriptions\.diff/);
  assert.match(r.stdout, /NEXT: .*apply it only when they ask/);
  assert.ok(existsSync(join(dir, OUT, 'handback', 'prop-descriptions.diff')));
  assert.equal(readFileSync(join(dir, 'src/components/CardTile.vue'), 'utf8'), VUE, 'the code is never changed');
  const one = cli(dir, '--prop-descriptions', 'tileOne');
  assert.doesNotMatch(one.stdout, /cardTile/);
});

test('style guide: the Documentation area lists the props that say nothing and the drafts to approve, with the request to copy', { timeout: budget(240000) }, async () => {
  const dir = makeFixture(files());
  await build(dir);
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfgOf(dir), styleguide: { bakeA11y: false } }));
  const r = cli(dir, '--styleguide', '--no-a11y-bake');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { readPage } = await import('../lib/styleguide-files.mjs');
  const html = readPage(join(dir, OUT, 'styleguide', 'index.html'));
  const data = JSON.parse(/<script[^>]*\bid="sg-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  const tile = data.components.find((x) => x.name === 'cardTile').propDocs;
  assert.equal(tile.described + tile.missing.length, tile.total);
  assert.deepEqual(tile.missing.find((x) => x.prop === 'size'), { prop: 'size', figma: 'Size', where: 'src/components/CardTile.vue:7', draft: 'Size of the card tile, as text. Figma draws s or m. Default m. Set in 2 of its 3 uses (m, s).', inPatch: true });
  assert.equal(tile.apply, 'Apply the drafted prop descriptions: git apply .design-system-engine-out/handback/prop-descriptions.diff');
  assert.match(html, /What each prop is for/);
  assert.match(html, /Drafted, to approve/);
  assert.ok(existsSync(join(dir, OUT, 'handback', 'prop-descriptions.diff')));
});
