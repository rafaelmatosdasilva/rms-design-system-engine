// The pairs the engine already suggests, put to a person (prop-pairs.mjs): a Figma property no code prop is paired with,
// whose contract suggests a code prop only the code has, is asked as a yes or a no by --prop-pairs and on the
// component's page in the style guide. A yes is written into contract.authored.json's bindings and the next contract
// pairs them (the code prop's facts, its values mapped); a no is kept there and never asked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { pairProposals, decidePair, askOf, commandFor } from '../prop-pairs.mjs';
import { generateContracts } from '../contract-gen.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TILE = `<template>
  <div class="card-tile" :class="toneKind">
    <p class="card-tile__body">{{ contentList }}</p>
    <span class="card-tile__size">{{ sizeName }}</span>
  </div>
</template>
<script setup>
/** Props received:
@contentList {String} the lines the tile lists
@toneKind {String} how it reads, can be [calm (default), loud]
@sizeName {String} its size, as the product names it
*/
defineProps({ contentList: String, toneKind: { type: String, default: 'calm' }, sizeName: String })
</script>
`;
const files = () => ({
  // The engine may write its own files here (the person answers; on CI an unanswered place is a no).
  'ds-config.json': { paths: { snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' }, componentFiles: { cardTile: 'src/CardTile.vue' }, contracts: { gitignore: false }, writes: { engine: 'yes' } },
  'vars.json': { color: { light: { 'cardTile/surface': '#ffffff' } }, sizing: {} },
  'struct.json': { components: { cardTile: { nodeId: '1:2', h: 40 } } },
  'props.json': { cardTile: { nodeId: '1:2', properties: {
    'Content#1:0': { type: 'TEXT', defaultValue: 'Lines' },
    Tone: { type: 'VARIANT', defaultValue: 'Calm', variantOptions: ['Calm', 'Loud'] },
    Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] },
  } } },
  'src/CardTile.vue': TILE,
});
const cli = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: budget(120000), env: { ...process.env, NO_COLOR: '1' } });
const contractOf = (dir) => JSON.parse(readFileSync(join(dir, 'contracts', 'cardTile.contract.json'), 'utf8'));

test('each suggestion that is a code prop only the code has is a question; an answer is written for that one pair', () => {
  const contract = { name: 'cardTile', props: [{ name: 'Content', suggestion: 'contentList', bindings: { code: null } }, { name: 'Label', bindings: { code: { prop: 'label' } } }, { name: 'Gone', suggestion: 'goneProp', bindings: { code: null } }], codeOnly: [{ name: 'contentList' }] };
  const asked = pairProposals([contract]);
  assert.deepEqual(asked, [{ component: 'cardTile', figma: 'Content', code: 'contentList' }], 'a suggestion the code has no prop for is not asked');
  assert.equal(askOf(asked[0]), 'Figma\'s "Content" is the code\'s "contentList"?');
  assert.equal(commandFor({ component: 'cardTile', figma: 'Show icon', code: 'iconName' }, 'no'), 'rms-design-system-engine --prop-pair cardTile "Show icon" no');
  const before = { components: { cardTile: { bindings: { Label: { attribute: 'label' } } }, other: { notes: 'kept' } } };
  const yes = decidePair(before, asked[0], 'yes');
  assert.deepEqual(yes.components.cardTile.bindings, { Label: { attribute: 'label' }, Content: { attribute: 'contentList' } });
  assert.deepEqual(yes.components.other, { notes: 'kept' });
  const no = decidePair(before, asked[0], 'no');
  assert.deepEqual(no.components.cardTile.declinedPairs, { Content: 'contentList' });
  assert.deepEqual(no.components.cardTile.bindings, { Label: { attribute: 'label' } });
  // A yes after a no takes the no back.
  assert.equal(decidePair(no, asked[0], 'yes').components.cardTile.declinedPairs, undefined);
  assert.throws(() => decidePair(before, asked[0], 'maybe'));
});

test('--prop-pairs lists them; a yes pairs them in the next contract, a no is never asked again', { timeout: budget(240000) }, async () => {
  const dir = makeFixture(files());
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  await generateContracts(dir, cfg, { force: true });
  const props = Object.fromEntries(contractOf(dir).props.map((p) => [p.name, p]));
  assert.deepEqual([props.Content.suggestion, props.Tone.suggestion, props.Size.suggestion], ['contentList', 'toneKind', 'sizeName']);

  let r = cli(dir, '--prop-pairs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 pairs the engine suggests/);
  assert.match(r.stdout, /cardTile: Figma's "Content" is the code's "contentList"\?\n\s+yes: rms-design-system-engine --prop-pair cardTile Content yes/);

  r = cli(dir, '--prop-pair', 'cardTile', 'Content', 'yes');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = cli(dir, '--prop-pair', 'cardTile', 'Tone', 'yes');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = cli(dir, '--prop-pair', 'cardTile', 'Size', 'no');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Figma's Size is not the code's sizeName/);
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8')).components.cardTile;
  assert.deepEqual(authored.bindings, { Content: { attribute: 'contentList' }, Tone: { attribute: 'toneKind' } });
  assert.deepEqual(authored.declinedPairs, { Size: 'sizeName' });

  // The contract built after the answers: the pairs with the code prop's facts, its values mapped; the no left apart.
  const c = contractOf(dir), by = Object.fromEntries(c.props.map((p) => [p.name, p]));
  assert.deepEqual([by.Content.bindings.code.prop, by.Content.bindings.code.source, by.Content.bindings.code.description], ['contentList', 'authored', 'the lines the tile lists']);
  assert.deepEqual(by.Tone.bindings.code.valueMap, { Calm: 'calm', Loud: 'loud' });
  assert.equal(by.Size.bindings.code, null);
  assert.equal(by.Size.suggestion, undefined, 'a no is not suggested again');
  assert.deepEqual(c.codeOnly.map((x) => x.name), ['sizeName']);

  r = cli(dir, '--prop-pairs');
  assert.match(r.stdout, /No pair to decide/);
  r = cli(dir, '--prop-pair', 'cardTile', 'Size', 'yes');
  assert.equal(r.status, 2, 'a pair nobody is asked about any more is not answered');
});

test('style guide: the component\'s page asks each pair, with the two decisions to copy', { timeout: budget(240000) }, async () => {
  const dir = makeFixture(files());
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  await generateContracts(dir, cfg, { force: true });
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, styleguide: { bakeA11y: false } }));
  const r = cli(dir, '--styleguide', '--no-a11y-bake');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { readPage } = await import('../styleguide-files.mjs');
  const html = readPage(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'));
  const data = JSON.parse(/<script[^>]*\bid="sg-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  const tile = data.components.find((x) => x.name === 'cardTile');
  assert.deepEqual(tile.pairAsks.map((x) => [x.figma, x.code, x.yes]), [['Content', 'contentList', 'rms-design-system-engine --prop-pair cardTile Content yes'], ['Size', 'sizeName', 'rms-design-system-engine --prop-pair cardTile Size yes'], ['Tone', 'toneKind', 'rms-design-system-engine --prop-pair cardTile Tone yes']]);
  assert.match(html, /data-pair-copy/, 'the page draws the decisions to copy');
});
