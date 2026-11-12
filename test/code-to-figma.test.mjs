// A component only the code has, drawn into Figma from what the engine reads of it (code-to-figma.mjs): the operations
// a spec is built from, checked against the system by the same path a spec from a description takes (figma-ops.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsFromCode, variablesByCss } from '../lib/code-to-figma.mjs';
import { anatomyOf } from '../lib/code-grammar.mjs';
import { ground } from '../lib/figma-ops.mjs';

const vue = `<template>
  <div class="acme-pill" :class="['acme-pill--' + size]">
    <acme-icon v-if="showIcon" class="acme-pill__icon" :name="icon" />
    <span class="acme-pill__label">{{ label }}</span>
  </div>
</template>
<style scoped>
.acme-pill { display: inline-flex; gap: var(--space-xs); padding: var(--space-s); background-color: var(--surface-muted); border-radius: var(--radius-m); }
.acme-pill:hover { background-color: var(--surface-hover); }
.acme-pill__label { font-size: 13px; }
</style>`;
const api = { description: 'A short status, read at a glance.', props: { size: { type: 'string', options: ['s', 'm'] }, showIcon: { type: 'boolean', default: true }, icon: { type: 'string' }, label: { type: 'string', default: 'Active' } } };
const anatomy = anatomyOf({ file: 'src/Pill.vue', text: vue, styles: [{ file: 'src/Pill.vue', text: vue.replace(/[\s\S]*<style scoped>/, (m) => m.replace(/[^\n]/g, ' ')).replace(/<\/style>/, '') }], root: 'acme-pill', props: Object.keys(api.props) });
const varOf = variablesByCss({ 1: { name: 'space/xs' }, 2: { name: 'space/s' }, 3: { name: 'surface/muted' }, 4: { name: 'radius/m' } }, (n) => `--${n.replace(/\//g, '-')}`);
const componentOf = (tag) => (tag === 'acme-icon' ? 'acmeIcon' : null);

test('the operations of a component the code has: its axes, its parts, what each prop drives, each value bound', () => {
  const ops = opsFromCode({ name: 'acmePill', text: vue, api, anatomy, varOf, componentOf });
  assert.deepEqual(ops[0], { op: 'create', name: 'acmePill', axes: [{ name: 'size', options: ['s', 'm'] }], layout: { dir: 'HORIZONTAL' } });
  assert.deepEqual(ops.find((o) => o.op === 'describe'), { op: 'describe', text: 'A short status, read at a glance.' });
  assert.deepEqual(ops.filter((o) => o.op === 'addLayer').map((o) => [o.layer.type, o.layer.name, o.layer.of ?? o.layer.style ?? null]), [['instance', 'Icon', 'acmeIcon'], ['text', 'Label', null]]);
  assert.deepEqual(ops.filter((o) => o.op === 'addProperty').map((o) => [o.name, o.kind, o.layer]), [['showIcon', 'boolean', 'Icon'], ['label', 'text', 'Label']]);
  // Its base rule's values, each the system's variable; a hover's is that state's, never the component's own.
  assert.deepEqual(ops.filter((o) => o.op === 'bind').map((o) => [o.field, o.variable]), [['fill', 'surface/muted'], ['gap', 'space/xs'], ['padding', 'space/s'], ['radius', 'radius/m']]);
});

test('what the code cannot ground is a question of the spec, never a guess', () => {
  const ops = opsFromCode({ name: 'acmePill', text: vue, api, anatomy, varOf, componentOf });
  const captures = { props: { acmeIcon: { properties: {} } }, varNames: { 1: { name: 'space/xs' }, 2: { name: 'space/s' }, 3: { name: 'surface/muted' }, 4: { name: 'radius/m' } } };
  const g = ground(ops, { captures });
  // The label's text has no text style of the system's (13px written by hand): asked, never invented.
  assert.ok(g.questions.some((q) => /text styles does Label use/.test(q.ask)), JSON.stringify(g.questions));
  assert.ok(g.held.some((h) => /a new component, acmePill, built from nothing/.test(h.what)), 'a new component is held for someone to sign off');
  const unknown = opsFromCode({ name: 'acmePill', text: vue, api, anatomy, varOf: () => null, componentOf: () => null });
  const g2 = ground(unknown, { captures });
  assert.ok(g2.questions.some((q) => /no component acme-icon/.test(q.ask)), 'a nested component Figma does not have is asked');
  assert.ok(g2.questions.some((q) => /var\(--space-xs\) is a value|no variable var\(--space-xs\)/.test(q.ask)), 'a custom property no Figma variable stands for is asked');
});
