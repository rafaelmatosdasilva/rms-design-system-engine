// The whole library built from its written description (library-build.mjs): the DSDS view, the W3C tokens it points at
// and each component's contract read back as the source, then built in a stand-in for Figma that keeps what is written
// on it, twice, and read back with the engine's own capture as it reads any file. The code side is read back as the
// engine reads code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDescription, libraryPlan, libraryScript, tokensCss, componentModel, rgba } from '../lib/library-build.mjs';
import { emit } from '../lib/dsds-release.mjs';
import { varsScript, varsItems, tokensFromItems } from '../lib/figma-capture.mjs';
import { undoScript } from '../lib/figma-undo.mjs';
import { tempDir } from './helpers.mjs';
import { join } from 'node:path';

// Acme, an invented system: colours in two modes, one pointing at another, sizes, a text style, and a button with its
// size and tone, its label, its padding, gap, corners and height, and what each tone paints with.
const TOKENS = {
  blue: { 600: { $type: 'color', $value: '#1f5fd6' } },
  surface: { page: { $type: 'color', $value: '#ffffff', $extensions: { 'com.rms.design-system-engine': { modes: { light: '#ffffff', dark: '#10151f' } } } } },
  action: { bg: { $type: 'color', $value: '{blue.600}', $description: 'What an action is filled with.' }, ink: { $type: 'color', $value: '#ffffff' }, quiet: { $type: 'color', $value: '#e8eefb' } },
  space: { s: { $type: 'dimension', $value: '8px' }, m: { $type: 'dimension', $value: '16px' } },
  radius: { m: { $type: 'dimension', $value: '6px' } },
  type: { label: { $type: 'typography', $value: { fontFamily: 'Acme Sans', fontSize: '14px', lineHeight: '20px', fontWeight: 600 } } },
  motion: { quick: { $type: 'duration', $value: '120ms' } },
};
const BUTTON = {
  id: 'acme.button', name: 'button', description: 'The main action of a view.',
  props: [
    { name: 'size', type: 'enum', default: 'm', options: ['s', 'm'], bindings: { figma: { kind: 'VARIANT', property: 'Size', options: ['s', 'm'] } } },
    { name: 'tone', type: 'enum', default: 'primary', options: ['primary', 'quiet'], bindings: { figma: { kind: 'VARIANT', property: 'Tone', options: ['primary', 'quiet'] } } },
    { name: 'label', type: 'string', default: 'Save', bindings: { figma: { kind: 'TEXT', property: 'Label' } } },
    { name: 'icon', type: 'component', bindings: { figma: { kind: 'INSTANCE_SWAP', property: 'Icon' } } },
  ],
  anatomy: { root: { inset: { blockToken: '{space.s}', inlineToken: '{space.m}' }, gapToken: '{space.s}', radiusToken: '{radius.m}', height: 40, typographyToken: '{type.label}' }, Label: {}, Icon: {} },
  tokens: { byVariant: [
    { when: { Tone: 'primary' }, paints: [{ token: 'action/bg', field: 'fills' }, { token: 'action/ink', field: 'fills', text: true }] },
    { when: { Tone: 'quiet' }, paints: [{ token: 'action/quiet', field: 'fills' }] },
  ] },
};
// The label's property is named for its layer, as the anatomy names it.
BUTTON.props[2].bindings.figma.property = 'Label';

function description() {
  const dir = tempDir('library-');
  const view = join(dir, 'contracts', 'dsds');
  emit(view, { system: 'Acme', built: [{ name: 'button', file: 'Button.contract.json', contract: BUTTON }],
    rest: { tokens: TOKENS, tokensHref: '../tokens.json', modes: [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }] } });
  return view;
}

// ── A stand-in for Figma that keeps what is written on it: pages, components, variables in collections, text styles ──
function figmaWorld() {
  let n = 0;
  const id = (p) => `${p}:${++n}`;
  const all = new Map();
  const node = (type, more = {}) => {
    const x = {
      id: id('n'), type, name: '', children: [], x: 0, y: 0, width: 100, height: 24, description: '', fills: [], strokes: [], boundVariables: {},
      componentPropertyDefinitions: {}, componentPropertyReferences: null, layoutMode: 'NONE',
      appendChild(k) { if (k.parent) k.parent.children.splice(k.parent.children.indexOf(k), 1); this.children.push(k); k.parent = this; },
      remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); all.delete(this.id); },
      resize(w, h) { this.width = w; this.height = h; }, resizeWithoutConstraints(w, h) { this.width = w; this.height = h; },
      setBoundVariable(f, v) { if (v) this.boundVariables[f] = { type: 'VARIABLE_ALIAS', id: v.id }; else delete this.boundVariables[f]; },
      addComponentProperty(name, type, def) { const k = `${name}#${++n}:0`; this.componentPropertyDefinitions[k] = { type, defaultValue: def }; return k; },
      editComponentProperty(k, v) { if (v.defaultValue !== undefined) this.componentPropertyDefinitions[k].defaultValue = v.defaultValue; },
      deleteComponentProperty(k) { delete this.componentPropertyDefinitions[k]; },
      async setTextStyleIdAsync(s) { this.textStyleId = s; },
      async loadAsync() {},
      ...more,
    };
    all.set(x.id, x);
    return x;
  };
  const root = { children: [] };
  const cols = [], vars = [], styles = [];
  const variable = (name, col, type) => {
    const v = { id: id('VariableID'), name, resolvedType: type, variableCollectionId: col.id, valuesByMode: {}, description: '', scopes: ['ALL_SCOPES'], remote: false,
      setValueForMode(m, x) { this.valuesByMode[m] = x; }, remove() { vars.splice(vars.indexOf(this), 1); col.variableIds.splice(col.variableIds.indexOf(this.id), 1); } };
    vars.push(v); col.variableIds.push(v.id);
    return v;
  };
  const figma = {
    mixed: Symbol('mixed'), root, all,
    async getNodeByIdAsync(i) { return all.get(i) ?? null; },
    async loadFontAsync() {},
    createPage() { const p = node('PAGE'); root.children.push(p); p.parent = root; p.remove = () => { root.children.splice(root.children.indexOf(p), 1); all.delete(p.id); }; return p; },
    createComponent: () => node('COMPONENT'), createFrame: () => node('FRAME'),
    createText: () => node('TEXT', { characters: '', fontName: { family: 'Inter', style: 'Regular' } }),
    combineAsVariants(comps, page) { const s = node('COMPONENT_SET'); for (const c of comps) s.appendChild(c); page.appendChild(s); return s; },
    createTextStyle() { const s = { id: id('S'), name: '', fontName: { family: 'Inter', style: 'Regular' }, fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, paragraphSpacing: 0, textCase: 'ORIGINAL', boundVariables: {}, description: '' }; styles.push(s); all.set(s.id, s); s.remove = () => { styles.splice(styles.indexOf(s), 1); all.delete(s.id); }; return s; },
    async getLocalTextStylesAsync() { return [...styles]; },
    async getLocalEffectStylesAsync() { return []; },
    variables: {
      async getLocalVariableCollectionsAsync() { return [...cols]; },
      async getLocalVariablesAsync() { return [...vars]; },
      async getVariableByIdAsync(i) { return vars.find((v) => v.id === i) ?? null; },
      async getVariableCollectionByIdAsync(i) { return cols.find((c) => c.id === i) ?? null; },
      createVariableCollection(name) {
        const c = { id: id('VariableCollectionId'), name, modes: [{ modeId: id('m'), name: 'Mode 1' }], variableIds: [],
          renameMode(m, to) { this.modes.find((x) => x.modeId === m).name = to; }, addMode(to) { const m = id('m'); this.modes.push({ modeId: m, name: to }); return m; } };
        cols.push(c);
        return c;
      },
      createVariable: variable,
      createVariableAlias: (v) => ({ type: 'VARIABLE_ALIAS', id: v.id }),
      setBoundVariableForPaint: (p, _f, v) => ({ ...p, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } }),
    },
  };
  return figma;
}
const hex = ({ r, g, b }) => '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = (script, figma) => new AsyncFunction('figma', script)(figma);

test('the description is read back whole: every token from the file it points at, each theme, each component with its contract', () => {
  const desc = readDescription(description());
  assert.equal(desc.system, 'Acme');
  assert.deepEqual(desc.tokens.map((t) => t.name).sort(), ['action/bg', 'action/ink', 'action/quiet', 'blue/600', 'motion/quick', 'radius/m', 'space/m', 'space/s', 'surface/page', 'type/label']);
  assert.deepEqual(desc.themes.map((t) => [t.name, t.key, t.base]), [['Light', 'light', true], ['Dark', 'dark', false]]);
  assert.deepEqual(desc.components.map((c) => [c.entry.name, c.contract?.id]), [['button', 'acme.button']]);
  assert.match(readDescription(tempDir('library-none-')).why, /no DSDS view/);
});

test('the plan holds what the description says exactly, and lists what it does not, never guessing', () => {
  const plan = libraryPlan(readDescription(description()));
  const color = plan.collections.find((c) => c.name === 'Color');
  assert.deepEqual(color.modes, ['Light', 'Dark']);
  const bg = color.variables.find((v) => v.name === 'action/bg');
  assert.deepEqual(bg.values, { Light: { alias: 'blue/600' }, Dark: { alias: 'blue/600' } }, 'an alias stays an alias');
  assert.equal(bg.description, 'What an action is filled with.');
  assert.deepEqual(color.variables.find((v) => v.name === 'surface/page').values.Dark, { value: rgba('#10151f') }, 'each mode its own value');
  assert.deepEqual(plan.collections.find((c) => c.name === 'Dimension').variables.map((v) => [v.name, v.values.Light.value]), [['space/s', 8], ['space/m', 16], ['radius/m', 6]]);
  assert.deepEqual(plan.textStyles, [{ name: 'type/label', description: null, fontSize: 14, lineHeight: 20, fontWeight: 600, fontFamily: 'Acme Sans' }]);
  const [button] = plan.components;
  assert.equal(button.variants.length, 4, 'every combination of its options');
  assert.deepEqual(button.properties, [{ name: 'Label', kind: 'TEXT', default: 'Save' }]);
  assert.deepEqual(button.layers, [{ name: 'Label', type: 'text', text: 'Save', property: 'Label', style: 'type/label' }]);
  assert.deepEqual(button.binds.filter((b) => !b.where).map((b) => [b.field, b.variable]), [['paddingTop', 'space/s'], ['paddingBottom', 'space/s'], ['paddingLeft', 'space/m'], ['paddingRight', 'space/m'], ['gap', 'space/s'], ['radius', 'radius/m']]);
  assert.deepEqual(button.binds.filter((b) => b.where).map((b) => [b.layer, b.field, b.variable, b.where.Tone]), [['', 'fill', 'action/bg', 'primary'], ['Label', 'fill', 'action/ink', 'primary'], ['', 'fill', 'action/quiet', 'quiet']]);
  const listed = plan.listed.map((l) => `${l.what}: ${l.why}`).join('\n');
  assert.match(listed, /token motion\/quick: a duration has no Figma variable/);
  assert.match(listed, /button icon: a instance swap property needs the component it swaps in/);
  assert.match(listed, /button Icon: a part the anatomy names but not what it is/);
  assert.match(listed, /text styles: the description gives no font family|weight is a number in the description/);
  assert.match(listed, /collections: the description names no collection/);
});

test('built in Figma twice: the second run changes nothing, a token changed in the description changes that one value, and it all reads back as described', async () => {
  const view = description();
  const plan = libraryPlan(readDescription(view));
  const figma = figmaWorld();
  const first = await run(libraryScript(plan), figma);
  assert.deepEqual([first.missing, first.faults, first.changed], [[], [], []], JSON.stringify(first));
  assert.ok(first.made.includes('collection Color') && first.made.includes('Color mode Dark') && first.made.includes('button (4 variants)') && first.made.includes('page button'));
  const set = await figma.getNodeByIdAsync(first.nodes.button);
  assert.deepEqual(set.children.map((v) => v.name), ['Size=s, Tone=primary', 'Size=s, Tone=quiet', 'Size=m, Tone=primary', 'Size=m, Tone=quiet']);
  const v = set.children[0];
  assert.equal(v.height, 40);
  assert.equal(v.layoutMode, 'HORIZONTAL');
  const varId = (name) => figma.variables.getLocalVariablesAsync().then((vs) => vs.find((x) => x.name === name).id);
  assert.equal(v.boundVariables.paddingLeft.id, await varId('space/m'));
  assert.equal(v.boundVariables.topLeftRadius.id, await varId('radius/m'));
  assert.equal(v.fills[0].boundVariables.color.id, await varId('action/bg'));
  assert.equal(set.children[1].fills[0].boundVariables.color.id, await varId('action/quiet'), 'each tone paints with its own');
  const label = v.children.find((c) => c.name === 'Label');
  assert.equal(label.characters, 'Save');
  assert.match(label.componentPropertyReferences.characters, /^Label#/);
  assert.equal(label.fills[0].boundVariables.color.id, await varId('action/ink'));
  assert.equal(set.description, 'The main action of a view.');

  // Again, with nothing changed: nothing is written.
  const again = await run(libraryScript(plan), figma);
  assert.deepEqual([again.made, again.changed, again.undo], [[], [], []], JSON.stringify(again));
  assert.ok(again.kept.includes('button') && again.kept.includes('variable action/bg'));

  // One token changed in the description: that one value, and nothing else.
  const changedPlan = JSON.parse(JSON.stringify(plan));
  changedPlan.collections.find((c) => c.name === 'Dimension').variables.find((x) => x.name === 'space/m').values.Light = { value: 20 };
  const third = await run(libraryScript(changedPlan), figma);
  assert.deepEqual([third.made, third.changed], [[], ['variable space/m']]);
  assert.deepEqual(third.undo.map((s) => s.kind), ['variableValue'], 'and its way back');
  const back = await run(undoScript(third.undo, { what: 'build-library' }), figma);
  assert.deepEqual(back.failed, []);

  // Read back with the engine's own capture, as any file is: every variable and value as the description says.
  const answer = await run(varsScript(0), figma);
  const read = tokensFromItems(varsItems([answer.d]));
  const byName = Object.fromEntries(read.tokens.map((t) => [t.name, t]));
  assert.deepEqual(read.collections.find((c) => c.name === 'Color').modes, ['Light', 'Dark']);
  assert.equal(byName['surface/page'].values.Dark, '#10151f');
  assert.equal(byName['space/m'].values.Light, '16px', 'put back');
  // Every variable, in every mode, is what the description says.
  for (const col of plan.collections) for (const v of col.variables) for (const m of col.modes) {
    const want = v.values[m];
    const got = byName[v.name]?.values[m];
    if (want.alias) assert.equal(byName[v.name].aliases?.[m], want.alias, `${v.name} ${m}`);
    else assert.equal(got, v.type === 'COLOR' ? hex(want.value) : `${want.value}px`, `${v.name} ${m}`);
  }
  assert.equal(byName['action/bg'].aliases?.Light, 'blue/600', 'it points at the token the description says');
  assert.equal(byName['action/bg'].values.Light, '#1f5fd6');
});

test('the code is written from the same description: the tokens as custom properties, a mode a selector, and each component as spec-to-code writes one', async () => {
  const plan = libraryPlan(readDescription(description()));
  const { css, listed } = tokensCss(plan, { selectorOf: (m) => `[data-theme="${m.toLowerCase()}"]` });
  assert.match(css, /:root \{[^}]*--blue-600: #1f5fd6;[^}]*--action-bg: var\(--blue-600\);[^}]*--space-m: 16px;/s);
  assert.match(css, /\[data-theme="dark"\] \{[^}]*--surface-page: #10151f;/s);
  assert.deepEqual(listed, []);
  assert.match(tokensCss(plan).listed[0], /the Dark mode has no selector/);
  const { codeFromSpec } = await import('../lib/spec-to-code.mjs');
  const { model, listed: perOption } = componentModel(plan.components[0]);
  assert.deepEqual(model.axes.map((a) => a.name), ['Size', 'Tone']);
  assert.equal(perOption.length, 3, 'what each tone paints with is listed, never dropped');
  const out = codeFromSpec(model, { framework: 'vue', cssVarOf: (n) => `--${n.replace(/\//g, '-')}` });
  assert.equal(out.file, 'src/components/Button.vue');
  assert.match(out.text, /size: \{ type: String, default: "m"/);
  assert.match(out.text, /<span class="button__label">\{\{ label \}\}<\/span>/);
  assert.match(out.text, /padding-left: var\(--space-m\);[\s\S]*border-radius: var\(--radius-m\);/);
});

test('--build-library on a system the engine wrote down: the Figma script, the code as a patch that applies, and what is not said listed', { timeout: 300000 }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync, existsSync } = await import('node:fs');
  const { fixtureProject } = await import('./helpers.mjs');
  const ENGINE = join(import.meta.dirname, '..');
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'build-library-');
  const cli = (...args) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = cli('--build-library');
  assert.match(r.stdout, /Nothing to build from: no DSDS view/, 'none before the system is written down');
  cli('--contracts');
  r = cli('--build-library');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /📚 .*17 variables in 2 collections \(Light, Dark\), 2 text styles, 4 components/);
  assert.match(r.stdout, /chip Icon: a part the anatomy names but not what it is/);
  assert.match(r.stdout, /Button\.jsx is already there, so it is compared, never written over/, 'the code people wrote is never written over');
  assert.match(r.stdout, /🧩 the code: 4 new files → \.design-system-engine-out\/handback\/build-library\.patch/);
  assert.match(r.stdout, /✅ read back with the code's own reader/);
  const patch = join(dir, '.design-system-engine-out', 'handback', 'build-library.patch');
  const text = readFileSync(patch, 'utf8');
  assert.match(text, /\+\+\+ b\/src\/components\/Tag\.jsx[\s\S]*import '\.\/Tag\.css';[\s\S]*\+\+\+ b\/src\/components\/Tag\.css/, 'a JSX file with the styles it imports');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  assert.equal(spawnSync('git', ['apply', '--check', patch], { cwd: dir, encoding: 'utf8' }).status, 0);
  assert.equal(existsSync(join(dir, 'src', 'components', 'Tag.jsx')), false, 'nothing written to the code');
  // The script builds the four components in Figma, and a second run changes nothing.
  const script = readFileSync(join(dir, '.design-system-engine-out', 'handback', 'build-library.js'), 'utf8');
  const figma = figmaWorld();
  const first = await run(script, figma);
  assert.deepEqual([first.missing, first.faults], [[], []], JSON.stringify(first));
  assert.deepEqual(Object.keys(first.nodes).sort(), ['button', 'chip', 'field', 'tag']);
  const again = await run(script, figma);
  assert.deepEqual([again.made, again.changed], [[], []]);
  // Run again, the engine gives the same script and the same patch.
  cli('--build-library');
  assert.equal(readFileSync(join(dir, '.design-system-engine-out', 'handback', 'build-library.js'), 'utf8'), script);
  assert.equal(readFileSync(patch, 'utf8'), text);
});
