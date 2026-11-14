// Everything a design system holds, not only components (system-kinds.mjs): a pattern, a template, a page or a flow
// built from the system's own of that kind, and a foundation as a new variable beside the one it is like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { kindOf, examplesOf, kindRules, composeOps, foundationOps, kindSpec } from '../lib/system-kinds.mjs';
import { ground, opsScript, opWords } from '../lib/figma-ops.mjs';
import { undoScript } from '../lib/figma-undo.mjs';
import { EXT } from '../lib/component-spec.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const components = ['headerPage', 'actionBar', 'toast', 'dataTable', 'emptyState', 'chip'];
const props = Object.fromEntries(components.map((c, i) => [c, { nodeId: `5:${i}`, properties: {} }]));
const templates = {
  settings: { name: 'settings', nodeId: '1:1', components: ['headerPage', 'dataTable', 'actionBar'] },
  orders: { name: 'orders', nodeId: '1:2', components: ['headerPage', 'dataTable', 'toast'] },
  profile: { name: 'profile', nodeId: '1:3', components: ['headerPage', 'emptyState'] },
};
const entities = [
  { layer: 'patterns', name: 'bulkActions', purpose: ['A data table with an action bar under it, for acting on many rows.'], rules: ['Show a toast once the action is done.'] },
  { layer: 'flows', name: 'checkout', purpose: ['From orders to settings, the way a person pays.'] },
];

test('what a request makes: the noun it makes, never a word that only says where', () => {
  assert.equal(kindOf('make a template like settings, called billing'), 'template');
  assert.equal(kindOf('create a new settings page like orders'), 'page');
  assert.equal(kindOf('build a pattern for bulk editing'), 'pattern');
  assert.equal(kindOf('design a checkout flow'), 'flow');
  assert.equal(kindOf('add a spacing token like spacing/32, called 40'), 'foundation');
  assert.equal(kindOf('make a chip for the settings page'), 'component');
  assert.equal(kindOf('a tag like the chip'), 'component');
  assert.equal(kindOf('anything', { kind: 'pattern' }), 'pattern');
  assert.equal(kindOf('renomeei a variável surface/old no Figma'), 'component', 'a change names a kind without making one');
  assert.equal(kindOf('remove the template header'), 'component');
});

test('the system\'s own of each kind, and what every one of them holds, read as rules', () => {
  const ex = examplesOf('template', { templates, entities, components });
  assert.deepEqual(ex.map((e) => [e.name, e.source, e.components]), [['settings', 'Figma', ['headerPage', 'dataTable', 'actionBar']], ['orders', 'Figma', ['headerPage', 'dataTable', 'toast']], ['profile', 'Figma', ['headerPage', 'emptyState']]]);
  const rules = kindRules('template', ex);
  assert.deepEqual(rules.map((r) => [r.says, r.status]), [['Every template holds headerPage', 'rule'], ['Most templates hold dataTable (2 of 3)', 'fix'], ['Every template opens with headerPage', 'rule']]);
  // A pattern from the intent layer: the components its page names, in the order it names them.
  assert.deepEqual(examplesOf('pattern', { entities, components }).map((e) => e.components), [['dataTable', 'actionBar', 'toast']]);
  // One example is not a rule.
  assert.deepEqual(kindRules('pattern', examplesOf('pattern', { entities, components })), []);
});

test('a template built like one of the system\'s: its components, what the request adds and drops, what a rule asks', () => {
  const ex = examplesOf('template', { templates, entities, components });
  const rules = kindRules('template', ex);
  const c = composeOps({ kind: 'template', name: 'billing', description: 'a template like settings with a toast, without the action bar', examples: ex, components, rules });
  assert.equal(c.like, 'settings');
  assert.deepEqual(c.ops[0], { op: 'create', name: 'billing', kind: 'frame', as: 'template', layout: { dir: 'VERTICAL' } });
  assert.deepEqual(c.ops.slice(1).map((o) => o.layer.of), ['headerPage', 'dataTable', 'toast']);
  assert.deepEqual(c.questions, []);
  // Without what every template holds: asked, never quietly given it.
  const bare = composeOps({ kind: 'template', name: 'billing', description: 'a template like profile without the header page', examples: ex, components, rules });
  assert.deepEqual(bare.ops.slice(1).map((o) => o.layer.of), ['emptyState']);
  assert.ok(bare.questions.some((q) => /Every template holds headerPage, and this one was asked without it/.test(q.ask)), JSON.stringify(bare.questions));
  // Nothing to start from: the system's own are named.
  assert.match(composeOps({ kind: 'template', name: 'x', description: 'a template', examples: ex, components, rules }).questions[0].ask, /Which of the system's templates is x like.*settings \(headerPage, dataTable, actionBar\)/);
  // Grounded as a component's spec is: a frame of the system's components, held for sign-off, asked where it goes.
  const { spec } = kindSpec({ kind: 'template', description: 'a template like settings', name: 'billing', like: 'settings', ops: c.ops, captures: { props } });
  assert.equal(spec.kind, 'template');
  assert.equal(spec[EXT].made, 'template');
  assert.ok(spec[EXT].held.some((h) => /a new template, billing, made of the system's own components/.test(h.what)));
  assert.ok(spec[EXT].questions.some((q) => /Which page and section does billing go on/.test(q.ask)));
  assert.deepEqual(spec.uses.map((u) => u.to), ['header-page', 'data-table', 'toast']);
  assert.match(opWords(c.ops[0]), /billing, a new template: a frame laid out top to bottom/);
});

test('a flow is the pages it goes through, side by side, each as the system composes it', () => {
  const ex = examplesOf('flow', { templates, entities: [...entities, { layer: 'pages', name: 'orders' }, { layer: 'pages', name: 'settings' }], components });
  assert.deepEqual(ex.map((e) => [e.name, e.components]), [['checkout', ['orders', 'settings']]]);
  const pages = examplesOf('page', { templates, entities, components });
  const c = composeOps({ kind: 'flow', name: 'refund', description: 'a flow from orders to settings', examples: pages, components });
  assert.equal(c.ops[0].layout.dir, 'HORIZONTAL');
  assert.deepEqual(c.ops.filter((o) => o.layer?.type === 'frame').map((o) => o.layer.name), ['orders', 'settings']);
  assert.deepEqual(c.ops.filter((o) => o.parent === 'orders').map((o) => o.layer.of), ['headerPage', 'dataTable', 'toast']);
  assert.match(composeOps({ kind: 'flow', name: 'refund', description: 'a refund flow', examples: [], components }).questions[0].ask, /Which pages does refund go through/);
});

const varNames = { 1: { name: 'spacing/32' }, 2: { name: 'size/40' }, 3: { name: 'size/32' }, 4: { name: 'primitives/grey/100' }, 5: { name: 'surface/muted' }, 6: { name: 'primitives/grey/900' } };
const captures = { props, varNames, aliases: { 'spacing/32': ['size/32'], 'surface/muted': ['primitives/grey/100'] }, aliasesByMode: { light: { 'surface/muted': ['primitives/grey/100'] }, dark: { 'surface/muted': ['primitives/grey/900'] } } };
const variables = Object.values(varNames).map((v) => v.name);

test('a foundation: a new variable beside the one it is like, pointing at one of the system\'s, never a value made up', () => {
  const f = foundationOps({ description: 'add a spacing token like spacing/32, called 40, pointing at size/40', variables });
  assert.deepEqual(f.ops, [{ op: 'addVariable', name: '40', like: 'spacing/32', alias: 'size/40' }]);
  const g = ground(f.ops, { captures });
  assert.deepEqual(g.questions, []);
  assert.equal(g.ops[0].name, 'spacing/40', 'it sits in the group of the one it is like');
  assert.deepEqual(g.held, [{ what: 'a new variable, spacing/40, beside spacing/32' }]);
  // A value where the one it is like points at a variable: asked.
  const raw = ground(foundationOps({ description: 'a token like spacing/32 called 40 of 40px', variables }).ops, { captures });
  assert.match(raw.questions[0].ask, /would hold 40, a value, where spacing\/32 points at size\/32/);
  // One that differs by mode needs one for each.
  const modes = ground([{ op: 'addVariable', name: 'surface/subtle', like: 'surface/muted', alias: 'primitives/grey/100' }], { captures });
  assert.match(modes.questions[0].ask, /points at a different variable in each mode \(light: primitives\/grey\/100, dark: primitives\/grey\/900\)/);
  assert.deepEqual(ground([{ op: 'addVariable', name: 'surface/subtle', like: 'surface/muted', byMode: { light: 'primitives/grey/100', dark: 'primitives/grey/900' } }], { captures }).questions, []);
  assert.match(ground([{ op: 'addVariable', name: 'spacing/40', like: 'spacing/32', alias: 'size/44' }], { captures }).questions[0].ask, /no variable size\/44/);
  assert.match(ground([{ op: 'addVariable', name: 'spacing/40', like: 'spacing/32' }], { captures }).questions[0].ask, /Which of the system's variables does spacing\/40 point at\? spacing\/32 points at size\/32/);
  assert.match(foundationOps({ description: 'a token like gap/99', variables }).questions[0].ask, /the system has no gap\/99/);
});

const run = (script, figma) => new (Object.getPrototypeOf(async () => {}).constructor)('figma', script)(figma);
test('the build script makes the variable in the collection of the one it is like, with its type and scopes, and takes it back', async () => {
  const col = { id: 'C:1', name: 'Spacing', modes: [{ modeId: 'm1', name: 'light' }, { modeId: 'm2', name: 'dark' }] };
  const made = [];
  const vars = [{ id: 'V:1', name: 'spacing/32', variableCollectionId: 'C:1', resolvedType: 'FLOAT', scopes: ['GAP'] }, { id: 'V:2', name: 'size/40', variableCollectionId: 'C:2', resolvedType: 'FLOAT' }];
  const figma = {
    mixed: Symbol('mixed'), currentPage: { children: [] }, getNodeByIdAsync: async () => null, getLocalTextStylesAsync: async () => [],
    variables: {
      getLocalVariablesAsync: async () => vars,
      getVariableCollectionByIdAsync: async (id) => (id === 'C:1' ? col : null),
      createVariable: (name, c, type) => { const v = { id: `V:new${made.length}`, name, collection: c.name, type, values: {}, setValueForMode(m, x) { this.values[m] = x; }, remove() { made.splice(made.indexOf(this), 1); } }; made.push(v); return v; },
      createVariableAlias: (v) => ({ type: 'VARIABLE_ALIAS', id: v.id }),
      getVariableByIdAsync: async (id) => made.find((v) => v.id === id) ?? null,
    },
  };
  const out = await run(opsScript([{ op: 'addVariable', name: 'spacing/40', like: 'spacing/32', alias: 'size/40' }]), figma);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(made.map((v) => [v.name, v.collection, v.type, v.scopes]), [['spacing/40', 'Spacing', 'FLOAT', ['GAP']]]);
  assert.deepEqual(made[0].values, { m1: { type: 'VARIABLE_ALIAS', id: 'V:2' }, m2: { type: 'VARIABLE_ALIAS', id: 'V:2' } });
  assert.match(out.changed[0], /spacing\/40: a new variable in Spacing, pointing at size\/40/);
  const back = await run(undoScript(out.undo, { what: 'the new variable' }), figma);
  assert.deepEqual(back.failed, []);
  assert.equal(made.length, 0, 'the way back removes it');
});

test('--spec for a template and a foundation, then --figma-build: the same path a component takes', () => {
  const root = tempDir('kinds-');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ figmaFileKey: 'KEY', writes: { figma: 'ask' }, paths: { compPropsSnapshot: 'src/props.json', snapshotStructure: 'src/structure.json', snapshotVars: 'src/vars.json', snapshotSkeleton: 'src/skeleton.json', snapshotTemplates: 'src/templates.json' } }));
  writeFileSync(join(root, 'src/props.json'), JSON.stringify(props));
  writeFileSync(join(root, 'src/structure.json'), JSON.stringify({ components: {} }));
  writeFileSync(join(root, 'src/skeleton.json'), '{}');
  writeFileSync(join(root, 'src/templates.json'), JSON.stringify({ templates }));
  writeFileSync(join(root, 'src/vars.json'), JSON.stringify({ variableScopes: varNames, otherAliases: captures.aliases }));
  const cli = (...args) => { try { return execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '' } }); } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };
  const t = cli('--spec', 'make a template like settings with a toast, called billing');
  assert.match(t, /How this system builds a template \(its 3\): Every template holds headerPage \(rule\)/);
  assert.match(t, /billing: a spec of a template built like settings/);
  assert.match(t, /a toast instance toast in its own frame/);
  assert.match(t, /Which page and section does billing go on/);
  const opsFile = join(root, 'ops.json');
  const spec = JSON.parse(readFileSync(join(root, '.design-system-engine-out/specs/billing.spec.json'), 'utf8'));
  writeFileSync(opsFile, JSON.stringify([...spec[EXT].ops, { op: 'place', page: 'Templates' }]));
  assert.match(cli('--spec', '--name', 'billing', '--ops', opsFile), /--figma-build billing --signed-off/);
  assert.match(cli('--figma-build', 'billing', '--signed-off', 'the system owner'), /Building billing in Figma \(6 steps\), signed off by the system owner/);
  assert.match(readFileSync(join(root, '.design-system-engine-out/handback/figma-apply.js'), 'utf8'), /"as": "template"/);
  const f = cli('--spec', 'add a spacing token like spacing/32, called 40, pointing at size/40');
  assert.match(f, /spacing\/40: a spec of a foundation built like spacing\/32/);
  assert.match(f, /--figma-build spacing-40 --signed-off/);
  assert.match(cli('--figma-build', 'spacing-40', '--signed-off', 'the system owner'), /a new variable spacing\/40 beside spacing\/32, pointing at size\/40/);
});

test('a template written in code: the system\'s tags nested as the spec nests them, no props of its own', async () => {
  const { predict } = await import('../lib/figma-ops.mjs');
  const { codeFromSpec } = await import('../lib/spec-to-code.mjs');
  const model = predict(null, [
    { op: 'create', name: 'billing', kind: 'frame', as: 'template', layout: { dir: 'VERTICAL' } },
    { op: 'addLayer', parent: '', layer: { type: 'instance', name: 'headerPage', of: 'headerPage' } },
    { op: 'addLayer', parent: '', layer: { type: 'frame', name: 'Body', layout: { dir: 'HORIZONTAL' } } },
    { op: 'addLayer', parent: 'Body', layer: { type: 'instance', name: 'dataTable', of: 'dataTable' } },
  ], { props });
  const vue = codeFromSpec(model, { framework: 'vue', folder: 'src/templates' });
  assert.equal(vue.file, 'src/templates/Billing.vue');
  assert.match(vue.text, /<div class="billing">\n    <header-page class="billing__header-page" \/>\n    <div class="billing__body">\n      <data-table class="billing__data-table" \/>\n    <\/div>\n  <\/div>/);
  assert.doesNotMatch(vue.text, /defineProps/);
  assert.match(vue.text, /\.billing__body \{\n  display: flex;\n  flex-direction: row;/);
  const jsx = codeFromSpec(model, { framework: 'jsx', folder: 'src/templates' });
  assert.match(jsx.text, /<HeaderPage className="billing__header-page" \/>/);
  assert.match(jsx.text, /export function Billing\(\) \{/);
});

test('a request for one in Figma routes to its spec, and a component for a page stays a component', async () => {
  const { route } = await import('../lib/route.mjs');
  for (const q of ['make a template like settings in figma, called billing', 'build a checkout flow in figma', 'add a spacing token like spacing/32 in figma, called 40']) {
    const r = route(q, { components });
    assert.equal(r.recipe, 'build-component-figma', q);
    assert.match(r.run[0], /--spec /);
  }
  assert.match(route('make a template like settings in figma', { components }).notes[0], /A new template in Figma: a frame of the system's own components/);
  assert.notEqual(route('make a chip for the settings page in figma', { components }).recipe, 'build-component-figma');
});

test('a template written in code holds nothing its spec could break out with', async () => {
  const { predict } = await import('../lib/figma-ops.mjs');
  const { codeFromSpec } = await import('../lib/spec-to-code.mjs');
  const model = predict(null, [
    { op: 'create', name: 'billing', kind: 'frame', as: 'template' },
    { op: 'addLayer', parent: '', layer: { type: 'text', name: 'Title', style: 'body/m', text: '</template><b> {{ x }}' } },
    { op: 'describe', text: 'Billing. */ alert(1) </script>' },
  ], { props });
  for (const framework of ['vue', 'jsx']) {
    const { text } = codeFromSpec(model, { framework });
    assert.doesNotMatch(text, /<\/template><b>|\*\/ alert|alert\(1\) <\/script>/, framework);
  }
});
