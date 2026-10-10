// The style guide lists the components the code has as well as Figma's (E26): a component only the code has is shown
// with its file and the props its code declares, marked as compared with nothing in Figma, and drawn from its own
// source (a Vue template, as a React return is); before Figma's data is captured, every component is listed that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vueMarkup } from '../vue-markup.mjs';
import { codeComponents, rootClassOf } from '../component-source.mjs';
import { agreedView } from '../styleguide-data.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('a Vue component\'s markup is read from its template: its classes, string attributes and default words', () => {
  const sfc = `<script setup>defineProps({ title: { type: String, default: 'Settings' }, label: { type: String, default: 'Close' } })</script>
<template>
  <div class="card" :class="['card--quiet', { 'card--open': open }]" role="region" :aria-label="title">
    <h3 class="card-title">{{ title }}</h3>
    <p v-if="note" class="card-note">{{ note }}</p><p v-else class="card-empty">Nothing yet</p>
    <ul><li v-for="x in items" :key="x" class="card-item">{{ x }}</li></ul>
    <slot name="footer"><button class="card-close" @click="close">{{ label }}</button></slot>
    <HbIcon name="x" /><RouterLink to="/a">Go</RouterLink>
    <svg viewBox="0 0 16 16"><path d="M2 8h12"/></svg>
  </div>
</template>`;
  assert.equal(vueMarkup(sfc, 'card'), '<div class="card card--quiet" role="region" aria-label="Settings"><h3 class="card-title">Settings</h3><p class="card-note"></p><ul><li class="card-item"></li></ul><button class="card-close">Close</button><svg viewBox="0 0 16 16"><path d="M2 8h12"></path></svg></div>');
  assert.equal(vueMarkup(sfc, 'other'), null, 'a root that does not carry the component\'s class is not it');
  assert.equal(vueMarkup('<script>export default {}</script>'), null);
});

test('the code\'s components: each file whose first element carries a class of its own, in its components folder', () => {
  assert.equal(rootClassOf('A.vue', `<template><span :class="['hb-badge', \`hb-badge--\${tone}\`]">x</span></template>`), 'hb-badge');
  assert.equal(rootClassOf('A.vue', '<template><div class="wrap inner"><b/></div></template>'), 'wrap');
  assert.equal(rootClassOf('A.tsx', 'export function A() { return <div className="chip">x</div>; }'), 'chip');
  assert.equal(rootClassOf('A.vue', '<template><div><b/></div></template>'), null);
  assert.deepEqual(codeComponents(HARBOR, {}).map((c) => [c.name, c.file, c.cls]), [['HbBadge', 'components/HbBadge.vue', 'hb-badge'], ['HbButton', 'components/HbButton.vue', 'hb-button'], ['HbIconButton', 'components/HbIconButton.vue', 'hb-icon-button']]);
});

test('a component only the code has is listed apart, and with no Figma data every one is, said so', () => {
  const only = [{ name: 'Chip', file: 'components/Chip.vue', cls: 'chip', props: [{ name: 'label', default: 'Filter' }], markup: '<button class="chip">Filter</button>', from: 'vue' }];
  const none = agreedView({ codeOnly: only });
  assert.deepEqual(none.components.map((c) => [c.name, c.markup, c.markupFrom, c.codeOnly.figma]), [['Chip', '<button class="chip">Filter</button>', 'vue', false]]);
  assert.equal(none.notAgreed.line, 'No Figma data yet: these are the 1 component the code has, compared with nothing in Figma. Capture Figma\'s data (rms-design-system-engine --recipe refresh-figma) to compare them.');
  const withFigma = agreedView({ propsSnap: { badge: { properties: {} } }, codeOnly: only, probes: { badge: '<span class="badge">x</span>' }, classFor: () => 'badge' });
  assert.equal(withFigma.components.find((c) => c.name === 'Chip').codeOnly.figma, true);
  assert.match(withFigma.notAgreed.line, /1 component the code has is not in Figma: shown, marked as compared with nothing\.$/);
});

test('the style guide of a Vue system shows its code\'s components, with Figma\'s data and before it', { timeout: 300000 }, () => {
  const run = (dir) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  // With Figma's data: its three components, and a chip only the code has.
  const withFigma = mkdtempSync(join(tmpdir(), 'sg-code-only-'));
  cpSync(HARBOR, withFigma, { recursive: true });
  writeFileSync(join(withFigma, 'components', 'HbChip.vue'), `<script setup lang="ts">\nwithDefaults(defineProps<{ tone?: 'quiet' | 'loud'; label?: string }>(), { tone: 'quiet', label: 'Filter' });\n</script>\n<template><button :class="['hb-chip', \`hb-chip--\${tone}\`]" type="button">{{ label }}</button></template>\n`);
  const a = run(withFigma);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /\(3 components agreed, 1 only in the code · the engine's template\)/);
  const page = readFileSync(join(withFigma, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  assert.match(page, /"name":"HbChip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton class=\\"hb-chip\\" type=\\"button\\">Filter\\u003c\/button>","markupFrom":"vue"/);
  assert.match(page, /"codeOnly":\{"file":"components\/HbChip.vue","props":\[\{"name":"tone","default":"quiet","options":\["quiet","loud"\]\},\{"name":"label","default":"Filter"\}\],"figma":true\}/);
  // Before Figma's data: the code's three components, said so.
  const noFigma = mkdtempSync(join(tmpdir(), 'sg-no-figma-'));
  cpSync(HARBOR, noFigma, { recursive: true });
  rmSync(join(noFigma, 'figma'), { recursive: true });
  const cfg = JSON.parse(readFileSync(join(noFigma, 'ds-config.json'), 'utf8')); delete cfg.componentFiles;
  writeFileSync(join(noFigma, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const b = run(noFigma);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(b.stdout, /\(3 only in the code · the engine's template\)\n\s+No Figma data yet: these are the 3 components the code has/);
});
