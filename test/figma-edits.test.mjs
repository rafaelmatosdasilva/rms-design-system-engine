// figma-edits.mjs: the Figma side of the hand-back, written by the engine. A role is read from what the code renders,
// listed as an edit, and applied by a script that changes only what was listed, once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeRole, componentRole, figmaEdits, applyScript, editLines } from '../figma-edits.mjs';
import { figmaWriteVerdict } from '../guard.mjs';
import { route } from '../route.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('the role a component has in code, read from its markup', () => {
  assert.equal(codeRole('<button class="b">Save</button>').role, 'button');
  assert.equal(codeRole('<button aria-pressed="false" class="chip">x</button>').role, 'togglebutton');
  assert.equal(codeRole('<button aria-expanded="false">More</button>').role, 'disclosure');
  assert.equal(codeRole('<label class="radioButton"><input type="radio" name="a"> PDF</label>').role, 'radio');
  assert.equal(codeRole('<div class="field"><label>Name</label><input type="text"></div>').role, 'textbox');
  assert.equal(codeRole('<div class="s" role="switch" aria-checked="true"></div>').role, 'switch');
  assert.equal(codeRole('<a href="/x" class="l">x</a>').role, 'link');
  assert.equal(codeRole('<div class="card"><h2>t</h2><button>Go</button></div>'), null, 'a card with a button inside is not a button');
  assert.equal(codeRole('<div class="stepper"><button>-</button><input type="number"><button>+</button></div>'), null, 'several controls: a composite');
  assert.equal(codeRole('<span class="badge">High</span>'), null);
});

test('across every instance: the role most have, a number field among text fields is a text field, a split is left out', () => {
  assert.deepEqual(componentRole(['<button class="a">1</button>', '<button class="a">2</button>', '<div class="a">x</div>']).role, 'button');
  const field = componentRole(['<div class="i"><input type="number"></div>', '<div class="i"><input type="text"></div>', '<div class="i"><input></div>']);
  assert.equal(field.role, 'textbox');
  assert.equal(field.agree, 3);
  assert.equal(componentRole(['<button>x</button>', '<a href="#">y</a>']), null);
});

const SNAP = { button: { nodeId: '1:1', annotations: [] }, chip: { nodeId: '1:2', annotations: [{ label: 'Role: togglebutton' }] }, tag: { nodeId: '1:3', annotations: [{ label: 'Role: button' }] }, card: { nodeId: '1:4', annotations: [] }, _meta: {} };
const VIEW = [
  { name: 'button', markup: '<button class="button">Save</button>', markupFrom: 'page' },
  { name: 'chip', markup: '<button class="chip" aria-pressed="false">x</button>', markupFrom: 'jsx' },
  { name: 'tag', markup: '<a class="tag" href="#">x</a>', markupFrom: 'page' },
  { name: 'card', markup: '<div class="card"><button>x</button></div>', markupFrom: 'page' },
];

test('edits: a role Figma does not state is added; a role that differs is a decision; nothing else', () => {
  const edits = figmaEdits(SNAP, VIEW);
  assert.deepEqual(edits.map((e) => [e.kind, e.component, e.label ?? null]), [['role', 'button', 'Role: button'], ['role-differs', 'tag', null]]);
  assert.match(edits[0].why, /renders <button class="button">/);
  assert.equal(edits[1].decision, true);
  assert.deepEqual(figmaEdits(SNAP, [{ ...VIEW[0], markupFrom: 'role' }]), [], 'a markup drawn from a role is not the code');
  const lines = editLines(edits, { fileKey: 'K' }).join('\n');
  assert.match(lines, /button: add the annotation "Role: button"/);
  assert.match(lines, /For a person to decide \(1\)/);
  assert.match(lines, /NEXT: show the person the 1 change above and ask; only when they say yes, run .*figma-apply\.js with the Figma MCP's use_figma \(fileKey K\)/);
});

// The script, run against a stand-in for the Figma plugin API.
async function run(script, nodes) {
  const figma = { getNodeByIdAsync: async (id) => nodes[id] ?? null };
  return new Function('figma', `return (async () => { ${script} })();`)(figma);
}

test('the script adds only the listed role, keeps what was there, skips a role already stated, says what it could not find; a second run changes nothing', async () => {
  const edits = [...figmaEdits(SNAP, VIEW), { kind: 'role', component: 'gone', nodeId: '9:9', label: 'Role: button' }];
  const script = applyScript(edits);
  assert.doesNotMatch(script, /tag/, 'a decision is never in the script');
  const nodes = { '1:1': { annotations: [{ label: 'Keep the label short', labelMarkdown: '' }] } };
  assert.deepEqual(await run(script, nodes), { changed: ['button → Role: button'], skipped: [], missing: ['gone'] });
  assert.deepEqual(nodes['1:1'].annotations, [{ label: 'Keep the label short' }, { label: 'Role: button' }]);
  assert.deepEqual(await run(script, nodes), { changed: [], skipped: ['button'], missing: ['gone'] });
});

test('guard: Figma is written only by the engine\'s script, and only after a yes; reading is never stopped', () => {
  const root = mkdtempSync(join(tmpdir(), 'figma-guard-'));
  mkdirSync(join(root, '.design-system-engine-out', 'handback'), { recursive: true });
  const script = applyScript(figmaEdits(SNAP, VIEW));
  writeFileSync(join(root, '.design-system-engine-out', 'handback', 'figma-apply.js'), script);
  assert.equal(figmaWriteVerdict('const n = await figma.getNodeByIdAsync("1:1"); return n.annotations;', { root, userText: 'what roles does Figma have?' }), null);
  assert.equal(figmaWriteVerdict('const n = await figma.getNodeByIdAsync("1:1"); n.annotations = [{ label: "Role: button" }];', { root, userText: 'yes' }).decision, 'deny');
  assert.equal(figmaWriteVerdict(script, { root, userText: 'yes, apply them' }), null);
  assert.equal(figmaWriteVerdict(script, { root, userText: 'what would change?' }).decision, 'ask');
  assert.equal(figmaWriteVerdict(script.replace(/^\/\/.*\n/, ''), { root, userText: 'sim' }), null, 'the comment line may be left out');
});

test('router: bringing Figma in line with the code goes to the engine\'s edits; a value to change in Figma stays the person\'s', () => {
  for (const t of ['update Figma to match the code', 'update Figma so it states the roles the code has', 'add the roles in Figma', 'alinha o figma com o código', 'make figma match the code']) assert.deepEqual([route(t, {}).recipe, route(t, {}).run], ['figma-edits', ['rms-design-system-engine --figma-edits']], t);
  assert.equal(route('change the chip radius in Figma to 12px so it matches the code', {}).recipe, 'fix-a-difference');
  assert.notEqual(route('update the code to match Figma', {}).recipe, 'figma-edits', 'the code to Figma is the other way');
});

test('the prototypes\' gaps become the design team\'s to do list in Figma: its own page and frame, one card per need, written afresh', async () => {
  const { gapEdits } = await import('../figma-edits.mjs');
  assert.deepEqual(gapEdits([]), [], 'no gap, no list');
  const merged = [{ need: 'a toggle switch', kind: 'component', closest: null, used: 'chip', prototypes: ['notify', 'settings'] }, { need: 'a Page layout component', kind: 'layout', used: 'the engine\'s Page', prototypes: ['notify'] }];
  const edits = [...figmaEdits(SNAP, VIEW), ...gapEdits(merged)];
  const lines = editLines(edits).join('\n');
  assert.match(lines, /to do list in Figma, page "Design system to do", frame "Gaps from prototypes" \(2 needs the system lacks, from 2 prototypes, the most needed first\)/);
  assert.match(lines, /• a toggle switch: component · meanwhile: chip · needed in 2 prototypes: notify, settings/);
  assert.match(lines, /NEXT: show the person the 1 change and to do list above and ask/);
  const script = applyScript(edits);
  // A fake Figma: pages, frames and texts that keep what is set on them.
  const node = (type) => ({ type, name: '', children: [], x: 0, y: 0, appendChild(k) { this.children.push(k); k.parent = this; }, remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); } });
  const doc = { children: [] };
  const fake = { root: doc, getNodeByIdAsync: async (id) => ({ '1:1': { annotations: [] } })[id] ?? null, loadFontAsync: async () => {},
    createPage() { const p = node('PAGE'); p.parent = doc; doc.children.push(p); return p; }, createFrame: () => node('FRAME'), createText: () => node('TEXT') };
  const go = () => new Function('figma', `return (async () => { ${script} })();`)(fake);
  const r = await go();
  assert.equal(r.todo, 'Design system to do › Gaps from prototypes: 2 needs');
  const page = doc.children.find((p) => p.name === 'Design system to do');
  const list = page.children.find((n) => n.name === 'Gaps from prototypes');
  assert.deepEqual(list.children.slice(1).map((c) => c.name), ['a toggle switch', 'a Page layout component']);
  assert.equal(list.children[1].children[1].characters, 'component · meanwhile: chip · needed in 2 prototypes: notify, settings');
  await go();
  assert.equal(doc.children.length, 1, 'the page is found again, not made twice');
  assert.equal(page.children.length, 1, 'the list is written afresh, not added twice');
});

test('router: sending the prototypes\' gaps to Figma goes to the engine\'s edits, not to a new prototype', () => {
  for (const t of ['send the prototype gaps to Figma', 'put the gaps in Figma for the design team', 'manda as lacunas pro figma']) assert.equal(route(t, {}).recipe, 'figma-edits', t);
  assert.equal(route('prototype a settings page with our components', {}).recipe, 'prototype');
});

test('names written otherwise than the rest of the system are renamed in their component sets, options first, after a yes', async () => {
  const { renameEdits, applyScript, editLines } = await import('../figma-edits.mjs');
  const snap = { buttonX: { nodeId: '1:1' } };
  const edits = renameEdits(snap, [{ component: 'buttonX', kind: 'option', prop: 'state', name: 'default', want: 'Default', why: 'w' }, { component: 'buttonX', kind: 'property', name: 'label-content', want: 'Label Content', why: 'w' }, { component: 'none', kind: 'property', name: 'x', want: 'X' }]);
  assert.deepEqual(edits.map((e) => [e.what, e.from, e.to]), [['option', 'default', 'Default'], ['property', 'label-content', 'Label Content']], 'a component Figma has no node for is left out');
  assert.match(editLines(edits).join('\n'), /Names written as the rest of the system writes them \(2\):\n {3}• buttonX: state=default → Default\n {3}• buttonX: "label-content" → "Label Content"/);
  const set = { children: [{ name: 'state=default, show=true' }], componentPropertyDefinitions: { 'label-content#1:2': {}, state: {} }, editComponentProperty(k, v) { const d = this.componentPropertyDefinitions[k]; delete this.componentPropertyDefinitions[k]; this.componentPropertyDefinitions[v.name + (k.match(/#[\d:]+$/)?.[0] ?? '')] = d; } };
  const run = new (Object.getPrototypeOf(async function () {}).constructor)('figma', applyScript(edits));
  const figma = { getNodeByIdAsync: async (id) => (id === '1:1' ? set : null) };
  assert.deepEqual((await run(figma)).changed, ['buttonX: state=default → Default', 'buttonX: label-content → Label Content']);
  assert.deepEqual([set.children[0].name, Object.keys(set.componentPropertyDefinitions).join()], ['state=Default, show=true', 'state,Label Content#1:2']);
  assert.deepEqual((await run(figma)).changed, [], 'run again, nothing changes');
});
