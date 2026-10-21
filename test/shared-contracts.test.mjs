// The contracts a team keeps in its intent layer (published with --contracts-out), read back by the sync: each one's
// link and what it lists, found for a component by its name, a name it is also drawn as, or its code file; and whether
// it still says what the code and Figma say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractSummaries, sharedContractFor, contractDrift } from '../shared-contracts.mjs';

const published = {
  schemaVersion: 1, id: 'tileOne', name: 'tileOne', version: '1.0.0', anatomy: { root: {} },
  source: { figma: { nodeId: '1:2', name: 'tileOne', alsoDrawnAs: [{ name: 'tileOneQuiet', nodeId: '1:3' }] }, code: { file: 'src/kit/tiles/One.vue' } },
  props: [
    { name: 'captionWords', bindings: { figma: { kind: 'TEXT', property: 'captionWords' }, code: { prop: 'caption', as: 'prop', source: 'codeConnect' } } },
    { name: 'revealCaption', bindings: { figma: { kind: 'BOOLEAN', property: 'revealCaption' }, code: null }, conditions: [{ code: 'caption', role: 'condition' }] },
    { name: 'title', bindings: { figma: { kind: 'TEXT', property: 'title' }, code: { prop: 'opts', key: 'title', as: 'prop', source: 'codeConnect' } } },
  ],
  codeOnly: [{ name: 'opts', type: 'object', setBy: ['title'] }, { name: 'pinned', type: 'boolean' }],
  events: [{ name: 'picked', payload: ['id'] }], codeSlots: [{ name: 'default' }, { name: 'badge' }],
};
const older = { name: 'listRow', names: ['listRow'], vueSource: 'src/kit/lists/Row.vue', props: [{ name: 'label' }], emits: ['clicked'], slots: [], figma: [{ properties: [{ name: 'labelWords' }] }] };

test('each contract kept in the layer is summarised with its link; the engine\'s format and any other are told apart', () => {
  const files = new Map([['specs/contracts/components/tiles/one.contract.json', published], ['specs/contracts/components/lists/row.contract.json', older], ['specs/dsds/x.dsds.json', { name: 'not a contract' }]]);
  const list = contractSummaries(files, (f) => `https://git.example/kit/-/blob/main/${f}`);
  assert.deepEqual(list.map((c) => [c.name, c.format]), [['listRow', 'older'], ['tileOne', 1]]);
  const one = list.find((c) => c.name === 'tileOne');
  assert.equal(one.url, 'https://git.example/kit/-/blob/main/specs/contracts/components/tiles/one.contract.json');
  assert.deepEqual(one.props, ['caption', 'opts', 'pinned'], 'a key of an object prop is the object, listed once');
  assert.deepEqual([one.events, one.slots, one.figma], [['picked'], ['default', 'badge'], ['captionWords', 'revealCaption', 'title']]);
  assert.equal(sharedContractFor(list, 'tileOneQuiet'), one, 'a name it is also drawn as');
  assert.equal(sharedContractFor(list, 'renamedTile', 'src/kit/tiles/One.vue'), one, 'its code file');
  assert.equal(sharedContractFor(list, 'nothing', 'src/kit/Other.vue'), null);
});

test('drift: what the code or Figma has that it does not list, and what it lists that is gone; an older format says so', () => {
  const [one] = contractSummaries(new Map([['c/one.contract.json', published]]));
  const now = { codeProps: ['caption', 'opts', 'pinned'], events: ['picked'], slots: ['default', 'badge'], figmaProps: ['captionWords#1:2', 'revealCaption', 'title'] };
  assert.deepEqual(contractDrift(one, now), [], 'the same: no drift (a Figma key\'s #id aside)');
  assert.deepEqual(contractDrift(one, { ...now, codeProps: ['caption', 'opts', 'tone'], figmaProps: null }), [
    'the code has props it does not list: tone',
    'it lists props the code no longer has: pinned',
  ]);
  const [old] = contractSummaries(new Map([['c/row.contract.json', older]]));
  assert.match(contractDrift(old, now)[0], /older format/);
});
