// Which code prop a Figma property is, decided once for the prop check and the contract (prop-binding.mjs): a binding
// the project wrote, then a documented alias, then its Code Connect file, then the same name; a near name only suggests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindingSources, bindFigmaProp, suggestionFor, readingsOf } from '../prop-binding.mjs';

const codeProps = { tileSize: {}, label: {}, disabled: {}, icon: {} };

test('the strongest record wins: authored over alias over Code Connect; a recorded name before the same name', () => {
  const recorded = bindingSources({ codeConnect: { size: 'label' }, aliases: { size: 'disabled' }, authored: { size: 'tileSize' } });
  assert.deepEqual(recorded.size, { name: 'tileSize', source: 'authored' });
  assert.deepEqual(bindFigmaProp('size', { type: 'VARIANT' }, { codeProps, recorded }), { code: 'tileSize', as: 'prop', source: 'authored', exactName: true });
  const cc = bindingSources({ codeConnect: { captionWords: 'label' } });
  assert.deepEqual(bindFigmaProp('captionWords', { type: 'TEXT' }, { codeProps, recorded: cc }), { code: 'label', as: 'prop', source: 'codeConnect', exactName: true });
});

test('the same name, letter case aside, is a binding that says its name differs; a near name is never one', () => {
  assert.deepEqual(bindFigmaProp('Disabled', { type: 'VARIANT' }, { codeProps }), { code: 'disabled', as: 'prop', source: 'name', exactName: false });
  assert.equal(bindFigmaProp('size', { type: 'VARIANT' }, { codeProps }), null);
  assert.equal(suggestionFor('size', ['tileSize', 'label']), 'tileSize', 'tileSize contains size: a suggestion to record, not a binding');
  assert.equal(suggestionFor('on', ['button']), null, 'too short to suggest');
});

test('an instance swap is a prop, a named slot, or the default slot', () => {
  assert.deepEqual(bindFigmaProp('icon', { type: 'INSTANCE_SWAP' }, { codeProps }), { code: 'icon', as: 'prop', source: 'name', exactName: true });
  assert.deepEqual(bindFigmaProp('trailing', { type: 'INSTANCE_SWAP' }, { codeProps, slots: { named: ['Trailing'], default: false } }), { code: 'Trailing', as: 'slot', source: 'name', exactName: false });
  assert.deepEqual(bindFigmaProp('content', { type: 'INSTANCE_SWAP' }, { codeProps, slots: { named: [], default: true } }), { code: 'default', as: 'defaultSlot', source: 'name', exactName: true });
  assert.equal(bindFigmaProp('content', { type: 'INSTANCE_SWAP' }, { codeProps, slots: { named: [], default: false } }), null);
});

test('what a Code Connect file decides beyond a value: each attribute a property switches, negated or compared', () => {
  const cc = [
    { figma: 'revealCaption', code: 'label', role: 'condition' },
    { figma: 'revealCaption', code: 'icon', role: 'condition', negated: true },
    { figma: 'tone', code: 'shout', role: 'condition', equals: 'loud' },
    { figma: 'showLink', code: 'opened', role: 'condition', event: true },
    { figma: 'captionWords', code: 'label', role: 'value' },
  ];
  assert.deepEqual(readingsOf('revealCaption', cc), [{ code: 'label', role: 'condition' }, { code: 'icon', role: 'condition', negated: true }]);
  assert.deepEqual(readingsOf('tone', cc), [{ code: 'shout', role: 'condition', equals: 'loud' }]);
  assert.deepEqual(readingsOf('showLink', cc), [], 'an event listener is not a prop');
});

test('a key of an object prop is that prop at that key; every attribute a property fills is listed', async () => {
  const { valuesOf } = await import('../prop-binding.mjs');
  const recorded = bindingSources({ codeConnect: { captionWords: 'opts.caption' } });
  assert.deepEqual(bindFigmaProp('captionWords', { type: 'TEXT' }, { codeProps: { opts: {} }, recorded }), { code: 'opts', as: 'prop', source: 'codeConnect', exactName: true, key: 'caption' });
  assert.equal(bindFigmaProp('captionWords', { type: 'TEXT' }, { codeProps: { other: {} }, recorded }), null, 'no such object prop: no binding');
  const cc = [{ figma: 'helperWords', code: 'warning', role: 'value' }, { figma: 'helperWords', code: 'note', role: 'value' }, { figma: 'helperWords', code: 'warning', role: 'condition' }];
  assert.deepEqual(valuesOf('helperWords', cc), ['warning', 'note']);
});

test('the naming conventions pair only where the types agree; a near name is never one', async () => {
  const { conventionFor } = await import('../prop-binding.mjs');
  const cp = { caption: { type: 'string' }, heading: { type: 'string' }, tileSize: { type: 'string', options: ['s', 'm'] }, otherSize: { type: 'string', options: ['s', 'm', 'l'] }, isPinned: { type: 'boolean' }, alert: { type: 'boolean' } };
  assert.deepEqual(conventionFor('captionContent', { type: 'TEXT' }, cp), { code: 'caption', role: 'value', source: 'convention' });
  assert.deepEqual(conventionFor('showCaption', { type: 'BOOLEAN' }, cp), { code: 'caption', role: 'condition', source: 'convention' });
  assert.deepEqual(conventionFor('pinned', { type: 'VARIANT', variantOptions: ['true', 'false'] }, cp), { code: 'isPinned', role: 'value', source: 'convention' });
  assert.deepEqual(conventionFor('size', { type: 'VARIANT', variantOptions: ['m', 's'] }, cp), { code: 'tileSize', role: 'value', source: 'convention' }, 'the one prop ending in Size with the same options');
  assert.equal(conventionFor('subheadingContent', { type: 'TEXT' }, cp), null, 'subheading is not heading');
  assert.equal(conventionFor('alertContent', { type: 'TEXT' }, cp), null, 'a text is not an on/off prop');
  assert.equal(conventionFor('showAlert', { type: 'BOOLEAN' }, cp), null, 'an on/off prop is not shown by another');
});

test('a convention never says showX decides an x its Code Connect file always writes; a plural on/off pairs', async () => {
  const { conventionFor } = await import('../prop-binding.mjs');
  const cp = { badge: { type: 'string' }, showBadgeCounts: { type: 'boolean' } };
  assert.equal(conventionFor('showBadge', { type: 'BOOLEAN' }, cp, { codeConnectProps: [{ figma: 'Badge', code: 'badge', role: 'value' }] }), null);
  assert.deepEqual(conventionFor('showBadge', { type: 'BOOLEAN' }, cp, { codeConnectProps: [{ figma: 'Badge', code: 'badge', role: 'value' }, { figma: 'other', code: 'badge', role: 'condition' }] }), { code: 'badge', role: 'condition', source: 'convention' });
  assert.deepEqual(conventionFor('showBadgeCount', { type: 'VARIANT', variantOptions: ['false', 'true'] }, cp), { code: 'showBadgeCounts', role: 'value', source: 'convention' });
});

test('a Figma slot is the code\'s slot of its name, of the same word, or the only one each side has; an on/off that shows it is the slot filled', () => {
  const dialog = { slots: { named: ['sheet-body'], default: false }, figmaSlots: ['slotBody'] };
  assert.deepEqual(bindFigmaProp('slotBody', { type: 'SLOT' }, dialog), { code: 'sheet-body', as: 'slot', source: 'word', exactName: true });
  assert.deepEqual(bindFigmaProp('showBody', { type: 'BOOLEAN' }, dialog), { code: 'sheet-body', as: 'slotShown', source: 'slot', exactName: true });
  // The markup's case is the same name; an on/off for one slot of several finds its own.
  const card = { slots: { named: ['lead-slot', 'tail-slot'] }, figmaSlots: ['leadSlot', 'tailSlot'] };
  assert.equal(bindFigmaProp('tailSlot', { type: 'SLOT' }, card).code, 'tail-slot');
  assert.equal(bindFigmaProp('tailSlot', { type: 'SLOT' }, card).exactName, true);
  assert.equal(bindFigmaProp('showLeadSlot', { type: 'BOOLEAN' }, card).code, 'lead-slot');
  // The only slot each side has, named otherwise: paired, as a name the two write differently.
  assert.deepEqual(bindFigmaProp('slotBody', { type: 'SLOT' }, { slots: { named: ['mainAction'] }, figmaSlots: ['slotBody'] }), { code: 'mainAction', as: 'slot', source: 'only', exactName: false });
  assert.equal(bindFigmaProp('Slot', { type: 'SLOT' }, { slots: { named: [], default: true }, figmaSlots: ['Slot'] }).as, 'defaultSlot');
  // A slot the code fills through a prop is that prop; an on/off with a prop of its own name stays the prop.
  assert.deepEqual(bindFigmaProp('bars', { type: 'SLOT' }, { codeProps: { bars: {} }, slots: { named: ['legend', 'axis'] }, figmaSlots: ['bars', 'legend'] }), { code: 'bars', as: 'prop', source: 'name', exactName: true });
  assert.equal(bindFigmaProp('showBody', { type: 'BOOLEAN' }, { ...dialog, codeProps: { showBody: {} } }).as, 'prop');
  // With no Figma slot, an on/off is never read as one.
  assert.equal(bindFigmaProp('showFooter', { type: 'BOOLEAN' }, { slots: { named: ['footer'] } }), null);
});
