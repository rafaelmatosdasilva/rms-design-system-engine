// P6: the components read in chunks the engine checks, each put together in Figma with the capture recipe's own Step 1c
// functions, and merged into the structure and props snapshots. A stand-in Figma file large enough to need several
// chunks, and Tidepool's answers as the Figma tool returned them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { componentsScript, captureScript, readCapture, importComponents, captureWithFigmaCli, cyrb53, importLines, recipeFunctions, COMPONENT_FUNCTIONS, STRUCTURE_KEYS } from '../figma-capture.mjs';

const ENGINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const rgb = (r, g, b) => ({ r, g, b });
const solid = (color, varId, more = {}) => ({ type: 'SOLID', visible: true, opacity: 1, color, ...(varId ? { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: varId } } } : {}), ...more });
const bound = (id) => ({ type: 'VARIABLE_ALIAS', id });

// A node with what the recipe's functions read, its children's parent set and their place on the canvas.
function node(props, children = []) {
  const n = { visible: true, opacity: 1, fills: [], strokes: [], boundVariables: {}, x: 0, y: 0, width: 80, height: 32, ...props, children };
  for (const c of children) c.parent = n;
  Object.defineProperty(n, 'absoluteBoundingBox', { get() { const p = n.parent?.absoluteBoundingBox ?? { x: 0, y: 0 }; return { x: p.x + n.x, y: p.y + n.y, width: n.width, height: n.height }; } });
  n.findAll = (pred) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (!pred || pred(c)) out.push(c); walk(c); } }; walk(n); return out; };
  n.findOne = (pred) => n.findAll(pred)[0] ?? null;
  n.findAllWithCriteria = ({ types }) => n.findAll((c) => types.includes(c.type));
  return n;
}
const frame = (props, children) => node({ type: 'FRAME', layoutMode: 'HORIZONTAL', paddingTop: 4, paddingRight: 12, paddingBottom: 4, paddingLeft: 12, itemSpacing: 4,
  topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8, bottomLeftRadius: 8, layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'FIXED', minHeight: null, minWidth: null, maxWidth: null,
  primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER', layoutWrap: 'NO_WRAP', strokeWeight: 1, strokeAlign: 'INSIDE', dashPattern: [], ...props }, children);
const label = (props = {}) => node({ type: 'TEXT', name: 'Label', width: 40, height: 20, x: 12, y: 6, fontSize: 14, fontName: { family: 'Inter', style: 'Medium' }, lineHeight: { unit: 'PIXELS', value: 20 },
  letterSpacing: { unit: 'PERCENT', value: 0 }, textCase: 'ORIGINAL', textDecoration: 'NONE', textAlignHorizontal: 'LEFT', textStyleId: 'S:m', fills: [solid(rgb(1, 1, 1), 'v-text')], ...props });
const icon = (props = {}) => node({ type: 'INSTANCE', name: 'Icon', width: 16, height: 16, x: 4, y: 8, ...props }, [node({ type: 'VECTOR', name: 'Vector', width: 16, height: 16, fills: [solid(rgb(1, 1, 1), 'v-text')] })]);

// One component set: Size and State axes, the disabled one drawn at half opacity, a Background layer, a boolean that
// shows its icon, and a props definition. extra: the number of layers, so some components are large.
function buttonSet(i, extra = 3) {
  const variant = (name, props = {}) => frame({ type: 'COMPONENT', name, boundVariables: { paddingTop: bound('v-pad-s'), paddingLeft: bound('v-pad-m'), itemSpacing: bound('v-gap'), topLeftRadius: bound('v-radius') }, ...props }, [
    node({ type: 'RECTANGLE', name: 'Background', width: 80, height: 32, layoutPositioning: 'ABSOLUTE', fills: [solid(rgb(0.1, 0.3, 0.8), 'v-bg', { opacity: 0.08 })] }),
    icon({ componentPropertyReferences: { visible: `Show Icon#${i}:1` } }),
    label(),
    ...Array.from({ length: extra }, (_, k) => node({ type: 'FRAME', name: `Part ${k} of a long component name`, width: 8, height: 8, layoutMode: 'NONE' })),
  ]);
  const set = node({ type: 'COMPONENT_SET', id: `${i}:0`, name: `button${i}`, description: `Button number ${i}.`, annotations: [{ label: 'Role: button' }],
    componentPropertyDefinitions: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Disabled'] }, [`Show Icon#${i}:1`]: { type: 'BOOLEAN', defaultValue: true } } }, [
    variant('State=Default', { id: `${i}:1` }),
    variant('State=Hover', { id: `${i}:2`, height: 32 }),
    variant('State=Disabled', { id: `${i}:3`, opacity: 0.5 }),
  ]);
  return set;
}
function makeFile(count = 30) {
  const sets = Array.from({ length: count }, (_, i) => buttonSet(i + 1, i % 5 === 0 ? 30 : 3));
  // A component outside any set with a slot and an inner frame that binds its own gap; a private one; a variant-less icon.
  const card = frame({ type: 'COMPONENT', id: '900:1', name: 'card', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', height: 120, width: 240, fills: [solid(rgb(1, 1, 1), 'v-surface')], strokes: [solid(rgb(0.5, 0.5, 0.5), 'v-border')], description: 'A card.' }, [
    frame({ name: 'Head', boundVariables: { itemSpacing: bound('v-gap'), paddingTop: bound('v-pad-s') }, height: 32 }, [label({ name: 'Title' }), label({ name: 'Meta' })]),
    node({ type: 'SLOT', name: 'Content', width: 240, height: 80, layoutMode: 'VERTICAL', itemSpacing: 8 }, [node({ type: 'FRAME', name: 'a' }), node({ type: 'FRAME', name: 'b' })]),
  ]);
  const hidden = frame({ type: 'COMPONENT', id: '901:1', name: '_private', description: 'Not part of the system.' }, []);
  const page = node({ type: 'PAGE', id: '0:1', name: 'Components' }, [...sets, card, hidden]);
  const vars = Object.fromEntries([['v-pad-s', 'padding/s'], ['v-pad-m', 'padding/m'], ['v-gap', 'gap/s'], ['v-radius', 'radii/button'], ['v-bg', 'button/background/color'], ['v-text', 'button/text/color'], ['v-surface', 'surface/color'], ['v-border', 'border/color']]
    .map(([id, name]) => [id, { id, name }]));
  return { page, vars, sets, card };
}
const asFigma = (f) => {
  const all = [f.page, ...f.page.findAll()];
  return {
    mixed: Symbol('mixed'),
    root: { children: [f.page], findAllWithCriteria: (c) => f.page.findAllWithCriteria(c) },
    currentPage: f.page,
    setCurrentPageAsync: async () => {},
    getNodeByIdAsync: async (id) => all.find((x) => x.id === id) ?? null,
    getStyleByIdAsync: async (id) => (id === 'S:m' ? { id, name: 'Body/M' } : null),
    variables: { getLocalVariablesAsync: async () => Object.values(f.vars), getVariableByIdAsync: async (id) => f.vars[id] ?? null },
  };
};
const runIn = (f) => async (code) => new AsyncFunction('figma', code)(asFigma(f));
const cfg = { paths: { snapshotStructure: 'src/figma-structure.snapshot.json', compPropsSnapshot: 'src/figma-component-props.snapshot.json' } };
const project = () => { const d = mkdtempSync(join(tmpdir(), 'capture-components-')); writeFileSync(join(d, 'ds-config.json'), JSON.stringify(cfg)); mkdirSync(join(d, 'cap'), { recursive: true }); return d; };
const save = (dir, kind, n, a) => writeFileSync(join(dir, `${kind}-${n}.json`), JSON.stringify(a));

test('P6 components: the chunk script carries the recipe\'s own Step 1c functions, and every key they write is known', async () => {
  const fns = recipeFunctions();
  assert.equal(fns.length, COMPONENT_FUNCTIONS.length);
  for (const [i, src] of fns.entries()) assert.match(src, new RegExp(`^(async )?function ${COMPONENT_FUNCTIONS[i]}\\(`));
  const md = readFileSync(join(ENGINE, 'cookbook', 'refresh-figma.md'), 'utf8');
  for (const src of fns) assert.ok(md.includes(src), 'taken from the recipe unchanged');
  const f = makeFile(3), a = await runIn(f)(componentsScript(0));
  const keys = new Set(a.items.filter((x) => x.k === 'component').flatMap((x) => Object.keys(x.v)));
  keys.delete('name');
  for (const k of keys) assert.ok(STRUCTURE_KEYS.includes(k), `${k} is a key the import replaces`);
});

test('P6 components: each answer fits the Figma tool and is checked; a chunk read through its plan gives the checksum listed', async () => {
  const f = makeFile(), run = runIn(f);
  const sums = await run(componentsScript('sums'));
  assert.ok(sums.of >= 3, `several chunks (${sums.of})`);
  assert.equal(sums.plan.length, sums.of);
  for (let n = 0; n < sums.of; n++) {
    const all = await run(componentsScript(n));
    assert.ok(Buffer.byteLength(JSON.stringify(all)) < 20480, `chunk ${n} fits in one answer`);
    assert.deepEqual(all.sums, sums.sums);
    assert.equal(cyrb53(JSON.stringify(all.items)), all.sum, 'the checksum Figma computed is the one the engine computes');
    const planned = await run(componentsScript(n, { plan: { ...sums.plan[n], of: sums.of } }));
    assert.equal(planned.sum, sums.sums[n], `chunk ${n} read alone`);
    assert.equal(planned.sums, undefined, 'a planned chunk reads only its own components');
  }
  // A component set is never split unless the budget forces it, and a private component is left out.
  const items = (await Promise.all(sums.plan.map((p, n) => run(componentsScript(n, { plan: { ...p, of: sums.of } }))))).flatMap((a) => a.items);
  assert.ok(!items.some((x) => x.v.name === '_private'));
  assert.equal(items.filter((x) => x.k === 'component').length, 31);
});

test('P6 components: the import writes the structure and props snapshots, keeps what the capture does not read, and takes out what Figma no longer has', async () => {
  const f = makeFile(), run = runIn(f), root = project(), dir = join(root, 'cap');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/figma-structure.snapshot.json'), JSON.stringify({ _note: 'kept', components: {
    button1: { h: 99, strokeSides: 'all', childFrameGaps: [{ name: 'Old', gapVar: 'gap/xl' }] },
    removedOne: { h: 10 },
  } }));
  writeFileSync(join(root, 'src/figma-component-props.snapshot.json'), JSON.stringify({ _note: 'props', button1: { properties: {}, figmaDocs: 'kept' }, removedOne: { properties: {} } }));
  const sums = await run(componentsScript('sums'));
  save(dir, 'components', 'sums', sums);
  let r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [...Array(sums.of).keys()]);
  for (let n = 0; n < sums.of; n++) save(dir, 'components', n, await run(captureScript('components', n, { dir })));
  r = await importComponents(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.removed, ['removedOne']);
  assert.match(importLines(r, 'cap').join('\n'), /^✓ Figma's components read in \d+ checked chunks: 31 components with 90 variants, the props of 31 → src\/figma-structure\.snapshot\.json, src\/figma-component-props\.snapshot\.json\nTaken out, no longer in Figma: removedOne\.$/);
  const s = JSON.parse(readFileSync(join(root, 'src/figma-structure.snapshot.json'), 'utf8'));
  const b = s.components.button1;
  assert.equal(s._note, 'kept');
  assert.equal(b.h, 32, 'read from Figma');
  assert.equal(b.strokeSides, 'all', 'a key the capture does not read is kept');
  assert.equal(b.childFrameGaps, undefined, 'a key the capture reads and Figma no longer has is gone');
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
  assert.deepEqual(Object.keys(b.variants), ['State=Default', 'State=Hover', 'State=Disabled']);
  assert.deepEqual(b.drawnOn, [{ fg: 'button/text/color', on: 'button/background/color', icon: true }], 'the icon and the label, one pair');
  assert.equal(b.nodeId, '1:0');
  const card = s.components.card;
  assert.equal(card.slot, true);
  assert.equal(card.sizingV, 'HUG');
  assert.equal(card.strokeOnDefault, true);
  assert.deepEqual(card.childFrameGaps, [{ name: 'Head', gapVar: 'gap/s', gapPx: 4 }, { name: 'Content', gapVar: null, gapPx: 8 }]);
  assert.deepEqual(card.childFramePadding, [{ name: 'Head', paddingVar: { tb: 'padding/s', lr: null } }]);
  assert.ok(s._built?.at, 'stamped');
  const p = JSON.parse(readFileSync(join(root, 'src/figma-component-props.snapshot.json'), 'utf8'));
  assert.equal(p._note, 'props');
  assert.equal(p.button1.figmaDocs, 'kept');
  assert.equal(p.button1.description, 'Button number 1.');
  assert.deepEqual(p.button1.annotations, [{ label: 'Role: button' }]);
  assert.deepEqual(Object.keys(p.button1.properties), ['State', 'Show Icon#1:1']);
  assert.equal(p.removedOne, undefined);
  assert.equal(p.card.description, 'A card.');
});

test('P6 components: on a refresh only the chunk that changed is read again; a change after the checksums is said', async () => {
  const f = makeFile(), root = project(), dir = join(root, 'cap');
  const first = await captureWithFigmaCli(root, cfg, { run: async (code) => JSON.stringify(await runIn(f)(code)), dir, kind: 'components' });
  assert.equal(first.ok, true, JSON.stringify(first));
  // A designer makes one button taller; a refresh asks for the checksums and that one chunk (a component in one chunk).
  const plan = readCapture(dir, 'components').plan;
  const i = f.sets.findIndex((x) => plan.filter((p) => p.roots.includes(x.id)).length === 1 && plan.find((p) => p.roots.includes(x.id)).roots.length > 1);
  for (const v of f.sets[i].children) v.height = 40;
  const asked = [];
  const r = await captureWithFigmaCli(root, cfg, { run: async (code) => { asked.push(/CHUNK=('sums'|\d+)/.exec(code)[1]); return JSON.stringify(await runIn(f)(code)); }, dir, kind: 'components' });
  assert.equal(r.ok, true);
  assert.equal(asked[0], "'sums'");
  assert.equal(asked.length, 2, `the checksums and one chunk (${asked.join(', ')})`);
  assert.equal(JSON.parse(readFileSync(join(root, 'src/figma-structure.snapshot.json'), 'utf8')).components[f.sets[i].name].h, 40);
  // The checksums are read, then Figma changes before the chunk is: the import says so and asks for the checksums again.
  save(dir, 'components', 'sums', await runIn(f)(componentsScript('sums')));
  const n = readCapture(dir, 'components').plan.findIndex((p) => p.roots.includes('5:0'));
  f.sets[4].children[0].height = 48;
  save(dir, 'components', n, await runIn(f)(captureScript('components', n, { dir })));
  const late = await importComponents(root, cfg, { dir });
  assert.equal(late.ok, false);
  assert.deepEqual(late.changed, [n]);
  assert.match(importLines(late, 'cap').join('\n'), new RegExp(`^Figma changed after the checksums were read \\(chunk ${n}\\)\\.\\n1 of \\d+ component chunks still to read: ${n}\\.\\nNEXT: run rms-design-system-engine --capture-script components sums`));
});

test('P6 components: the commands write the script and import the answers saved', async () => {
  const root = project();
  const cli = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = cli('--capture-script', 'components', 'sums');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = join(root, '.design-system-engine-out/figma-capture');
  assert.match(r.stdout, /NEXT: run it unchanged with the Figma tool \(use_figma\) on the design system's file, save its answer as it came to \.design-system-engine-out\/figma-capture\/components-sums\.json, then run rms-design-system-engine --capture-import: it names each chunk to read\.$/m);
  const f = makeFile(4), run = runIn(f);
  save(out, 'components', 'sums', await run(readFileSync(join(out, 'components-sums.js'), 'utf8')));
  r = cli('--capture-import');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /component chunks? still to read: 0/);
  r = cli('--capture-script', 'components', '0');
  assert.match(readFileSync(join(out, 'components-0.js'), 'utf8'), /PLAN=\{"roots":/, 'the chunk script reads only its own components');
  save(out, 'components', 0, await run(readFileSync(join(out, 'components-0.js'), 'utf8')));
  for (let n = 1; n < readCapture(out, 'components').of; n++) save(out, 'components', n, await run(captureScript('components', n, { dir: out })));
  r = cli('--capture-import', 'components');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ Figma's components read in \d+ checked chunks?: 5 components with 12 variants/);
  assert.ok(existsSync(join(root, 'src/figma-component-props.snapshot.json')));
});

// On a real file: Tidepool's answers, saved as the Figma tool returned them (test/fixtures/tidepool-figma/figma-capture).
test('P6 components on a real file: Figma\'s checksums hold, and the import gives what the recipe captured by hand', async () => {
  const TP = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
  const root = mkdtempSync(join(tmpdir(), 'capture-tidepool-'));
  cpSync(join(TP, 'ds-config.json'), join(root, 'ds-config.json'));
  const tpCfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  const c = readCapture(join(TP, 'figma-capture'), 'components');
  assert.deepEqual(c.bad, []);
  assert.deepEqual(c.missing, [], 'the checksums Figma computed are the engine\'s');
  const r = await importComponents(root, tpCfg, { dir: join(TP, 'figma-capture') });
  assert.equal(r.ok, true, JSON.stringify(r));
  const got = JSON.parse(readFileSync(join(root, tpCfg.paths.snapshotStructure), 'utf8')).components;
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
  const props = JSON.parse(readFileSync(join(root, tpCfg.paths.compPropsSnapshot), 'utf8'));
  const handProps = JSON.parse(readFileSync(join(TP, tpCfg.paths.compPropsSnapshot), 'utf8'));
  for (const [name, h] of Object.entries(handProps)) {
    if (name.startsWith('_')) continue;
    assert.deepEqual(props[name].properties, h.properties, `${name} properties`);
    assert.equal(props[name].description, h.description, `${name} description`);
    assert.deepEqual(props[name].annotations.map((a) => a.label), h.annotations.map((a) => a.label), `${name} annotations`);
    assert.deepEqual((props[name].layerAnnotations ?? []).map((l) => l.layer), (h.layerAnnotations ?? []).map((l) => l.layer), `${name} layer notes`);
  }
});
