// engine-fixes.mjs - what the engine knows for certain, written into the files it owns, and only where the project
// says it may. Two lines are never crossed: what is judgement is written as a draft, and nothing a person wrote is
// overwritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sureFixes, withFixes, applyFixes, fixLines, rootElement, DRAFT } from '../engine-fixes.mjs';
import { makeFixture } from './helpers.mjs';

const system = () => ({
  components: {
    chip: { codeText: '<template><button class="tp-chip"><slot/></button></template>', description: 'A small, removable label', realUse: '<Chip size="m" label="Lisbon" />' },
    field: { codeText: '<template><label class="tp-field"><input></label></template>', description: 'One value a person types' },
    panel: { codeText: '<template><div class="tp-panel"><slot/></div></template>', description: 'A box that holds a section' },
  },
  authored: { components: { field: { semantics: { element: 'label' }, notes: 'One value a person types.' } } },
});

test('the element a component renders is read, never chosen: a box says nothing, and a team\'s own answer stands', () => {
  const fixes = sureFixes(system()).filter((f) => f.kind === 'semantics');
  assert.deepEqual(fixes.map((f) => `${f.component}:${f.to}`), ['chip:button']);
  assert.equal(fixes[0].why, 'its code renders <button>');
  assert.equal(fixes[0].draft, false);
  // panel renders a div: a box is not a semantic, and writing it down would be the engine inventing a fact.
  assert.equal(fixes.some((f) => f.component === 'panel'), false);
  // field already has an answer a person wrote: it is left exactly as it is.
  assert.equal(fixes.some((f) => f.component === 'field'), false);
  assert.deepEqual(sureFixes({}), []);
});

test('the root element is read in every framework the engine reads, and only a plain element counts', () => {
  assert.equal(rootElement('<template>\n  <button class="x"><slot/></button>\n</template>\n<script setup></script>'), 'button');
  assert.equal(rootElement('export function Chip({ label }) {\n  const cls = "x";\n  return (\n    <button type="button">{label}</button>\n  );\n}'), 'button');
  assert.equal(rootElement('export const X = () => <a href="/">go</a>;\nexport function Y() {\n  return <nav><X/></nav>;\n}'), 'nav', 'the element returned, not the first one written');
  assert.equal(rootElement('<script>let on = false;</script>\n<style>.x{}</style>\n<label class="tp-field"><input></label>'), 'label');
  // A tag that is another component says what that one renders, not what this one is.
  assert.equal(rootElement('export function Row() {\n  return (\n    <Stack gap="m" />\n  );\n}'), null);
  assert.equal(rootElement(''), null);
  assert.equal(rootElement('export const n = 1;'), null);
});

test('a note that says what the description already says is taken out; one that says something new is not', () => {
  const notes = sureFixes(system()).filter((f) => f.kind === 'note');
  assert.deepEqual(notes.map((f) => f.component), ['field']);
  assert.equal(notes[0].to, null, 'a removal, not a rewrite');
  assert.equal(notes[0].from, 'One value a person types.');
  // A note that adds something is a note: the engine never touches it.
  const s = system();
  s.authored.components.field.notes = 'Its label is read before its value by a screen reader.';
  assert.deepEqual(sureFixes(s).filter((f) => f.kind === 'note'), []);
});

test("the product's own first use is a draft, because choosing the example is judgement", () => {
  const ex = sureFixes(system()).filter((f) => f.kind === 'example');
  assert.deepEqual(ex.map((f) => f.component), ['chip']);
  assert.equal(ex[0].draft, true);
  assert.match(ex[0].to, new RegExp(`^\\*\\*Draft:\\*\\* <Chip `));
  // A component whose examples a person already wrote keeps them: the engine adds nothing beside them.
  const s = system();
  s.authored.components.chip = { guidance: { examples: ['<Chip label="Porto" />'] } };
  assert.deepEqual(sureFixes(s).filter((f) => f.kind === 'example'), []);
});

test('the fixes go into the authored contract and nowhere else, and never over what a person wrote', () => {
  const dir = makeFixture('engine-fixes');
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(system().authored, null, 2));
  const fixes = sureFixes(system());
  assert.equal(applyFixes(dir, fixes).written, fixes.length);
  const after = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  assert.equal(after.components.chip.semantics.element, 'button');
  assert.deepEqual(after.components.chip.guidance.examples, [`${DRAFT} <Chip size="m" label="Lisbon" />`]);
  assert.equal(after.components.field.semantics.element, 'label', "a person's own answer is still there");
  assert.equal('notes' in after.components.field, false, 'and the note that repeated it is gone');
  // Nothing to write writes nothing, and a file that is not JSON is never overwritten.
  assert.deepEqual(applyFixes(dir, []), { written: 0, file: null });
  writeFileSync(join(dir, 'contract.authored.json'), '{ not json');
  assert.throws(() => applyFixes(dir, fixes), /not valid JSON/);
  assert.equal(readFileSync(join(dir, 'contract.authored.json'), 'utf8'), '{ not json');
  // Pure: the same fixes on an empty contract build one, and the input is untouched.
  const was = {};
  assert.equal(withFixes(was, fixes).components.chip.semantics.element, 'button');
  assert.deepEqual(was, {});
});

test('a component is one component however each file spells it', () => {
  // The code calls it Chip, the contract calls it chip: writing under the code's spelling would quietly give the
  // project two of everything, each with half the answers.
  const fixes = sureFixes({
    components: { Chip: { codeText: '<template><button/></template>', description: 'A label' } },
    authored: { components: { chip: { notes: 'A label.' } } },
  });
  assert.deepEqual([...new Set(fixes.map((f) => f.component))], ['chip'], JSON.stringify(fixes));
  // And the note it already had, which repeats its description, is seen as that component's note.
  assert.deepEqual(fixes.map((f) => f.kind).sort(), ['note', 'semantics']);
  const after = withFixes({ components: { chip: { notes: 'A label.' } } }, fixes);
  assert.deepEqual(Object.keys(after.components), ['chip']);
  assert.equal(after.components.chip.semantics.element, 'button');
});

test('what a person reads follows what the project lets the engine write', () => {
  const fixes = sureFixes(system());
  assert.match(fixLines(fixes, { may: 'yes' })[0], /written into contract\.authored\.json/);
  assert.match(fixLines(fixes, { may: 'ask' })[0], /to write into contract\.authored\.json, once you say yes/);
  assert.match(fixLines(fixes, { may: 'no' })[0], /does not let the engine write its own files/);
  // When the engine knows why it may not, it says that instead of the general sentence.
  assert.match(fixLines(fixes, { may: 'no', why: 'on CI there is nobody to ask' })[0], /a task for whoever owns contract\.authored\.json \(on CI there is nobody to ask\)/);
  // A draft is always said to be one, and said apart from what is certain.
  const lines = fixLines(fixes, { may: 'ask' }).join('\n');
  assert.match(lines, /1 draft for a person to approve \(marked \*\*Draft:\*\*, never read as the team's own word\)/);
  assert.match(lines, /take out "One value a person types\."/);
  assert.deepEqual(fixLines([]), []);
});
