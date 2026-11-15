import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, destructiveKinds, destructiveFindings, destructiveLines } from '../lib/destructive.mjs';
import { habitFindings } from '../lib/page-quality.mjs';

test('a line that names a destructive action and says whether it can be undone is read as its kind', () => {
  assert.deepEqual(kindOf('Deleting a project is permanent.'), { verb: 'deleting', object: 'project', kind: 'permanent', within: null });
  assert.deepEqual(kindOf('Archiving a board can be undone for 30 days from the bin.'), { verb: 'archiving', object: 'board', kind: 'timed', within: '30 days' });
  assert.equal(kindOf('Removing a member can be undone.').kind, 'undoable');
  assert.equal(kindOf('Delete is red.'), null);
  assert.equal(kindOf('Use a dialog for long forms.'), null);
});

test('the kinds come from any page, its rules or a section titled for destructive actions, each action once', () => {
  const kinds = destructiveKinds([
    { name: 'Deleting', rules: [], sections: [{ title: 'Destructive actions', text: '- Delete project: permanent, it cannot be undone\n- Remove member: can be undone' }] },
    { name: 'dialog', rules: ['Deleting a project is permanent.'], sections: [] },
  ]);
  assert.deepEqual(kinds.map((k) => [k.action, k.kind, k.page]), [['delete project', 'permanent', 'Deleting'], ['remove member', 'undoable', 'Deleting']]);
  assert.match(destructiveLines(kinds).join('\n'), /- delete project: permanent\. It asks first, with the safe option selected\. \(Deleting\)/);
  assert.doesNotMatch(destructiveLines(kinds).join('\n'), /;/);
});

const btn = (text, attrs = {}, line = 1) => ({ name: 'Button', tag: null, attrs, text, line, children: [] });
const page = (...children) => ({ children });

test('a permanent action run with no confirmation, and one undoable behind a confirmation with no undo, are each said', () => {
  const kinds = destructiveKinds([{ name: 'Deleting', rules: ['Deleting a project is permanent.', 'Removing a member can be undone.', 'Archiving a board can be undone for 30 days.'], sections: [] }]);
  const f = destructiveFindings(page(btn('Delete project'), { name: 'ConfirmDialog', attrs: {}, children: [btn('Remove member', {}, 4)] }, btn('Archive board', {}, 7)), kinds, { markup: '' });
  assert.deepEqual(f.map((x) => x.line), [4, 7, 7]);
  assert.match(f[0].message, /"Remove member" can be undone .* asks for a confirmation first: run it at once and offer undo/);
  assert.match(f[1].message, /offers no undo/);
  assert.match(f[2].message, /does not say how long/);
  // Without a confirmation anywhere on the page, the permanent one is said too.
  const g = destructiveFindings(page(btn('Delete project')), kinds, { markup: '<Button>Delete project</Button>' });
  assert.match(g[0].message, /cannot be undone .* no confirmation: ask first, with the safe option selected/);
});

test('a confirmation that selects the permanent action first is said, and one that asks with the safe option selected is not', () => {
  const kinds = destructiveKinds([{ name: 'p', rules: ['Deleting a project is permanent.'], sections: [] }]);
  const bad = destructiveFindings(page({ name: 'Dialog', attrs: {}, children: [btn('Delete project', { autofocus: true }, 3)] }), kinds);
  assert.match(bad[0].message, /selects it first/);
  assert.deepEqual(destructiveFindings(page({ name: 'Dialog', attrs: {}, children: [btn('Cancel', { autofocus: true }), btn('Delete project')] }), kinds), []);
});

test('a dialog over another, two main actions in a dialog, and a destructive main action styled like any other are each said on any page', () => {
  const f = habitFindings(page({ name: 'Modal', attrs: {}, line: 1, children: [
    btn('Save', { variant: 'primary' }, 2), btn('Delete', { variant: 'primary' }, 3),
    { name: 'Dialog', attrs: {}, line: 4, children: [] },
  ] }));
  assert.deepEqual(f.map((x) => x.kind).sort(), ['dialog-destructive', 'dialog-primary', 'stacked']);
  const ok = habitFindings(page({ name: 'Dialog', attrs: {}, children: [btn('Cancel'), btn('Delete', { variant: 'danger' })] }));
  assert.deepEqual(ok, []);
});
