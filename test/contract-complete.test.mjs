// The complete component contract (contract-gen.mjs + contract-code.mjs): for each Figma property the code prop it is,
// decided once (prop-binding.mjs) from the project's own Code Connect file, with the code's facts; what a property only
// decides (a condition); where Figma and the code differ; the props only the code has; events with what they carry;
// scoped slots with what they hand; states from Figma's variants; the tokens it paints with; what the code says about
// its accessibility. Laid out by the code for an intent layer, published without copies, and the same file every run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from './helpers.mjs';
import { generateContracts, contractFileFor } from '../contract-gen.mjs';

const TILE = `<template>
  <button class="tile-one" :disabled="disabled" @keydown.enter="pick" aria-pressed="false" @click="pick">
    <span v-if="caption" class="caption">{{ caption }}</span>
    <slot name="badge" :level="level" />
  </button>
</template>
<script setup>
const emit = defineEmits(['picked'])
/** Props received:
@caption {String} words shown on the tile
@tone {String} how it reads, can be [calm (default), loud]
@disabled {Boolean} the tile cannot be picked
@pinned {Boolean} kept at the top of a list
*/
const props = defineProps({
  caption: String,
  tone: { type: String, default: 'calm' },
  disabled: Boolean,
  pinned: Boolean
})
const pick = () => emit('picked', props.caption)
</script>
<style>.tile-one:hover { opacity: .9 }</style>
`;
const CONNECT = `// url=https://www.figma.com/design/AbC/tileOne?node-id=10-20
// component=tile-one
import figma from 'figma'
const revealCaption = figma.selectedInstance.getBoolean('revealCaption')
const caption = figma.selectedInstance.getString('captionWords')
const tone = figma.selectedInstance.getEnum('tone', { Calm: 'calm', Loud: 'loud', Quiet: 'quiet' })
const disabled = figma.selectedInstance.getBoolean('disabled')
export default {
  example: figma.html\`
<tile-one
  \${revealCaption && caption ? \`caption="\${caption}"\` : ''}
  \${tone !== 'Calm' ? \`tone="\${tone}"\` : ''}
  \${disabled ? 'disabled' : ''}
/>\`,
  imports: ["import TileOne from '@/components/kit/tiles/One'"],
}
`;
const files = () => ({
  'vars.json': { color: { light: { 'tileOne/surface/color': '#ffffff' } }, sizing: {} },
  'struct.json': { components: { tileOne: { nodeId: '10:20', h: 40 }, tileTwo: { nodeId: '10:30', h: 40 } } },
  'props.json': {
    tileOne: { nodeId: '10:20', description: 'A tile for one subject.', properties: {
      'revealCaption#1:0': { type: 'BOOLEAN', defaultValue: true },
      'captionWords#1:1': { type: 'TEXT', defaultValue: 'Caption' },
      tone: { type: 'VARIANT', defaultValue: 'Loud', variantOptions: ['Calm', 'Loud', 'Quiet'] },
      disabled: { type: 'VARIANT', defaultValue: 'true', variantOptions: ['false', 'true'] },
      state: { type: 'VARIANT', defaultValue: 'default', variantOptions: ['default', 'hover', 'disabled'] },
    }, annotations: [{ label: 'Role: button' }] },
    tileTwo: { nodeId: '10:30', properties: {} },
  },
  'component-state-bindings.json': { tileOne: {
    'tone=Calm, disabled=false, state=default': { props: { tone: 'calm', disabled: 'false', state: 'default' }, bindings: [{ token: 'tileOne/surface/color' }] },
    'tone=Calm, disabled=false, state=hover': { props: { tone: 'calm', disabled: 'false', state: 'hover' }, bindings: [{ token: 'tileOne/surface/color' }, { token: 'tileOne/hover/color' }] },
  } },
  'component-state-tokens.json': { _components: { tileOne: { tokens: { 'tileOne/radius': 1 } } } },
  'src/components/kit/tiles/One.vue': TILE,
  'src/components/kit/tiles/Two.vue': '<template><div class="tile-two"><slot /></div></template>\n<script setup>\ndefineProps({ size: String })\n</script>\n',
  'src/components/kit/lists/Row.vue': '<template><li class="row"><slot :index="i" /></li></template>\n<script setup>\ndefineProps({ dense: Boolean })\n</script>\n',
  'src/figma/tiles/One.figma.js': CONNECT,
});
const cfg = (extra = {}) => ({
  paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' },
  componentFiles: { tileOne: 'src/components/kit/tiles/One.vue', tileTwo: 'src/components/kit/tiles/Two.vue', listRow: 'src/components/kit/lists/Row.vue' },
  contracts: { gitignore: false, ...extra },
});

test('each Figma property with its code prop, what it decides, and where the two differ', async () => {
  const dir = makeFixture(files());
  const r = await generateContracts(dir, cfg(), { force: true });
  assert.deepEqual(r.invalid, [], JSON.stringify(r.invalid));
  const c = JSON.parse(readFileSync(join(r.outDir, 'tileOne.contract.json'), 'utf8'));
  const by = (n) => c.props.find((p) => p.name === n);
  // Code Connect pairs words with caption, and says revealCaption only decides whether caption is written.
  assert.deepEqual([by('captionWords').bindings.code.prop, by('captionWords').bindings.code.source], ['caption', 'codeConnect']);
  assert.equal(by('captionWords').bindings.code.description, 'words shown on the tile');
  assert.equal(by('revealCaption').bindings.code, null);
  assert.deepEqual(by('revealCaption').conditions, [{ code: 'caption', role: 'condition' }]);
  // Figma's Quiet is a value the code does not have; Figma rests on Loud where the code rests on calm.
  assert.deepEqual(by('tone').bindings.code.valueMap, { Calm: 'calm', Loud: 'loud', Quiet: 'quiet' });
  assert.deepEqual(by('tone').differences, [{ kind: 'default', figma: 'Loud', code: 'calm' }, { kind: 'options', onlyInFigma: ['quiet'], onlyInCode: [] }]);
  // A Vue Boolean with no default is false: Figma's default variant (disabled) is a difference, stated.
  assert.deepEqual(by('disabled').differences, [{ kind: 'default', figma: true, code: false }]);
  assert.deepEqual(c.codeOnly.map((x) => x.name), ['pinned']);
  assert.deepEqual(c.events, [{ name: 'picked', payload: ['props.caption'] }]);
  assert.deepEqual(c.codeSlots, [{ name: 'badge', props: ['level'] }]);
  assert.deepEqual(c.source.code, { file: 'src/components/kit/tiles/One.vue', tag: 'tile-one', syntax: 'vue' });
  assert.equal(c.source.codeConnect, 'src/figma/tiles/One.figma.js');
});

test('states from Figma\'s state axis and the code\'s pseudo-classes, tokens per state, accessibility from Figma and the code', async () => {
  const dir = makeFixture(files());
  const r = await generateContracts(dir, cfg(), { force: true });
  const c = JSON.parse(readFileSync(join(r.outDir, 'tileOne.contract.json'), 'utf8'));
  assert.deepEqual(c.states.filter((s) => s.from === 'figma').map((s) => s.name), ['disabled=false', 'disabled=true', 'state=default', 'state=hover', 'state=disabled']);
  assert.deepEqual(c.variants.map((v) => Object.values(v.when)[0]), ['Calm', 'Loud', 'Quiet']);
  assert.deepEqual(c.tokens, { used: ['tileOne/hover/color', 'tileOne/radius', 'tileOne/surface/color'], byState: { 'state=hover': ['tileOne/hover/color'] } });
  assert.deepEqual(c.accessibility, {
    element: { value: 'button', from: 'code' }, role: { value: 'button', from: 'figma' },
    aria: { value: ['aria-pressed'], from: 'code' }, keyboard: { value: ['enter'], from: 'code' },
  });
});

test('laid out by the code for an intent layer: one file per code file, the components only the code has too, no copies, the same file every run', async () => {
  const dir = makeFixture(files());
  const out = (extra) => cfg({ out: 'published', layout: 'code', paths: { 'src/components/kit/': 'components/' }, publish: true, idPrefix: 'kit.', ...extra });
  const r = await generateContracts(dir, out(), { force: true });
  assert.deepEqual(r.invalid, []);
  const one = join(dir, 'published/components/tiles/one.contract.json');
  const c = JSON.parse(readFileSync(one, 'utf8'));
  assert.equal(c.id, 'kit.tileOne');
  assert.equal(c.$schema, '../../contract.schema.json');
  assert.equal(c.description, 'A tile for one subject.');
  assert.ok(!('livesIn' in c) && !('intent' in c) && !('semantics' in c) && !('notes' in c), 'published: no local usage, no copied intent, no empty placeholders');
  assert.ok(existsSync(join(dir, 'published/components/lists/row.contract.json')), 'a component only the code has gets its contract, named as the project declares it');
  assert.equal(JSON.parse(readFileSync(join(dir, 'published/components/lists/row.contract.json'), 'utf8')).name, 'listRow');
  const first = readFileSync(one, 'utf8');
  await generateContracts(dir, out(), { force: true });
  assert.equal(readFileSync(one, 'utf8'), first, 'nothing changed, nothing rewritten differently');
});

test('the path rule: a prefix swapped, each part in kebab-case; no code file, no place', () => {
  const paths = { 'src/ui/': 'components/', 'src/ui-pages/': 'templates/' };
  assert.equal(contractFileFor('a', 'src/ui/cards/MediaTile.vue', { layout: 'code', paths }), 'components/cards/media-tile.contract.json');
  assert.equal(contractFileFor('a', 'src/ui-pages/SidePanel.vue', { layout: 'code', paths }), 'templates/side-panel.contract.json');
  assert.equal(contractFileFor('a', 'lib/Other.vue', { layout: 'code', paths }), null, 'outside every prefix');
  assert.equal(contractFileFor('a', null, { layout: 'code' }), null);
  assert.equal(contractFileFor('cards/row', 'x.vue'), 'cards/row.contract.json', 'by name, as before');
});

test('published to a shared folder: contracts, the schema and a README only; a contract the code no longer has is removed', async () => {
  const dir = makeFixture(files());
  const pub = join(dir, 'shared/contracts');
  mkdirSync(join(pub, 'components/gone'), { recursive: true });
  writeFileSync(join(pub, 'components/gone/old-tile.contract.json'), '{}');
  writeFileSync(join(pub, 'components/keep.md'), 'not a contract');
  const r = await generateContracts(dir, cfg({ paths: { 'src/components/kit/': 'components/' } }), { publishTo: 'shared/contracts', force: true });
  assert.deepEqual(r.invalid, []);
  assert.ok(existsSync(join(pub, 'components/tiles/one.contract.json')), 'laid out by the code by default');
  assert.deepEqual(r.removed, ['components/gone/old-tile.contract.json']);
  assert.ok(!existsSync(join(pub, 'components/gone')), 'the folder it leaves empty goes too');
  assert.ok(existsSync(join(pub, 'components/keep.md')), 'only contracts are removed');
  for (const local of ['tokens.json', 'catalog.json', 'llms.txt', 'built.json', '.gitignore', 'figma-props.d.ts']) assert.ok(!existsSync(join(pub, local)), `${local} stays local`);
  assert.ok(existsSync(join(pub, 'contract.schema.json')));
  const readme = readFileSync(join(pub, 'README.md'), 'utf8');
  assert.match(readme, /Do not edit these files by hand/);
  assert.match(readme, /\| Contracts \| \d+ \|/);
  const again = readFileSync(join(pub, 'README.md'), 'utf8');
  await generateContracts(dir, cfg({ paths: { 'src/components/kit/': 'components/' } }), { publishTo: 'shared/contracts', force: true });
  assert.equal(readFileSync(join(pub, 'README.md'), 'utf8'), again, 'the same inputs, the same README');
});

test('anatomy: a gap on a frame of one item is not spacing, padding of a border\'s width is its room, inner frames are parts; published, the commit that last changed its file', async () => {
  const { execFileSync } = await import('node:child_process');
  const f = files();
  f['struct.json'].components.tileOne = { nodeId: '10:20', h: 40, inFlow: 1, gapVar: 'tile/minHeight', gapPx: 40, paddingVar: { tb: 'base/border/top', lr: 'base/border/left' },
    childFramePadding: [{ name: 'Content', paddingVar: { tb: null, lr: 'spacing/padding/s' } }], childFrameGaps: [{ name: 'Content', gapVar: 'spacing/gap/m', gapPx: 8 }] };
  f['struct.json'].components.tileTwo = { nodeId: '10:30', h: 40, inFlow: 3, gapVar: 'spacing/gap/s', paddingVar: { tb: 'spacing/padding/s', lr: null } };
  const dir = makeFixture(f);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'tiles'], { cwd: dir });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  const r = await generateContracts(dir, cfg({ paths: { 'src/components/kit/': 'components/' } }), { publishTo: 'pub', force: true });
  assert.deepEqual(r.invalid, []);
  const one = JSON.parse(readFileSync(join(dir, 'pub/components/tiles/one.contract.json'), 'utf8'));
  assert.equal(one.anatomy.root.gapToken, undefined, 'one item: nothing to space');
  assert.deepEqual(one.anatomy.root.borderInset, { blockToken: '{base.border.top}', inlineToken: '{base.border.left}' });
  assert.equal(one.anatomy.root.inset, undefined);
  assert.deepEqual(one.anatomy.Content, { gapToken: '{spacing.gap.m}', inset: { inlineToken: '{spacing.padding.s}' } });
  assert.equal(one.source.code.commit, sha);
  const two = JSON.parse(readFileSync(join(dir, 'pub/components/tiles/two.contract.json'), 'utf8'));
  assert.equal(two.anatomy.root.gapToken, '{spacing.gap.s}', 'three items: their spacing');
  assert.deepEqual(two.anatomy.root.inset, { blockToken: '{spacing.padding.s}' });
});
