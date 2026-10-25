// Every variant of a component checked, every time, and a Vue design system's components drawn and tried from their
// code: the project's own Vite renders each .vue file in each of its variants (Figma's, else its own props'), for
// the browser accessibility check and for the style guide, its SCSS compiled.
//
// The Vue tests use the build tools a Vue project has installed, laid in a gitignored folder as CI does:
//   npm install --prefix test/.vue-tools vite@6 @vitejs/plugin-vue@5 vue@3 sass@1 pinia@3 vue-router@4
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { variantsFromCode, startHarness, loadTypeScript } from '../component-harness.mjs';
import { globalStyles, renderedVue, appPlugins, appSetup, runtimeDeps, propSamples } from '../vue-harness.mjs';
import { harnessCases } from '../component-harness.mjs';
import { textComponentApi } from '../component-source.mjs';
import { findChrome } from '../cdp.mjs';
import { budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const TOOLS = join(ENGINE, 'test', '.vue-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) ? false
  : 'no Chrome, or no Vue build tools (npm install --prefix test/.vue-tools vite@6 @vitejs/plugin-vue@5 vue@3 sass@1)';

const CHIP = `<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'quiet' | 'loud'; label?: string; selected?: boolean }>(), { tone: 'quiet', label: 'Filter', selected: false });
</script>
<template><button :class="['hb-chip', \`hb-chip--\${tone}\`, { 'hb-chip--on': selected }]" type="button" :aria-pressed="selected">{{ label }}</button></template>
<style scoped lang="scss">
$pad: 4px;
.hb-chip { padding: $pad calc($pad * 2); }
</style>
`;
// Harbor, its Vue components and a chip only the code has, with its packages installed.
const harbor = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cpSync(HARBOR, dir, { recursive: true });
  writeFileSync(join(dir, 'components', 'HbChip.vue'), CHIP);
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};

test('with no Figma variants, the code\'s own props give them: each option, each switch flipped, each text emptied', () => {
  const cases = variantsFromCode(textComponentApi('HbChip.vue', CHIP), CHIP);
  assert.deepEqual(cases.map((c) => c.label), ['default', 'tone=loud', 'label=""', 'selected=true']);
  assert.deepEqual(cases[0].props, { tone: 'quiet', label: 'Filter', selected: false });
  assert.equal(variantsFromCode(textComponentApi('HbChip.vue', CHIP), CHIP, 2).length, 2, 'capped');
  const react = 'export function Tag({ label = "New", icon = "star", dismissible = false, size }) { return <span className="tag">{label}</span>; }';
  assert.deepEqual(variantsFromCode(textComponentApi('Tag.jsx', react), react).map((c) => c.label), ['default', 'label=""', 'icon=""', 'dismissible=true']);
});

test('the global styles a Vue project\'s entry loads, and its token CSS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vue-styles-'));
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'src', 'main.ts'), "import { createApp } from 'vue';\nimport './styles/main.scss';\nimport '@acme/ui/dist/style.css';\nimport App from './App.vue';\n");
  assert.deepEqual(globalStyles(dir, { paths: { themeCSS: 'src/styles/tokens.css' } }), ['/src/styles/tokens.css', '/src/styles/main.scss', '@acme/ui/dist/style.css']);
});

test('a React component with no Figma variants is rendered in its code\'s', { skip: loadTypeScript(ENGINE) ? false : 'no TypeScript' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'react-code-variants-'));
  mkdirSync(join(dir, 'src', 'components'), { recursive: true });
  writeFileSync(join(dir, 'src', 'components', 'Tag.jsx'), 'export function Tag({ tone = "info", dismissible = false }) { return <span className={"tag tag--" + tone}>x</span>; }\n');
  const h = await startHarness(dir, {}, ['tag'], { locate: () => join(dir, 'src', 'components', 'Tag.jsx') });
  try { assert.deepEqual(h.groups[0].cases.map((c) => c.label), ['default', 'dismissible=true']); } finally { h.close?.(); }
});

test('the browser check tries every variant of a Vue component, rendered by the project\'s own Vite', { skip: READY, timeout: budget(300000) }, () => {
  const dir = harbor('vue-a11y-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, CHROME_PATH: CHROME } });
  const out = r.stdout + r.stderr;
  assert.match(out, /ℹ️ {2}\[a11y\] target: 4 Vue component\(s\) rendered with the project's own Vite in each variant \(button: 3 from Figma, badge: 3 from Figma, iconButton: 1 from its props, HbChip: 4 from its props\)/, out);
  const d = JSON.parse(r.stdout.slice(r.stdout.indexOf('{\n')));
  assert.ok(d.target.includes('the Vue components, rendered with the project\'s own Vite'), out);
  // The icon button has no name in any variant; the chip has none only when its label is empty: two nameless buttons,
  // one of them a variant no page shows.
  assert.equal(d.issues.filter((i) => i.issue === 'name').length, 2, out);
  assert.equal(d.notRead, undefined, out);
});

test('the style guide draws a Vue component as the project\'s own Vite renders it, its SCSS compiled', { skip: READY, timeout: budget(300000) }, () => {
  const dir = harbor('vue-sg-');
  // Figma has the chip too here, so its page is drawn (a component only the code has is a task, not a page).
  const edit = (f, fn) => { const p = join(dir, f); const j = JSON.parse(readFileSync(p, 'utf8')); fn(j.components ?? j); writeFileSync(p, JSON.stringify(j)); };
  edit('figma/structure.snapshot.json', (c) => { c.chip = { h: 24, defaultVariant: 'Tone=Quiet', variants: { 'Tone=Quiet': { h: 24 } } }; });
  edit('figma/props.snapshot.json', (c) => { c.chip = { nodeId: '9:1', properties: { Tone: { type: 'VARIANT', defaultValue: 'Quiet', variantOptions: ['Quiet', 'Loud'] }, 'label#9:0': { type: 'TEXT', defaultValue: 'Filter' } }, annotations: [] }; });
  edit('ds-config.json', (c) => { c.componentFiles.chip = 'components/HbChip.vue'; });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /4 of 4 Vue components drawn as the project's own Vite renders them\./);
  const page = readFileSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  // What it renders, its bound classes included (a template read cannot know hb-chip--quiet), from its own build.
  assert.match(page, /"name":"chip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton data-v-[a-f0-9]+=\\"\\" class=\\"hb-chip hb-chip--quiet\\" type=\\"button\\" aria-pressed=\\"false\\">Filter\\u003c\/button>"/);
  assert.match(page, /\.hb-chip\[data-v-[a-f0-9]+\] \{\n {2}padding: 4px 8px;\n\}/, 'its scoped SCSS, compiled');
  // Without the packages, its template is read as before, and the summary says why.
  const bare = mkdtempSync(join(tmpdir(), 'vue-sg-bare-'));
  cpSync(HARBOR, bare, { recursive: true });
  const b = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: bare, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.match(b.stdout, /Vue components drawn from their templates: the project has no vue package installed\./);
});

test('the style guide draws each Vue variant as it renders; a page for one component renders only it and what it nests', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = harbor('vue-sg-variants-');
  // Large adds an element, not only a class; the button nests the badge (its tag, as its file names it).
  writeFileSync(join(dir, 'components', 'HbButton.vue'), `<script setup lang="ts">
import HbBadge from './HbBadge.vue';
withDefaults(defineProps<{ variant?: 'Primary' | 'Secondary'; size?: 'Small' | 'Large'; label?: string }>(), { variant: 'Primary', size: 'Small', label: 'Continue' });
</script>
<template><button :class="['hb-button', { 'hb-button--secondary': variant === 'Secondary' }]" type="button"><span v-if="size === 'Large'" class="hb-button-icon" aria-hidden="true">→</span>{{ label }}<HbBadge /></button></template>
`);
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'button', '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // The button and the badge it nests: the icon button and the chip are not rendered for this page.
  assert.match(r.stdout, /2 of 2 Vue components drawn as the project's own Vite renders them\./, r.stdout);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'button.html');
  const data = JSON.parse(readFileSync(file, 'utf8').match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const button = data.components.find((c) => c.name === 'button');
  assert.ok(button.renders?.some((x) => x.props.size === 'Large' && /hb-button-icon/.test(x.markup)), JSON.stringify(button.renders));
  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `file://${file}#c-button?size=Large`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    const drawn = async () => { let h = ''; for (let n = 0; n < 100 && !h; n++) { if (n) await new Promise((res) => setTimeout(res, 100)); h = await run(`(document.querySelector('#c-button .pg-preview') || {}).innerHTML || ''`); } return h; };
    // Large, as the button renders it: with its icon. The default has none.
    assert.match(await drawn(), /class="hb-button-icon"/);
    await run(`location.hash = '#c-button?size=Small'`); await new Promise((res) => setTimeout(res, 400));
    assert.doesNotMatch(await drawn(), /hb-button-icon/);
    close();
  } finally { c.kill(); }
});

// A component that reads a store and links to a page, as an app's components do: the project's own Pinia and router.
const CART = `<script setup>
import { defineStore } from 'pinia';
import { RouterLink } from 'vue-router';
const useCart = defineStore('cart', { state: () => ({ items: 3 }) });
const cart = useCart();
</script>
<template><RouterLink class="hb-cart" to="/cart">{{ cart.items }} items</RouterLink></template>
`;
const STORES = existsSync(join(TOOLS, 'pinia')) && existsSync(join(TOOLS, 'vue-router')) ? READY : 'no pinia or vue-router (npm install --prefix test/.vue-tools pinia@3 vue-router@4)';

test('a Vue component that reads a Pinia store and links with the router renders with the project\'s own Pinia and router', { skip: STORES, timeout: budget(300000) }, async () => {
  const project = (deps) => {
    const dir = mkdtempSync(join(tmpdir(), 'vue-store-'));
    mkdirSync(join(dir, 'components'));
    writeFileSync(join(dir, 'components', 'HbCart.vue'), CART);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'store-ds', private: true, dependencies: { vue: '^3.5.0', ...deps } }));
    symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
    return dir;
  };
  const draw = (dir) => renderedVue(dir, {}, ['cart'], { locate: () => join(dir, 'components', 'HbCart.vue'), chromePath: CHROME });
  const dir = project({ pinia: '^3.0.0', 'vue-router': '^4.0.0' });
  assert.deepEqual(appPlugins(dir), { pinia: true, router: true, setup: [] });
  const r = await draw(dir);
  assert.deepEqual(r.failed, [], JSON.stringify(r));
  assert.equal(r.markup.cart, '<a href="/cart" class="hb-cart">3 items</a>', 'the store\'s count, in the router\'s link');
  // A project that does not list pinia gets none: the component cannot render, and says why.
  const bare = project({ 'vue-router': '^4.0.0' });
  assert.deepEqual(appPlugins(bare), { pinia: false, router: true, setup: [] });
  const b = await draw(bare);
  assert.match(JSON.stringify(b.failed), /getActivePinia\(\)\\" was called but there was no active Pinia/, JSON.stringify(b));
});

// A project like Northwind DS: its entry installs plugins and a global icon component, its modules import each other
// through the router, a CommonJS package is imported by default, and its components take Figma's names in code's words.
const APP = (dir) => {
  mkdirSync(join(dir, 'src', 'components'), { recursive: true }); mkdirSync(join(dir, 'src', 'router'), { recursive: true }); mkdirSync(join(dir, 'src', 'views'), { recursive: true });
  writeFileSync(join(dir, 'src', 'main.js'), `import { createApp } from 'vue'
import App from './App.vue'
import router from './router/router'
import shout from '@/shout'
import BaseIcon from '@/components/BaseIcon.vue'
const app = createApp(App)
app.use(router)
app.use(shout)
app.component('BaseIcon', BaseIcon)
app.mount('#app')`);
  writeFileSync(join(dir, 'src', 'App.vue'), '<template><div /></template>');
  writeFileSync(join(dir, 'src', 'shout.js'), "export default { install (app) { app.config.globalProperties.$shout = (t) => String(t).toUpperCase() } }");
  writeFileSync(join(dir, 'src', 'components', 'BaseIcon.vue'), '<script setup>defineProps({ icon: String })</script><template><i class="icon" :data-icon="icon"></i></template>');
  // The router reaches a view that reaches the button: loaded after the button, the two would meet halfway.
  writeFileSync(join(dir, 'src', 'router', 'router.js'), "import ButtonView from '@/views/ButtonView.vue'\nexport const ROUTES = [{ path: '/', component: ButtonView }]\nexport default { install () {} }");
  writeFileSync(join(dir, 'src', 'views', 'ButtonView.vue'), "<script setup>import Button from '@/components/Button.vue'</script><template><Button label=\"Save\" icon=\"m/home-m\" /></template>");
  writeFileSync(join(dir, 'src', 'components', 'Button.vue'), `<script setup>
import { ROUTES } from '@/router/router'
const ready = ROUTES.length
defineProps({ label: String, icon: String, buttonSize: { type: String, default: 'm' }, disabled: Boolean, params: Object })
</script>
<template><button :class="['btn', buttonSize]" :disabled="disabled" :data-ready="ready" :data-hint="params.hint || ''"><span v-if="label" class="label">{{ $shout(label) }}</span><base-icon v-if="icon" :icon="icon" /></button></template>`);
};

test('the app\'s own modules load first, in its entry\'s order; its plugins and global components are installed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vue-app-')); APP(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: { vue: '^3.5.0' } }));
  assert.deepEqual(appSetup(dir).map((x) => `${x.kind} ${x.spec}`), [
    'import /src/App.vue', 'import /src/router/router', 'import @/shout', 'import @/components/BaseIcon.vue',
    'use @/shout', 'component @/components/BaseIcon.vue',
  ], 'the router is loaded, never installed: the page gives each instance its own');
});

test('the packages the code imports are bundled before the page loads, never a tool only its scripts run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vue-deps-'));
  mkdirSync(join(dir, 'src', 'figma'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.vue'), "<script setup>import moment from 'moment-timezone'\nimport './local.js'\nimport '@/b'\nimport 'prismjs/themes/prism.css'\nimport Prism from 'prismjs'</script>");
  writeFileSync(join(dir, 'src', 'figma', 'a.figma.js'), "import figma from '@figma/code-connect'");
  for (const n of ['moment-timezone', 'prismjs', '@figma/code-connect']) { mkdirSync(join(dir, 'node_modules', n), { recursive: true }); writeFileSync(join(dir, 'node_modules', n, 'package.json'), JSON.stringify({ name: n, main: 'index.js' })); }
  assert.deepEqual(runtimeDeps(dir), ['moment-timezone', 'prismjs']);
});

test('a text with no default takes the value the project\'s own pages pass it most', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vue-samples-')); mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'A.vue'), '<template><X icon="m/home-m" label="Save" class="a" :title="t" /><X icon="m/home-m" /><X icon="s/x" button-size="l" /></template>');
  const s = propSamples(dir);
  assert.equal(s.icon, 'm/home-m'); assert.equal(s.label, 'Save'); assert.equal(s.buttonSize, 'l');
  assert.equal(s.class, undefined); assert.equal(s.title, undefined, 'a bound value is never taken');
});

test('a state Figma\'s default variant has on (Disabled) starts off; its on is a case of its own', () => {
  const cases = harnessCases({ properties: { disabled: { type: 'VARIANT', defaultValue: 'true', variantOptions: ['false', 'true'] }, size: { type: 'VARIANT', defaultValue: 's', variantOptions: ['s', 'm'] } } });
  assert.equal(cases[0].props.disabled, 'false');
  assert.equal(cases[0].props.size, 's', 'any other variant keeps Figma\'s default');
  assert.ok(cases.some((c) => c.label === 'disabled=true'));
});

test('a Vue component drawn as the product draws it: Figma\'s names in the code\'s words, its icon, its app\'s plugins', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vue-figma-names-')); APP(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true, dependencies: { vue: '^3.5.0' } }));
  writeFileSync(join(dir, 'vite.config.js'), "import vue from '@vitejs/plugin-vue'\nimport { fileURLToPath } from 'node:url'\nexport default { plugins: [vue()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }");
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const propsSnap = { button: { properties: {
    'labelContent#1:2': { type: 'TEXT', defaultValue: 'Label' }, 'iconContent#1:3': { type: 'INSTANCE_SWAP', defaultValue: '9:9' },
    'showLabel#1:4': { type: 'BOOLEAN', defaultValue: true }, size: { type: 'VARIANT', defaultValue: 's', variantOptions: ['s', 'l'] },
    disabled: { type: 'VARIANT', defaultValue: 'true', variantOptions: ['false', 'true'] } } } };
  const r = await renderedVue(dir, {}, ['button'], { propsSnap, locate: () => join(dir, 'src', 'components', 'Button.vue'), chromePath: CHROME, max: 4 });
  assert.deepEqual(r.failed, [], JSON.stringify(r));
  const at = (label) => r.cases.button.find((c) => c.label === label)?.markup ?? '';
  assert.match(at('default'), /class="btn s" data-ready="1" data-hint=""><span class="label">LABEL<\/span><i class="icon" data-icon="m\/home-m">/, 'labelContent as label through the app\'s plugin, size as buttonSize, the icon its pages use, an object it reads given, not disabled');
  assert.doesNotMatch(at('showLabel=false'), /class="label"/, 'its label off: none given');
  assert.match(at('disabled=true'), /disabled=""/);
});

test('a component draws with the data its own documentation page gives it, read as plain data and never run', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pageSamples } = await import('../vue-harness.mjs');
  const root = mkdtempSync(join(tmpdir(), 'page-samples-'));
  mkdirSync(join(root, 'src', 'components', 'charts'), { recursive: true });
  mkdirSync(join(root, 'src', 'views'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'charts', 'Donut.vue'), '<template><div/></template>');
  writeFileSync(join(root, 'src', 'views', 'Donut.vue'), `<template><chart-donut :slices="chartData" :params="opts" :items="made"/></template>
<script setup>
import ChartDonut from '@/components/charts/Donut'
import { ref } from 'vue'
const chartData = [{ percentage: 45, label: 'Loans' }, { percentage: 55, label: 'Savings, current' }]
const opts = ref({ title: 'Totals', show: true })
const made = build([1, 2])
</script>`);
  const got = pageSamples(root)[join(root, 'src', 'components', 'charts', 'Donut.vue')];
  assert.deepEqual(got.slices, [{ percentage: 45, label: 'Loans' }, { percentage: 55, label: 'Savings, current' }]);
  assert.deepEqual(got.params, { title: 'Totals', show: true }, 'a ref() of a literal too');
  assert.equal(got.items, undefined, 'a value made by a call is never run');
});
