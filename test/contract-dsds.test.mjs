// The whole system viewed in DSDS (contract-dsds.mjs), and every document it writes checked against DSDS's own published
// schema for each version it is written in (fetched into test/.dsds/ by lib/dsds-release.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dsdsEntry, dsdsDocuments, dsdsId, dsdsApiId, dsdsTokenId, dsdsVersionFor, uuidOf, uuidsFrom, DSDS_VERSION, DSDS_TRIED, DSDS_EXT } from '../lib/contract-dsds.mjs';
import { validate } from '../lib/json-schema.mjs';
import { SAMPLE, SAMPLE_SYSTEM, fixtureDir } from '../lib/dsds-release.mjs';

// The published schema of each version the view is written in (fetched by node lib/dsds-release.mjs fetch).
const SCHEMAS = Object.fromEntries(DSDS_TRIED.map((v) => [v, JSON.parse(readFileSync(join(fixtureDir(v), 'dsds.bundled.schema.json'), 'utf8'))]));
const SCHEMA = SCHEMAS[DSDS_VERSION];
const errorsOf = (doc, schema = SCHEMA) => validate(schema, doc).errors.map((e) => `${e.at} ${e.message}`);

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
  assert.deepEqual(Object.keys(e).sort(), ['$extensions', 'description', 'id', 'kind', 'name', 'uuid']);
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

test('every document the view writes passes DSDS\'s own schema, in each version it is written in', () => {
  // A component Figma has and the code does not yet, so the status per platform is tried too.
  const sheet = { name: 'sheet', file: 'Sheet.contract.json', contract: { id: 'acme.sheet', name: 'sheet', description: 'A panel from the edge.', source: { figma: { file: 'KEY', nodeId: '9:9' } } } };
  for (const version of DSDS_TRIED) {
    const docs = dsdsDocuments([{ name: 'buttonPrimary', contract, file: 'ButtonPrimary.contract.json' }, ...SAMPLE, sheet], { system: 'Acme', version, ...SAMPLE_SYSTEM });
    assert.deepEqual(docs.map((d) => d.rel.split('/')[0]).filter((x, i, a) => a.indexOf(x) === i), ['system.dsds.json', 'components', 'tokens.dsds.json', 'patterns'], 'every kind of document');
    for (const { rel, doc } of docs) {
      assert.equal(doc.schemaVersion, version, rel);
      assert.equal(doc.$schema, `https://designsystemdocspec.org/v${version}/dsds.bundled.yaml`);
      assert.deepEqual(errorsOf(doc, SCHEMAS[version]), [], `${version} ${rel}`);
    }
  }
});

test('the version the view is written in: the intent layer\'s when the engine has been tried against it, else the pinned one, said', () => {
  assert.deepEqual(dsdsVersionFor(null), { version: DSDS_VERSION, said: null });
  assert.deepEqual(dsdsVersionFor(DSDS_VERSION), { version: DSDS_VERSION, said: null });
  for (const v of DSDS_TRIED) assert.deepEqual(dsdsVersionFor(`v${v}`), { version: v, said: null }, v);
  const older = dsdsVersionFor('0.20.1');
  assert.equal(older.version, DSDS_VERSION);
  assert.match(older.said, /not been tried against \(it writes .*\): its view is written in DSDS .*, which tools made for 0\.20\.1 may not read/);
  const newer = dsdsVersionFor('9.0.0');
  assert.equal(newer.version, DSDS_VERSION);
  assert.match(newer.said, /newer than any the engine has been tried against/);
  assert.match(dsdsVersionFor('draft').said, /not a version/);
  for (const r of [older, newer]) assert.doesNotMatch(r.said, /;/, 'never a semicolon');
  // A version not tried is never written, whatever is asked.
  assert.equal(dsdsDocuments([], { version: '0.20.1' })[0].doc.schemaVersion, DSDS_VERSION);
  assert.ok(DSDS_TRIED.length >= 2 && DSDS_TRIED[0] === DSDS_VERSION, 'the pin first, then the older ones');
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

test('tokens and themes: each token points at its place in the DTCG file, its value never copied, and a mode is a theme', () => {
  const docs = dsdsDocuments(SAMPLE, { system: 'Sample', ...SAMPLE_SYSTEM });
  const file = docs.find((d) => d.rel === 'tokens.dsds.json').doc;
  const byId = Object.fromEntries(file.entries.map((e) => [e.id, e]));
  assert.deepEqual(Object.keys(byId), ['surface.page', 'text.primary', 'space.m', 'space.old', 'light', 'dark']);
  assert.equal(byId['text.primary'].source.href, '../tokens.json#/text/primary', 'a JSON Pointer into the DTCG file');
  assert.equal(byId['text.primary'].description, 'Body text.', 'the token\'s own description');
  assert.match(byId['space.m'].description, /dimension token space\/m/);
  assert.doesNotMatch(JSON.stringify(file), /#1b2433|16px/, 'no value is copied: DTCG holds them');
  assert.deepEqual(byId['space.old'].metadata.status, { status: 'deprecated', deprecationNotice: 'Use space.m instead.' });
  // The surfaces a text colour reads on, as a combo, and the one it was made for in its note.
  assert.deepEqual(byId['text.primary'].combos, [{ subject: '{text.primary}', level: 'should', items: ['{surface.page}'], note: 'Reads at 4.5:1 or more on each of these, in every mode, and was made for surface.page.' }]);
  // A mode a theme: the first is each token's own value, the next extends it.
  assert.equal(byId.light.colorScheme, 'light');
  assert.equal(byId.light.extends, undefined);
  assert.deepEqual(byId.dark.extends, [{ to: 'light' }]);
  assert.match(byId.dark.description, /2 tokens take another value here/);
  assert.match(byId.dark.source.note, /modes\["dark"\]/);
  // One mode is no theme, and a token id is a path DSDS allows.
  assert.ok(!dsdsDocuments(SAMPLE, { system: 'Sample', ...SAMPLE_SYSTEM, modes: [{ name: 'Light' }] }).find((d) => d.rel === 'tokens.dsds.json').doc.entries.some((e) => e.kind === 'theme'));
  assert.equal(dsdsTokenId(['Button', 'Text color', 'hover']), 'Button.Text-color.hover');
  // No tokens file named, no tokens written.
  assert.ok(!dsdsDocuments(SAMPLE, { system: 'Sample' }).some((d) => d.rel === 'tokens.dsds.json'));
});

test('a component points at the tokens it paints with, and only at those the view has', () => {
  const tokens = { button: { bg: { $type: 'color', $value: '#000' } } };
  const docs = dsdsDocuments([{ name: 'button', file: 'B.contract.json', contract: { name: 'button', tokens: { used: ['button/bg', 'gone/token'] } } }], { tokens, tokensHref: '../tokens.json' });
  assert.deepEqual(docs[1].doc.entries[0].uses, [{ to: 'button.bg' }]);
});

test('the intent layer\'s pages: one entry each, linking its page and naming the components it uses, its words left there', () => {
  const docs = dsdsDocuments(SAMPLE, { system: 'Sample', ...SAMPLE_SYSTEM, pages: [
    ...SAMPLE_SYSTEM.pages,
    { entity: { layer: 'foundations', name: 'Colour', file: 'foundations/colour.dsds.json', url: 'https://docs.example.com/colour', purpose: 'the team\'s words' } },
    { entity: { layer: 'patterns', name: 'Button', file: 'patterns/button.dsds.json' } },   // a component's id: left out
    { entity: { layer: 'components', name: 'Card', file: 'components/card.dsds.json' } },   // a component page is the contract's
  ] });
  const pages = docs.filter((d) => /^(patterns|flows|foundations)\//.test(d.rel));
  assert.deepEqual(pages.map((d) => d.rel), ['patterns/save.dsds.json', 'foundations/colour.dsds.json']);
  const save = pages[0].doc.entries[0];
  assert.equal(save.kind, 'entry');
  assert.deepEqual(save.uses, [{ to: 'button' }, { to: 'link' }]);
  assert.deepEqual(save.refs.map((r) => r.href), ['https://docs.example.com/patterns/save', '../../patterns/save.pattern.json']);
  assert.doesNotMatch(JSON.stringify(pages), /the team's words/, 'the page is linked, never copied');
  assert.deepEqual(docs[0].doc.refs.map((r) => r.href).filter((h) => !h.startsWith('components/')), ['tokens.dsds.json', 'patterns/save.dsds.json', 'foundations/colour.dsds.json'], 'the index refers to each file');
});

test('shared rules: how the system builds a component, each rule written once at the level it is held to', () => {
  const [index] = dsdsDocuments(SAMPLE, { system: 'Sample', ...SAMPLE_SYSTEM, construction: { ...SAMPLE_SYSTEM.construction, code: { rules: [{ id: 'story-values', says: 'Stories set only values a prop takes.', status: 'rule' }] } } });
  assert.deepEqual(index.doc.shared.map((x) => x.id), ['construction-figma', 'construction-code']);
  const items = index.doc.shared[0].sections[0].items;
  assert.deepEqual(items.map((i) => [i.id, i.level]), [['component-name-case', 'must'], ['no-hidden-layers', 'should']], 'a rule held is a must, one to fix a should, one to decide left out');
  assert.equal(items[0].statement, 'A component is named in camelCase.');
  assert.equal(items[0].checkedBy, 'automated');
  assert.match(items[0].checks[0].href, /docs\/audit\.md#a-rule-that-reached-zero-stays-at-zero$/);
  assert.match(items[1].checks[0].note, /3 of 4 components follow it/);
  assert.equal(index.doc.shared[1].sections[0].items[0].statement, 'Stories set only values a prop takes.', 'one full stop');
  assert.equal(dsdsDocuments(SAMPLE, { system: 'Sample' })[0].doc.shared, undefined, 'no construction, no shared rules');
});

test('what never goes together is a combo where the other has an entry, and a sentence where it has none', () => {
  const docs = dsdsDocuments([
    { name: 'card', file: 'C.contract.json', contract: { name: 'card', relationships: { neverCombineWith: ['modal', 'tooltipLegacy'], composesWith: ['modal', 'nowhere'] } } },
    { name: 'modal', file: 'M.contract.json', contract: { name: 'modal' } },
  ]);
  const card = docs[1].doc.entries[0];
  assert.deepEqual(card.combos, [{ subject: 'card', level: 'must-not', items: ['modal'], note: 'Never put card together with modal: the edit check\'s nesting rules hold it.' }]);
  assert.deepEqual(card.sections[0].items.map((i) => i.statement), ['Never put card together with tooltipLegacy.'], 'said once: the combo, or the sentence');
  assert.deepEqual(card.uses, [{ to: 'modal' }], 'a pointer only where it resolves');
});

test('the status on each platform: what Figma has and no code has yet is planned there, on the platforms the system declares', () => {
  const docs = dsdsDocuments([
    { name: 'button', file: 'B.contract.json', contract: { name: 'button', source: { code: { file: 'src/Button.tsx' } } } },
    { name: 'sheet', file: 'S.contract.json', contract: { name: 'sheet', status: { state: 'experimental' }, source: { figma: { nodeId: '1:2' } } } },
    { name: 'oldSheet', file: 'O.contract.json', contract: { name: 'oldSheet', status: { state: 'deprecated', supersededBy: 'sheet' }, source: { figma: { nodeId: '1:3' } } } },
  ]);
  assert.deepEqual(docs[0].doc.entries[0].metadata, { platforms: ['react'] }, 'the platforms each status names');
  assert.deepEqual(docs[2].doc.entries[0].metadata.status, [{ status: 'experimental' }, { platform: 'react', status: 'planned' }]);
  assert.equal(docs[3].doc.entries[0].metadata.status.status, 'deprecated', 'a deprecated one is never planned');
  assert.equal(docs[1].doc.entries[0].metadata, undefined, 'built, with no status: nothing to say');
  for (const { doc } of docs) assert.deepEqual(errorsOf(doc), []);
});

test('a uuid that survives a rename: made from the Figma node, the code file or the page, and kept from the view written before', () => {
  const one = { id: 'acme.button', name: 'button', source: { figma: { file: 'KEY', nodeId: '1:2' }, code: { file: 'src/Button.vue' } } };
  const renamed = { ...one, id: 'acme.action', name: 'action' };
  const a = dsdsEntry(one), b = dsdsEntry(renamed);
  assert.match(a.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(b.uuid, a.uuid, 'renamed in Figma and the code: its node is the same');
  assert.equal(a.uuid, uuidOf('figma:KEY/1:2'));
  // Moved to another Figma node, but its code file kept: the uuid written before is kept, by the key that still matches.
  const moved = { ...renamed, source: { figma: { file: 'KEY', nodeId: '7:7' }, code: { file: 'src/Button.vue' } } };
  assert.notEqual(dsdsEntry(moved).uuid, a.uuid);
  const previous = uuidsFrom(dsdsDocuments([{ name: 'button', contract: one, file: 'B.contract.json' }]));
  assert.equal(dsdsEntry(moved, { previous }).uuid, a.uuid);
  // A version before uuid keeps it under the engine's own key, so it is not lost.
  const old = dsdsEntry(one, { version: '0.22.0' });
  assert.equal(old.uuid, undefined);
  assert.equal(old.$extensions[DSDS_EXT].uuid, a.uuid);
  assert.equal(uuidsFrom([{ entries: [old] }]).get('code:src/Button.vue'), a.uuid, 'read back from an older version too');
});

test('a build writes the view in the version the intent layer declares, with its pages, and keeps each uuid from one build to the next', async () => {
  const { makeFixture } = await import('./helpers.mjs');
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  const { readdirSync } = await import('node:fs');
  const snapshot = (dsds) => JSON.stringify({ _source: {}, system: { name: 'Acme', dsds }, entities: [
    { kind: 'pattern', layer: 'patterns', name: 'Save', file: 'docs/patterns/save.dsds.json', url: 'https://docs.example.com/patterns/save', rules: [{ text: 'Use `Main` for the one action that saves.', level: 'must' }] },
  ] });
  const dir = makeFixture({
    'src/components/buttons/Main.vue': '<template>\n  <button class="acme-main-button" :disabled="disabled">{{ label }}</button>\n</template>\n<script>\nexport default { props: { label: { type: String, default: \'\' }, disabled: { type: Boolean, default: false } } };\n</script>\n',
    'src/styles/theme.css': ':root { --acme-space-m: 12px; }\n',
    'intent-layer.snapshot.json': snapshot('0.22.0'),
  });
  const cfg = { name: 'Acme', figmaFileKey: '', paths: { themeCSS: 'src/styles/theme.css' }, intentLayer: 'docs' };
  const r = await generateContracts(dir, cfg, {});
  assert.equal(r.dsdsCounts.version, '0.22.0');
  const out = join(dir, 'contracts', 'dsds');
  const read = (rel) => JSON.parse(readFileSync(join(out, rel), 'utf8'));
  const all = (d = out) => readdirSync(d, { withFileTypes: true }).flatMap((n) => (n.isDirectory() ? all(join(d, n.name)) : [join(d, n.name)]));
  for (const f of all()) {
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(doc.schemaVersion, '0.22.0', f);
    assert.deepEqual(errorsOf(doc, SCHEMAS['0.22.0']), [], f);
  }
  const save = read('patterns/save.dsds.json').entries[0];
  assert.deepEqual(save.uses, [{ to: 'main' }], 'the pattern names the component its page uses');
  assert.deepEqual(save.refs.map((x) => x.href), ['https://docs.example.com/patterns/save', '../../patterns/save.pattern.json']);
  assert.ok(existsSync(join(dir, 'contracts', 'patterns', 'save.pattern.json')), 'the contract it links is there');
  assert.equal(read('system.dsds.json').entries[0].metadata.sourceRoot, '../..', 'where the code is, from the view');
  const uuid = read('components/main.dsds.json').entries[0].$extensions[DSDS_EXT].uuid;
  assert.ok(uuid, '0.22.0 has no uuid field: kept under the engine\'s key');
  // The next build, in a version the engine has not been tried against: the pinned one, and the same uuid.
  writeFileSync(join(dir, 'intent-layer.snapshot.json'), snapshot('0.20.1'));
  const again = await generateContracts(dir, cfg, { force: true });
  assert.equal(again.dsdsCounts.version, DSDS_VERSION);
  assert.equal(read('components/main.dsds.json').entries[0].uuid, uuid);
});
