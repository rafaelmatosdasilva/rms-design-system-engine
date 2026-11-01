// The specs view checked against the format: every spec the demo builds validates against a schema written from the
// format's published types (test/fixtures/component-spec.schema.json), each kind of prop matching exactly one kind, and
// the schema refuses the mistakes the view once made. Its metadata names the Figma page and node from the capture, and
// --contracts-out publishes the view beside the contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specOf } from '../contract-spec.mjs';
import { generateContracts } from '../contract-gen.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA = JSON.parse(readFileSync(join(ENGINE, 'test', 'fixtures', 'component-spec.schema.json'), 'utf8'));

// The JSON Schema keywords the schema uses (draft-07), no dependency. → the errors, each with where it is.
function validate(schema, value, root = schema, at = '$') {
  if (schema === true || schema == null) return [];
  if (schema === false) return [`${at}: not allowed`];
  const errs = [];
  const typeOk = (t, v) => (t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t);
  if (schema.$ref) errs.push(...validate(schema.$ref.slice(2).split('/').reduce((o, k) => o?.[k], root), value, root, at));
  if (schema.type && ![schema.type].flat().some((t) => typeOk(t, value))) return [...errs, `${at}: not ${[schema.type].flat().join(' or ')}`];
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errs.push(`${at}: not ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))) errs.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errs.push(`${at}: does not match ${schema.pattern}`);
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) errs.push(`${at}: below ${schema.minimum}`);
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, root, `${at}[${i}]`)));
  if (typeOk('object', value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${at}: ${k} is missing`);
    for (const [k, v] of Object.entries(value)) {
      let known = false;
      if (schema.properties && k in schema.properties) { known = true; errs.push(...validate(schema.properties[k], v, root, `${at}.${k}`)); }
      for (const [re, sub] of Object.entries(schema.patternProperties ?? {})) if (new RegExp(re, 'u').test(k)) { known = true; errs.push(...validate(sub, v, root, `${at}.${k}`)); }
      if (!known && schema.additionalProperties !== undefined) errs.push(...validate(schema.additionalProperties, v, root, `${at}.${k}`));
    }
  }
  if (schema.oneOf) { const n = schema.oneOf.filter((sub) => !validate(sub, value, root, at).length).length; if (n !== 1) errs.push(`${at}: matches ${n} of its kinds, not one`); }
  if (schema.not && !validate(schema.not, value, root, at).length) errs.push(`${at}: matches what it must not`);
  return errs;
}

// The demo, with the page each Figma component is on (as a capture reads it), built once.
async function demoSpecs() {
  const root = tempDir('acme-spec-schema-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), root, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  const snap = join(root, cfg.paths.compPropsSnapshot);
  const props = JSON.parse(readFileSync(snap, 'utf8'));
  for (const [k, e] of Object.entries(props)) if (!k.startsWith('_') && e?.nodeId) e.pageId = '0:1';
  writeFileSync(snap, JSON.stringify(props, null, 2));
  return { root, cfg, r: await generateContracts(root, cfg, { force: true }) };
}

test('every spec the demo builds validates against the format, its metadata naming the Figma page and node', async () => {
  const { r } = await demoSpecs();
  const files = readdirSync(join(r.specsOut, 'components'));
  assert.ok(files.length >= 3, files.join(', '));
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(r.specsOut, 'components', f), 'utf8'));
    assert.deepEqual(validate(SCHEMA, spec), [], f);
    assert.equal(spec.metadata.source.pageId, '0:1', f);
    assert.match(spec.metadata.source.nodeId, /^\d+:\d+$/, f);
  }
  const contract = JSON.parse(readFileSync(join(r.outDir, 'button.contract.json'), 'utf8'));
  assert.equal(contract.source.figma.pageId, '0:1', 'the contract carries the page from the capture');
});

test('the schema refuses what the view once wrote: a text that reads as two kinds, a Figma slot as a type, metadata with no page', () => {
  const base = { title: 'cardTile', anatomy: { root: { type: 'container' } }, default: { elements: { root: {} } } };
  assert.deepEqual(validate(SCHEMA, base), []);
  const twoKinds = { ...base, props: { note: { type: 'string', $extensions: { 'com.figma': { type: 'TEXT', name: 'Note' } } } } };
  assert.match(validate(SCHEMA, twoKinds).join('\n'), /\$\.props\.note: matches 2 of its kinds/);
  const slotType = { ...base, props: { content: { type: 'slot', $extensions: { 'com.figma': { type: 'SLOT', name: 'Content' } } } } };
  assert.match(validate(SCHEMA, slotType).join('\n'), /\$\.props\.content/);
  assert.match(validate(SCHEMA, { ...base, metadata: { source: { nodeId: '1:2', nodeType: 'COMPONENT' } } }).join('\n'), /pageId is missing/);
  assert.match(validate(SCHEMA, { ...base, extra: 1 }).join('\n'), /\$\.extra: not allowed/);
  // The view now writes each of them the way the format reads it.
  const { spec, left } = specOf({ name: 'cardTile', figmaNodeId: '1:2', props: [
    { name: 'Note', type: 'text', bindings: { figma: { kind: 'TEXT' }, code: null } },
    { name: 'Content', type: 'children', bindings: { figma: { kind: 'SLOT' }, code: { slot: 'default', as: 'defaultSlot' } } },
  ], codeOnly: [{ name: 'hint', type: 'string' }] });
  assert.deepEqual(validate(SCHEMA, spec), []);
  assert.equal(spec.props.note.default, null, 'a text with no example: no default, so one kind');
  assert.deepEqual(spec.props.content.$extensions['com.figma'], { name: 'Content' });
  assert.equal(spec.metadata, undefined, 'no page read: no metadata, and it says why');
  assert.ok(left.some((l) => /^metadata: the contract holds no Figma page/.test(l)));
});

test('a set of variants and a single component: the node type the metadata says', () => {
  const one = specOf({ name: 'tileOne', props: [], source: { figma: { nodeId: '3:4', pageId: '0:9' } } }).spec;
  assert.deepEqual(one.metadata, { source: { pageId: '0:9', nodeId: '3:4', nodeType: 'COMPONENT' } });
  const set = specOf({ name: 'tileOne', props: [{ name: 'Size', type: 'enum', options: ['S', 'M'], default: 'S', bindings: { figma: { kind: 'VARIANT', default: 'S' }, code: null } }], source: { figma: { nodeId: '3:4', pageId: '0:9' } } }).spec;
  assert.equal(set.metadata.source.nodeType, 'COMPONENT_SET');
  assert.equal(Object.keys(set)[0], 'metadata');
});

test('--contracts-out publishes the specs view beside the contracts, each spec linking its published contract', async () => {
  const { root, cfg } = await demoSpecs();
  const pub = join(root, 'shared', 'contracts');
  const r = await generateContracts(root, cfg, { publishTo: 'shared/contracts', force: true });
  assert.equal(r.specsOut, join(pub, 'specs'));
  const index = JSON.parse(readFileSync(join(pub, 'specs', 'index.json'), 'utf8'));
  assert.deepEqual(index.components.map((x) => x.name).sort(), [...r.components].sort());
  for (const c of index.components) {
    assert.ok(existsSync(join(pub, 'specs', c.spec)), c.spec);
    assert.ok(existsSync(join(pub, 'specs', c.contract)), `${c.contract}: the published contract it links`);
    assert.deepEqual(validate(SCHEMA, JSON.parse(readFileSync(join(pub, 'specs', c.spec), 'utf8'))), [], c.spec);
  }
  assert.match(readFileSync(join(pub, 'README.md'), 'utf8'), /\[specs\/\]\(specs\/index\.json\)/);
});
