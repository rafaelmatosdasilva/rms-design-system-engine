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
