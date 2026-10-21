// What a component's events carry and what its scoped slots hand their content, read from its source, so a contract
// can state both (component-source.mjs extractEventPayloads, extractSlotProps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEventPayloads, extractSlotProps } from '../component-source.mjs';

test('each event with what the code passes it, once each; one sent with nothing has no payload', () => {
  const text = `<script setup>
const emit = defineEmits(['picked', 'closed', 'moved'])
const pick = (row) => { emit('picked', row.id) }
const pickAgain = (row) => emit('picked', row.id)
const close = () => emit('closed')
const move = (i) => emit('moved', { index: i, item: items[i] })
const moveBack = () => emit('moved', previous)
</script>`;
  assert.deepEqual(extractEventPayloads(text), { picked: ['row.id'], moved: ['{ index: i, item: items[i] }', 'previous'] });
});

test('each scoped slot with the props it hands its content; a slot with none is left out', () => {
  const text = `<template>
  <div>
    <slot name="row" :item="row" :index="i" />
    <slot name="footer" />
    <slot :open="isOpen"></slot>
    <slot :name="'dyn-' + key" :x="1" />
  </div>
</template>`;
  assert.deepEqual(extractSlotProps(text), { row: ['item', 'index'], default: ['open'] });
});

test('a default slot beside named ones, a slot named by an expression, and props behind comments are all read', async () => {
  const { extractSlots, textComponentApi } = await import('../component-source.mjs');
  const both = extractSlots('<template><div v-if="$slots.default"><slot/></div><slot name="trailing"/><slot :name="`row-${item.id}`"/></template>');
  assert.deepEqual([...both.named], ['trailing', 'row-${item.id}']);
  assert.equal(both.hasDefault, true);
  assert.equal(extractSlots('<template><slot name="top"/></template><script>const n = item.children</script>').hasDefault, false, 'item.children is data, not a slot');
  const vue = `<script setup>
defineProps({
  pinned: Boolean, /* stays open after a pick (or a second pick, when ranged) */
  tileName: String,
  // the label shown, can contain a } or a ,
  caption: { type: String, default: '}, x' },
  /* preview only */
  muted: Boolean
})
</script>`;
  assert.deepEqual(Object.keys(textComponentApi('Tile.vue', vue).props), ['pinned', 'tileName', 'caption', 'muted']);
});

test('a default the code builds is kept as its expression; a comment describing a shape gives no options', async () => {
  const { textComponentApi } = await import('../component-source.mjs');
  const vue = `<script setup>
/** @ranges {Object} the ranges per kind; expects { kind: [min, max] }
@size {String} the size, can be [s, m(default)] */
defineProps({
  ranges: { type: Object, default: () => { return { calm: [0, 40] } } },
  size: { type: String, default: 'm' },
  count: { type: Number, default: 3 },
  wait: { type: [String, Number], default: 3000 },
})
</script>`;
  const p = textComponentApi('Tile.vue', vue).props;
  assert.equal(p.ranges.defaultExpression, '() => { return { calm: [0, 40] } }');
  assert.equal(p.ranges.options, undefined, '[min, max] describes the shape, it lists no values');
  assert.match(p.ranges.description, /\{ kind: \[min, max\] \}/);
  assert.deepEqual([p.size.default, p.size.options, p.size.defaultExpression], ['m', ['s', 'm'], undefined]);
  assert.equal(p.wait.default, 3000, 'a number written as a number stays one');
});
