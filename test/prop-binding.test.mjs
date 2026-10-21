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
