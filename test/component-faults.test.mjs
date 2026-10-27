// component-faults.mjs - what a screen runs into in a component's own code, read without running it. An invented system
// (Acme): a tile, a picker row around a tick box, a stepper, a panel, notes and a dialog family.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { componentFaults, faultLines, partsOf } from '../component-faults.mjs';
import { componentOf } from '../run-diff.mjs';
import { systemFacts, checkPage } from '../intent-truth.mjs';
import { codeSnapshotPath } from '../names.mjs';

const kinds = (list, name) => list.filter((f) => f.component === name).map((f) => f.kind);

test('a class no rule styles: a bare element is drawn with the browser\'s defaults, a modifier changes nothing', () => {
  const tile = { name: 'acmeTile', file: 'src/tiles/Tile.vue', text: `<template>
  <div class="acme-tile" :class="[size, { 'is-flat': flat, quiet }, \`acme-tile--\${tone}\`]">
    <p class="acme-tile-empty">Nothing yet</p>
    <span class="js-hook">x</span>
  </div>
</template>
<script setup>
const props = defineProps({ size: String, flat: Boolean, quiet: Boolean })
</script>
<style scoped>
.acme-tile { display: flex }
.acme-tile.quiet { opacity: .5 }
</style>` };
  const f = componentFaults([tile], { styles: ['.acme-tile { display: flex } .acme-tile.quiet { opacity: .5 }'] });
  const says = f.filter((x) => x.kind === 'unstyled').map((x) => x.says);
  assert.equal(says.length, 2);
  assert.match(says[0], /\(\.acme-tile-empty\): drawn with the browser's defaults/);
  assert.match(says[1], /\(\.is-flat\): setting it changes nothing/, 'a variable in a bound array is not a class; a quoted key is');
  assert.ok(!says.join().includes('size') && !says.join().includes('js-hook'), 'hooks and variables are never reported');
  // A class a script looks for is a hook, not a style.
  const hooked = componentFaults([tile], { styles: ['.acme-tile{} .acme-tile.quiet{}'], scripts: ["el.closest('.acme-tile-empty')", "x.classList.add('is-flat')"] });
  assert.deepEqual(kinds(hooked, 'acmeTile'), []);
  // Sass nesting defines the class it writes (.acme-tile { &-empty }).
  assert.deepEqual(kinds(componentFaults([tile], { styles: ['.acme-tile { &-empty { color: red } &.quiet {} } .is-flat {}'] }), 'acmeTile'), []);
});

test('one click that fires the same event twice: the child emits it and the click reaches the parent too', () => {
  const tick = { name: 'acmeTick', file: 'src/tick/Tick.vue', text: `<template>
  <div class="acme-tick">
    <input type="checkbox" @click.stop="$emit('picked', value)">
    <label class="acme-tick-label" @click.prevent="$emit('picked', value)">{{ label }}</label>
  </div>
</template>` };
  const row = { name: 'acmePickerRow', file: 'src/picker/Row.vue', text: `<template>
  <button class="acme-row" @click="emit('picked', option.id)">
    <acme-tick :label="option.label" @picked="emit('picked', $event)"/>
  </button>
</template>` };
  const f = componentFaults([tick, row], { styles: ['.acme-tick{} .acme-tick-label{} .acme-row{}'] });
  const twice = f.filter((x) => x.kind === 'twice');
  assert.equal(twice.length, 1);
  assert.equal(twice[0].component, 'acmePickerRow');
  assert.match(twice[0].says, /one click on acmeTick's <label class="acme-tick-label"> fires "picked" twice/);
  // With .stop on the child's click there is one event.
  const fixed = { ...tick, text: tick.text.replace('@click.prevent', '@click.stop.prevent') };
  assert.deepEqual(componentFaults([fixed, row], { styles: ['.acme-tick{} .acme-tick-label{} .acme-row{}'] }).filter((x) => x.kind === 'twice'), []);
  // The line names the parent first, so the style guide puts it on the parent's page, not the child's.
  const line = `Component code :: ${faultLines(twice)[0]}`;
  assert.equal(componentOf(line, ['acmeTick', 'acmePickerRow']), 'acmePickerRow');
});

test('a slot repeated by a v-for with nothing passed shows the same content in every row; a scoped slot does not', () => {
  const steps = (slot) => ({ name: 'acmeSteps', file: 'src/steps/Steps.vue', text: `<template>
  <ol class="acme-steps"><li v-for="(s, i) in steps" :key="i" class="acme-step">${slot}</li></ol>
</template>` });
  const css = ['.acme-steps{} .acme-step{}'];
  assert.match(componentFaults([steps('<slot name="body"/>')], { styles: css })[0].says, /"body" slot is inside a v-for and passes nothing/);
  assert.deepEqual(componentFaults([steps('<slot name="body" :step="s"/>')], { styles: css }), []);
});

test('a prop read only when mounted: changing it later does nothing; one the template or a watch follows is fine', () => {
  const panel = (more = '') => ({ name: 'acmePanel', file: 'src/panel/Panel.vue', text: `<template>
  <section class="acme-panel" :class="{ open }"><slot/></section>
</template>
<script setup>
import { ref, onMounted, watch } from 'vue'
const props = defineProps({
  startOpen: { type: Boolean, default: false },
  heading: String,
})
const open = ref(false)
onMounted(() => { if (props.startOpen) open.value = true })
${more}
</script>
<style>.acme-panel{} .acme-panel.open{}</style>` });
  const f = componentFaults([panel()], { styles: ['.acme-panel{} .open{}'] });
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'once');
  assert.match(f[0].says, /`startOpen` is read once, when it is mounted: .* a screen cannot open or close it from outside/);
  assert.equal(f[0].line, 11, 'the line of the read');
  assert.deepEqual(componentFaults([panel('watch(() => props.startOpen, (v) => { open.value = v })')], { styles: ['.acme-panel{} .open{}'] }), []);
});

test('a longer text shown with its line breaks lost; a short label, an error or a text with pre-line is not', () => {
  const note = (style = '') => ({ name: 'acmeNote', file: 'src/notes/Note.vue', text: `<template>
  <div class="acme-note">
    <b class="acme-note-title">{{ title }}</b>
    <p class="acme-note-text">{{ description }}</p>
    <small class="acme-note-error">{{ errorMessage }}</small>
  </div>
</template>
<script setup>
defineProps({ title: String, description: String, errorMessage: String })
</script>
<style>.acme-note{} .acme-note-title{} .acme-note-text{${style}} .acme-note-error{}</style>` });
  const css = (t) => [t.text.match(/<style>([\s\S]*)<\/style>/)[1]];
  const lost = componentFaults([note()], { styles: css(note()) });
  assert.deepEqual(lost.map((f) => f.kind), ['breaks']);
  assert.match(lost[0].says, /a line break in its `description` is lost: it is shown as one line/);
  assert.deepEqual(componentFaults([note('white-space: pre-line')], { styles: css(note('white-space: pre-line')) }), []);
});

test('the same prop takes HTML in one component of a family and only text in another', () => {
  const dialog = (name, body) => ({ name, file: `src/dialogs/${name}.vue`, text: `<template><div class="acme-dialog">${body}</div></template>
<script setup>defineProps({ description: String })</script>` });
  const css = ['.acme-dialog { white-space: pre-line } .acme-dialog-text { white-space: pre-line }'];
  const f = componentFaults([dialog('acmeDialog', '<p class="acme-dialog-text" v-html="description"></p>'), dialog('acmeDialogDanger', '<p class="acme-dialog-text">{{ description }}</p>')], { styles: css });
  assert.deepEqual(f.map((x) => [x.component, x.kind]), [['acmeDialogDanger', 'unlike']]);
  assert.match(f[0].says, /its `description` takes text only, while acmeDialog takes HTML for it/);
});

test('what a part the component draws with does wrong is said on the component, once', () => {
  const field = { name: 'acmeField', file: 'src/fields/Field.vue', text: `<template><component :is="base" class="acme-field"/></template>
<script setup>
import { defineAsyncComponent } from 'vue'
const base = defineAsyncComponent(() => import(\`./bases/\${props.kind}.vue\`))
</script>` };
  const base = (n) => ({ file: `src/fields/bases/${n}.vue`, text: `<template><div class="acme-base"><p class="acme-base-hint">{{ hintText() }}</p></div></template>
<script setup>const hintText = () => props.params.hint</script>` });
  const files = [field, base('Base'), base('Base2')];
  assert.deepEqual(partsOf(field, files).map((f) => f.file), ['src/fields/bases/Base.vue', 'src/fields/bases/Base2.vue']);
  const f = componentFaults([field], { styles: ['.acme-field{} .acme-base{} .acme-base-hint{}'], files });
  assert.deepEqual(f.map((x) => [x.component, x.kind, x.file]), [['acmeField', 'breaks', 'src/fields/bases/Base.vue']], 'two bases with the same fault say it once');
  assert.match(f[0].says, /the text its `hintText\(\)` returns is lost/);
});

test('a name a page writes as code that only a comment of the code has, or that the engine generated, is not in the system', () => {
  const root = mkdtempSync(join(tmpdir(), 'faults-truth-'));
  mkdirSync(join(root, 'src', 'panels'), { recursive: true });
  writeFileSync(join(root, 'src', 'panels', 'Panel.vue'), `<template><section class="acme-panel"/></template>
<script setup>
/* Props: @startOpens {Boolean} opens it at first */
defineProps({ startOpen: Boolean }) // startOpenz is old
</script>
<style>.acme-panel { color: var(--acme-panelHeader-color) }</style>`);
  // The engine's own view of the pages, generated beside the styles: it repeats what the pages say.
  writeFileSync(join(root, 'src', 'design-intent.json'), JSON.stringify({ components: { acmePanel: { note: 'startOpens' } } }));
  const cfg = {};
  mkdirSync(join(root, codeSnapshotPath(cfg), '..'), { recursive: true });
  writeFileSync(join(root, codeSnapshotPath(cfg)), JSON.stringify({ api: { acmePanel: { file: 'src/panels/Panel.vue', props: { startOpen: { type: 'boolean' } } } }, tokens: {} }));
  const facts = systemFacts(root, cfg, { record: false });
  const page = { kind: 'component', layer: 'components', name: 'acmePanel', file: 'components/acmePanel.dsds.json', rules: [{ text: 'Set `startOpens` to open it first. Its header reads `panelHeader`, a `--token` of its own.' }] };
  const found = checkPage(page, facts, { component: 'acmePanel' });
  assert.deepEqual(found.map((x) => x.says), ['`startOpens`'], 'a part of a token name (panelHeader) and a placeholder are names; a typo only a comment has is not');
  assert.match(found[0].truth, /The system has `startOpen`/);
});

test('a fault of the code is the code\'s to fix, with the fix for its kind', async () => {
  const { plainAction } = await import('../run-diff.mjs');
  assert.deepEqual(plainAction('acmePanel: Read once. `startOpen` is read once, when it is mounted  (src/panel/Panel.vue:11)', 'acmePanel'),
    { who: 'code', todo: 'Follow the prop with a watch, or let the screen own it (v-model), so a screen can change it after it is shown.' });
  assert.equal(plainAction('acmeNote: Line breaks lost. A line break in its `description` is lost', 'acmeNote').who, 'code');
});

test('a line that starts with the code\'s name for a component is that component\'s, written as Figma writes it', () => {
  assert.equal(componentOf('Component code :: acmePicker/Row: Fires twice. One click on acmeTick\'s <label>', ['acmePickerRow', 'acmeTick', 'acmePicker']), 'acmePickerRow');
});

test('an on/off that hides more in the code than in Figma: the parts another Figma on/off shows', async () => {
  const drop = (cond) => ({ name: 'acmeDrop', file: 'src/drop/Drop.vue', text: `<template>
  <div class="acme-drop">
    <div v-if="${cond}" class="acme-drop-region">
      <div v-if="label" class="acme-drop-label">{{ label }}</div>
      <div v-if="showArea" class="acme-drop-area"/>
      <p v-if="hint && showArea" class="acme-drop-hint">{{ hint }}</p>
      <span v-if="showArea && Number(count) >= 3" class="count">3+</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ label: String, hint: String, count: Number, showArea: Boolean, readOnly: Boolean })
const showRegion = computed(() => { if (props.readOnly) return false; return props.showArea || !!props.label })
</script>` });
  const toggles = { acmeDrop: { showArea: ['Area'], showLabel: ['Label'], showHint: ['Hint'], showCount: ['Count'] } };
  const css = ['.acme-drop{} .acme-drop-region{} .acme-drop-label{} .acme-drop-area{} .acme-drop-hint{} .count{}'];
  const f = componentFaults([drop('showRegion')], { styles: css, toggles }).filter((x) => x.kind === 'hidesMore');
  assert.equal(f.length, 1);
  assert.match(f[0].says, /turning `showArea` off in the code also hides its label \(\.acme-drop-label\) and hint \(\.acme-drop-hint\): in Figma, showArea hides only Area, and those parts stay on with showLabel and showHint/);
  assert.ok(!/count/.test(f[0].says), 'a value compared in a condition is not a part it shows');
  // Where the code hides only what Figma hides, nothing is said; nor when Figma's own layer holds the part.
  assert.deepEqual(componentFaults([drop('true')], { styles: css, toggles: { acmeDrop: { showArea: ['Area'], showHint: ['Hint'] } } }).filter((x) => x.kind === 'hidesMore' && /label/.test(x.says)), []);
  assert.deepEqual(componentFaults([drop('showRegion')], { styles: css, toggles: { acmeDrop: { showArea: ['Area', 'Label Container', 'Hint'], showLabel: ['Label'], showHint: ['Hint'] } } }).filter((x) => x.kind === 'hidesMore'), []);
  const { plainAction } = await import('../run-diff.mjs');
  assert.equal(plainAction(`acmeDrop: ${'Hides more than in Figma'}. Turning \`showArea\` off…`, 'acmeDrop').who, 'both');
});

test('a slot Figma stretches its content in, inside a column of the code that draws it at its own width', () => {
  const sheet = (align) => ({ name: 'acmeSheet', file: 'src/sheet/Sheet.vue', text: `<template>
  <div class="acme-sheet"><h2 class="acme-sheet-title">{{ title }}</h2><slot name="sheet-body"/></div>
</template>
<style scoped>
.acme-sheet { display: flex; flex-direction: column; align-items: ${align}; }
.acme-sheet-title { align-self: stretch }
</style>` });
  const css = (t) => [t.text.match(/<style scoped>([\s\S]*)<\/style>/)[1]];
  const f = componentFaults([sheet('flex-start')], { styles: css(sheet('flex-start')), stretched: { acmeSheet: { 'sheet-body': 'slotBody' } } });
  assert.deepEqual(f.map((x) => x.kind), ['shrinks']);
  assert.match(f[0].says, /"sheet-body" slot is drawn at its own width: the element around it \(\.acme-sheet\) is a column with align-items: flex-start, while Figma's slotBody stretches/);
  assert.deepEqual(componentFaults([sheet('stretch')], { styles: css(sheet('stretch')), stretched: { acmeSheet: { 'sheet-body': 'slotBody' } } }), []);
  assert.deepEqual(componentFaults([sheet('flex-start')], { styles: css(sheet('flex-start')) }), [], 'a slot Figma does not stretch is not asked');
});
