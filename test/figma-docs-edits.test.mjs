// What the engine knows, written into the Figma file after a yes (figma-docs-edits.mjs): the intent layer's purposes as
// descriptions, a spec page beside each component set, and each token value the code changed first. Each script is run
// here against a stand-in for Figma, and each write leaves its way back (figma-undo.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionEdits, specPageEdits, tokenEdits, figmaValue, purposeOf, docsLines, DESC_CHUNK } from '../lib/figma-docs-edits.mjs';
import { applyScript, editLines } from '../lib/figma-edits.mjs';
import { undoScript, undoSteps } from '../lib/figma-undo.mjs';
import { resolveNamingSpec } from '../lib/naming-convention.mjs';

const run = (script, figma) => new Function('figma', `return (async () => {\n${script}\n})()`)(figma);
const spec = resolveNamingSpec({});

test('descriptions: only the team\'s word, never a draft; a token page found by its variable or its CSS name', () => {
  assert.equal(purposeOf({ purpose: ['**Draft:** a guess'], summary: '' }), '', 'a draft is not written');
  assert.equal(purposeOf({ purpose: ['Starts the main action.', 'One per screen.'] }), 'Starts the main action. One per screen.');
  const [d] = descriptionEdits({
    entities: [
      { kind: 'component', name: 'Card Tile', purpose: ['Groups one item.'] },
      { kind: 'component', name: 'cardRow', purpose: [] },
      { kind: 'token', name: '--acme-surface', purpose: ['The page behind everything.'] },
      { kind: 'token', name: 'acme/text', summary: 'Body text.' },
    ],
    components: { cardTile: '1:2', cardRow: '1:3' }, variables: ['acme/surface', 'acme/text'], spec,
  });
  assert.deepEqual(d.components, [{ component: 'cardTile', nodeId: '1:2', text: 'Groups one item.' }], 'a page with nothing approved writes nothing');
  assert.deepEqual(d.variables, [{ variable: 'acme/surface', text: 'The page behind everything.' }, { variable: 'acme/text', text: 'Body text.' }]);
  assert.deepEqual(descriptionEdits({ entities: [{ kind: 'component', name: 'x', purpose: ['**Draft:** y'] }], components: { x: '1:1' } }), []);
});

test('descriptions: written where Figma has none, one there kept and listed, each with its way back, in chunks', async () => {
  const tile = { id: '1:2', name: 'cardTile', description: '' }, row = { id: '1:3', name: 'cardRow', description: 'Set by a designer.' };
  const many = Array.from({ length: DESC_CHUNK + 5 }, (_, i) => ({ id: 'v' + i, name: 'acme/n' + i, description: '' }));
  const edits = descriptionEdits({ entities: [{ kind: 'component', name: 'cardTile', purpose: ['Groups one item.'] }, { kind: 'component', name: 'cardRow', purpose: ['A row.'] }, ...many.map((v) => ({ kind: 'token', name: v.name, purpose: ['For ' + v.name] }))],
    components: { cardTile: '1:2', cardRow: '1:3' }, variables: many.map((v) => v.name), spec });
  const figma = { getNodeByIdAsync: async (id) => ({ '1:2': tile, '1:3': row })[id] ?? null, variables: { getLocalVariablesAsync: async () => many } };
  const r = await run(applyScript(edits), figma);
  assert.equal(tile.description, 'Groups one item.');
  assert.equal(row.description, 'Set by a designer.', 'what a person wrote is never written over');
  assert.deepEqual(r.descKept, ['cardRow: Figma says "Set by a designer."']);
  assert.ok(r.changed.includes(`${DESC_CHUNK} variables described; 5 left for the next run`));
  const steps = undoSteps(r);
  assert.ok(steps.some((s) => s.kind === 'description' && s.id === '1:2' && s.was === ''));
  assert.equal(steps.filter((s) => s.kind === 'varDescription').length, DESC_CHUNK);
  // The way back puts each one back.
  const back = await new Function('figma', `return (async () => {\n${undoScript(steps)}\n})()`)({ getNodeByIdAsync: async (id) => ({ '1:2': tile })[id] ?? null, variables: { getVariableByIdAsync: async (id) => many.find((v) => v.id === id) ?? null } });
  assert.equal(back.failed.length, 0);
  assert.equal(tile.description, '');
  assert.equal(many[0].description, '');
});

test('spec pages: its properties, each variant\'s build and tokens, its role and what a screen reader says', () => {
  const [s] = specPageEdits({
    props: { cardTile: { nodeId: '1:2', properties: { 'Size': { type: 'VARIANT', defaultValue: 'm', variantOptions: ['s', 'm'] }, 'Label#1:0': { type: 'TEXT', defaultValue: 'Save' } } } },
    structure: { cardTile: { h: 32, paddingVar: { tb: 'padding/s', lr: 'padding/m' }, gapVar: 'gap/s', colors: { fill: { token: 'acme/fill' } }, defaultVariant: 'Size=m',
      variants: { 'Size=m': { h: 32 }, 'Size=s': { h: 24, colors: { fill: { token: 'acme/fill/small' } } } } } },
    views: [{ name: 'cardTile', a11y: { role: 'button', element: 'a <button>' } }], heard: { cardTile: ['Save, button'] },
  });
  assert.deepEqual(s.sections.map((x) => x.title), ['Properties', 'Sizes, spacing and tokens', 'Accessibility']);
  assert.deepEqual(s.sections[0].lines, ['Size (variant): s, m, default m', 'Label (text), default Save']);
  assert.deepEqual(s.sections[1].lines, ['Size=m: height 32px, padding padding/s top and bottom, padding/m sides, gap gap/s, fill acme/fill', 'Size=s: height 24px, fill acme/fill/small']);
  assert.deepEqual(s.sections[2].lines, ['Role: button, built as a <button>', 'A screen reader says: "Save, button"']);
});

test('spec pages: drawn beside the set, its parts numbered, written afresh each run', async () => {
  const made = [];
  const node = (type, extra = {}) => { const n = { type, name: '', children: [], visible: true, x: 0, y: 0, width: 10, height: 10, absoluteTransform: [[1, 0, 0], [0, 1, 0]], fills: [],
    appendChild(c) { this.children.push(c); c.parent = this; }, resize(w, h) { this.width = w; this.height = h; }, remove() { const p = this.parent; if (p) p.children = p.children.filter((x) => x !== this); }, ...extra }; made.push(n); return n; };
  const label = { type: 'TEXT', name: 'Label', visible: true, absoluteTransform: [[1, 0, 108], [0, 1, 8]] }, frame = { type: 'FRAME', name: 'Frame 3', visible: true, children: [], absoluteTransform: [[1, 0, 100], [0, 1, 0]] };
  const variant = { type: 'COMPONENT', createInstance: () => { const i = node('INSTANCE'); i.children = [label, frame]; i.absoluteTransform = [[1, 0, 100], [0, 1, 0]]; return i; } };
  const page = { type: 'PAGE', children: [], loadAsync: async () => {}, appendChild(c) { this.children.push(c); c.parent = this; } };
  const set = { id: '1:2', type: 'COMPONENT_SET', name: 'cardTile', x: 0, y: 0, width: 200, height: 50, parent: page, defaultVariant: variant, children: [variant] };
  page.children.push(set);
  const figma = { getNodeByIdAsync: async (id) => (id === '1:2' ? set : null), loadFontAsync: async () => {},
    createFrame: () => node('FRAME'), createText: () => node('TEXT', { characters: '' }), createEllipse: () => node('ELLIPSE') };
  const edits = specPageEdits({ props: { cardTile: { nodeId: '1:2', properties: {} } }, structure: {}, views: [], heard: {} });
  const r = await run(applyScript(edits), figma);
  const box = page.children.find((n) => n.name === 'Spec · cardTile');
  assert.ok(box && box.x === 320, 'beside the set');
  assert.ok(box.children.some((t) => t.characters === '1. Label'), 'a named part numbered; a frame Figma named by itself is not a part');
  assert.ok(r.changed.includes('cardTile: spec page'));
  const again = await run(applyScript(edits), figma);
  assert.equal(page.children.filter((n) => n.name === 'Spec · cardTile').length, 1, 'written afresh, never twice');
  assert.ok(undoSteps(again).some((s) => s.kind === 'remade' && s.what === 'Spec · cardTile'));
});

test('tokens: a value the code changed first is written; both moved, or an alias, is a person\'s', () => {
  assert.deepEqual(figmaValue('#ff0000'), { r: 1, g: 0, b: 0, a: 1 });
  assert.equal(figmaValue('12px'), 12);
  assert.equal(figmaValue('1rem'), null, 'no one Figma value');
  const agreed = { facts: { 'token acme/fill [light]': { figma: '#000000', code: '#000000' }, 'token acme/line [light]': { figma: '#111111', code: '#111111' }, 'token acme/alias [light]': { figma: '#222222', code: '#222222' }, 'token acme/back [light]': { figma: '#333333', code: '#333333' } } };
  const [t] = tokenEdits({
    facts: [
      { key: 'token acme/fill [light]', figma: '#000000', code: '#ff0000', same: false },
      { key: 'token acme/line [light]', figma: '#999999', code: '#888888', same: false },
      { key: 'token acme/alias [light]', figma: '#222222', code: '#ffffff', same: false },
      { key: 'token acme/back [light]', figma: '#444444', code: '#333333', same: false },
    ],
    agreed, aliases: { 'acme/alias': 'acme/base' },
    codeTokens: { '--acme-fill': { modes: { light: { value: '#ff0000' } } }, '--acme-new': { modes: { light: { value: '#00ff00' }, dark: { value: '#003300' } } } },
    figmaNames: ['acme/fill', 'acme/line', 'acme/alias', 'acme/back'], spec,
  });
  assert.deepEqual(t.changes.map((c) => [c.variable, c.mode, c.after]), [['acme/fill', 'light', '#ff0000']], 'only where the code moved; Figma moving is the code\'s to follow');
  assert.deepEqual(t.conflicts.map((c) => c.variable), ['acme/line', 'acme/alias']);
  assert.deepEqual(t.create.map((c) => [c.variable, c.type, Object.keys(c.values)]), [['acme/new', 'COLOR', ['light', 'dark']]]);
  const lines = docsLines([t]).join('\n');
  assert.match(lines, /acme\/fill \[light\]: #000000 → #ff0000/);
  assert.match(lines, /acme\/line \[light\]: Figma #999999, the code #888888: both changed it since they agreed/);
});

test('tokens: written in the mode, an alias left, a new one created beside its kin, each with its way back', async () => {
  const coll = { id: 'c1', name: 'Colours', modes: [{ modeId: 'm1', name: 'Light' }, { modeId: 'm2', name: 'Dark' }], defaultModeId: 'm1' };
  const v = (id, name, values) => ({ id, name, resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: values, setValueForMode(m, x) { this.valuesByMode[m] = x; }, remove() { this.gone = true; } });
  const fill = v('v1', 'acme/fill', { m1: { r: 0, g: 0, b: 0, a: 1 } }), ali = v('v2', 'acme/alias', { m1: { type: 'VARIABLE_ALIAS', id: 'v9' } });
  const vars = [fill, ali], created = [];
  const figma = { getNodeByIdAsync: async () => null, variables: {
    getLocalVariablesAsync: async () => vars, getLocalVariableCollectionsAsync: async () => [coll], getVariableByIdAsync: async (id) => [...vars, ...created].find((x) => x.id === id) ?? null,
    createVariable: (name, c, type) => { const n = v('n' + created.length, name, {}); n.resolvedType = type; created.push(n); return n; } } };
  const edits = [{ kind: 'tokens', conflicts: [],
    changes: [{ variable: 'acme/fill', mode: 'light', before: '#000000', after: '#ff0000', value: { r: 1, g: 0, b: 0, a: 1 } }, { variable: 'acme/alias', mode: 'light', before: '#222222', after: '#ffffff', value: { r: 1, g: 1, b: 1, a: 1 } }],
    create: [{ variable: 'acme/fill/new', cssVar: '--acme-fill-new', type: 'COLOR', values: { light: { r: 0, g: 1, b: 0, a: 1 }, dark: { r: 0, g: 0.2, b: 0, a: 1 } }, shown: {} }] }];
  const r = await run(applyScript(edits), figma);
  assert.deepEqual(fill.valuesByMode.m1, { r: 1, g: 0, b: 0, a: 1 });
  assert.equal(ali.valuesByMode.m1.type, 'VARIABLE_ALIAS', 'an alias is never written over');
  assert.deepEqual(r.tokKept, ['acme/alias [light]: an alias in Figma, left for a person']);
  assert.deepEqual(created[0].valuesByMode, { m1: { r: 0, g: 1, b: 0, a: 1 }, m2: { r: 0, g: 0.2, b: 0, a: 1 } }, 'each mode by its name');
  assert.ok(r.changed.includes('acme/fill/new: created in Colours'));
  const back = await new Function('figma', `return (async () => {\n${undoScript(undoSteps(r))}\n})()`)(figma);
  assert.deepEqual(back.failed, []);
  assert.deepEqual(fill.valuesByMode.m1, { r: 0, g: 0, b: 0, a: 1 }, 'the value put back');
  assert.ok(created[0].gone, 'the variable it created removed again');
});

test('what the run prints names them, and asks before any is written', () => {
  const lines = editLines([...specPageEdits({ props: { cardTile: { nodeId: '1:2', properties: {} } } }), { kind: 'tokens', changes: [], create: [], conflicts: [{ variable: 'a', mode: 'light', figma: '1', code: '2', why: 'both changed it since they agreed' }] }]).join('\n');
  assert.match(lines, /Spec pages beside each component set \(1\)/);
  assert.match(lines, /NEXT: show the person the spec pages above and ask/);
  assert.doesNotMatch(lines, /token values above/, 'a conflict alone is never offered as a write');
});
