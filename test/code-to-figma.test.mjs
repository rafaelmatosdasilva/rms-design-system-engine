// A component only the code has, drawn into Figma from what the engine reads of it (code-to-figma.mjs): the operations
// a spec is built from, checked against the system by the same path a spec from a description takes (figma-ops.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsFromCode, opsFromMarkup, markupTree, variablesByCss } from '../lib/code-to-figma.mjs';
import { anatomyOf } from '../lib/code-grammar.mjs';
import { ground, predict, opsScript } from '../lib/figma-ops.mjs';

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

const page = `<template>
  <div class="acme-settings">
    <acme-header class="acme-settings__header" title="Settings" />
    <div class="acme-settings__body">
      <h2 class="acme-settings__title">{{ heading }}</h2>
      <AcmeField v-if="ready" />
      <img src="x.png" />
    </div>
    <acme-toast />
  </div>
</template>`;

test('a template drawn as a frame: nested frames, the system\'s components as instances, texts in their style', () => {
  const tree = markupTree(page.match(/<template>([\s\S]*)<\/template>/)[1]);
  assert.equal(tree.kids.length, 1);
  assert.deepEqual(tree.kids[0].kids.map((k) => k.tag), ['acme-header', 'div', 'acme-toast'], 'a self-closing tag holds nothing');
  const known = { 'acme-header': 'acmeHeader', AcmeField: 'acmeField' };
  const ops = opsFromMarkup({ name: 'settings', markup: page, componentOf: (t) => known[t] ?? null,
    textStyleOf: (c) => (c === 'acme-settings__title' ? 'heading/m' : null),
    layoutOf: (c) => (c === 'acme-settings__body' ? { dir: 'HORIZONTAL' } : null),
    bindsOf: (c) => (c === 'acme-settings' ? [{ field: 'gap', variable: 'space/l' }] : []) });
  assert.deepEqual(ops[0], { op: 'create', name: 'settings', kind: 'frame', layout: { dir: 'VERTICAL' } });
  assert.ok(ops.some((o) => o.op === 'bind' && o.layer === '' && o.variable === 'space/l'));
  const layers = ops.filter((o) => o.op === 'addLayer').map((o) => [o.parent, o.layer.type, o.layer.name, o.layer.of ?? o.layer.style ?? o.layer.layout?.dir]);
  assert.deepEqual(layers, [
    ['', 'instance', 'acmeHeader', 'acmeHeader'],
    ['', 'frame', 'Settings body', 'HORIZONTAL'],
    ['Settings body', 'text', 'Settings title', 'heading/m'],
    ['Settings body', 'instance', 'acmeField', 'acmeField'],
    ['', 'instance', 'acme-toast', 'acme-toast'],
  ]);
  // The tag Figma does not have is asked; the frame takes no axes and is built as a frame, never a component set.
  const g = ground(ops, { captures: { props: { acmeHeader: { properties: {} }, acmeField: { properties: {} } }, varNames: { 1: { name: 'space/l' } } } });
  assert.ok(g.questions.some((q) => /acme-toast/.test(q.ask)), JSON.stringify(g.questions));
  assert.ok(g.held.some((h) => /a new frame, settings, drawn from the code/.test(h.what)));
  assert.equal(predict(null, ops).kind, 'frame');
  const axed = ground([{ op: 'create', name: 'x', kind: 'frame', axes: [{ name: 'size', options: ['s'] }] }], { captures: { props: {} } });
  assert.ok(axed.questions.some((q) => /takes no variant axes/.test(q.ask)));
  const script = opsScript([{ op: 'create', name: 'settings', kind: 'frame', layout: { dir: 'VERTICAL' } }]);
  assert.match(script, /createFrame/);
  assert.match(script, /o\.kind !== 'frame' && [^\n]*combineAsVariants/, 'a frame is never combined as variants');
});

test('a comment in the markup is taken out however it nests or is left open', () => {
  assert.deepEqual(markupTree('<div class="a"><!-<!-- x -->- y --><span>Hi</span></div><!-- open').kids.map((k) => k.tag), ['div']);
  assert.deepEqual(markupTree('<div class="a"><!-<!-- x -->- y --><span>Hi</span></div>').kids[0].kids.map((k) => k.tag), ['span']);
});
