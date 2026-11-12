// The intent layer's approved words written into Figma's own descriptions (figma-descriptions.mjs), through the
// hand-back script (figma-edits.mjs) with its way back (figma-undo.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionPlan, chunkOf, templatedLines, wordsFor } from '../lib/figma-descriptions.mjs';
import { descriptionEdits, editLines, applyScript } from '../lib/figma-edits.mjs';

const tok = (name, purpose, extra = {}) => ({ kind: 'token', name, purpose, ...extra });
const comp = (name, purpose, extra = {}) => ({ kind: 'component', name, purpose, ...extra });
const toVar = (n) => '--' + n.split('/').join('-');
// Six tokens carry the same sentence with only their name changed: a template, said of none of them in particular.
const boiler = (n) => `CSS custom property \`${toVar(n)}\` referenced by the source. The theme supplies its value.`;
const names = ['acme/surface/color', 'acme/border/color', 'acme/text/color', 'acme/accent/color', 'acme/muted/color', 'acme/focus/color'];

test('only the approved words are written, never a draft, and nothing Figma holds is written over', () => {
  const entities = [
    tok(toVar('acme/brand/color'), ['The colour every primary action is filled with.'], { drafts: [{ text: 'A draft nobody approved.' }] }),
    tok(toVar('acme/danger/color'), ['Errors and destructive actions only.']),
    tok(toVar('acme/info/color'), ['Neutral notices.']),
    tok(toVar('acme/empty/color'), []),
  ];
  const variables = [
    { name: 'acme/brand/color', description: '' },
    { name: 'acme/danger/color', description: 'Errors and destructive actions only.' },
    { name: 'acme/info/color', description: 'Something a designer typed.' },
    { name: 'acme/empty/color', description: '' },
    { name: 'acme/nowhere/color', description: '' },
  ];
  const p = descriptionPlan({ entities, variables, toVar });
  assert.deepEqual(p.write.map((x) => [x.name, x.text]), [['acme/brand/color', 'The colour every primary action is filled with.']]);
  assert.ok(!p.write.some((x) => /draft/i.test(x.text)), 'a draft is never written');
  assert.equal(p.already, 1, 'one that already says the same is left as it is');
  assert.deepEqual(p.differs.map((x) => [x.name, x.figma, x.layer]), [['acme/info/color', 'Something a designer typed.', 'Neutral notices.']]);
  assert.equal(p.counts.write, 1);
});

test('a sentence that is the same on many pages with only the name changed is left out, and said', () => {
  const entities = names.map((n) => tok(toVar(n), [boiler(n)]));
  entities.push(tok(toVar('acme/brand/color'), [boiler('acme/brand/color'), 'The colour every primary action is filled with.']));
  const variables = [...names, 'acme/brand/color'].map((name) => ({ name, description: '' }));
  const p = descriptionPlan({ entities, variables, toVar });
  // The boilerplate line is left out wherever it is; a page with something of its own keeps that part.
  assert.deepEqual(p.write.map((x) => [x.name, x.text]), [['acme/brand/color', 'The colour every primary action is filled with.']]);
  assert.equal(p.leftOut.length, names.length);
  assert.match(p.leftOut[0].why, /same sentence/);
  assert.equal(templatedLines(entities).size, 1);
  assert.equal(wordsFor(entities.at(-1), templatedLines(entities)).left, 1);
});

test('a component is written through the pairing the intent layer makes, and one with nothing to pair is said', () => {
  const page = comp('Acme Button', ['The one primary action on a screen.']);
  const components = {
    acmeButton: { nodeId: '1:2', description: '', entity: page },
    acmeChip: { nodeId: '1:3', description: '', entity: null },
    acmeTag: { nodeId: null, description: '', entity: comp('Acme Tag', ['A status.']) },
  };
  const p = descriptionPlan({ entities: [page], components });
  assert.deepEqual(p.write.map((x) => [x.kind, x.name, x.nodeId, x.text]), [['component', 'acmeButton', '1:2', 'The one primary action on a screen.']]);
  assert.deepEqual(p.unpaired.map((x) => x.name).sort(), ['acmeChip', 'acmeTag']);
  assert.match(p.unpaired.find((x) => x.name === 'acmeTag').why, /no node/);
});

test('a file of thousands goes one part a run', () => {
  const plan = { write: Array.from({ length: 7 }, (_, i) => ({ kind: 'variable', name: `acme/v${i}`, text: 't' })) };
  assert.deepEqual([chunkOf(plan, 1, 3).items.length, chunkOf(plan, 3, 3).items.length, chunkOf(plan, 1, 3).of], [3, 1, 3]);
  assert.equal(chunkOf(plan, 99, 3).n, 3, 'a part past the last is the last');
  assert.deepEqual(chunkOf({ write: [] }).items, []);
});

test('the hand-back writes each description only where Figma\'s is still empty, and records the way back', () => {
  const edits = descriptionEdits({ items: [
    { kind: 'variable', name: 'acme/brand/color', text: 'The colour every primary action is filled with.' },
    { kind: 'component', name: 'acmeButton', nodeId: '1:2', text: 'The one primary action on a screen.' },
  ], n: 1, of: 2 });
  assert.equal(edits[0].kind, 'descriptions');
  assert.match(edits[0].why, /part 1 of 2/);
  const script = applyScript(edits);
  // Checked again in the file: a description a designer typed since the list was made is left, never written over.
  assert.match(script, /if \(String\(v\.description \|\| ''\)\.trim\(\)\) \{ keptOwn\.push/);
  assert.match(script, /if \(String\(n\.description \|\| ''\)\.trim\(\)\) \{ keptOwn\.push/);
  // The value replaced is recorded before it is written, for the way back.
  assert.ok(script.indexOf('U.variableDescription(v)') < script.indexOf('v.description = d.text'));
  assert.ok(script.indexOf('U.description(n)') < script.indexOf('n.description = d.text'));
  const said = editLines(edits).join('\n');
  assert.match(said, /Descriptions from the intent layer/);
  assert.match(said, /2 descriptions/);
  assert.deepEqual(descriptionEdits({ items: [] }), []);
});

test('the way back puts a variable\'s description back as it was', async () => {
  const { undoScript } = await import('../lib/figma-undo.mjs');
  const script = undoScript([{ kind: 'variableDescription', id: 'VariableID:1:2', was: '', what: 'acme/brand/color' }]);
  assert.match(script, /s\.kind === 'variableDescription'/);
  assert.match(script, /v\.description = s\.was/);
});
