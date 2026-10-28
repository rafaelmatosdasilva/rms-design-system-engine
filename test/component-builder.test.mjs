// A component built in Figma the system's way (figma-ops.mjs, component-spec.mjs, component-diff.mjs): the component as
// the capture read it, each operation checked against the system (its variables, components, layers and names), the
// spec of a new one from the component it is like, how it differs, and the Figma script run on a stand-in for Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { modelOf, predict, ground, opsScript } from '../figma-ops.mjs';
import { specOf, specLines, likeOf, nameOf, EXT } from '../component-spec.mjs';
import { diffModels, diffLines } from '../component-diff.mjs';
import { grammarOf } from '../construction-grammar.mjs';
import { route } from '../route.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// A small invented system: three chips and an icon, built one way.
const chip = (n, more) => ({
  nodeId: `1:${n.length}`, description: `The ${n}.`,
  properties: { size: { type: 'VARIANT', variantOptions: ['s', 'l'], defaultValue: 's' }, 'showIcon#1:2': { type: 'BOOLEAN', defaultValue: true }, [`${more}#1:4`]: { type: 'BOOLEAN', defaultValue: false }, 'labelContent#1:3': { type: 'TEXT', defaultValue: 'Label' } },
});
const props = { chipFilter: chip('chipFilter', 'showCount'), chipChoice: chip('chipChoice', 'showCheck'), chipInput: chip('chipInput', 'showClose'), icon: { nodeId: '9:1', description: 'An icon.', properties: {} } };
const tree = { layout: { dir: 'HORIZONTAL' }, c: [{ t: 'FRAME', n: 'Content', layout: { dir: 'HORIZONTAL' }, c: [{ t: 'INSTANCE', n: 'icon', of: { name: 'icon' }, wired: { visible: 'showIcon' } }, { t: 'TEXT', n: 'Label', wired: { characters: 'labelContent' }, styles: { text: 'label/m' } }] }] };
const skel = () => ({ trees: [tree], variants: [['size=s', 0], ['size=l', 0]], page: 'Chips', section: 'Chips' });
const skeleton = { chipFilter: skel(), chipChoice: skel(), chipInput: skel() };
const varNames = { 'V:1': { name: 'chipFilter/label/color' }, 'V:2': { name: 'text/default' }, 'V:3': { name: 'spacing/s' }, 'V:4': { name: 'surface/danger' } };
const values = { chipFilter: { hygiene: { rawCount: 2, binds: { 'V:1': { TEXT_FILL: 'size=s/Content/Label' }, 'V:3': { GAP: 'size=s/Content' } } } } };
const captures = { props, skeleton, values, varNames };
const structure = Object.fromEntries(['chipFilter', 'chipChoice', 'chipInput'].map((n) => [n, { layout: 'HORIZONTAL' }]));
const grammar = grammarOf({ props, structure, values, varNames, skeleton });

test('the component as the capture read it: axes, properties, layers by path, every variable bound on each', () => {
  const m = modelOf('chipFilter', captures);
  assert.deepEqual(m.axes.map((a) => [a.name, a.options.map((o) => o.name)]), [['size', ['s', 'l']]]);
  assert.deepEqual(m.properties.map((p) => [p.name, p.kind]), [['showIcon', 'BOOLEAN'], ['showCount', 'BOOLEAN'], ['labelContent', 'TEXT']]);
  assert.deepEqual(Object.values(m.layers).map((l) => l.path), ['Content', 'Content/icon', 'Content/Label']);
  assert.deepEqual(m.binds, { 'Content/Label|fill': ['chipFilter/label/color'], 'Content|gap': ['spacing/s'] });
  assert.equal(modelOf('nothing', captures), null);
});

test('every operation is checked against the system: a value, an unknown variable, layer or component is a question', () => {
  const g = ground([
    { op: 'bind', layer: 'Content/Label', field: 'fill', variable: '#ff0000' },
    { op: 'bind', layer: 'Content/Label', field: 'fill', variable: 'text/defualt' },
    { op: 'bind', layer: 'Content/Missing', field: 'fill', variable: 'text/default' },
    { op: 'addLayer', parent: 'Content', layer: { type: 'instance', of: 'avatar', name: 'avatar' } },
    { op: 'addLayer', parent: 'Content', layer: { type: 'text', name: 'Count' } },
    { op: 'bind', layer: 'Content/Label', field: 'fill', variable: 'text/default' },
  ], { captures, grammar, target: 'chipFilter' });
  assert.equal(g.questions.length, 5);
  assert.match(g.questions[0].ask, /#ff0000 is a value, not one of the system's variables/);
  assert.match(g.questions[1].ask, /no variable text\/defualt.*text\/default/);
  assert.match(g.questions[2].ask, /no layer Content\/Missing: its layers are Content, Content\/icon, Content\/Label/);
  assert.match(g.questions[3].ask, /no component avatar/);
  assert.match(g.questions[4].ask, /text styles/);
  assert.deepEqual(g.ops.map((o) => o.op), ['bind']);
});

test('new names are written the way the system writes them; what adds to the system is held, what removes is breaking', () => {
  const g = ground([
    { op: 'addOption', axis: 'size', option: 'XL', like: 'l' },
    { op: 'addProperty', name: 'show badge', kind: 'boolean', default: false, layer: 'Content/icon' },
    { op: 'removeProperty', name: 'labelContent' },
    { op: 'rename', what: 'layer', from: 'Content/Label', to: 'Text' },
  ], { captures, grammar, target: 'chipFilter' });
  assert.deepEqual(g.questions, []);
  assert.deepEqual(g.ops.map((o) => o.option ?? o.name ?? o.to), ['xl', 'showBadge', 'labelContent', 'Text']);
  assert.deepEqual(g.named.map((n) => `${n.from} → ${n.to}`), ['XL → xl', 'show badge → showBadge']);
  assert.deepEqual(g.held.map((h) => h.what), ['a new option, size=xl, on chipFilter', 'a new boolean property, showBadge, on chipFilter']);
  assert.match(g.breaking[0].what, /property labelContent removed/);
  // A layer the person did not name the system's way would be; an option it is like must exist.
  assert.match(ground([{ op: 'addOption', axis: 'size', option: 'm', like: 'xs' }], { captures, grammar, target: 'chipFilter' }).questions[0].ask, /like \(s, l\)/);
});

test('the difference between two reads: a renamed layer is renamed, a moved binding changed, a new option added', () => {
  const a = modelOf('chipFilter', captures);
  const b = predict(a, [{ op: 'rename', what: 'layer', from: 'Content/Label', to: 'Text' }, { op: 'addOption', axis: 'size', option: 'xl', like: 'l' }, { op: 'rebind', from: 'chipFilter/label/color', to: 'text/default' }], captures);
  const d = diffModels(a, b);
  assert.deepEqual(d.skeleton, [{ change: 'renamed', what: 'layer', from: 'Content/Label', to: 'Content/Text' }]);
  assert.deepEqual(d.architecture.map((x) => x.change + ' ' + x.what), ['added option size=xl', 'changed variants']);
  assert.deepEqual(d.variables, [{ change: 'changed', what: 'Content/Text fill', from: 'chipFilter/label/color', to: 'text/default' }]);
  assert.ok(diffLines(d).some((l) => /↻ layer: Content\/Label → Content\/Text/.test(l)));
});

test('a spec from a description: the component it is like, its name, and what it cannot ground asked', () => {
  assert.deepEqual(likeOf('a tag like the chipChoice, called tag', Object.keys(props)), { like: 'chipChoice', candidates: [] });
  assert.deepEqual(likeOf('a smaller chip for filters', Object.keys(props)).candidates.slice(0, 1), ['chipFilter']);
  assert.equal(nameOf('a tag like the chip, called tag'), 'tag');
  assert.equal(nameOf('make a pill like the chip in Figma'), 'pill');
  assert.equal(nameOf('make a pill in Figma, like the chip'), 'pill');
  assert.equal(nameOf('create a new component like the chip'), null);
  const { spec } = specOf({ description: 'a tag like chipFilter', like: 'chipFilter', name: 'Tag', captures, grammar });
  const x = spec[EXT];
  assert.equal(spec.name, 'tag');
  assert.equal(spec.kind, 'component');
  assert.deepEqual(spec.traits.map((t) => t.id), ['size', 'showIcon', 'showCount']);
  assert.deepEqual(spec.uses, [{ to: 'icon' }]);
  assert.deepEqual(x.held.map((h) => h.what), ['a new component, tag, built like chipFilter']);
  // The like's own variable is the new component's to choose; every component here carries a description.
  assert.ok(x.questions.some((q) => /chipFilter binds 1 variable made for it \(chipFilter\/label\/color\)/.test(q.ask)));
  assert.ok(x.questions.some((q) => /description/.test(q.ask)));
  assert.ok(x.notes.some((n) => /2 values bound to no variable/.test(n)));
  const answered = specOf({ description: 'a tag', like: 'chipFilter', name: 'tag', captures, grammar, ops: [{ op: 'rebind', from: 'chipFilter/label/color', to: 'text/default' }, { op: 'describe', text: 'A tag.' }] }).spec;
  assert.deepEqual(answered[EXT].questions, []);
  assert.ok(specLines(answered).some((l) => /How it differs from chipFilter/.test(l)));
});

// ── The script, run on a stand-in for Figma ──
function fakeFigma() {
  const reg = new Map(); let seq = 0;
  class N {
    constructor(type, name, extra = {}) { this.type = type; this.name = name; this.id = `n${++seq}`; this.children = []; this.parent = null; this.x = 0; this.y = 0; this.width = 100; this.height = 40; this.fills = []; this.strokes = []; this.boundVariables = {}; this.description = ''; Object.assign(this, extra); reg.set(this.id, this); }
    appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); }
    insertChild(i, c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.splice(i, 0, c); }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); reg.delete(this.id); }
    clone() { const c = new N(this.type, this.name, { componentPropertyDefinitions: this.componentPropertyDefinitions ? JSON.parse(JSON.stringify(this.componentPropertyDefinitions)) : undefined, componentPropertyReferences: this.componentPropertyReferences ? { ...this.componentPropertyReferences } : undefined, fills: JSON.parse(JSON.stringify(this.fills)), boundVariables: { ...this.boundVariables }, description: this.description, mainComponent: this.mainComponent }); for (const k of this.children) c.appendChild(k.clone()); return c; }
    findAll(f) { const out = []; const walk = (n) => { for (const k of n.children) { if (f(k)) out.push(k); walk(k); } }; walk(this); return out; }
    findOne(f) { return this.findAll(f)[0] ?? null; }
    setBoundVariable(f, v) { this.boundVariables[f] = { type: 'VARIABLE_ALIAS', id: v.id }; }
    addComponentProperty(name, type, def) { const k = `${name}#${++seq}`; this.componentPropertyDefinitions[k] = { type, defaultValue: def }; return k; }
    editComponentProperty(k, { name, defaultValue }) { const d = this.componentPropertyDefinitions[k]; delete this.componentPropertyDefinitions[k]; if (defaultValue !== undefined) d.defaultValue = defaultValue; this.componentPropertyDefinitions[name ? `${name}#${k.split('#')[1] ?? ''}` : k] = d; }
    deleteComponentProperty(k) { delete this.componentPropertyDefinitions[k]; }
    resizeWithoutConstraints(w, h) { this.width = w; this.height = h; }
    get defaultVariant() { return this.children[0]; }
    createInstance() { return new N('INSTANCE', this.name, { mainComponent: this }); }
    async loadAsync() {}
  }
  const page = new N('PAGE', 'Chips'), section = new N('SECTION', 'Chips');
  page.appendChild(section);
  const vars = [{ id: 'V:1', name: 'chipFilter/label/color' }, { id: 'V:2', name: 'text/default' }];
  const variant = (vn) => { const v = new N('COMPONENT', vn); const content = new N('FRAME', 'Content'); const label = new N('TEXT', 'Label', { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'V:1' } } }], fontName: { family: 'Inter', style: 'Regular' }, characters: 'Label' }); content.appendChild(new N('INSTANCE', 'icon')); content.appendChild(label); v.appendChild(content); return v; };
  const set = new N('COMPONENT_SET', 'chipFilter', { componentPropertyDefinitions: { size: { type: 'VARIANT' }, 'showIcon#1:2': { type: 'BOOLEAN', defaultValue: true } } });
  set.appendChild(variant('size=s')); set.appendChild(variant('size=l'));
  section.appendChild(set);
  const figma = {
    mixed: Symbol('mixed'), root: { children: [page] }, currentPage: page,
    getNodeByIdAsync: async (id) => reg.get(id) ?? null,
    getLocalTextStylesAsync: async () => [], loadFontAsync: async () => {},
    variables: { getLocalVariablesAsync: async () => vars, setBoundVariableForPaint: (p, f, v) => ({ ...p, boundVariables: { [f]: { type: 'VARIABLE_ALIAS', id: v.id } } }) },
  };
  return { figma, set, section };
}
const run = (script, figma) => new (Object.getPrototypeOf(async () => {}).constructor)('figma', script)(figma);

test('the build script copies the component, adds an option, a property, moves a binding and writes its description', async () => {
  const { figma, set, section } = fakeFigma();
  const ops = [
    { op: 'clone', from: 'chipFilter', name: 'tag' },
    { op: 'addOption', axis: 'size', option: 'xl', like: 'l' },
    { op: 'addProperty', name: 'showBadge', kind: 'boolean', default: false, layer: 'Content/icon' },
    { op: 'rebind', from: 'chipFilter/label/color', to: 'text/default' },
    { op: 'describe', text: 'A tag.' },
  ];
  const out = await run(opsScript(ops, { nodes: { chipFilter: set.id } }), figma);
  assert.deepEqual(out.missing, []);
  const tag = section.children.find((n) => n.name === 'tag');
  assert.ok(tag && tag !== set);
  assert.deepEqual(tag.children.map((v) => v.name), ['size=s', 'size=l', 'size=xl']);
  assert.equal(tag.description, 'A tag.');
  const key = Object.keys(tag.componentPropertyDefinitions).find((k) => k.startsWith('showBadge#'));
  assert.ok(key);
  for (const v of tag.children) assert.equal(v.children[0].children[0].componentPropertyReferences.visible, key);
  for (const v of tag.children) assert.equal(v.children[0].children[1].fills[0].boundVariables.color.id, 'V:2');
  // The component it is a copy of is not touched.
  assert.equal(set.children.length, 2);
  assert.equal(set.children[0].children[0].children[1].fills[0].boundVariables.color.id, 'V:1');
  assert.equal(out.node, tag.id);
});

test('a change script names what it could not find, and changes nothing else', async () => {
  const { figma, set } = fakeFigma();
  const out = await run(opsScript([{ op: 'rename', what: 'layer', from: 'Content/Nope', to: 'Text' }, { op: 'removeOption', axis: 'size', option: 's' }], { target: set.id, what: 'figma-change' }), figma);
  assert.deepEqual(out.missing, ['layer Content/Nope']);
  assert.deepEqual(set.children.map((v) => v.name), ['size=l']);
});

test('--spec and --figma-build: asked, held for sign-off, then the script the guard lets run', () => {
  const root = tempDir('builder-');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ figmaFileKey: 'KEY', writes: { figma: 'ask' }, paths: { compPropsSnapshot: 'src/props.json', snapshotStructure: 'src/structure.json', snapshotVars: 'src/vars.json', snapshotSkeleton: 'src/skeleton.json' } }));
  writeFileSync(join(root, 'src/props.json'), JSON.stringify(props));
  writeFileSync(join(root, 'src/structure.json'), JSON.stringify({ components: structure }));
  writeFileSync(join(root, 'src/vars.json'), JSON.stringify({ variableScopes: varNames }));
  writeFileSync(join(root, 'src/skeleton.json'), JSON.stringify(skeleton));
  writeFileSync(join(root, 'component-values.snapshot.json'), JSON.stringify(values));
  const cli = (...args) => { try { return execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '' } }); } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };
  assert.match(cli('--spec', 'something for filters'), /Which of the system's components is it like\? .*chipFilter/s);
  const first = cli('--spec', 'a tag like chipFilter, called tag');
  assert.match(first, /tag: a spec built like chipFilter, 2 variants/);
  assert.match(first, /To answer before it is built \(2\)/);
  assert.match(cli('--figma-build', 'tag'), /not built while something is unanswered/);
  const opsFile = join(root, 'ops.json');
  writeFileSync(opsFile, JSON.stringify([{ op: 'rebind', from: 'chipFilter/label/color', to: 'text/default' }, { op: 'describe', text: 'A tag.' }]));
  assert.match(cli('--spec', '--name', 'tag', '--ops', opsFile), /--figma-build tag --signed-off/);
  assert.match(cli('--figma-build', 'tag'), /waits for someone to sign it off/);
  assert.ok(!existsSync(join(root, '.design-system-engine-out/handback/figma-apply.js')));
  const built = cli('--figma-build', 'tag', '--signed-off', 'the system owner');
  assert.match(built, /Building tag in Figma \(3 steps\), signed off by the system owner/);
  assert.match(built, /only when they say yes, run the script .*use_figma \(fileKey KEY\)/);
  const script = readFileSync(join(root, '.design-system-engine-out/handback/figma-apply.js'), 'utf8');
  assert.match(script, /"op": "clone"/);
  const spec = JSON.parse(readFileSync(join(root, '.design-system-engine-out/specs/tag.spec.json'), 'utf8'));
  assert.equal(spec[EXT].signedOff.by, 'the system owner');
});

test('a new component asked for in Figma routes to its spec; Figma\'s roles and construction fixes keep their own', () => {
  const c = { components: ['chip', 'button', 'tag'] };
  assert.deepEqual([route('make a pill like the chip in Figma', c).recipe, route('make a pill like the chip in Figma', c).run], ['build-component-figma', ['rms-design-system-engine --spec "make a pill like the chip in Figma"']]);
  assert.equal(route('cria um novo componente no Figma, como o chip', c).recipe, 'build-component-figma');
  assert.equal(route('add the roles in Figma', c).recipe, 'figma-edits');
  assert.equal(route('fix the construction of the chip in Figma', c).recipe, 'figma-edits');
  assert.equal(route('build the chip from Figma', c).recipe, 'build-from-figma');
});
