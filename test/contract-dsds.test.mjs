// The component contracts viewed in DSDS 0.23 (contract-dsds.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dsdsEntry, dsdsDocuments, dsdsId, DSDS_VERSION } from '../contract-dsds.mjs';

const contract = {
  id: 'acme.buttonPrimary', name: 'buttonPrimary', description: 'The one main action of a view.',
  figmaNodeId: '12:34',
  status: { state: 'deprecated', supersededBy: 'button', rationale: 'one button with a variant' },
  props: [
    { name: 'size', type: 'enum', default: 'm', options: ['s', 'm', 'l'] },
    { name: 'disabled', type: 'boolean', default: false },
    { name: 'label', type: 'string', default: 'Save' },
  ],
  states: [{ name: 'hover', selector: ':hover' }, { name: 'disabled' }],
  relationships: { composesWith: ['iconBase'], neverCombineWith: ['buttonDanger'] },
  useInstead: ['linkInline'],
  whenNotToUse: 'For navigation: use a link.',
  kept: [{ what: 'corner radius', truth: 'code', reason: 'the product rounds every control the same' }],
  intent: { source: 'https://git.acme.test/ds/-/blob/main/button.md', whenToUse: ['the team\'s words'] },
  source: { figma: { file: 'KEY', nodeId: '12:34', name: 'buttonPrimary' }, code: { file: 'src/components/ButtonPrimary.vue' } },
};

test('a contract as a DSDS component entry: the engine\'s facts, and links for what DSDS keeps elsewhere', () => {
  const e = dsdsEntry(contract, { file: '../ButtonPrimary.contract.json' });
  assert.equal(e.id, 'button-primary');
  assert.equal(e.kind, 'component');
  assert.equal(e.description, 'The one main action of a view.');
  assert.deepEqual(e.metadata, { status: { status: 'deprecated', note: 'one button with a variant' } });
  assert.deepEqual(e.uses, [{ to: 'icon-base' }]);
  assert.deepEqual(e.alternatives, [{ to: 'link-inline' }, { to: 'button' }], 'what to use instead, and what superseded it');
  assert.deepEqual(e.sourceFiles, [{ platform: 'vue', file: 'src/components/ButtonPrimary.vue' }]);
  assert.deepEqual(e.specs, [{ href: '../ButtonPrimary.contract.json', role: 'DS Contracts' }]);
  assert.deepEqual(e.refs.map((r) => r.rel), ['figma', 'documentation']);
  assert.equal(e.refs[0].href, 'https://www.figma.com/design/KEY?node-id=12-34');
  assert.equal(e.refs[1].href, contract.intent.source);
  // The team's page is linked, its words never copied back into a second place.
  assert.doesNotMatch(JSON.stringify(e), /the team's words/);
  const g = e.sections[0];
  assert.equal(g.kind, 'guidelines');
  assert.deepEqual(g.items.map((i) => i.level), ['should-not', 'must-not', 'should']);
  assert.match(g.items[2].statement, /corner radius: follow the code, because the product rounds/);
  // Variants with their values, booleans, states; a text prop is not a trait.
  assert.deepEqual(e.traits.map((t) => [t.traitType, t.kind, t.id]), [['variant', 'enum', 'size'], ['variant', 'boolean', 'disabled'], ['state', 'boolean', 'hover']]);
  assert.deepEqual(e.traits[0].values, ['s', 'm', 'l']);
  assert.equal(e.$extensions['rms-design-system-engine'].generated, true);
});

test('a contract that says little gives an entry with only what DSDS requires', () => {
  const e = dsdsEntry({ id: 'acme.avatar', name: 'avatar', description: 'avatar — captured from Figma by rms-design-system-engine.', props: [], states: [] });
  assert.deepEqual(Object.keys(e).sort(), ['$extensions', 'description', 'id', 'kind', 'name']);
  assert.equal(e.description, '', 'the placeholder is not a description');
  // A Figma variant of False and True is a boolean.
  const t = dsdsEntry({ name: 'chip', props: [{ name: 'Icon', type: 'enum', default: 'False', options: ['False', 'True'] }] }).traits[0];
  assert.deepEqual([t.kind, t.description, 'values' in t], ['boolean', "chip's Icon, off unless set.", false]);
});

test('the documents: an index that refers to one file per component, every one DSDS 0.23', () => {
  const docs = dsdsDocuments([
    { name: 'buttonPrimary', contract, file: 'buttons/ButtonPrimary.contract.json' },
    { name: 'button_primary', contract: { ...contract, name: 'button_primary' }, file: 'x.contract.json' },
    { name: 'avatar', contract: { id: 'acme.avatar', name: 'avatar', description: 'A person.' }, file: 'Avatar.contract.json' },
  ], { system: 'Acme' });
  assert.deepEqual(docs.map((d) => d.rel), ['system.dsds.json', 'components/button-primary.dsds.json', 'components/avatar.dsds.json'], 'two contracts making one id: the first kept');
  for (const { doc } of docs) { assert.equal(doc.schemaVersion, DSDS_VERSION); assert.equal(doc.name, 'Acme'); assert.ok(doc.entries.length >= 1); }
  assert.deepEqual(docs[0].doc.refs, [{ href: 'components/button-primary.dsds.json', rel: 'entry' }, { href: 'components/avatar.dsds.json', rel: 'entry' }]);
  assert.equal(docs[0].doc.entries[0].kind, 'system');
  assert.equal(docs[1].doc.entries[0].specs[0].href, '../../buttons/ButtonPrimary.contract.json', 'from dsds/components/ up to the contract');
  assert.equal(dsdsId('table/row'), 'table-row');
});
