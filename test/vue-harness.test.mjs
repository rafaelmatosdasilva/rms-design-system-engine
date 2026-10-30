// Every variant of a component checked, every time, and a Vue design system's components drawn and tried from their
// code: the project's own Vite renders each .vue file in each of its variants (Figma's, else its own props'), for
// the browser accessibility check and for the style guide, its SCSS compiled.
//
// The Vue tests use the build tools a Vue project has installed, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.vue-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, symlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { variantsFromCode, startHarness, loadTypeScript } from '../component-harness.mjs';
import { globalStyles, renderedVue, appPlugins, appSetup, runtimeDeps, propSamples } from '../vue-harness.mjs';
import { harnessCases } from '../component-harness.mjs';
import { textComponentApi } from '../component-source.mjs';
import { findChrome } from '../cdp.mjs';
import { budget, tempDir } from './helpers.mjs';
import { readPage } from '../styleguide-files.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const TOOLS = join(ENGINE, 'test', '.vue-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) ? false
  : 'no Chrome, or no Vue build tools (npm ci --prefix test/.vue-tools)';

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
  const dir = tempDir(prefix);
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
  const dir = tempDir('vue-styles-');
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'src', 'main.ts'), "import { createApp } from 'vue';\nimport './styles/main.scss';\nimport '@acme/ui/dist/style.css';\nimport App from './App.vue';\n");
  assert.deepEqual(globalStyles(dir, { paths: { themeCSS: 'src/styles/tokens.css' } }), ['/src/styles/tokens.css', '/src/styles/main.scss', '@acme/ui/dist/style.css']);
});

test('a React component with no Figma variants is rendered in its code\'s', { skip: loadTypeScript(ENGINE) ? false : 'no TypeScript' }, async () => {
  const dir = tempDir('react-code-variants-');
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
  const page = readPage(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'));
  // What it renders, its bound classes included (a template read cannot know hb-chip--quiet), from its own build.
  assert.match(page, /"name":"chip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton data-v-[a-f0-9]+=\\"\\" class=\\"hb-chip hb-chip--quiet\\" type=\\"button\\" aria-pressed=\\"false\\">Filter\\u003c\/button>"/);
  assert.match(page, /\.hb-chip\[data-v-[a-f0-9]+\] \{\n {2}padding: 4px 8px;\n\}/, 'its scoped SCSS, compiled');
  // Without the packages, its template is read as before, and the summary says why.
  const bare = tempDir('vue-sg-bare-');
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
  const data = JSON.parse(readPage(file).match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
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
const STORES = existsSync(join(TOOLS, 'pinia')) && existsSync(join(TOOLS, 'vue-router')) ? READY : 'no pinia or vue-router (npm ci --prefix test/.vue-tools)';

test('a Vue component that reads a Pinia store and links with the router renders with the project\'s own Pinia and router', { skip: STORES, timeout: budget(300000) }, async () => {
  const project = (deps) => {
    const dir = tempDir('vue-store-');
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
  const dir = tempDir('vue-app-'); APP(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: { vue: '^3.5.0' } }));
  assert.deepEqual(appSetup(dir).map((x) => `${x.kind} ${x.spec}`), [
    'import /src/App.vue', 'import /src/router/router', 'import @/shout', 'import @/components/BaseIcon.vue',
    'use @/shout', 'component @/components/BaseIcon.vue',
  ], 'the router is loaded, never installed: the page gives each instance its own');
});

test('the packages the code imports are bundled before the page loads, never a tool only its scripts run', () => {
  const dir = tempDir('vue-deps-');
  mkdirSync(join(dir, 'src', 'figma'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.vue'), "<script setup>import moment from 'moment-timezone'\nimport './local.js'\nimport '@/b'\nimport 'prismjs/themes/prism.css'\nimport Prism from 'prismjs'</script>");
  writeFileSync(join(dir, 'src', 'figma', 'a.figma.js'), "import figma from '@figma/code-connect'");
  for (const n of ['moment-timezone', 'prismjs', '@figma/code-connect']) { mkdirSync(join(dir, 'node_modules', n), { recursive: true }); writeFileSync(join(dir, 'node_modules', n, 'package.json'), JSON.stringify({ name: n, main: 'index.js' })); }
  assert.deepEqual(runtimeDeps(dir), ['moment-timezone', 'prismjs']);
});

test('a text with no default takes the value the project\'s own pages pass it most', () => {
  const dir = tempDir('vue-samples-'); mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'A.vue'), '<template><X icon="m/home-m" label="Save" class="a" :title="t" /><X icon="m/home-m" /><X icon="s/x" button-size="l" /></template>');
  const s = propSamples(dir);
  assert.equal(s.icon, 'm/home-m'); assert.equal(s.label, 'Save'); assert.equal(s.buttonSize, 'l');
  assert.equal(s.class, undefined); assert.equal(s.title, undefined, 'a bound value is never taken');
});

test('a part loaded by a name it is given gets the name of a file it can load, the one the code uses most first', async () => {
  const { asyncChoices, keyedNames, withChoices, withCaseChoices } = await import('../vue-harness.mjs');
  const dir = tempDir('vue-parts-'); mkdirSync(join(dir, 'src', 'tiles'), { recursive: true }); mkdirSync(join(dir, 'src', 'panel'));
  for (const n of ['Banner', 'Outline', 'Solid']) writeFileSync(join(dir, 'src', 'tiles', `${n}.vue`), '<template><button/></template>');
  writeFileSync(join(dir, 'src', 'Page.vue'), "<script setup>const a = [{ kind: 'Solid' }, { kind: 'Solid' }, { kind: 'Outline' }]\nconst b = { tileKind: 'Outline' }</script>");
  const keyed = keyedNames(dir);
  const panel = join(dir, 'src', 'panel', 'Panel.vue');
  const listText = '<template><component v-for="(tile, i) in tiles" :is="part(tile.kind)" :label="tile.label"/></template>\n<script setup>\nimport { defineAsyncComponent } from \'vue\'\nconst part = (kind) => defineAsyncComponent(() => import(`../tiles/${kind}.vue`))\n</script>';
  const list = asyncChoices(dir, panel, listText, keyed);
  assert.deepEqual(list, [{ prop: 'tiles', field: 'kind', list: true, names: ['Solid', 'Outline', 'Banner'] }]);
  assert.deepEqual(withChoices({ tiles: [{ kind: 'Kind 1', label: 'Label 1' }, { kind: 'outline', label: 'Label 2' }] }, list).tiles, [{ kind: 'Solid', label: 'Label 1' }, { kind: 'Outline', label: 'Label 2' }], 'a made-up name replaced, a real one kept in the file\'s own case');
  const cellText = '<template><part v-bind="item"/></template>\n<script setup>\nconst part = computed(() => {\n  const tileKind = props.item.tileKind\n  return defineAsyncComponent(() => import(`@/tiles/${tileKind}.vue`))\n})\n</script>';
  const cell = asyncChoices(dir, join(dir, 'src', 'Slot.vue'), cellText, keyed);
  assert.deepEqual(cell.map(({ prop, field, list: l, names }) => [prop, field, l, names[0]]), [['item', 'tileKind', false, 'Outline']]);
  assert.deepEqual(withChoices({}, cell), { item: { tileKind: 'Outline' } }, 'an object prop given none gets one with the name');
  assert.deepEqual(asyncChoices(dir, panel, '<script setup>const x = import(`../missing/${n}.vue`)</script>', keyed), [], 'a folder that is not there gives nothing');
  // A prop of its own, through a table of names first; its cases drawn with names the table has.
  writeFileSync(join(dir, 'src', 'Menu.vue'), '<template><x-menu tile-kind="Outline"/><x-menu tile-kind="Outline"/></template>');
  const ownText = "<script setup>\nconst props = defineProps({ tileKind: String, size: { type: String } })\nconst fileFor = kind => {\n  const files = { Solid: 'Solid', Outline: 'Outline', Ghost: 'Ghost' }\n  return files[kind]\n}\nconst part = computed(() => {\n  const tileKind = props.tileKind\n  return defineAsyncComponent(() => import(`./tiles/${fileFor(tileKind)}.vue`))\n})\n</script>";
  const own = asyncChoices(dir, join(dir, 'src', 'Picker.vue'), ownText, keyedNames(dir), ['tileKind', 'size']);
  assert.deepEqual(own, [{ prop: 'tileKind', field: null, list: false, names: ['Outline', 'Solid'] }], 'the table\'s names whose file is there (no Ghost), the most written first; a type: option is never taken for a prop');
  assert.deepEqual(withCaseChoices([{ label: 'default', props: {} }, { label: 'tileKind="tileKind"', props: { tileKind: 'TileKind' } }, { label: 'tileKind=solid', props: { tileKind: 'solid' } }], own),
    [{ label: 'default', props: { tileKind: 'Outline' } }, { label: 'tileKind=solid', props: { tileKind: 'Solid' } }], 'a made-up name drawn as the most used, the case made only for it dropped when it is the default; a real one kept');
  assert.deepEqual(asyncChoices(dir, join(dir, 'src', 'Picker.vue'), '<script setup>\nconst part = defineAsyncComponent(() => import(`./tiles/${tileKind}.vue`))\n</script>', keyedNames(dir), ['size']), [], 'a bare name no declared prop gives is not taken for one');
});

test('a value no page writes takes what the project\'s other components declare that prop as, never its own name', async () => {
  const { propKinds, listSamples } = await import('../vue-harness.mjs');
  const apis = {
    'a/Solid.vue': { props: { tileSize: { type: 'string', options: ['s', 'm', 'l'], default: 'm' }, stretched: { type: 'boolean' }, count: { type: 'number' } } },
    'a/Ghost.vue': { props: { tileSize: { type: 'string', options: ['s', 'm'] }, stretched: { type: 'boolean' } } },
    'a/Strip.vue': { props: { tileSize: { type: 'string' } } },
    'a/notes.js': { props: { tileSize: { type: 'number' } } },
  };
  const kinds = propKinds(Object.keys(apis), (f) => apis[f]);
  assert.deepEqual(kinds.tileSize, { type: 'string', options: ['s', 'm', 'l'], default: 'm' }, 'the type most give it, the options of the one that lists the most; only .vue files');
  assert.equal(kinds.stretched.type, 'boolean');
  const tpl = '<template><div v-for="t in tiles"><x :tile-size="t.tileSize" :stretched="t.stretched" :count="t.count" :align="t.align" :label="t.label"/></div></template>';
  const items = listSamples(tpl, ['tiles'], { align: 'center' }, null, {}, kinds).tiles;
  assert.deepEqual(items[1], { tileSize: 'm', stretched: false, count: 2, align: 'center 2', label: 'Label 2' }, 'its default option, off, a number; a sample of a field with no options and a text keep their words');
  assert.equal(listSamples(tpl, ['tiles'], { align: 'center' }, null, {}, { ...kinds, align: { type: 'string', options: ['left', 'center'] } }).tiles[0].align, 'center', 'a sample of a field with options is used as it is');
  const { variantsFromCode } = await import('../component-harness.mjs');
  const labels = variantsFromCode({ props: { tileSize: { type: 'string' }, label: { type: 'string' } } }, "defineProps({ tileSize: String, label: String })", 16, kinds).map((c) => c.label);
  assert.deepEqual(labels.filter((l) => l.startsWith('tileSize')), ['tileSize=s', 'tileSize=l'], 'a bare prop drawn in the options the others declare, not as tileSize="tileSize"');
  assert.ok(labels.includes('label="label"'), 'a text still shows its own name as its words');
});

test('a state Figma\'s default variant has on (Disabled) starts off; its on is a case of its own', () => {
  const cases = harnessCases({ properties: { disabled: { type: 'VARIANT', defaultValue: 'true', variantOptions: ['false', 'true'] }, size: { type: 'VARIANT', defaultValue: 's', variantOptions: ['s', 'm'] } } });
  assert.equal(cases[0].props.disabled, 'false');
  assert.equal(cases[0].props.size, 's', 'any other variant keeps Figma\'s default');
  assert.ok(cases.some((c) => c.label === 'disabled=true'));
});

test('a Vue component drawn as the product draws it: Figma\'s names in the code\'s words, its icon, its app\'s plugins', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = tempDir('vue-figma-names-'); APP(dir);
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
  assert.match(at('default'), /class="btn s" data-ready="1" data-hint="Hint 1"><span class="label">LABEL<\/span><i class="icon" data-icon="m\/home-m">/, 'labelContent as label through the app\'s plugin, size as buttonSize, the icon its pages use, an object it reads given with the field it reads, not disabled');
  assert.doesNotMatch(at('showLabel=false'), /class="label"/, 'its label off: none given');
  assert.match(at('disabled=true'), /disabled=""/);
});

test('a component draws with the data its own documentation page gives it, read as plain data and never run', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { pageSamples } = await import('../vue-harness.mjs');
  const root = tempDir('page-samples-');
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

test('an object a part reads: a date it reads left out, a field it loops over through a name of its own a list', async () => {
  const { objectSamples } = await import('../vue-harness.mjs');
  const got = objectSamples('const names = props.words.shortNames\nreturn names.map((n) => n)\nprops.words.longNames; props.range.from; props.range.startDate; props.range.label', ['words', 'range']);
  assert.deepEqual(got.words.shortNames, ['ShortName 1', 'ShortName 2', 'ShortName 3']);
  assert.equal(typeof got.words.longNames, 'string', 'one it only passes on is a value');
  assert.deepEqual(got.range, { label: 'Label 1' }, 'from and startDate are dates: left out, as a page that gives none');
});

test('an object a part reads: a word method makes a field a text, a field read into an object, a compared word and a table name used', async () => {
  const { objectSamples } = await import('../vue-harness.mjs');
  const code = `const tint = props.option.tintColor
if (tint.startsWith('--')) x(); else if (tint.includes('-')) y()
const name = props.button.kind.charAt(0).toUpperCase() + props.button.kind.slice(1)
if (props.button.kind === 'solid') z()
props.rows.lines.length; props.rows.title.length
const parts = { Plain: A, Money: B }
const C = parts[props.cell.partKind]
props.amount.params.label; props.amount.params.isQuantity; props.amount.params.from; props.amount.figure; props.amount.pinIcon`;
  const got = objectSamples(code, ['option', 'button', 'rows', 'cell', 'amount'], { icon: 'm/home-m' }, {}, { numeric: ['amount.figure'], icons: ['amount.pinIcon'] });
  assert.equal(typeof got.option.tintColor, 'string', 'includes beside startsWith: a text, never a list');
  assert.equal(got.button.kind, 'solid', 'the word the code compares it with');
  assert.ok(Array.isArray(got.rows.lines) && got.rows.lines.length === 3, 'a plural it measures: a list');
  assert.equal(typeof got.rows.title, 'string', 'a singular it measures: a text has a length too');
  assert.equal(got.cell.partKind, 'Plain', 'the first name of the table it looks it up in');
  const used = objectSamples(`${code}\nif (props.cell.partKind === 'Other') w()`, ['cell'], {}, {}, { keyed: { partKind: { Money: 3 } } });
  assert.equal(used.cell.partKind, 'Money', 'the table\'s name the project writes most, before a word it is compared with');
  assert.deepEqual(got.amount.params, { label: 'Label 1', isQuantity: false }, 'read into further: an object of those fields, a date left out');
  assert.equal(got.amount.figure, 1, 'passed on to a child that takes a number');
  assert.equal(got.amount.pinIcon, 'm/home-m', 'passed on as a child\'s icon');
});

test('a value passed on to a child takes what the child declares: a number, its icon, or unset where the child falls back', async () => {
  const { childFacing } = await import('../vue-harness.mjs');
  const { textComponentApi } = await import('../component-source.mjs');
  const dir = tempDir('vue-child-');
  mkdirSync(join(dir, 'src', 'parts'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'acme-money-field'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'acme-money-field', 'package.json'), JSON.stringify({ name: 'acme-money-field', main: 'index.js' }));
  writeFileSync(join(dir, 'node_modules', 'acme-money-field', 'index.js'), 'export default { props: { value: [String, Number], label: [String, Number] } }');
  writeFileSync(join(dir, 'src', 'parts', 'DayGrid.vue'), '<script setup>\nconst props = defineProps({ language: Object, caption: [String, Number] })\nconst words = props.language || {}\n</script><template><ol /></template>');
  writeFileSync(join(dir, 'src', 'parts', 'AcIcon.vue'), '<script setup>defineProps({ icon: String })</script><template><i /></template>');
  const file = join(dir, 'src', 'CardTile.vue');
  const text = `<template><div>
  <day-grid :language="language" :caption="title" />
  <acme-money-field :value="amount.figure" :label="amount.label" />
  <ac-icon :icon="pin" />
</div></template>
<script setup>
import DayGrid from './parts/DayGrid'
defineProps({ language: Object, title: String, amount: Object, pin: String })
</script>`;
  const got = childFacing(dir, file, text, (f, t) => textComponentApi(f, t), undefined, { AcIcon: '/src/parts/AcIcon.vue' });
  assert.deepEqual(got.numeric, ['amount.figure'], 'the package\'s number; a text (title, label) keeps its words');
  assert.deepEqual(got.icons, ['pin'], 'the icon of a component the entry registers');
  assert.deepEqual(got.fallback, ['language'], 'the child falls back from it when not given');
});

test('a text the code compares with words takes those words; a part never loads its own file by name', async () => {
  const { comparedWords, variantsFromCode } = await import('../component-harness.mjs');
  const text = "<script setup>\nconst props = defineProps({ view: String })\nswitch (props.view) { case 'week': a(); break; case 'month': b() }\nif (props.view === 'day') c()\n</script>";
  assert.deepEqual(comparedWords(text, 'view'), ['day', 'week', 'month']);
  assert.deepEqual(variantsFromCode(textComponentApi('Planner.vue', text), text).map((c) => c.label), ['default', 'view=week', 'view=month'], 'never view="View", which it would refuse');
  const { asyncChoices } = await import('../vue-harness.mjs');
  const dir = tempDir('vue-own-');
  mkdirSync(join(dir, 'src', 'tiles'), { recursive: true });
  for (const n of ['Group', 'Solid', 'Ghost']) writeFileSync(join(dir, 'src', 'tiles', `${n}.vue`), '<template><i /></template>');
  const own = join(dir, 'src', 'tiles', 'Group.vue');
  const src = "<script setup>\nconst props = defineProps({ tileKind: { type: String, default: 'Solid' } })\nconst part = defineAsyncComponent(() => import(`../tiles/${props.tileKind}.vue`))\n</script>";
  assert.deepEqual(asyncChoices(dir, own, src, {}, ['tileKind'])[0].names, ['Ghost', 'Solid'], 'its own file is not one of the names');
});

test('a translation function the entry installs another way is installed the same way: set on every component, provided, mixed in, or by a setup function', () => {
  const dir = tempDir('vue-entry-');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'main.js'), `import { createApp } from 'vue'
import App from './App.vue'
import i18n, { LOCALE_KEY } from '@/i18n'
import words from '@/words-mixin'
import setupFormats from '@/setup-formats'
import mountEverything from '@/mount-everything'
const app = createApp(App)
app.config.globalProperties.$tr = i18n.global.tr
app.config.globalProperties.$alert = window.alert.bind(window)
app.provide('translate', i18n)
app.provide(LOCALE_KEY, i18n.global)
app.mixin(words)
setupFormats(app)
mountEverything(app)
app.mount('#app')`);
  const got = appSetup(dir).filter((x) => x.kind !== 'import');
  assert.deepEqual(got, [
    { kind: 'global', name: '$tr', spec: '@/i18n', path: ['global', 'tr'] },
    { kind: 'provide', spec: '@/i18n', key: 'translate' },
    { kind: 'provide', spec: '@/i18n', path: ['global'], keySpec: '@/i18n', keyNamed: 'LOCALE_KEY' },
    { kind: 'mixin', spec: '@/words-mixin' },
    { kind: 'call', spec: '@/setup-formats' },
  ], 'a value the entry builds (window.alert.bind) and a function that mounts are left alone');
});

test('what the page of components could not draw is said once per component, with why; only what the page could not set up is tried again', async () => {
  const { harnessNotDrawn } = await import('../vue-harness.mjs');
  const got = harnessNotDrawn([
    { name: 'calendar (default)', component: 'calendar', case: 'default', of: 3, why: 'no month names' },
    { name: 'calendar (view=month)', component: 'calendar', case: 'view=month', of: 3, why: 'no month names' },
    { name: 'search (locked=true)', component: 'search', case: 'locked=true', of: 2, why: 'it calls field.focus() as it draws' },
    { name: 'cell', component: 'cell', why: 'it drew nothing in any of its 1 case' },
    { name: 'pager (default)', component: 'pager', case: 'default', of: 1, why: 'x' },
    { name: "the app's use", why: 'i18n did not load' },
  ]);
  assert.deepEqual(got.notDrawn, ['calendar (no month names, in 2 of its 3 cases)', 'search (it calls field.focus() as it draws, in 1 of its 2 cases)', 'cell (it drew nothing in any of its 1 case)', 'pager (x, in every case)']);
  assert.deepEqual(got.unrendered, ["the app's use (i18n did not load)"]);
});

test('components that need data the page does not give draw from their code, and one that cannot says why', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = tempDir('vue-data-');
  mkdirSync(join(dir, 'src', 'components', 'parts'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', private: true, dependencies: { vue: '^3.5.0' } }));
  writeFileSync(join(dir, 'vite.config.js'), "import vue from '@vitejs/plugin-vue'\nimport { fileURLToPath } from 'node:url'\nexport default { plugins: [vue()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }");
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'src', 'main.js'), `import { createApp } from 'vue'
import App from './App.vue'
import i18n from '@/i18n'
import setupFormats from '@/setup-formats'
const app = createApp(App)
app.config.globalProperties.$tr = i18n.global.tr
setupFormats(app)
app.mount('#app')`);
  writeFileSync(join(dir, 'src', 'App.vue'), '<template><div /></template>');
  writeFileSync(join(dir, 'src', 'i18n.js'), "export default { global: { tr: (k) => 'T:' + k } }");
  writeFileSync(join(dir, 'src', 'setup-formats.js'), 'export default function setupFormats (app) { app.config.globalProperties.$money = (n) => n.toFixed(2) }');
  const C = join(dir, 'src', 'components');
  writeFileSync(join(C, 'parts', 'AmountField.vue'), "<script setup>\nimport { computed } from 'vue'\nconst props = defineProps({ value: [String, Number] })\nconst shown = computed(() => (props.value ? props.value.toFixed(2) : ''))\n</script><template><input class=\"amount\" :value=\"shown\"></template>");
  writeFileSync(join(C, 'parts', 'DayGrid.vue'), "<script setup>\nimport { computed } from 'vue'\nconst props = defineProps({ language: Object })\nconst words = computed(() => props.language || { months: ['Jan', 'Feb'] })\n</script><template><ol class=\"grid\"><li v-for=\"m in words.months.slice(0, 1)\" :key=\"m\">{{ m }}</li></ol></template>");
  writeFileSync(join(C, 'Converter.vue'), "<script setup>\nimport AmountField from './parts/AmountField.vue'\ndefineProps({ amount: { type: Object, required: true } })\n</script><template><div class=\"converter\"><span>{{ amount.params.label }}</span><amount-field :value=\"amount.figure\" /></div></template>");
  writeFileSync(join(C, 'Calendar.vue'), "<script setup>\nimport DayGrid from './parts/DayGrid.vue'\ndefineProps({ language: Object })\n</script><template><div class=\"calendar\"><day-grid :language=\"language\" /></div></template>");
  writeFileSync(join(C, 'Greeting.vue'), '<template><p class="greet">{{ $tr(\'hello\') }} {{ $money(2) }}</p></template>');
  writeFileSync(join(C, 'Search.vue'), "<script setup>\nimport { ref, onMounted } from 'vue'\nconst props = defineProps({ locked: Boolean })\nconst field = ref(null)\nonMounted(() => field.value.focus())\n</script><template><div class=\"search\"><input v-if=\"!locked\" ref=\"field\"><span v-else>Locked</span></div></template>");
  writeFileSync(join(C, 'Cell.vue'), "<script setup>\nimport { computed } from 'vue'\nconst props = defineProps({ value: [String, Number, Object] })\nconst content = computed(() => (props.value && typeof props.value === 'object' ? props.value.value : props.value))\n</script><template><div v-if=\"content\" class=\"cell\">{{ content }}</div></template>");
  writeFileSync(join(C, 'Picture.vue'), '<script setup>defineProps({ count: Number })</script><template><b v-if="count">{{ count }}</b></template>');
  const names = ['converter', 'calendar', 'greeting', 'search', 'cell', 'picture'];
  const file = (n) => join(C, `${n.charAt(0).toUpperCase() + n.slice(1)}.vue`);
  const r = await renderedVue(dir, {}, names, { locate: file, chromePath: CHROME, max: 4 });
  const failed = (n) => r.failed.filter((f) => f.component === n);
  for (const n of ['converter', 'calendar', 'greeting', 'cell']) assert.deepEqual(failed(n), [], `${n}: ${JSON.stringify(r.failed)}`);
  assert.match(r.markup.converter, /<span>Label 1<\/span><input class="amount" value="1.00">/, 'the amount its child does arithmetic on is a number; the object it reads into is one');
  assert.match(r.markup.calendar, /<li>Jan<\/li>/, 'the language its child falls back from is left unset');
  assert.match(r.markup.greeting, /T:hello 2\.00/, 'what the entry sets on every component, and what its setup function installs');
  assert.match(r.markup.cell, />Value<\/div>/, 'a value it shows as it is: words');
  assert.match(JSON.stringify(failed('search')), /it calls field\.focus\(\) as it draws, on the element ref=\\"field\\" names, which its template does not draw in this case/, JSON.stringify(r.failed));
  assert.equal(failed('search')[0].case, 'locked=true');
  assert.match(failed('picture')[0]?.why ?? '', /drew nothing in any of its \d+ cases?: its template shows nothing for the props it was given \(none given for count\)/, JSON.stringify(r.failed));
});

test('a Code Connect file that writes a prop only while a property has a value never gives it that value', async () => {
  const { harnessModule } = await import('../vue-harness.mjs');
  const mod = harnessModule([{ name: 'x', file: '/x.vue', cases: [], role: '' }]);
  assert.match(mod, /x\.role !== 'condition' \|\| types\.includes\(Boolean\)/, 'a condition sets only an on/off');
  assert.match(mod, /x\.unclear \|\| x\.equals != null\) continue/, 'only a plain switch removes a part');
});

test('a component that reads the route is drawn at a path its code expects: a name of the table it looks the path up in, a word or a path it compares', async () => {
  const { routeFor } = await import('../vue-harness.mjs');
  const menu = `const route = useRoute()
const shown = ref('parts')
const pick = (path) => {
  const base = path.split('/')[1]
  const menus = { guides: guidesMenu, parts: partsMenu }
  return menus[base]
}`;
  assert.deepEqual(routeFor(menu), { path: '/parts' }, 'the table\'s name its code also writes as a word of its own');
  assert.deepEqual(routeFor(menu.replace("ref('parts')", 'ref(null)')), { path: '/guides' }, 'else the table\'s first');
  assert.deepEqual(routeFor("const r = useRoute()\nconst section = r.path.split('/')[2]\nif (section === 'cards') x()"), { path: '/page/cards' }, 'a word it compares the part with, at that part');
  assert.deepEqual(routeFor("<template><b v-if=\"$route.path.startsWith('/docs')\" /></template>"), { path: '/docs' });
  assert.match(routeFor('const r = useRoute(); r.params.slug.split("-")').why, /no path it expects could be read from its code/);
  assert.equal(routeFor('const x = 1'), null, 'a component that reads no route is drawn as before');
});

test('the items of a list inside an object get the fields the code reads of them, and those a child it hands each to reads; a list inside an item is empty', async () => {
  const { objectSamples, childFacing } = await import('../vue-harness.mjs');
  const code = `<template><row-line v-for="(row, index) in shown" :info="row" /><i v-for="e in props.docs.events">{{ e.name }} {{ e.link.path }}</i></template>
<script setup>
const props = defineProps({ docs: Object })
const shown = computed(() => {
  return props.docs.rows?.reduce((acc, item) => {
    acc.push(item)
    if (item.subRows) item.subRows.map((sub) => acc.push(sub.label))
    return acc
  }, [])
})
</script>`;
  const child = '<template><b>{{ info.kind.split(", ") }} {{ info.title }}</b></template>';
  const got = objectSamples(code, ['docs'], {}, {}, { items: { row: [{ text: child, prop: 'info' }] } });
  assert.deepEqual(got.docs.rows[1], { kind: 'Kind 2', title: 'Title 2', subRows: [] }, 'what the child reads of each, and a list inside an item given empty');
  assert.deepEqual(got.docs.events[0], { name: 'Name 1', link: { path: 'Path 1' } }, 'a list it loops over in its template, with the fields it reads');
  assert.deepEqual(objectSamples(code, ['docs'], {}, {}, { flat: true }).docs.rows, ['Row 1', 'Row 2', 'Row 3'], 'a page drawn as a whole is given what it always was');
  const dir = tempDir('vue-items-');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'RowLine.vue'), `<script setup>defineProps({ info: Object })</script>${child}`);
  const passed = childFacing(dir, join(dir, 'src', 'DocsTable.vue'), code.replace('<script setup>', "<script setup>\nimport RowLine from './RowLine.vue'"), (f, t) => textComponentApi(f, t));
  assert.deepEqual(passed.items.row.map((x) => x.prop), ['info'], 'an item handed whole to a child that takes an object');
});

test('an icon that loads from a folder its code globs is given a name of a file in that folder', async () => {
  const { asyncChoices } = await import('../vue-harness.mjs');
  const dir = tempDir('vue-glob-');
  mkdirSync(join(dir, 'src', 'glyphs', 'arrows'), { recursive: true });
  writeFileSync(join(dir, 'src', 'glyphs', 'star.svg'), '<svg/>');
  writeFileSync(join(dir, 'src', 'glyphs', 'arrows', 'up.svg'), '<svg/>');
  const file = join(dir, 'src', 'AcGlyph.vue');
  const deep = "<script setup>\nconst props = defineProps({ glyph: String })\nconst all = import.meta.glob('./glyphs/**/*.svg')\nconst load = computed(() => all[`./glyphs/${props.glyph}.svg`])\n</script>";
  assert.deepEqual(asyncChoices(dir, file, deep, {}, ['glyph']), [{ prop: 'glyph', field: null, list: false, names: ['arrows/up', 'star'] }], 'every file the glob lists, by its path from the folder');
  assert.deepEqual(asyncChoices(dir, file, deep.replace('**/*.svg', '*.svg'), { glyph: { star: 2 } }, ['glyph'])[0].names, ['star'], 'only the folder itself when the glob does not reach under it');
  assert.deepEqual(asyncChoices(dir, file, deep, {}, ['glyph'], { globs: false }), [], 'a page drawn as a whole: as before');
});

test('components drawn alone get the route they read, nested items and an icon of their own folder; an error that names no input is said as the input that was missing', { skip: STORES, timeout: budget(300000) }, async () => {
  const dir = tempDir('vue-last-');
  const C = join(dir, 'src', 'components');
  mkdirSync(join(C, 'glyphs'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', private: true, dependencies: { vue: '^3.5.0', 'vue-router': '^4.0.0' } }));
  writeFileSync(join(dir, 'vite.config.js'), "import vue from '@vitejs/plugin-vue'\nexport default { plugins: [vue()] }");
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  writeFileSync(join(C, 'NavMenu.vue'), `<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const menu = ref([])
const show = (path) => {
  const base = path.split('/')[1]
  const menus = { guides: [{ id: 'g', label: 'Guides' }], parts: [{ id: 'p', label: 'Parts' }] }
  menu.value = menus[base]
  menu.value = menu.value.map((m) => ({ ...m, open: true }))
}
watch(route, (r) => show(r.path), { immediate: true })
</script><template><ul class="nav"><li v-for="m in menu" :key="m.id">{{ m.label }}</li></ul></template>`);
  writeFileSync(join(C, 'RowLine.vue'), '<script setup>defineProps({ info: Object })</script><template><p class="row">{{ info.kind.split(", ").join("+") }}</p></template>');
  writeFileSync(join(C, 'DocsTable.vue'), `<script setup>
import { computed } from 'vue'
import RowLine from './RowLine.vue'
const props = defineProps({ docs: Object })
const shown = computed(() => props.docs.rows?.reduce((acc, item) => { acc.push(item); if (item.subRows) item.subRows.map((sub) => acc.push(sub)); return acc }, []))
</script><template><div class="docs"><row-line v-for="(row, i) in shown" :key="i" :info="row" /></div></template>`);
  writeFileSync(join(C, 'glyphs', 'star.vue'), '<template><svg class="star" /></template>');
  writeFileSync(join(C, 'AcGlyph.vue'), `<script setup>
import { computed, defineAsyncComponent } from 'vue'
const props = defineProps({ glyph: String })
const all = import.meta.glob('./glyphs/**/*.vue')
const part = computed(() => (all[\`./glyphs/\${props.glyph}.vue\`] ? defineAsyncComponent(all[\`./glyphs/\${props.glyph}.vue\`]) : null))
</script><template><component :is="part" v-if="part" /></template>`);
  writeFileSync(join(C, 'OddCard.vue'), '<script setup>defineProps({ entry: [Object, Array] })</script><template><b class="odd">{{ entry.title }}</b></template>');
  writeFileSync(join(C, 'SummaryBox.vue'), "<script setup>\nimport RowLine from './RowLine.vue'\nconst summary = {}\n</script><template><row-line :info=\"summary\" /></template>");
  const names = ['NavMenu', 'DocsTable', 'AcGlyph', 'OddCard', 'SummaryBox'];
  const r = await renderedVue(dir, {}, names, { locate: (n) => join(C, `${n}.vue`), chromePath: CHROME });
  const failed = (n) => r.failed.filter((f) => f.component === n);
  for (const n of ['NavMenu', 'DocsTable', 'AcGlyph']) assert.deepEqual(failed(n), [], `${n}: ${JSON.stringify(r.failed)}`);
  assert.match(r.markup.NavMenu, /<li>Parts<\/li>|<li>Guides<\/li>/, 'drawn at a path its menu table has');
  assert.match(r.markup.DocsTable, /<p class="row">Kind 1<\/p>/, 'each item has the fields the child it is handed to reads');
  assert.match(r.markup.AcGlyph, /<svg class="star"/, 'an icon of its own folder');
  assert.match(failed('OddCard')[0]?.why ?? '', /the input entry was missing: it was not given, and OddCard\.vue reads entry\.title as it draws/, JSON.stringify(r.failed));
  assert.match(failed('SummaryBox')[0]?.why ?? '', /the input info\.kind was missing in RowLine\.vue, a part it draws with what it hands it, which reads info\.kind\.split/, JSON.stringify(r.failed));
});
