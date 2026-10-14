// The components the code has (E26). Once Figma's components are captured, the style guide's pages are the system as
// Figma has it: a component only the code has is left off the pages and the menu, and is a task on the Tasks page with
// its file (add it to Figma, or remove it from the code); styleguide.showCodeOnly: true shows it as well. Before
// Figma's data is captured, every component is the code's: shown with its file and the props its code declares, marked
// as compared with nothing in Figma, and drawn from its own source (a Vue template, as a React return is).
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

test('with Figma\'s components a component only the code has is a task, not on the page; with no Figma data every one is shown, said so', () => {
  const only = [{ name: 'Chip', file: 'components/Chip.vue', cls: 'chip', props: [{ name: 'label', default: 'Filter' }], markup: '<button class="chip">Filter</button>', from: 'vue' }];
  const none = agreedView({ codeOnly: only });
  assert.deepEqual(none.components.map((c) => [c.name, c.markup, c.markupFrom, c.codeOnly.figma]), [['Chip', '<button class="chip">Filter</button>', 'vue', false]]);
  assert.equal(none.notAgreed.line, 'No Figma data yet: these are the 1 component the code has, compared with nothing in Figma. Capture Figma\'s data (rms-design-system-engine --recipe refresh-figma) to compare them.');
  assert.equal(none.notInFigma, undefined, 'before Figma\'s data, nothing is a task for it');
  const figma = { propsSnap: { badge: { properties: {} } }, codeOnly: only, probes: { badge: '<span class="badge">x</span>' }, classFor: () => 'badge' };
  const withFigma = agreedView(figma);
  assert.deepEqual(withFigma.components.map((c) => c.name), ['badge'], 'Figma\'s components only');
  assert.deepEqual([withFigma.codeOnly, withFigma.notInFigma], [0, [{ name: 'Chip', file: 'components/Chip.vue' }]]);
  assert.equal(withFigma.notAgreed.line, 'Left off this page until Figma and the code agree: 1 component the code has and Figma does not. Each one is on the Tasks page, with who does it and what to do.');
  // Figma's own components are drawn as they were.
  const figmaOnly = agreedView({ ...figma, codeOnly: [] });
  assert.deepEqual(withFigma.components, figmaOnly.components);
  // ds-config.json → styleguide.showCodeOnly: true shows it as before.
  const shown = agreedView({ ...figma, cfg: { styleguide: { showCodeOnly: true } } });
  assert.equal(shown.components.find((c) => c.name === 'Chip').codeOnly.figma, true);
  assert.equal(shown.notInFigma, undefined);
  assert.match(shown.notAgreed.line, /1 component the code has is not in Figma: shown, marked as compared with nothing\.$/);
});

const chipVue = `<script setup lang="ts">\nwithDefaults(defineProps<{ tone?: 'quiet' | 'loud'; label?: string }>(), { tone: 'quiet', label: 'Filter' });\n</script>\n<template><button :class="['hb-chip', \`hb-chip--\${tone}\`]" type="button">{{ label }}</button></template>\n`;

test('the style guide of a Vue system: Figma\'s components with Figma\'s data, the code\'s before it', { timeout: 300000 }, () => {
  const run = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  // With Figma's data: its three components; a chip only the code has is a task, with its file.
  const withFigma = mkdtempSync(join(tmpdir(), 'sg-code-only-'));
  cpSync(HARBOR, withFigma, { recursive: true });
  writeFileSync(join(withFigma, 'components', 'HbChip.vue'), chipVue);
  const a = run(withFigma);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /\(3 components agreed, 1 in the code and not in Figma, on the Tasks page · the engine's template\)/);
  assert.match(a.stdout, /1 component the code has and Figma does not\. Each one is on the Tasks page/);
  const page = readFileSync(join(withFigma, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  assert.doesNotMatch(page, /"name":"HbChip","cls"/, 'not one of the page\'s components');
  assert.doesNotMatch(page, /"codeOnly":\{/);
  assert.match(page, /"notInFigma":\[\{"name":"HbChip","file":"components\/HbChip.vue"\}\]/);
  // A page for it alone says where it is instead.
  const one = run(withFigma, '--component', 'HbChip');
  assert.match(one.stdout, /HbChip: in the code and not in Figma, so not on the page; a task on the whole system's Tasks page\./, one.stdout + one.stderr);
  assert.doesNotMatch(one.stdout, /HbChip: not a component of this system/);
  // styleguide.showCodeOnly: true shows it on the page, as before.
  const shown = mkdtempSync(join(tmpdir(), 'sg-show-code-only-'));
  cpSync(HARBOR, shown, { recursive: true });
  writeFileSync(join(shown, 'components', 'HbChip.vue'), chipVue);
  const sc = JSON.parse(readFileSync(join(shown, 'ds-config.json'), 'utf8')); sc.styleguide = { showCodeOnly: true };
  writeFileSync(join(shown, 'ds-config.json'), JSON.stringify(sc, null, 2));
  const s = run(shown);
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(s.stdout, /\(3 components agreed, 1 only in the code · the engine's template\)/);
  const shownPage = readFileSync(join(shown, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  assert.match(shownPage, /"name":"HbChip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton class=\\"hb-chip\\" type=\\"button\\">Filter\\u003c\/button>","markupFrom":"vue"/);
  assert.match(shownPage, /"codeOnly":\{"file":"components\/HbChip.vue","props":\[\{"name":"tone","default":"quiet","options":\["quiet","loud"\]\},\{"name":"label","default":"Filter"\}\],"figma":true\}/);
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

test('in the browser: with Figma\'s data a component only the code has is on the Tasks page, with its file, and not in the menu', { timeout: 300000 }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'sg-code-only-tasks-'));
  cpSync(HARBOR, dir, { recursive: true });
  writeFileSync(join(dir, 'components', 'HbChip.vue'), chipVue);
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#tasks`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `!!document.querySelector('#tasks .sg-todo-kind[data-area="Parity"]')`);
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#c-HbChip"]') || !!document.getElementById('c-HbChip')`), false, 'not in the menu, no page of its own');
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#c-button"]')`), true, 'Figma\'s components are');
    const row = await run(`[...document.querySelectorAll('#tasks .sg-todo-kind[data-area="Parity"] tr')].map((tr) => tr.textContent).find((x) => /HbChip/.test(x)) || ''`);
    assert.match(row, /components\/HbChip\.vue/);
    assert.match(row, /Add HbChip to Figma, or remove it from the code\./);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});
