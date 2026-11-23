import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { a2uiVersion, a2uiCatalog, a2uiMessages, versionMismatch, unfitNames, A2UI_VERSIONS } from '../lib/a2ui-catalog.mjs';
import { checkUi } from '../lib/ui-catalog.mjs';
import { makeFixture } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = { components: {
  Button: { description: 'Starts an action.', props: { Variant: { type: 'enum', values: ['primary', 'secondary'], default: 'primary', codeName: 'variant' }, Label: { type: 'text', codeName: 'label' }, Disabled: { type: 'enum', values: ['False', 'True'], default: 'False', codeName: 'disabled' } } },
  Card: { description: 'Holds related content.', props: { Content: { type: 'children' }, 'Show Icon': { type: 'boolean' } }, children: ['Button'] },
  OldChip: { status: 'deprecated', useInstead: ['Button'], props: {} },
  Gone: { status: 'removed', props: {} },
  'Text Field': { props: {} },
} };

test('the version is the one the team declares, never a guess, and one whose shape is not published is said', () => {
  assert.equal(a2uiVersion({}), null);
  assert.deepEqual(a2uiVersion({ a2ui: { version: '1.0' } }, 'Acme UI'), { version: '1.0', catalogId: 'urn:acme-ui:a2ui-catalog:1.0', declaredId: false });
  assert.equal(a2uiVersion({ a2ui: 'v0.9.1' }).version, '0.9');
  assert.equal(a2uiVersion({ a2ui: { version: '0.9', catalogId: 'https://example.com/a2ui/catalog.json' } }).catalogId, 'https://example.com/a2ui/catalog.json');
  assert.match(a2uiVersion({ a2ui: { version: '0.8' } }).error, /0\.8 is not one the engine writes/);
  assert.match(a2uiVersion({ a2ui: {} }).error, /names no version/);
  assert.deepEqual(A2UI_VERSIONS, { '0.9': '0.9.1', '1.0': '1.0' });
});

test('the catalog holds the system\'s real components with their allowed values, under the names the code takes', () => {
  const doc = a2uiCatalog(catalog, { version: '1.0', catalogId: 'urn:acme:a2ui-catalog:1.0', title: 'Acme' });
  assert.equal(doc.catalogId, doc.$id);
  assert.equal(doc.protocolVersion, '1.0');
  assert.deepEqual(Object.keys(doc).filter((k) => !['$schema', '$id', 'protocolVersion', 'title', 'description', 'catalogId', 'components'].includes(k)), []);
  assert.deepEqual(Object.keys(doc.components), ['Button', 'Card', 'OldChip']);
  const b = doc.components.Button;
  assert.deepEqual(b.properties.component, { const: 'Button' });
  assert.deepEqual(b.required, ['component']);
  assert.deepEqual(b.properties.variant, { type: 'string', enum: ['primary', 'secondary'], default: 'primary' });
  assert.deepEqual(b.properties.label, { type: 'string' });
  assert.deepEqual(b.properties.disabled, { type: 'boolean', default: false });
  assert.equal(b.unevaluatedProperties, false);
  assert.deepEqual(doc.components.Card.properties.children.$ref, 'common_types.json#/$defs/ChildList');
  assert.ok(!('Show Icon' in doc.components.Card.properties));
  assert.match(doc.components.OldChip.description, /deprecated: use Button/);
  assert.deepEqual(unfitNames(catalog), ['Card.Show Icon', 'Text Field']);
  assert.ok(!('protocolVersion' in a2uiCatalog(catalog, { version: '0.9', catalogId: 'x' })));
});

test('A2UI\'s messages are read as the generated UI: one, a list or a stream, later ids replacing earlier ones', () => {
  const msgs = [
    { version: '1.0', createSurface: { surfaceId: 's1', catalogId: 'urn:acme:a2ui-catalog:1.0' } },
    { version: '1.0', updateComponents: { surfaceId: 's1', components: [{ id: 'root', component: 'Card', children: ['go', 'more'] }, { id: 'go', component: 'Button', label: 'Go', variant: 'loud' }] } },
    { version: '1.0', updateComponents: { surfaceId: 's1', components: [{ id: 'go', component: 'Button', label: { path: '/cta' }, variant: 'primary', action: { event: { name: 'go' } } }, { id: 'more', component: 'Button', child: 'gone' }] } },
  ];
  const sent = a2uiMessages(msgs);
  assert.equal(sent.messages, 2);
  assert.deepEqual(sent.versions, ['1.0']);
  assert.equal(a2uiMessages({ root: 'a', components: [] }), null);
  const r = checkUi(msgs, catalog);
  const said = r.findings.map((f) => f.message);
  // The later "go" replaced the one with a wrong variant, its words bound to the data model and its action A2UI's own.
  assert.ok(!said.some((m) => /loud|label|action/.test(m)), said.join(' | '));
  assert.ok(said.some((m) => /child "gone" does not exist/.test(m)), said.join(' | '));
  assert.deepEqual(r.a2ui, { versions: ['1.0'], surfaces: ['s1'], messages: 2 });
  const noRoot = checkUi({ version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'top', component: 'Card' }] } }, catalog);
  assert.ok(noRoot.findings.some((f) => /no component has the id "root"/.test(f.message)));
  const template = checkUi({ version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Card', children: { path: '/items', componentId: 'item' } }, { id: 'item', component: 'Button' }] } }, catalog);
  assert.ok(template.ok, JSON.stringify(template.findings));
  assert.equal(versionMismatch(['1.0'], '1.0'), null);
  assert.equal(versionMismatch(['v0.9.1'], '0.9'), null);
  assert.match(versionMismatch(['0.9.1'], '1.0'), /say A2UI 0\.9\.1, and the team declared 1\.0/);
});

test('--check-ui reads an A2UI stream and holds it to the declared version', () => {
  const dir = makeFixture({
    'ds-config.json': { a2ui: { version: '1.0' } },
    'contracts/catalog.json': catalog,
  });
  const stream = [
    { version: '0.9.1', updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Card', children: ['b'] }] } },
    { version: '0.9.1', updateComponents: { surfaceId: 's', components: [{ id: 'b', component: 'Button', variant: 'primary' }] } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  writeFileSync(join(dir, 'out.jsonl'), stream);
  const r = spawnSync(process.execPath, [join(HERE, '..', 'lib', 'ui-check.mjs'), 'out.jsonl'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.match(r.stdout, /A2UI, 2 updateComponents message\(s\)/);
  assert.match(r.stdout, /the messages say A2UI 0\.9\.1, and the team declared 1\.0/);
  assert.equal(r.status, 1);
  writeFileSync(join(dir, 'out.jsonl'), stream.replaceAll('"0.9.1"', '"1.0"'));
  const ok = spawnSync(process.execPath, [join(HERE, '..', 'lib', 'ui-check.mjs'), 'out.jsonl'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(ok.status, 0, ok.stdout);
});

test('the contracts write the A2UI catalog only for a declared version, beside catalog.json', async () => {
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  const files = {
    'theme.css': ':root{}\n',
    'vars.json': { color: { light: { 'buttonPrimary/background/color': '#0a84ff' } }, sizing: {}, typography: {} },
    'struct.json': { components: { buttonPrimary: { nodeId: '1:1', h: 24 } } },
    'props.json': { buttonPrimary: { nodeId: '1:1', properties: { 'disabled': { type: 'VARIANT', defaultValue: 'false', variantOptions: ['false', 'true'] }, 'size': { type: 'VARIANT', defaultValue: 'm', variantOptions: ['s', 'm'] } }, annotations: [] } },
  };
  const cfg = { paths: { themeCSS: 'theme.css', snapshotVars: 'vars.json', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' }, figma: { modes: [{ name: 'Light', snapshotKey: 'light' }] } };
  const plain = makeFixture(files);
  const r0 = await generateContracts(plain, cfg, {});
  assert.equal(r0.a2uiOut, null);
  assert.ok(!existsSync(join(r0.outDir, 'a2ui-catalog.json')));
  const dir = makeFixture(files);
  const r = await generateContracts(dir, { ...cfg, name: 'Acme', a2ui: { version: '1.0' } }, {});
  assert.ok(r.a2uiOut, r.a2uiSaid);
  const doc = JSON.parse(readFileSync(r.a2uiOut, 'utf8'));
  assert.equal(doc.catalogId, 'urn:acme:a2ui-catalog:1.0');
  assert.deepEqual(doc.components.buttonPrimary.properties.size, { type: 'string', enum: ['s', 'm'], default: 'm' });
  assert.match(r.a2uiSaid, /A2UI 1\.0, catalogId urn:acme:a2ui-catalog:1\.0 \(ds-config\.json "a2ui\.catalogId" names your own\)/);
  const bad = await generateContracts(makeFixture(files), { ...cfg, a2ui: { version: '0.8' } }, {});
  assert.equal(bad.a2uiOut, null);
  assert.match(bad.a2uiSaid, /0\.8 is not one the engine writes/);
});
