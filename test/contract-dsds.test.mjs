// The component contracts viewed in DSDS (contract-dsds.mjs), and every document it writes checked against DSDS's own
// published schema for the pinned version (fetched into test/.dsds/ by lib/dsds-release.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dsdsEntry, dsdsDocuments, dsdsId, dsdsApiId, DSDS_VERSION, DSDS_EXT } from '../lib/contract-dsds.mjs';
import { validate } from '../lib/json-schema.mjs';
import { SAMPLE, fixtureDir } from '../lib/dsds-release.mjs';

const SCHEMA = JSON.parse(readFileSync(join(fixtureDir(), 'dsds.bundled.schema.json'), 'utf8'));
const errorsOf = (doc) => validate(SCHEMA, doc).errors.map((e) => `${e.at} ${e.message}`);

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
  // Deprecated, as DSDS requires it: why (deprecationNotice), and what replaces it, on the status itself (replacedBy).
  assert.deepEqual(e.metadata, { status: { status: 'deprecated', deprecationNotice: 'one button with a variant', replacedBy: [{ to: 'button' }] } });
  assert.deepEqual(e.uses, [{ to: 'icon-base' }]);
  assert.deepEqual(e.alternatives, [{ to: 'link-inline' }], 'what to use instead; the replacement is written once, on the status');
  assert.deepEqual(e.sourceFiles, [{ platform: 'vue', file: 'src/components/ButtonPrimary.vue' }]);
  assert.deepEqual(e.specs, [{ href: '../ButtonPrimary.contract.json', role: 'DS Contracts' }]);
  assert.deepEqual(e.refs.map((r) => r.rel), ['design', 'relates-to'], 'rels DSDS names');
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
  assert.deepEqual(e.traits[0].values.map((v) => v.id), ['s', 'm', 'l'], 'each value an object of its own');
  assert.match(e.traits[0].values[1].description, /size m, the default/);
  assert.equal(e.$extensions[DSDS_EXT].generated, true);
  assert.match(DSDS_EXT, /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, 'a namespaced key, as DSDS asks');
});

test('a contract that says little gives an entry with only what DSDS requires', () => {
  const e = dsdsEntry({ id: 'acme.avatar', name: 'avatar', description: 'avatar — captured from Figma by rms-design-system-engine.', props: [], states: [] });
  assert.deepEqual(Object.keys(e).sort(), ['$extensions', 'description', 'id', 'kind', 'name']);
  assert.equal(e.description, '', 'the placeholder is not a description');
  // A Figma variant of False and True is a boolean.
  const t = dsdsEntry({ name: 'chip', props: [{ name: 'Icon', type: 'enum', default: 'False', options: ['False', 'True'] }] }).traits[0];
  assert.deepEqual([t.kind, t.description, 'values' in t], ['boolean', "chip's Icon, off unless set.", false]);
});

test('the documents: an index that refers to one file per component, every one in the pinned version', () => {
  const docs = dsdsDocuments([
    { name: 'buttonPrimary', contract, file: 'buttons/ButtonPrimary.contract.json' },
    { name: 'button_primary', contract: { ...contract, name: 'button_primary' }, file: 'x.contract.json' },
    { name: 'avatar', contract: { id: 'acme.avatar', name: 'avatar', description: 'A person.' }, file: 'Avatar.contract.json' },
  ], { system: 'Acme' });
  assert.deepEqual(docs.map((d) => d.rel), ['system.dsds.json', 'components/button-primary.dsds.json', 'components/avatar.dsds.json'], 'two contracts making one id: the first kept');
  for (const { doc } of docs) { assert.equal(doc.schemaVersion, DSDS_VERSION); assert.equal(doc.name, 'Acme'); assert.ok(doc.entries.length >= 1); }
  assert.deepEqual(docs[0].doc.refs, [{ href: 'components/button-primary.dsds.json', rel: 'file' }, { href: 'components/avatar.dsds.json', rel: 'file' }]);
  assert.equal(docs[0].doc.entries[0].kind, 'system');
  assert.equal(docs[1].doc.entries[0].specs[0].href, '../../buttons/ButtonPrimary.contract.json', 'from dsds/components/ up to the contract');
  assert.equal(dsdsId('table/row'), 'table-row');
});

test('every document the view writes passes DSDS\'s own schema for the pinned version', () => {
  const docs = dsdsDocuments([{ name: 'buttonPrimary', contract, file: 'ButtonPrimary.contract.json' }, ...SAMPLE], { system: 'Acme' });
  for (const { rel, doc } of docs) assert.deepEqual(errorsOf(doc), [], rel);
});

test('what DSDS rejects, the view never writes: each fault it used to have, caught by the schema', () => {
  const [, { doc }] = dsdsDocuments([{ name: 'buttonPrimary', contract, file: 'B.contract.json' }], { system: 'Acme' });
  const broken = (change) => { const d = structuredClone(doc); change(d.entries[0], d); return errorsOf(d); };
  assert.ok(broken((e) => { e.metadata.status = { status: 'deprecated', note: 'why' }; }).some((m) => /deprecationNotice/.test(m)), 'a deprecation with no notice');
  assert.ok(broken((e) => { e.refs[0].rel = 'figma'; }).length, 'a rel DSDS does not name');
  assert.ok(broken((e) => { e.traits[0].values = ['s', 'm']; }).length, 'enum values as bare strings');
  assert.ok(broken((e) => { e.$extensions = { 'rms-design-system-engine': {} }; }).length, 'an extension key with no namespace');
  assert.ok(broken((e, d) => { d.refs = [{ href: 'x.dsds.json', rel: 'entry' }]; }).length, 'an index ref with a rel DSDS does not name');
});

test('a name DSDS would refuse as an id is written in the form it allows, its words kept', () => {
  assert.equal(dsdsApiId('Show icon'), 'Show-icon');
  assert.equal(dsdsApiId('size.small'), 'size-small');
  const e = dsdsEntry({ name: 'chip', props: [{ name: 'Show icon', type: 'boolean' }, { name: 'Tone', type: 'enum', options: ['Primary Brand', 'Neutral'] }] });
  assert.deepEqual(e.traits.map((t) => t.id), ['Show-icon', 'Tone']);
  assert.deepEqual(e.traits[1].values.map((v) => [v.id, v.name ?? null]), [['Primary-Brand', 'Primary Brand'], ['Neutral', null]], 'the name as Figma writes it kept beside the id');
  assert.deepEqual(errorsOf({ schemaVersion: DSDS_VERSION, name: 'x', entries: [e] }), []);
});

test('the contract\'s own guidance says how each rule is held: never together is the edit check\'s, when not to use it a person\'s', async () => {
  const { dsdsEntry } = await import('../lib/contract-dsds.mjs');
  const items = dsdsEntry({ name: 'card', whenNotToUse: 'For a table row.', relationships: { neverCombineWith: ['modal'] }, kept: [{ what: 'radius', truth: 'code', reason: 'the product asked' }] }).sections[0].items;
  assert.deepEqual(items.map((i) => [i.level, i.checkedBy, i.checks?.[0]?.role ?? null]), [['should-not', 'manual', null], ['must-not', 'automated', 'lint'], ['should', 'automated', 'test']]);
  for (const i of items) if (i.checkedBy === 'automated') assert.ok(i.checks?.[0]?.href, 'DSDS-03: automated points at its check');
});
