// the components read in chunks the engine checks, each put together in Figma with the recipes' own functions
// (Step 1c of the refresh recipe, the state walk and the raw-value sweep of the full audit recipe), and merged into the
// five files the gates read about them. A stand-in Figma file large enough to need several chunks, that throws where
// the Figma tool throws (a property a layer type does not have, a page switch), one of about 200 component sets
// (test/figma-standin.mjs) read compressed in about a tenth of the answers, and Tidepool's answers as the Figma tool
// returned them in the format before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unpublished, componentsScript, componentsCall, captureScript, readComponents, importComponents, captureWithFigmaCli, cyrb53, importLines, recipeFunctions,
  COMPONENT_FUNCTIONS, AUDIT_FUNCTIONS, STRUCTURE_KEYS, SCRIPT_MAX, ANSWER, varsScript, partsBack, unzip } from '../figma-capture.mjs';
import * as standin from './figma-standin.mjs';
import { examplesCaptureScript } from '../figma-examples.mjs';
import { brandsCaptureScript } from '../figma-brands.mjs';
import { effectsCaptureScript } from '../effects-parity.mjs';
import { motionCaptureScript } from '../motion-parity.mjs';
import { screenCaptureScript } from '../screen-layout.mjs';
import { screenA11yCaptureScript } from '../screen-a11y.mjs';
import { captureScript as annotationScript } from '../annotation-categories.mjs';
import { hygieneOf } from '../figma-hygiene.mjs';

const ENGINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
// Layers with what the recipes' functions read, that throw where the Figma tool throws (test/figma-standin.mjs).
const { MIXED, solid, bound, node, frame, label, icon } = standin;
const rgb = (r, g, b) => ({ r, g, b });

// One component set: a State axis, the disabled one drawn at half opacity, a Background layer, a boolean that shows its
// icon, and a props definition. extra: the number of layers, so some components are large.
function buttonSet(i, extra = 3) {
  const variant = (name, props = {}) => frame({ type: 'COMPONENT', name, boundVariables: { paddingTop: bound('v-pad-s'), paddingLeft: bound('v-pad-m'), itemSpacing: bound('v-gap'), topLeftRadius: bound('v-radius') }, ...props }, [
    node({ type: 'RECTANGLE', name: 'Background', width: 80, height: 32, layoutPositioning: 'ABSOLUTE', fills: [solid(rgb(0.1, 0.3, 0.8), 'v-bg', { opacity: 0.08 })], boundVariables: { fills: [bound('v-bg')] } }),
    icon({ componentPropertyReferences: { visible: `Show Icon#${i}:1` } }),
    label(),
    ...Array.from({ length: extra }, (_, k) => frame({ name: `Part ${k} of a long component name`, width: 8, height: 8, layoutMode: 'NONE', cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0 }, [])),
  ]);
  return node({ type: 'COMPONENT_SET', id: `${i}:0`, name: `button${i}`, description: `Button number ${i}.`, annotations: [{ label: 'Role: button' }],
    componentPropertyDefinitions: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Disabled'] }, [`Show Icon#${i}:1`]: { type: 'BOOLEAN', defaultValue: true } } }, [
    variant('State=Default', { id: `${i}:1` }),
    variant('State=Hover', { id: `${i}:2`, height: 32 }),
    variant('State=Disabled', { id: `${i}:3`, opacity: 0.5 }),
  ]);
}
// A set whose state is drawn by a nested instance (a state layer, bound two layers down), with a hidden badge a
// visibility variable can show; listed with its hover variant first and a Type axis named Default, so a test of the
// name for "default" would pick the hover.
function stateLayerSet() {
  const variant = (state, id, overlay, opacity) => frame({ type: 'COMPONENT', id, name: `Type=Default, State=${state}` }, [
    node({ type: 'INSTANCE', name: 'State layer', width: 80, height: 32, layoutPositioning: 'ABSOLUTE' }, [
      node({ type: 'RECTANGLE', name: 'Overlay', width: 80, height: 32, fills: [solid(rgb(0, 0, 0), overlay, { opacity })], boundVariables: { fills: [bound(overlay)] } }),
    ]),
    node({ type: 'RECTANGLE', name: 'Background', width: 80, height: 32, fills: [solid(rgb(1, 1, 1), 'v-surface', { opacity })] }),
    node({ type: 'ELLIPSE', name: 'Badge', visible: false, width: 6, height: 6, fills: [solid(rgb(1, 0, 0), 'v-badge')], boundVariables: { visible: bound('v-flag'), fills: [bound('v-badge')] } }),
    label({ annotations: state === 'Default' ? [{ label: 'The label says what the tab opens.' }] : [] }),
  ]);
  return node({ type: 'COMPONENT_SET', id: '800:0', name: 'tab', description: 'A tab.',
    componentPropertyDefinitions: { Type: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default'] }, State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover'] } } }, [
    variant('Hover', '800:2', 'v-hover', 0.5),
    variant('Default', '800:1', 'v-rest', 0.08),
  ]);
}
function makeFile(count = 30) {
  const sets = Array.from({ length: count }, (_, i) => buttonSet(i + 1, i % 5 === 0 ? 30 : 3));
  // A component outside any set with a slot, a group with no fills, a shape whose corners differ and a frame whose
  // strokes differ (figma.mixed, which is no number); a private one.
  const card = frame({ type: 'COMPONENT', id: '900:1', name: 'card', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', height: 120, width: 240, fills: [solid(rgb(1, 1, 1), 'v-surface')], strokes: [solid(rgb(0.5, 0.5, 0.5), 'v-border')],
    strokeWeight: MIXED, strokeTopWeight: 1, strokeRightWeight: 0, strokeBottomWeight: 2, strokeLeftWeight: 0, description: 'A card.' }, [
    frame({ name: 'Head', boundVariables: { itemSpacing: bound('v-gap'), paddingTop: bound('v-pad-s') }, height: 32 }, [label({ name: 'Title' }), label({ name: 'Meta', fontSize: MIXED })]),
    node({ type: 'SLOT', name: 'Content', width: 240, height: 80, layoutMode: 'VERTICAL', itemSpacing: 8 }, [node({ type: 'FRAME', name: 'a' }), node({ type: 'FRAME', name: 'b' })]),
    node({ type: 'GROUP', name: 'Decor', width: 24, height: 24 }, [node({ type: 'RECTANGLE', name: 'Corner', width: 24, height: 24, cornerRadius: MIXED, topLeftRadius: 6, topRightRadius: 0, bottomRightRadius: 6, bottomLeftRadius: 0, fills: [solid(rgb(0.2, 0.2, 0.2))] })]),
  ]);
  const hidden = frame({ type: 'COMPONENT', id: '901:1', name: '_private', description: 'Not part of the system.' }, []);
  const marked = frame({ type: 'COMPONENT', id: '902:1', name: '🟡 .tableRow (deprecated)', description: 'Not published either.' }, []);
  const loaded = [];
  const page = node({ type: 'PAGE', id: '0:1', name: 'Components', loadAsync: async () => { loaded.push('0:1'); } }, [...sets, stateLayerSet(), card, hidden, marked]);
  const vars = Object.fromEntries([['v-pad-s', 'padding/s'], ['v-pad-m', 'padding/m'], ['v-gap', 'gap/s'], ['v-radius', 'radii/button'], ['v-bg', 'button/background/color'], ['v-text', 'button/text/color'],
    ['v-surface', 'surface/color'], ['v-border', 'border/color'], ['v-hover', 'state/hover/color'], ['v-rest', 'state/rest/color'], ['v-badge', 'badge/color'], ['v-flag', 'show/badge']].map(([id, name]) => [id, { id, name }]));
  return { page, vars, sets, card, loaded };
}
const asFigma = (f) => {
  const all = () => [f.page, ...f.page.findAll()];
  return {
    mixed: MIXED,
    root: { children: [f.page], findAllWithCriteria: (c) => f.page.findAllWithCriteria(c) },
    currentPage: f.page,
    setCurrentPageAsync: async () => { throw new Error('the capture switched the page: that changes the file'); },
    getNodeByIdAsync: async (id) => all().find((x) => x.id === id) ?? null,
    getStyleByIdAsync: async (id) => (id === 'S:m' ? { id, name: 'Body/M' } : null),
    variables: { getLocalVariablesAsync: async () => Object.values(f.vars), getVariableByIdAsync: async (id) => f.vars[id] ?? null },
  };
};
const runIn = (f) => async (code) => new AsyncFunction('figma', code)(asFigma(f));
const cfg = { paths: { snapshotStructure: 'src/figma-structure.snapshot.json', compPropsSnapshot: 'src/figma-component-props.snapshot.json' } };
const project = () => { const d = mkdtempSync(join(tmpdir(), 'capture-components-')); writeFileSync(join(d, 'ds-config.json'), JSON.stringify(cfg)); mkdirSync(join(d, 'cap'), { recursive: true }); return d; };
const save = (dir, file, a) => writeFileSync(join(dir, file), JSON.stringify(a));
const json = (root, p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
// The checksums, page by page, then the reads, one after the other, each saved as the engine says. → the answers' sizes.
async function captureAll(f, dir, { time, fresh = true, sums = true, run = runIn(f) } = {}) {
  const sizes = [];
  for (let first = fresh; sums; first = false) {
    const call = componentsCall(dir, 'sums', { cfg, fresh: first, ...(time != null ? { time } : {}) });
    const a = await run(call.script);
    sizes.push(Buffer.byteLength(JSON.stringify(a)));
    save(dir, call.save, a);
    if (a.after == null) break;
  }
  await readAll(dir, run, sizes);
  return sizes;
}
async function readAll(dir, run, sizes = []) {
  for (let c = readComponents(dir); c.todo.length && !c.changed.length && !c.gone.length; c = readComponents(dir)) {
    const call = componentsCall(dir, 'next', { cfg }), a = await run(call.script);
    sizes.push(Buffer.byteLength(JSON.stringify(a)));
    save(dir, call.save, a);
  }
  return sizes;
}

test('components: the chunk script carries the recipes\' own functions, fits the Figma tool, and every key they write is known', async () => {
  const fns = recipeFunctions();
  assert.equal(fns.length, COMPONENT_FUNCTIONS.length + AUDIT_FUNCTIONS.length);
  const names = [...COMPONENT_FUNCTIONS, ...AUDIT_FUNCTIONS];
  for (const [i, src] of fns.entries()) assert.match(src, new RegExp(`^(async )?function ${names[i]}\\(`));
  const md = ['refresh-figma.md', 'full-audit.md'].map((f) => readFileSync(join(ENGINE, 'cookbook', f), 'utf8')).join('\n');
  for (const src of fns) assert.ok(md.includes(src), 'taken from the recipes unchanged');
  assert.equal(fns[names.indexOf('hygieneOf')], hygieneOf.toString(), 'the engine\'s own hygiene record');
  for (const s of [componentsScript('sums'), componentsScript('read', { ids: ['1:0'] })]) assert.ok(s.length < SCRIPT_MAX, `${s.length} characters, within what the Figma tool takes`);
  const f = makeFile(3), dir = join(project(), 'cap');
  await captureAll(f, dir);
  const items = partsBack([...readComponents(dir).have.values()].flat());
  const keys = new Set(items.filter((x) => x.k === 'component').flatMap((x) => Object.keys(x.v)));
  keys.delete('name');
  for (const k of keys) assert.ok(STRUCTURE_KEYS.includes(k), `${k} is a key the import replaces`);
});

test('components: no capture script the engine writes switches Figma\'s page; each loads the pages it reads where they are', async () => {
  const scripts = {
    'vars sums': varsScript('sums'), 'vars 0': varsScript(0),
    'components sums': componentsScript('sums'), 'components sums, continued': componentsScript('sums', { pass: 'p', after: 'k' }), 'components read': componentsScript('read', { ids: ['1:0'] }), 'components slice': componentsScript('read', { ids: ['1:0'], slice: 1 }),
    '--figma-effects': effectsCaptureScript(), '--figma-motion': motionCaptureScript(), '--figma-screens': screenCaptureScript(['1:2']), '--figma-a11y': screenA11yCaptureScript(['1:2']), '--annotation-categories': annotationScript(),
    '--figma-examples': examplesCaptureScript(),
    '--figma-brands': brandsCaptureScript(),
    '--figma-brands --collection': brandsCaptureScript({ collection: 'Acme' }),
  };
  for (const [name, s] of Object.entries(scripts)) assert.doesNotMatch(s, /setCurrentPage/, `${name} never switches the page`);
  for (const name of ['components sums', 'components read', '--figma-effects', '--figma-motion', '--annotation-categories']) assert.match(scripts[name], /\.loadAsync\(\)/, `${name} loads each page where it is`);
  // Run in a file that throws on a page switch: nothing is switched, every page read is loaded.
  const f = makeFile(2), run = runIn(f);
  const a = await run(componentsScript('sums'));
  assert.equal(a.sums.length, 4);
  assert.deepEqual(f.loaded, ['0:1']);
});

test('components: every answer fits the Figma tool, each component is checked against its own checksum, and a large one travels in slices', async () => {
  const f = makeFile();
  // A chart of 6,000 bars of different widths and colours: its raw values alone are larger than one answer, compressed.
  f.page.children.push(node({ type: 'COMPONENT_SET', id: '700:0', name: 'chart', parent: f.page }, [frame({ type: 'COMPONENT', id: '700:1', name: 'State=Default' },
    Array.from({ length: 6000 }, (_, k) => node({ type: 'RECTANGLE', name: `Bar ${k}`, width: Math.fround(10 + ((k * 7919) % 6007) * 0.37), height: 4, fills: [solid(rgb(((k * 31) % 256) / 255, ((k * 17) % 256) / 255, ((k * 47) % 256) / 255))] })))]));
  f.page.children.at(-1).parent = f.page;
  const root = project(), dir = join(root, 'cap');
  const sizes = await captureAll(f, dir);
  for (const s of sizes) assert.ok(s <= ANSWER, `${s} bytes fit one answer`);
  const c = readComponents(dir);
  assert.equal(c.complete, true);
  assert.equal(c.entries.length, 33, 'the sets and the card; the private ones left out, a status mark in front or not');
  assert.deepEqual(c.todo, []);
  const slices = readdirSync(dir).map((x) => json(dir, x)).filter((a) => a.slice != null);
  assert.ok(slices.length > 1 && slices.every((a) => a.slices === slices.length && Object.keys(a.sums)[0] === '700:0'), `the chart is read in ${slices.length} slices`);
  const chart = c.entries.find((e) => e.id === '700:0'), items = c.have.get('700:0');
  assert.equal(cyrb53(JSON.stringify(items)), chart.sum, 'the checksum Figma computed is the one the engine computes');
  const r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  const values = json(root, 'component-values.snapshot.json');
  assert.ok(values.chart.nums.length > 1800, 'the slices put back together');
  // An answer changed by hand is refused, and what it held is read again.
  const one = readdirSync(dir).find((x) => /^components-\w+-\d+\.json$/.test(x) && json(dir, x).slice == null && Object.keys(json(dir, x).sums).length > 1);
  const kept = json(dir, one), a = { ...kept };
  a.z = a.z.slice(0, 100) + (a.z[100] === 'A' ? 'B' : 'A') + a.z.slice(101); save(dir, one, a);
  const again = readComponents(dir);
  assert.match(again.bad[0], new RegExp(`^${one.replace('.', '\\.')}: its checksum does not match`));
  assert.deepEqual(again.todo, Object.keys(json(dir, one).sums).filter((id) => again.entries.some((e) => e.id === id)));
  // An answer the saving wrapped in lines still reads.
  save(dir, one, { ...kept, z: kept.z.replace(/.{76}/g, '$&\n') });
  assert.deepEqual(readComponents(dir).bad, []);
  assert.deepEqual(readComponents(dir).todo, []);
});

test('components: the import writes the five files, keeps what the capture does not read, and takes out what Figma no longer has', async () => {
  const f = makeFile(), root = project(), dir = join(root, 'cap');
  // One set the Figma tool cannot walk: its structure is kept from before, its other parts are read.
  const broken = f.sets[2];
  broken.children[0].findOne = () => { throw new Error('the layer tree could not be read'); };
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/figma-structure.snapshot.json'), JSON.stringify({ _note: 'kept', components: {
    button1: { h: 99, strokeSides: 'all', childFrameGaps: [{ name: 'Old', gapVar: 'gap/xl' }] }, button3: { h: 77 }, removedOne: { h: 10 } } }));
  writeFileSync(join(root, 'src/figma-component-props.snapshot.json'), JSON.stringify({ _note: 'props', button1: { properties: {}, figmaDocs: 'kept' }, removedOne: { properties: {} } }));
  writeFileSync(join(root, 'component-values.snapshot.json'), JSON.stringify({ _note: 'values', button1: { nums: [1], colors: [] }, removedOne: { nums: [2], colors: [] } }));
  writeFileSync(join(root, 'component-state-bindings.json'), JSON.stringify({ removedOne: { 'State=Default': { props: {}, bindings: [] } } }));
  const sums = componentsCall(join(root, 'cap'), 'sums', { cfg });
  save(dir, sums.save, await runIn(f)(sums.script));
  let r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, false);
  assert.equal(r.todo.length, 32);
  assert.match(importLines(r, 'cap').join('\n'), new RegExp(`^32 of 32 components still to read\\.\nNEXT: run rms-design-system-engine --capture-script components next, run the script it writes unchanged with the Figma tool \\(use_figma\\), save its answer as it came to cap/components-${r.pass}-0\\.json`));
  await readAll(dir, runIn(f));
  r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.removed, ['removedOne']);
  const files = ['src/figma-structure.snapshot.json', 'src/figma-component-props.snapshot.json', 'component-values.snapshot.json', 'component-state-tokens.json', 'component-state-bindings.json'];
  assert.deepEqual(r.written, files);
  const said = importLines(r, 'cap').join('\n');
  assert.match(said, /^✓ Figma's components read in \d+ checked chunks?: 32 components with 89 variants, the props of 32, the raw values of 32 and the states of 32 → src\/figma-structure\.snapshot\.json, src\/figma-component-props\.snapshot\.json, component-values\.snapshot\.json, component-state-tokens\.json, component-state-bindings\.json\nTaken out, no longer in Figma: removedOne\.\n⚠️ {2}Not read in Figma, kept as it was: button3 \(structure: the layer tree could not be read\)\.$/);
  for (const p of files) { const s = json(root, p); assert.ok(s._built?.at && s._updated, `${p} stamped`); }
  const s = json(root, 'src/figma-structure.snapshot.json');
  const b = s.components.button1;
  assert.equal(s._note, 'kept');
  assert.equal(b.h, 32, 'read from Figma');
  assert.equal(b.strokeSides, 'all', 'a key the capture does not read is kept');
  assert.equal(b.childFrameGaps, undefined, 'a key the capture reads and Figma no longer has is gone');
  assert.deepEqual(s.components.button3, { h: 77 }, 'a component the Figma tool could not read is kept as it was');
  assert.deepEqual(b.paddingVar, { tb: 'padding/s', lr: 'padding/m' });
  assert.equal(b.gapVar, 'gap/s');
  assert.equal(b.innerRadiusVar, 'radii/button');
  assert.equal(b.fontSizeVar, 'm', 'the text style\'s last segment');
  assert.equal(b.fillStructure, 'before', 'painted by the Background layer');
  assert.equal(b.fillOpacity, 0.08);
  assert.deepEqual(b.variantOpacity, { disabled: 0.5 });
  assert.equal(b.iconSize, 16);
  assert.deepEqual(b.toggles, { 'Show Icon': ['Icon'] });
  assert.equal(b.defaultVariant, 'State=Default');
  assert.equal(b.restingState, 'default');
  assert.deepEqual(Object.keys(b.variants), ['State=Default', 'State=Hover', 'State=Disabled']);
  assert.deepEqual(b.drawnOn, [{ fg: 'button/text/color', on: 'button/background/color', icon: true }], 'the icon and the label, one pair');
  assert.equal(b.nodeId, '1:0');
  const card = s.components.card;
  assert.equal(card.slot, true);
  assert.equal(card.sizingV, 'HUG');
  assert.equal(card.strokeOnDefault, true);
  assert.deepEqual(card.stroke.weights, [1, 0, 2, 0], 'strokes that differ by side, read side by side');
  assert.deepEqual(card.childFrameGaps, [{ name: 'Head', gapVar: 'gap/s', gapPx: 4 }, { name: 'Content', gapVar: null, gapPx: 8 }]);
  assert.deepEqual(card.childFramePadding, [{ name: 'Head', paddingVar: { tb: 'padding/s', lr: null } }]);
  const p = json(root, 'src/figma-component-props.snapshot.json');
  assert.equal(p._note, 'props');
  assert.equal(p.button1.figmaDocs, 'kept');
  assert.equal(p.button1.description, 'Button number 1.');
  assert.deepEqual(p.button1.annotations, [{ label: 'Role: button' }]);
  assert.deepEqual(Object.keys(p.button1.properties), ['State', 'Show Icon#1:1']);
  assert.equal(p.removedOne, undefined);
  assert.equal(p.card.description, 'A card.');
  // The raw values: every number and colour of every layer, a group with no fills and corners that differ included.
  const v = json(root, 'component-values.snapshot.json');
  assert.equal(v._note, 'values');
  assert.equal(v.removedOne, undefined);
  assert.ok(v.card.nums.includes(6) && v.card.nums.includes(24), 'the corner radii read one by one');
  assert.ok(v.card.colors.includes('333333'), 'the shape inside the group');
  assert.ok(!v.card.nums.some((x) => typeof x !== 'number'));
  assert.deepEqual(v.card.hygiene.raw.find((x) => x.at === 'card/Decor/Corner' && x.field === 'radius'), { at: 'card/Decor/Corner', field: 'radius', value: 6 });
  assert.equal(v.card.hygiene.binds['v-surface'].FRAME_FILL, 'card', 'the variable each property is bound to');
  assert.deepEqual(v.button1.colors, ['1a4dcc', 'ffffff']);
  // The state tokens: summed over the components, the badge bound only on a hidden layer a variable can show.
  const t = json(root, 'component-state-tokens.json');
  assert.equal(t['state/hover/color'], 1, 'bound inside the nested state layer');
  assert.ok(t._hiddenOnly.includes('badge/color') && t._hiddenToggleable.includes('badge/color'));
  assert.ok(!t._hiddenOnly.includes('button/text/color'));
  assert.deepEqual(t._components.tab.toggleable, ['badge/color', 'show/badge']);
  // The state bindings: the state drawn two layers down, inside an instance, is bound.
  const bi = json(root, 'component-state-bindings.json');
  assert.equal(bi.removedOne, undefined);
  assert.deepEqual(bi.tab['Type=Default, State=Hover'].props, { type: 'default', state: 'hover' });
  assert.deepEqual(bi.tab['Type=Default, State=Hover'].bindings.find((x) => x.token === 'state/hover/color'), { token: 'state/hover/color', bindingField: 'fills', isText: false, depth: 2 });
  assert.equal(bi.card, undefined, 'a component outside a set has no variants to bind');
  assert.ok(bi.button1['State=Default'].bindings.some((x) => x.isText && x.depth === 1));
});

test('components: the full audit recipe\'s whole-file captures, for a small file in one run, give what the import writes', async () => {
  const f = makeFile(2), root = project(), dir = join(root, 'cap');
  await captureAll(f, dir);
  assert.equal((await importComponents(root, cfg, { dir })).ok, true);
  const md = readFileSync(join(ENGINE, 'cookbook', 'full-audit.md'), 'utf8');
  const block = (fn) => { const at = md.indexOf(`function ${fn}(`); return md.slice(md.lastIndexOf('```js\n', at) + 6, md.indexOf('```', at)); };
  const tokens = await runIn(f)(block('stateTokensOf'));
  const { _updated, ...counts } = tokens;
  const t = json(root, 'component-state-tokens.json');
  assert.deepEqual(counts, Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('_') || k === '_hiddenOnly' || k === '_hiddenToggleable')));
  const bindings = JSON.parse(await runIn(f)(block('stateBindingsOf')));
  const b = json(root, 'component-state-bindings.json');
  assert.deepEqual(bindings, Object.fromEntries(Object.entries(b).filter(([k]) => !k.startsWith('_'))));
});

test('components: one resting variant everywhere, matched by its axes, never by "default" anywhere in the name', async () => {
  const f = makeFile(1), root = project(), dir = join(root, 'cap');
  await captureAll(f, dir);
  const r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  const tab = json(root, 'src/figma-structure.snapshot.json').components.tab;
  assert.equal(tab.defaultVariant, 'Type=Default, State=Default', 'the State axis\'s first value, not the first variant whose name says default');
  assert.equal(tab.fillOpacity, 0.08, 'the paint facts read the same variant');
  assert.equal(tab.restingState, 'default');
  assert.deepEqual(json(root, 'src/figma-component-props.snapshot.json').tab.layerAnnotations.map((x) => x.layer), ['Label'], 'the notes on the resting variant\'s layers');
});

test('components: kept by component id, so a component added mid-capture shifts no other; a refresh reads only what changed', async () => {
  const f = makeFile(), root = project(), dir = join(root, 'cap');
  // The checksums in pages of one component each (as when Figma is slow): every page continues where the last stopped.
  for (let first = true; ; first = false) { const call = componentsCall(dir, 'sums', { cfg, fresh: first, time: 0 }), a = await runIn(f)(call.script); save(dir, call.save, a); if (a.after == null) break; }
  const c = readComponents(dir);
  assert.equal(c.pages, 32);
  assert.equal(c.entries.length, 32);
  // A designer adds a component after the checksums: the reads still read the ones the checksums name, and the import
  // says so.
  f.page.children.push(buttonSet(99)); f.page.children.at(-1).parent = f.page;
  await readAll(dir, runIn(f));
  let r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.added, 1);
  assert.match(importLines(r, 'cap').join('\n'), /ℹ️ {2}Figma has 1 more component than when the checksums were read: rms-design-system-engine --capture-script components sums new reads it next time\./);
  // The next capture: new checksums, and only the new component and the one a designer made taller are read.
  for (const v of f.sets[6].children) v.height = 40;
  const asked = [];
  r = await captureWithFigmaCli(root, cfg, { run: async (code) => { asked.push(/^const CALL="(\w+)"/m.exec(code)[1]); return JSON.stringify(await runIn(f)(code)); }, dir, kind: 'components' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(asked, ['sums', 'read'], 'the checksums, then one chunk holding the two');
  assert.equal(json(root, 'src/figma-structure.snapshot.json').components.button7.h, 40);
  assert.ok(json(root, 'src/figma-structure.snapshot.json').components.button99);
  assert.ok(!readdirSync(dir).some((x) => /^components-sums-\d+\.json$/.test(x)), 'the pages of the pass before are cleared');
  // The checksums are read, then Figma changes before a chunk is: the import says so and asks for the checksums again.
  for (const v of f.sets[1].children) v.height = 44;
  const sums = componentsCall(dir, 'sums', { cfg, fresh: true });
  save(dir, sums.save, await runIn(f)(sums.script));
  for (const v of f.sets[1].children) v.height = 48;
  const late = await importComponents(root, cfg, { dir });
  assert.deepEqual(late.todo, ['2:0']);
  const call = componentsCall(dir, 'next', { cfg });
  save(dir, call.save, await runIn(f)(call.script));
  const changed = await importComponents(root, cfg, { dir });
  assert.equal(changed.ok, false);
  assert.deepEqual(changed.changed, ['2:0']);
  assert.match(importLines(changed, 'cap').join('\n'), /^Figma changed after the checksums were read \(1 component: 2:0\)\.\nNEXT: run rms-design-system-engine --capture-script components sums new/);
});

test('components: the commands write each script and import the answers saved', async () => {
  const root = project();
  const cli = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = cli('--capture-script', 'components', '0');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /❌ the checksums are not all read yet/);
  r = cli('--capture-script', 'components', 'sums', 'new');   // a new pass (here the first)
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = join(root, '.design-system-engine-out/figma-capture');
  assert.match(r.stdout, /NEXT: run it unchanged with the Figma tool \(use_figma\) on the design system's file, save its answer as it came to \.design-system-engine-out\/figma-capture\/components-sums\.json, then run rms-design-system-engine --capture-import: it names each chunk to read\.$/m);
  const f = makeFile(4), run = runIn(f);
  save(out, 'components-sums.json', await run(readFileSync(join(out, 'components-sums.js'), 'utf8')));
  r = cli('--capture-import');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /6 of 6 components still to read\./);
  const pass = readComponents(out).pass;
  assert.match(r.stdout, new RegExp(`--capture-script components next, .*save its answer as it came to \\.design-system-engine-out/figma-capture/components-${pass}-0\\.json`));
  r = cli('--capture-script', 'components', 'next');
  assert.match(r.stdout, new RegExp(`save its answer as it came to \\.design-system-engine-out/figma-capture/components-${pass}-0\\.json, then run rms-design-system-engine --capture-import\\.`));
  assert.match(readFileSync(join(out, `components-${pass}-0.js`), 'utf8'), /IDS=\["/, 'the script reads its components by id');
  save(out, `components-${pass}-0.json`, await run(readFileSync(join(out, `components-${pass}-0.js`), 'utf8')));
  for (let c = readComponents(out); c.todo.length; c = readComponents(out)) save(out, `components-${pass}-${c.slot}.json`, await run(captureScript('components', 'next', { dir: out })));
  r = cli('--capture-import', 'components');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ Figma's components read in \d+ checked chunks?: 6 components with 14 variants/);
  for (const p of ['src/figma-component-props.snapshot.json', 'component-values.snapshot.json', 'component-state-tokens.json', 'component-state-bindings.json']) assert.ok(existsSync(join(root, p)), p);
});

// The form before the compressed one: each component's items as the recipes' functions give them in Figma, sent as they
// are, 14,000 bytes of items an answer (a larger component alone in one), each answer with its components' checksums.
async function fullForm(f, pass) {
  const head = componentsScript('read', { ids: [] }).split("if(CALL==='sums'){")[0];
  const per = await new AsyncFunction('figma', `${head}return Promise.all(all.map(async (r) => [r.id, await itemsOf(r)]));`)(standin.asComponentsFigma(f));
  const answers = [];
  let cur = [], size = 0;
  const flush = () => { if (!cur.length) return; const items = cur.flatMap(([, its]) => its); answers.push({ capture: 'components', v: 2, kind: 'read', pass, ids: cur.map(([id]) => id), of: per.length, sums: Object.fromEntries(cur.map(([id, its]) => [id, cyrb53(JSON.stringify(its))])), sum: cyrb53(JSON.stringify(items)), items }); cur = []; size = 0; };
  for (const e of per) { const b = Buffer.byteLength(JSON.stringify(e[1])); if (size + b > 14000) flush(); cur.push(e); size += b; }
  flush();
  return answers;
}

test('components: about 200 component sets, read compressed, give byte for byte the files the full form gives, in about a tenth of the answers', async () => {
  const f = standin.largeComponentsFile(), run = async (code) => new AsyncFunction('figma', code)(standin.asComponentsFigma(f));
  // Compressed.
  const b = project(), dirB = join(b, 'cap'), now = '2026-10-14T00:00:00.000Z';
  const sizes = await captureAll(f, dirB, { run });
  for (const x of sizes) assert.ok(x <= ANSWER, `${x} bytes fit one answer`);
  const rb = await importComponents(b, cfg, { dir: dirB, now });
  assert.equal(rb.ok, true, JSON.stringify(rb).slice(0, 300));
  assert.equal(rb.counts.components, 200);
  // The full form, under the same checksums: answers saved that way before still serve.
  const a = project(), dirA = join(a, 'cap'), pass = readComponents(dirB).pass;
  for (const x of readdirSync(dirB).filter((x) => x.startsWith('components-sums'))) cpSync(join(dirB, x), join(dirA, x));
  const full = await fullForm(f, pass);
  full.forEach((x, n) => save(dirA, `components-${pass}-${n}.json`, x));
  const ra = await importComponents(a, cfg, { dir: dirA, now });
  assert.equal(ra.ok, true, JSON.stringify(ra).slice(0, 300));
  const strip = (root, p) => JSON.stringify(json(root, p), (k, v) => (k === '_source' || k === '_built' ? undefined : v), 2);
  for (const p of rb.written) assert.equal(strip(b, p), strip(a, p), p);
  // About a tenth of the answers, and far fewer bytes.
  const reads = sizes.length - readComponents(dirB).pages, bytes = (xs) => xs.reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x)), 0);
  assert.ok(full.length >= 150 && reads * 8 <= full.length, `${full.length} answers in the full form, ${reads} compressed`);
  assert.ok(bytes(full) >= 5 * sizes.reduce((n, x) => n + x, 0), 'the bytes the agent reads and writes');
  // What a compressed answer holds reads back as the items themselves.
  const one = readdirSync(dirB).find((x) => /^components-\w+-0\.json$/.test(x));
  assert.deepEqual(JSON.parse(unzip(json(dirB, one).z)).map((x) => x.id).filter((id) => !/[|#]/.test(id)), Object.keys(json(dirB, one).sums));
});

test('components: checksums saved in the form before are read again, and the import says so; one read at a time when Figma is slow', async () => {
  const f = makeFile(3), root = project(), dir = join(root, 'cap');
  // A capture under way with the engine before: its checksums carried each component's size, its reads had a plan.
  save(dir, 'components-sums.json', { capture: 'components', v: 2, kind: 'sums', pass: 'old', from: null, after: null, of: 5, sums: [['1:0', 'x', 900, 1, 0]] });
  let r = await importComponents(root, cfg, { dir });
  assert.equal(r.why, 'no answer saved yet');
  assert.match(importLines(r, 'cap').join('\n'), /^1 component answer was saved in a form before this one \(components-sums\.json\): the checksums are read again in the compact form; a component those answers hold whole is not read again\.\nNo component answer saved in cap yet\./);
  // Figma slow: each read takes one component, and the next one goes on from there.
  const sums = componentsCall(dir, 'sums', { cfg, fresh: true });
  save(dir, sums.save, await runIn(f)(sums.script));
  for (let c = readComponents(dir), n = 0; c.todo.length; c = readComponents(dir), n++) {
    const call = componentsCall(dir, 'next', { cfg, time: 0 }), a = await runIn(f)(call.script);
    assert.equal(Object.keys(a.sums).length, 1);
    assert.equal(call.save, `components-${c.pass}-${n}.json`);
    save(dir, call.save, a);
  }
  r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(componentsCall(dir, 'next', { cfg }), { error: 'every component is read: run rms-design-system-engine --capture-import' });
});

// On a real file: Tidepool's answers, saved as the Figma tool returned them before the capture read the raw values
// and the states (test/fixtures/tidepool-figma/figma-capture).
test('components on a real file: Figma\'s checksums hold, the import gives what the recipe captured by hand, and keeps the files those answers did not read', async () => {
  const TP = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
  const root = mkdtempSync(join(tmpdir(), 'capture-tidepool-'));
  cpSync(join(TP, 'ds-config.json'), join(root, 'ds-config.json'));
  const tpCfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'capture-tidepool-answers-'));
  for (const f of readdirSync(join(TP, 'figma-capture')).filter((x) => x.startsWith('components-'))) cpSync(join(TP, 'figma-capture', f), join(dir, f));
  const c = readComponents(dir);
  assert.equal(c.v, 1);
  assert.deepEqual(c.bad, []);
  assert.deepEqual(c.missing, [], 'the checksums Figma computed are the engine\'s');
  // The raw values captured before: these answers did not read them, so they stay as they were.
  const values = JSON.stringify({ _updated: '2026-01-01T00:00:00.000Z', button: { nums: [4, 32], colors: ['ffffff'] }, gone: { nums: [1], colors: [] } });
  writeFileSync(join(root, 'component-values.snapshot.json'), values);
  const r = await importComponents(root, tpCfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.written, [tpCfg.paths.snapshotStructure, tpCfg.paths.compPropsSnapshot]);
  assert.equal(readFileSync(join(root, 'component-values.snapshot.json'), 'utf8'), values);
  assert.ok(!existsSync(join(root, 'component-state-tokens.json')));
  const got = json(root, tpCfg.paths.snapshotStructure).components;
  const hand = JSON.parse(readFileSync(join(TP, tpCfg.paths.snapshotStructure), 'utf8')).components;
  assert.deepEqual(Object.keys(got), Object.keys(hand));
  for (const [name, h] of Object.entries(hand)) {
    for (const k of ['nodeId', 'h', 'paddingVar', 'gapVar', 'innerRadiusVar', 'fontSizeVar', 'strokeOnDefault']) if (k in h) assert.deepEqual(got[name][k], h[k], `${name} ${k}`);
    if (h.fontWeightVar) assert.equal(got[name].fontWeightVar, h.fontWeightVar, `${name} fontWeightVar`);
    for (const part of ['fill', 'text', 'stroke']) if (h.colors?.[part]?.token) assert.equal(got[name].colors[part].token, h.colors[part].token, `${name} ${part} colour`);
    if (h.defaultVariant && got[name].variants) {
      assert.equal(got[name].defaultVariant, h.defaultVariant, `${name} default variant`);
      for (const [v, hv] of Object.entries(h.variants ?? {})) assert.equal(got[name].variants[v].h, hv.h, `${name} ${v} height`);
    }
  }
  const props = json(root, tpCfg.paths.compPropsSnapshot);
  const handProps = JSON.parse(readFileSync(join(TP, tpCfg.paths.compPropsSnapshot), 'utf8'));
  for (const [name, h] of Object.entries(handProps)) {
    if (name.startsWith('_')) continue;
    assert.deepEqual(props[name].properties, h.properties, `${name} properties`);
    assert.equal(props[name].description, h.description, `${name} description`);
    assert.deepEqual(props[name].annotations.map((a) => a.label), h.annotations.map((a) => a.label), `${name} annotations`);
    assert.deepEqual((props[name].layerAnnotations ?? []).map((l) => l.layer), (h.layerAnnotations ?? []).map((l) => l.layer), `${name} layer notes`);
  }
});

test('components: a nested instance Figma fills in lazily reads alike whatever the call read before, so its checksum holds', async () => {
  // Two components hold an instance of the same toggle; Figma fills the toggle's layers in only once one walk has passed
  // them (shared by every instance of it). Read alone, the header met them empty on its first walk; read after the menu,
  // full: its checksum then said Figma changed when it had not.
  const make = () => {
    let filled = false;
    const toggle = (id) => {
      const inst = standin.node({ type: 'INSTANCE', id, name: 'sideNavToggle', width: 40, height: 40 }, []);
      const kids = [standin.label({ name: 'label', characters: 'Collapse', textStyleId: 'S:m' })];
      for (const k of kids) k.parent = inst;
      Object.defineProperty(inst, 'children', { get() { if (!filled) { filled = true; return []; } return kids; } });
      return inst;
    };
    const set = (id, name, inst) => standin.node({ type: 'COMPONENT_SET', id: `${id}:0`, name, componentPropertyDefinitions: {} }, [standin.frame({ type: 'COMPONENT', id: `${id}:1`, name: 'collapsed=false' }, [inst])]);
    const menu = set(1, 'sideNav', toggle('1:9')), header = set(2, 'sideNavHeader', toggle('2:9'));
    const page = standin.node({ type: 'PAGE', id: '0:1', name: 'Components', loadAsync: async () => {} }, [menu, header]);
    page.findAllWithCriteria = () => [menu, header];
    return { page, vars: { 'v-text': { id: 'v-text', name: 'text/color' } } };
  };
  const head = componentsScript('read', { ids: [] }).split("if(CALL==='sums'){")[0];
  const read = async (body) => new AsyncFunction('figma', `${head}const byName=(n)=>all.find((x)=>x.name===n);${body}`)(standin.asComponentsFigma(make()));
  const alone = await read(`return JSON.stringify(await itemsOf(byName('sideNavHeader')));`);
  const after = await read(`await itemsOf(byName('sideNav'));return JSON.stringify(await itemsOf(byName('sideNavHeader')));`);
  assert.equal(alone, after, 'the same component reads the same, first in the call or after another');
  assert.match(alone, /"fontSizeVar":"m"/, 'its label is read, though Figma filled it in late');
  // The stand-in shows the trouble: one read, first in the call, misses the label the read after another finds.
  const once = await read(`return JSON.stringify(await readOnce(byName('sideNavHeader')));`);
  assert.notEqual(once, after);
});

test('a component Figma does not publish (a name starting with . or _, a status mark in front or not) is no component of the system', () => {
  assert.deepEqual(['🟡 .rowShade. (deprecated)', '.cell', '_base', '🟡  tableHeader', 'buttonPrimary', 'Layout/Header'].map(unpublished), [true, true, true, false, false, false]);
});

test('the capture keeps the primitives as Figma has them in each colour mode, their links followed', async () => {
  const { primitivesFromItems } = await import('../figma-capture.mjs');
  const items = [
    { k: 'collection', v: { id: 'C', name: 'Theme', modes: [{ modeId: 'l', name: 'Light' }, { modeId: 'd', name: 'Dark' }] } },
    { k: 'var', v: { id: 'a', name: 'primitives/neutral000', variableCollectionId: 'C', resolvedType: 'COLOR', valuesByMode: { l: { r: 1, g: 1, b: 1, a: 1 }, d: { r: 0, g: 0, b: 0, a: 1 } } } },
    { k: 'var', v: { id: 'b', name: 'primitives/paper', variableCollectionId: 'C', resolvedType: 'COLOR', valuesByMode: { l: { type: 'VARIABLE_ALIAS', id: 'a' }, d: { type: 'VARIABLE_ALIAS', id: 'a' } } } },
    { k: 'var', v: { id: 'c', name: 'semantic/text', variableCollectionId: 'C', resolvedType: 'COLOR', valuesByMode: { l: { r: 0, g: 0, b: 0, a: 1 }, d: { r: 1, g: 1, b: 1, a: 1 } } } },
  ];
  const p = primitivesFromItems(items, { figma: { colorCollection: 'Theme', modes: [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }] } });
  assert.deepEqual(p, { light: { 'primitives/neutral000': '#ffffff', 'primitives/paper': '#ffffff' }, dark: { 'primitives/neutral000': '#000000', 'primitives/paper': '#000000' } });
});
