// A draft Code Connect file from what a contract pairs, in the classic form (React) and the template form (Vue, web
// components): it says it is a draft, leaves what the contract does not settle as a TODO, and reads back through
// code-connect-map.mjs to the same pairs it was written from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { draftFor, draftsFor, formOf } from '../code-connect-draft.mjs';
import { parseConnectFile } from '../code-connect-map.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const prop = (name, kind, code, extra = {}) => ({ name, type: { VARIANT: 'enum', BOOLEAN: 'boolean', TEXT: 'text', INSTANCE_SWAP: 'instance', SLOT: 'children' }[kind], bindings: { figma: { kind, property: name }, code }, ...extra });
const contract = (syntax, file, tag, props) => ({ name: 'cardTile', figmaNodeId: '12:34', props, source: { figma: { file: 'AcmeKey', nodeId: '12:34', name: 'cardTile' }, code: { file, tag, syntax } } });
const tileProps = () => [
  prop('Size', 'VARIANT', { prop: 'size', as: 'prop', source: 'name', options: ['small', 'large'] }, { options: ['Small', 'Large', 'Extra large'] }),
  prop('Disabled', 'VARIANT', { prop: 'disabled', as: 'prop', source: 'name', type: 'boolean', default: false }, { options: ['False', 'True'] }),
  prop('Show close', 'BOOLEAN', { prop: 'hideClose', as: 'prop', source: 'authored', inverted: true }),
  prop('Caption', 'TEXT', { prop: 'caption', as: 'prop', source: 'name' }),
  prop('Show caption', 'BOOLEAN', null, { conditions: [{ code: 'caption', role: 'condition' }] }),
  prop('State', 'VARIANT', null, { options: ['Default', 'Hover'] }),
  prop('Tone', 'VARIANT', null, { options: ['Calm', 'Loud'], suggestion: 'variant' }),
];
// What a parsed file says, as the draft's own pairs say it.
const parsed = (d) => parseConnectFile(d.text, d.file)[0].props.filter((p) => p.code).map((p) => ({ figma: p.figma, code: p.code, role: p.role ?? 'value', ...(p.negated ? { negated: true } : {}) }));
const own = (d) => d.pairs.map(({ values, ...p }) => p);
const asText = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, String(v)]));

test('the classic form: figma.connect with each pair the contract holds, read back to the same pairs and values', () => {
  const d = draftFor(contract('jsx', 'src/tiles/CardTile.tsx', 'CardTile', tileProps()));
  assert.equal(d.form, 'classic');
  assert.equal(d.file, 'src/tiles/CardTile.figma.tsx');
  assert.match(d.text, /^\/\/ DRAFT written by rms-design-system-engine/);
  assert.match(d.text, /figma\.connect\(CardTile, 'https:\/\/www\.figma\.com\/design\/AcmeKey\/cardTile\?node-id=12-34'/);
  assert.match(d.text, /size: figma\.enum\('Size', \{ Small: 'small', Large: 'large', 'Extra large': 'Extra large' \}\)/);
  assert.match(d.text, /hideClose: figma\.boolean\('Show close', \{ true: false, false: true \}\)/, 'the prop that holds the opposite');
  assert.deepEqual(parsed(d), own(d));
  const [m] = parseConnectFile(d.text, d.file);
  assert.equal(m.nodeId, '12:34');
  for (const p of d.pairs.filter((x) => x.values)) assert.deepEqual(m.props.find((x) => x.figma === p.figma).values, asText(p.values), `${p.figma}'s values`);
  // What the contract does not settle is a TODO, never a guess.
  assert.match(d.text, /TODO: Size: the code has no value for Extra large \(it has small, large\)/);
  assert.match(d.text, /TODO: State: a state Figma draws \(Default, Hover\)/);
  assert.match(d.text, /TODO: Tone: no code prop the contract pairs it with \(the code has variant/);
  // A property that decides whether a prop is written wraps the call that fills it, and reads back as that condition.
  assert.match(d.text, /caption: figma\.boolean\('Show caption', \{ true: figma\.string\('Caption'\), false: undefined \}\)/);
  assert.ok(d.pairs.some((p) => p.figma === 'Show caption' && p.role === 'condition' && p.code === 'caption'));
  assert.doesNotMatch(d.text, /TODO: Show caption/);
  assert.match(d.text, /<CardTile size=\{props\.size\} disabled=\{props\.disabled\} hideClose=\{props\.hideClose\} caption=\{props\.caption\} \/>/, 'each prop once in the example');
  assert.match(d.text, /disabled: figma\.enum\('Disabled', \{ False: false, True: true \}\),\s+\/\/ TODO: paired by its name/);
});

test('the template form: each property into a variable, its attribute written as the code writes it, a switch guarding the one it decides', () => {
  const d = draftFor(contract('vue', 'src/tiles/CardTile.vue', 'CardTile', tileProps()));
  assert.equal(d.form, 'template');
  assert.equal(d.file, 'src/tiles/CardTile.figma.js');
  assert.match(d.text, /^\/\/ url=https:\/\/www\.figma\.com\/design\/AcmeKey\/cardTile\?node-id=12-34\n\/\/ source=src\/tiles\/CardTile\.vue\n\/\/ component=CardTile\n\/\/ DRAFT/);
  assert.match(d.text, /:hideClose="\$\{!showClose\}"/);
  assert.match(d.text, /\$\{showCaption \? ` caption="\$\{caption\}"` : ''\}/);
  assert.equal(formOf(d.text), 'template');
  assert.deepEqual(parsed(d), own(d));
  assert.ok(d.pairs.some((p) => p.figma === 'Show caption' && p.role === 'condition' && p.code === 'caption'));
  const [m] = parseConnectFile(d.text, d.file);
  assert.equal(m.tag, 'CardTile');
  assert.deepEqual(m.props.find((x) => x.figma === 'Size').values, asText(d.pairs.find((p) => p.figma === 'Size').values));
});

test('a web component: a boolean written bare, read back as its value; the classic form when the project uses it', () => {
  const d = draftFor(contract('html', 'src/tiles/card-tile.js', 'card-tile', tileProps()));
  assert.match(d.text, /figma\.html`<card-tile/);
  assert.match(d.text, /\$\{disabled \? ' disabled' : ''\}/);
  assert.deepEqual(parsed(d), own(d));
  const vueClassic = draftFor(contract('vue', 'src/tiles/CardTile.vue', 'CardTile', tileProps()), { form: 'classic' });
  assert.equal(vueClassic.form, 'classic');
  assert.deepEqual(parsed(vueClassic), own(vueClassic));
});

test('only a component paired with Figma and the code that no Code Connect file maps gets a draft; the key missing is a TODO', () => {
  const a = contract('jsx', 'src/A.jsx', 'A', [prop('Label', 'TEXT', { prop: 'label', as: 'prop', source: 'name' })]);
  const mapped = { ...contract('jsx', 'src/B.jsx', 'B', []), name: 'buttonClock', figmaNodeId: '5:6', source: { figma: { nodeId: '5:6' }, code: { file: 'src/B.jsx', tag: 'B', syntax: 'jsx' } } };
  const codeOnly = { name: 'tileOne', props: [], source: { code: { file: 'src/C.jsx' } } };
  const { drafts, skipped } = draftsFor([a, mapped, codeOnly], [{ nodeId: '5:6' }]);
  assert.deepEqual(drafts.map((d) => d.name), ['cardTile']);
  assert.deepEqual(skipped.map((s) => s.why), ['a Code Connect file maps it already', 'no Figma component the contract pairs it with']);
  const noKey = draftFor({ ...a, source: { ...a.source, figma: { nodeId: '12:34' } } });
  assert.match(noKey.text, /design\/FILE_KEY\//);
  assert.match(noKey.text, /TODO: the Figma file's key/);
  // A default slot the text fills: children, in the example.
  const kids = draftFor(contract('jsx', 'src/A.jsx', 'A', [prop('Label', 'TEXT', { slot: 'default', as: 'defaultSlot', source: 'name' })]));
  assert.match(kids.text, /children: figma\.string\('Label'\)/);
  assert.match(kids.text, /<A>\{props\.children\}<\/A>/);
});

test('--code-connect-draft writes the drafts to the engine\'s own folder only, never beside the code', () => {
  const root = tempDir('acme-cc-draft-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), root, { recursive: true });
  const before = readdirSync(join(root, 'src', 'components')).sort();
  const out = execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--code-connect-draft'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /Code Connect drafts? → \.design-system-engine-out\/code-connect-drafts/);
  const draft = join(root, '.design-system-engine-out', 'code-connect-drafts', 'src', 'components', 'Button.figma.jsx');
  assert.ok(existsSync(draft), out);
  assert.match(readFileSync(draft, 'utf8'), /^\/\/ DRAFT/);
  assert.deepEqual(readdirSync(join(root, 'src', 'components')).sort(), before, 'nothing written into the code');
  // A component a Code Connect file maps already is left alone.
  writeFileSync(join(root, 'src', 'components', 'Button.figma.jsx'), "figma.connect(Button, 'https://www.figma.com/design/AcmeKey/Kit?node-id=10-1', { props: {}, example: () => <Button /> })\n");
  const again = execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--code-connect-draft'], { cwd: root, encoding: 'utf8' });
  assert.match(again, /1 already mapped/);
  assert.ok(!existsSync(draft), 'rewritten whole: the old draft is gone');
});

// What fills a slot: a text or a swapped instance written between the tags, a named slot in the element the framework
// names it with, guarded by the property that decides whether it is filled; read back to the same pairs.
const slotProps = () => [
  prop('Label', 'TEXT', { slot: 'default', as: 'defaultSlot', source: 'name' }),
  prop('Icon', 'INSTANCE_SWAP', { slot: 'icon', as: 'slot', source: 'name' }),
  prop('Show icon', 'BOOLEAN', null, { conditions: [{ code: 'icon', role: 'condition', slot: true }] }),
  prop('Size', 'VARIANT', { prop: 'size', as: 'prop', source: 'name', options: ['s', 'm'] }, { options: ['S', 'M'] }),
];
const withSlots = (d) => parseConnectFile(d.text, d.file)[0].props.filter((p) => p.code).map((p) => ({ figma: p.figma, code: p.code, role: p.role, ...(p.slot ? { slot: true } : {}), ...(p.negated ? { negated: true } : {}) }));

test('the template form writes what fills a slot between the tags, and reads it back as that slot', () => {
  const web = draftFor(contract('html', 'src/tiles/card-tile.js', 'card-tile', slotProps()));
  assert.match(web.text, /figma\.html`<card-tile size="\$\{size\}">\$\{label\}\$\{showIcon \? `<span slot="icon">\$\{icon\}<\/span>` : ''\}<\/card-tile>`/);
  assert.deepEqual(withSlots(web), own(web));
  assert.deepEqual(own(web).filter((p) => p.slot), [
    { figma: 'Label', code: 'default', role: 'value', slot: true },
    { figma: 'Icon', code: 'icon', role: 'value', slot: true },
    { figma: 'Show icon', code: 'icon', role: 'condition', slot: true },
  ]);
  assert.doesNotMatch(web.text, /TODO: Label/, 'the default slot is written, not left');
  const vue = draftFor(contract('vue', 'src/tiles/CardTile.vue', 'CardTile', slotProps()));
  assert.match(vue.text, /<CardTile size="\$\{size\}">\$\{label\}\$\{showIcon \? `<template #icon>\$\{icon\}<\/template>` : ''\}<\/CardTile>/);
  assert.deepEqual(withSlots(vue), own(vue));
  // A component with nothing between its tags stays self-closed.
  assert.match(draftFor(contract('vue', 'src/tiles/CardTile.vue', 'CardTile', slotProps().slice(3))).text, /<CardTile size="\$\{size\}" \/>/);
});

test('the classic form writes a condition the contract holds as the call that wraps its prop, either way and on an option', () => {
  const props = [
    prop('Caption', 'TEXT', { prop: 'caption', as: 'prop', source: 'authored' }, { conditions: [] }),
    prop('Hide caption', 'BOOLEAN', null, { conditions: [{ code: 'caption', role: 'condition', negated: true }] }),
    prop('Note', 'TEXT', { prop: 'note', as: 'prop', source: 'authored' }),
    prop('Kind', 'VARIANT', null, { options: ['Plain', 'Noted'], conditions: [{ code: 'note', role: 'condition', equals: 'Noted' }] }),
  ];
  const d = draftFor(contract('jsx', 'src/tiles/CardTile.tsx', 'CardTile', props));
  assert.match(d.text, /caption: figma\.boolean\('Hide caption', \{ true: undefined, false: figma\.string\('Caption'\) \}\)/);
  assert.match(d.text, /note: figma\.enum\('Kind', \{ Noted: figma\.string\('Note'\) \}\)/);
  const read = parseConnectFile(d.text, d.file)[0].props.map((p) => ({ figma: p.figma, code: p.code, role: p.role, ...(p.negated ? { negated: true } : {}), ...(p.equals != null ? { equals: p.equals } : {}) }));
  assert.deepEqual(read, d.pairs.map(({ values, ...p }) => p));
  assert.doesNotMatch(d.text, /TODO: (Hide caption|Kind)/);
});
