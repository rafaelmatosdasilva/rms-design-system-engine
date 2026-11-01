// The contracts in the open component specs format: anatomy, props with types, values and defaults, slots, and the styles
// of each part in the default and in each variant, as tokens. Only what the contract holds; the links in an index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specOf, specDocuments, specKey, SPEC_FORMAT } from '../lib/contract-spec.mjs';
import { stateTokens } from '../lib/contract-code.mjs';
import { generateContracts } from '../lib/contract-gen.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const figmaProps = {
  'State': { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover'] },
  'Selected': { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] },
};
const variantBindings = {
  'State=Default, Selected=False': { props: { state: 'default', selected: 'false' }, bindings: [{ token: 'tile/fill', bindingField: 'fills', isText: false, depth: 0 }, { token: 'tile/text', bindingField: 'fills', isText: true, depth: 1 }, { token: 'icon/fill', bindingField: 'fills', isText: false, depth: 2 }] },
  'State=Hover, Selected=False': { props: { state: 'hover', selected: 'false' }, bindings: [{ token: 'tile/fill-hover', bindingField: 'fills', isText: false, depth: 0 }, { token: 'tile/text', bindingField: 'fills', isText: true, depth: 1 }] },
  'State=Default, Selected=True': { props: { state: 'default', selected: 'true' }, bindings: [{ token: 'tile/fill', bindingField: 'fills', isText: false, depth: 0 }, { token: 'tile/stroke-on', bindingField: 'strokes', isText: false, depth: 0 }, { token: 'tile/text-on', bindingField: 'fills', isText: true, depth: 1 }] },
};

test('the contract keeps what each variant paints with, on the frame and on its text, in Figma\'s own values', () => {
  const t = stateTokens(variantBindings, figmaProps);
  assert.deepEqual(t.byVariant[0], { when: { State: 'Default', Selected: 'False' }, paints: [{ token: 'tile/fill', field: 'fills' }, { token: 'tile/text', field: 'fills', text: true }] }, 'a layer two down is a nested component\'s');
  assert.equal(t.byVariant.length, 3);
});

const contract = () => ({
  name: 'cardTile',
  props: [
    { name: 'State', type: 'enum', default: 'Default', options: ['Default', 'Hover'], bindings: { figma: { kind: 'VARIANT', default: 'Default' }, code: null } },
    { name: 'Selected', type: 'enum', default: 'False', options: ['False', 'True'], bindings: { figma: { kind: 'VARIANT', default: false }, code: { prop: 'selected', as: 'prop', type: 'boolean', default: false } } },
    { name: 'Size', type: 'enum', default: 'M', options: ['S', 'M'], bindings: { figma: { kind: 'VARIANT', default: 'M' }, code: { prop: 'size', as: 'prop', options: ['s', 'm'], valueMap: { S: 's', M: 'm' } } } },
    { name: 'Show icon', type: 'boolean', default: true, bindings: { figma: { kind: 'BOOLEAN', default: true }, code: null } },
    { name: 'Caption', type: 'text', default: 'Hello', bindings: { figma: { kind: 'TEXT', default: 'Hello' }, code: { prop: 'caption', as: 'prop' } } },
    { name: 'Icon', type: 'instance', default: '7:8', bindings: { figma: { kind: 'INSTANCE_SWAP', default: 'iconStar' }, code: { slot: 'icon', as: 'slot' } } },
    { name: 'Content', type: 'children', bindings: { figma: { kind: 'SLOT' }, code: { slot: 'default', as: 'defaultSlot' } } },
  ],
  codeOnly: [{ name: 'dense', type: 'boolean', default: false }, { name: 'onPick' }],
  slots: [{ name: 'Icon', accepts: ['iconStar', 'iconMoon'] }],
  anatomy: { root: { inset: { blockToken: '{padding.xs}', inlineToken: '{padding.m}' }, gapToken: '{gap.s}', radiusToken: '{radii.tile}', height: 40 }, 'Text group': { gapToken: '{gap.xs}' }, Decor: { selector: '.card-tile__decor' } },
  states: [{ name: 'State=Hover', when: { State: 'Hover' } }],
  tokens: stateTokens(variantBindings, figmaProps),
  source: { figma: { file: 'AcmeKey', nodeId: '1:2' }, code: { file: 'src/CardTile.vue' } },
});

test('a spec: props with their types, values and defaults, the code\'s own facts beside them', () => {
  const { spec } = specOf(contract());
  assert.equal(spec.title, 'cardTile');
  assert.deepEqual(spec.props.state, { type: 'string', enum: ['Default', 'Hover'], default: 'Default', $extensions: { 'com.figma': { type: 'VARIANT', name: 'State' } } });
  assert.equal(spec.props.selected.type, 'boolean', 'a variant of False and True is a boolean');
  assert.equal(spec.props.selected.default, false);
  assert.deepEqual(spec.props.size.$extensions['rms-design-system-engine'].code.valueMap, { S: 's', M: 'm' }, 'how the code writes Figma\'s values');
  assert.deepEqual(spec.props.showIcon, { type: 'boolean', default: true, $extensions: { 'com.figma': { type: 'BOOLEAN', name: 'Show icon' } } });
  assert.deepEqual(spec.props.caption.examples, ['Hello']);
  assert.deepEqual(spec.props.icon, { type: 'slot', default: 'iconStar', anyOf: ['iconStar', 'iconMoon'], $extensions: spec.props.icon.$extensions });
  assert.equal(spec.props.content.defaultSlot, true);
  assert.deepEqual(spec.props.dense, { type: 'boolean', default: false, $extensions: { 'rms-design-system-engine': { from: 'code' } } });
  assert.equal(spec.props.onPick, undefined, 'a code prop with no type the format has');
  assert.equal(specKey('Show icon'), 'showIcon');
});

test('the anatomy holds only parts the contract knows the kind of, and the styles are tokens where the contract places them', () => {
  const { spec, left } = specOf(contract());
  assert.deepEqual(spec.anatomy, { root: { type: 'container' }, textGroup: { type: 'container', $extensions: { 'com.figma': { name: 'Text group' } } }, caption: { type: 'text' }, icon: { type: 'instance' }, content: { type: 'slot' } });
  assert.ok(left.some((l) => /^part Decor:/.test(l)), 'a part with no layout fact is said, never guessed');
  const root = spec.default.elements.root.styles;
  assert.deepEqual(root.padding, { top: { $token: 'padding.xs', $type: 'dimension' }, bottom: { $token: 'padding.xs', $type: 'dimension' }, start: { $token: 'padding.m', $type: 'dimension' }, end: { $token: 'padding.m', $type: 'dimension' } });
  assert.deepEqual(root.itemSpacing, { $token: 'gap.s', $type: 'dimension' });
  assert.equal(root.height, 40);
  assert.deepEqual(root.backgroundColor, { $token: 'tile.fill', $type: 'color' }, 'the default variant\'s fill');
  assert.deepEqual(spec.default.elements.caption, { content: { $binding: '#/props/caption' }, styles: { textColor: { $token: 'tile.text', $type: 'color' } } }, 'one text property: its text is the one the colour paints');
  assert.deepEqual(spec.default.elements.icon, { instanceOf: { $binding: '#/props/icon' } });
  assert.deepEqual(spec.default.elements.content, { children: { $binding: '#/props/content' } });
  assert.deepEqual(spec.default.configuration, { state: 'Default', selected: false, size: 'M', showIcon: true, dense: false });
  // Each other variant says what it paints differently.
  assert.deepEqual(spec.variants, [
    { configuration: { state: 'Hover', selected: false }, elements: { root: { styles: { backgroundColor: { $token: 'tile.fill-hover', $type: 'color' } } } } },
    { configuration: { state: 'Default', selected: true }, elements: { root: { styles: { strokes: { $token: 'tile.stroke-on', $type: 'color' } } }, caption: { styles: { textColor: { $token: 'tile.text-on', $type: 'color' } } } } },
  ]);
});

test('two text properties: the text colour is said not placed; the index links each spec to its contract, code and Figma', () => {
  const c = contract();
  c.props.push({ name: 'Note', type: 'text', bindings: { figma: { kind: 'TEXT' }, code: null } });
  const { spec, left } = specOf(c);
  assert.equal(spec.default.elements.caption.styles, undefined);
  assert.ok(left.some((l) => /several text properties/.test(l)));
  const [index, one] = specDocuments([{ name: 'cardTile', contract: c, file: 'card-tile.contract.json' }]);
  assert.equal(index.rel, 'index.json');
  assert.equal(index.doc.format, SPEC_FORMAT);
  assert.deepEqual(index.doc.components[0].figma, 'https://www.figma.com/design/AcmeKey?node-id=1-2');
  assert.equal(index.doc.components[0].contract, '../card-tile.contract.json');
  assert.equal(index.doc.components[0].code, 'src/CardTile.vue');
  assert.equal(one.rel, 'components/card-tile.json');
  // A spec holds only what the format defines at its root.
  assert.deepEqual(Object.keys(one.doc).filter((k) => !['title', 'anatomy', 'props', 'default', 'variants'].includes(k)), []);
});

test('every build writes the specs beside dsds/, one a component and the index', async () => {
  const root = tempDir('acme-specs-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), root, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  const r = await generateContracts(root, cfg, { force: true });
  assert.equal(r.specsOut, join(root, 'contracts', 'specs'));
  const index = JSON.parse(readFileSync(join(r.specsOut, 'index.json'), 'utf8'));
  assert.deepEqual(index.components.map((x) => x.name), r.components);
  const button = JSON.parse(readFileSync(join(r.specsOut, 'components', 'button.json'), 'utf8'));
  assert.equal(button.default.elements.root.styles.cornerRadius.$token, 'radii.button');
  assert.ok(existsSync(join(root, 'contracts', 'dsds', 'system.dsds.json')));
});
