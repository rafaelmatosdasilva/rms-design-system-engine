// Two questions an agent asks the documentation, answered from the intent layer (layer-questions.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenByPurpose, tokenAnswerer, absentComponent, questionLines, saysSomething } from '../layer-questions.mjs';

const layer = {
  system: { sections: [{ title: 'Before using the data', text: 'Read the agent sections first.' }] },
  entities: [
    { kind: 'token', name: 'semantic/danger/color', purpose: ['semantic/danger/color has Light and Dark mode values from Figma.'] },
    { kind: 'token', name: 'semantic/warning/color', purpose: ['semantic/warning/color aliases --primitives-yellow / --primitives-yellow.'] },
    { kind: 'token', name: 'semantic/link/color', purpose: ['The colour of a link in running text, and of its underline.'] },
    { kind: 'entry', name: 'Colors', purpose: ['How colour carries meaning.'], rules: [{ text: '| `--semantic-surface-color` | Default app and card background |' }] },
    { kind: 'component', name: 'Overlay Panel', whenNotToUse: ['For a passing confirmation, use a toast instead of a modal.'] },
  ],
};

test('which token is for this: a description, an entry that says more than its name, or a page that names it', () => {
  const describe = (t) => (t === 'semantic/brand' ? 'The brand colour, for the logo only.' : null);
  const r = tokenByPurpose(['semantic/brand', 'semantic/link', 'semantic/surface', 'semantic/danger', 'semantic/warning'], { layer, describe });
  assert.deepEqual(r.answered.map((a) => [a.token, a.from]), [['semantic/brand', 'Figma'], ['semantic/link', 'its entry in the intent layer'], ['semantic/surface', 'the Colors page']]);
  assert.deepEqual(r.missing, ['semantic/danger', 'semantic/warning'], 'an entry that only repeats its name and modes, or what it points at, is no answer');
  assert.equal(tokenAnswerer({ layer })('semantic/link/color'), 'its entry in the intent layer', 'named with its /color too');
  assert.equal(saysSomething('x/y has Light and Dark mode values from Figma.', 'x/y'), false);
  assert.equal(saysSomething('The colour of a link in running text.', 'link'), true);
});

test('is there a component the system does not have: answered by a rule for every case, or by naming the kind', () => {
  const names = ['overlayModal', 'actionButton'];
  const none = absentComponent(names, { layer });
  assert.equal(none.rule, null);
  assert.ok(!none.kinds.some((k) => k.kind === 'modal'), 'the system has a modal');
  assert.equal(none.kinds.find((k) => k.kind === 'toast').said, true, 'a page names the toast');
  assert.ok(none.answered < none.asked);
  assert.match(questionLines(null, none)[0], /None of the intent layer's pages says what to do when none fits, so an agent asked for a snackbar/);
  // A rule about one kind or one component answers for that one only; a rule for every case answers them all.
  const specific = absentComponent(names, { layer: { ...layer, entities: [...layer.entities, { kind: 'entry', name: 'A11y', rules: [{ text: 'Do not invent a custom alert component.' }] }, { kind: 'entry', name: 'Slots', rules: [{ text: 'Never invent a `headerSlot` component.' }] }] } });
  assert.equal(specific.rule, null);
  const general = absentComponent(names, { more: [{ name: 'AGENTS.md', lines: ['- Never invent a component: if none fits, say so and ask.'] }], layer });
  assert.deepEqual([general.rule?.where, general.answered === general.asked], ['AGENTS.md', true]);
  assert.match(questionLines(null, general)[0], /^Is there a component the system does not have\? Answered: AGENTS\.md says/);
});
