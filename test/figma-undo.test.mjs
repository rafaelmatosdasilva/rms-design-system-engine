// figma-undo.mjs: every Figma write the engine makes records what it is about to replace, so the change has a way
// back. Each family of write is made against a stand-in for the Figma plugin API, then put back from the record the
// run returned, and the stand-in is asserted to be as it was. A write that destroys what Figma keeps no copy of has
// no way back: the record says so and the script refuses rather than putting the file half back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyScript, figmaEdits, renameEdits, devModeEdits, gapEdits } from '../lib/figma-edits.mjs';
import { opsScript } from '../lib/figma-ops.mjs';
import { undoScript, undoSteps, undoRecord, undoLines, writeUndo, cannotUndo, UNDO_KINDS } from '../lib/figma-undo.mjs';
import { figmaWriteVerdict, noteFigmaRun } from '../lib/guard.mjs';
import { tempDir } from './helpers.mjs';

// ── A stand-in for the Figma plugin API: nodes that keep what is set on them, so a value put back can be read back ──
let nid = 0;
function node(type, name, more = {}) {
  const n = {
    id: 'n' + (++nid), type, name, children: [], x: 0, y: 0, width: 10, height: 10, description: '', annotations: [],
    componentPropertyDefinitions: {}, componentPropertyReferences: null, boundVariables: {}, fills: [], strokes: [],
    appendChild(k) { if (k.parent) k.parent.children.splice(k.parent.children.indexOf(k), 1); this.children.push(k); k.parent = this; },
    insertChild(i, k) { if (k.parent) k.parent.children.splice(k.parent.children.indexOf(k), 1); this.children.splice(i, 0, k); k.parent = this; },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.removed = true; },
    resize(w, h) { this.width = w; this.height = h; },
    resizeWithoutConstraints(w, h) { this.width = w; this.height = h; },
    setBoundVariable(f, v) { if (v) this.boundVariables[f] = { id: v.id }; else delete this.boundVariables[f]; },
    findAll(p) { const out = []; const walk = (x) => { for (const c of x.children || []) { if (p(c)) out.push(c); walk(c); } }; walk(this); return out; },
    addComponentProperty(name, type, def) { const k = name + '#1:' + (++nid); this.componentPropertyDefinitions[k] = { type, defaultValue: def }; return k; },
    editComponentProperty(k, v) { const d = this.componentPropertyDefinitions[k]; if (v.name != null) { delete this.componentPropertyDefinitions[k]; this.componentPropertyDefinitions[v.name + (k.match(/#[^#]*$/) ?? [''])[0]] = d; } if (v.defaultValue !== undefined) d.defaultValue = v.defaultValue; },
    deleteComponentProperty(k) { delete this.componentPropertyDefinitions[k]; },
    getDevResourcesAsync: async () => n.dev,
    addDevResourceAsync: async (url, file) => { n.dev.push({ url, file }); },
    deleteDevResourceAsync: async (url) => { n.dev = n.dev.filter((r) => r.url !== url); },
    dev: [], ...more,
  };
  n.clone = () => { const c = node(n.type, n.name); c.width = n.width; c.height = n.height; reg(c); return c; };
  return n;
}
let all = {};
const reg = (n) => { all[n.id] = n; for (const c of n.children || []) reg(c); return n; };
function world({ vars = [], styles = [] } = {}) {
  all = {};
  const doc = { children: [] };
  return {
    mixed: Symbol('mixed'), root: doc,
    getNodeByIdAsync: async (id) => (all[id] && !all[id].removed ? all[id] : null),
    loadFontAsync: async () => {}, getLocalTextStylesAsync: async () => styles,
    createPage() { const p = node('PAGE', ''); p.parent = doc; doc.children.push(p); reg(p); return p; },
    createFrame: () => reg(node('FRAME', '')), createText: () => reg(node('TEXT', '')),
    createComponent: () => reg(node('COMPONENT', '')),
    combineAsVariants: (comps) => { const s = reg(node('COMPONENT_SET', '')); for (const c of comps) s.appendChild(c); return s; },
    variables: {
      getLocalVariablesAsync: async () => vars,
      getVariableByIdAsync: async (id) => vars.find((v) => v.id === id) ?? null,
      setBoundVariableForPaint: (p, _f, v) => ({ ...p, boundVariables: { color: { id: v.id } } }),
    },
    annotations: { getAnnotationCategoriesAsync: async () => [{ id: 'c1', label: 'Accessibility Review' }], addAnnotationCategoryAsync: async ({ label }) => ({ id: 'c-' + label, label }) },
  };
}
// The script is the body of an async function, not text pasted into one: it already ends in a return and awaits
// inside, and nothing of it is interpolated into code here (as test/figma-edits.test.mjs runs a rename script).
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const go = (script, figma) => new AsyncFunction('figma', script)(figma);
// A change made, then put back from the record the run returned.
async function roundTrip(script, figma) {
  const made = await go(script, figma);
  assert.ok(Array.isArray(made.undo), 'the run reports what it replaced');
  const back = await go(undoScript(made.undo), figma);
  return { made, back };
}

test('the vocabulary a record may use is closed: a step of any other kind is never read as a way back', () => {
  assert.deepEqual(undoSteps({ undo: [{ kind: 'name', id: '1:1', was: 'x' }] }), [{ kind: 'name', id: '1:1', was: 'x' }]);
  assert.equal(undoSteps({ undo: [{ kind: 'drop the file', id: '1:1' }] }), null, 'a kind the engine does not know is no record');
  assert.equal(undoSteps({ changed: ['a'] }), null, 'a run that reported no record gives none');
  assert.equal(undoSteps(null), null);
  assert.equal(undoSteps('not json'), null);
  // The MCP hands the answer back wrapped, and sometimes as text: the record is found either way.
  assert.deepEqual(undoSteps({ content: [{ type: 'text', text: JSON.stringify({ undo: [{ kind: 'delete', id: 'n1', what: 'x' }] }) }] }), [{ kind: 'delete', id: 'n1', what: 'x' }]);
  assert.ok(UNDO_KINDS.includes('cannot') && UNDO_KINDS.includes('remade'));
});

test('a role annotation added by the hand-back is put back as it was, and a second run records nothing', async () => {
  const figma = world();
  const n = reg(node('COMPONENT_SET', 'button', { annotations: [{ label: 'Keep the label short' }] }));
  const script = applyScript([{ kind: 'role', component: 'button', nodeId: n.id, label: 'Role: button' }]);
  const made = await go(script, figma);
  assert.deepEqual(made.changed, ['button → Role: button']);
  assert.deepEqual(made.undo.map((s) => s.kind), ['annotations']);
  assert.deepEqual(n.annotations, [{ label: 'Keep the label short' }, { label: 'Role: button' }]);
  assert.deepEqual((await go(script, figma)).undo, [], 'a second run changes nothing, so it records nothing to put back');
  const back = await go(undoScript(made.undo), figma);
  assert.deepEqual(back.undone, ['button: annotations put back']);
  assert.deepEqual(n.annotations, [{ label: 'Keep the label short' }], 'the annotation the design team wrote is still there, the engine\'s is gone');
});

test('a Dev Mode link to the code is removed again, and a variable\'s code syntax goes back to what it was', async () => {
  const had = { id: 'v1', name: 'chip/radius', codeSyntax: { WEB: 'var(--old)' }, setVariableCodeSyntax(p, v) { this.codeSyntax[p] = v; }, removeVariableCodeSyntax(p) { delete this.codeSyntax[p]; } };
  const none = { id: 'v2', name: 'chip/gap', codeSyntax: {}, setVariableCodeSyntax(p, v) { this.codeSyntax[p] = v; }, removeVariableCodeSyntax(p) { delete this.codeSyntax[p]; } };
  const figma = world({ vars: [had, none] });
  const set = reg(node('COMPONENT_SET', 'chip'));
  const edits = devModeEdits([{ component: 'chip', nodeId: set.id, url: 'https://example.com/chip', file: 'chip.css' }],
    [{ variable: 'chip/radius', css: '--chip-radius' }, { variable: 'chip/gap', css: '--chip-gap' }]);
  const made = await go(applyScript(edits), figma);
  assert.deepEqual(set.dev, [{ url: 'https://example.com/chip', file: 'chip.css' }], 'the link is there');
  assert.equal(had.codeSyntax.WEB, 'var(--chip-radius)');
  const back = await go(undoScript(made.undo), figma);
  assert.deepEqual(set.dev, [], 'the link is gone again');
  assert.deepEqual(had.codeSyntax, { WEB: 'var(--old)' }, 'the syntax the team had written is back');
  assert.deepEqual(none.codeSyntax, {}, 'a variable that had none has none again');
  assert.equal(back.failed.length, 0);
  assert.ok(made.undo.some((s) => s.kind === 'devResource') && made.undo.filter((s) => s.kind === 'codeSyntax').length === 2);
});

test('every rename the hand-back makes is named back: an option in each variant, a property, the component, a layer', async () => {
  const figma = world();
  const set = reg(node('COMPONENT_SET', 'buttonX', { componentPropertyDefinitions: { 'label-content#1:2': { type: 'TEXT' } } }));
  const v = node('COMPONENT', 'state=default, show=true'); set.appendChild(v); reg(v);
  const layer = node('FRAME', 'Lbl'); v.appendChild(layer); reg(layer);
  const edits = renameEdits({ buttonX: { nodeId: set.id } }, [
    { component: 'buttonX', kind: 'option', prop: 'state', name: 'default', want: 'Default', why: 'w' },
    { component: 'buttonX', kind: 'property', name: 'label-content', want: 'Label Content', why: 'w' },
    { component: 'buttonX', kind: 'component', name: 'buttonX', want: 'button', why: 'w' },
    { component: 'buttonX', kind: 'layer', name: 'Lbl', want: 'Label', why: 'w' },
  ]);
  const { made, back } = await roundTrip(applyScript(edits), figma);
  assert.ok(made.changed.length >= 3, made.changed.join('; '));
  assert.equal(back.failed.length, 0, back.failed.join('; '));
  assert.equal(set.name, 'buttonX', 'the component is named as it was');
  assert.equal(v.name, 'state=default, show=true', 'the variant is named as it was');
  assert.equal(layer.name, 'Lbl', 'the layer is named as it was');
  assert.deepEqual(Object.keys(set.componentPropertyDefinitions), ['label-content#1:2'], 'the property is named as it was');
});

test('the page, frames and cards the hand-back creates are removed again; its own frame written afresh is said, never refused on', async () => {
  const figma = world();
  const edits = gapEdits([{ need: 'a toggle switch', kind: 'component', closest: null, used: 'chip', prototypes: ['notify'] }]);
  const script = applyScript(edits);
  const first = await go(script, figma);
  assert.equal(figma.root.children.length, 1, 'the page is there');
  assert.ok(first.undo.some((s) => s.kind === 'delete'));
  // A second run writes the frame afresh over the engine's own: said as remade, and the record is still complete.
  const second = await go(script, figma);
  const remade = second.undo.filter((s) => s.kind === 'remade');
  assert.equal(remade.length, 1, 'the frame it replaced was its own from the run before');
  assert.equal(undoRecord(second.undo).complete, true, 'replacing the engine\'s own output loses no one else\'s work');
  assert.match(undoLines(undoRecord(second.undo)).join('\n'), /was the engine's own from an earlier run and was written afresh: run the hand-back again/);
  const back = await go(undoScript(second.undo), figma);
  assert.equal(back.refused, false);
  assert.equal(figma.root.children[0].children.length, 0, 'the frame this run wrote is gone again');
});

test('a component built in Figma is deleted again, which is the whole way back: nothing existed before it', async () => {
  const figma = world();
  const script = opsScript([{ op: 'create', name: 'quokka', axes: [{ name: 'size', options: ['s', 'l'] }] }], { what: 'figma-build' });
  const { made, back } = await roundTrip(script, figma);
  assert.match(made.changed[0], /quokka: built with 2 variants/);
  assert.deepEqual(made.undo.filter((s) => s.kind === 'cannot'), [], 'building adds, so it takes nothing away');
  assert.equal(undoRecord(made.undo).complete, true);
  assert.equal(back.refused, false);
  assert.match(back.undone.join(' '), /removed again/);
  assert.ok(Object.values(all).find((n) => n.name === 'quokka').removed, 'the component the builder made is gone');
});

test('a change to a component is put back: its description, its name, a new option\'s variants and a bound variable', async () => {
  const v = { id: 'v9', name: 'space/4' };
  const figma = world({ vars: [v] });
  const set = reg(node('COMPONENT_SET', 'chip', { description: 'the description the team wrote' }));
  const l = node('COMPONENT', 'size=l'); set.appendChild(l); reg(l);
  const script = opsScript([
    { op: 'describe', text: 'written by the engine' },
    { op: 'rename', what: 'component', from: 'chip', to: 'tag' },
    { op: 'addOption', axis: 'size', option: 'xl', like: 'l' },
    { op: 'bind', layer: '', field: 'gap', variable: 'space/4' },
  ], { target: set.id, what: 'figma-change' });
  const made = await go(script, figma);
  assert.equal(set.description, 'written by the engine');
  assert.equal(set.name, 'tag');
  assert.equal(set.children.length, 2);
  assert.deepEqual(l.boundVariables, { itemSpacing: { id: 'v9' } }, 'the variable is bound on each variant');
  const back = await go(undoScript(made.undo), figma);
  assert.equal(back.refused, false, back.why);
  assert.equal(back.failed.length, 0, back.failed.join('; '));
  assert.equal(set.description, 'the description the team wrote', 'the description is back');
  assert.equal(set.name, 'chip', 'the name is back');
  assert.deepEqual(set.children.map((c) => c.name), ['size=l'], 'the variants the change copied in are gone');
  assert.deepEqual(l.boundVariables, {}, 'a field that was bound to nothing is bound to nothing again');
  assert.ok(made.undo.some((s) => s.kind === 'boundVariable') && made.undo.some((s) => s.kind === 'description'));
});

test('a property added to a component is removed again, and what its layers were wired to is put back', async () => {
  const figma = world();
  const set = reg(node('COMPONENT_SET', 'chip'));
  const v = node('COMPONENT', 'size=l'); set.appendChild(v); reg(v);
  const icon = node('FRAME', 'Icon', { componentPropertyReferences: { visible: 'old#1:1' } }); v.appendChild(icon); reg(icon);
  const script = opsScript([{ op: 'addProperty', name: 'showIcon', kind: 'boolean', default: true, layer: 'Icon' }], { target: set.id, what: 'figma-change' });
  const { back } = await roundTrip(script, figma);
  assert.equal(back.refused, false, back.why);
  assert.deepEqual(Object.keys(set.componentPropertyDefinitions), [], 'the property is gone again');
  assert.deepEqual(icon.componentPropertyReferences, { visible: 'old#1:1' }, 'the layer is wired as it was');
});

test('a default a change set is put back to the value it had, not to nothing', async () => {
  const figma = world();
  const set = reg(node('COMPONENT_SET', 'chip', { componentPropertyDefinitions: { 'label#1:2': { type: 'TEXT', defaultValue: 'Chip' } } }));
  const { back } = await roundTrip(opsScript([{ op: 'setDefault', property: 'label', value: 'Tag' }], { target: set.id, what: 'figma-change' }), figma);
  assert.equal(back.failed.length, 0, back.failed.join('; '));
  assert.equal(set.componentPropertyDefinitions['label#1:2'].defaultValue, 'Chip');
});

test('a variant, a layer or a property removed has no way back: the record says so and the script refuses, changing nothing', async () => {
  for (const [ops, says] of [
    [[{ op: 'removeOption', axis: 'size', option: 's' }], /a variant Figma removes is gone/],
    [[{ op: 'removeLayer', layer: 'Icon' }], /a layer Figma removes is gone/],
    [[{ op: 'removeProperty', name: 'label' }], /takes its definition and every layer wired to it/],
  ]) {
    const figma = world();
    const set = reg(node('COMPONENT_SET', 'chip', { componentPropertyDefinitions: { 'label#1:2': { type: 'TEXT' } } }));
    const s = node('COMPONENT', 'size=s'); set.appendChild(s); reg(s);
    const icon = node('FRAME', 'Icon'); s.appendChild(icon); reg(icon);
    const made = await go(opsScript(ops, { target: set.id, what: 'figma-change' }), figma);
    const cannot = cannotUndo(made.undo);
    assert.equal(cannot.length, 1, `${ops[0].op}: ${JSON.stringify(made.undo)}`);
    assert.match(cannot[0].why, says);
    assert.equal(undoRecord(made.undo).complete, false);
    const back = await go(undoScript(made.undo), figma);
    assert.equal(back.refused, true, `${ops[0].op} is refused`);
    assert.deepEqual(back.undone, [], 'nothing was put back');
    assert.match(back.why, /version history is the only way back/);
  }
});

test('one step with no way back refuses the whole change, so a file is never left looking undone when it is not', async () => {
  const figma = world();
  const set = reg(node('COMPONENT_SET', 'chip'));
  const l = node('COMPONENT', 'size=l'); set.appendChild(l); reg(l);
  const s = node('COMPONENT', 'size=s'); set.appendChild(s); reg(s);
  const made = await go(opsScript([
    { op: 'addOption', axis: 'size', option: 'xl', like: 'l' },      // a way back: delete what was copied in
    { op: 'removeOption', axis: 'size', option: 's' },               // none: the variant is gone
  ], { target: set.id, what: 'figma-change' }), figma);
  assert.ok(made.undo.some((x) => x.kind === 'delete') && made.undo.some((x) => x.kind === 'cannot'));
  const back = await go(undoScript(made.undo), figma);
  assert.equal(back.refused, true);
  assert.deepEqual(set.children.map((c) => c.name).sort(), ['size=l', 'size=xl'], 'the copied variant is still there: the file was not put half back');
  const lines = undoLines(undoRecord(made.undo)).join('\n');
  assert.match(lines, /cannot be taken back in full/);
  assert.match(lines, /putting part of a change back leaves the file looking undone when it is not/);
});

test('a step whose node someone deleted since is reported, and never stops the rest', async () => {
  const figma = world();
  const a = reg(node('COMPONENT_SET', 'one')), b = reg(node('COMPONENT_SET', 'two'));
  const made = await go(opsScript([{ op: 'rename', what: 'component', from: 'one', to: 'uno' }], { target: a.id, what: 'figma-change' }), figma);
  a.removed = true;                                                  // someone deleted it in Figma meanwhile
  const back = await go(undoScript([...made.undo, { kind: 'name', id: b.id, was: 'two', what: 'two' }]), figma);
  assert.equal(back.undone.length, 1, 'the step it could reach was put back');
  assert.equal(back.failed.length, 1);
  assert.match(back.failed[0], /is not in this file any more/);
});

test('the way back is written beside the change, and a run that reported none writes no script and says so', () => {
  const root = tempDir('figma-undo-');
  const dir = join(root, '.design-system-engine-out', 'handback');
  mkdirSync(dir, { recursive: true });
  const apply = applyScript([{ kind: 'role', component: 'button', nodeId: '1:1', label: 'Role: button' }]);
  writeFileSync(join(dir, 'figma-apply.js'), apply);
  const event = (response) => ({ tool_name: 'mcp__figma__use_figma', tool_input: { code: apply }, tool_response: response });
  // A run that reported what it replaced: the way back is written, and the guard lets it run after a yes.
  const said = { changed: ['button → Role: button'], undo: [{ kind: 'annotations', id: '1:1', was: [], what: 'button' }] };
  const lines = noteFigmaRun(event(said), { root, cfg: {} });
  assert.match(lines.join('\n'), /The way back from this change \(1 step\), written beside it/);
  const record = JSON.parse(readFileSync(join(dir, 'figma-undo.json'), 'utf8'));
  assert.deepEqual([record.complete, record.steps, record.what], [true, 1, '--figma-edits']);
  const undoJs = readFileSync(join(dir, 'figma-undo.js'), 'utf8');
  assert.equal(figmaWriteVerdict(undoJs, { root, userText: 'yes, take it back' }), null, 'the way back runs after a yes');
  assert.equal(figmaWriteVerdict(undoJs, { root, userText: 'what would it change?' }).decision, 'ask', 'and never before one');
  assert.equal(figmaWriteVerdict(undoJs.replace('n.remove()', 'figma.root.children[0].remove()'), { root, userText: 'yes' }).decision, 'deny', 'a script of the agent\'s own is still refused');
  // A run that reported no record: nothing claims the change can be taken back.
  const none = tempDir('figma-undo-none-');
  mkdirSync(join(none, '.design-system-engine-out', 'handback'), { recursive: true });
  writeFileSync(join(none, '.design-system-engine-out', 'handback', 'figma-apply.js'), apply);
  const said2 = noteFigmaRun(event({ changed: ['button → Role: button'] }), { root: none, cfg: {} });
  assert.match(said2.join('\n'), /reported no way back, so the engine cannot take this change back/);
  assert.equal(existsSync(join(none, '.design-system-engine-out', 'handback', 'figma-undo.js')), false, 'no script is written where there is no record');
  // Not the engine's script, a read, and hooks off: nothing is written either way.
  assert.equal(noteFigmaRun({ tool_name: 'mcp__figma__use_figma', tool_input: { code: 'const n = await figma.getNodeByIdAsync("1:1"); return n.annotations;' } }, { root, cfg: {} }), null);
  assert.equal(noteFigmaRun(event(said), { root, cfg: { hooks: false } }), null);
  assert.equal(noteFigmaRun({ tool_name: 'Edit', tool_input: { file_path: 'a.css' } }, { root, cfg: {} }), null);
});

test('once the way back has run, the run is recorded so the change report can say whether the file is back', () => {
  const root = tempDir('figma-undone-');
  const dir = join(root, '.design-system-engine-out', 'handback');
  mkdirSync(dir, { recursive: true });
  const apply = applyScript([{ kind: 'role', component: 'button', nodeId: '1:1', label: 'Role: button' }]);
  writeFileSync(join(dir, 'figma-apply.js'), apply);
  noteFigmaRun({ tool_name: 'mcp__figma__use_figma', tool_input: { code: apply }, tool_response: { undo: [{ kind: 'annotations', id: '1:1', was: [], what: 'button' }] } }, { root, cfg: {} });
  const undoJs = readFileSync(join(dir, 'figma-undo.js'), 'utf8');
  assert.equal(existsSync(join(dir, 'figma-undone.json')), false);
  const lines = noteFigmaRun({ tool_name: 'mcp__figma__use_figma', tool_input: { code: undoJs }, tool_response: { undone: ['button: annotations put back'], failed: [] } }, { root, cfg: {} });
  assert.match(lines.join('\n'), /The way back ran\. NEXT: refresh the Figma snapshots/);
  assert.match(lines.join('\n'), /--change-report/);
  assert.ok(JSON.parse(readFileSync(join(dir, 'figma-undone.json'), 'utf8')).at);
  // It refused and changed nothing: said as a refusal, never as a way back that ran and left the file wrong.
  const no = noteFigmaRun({ tool_name: 'mcp__figma__use_figma', tool_input: { code: undoJs }, tool_response: { refused: true, undone: [], cannot: [{ what: 'size=s removed' }] } }, { root, cfg: {} });
  assert.match(no.join('\n'), /refused to run and changed nothing/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'figma-undone.json'), 'utf8')).refused, true);
  // A new change clears it: the report must never say an older change was taken back.
  noteFigmaRun({ tool_name: 'mcp__figma__use_figma', tool_input: { code: apply }, tool_response: { undo: [{ kind: 'annotations', id: '1:1', was: [], what: 'button' }] } }, { root, cfg: {} });
  assert.equal(existsSync(join(dir, 'figma-undone.json')), false, 'the next change starts with no way back run');
});

test('writeUndo keeps the record and the script together; no record, no files', () => {
  const root = tempDir('figma-undo-write-');
  assert.equal(writeUndo(root, null), null);
  assert.equal(writeUndo(root, undefined), null);
  const out = writeUndo(root, [{ kind: 'name', id: '1:1', was: 'chip', what: 'chip' }], { what: '--figma-change' });
  assert.ok(existsSync(out.json) && existsSync(out.script));
  assert.equal(JSON.parse(readFileSync(out.json, 'utf8')).what, '--figma-change');
  assert.match(readFileSync(out.script, 'utf8'), /the way back from --figma-change/);
});

test('a name read from Figma can never become code in the script that puts it back', () => {
  const hostile = '</script><script>figma.root.children[0].remove()</script>\u2028</SCRIPT><SCRIPT>x</SCRIPT>';
  const script = undoScript([{ kind: 'name', id: '1:1', was: hostile, what: hostile }]);
  assert.doesNotMatch(script, /\u2028/, 'a line separator is escaped too: it ends a line inside a string');
  // Case-insensitive on purpose: a name could carry </SCRIPT> as well, and the escaping has to cover both.
  assert.doesNotMatch(script, /<\/script>/i, 'the characters that could end the script are written as escapes');
  assert.doesNotMatch(script, /<script>/i);
  assert.ok(script.includes('\\u003c'), 'written as an escape instead');
});
