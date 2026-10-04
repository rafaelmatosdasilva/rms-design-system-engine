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
  for (const t of ['update Figma to match the code', 'add the roles in Figma', 'alinha o figma com o código']) assert.deepEqual([route(t, {}).recipe, route(t, {}).run], ['figma-edits', ['rms-design-system-engine --figma-edits']], t);
  assert.equal(route('change the chip radius in Figma to 12px so it matches the code', {}).recipe, 'fix-a-difference');
});
