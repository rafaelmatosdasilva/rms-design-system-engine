// a Vue design system built with something other than Vite is rendered with its own build too: Nuxt (its whole
// app, auto-imports and components included), Vue CLI (its webpack config as vue.config.js shapes it) and webpack with
// vue-loader (its webpack.config), never with tools of the engine's.
//
// The tests use the build tools such a project has installed, laid in gitignored folders as CI does:
//   npm install --prefix test/.vue-cli-tools @vue/cli-service@5 vue@3 sass@1 sass-loader@16
//   npm install --prefix test/.nuxt-tools nuxt@4 vue@3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectBuild, renderedVue } from '../vue-harness.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI_TOOLS = join(ENGINE, 'test', '.vue-cli-tools', 'node_modules');
const NUXT_TOOLS = join(ENGINE, 'test', '.nuxt-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const ready = (tools, install) => (CHROME && typeof WebSocket !== 'undefined' && existsSync(tools) ? false : `no Chrome, or no build tools (${install})`);

// A project of files, its packages linked from a tools folder when given.
const project = (prefix, files, tools = null) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  if (tools) symlinkSync(tools, join(dir, 'node_modules'), 'dir');
  return dir;
};
const pkg = (name, main = 'index.js') => ({ [`node_modules/${name}/package.json`]: JSON.stringify({ name, version: '1.0.0', main }), [`node_modules/${name}/${main}`]: 'module.exports = {};\n' });

test('the project\'s own build, from its config files and its package.json: Nuxt, Vite, Vue CLI, webpack', async () => {
  const vue = pkg('vue');
  const nuxt = project('build-nuxt-', { 'package.json': '{"dependencies":{"nuxt":"^4.0.0"}}', 'nuxt.config.ts': 'export default {}', ...vue, 'node_modules/nuxt/package.json': JSON.stringify({ name: 'nuxt', exports: { './kit': './kit.js' } }), 'node_modules/nuxt/kit.js': 'export {}' });
  const cli = project('build-cli-', { 'package.json': '{"devDependencies":{"@vue/cli-service":"^5.0.0"}}', 'vue.config.js': 'module.exports = {};', ...vue, ...pkg('@vue/cli-service') });
  const webpack = project('build-wp-', { 'package.json': '{}', 'webpack.config.js': 'module.exports = {};', ...vue, ...pkg('webpack') });
  const noNuxt = project('build-nonuxt-', { 'package.json': '{}', 'nuxt.config.ts': 'export default {}', ...vue });
  const none = project('build-none-', { 'package.json': '{}', ...vue });
  try {
    assert.deepEqual([(await projectBuild(nuxt)).label, (await projectBuild(cli)).label, (await projectBuild(webpack)).label], ['Nuxt', 'Vue CLI', 'webpack']);
    assert.equal((await projectBuild(noNuxt)).why, 'the project is a Nuxt app (nuxt.config.ts) with no nuxt package installed to build it with');
    assert.match((await projectBuild(none)).why, /^the project has no build tool to render its Vue components with \(Vite, Nuxt, Vue CLI or webpack/);
  } finally { for (const d of [nuxt, cli, webpack, noNuxt, none]) rmSync(d, { recursive: true, force: true }); }
});

const CHIP = (p) => `<script>
export default { name: '${p}Chip', props: { label: { type: String, default: 'Filter' }, selected: { type: Boolean, default: false } } };
</script>
<template><button :class="['${p}-chip', { '${p}-chip--on': selected }]" type="button" :aria-pressed="selected"><span v-if="selected" class="${p}-chip-check">✓</span>{{ label }}</button></template>
<style scoped lang="scss">
.${p}-chip { padding: $pad calc($pad * 2); color: var(--${p}-ink); }
</style>
`;

test('a Vue CLI project: its webpack config as vue.config.js shapes it, each variant as it renders, the token CSS left out', { skip: ready(CLI_TOOLS, 'npm install --prefix test/.vue-cli-tools @vue/cli-service@5 vue@3 sass@1 sass-loader@16'), timeout: 240000 }, async () => {
  const dir = project('vue-cli-', {
    'package.json': '{"name":"cx","private":true,"dependencies":{"vue":"^3.5.0"},"devDependencies":{"@vue/cli-service":"^5.0.0"}}',
    // The SCSS variable every component shares comes from vue.config.js, as a Vue CLI project gives it.
    'vue.config.js': "module.exports = { css: { loaderOptions: { scss: { additionalData: '$pad: 4px;' } } } };",
    'public/index.html': '<!doctype html><html><body><div id="app"></div></body></html>',
    'src/styles/tokens.css': ':root { --cx-ink: #1a1a1a; --cx-surface: #ffffff; }\n',
    'src/styles/main.scss': 'body { margin: 0; }\n',
    'src/main.js': "import { createApp } from 'vue';\nimport './styles/tokens.css';\nimport './styles/main.scss';\nimport App from './App.vue';\ncreateApp(App).mount('#app');\n",
    'src/components/CxChip.vue': CHIP('cx'),
  }, CLI_TOOLS);
  try {
    const env = { ...process.env };
    const r = await renderedVue(dir, { paths: { themeCSS: 'src/styles/tokens.css' } }, ['CxChip'], { locate: () => join(dir, 'src/components/CxChip.vue'), chromePath: CHROME, max: 4 });
    assert.equal(r.build, 'Vue CLI', r.why);
    assert.match(r.markup.CxChip, /^<button data-v-[a-f0-9]+="" class="cx-chip" type="button" aria-pressed="false">Filter<\/button>$/);
    // A variant that changes the markup, not only a class: the check mark is there only when selected.
    assert.match(r.cases.CxChip.find((c) => c.label === 'selected=true').markup, /class="cx-chip cx-chip--on"[^>]*aria-pressed="true"><span data-v-[a-f0-9]+="" class="cx-chip-check">✓<\/span>Filter/);
    assert.match(r.css, /\.cx-chip\[data-v-[a-f0-9]+\] \{\n {2}padding: 4px 8px;/, 'its scoped SCSS, with the variable vue.config.js gives');
    assert.match(r.css, /body \{\n {2}margin: 0;/, 'the global styles its entry loads');
    assert.doesNotMatch(r.css, /--cx-surface/, 'the token CSS is the page\'s own');
    assert.deepEqual(r.failed, []);
    assert.equal(process.env.NODE_ENV, env.NODE_ENV, 'Vue CLI\'s environment is put back');
    assert.deepEqual(readdirSync(dir).sort(), ['.design-system-engine-out', 'node_modules', 'package.json', 'public', 'src', 'vue.config.js'], 'nothing written outside the engine\'s output');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a webpack project: its webpack.config (a function of the mode) with vue-loader', { skip: ready(CLI_TOOLS, 'npm install --prefix test/.vue-cli-tools @vue/cli-service@5 vue@3 sass@1 sass-loader@16'), timeout: 240000 }, async () => {
  const dir = project('vue-webpack-', {
    'package.json': '{"name":"wp","private":true,"dependencies":{"vue":"^3.5.0"},"devDependencies":{"webpack":"^5.0.0","vue-loader":"^17.0.0"}}',
    'webpack.config.js': `const { VueLoaderPlugin } = require('vue-loader');
module.exports = (env, argv) => ({
  entry: './src/main.js',
  module: { rules: [
    { test: /\\.vue$/, loader: 'vue-loader' },
    { test: /\\.css$/, use: ['vue-style-loader', 'css-loader'] },
    { test: /\\.scss$/, use: ['vue-style-loader', 'css-loader', { loader: 'sass-loader', options: { additionalData: '$pad: 6px;' } }] },
  ] },
  plugins: [new VueLoaderPlugin()],
});
`,
    'src/styles/tokens.css': ':root { --wp-ink: #1a1a1a; }\n',
    'src/main.js': "import './styles/tokens.css';\n",
    'src/components/WpChip.vue': CHIP('wp'),
  }, CLI_TOOLS);
  try {
    const r = await renderedVue(dir, { paths: { themeCSS: 'src/styles/tokens.css' } }, ['WpChip'], { locate: () => join(dir, 'src/components/WpChip.vue'), chromePath: CHROME, max: 4 });
    assert.equal(r.build, 'webpack', r.why);
    assert.match(r.markup.WpChip, /^<button data-v-[a-f0-9]+="" class="wp-chip" type="button" aria-pressed="false">Filter<\/button>$/);
    assert.match(r.css, /\.wp-chip\[data-v-[a-f0-9]+\] \{\n {2}padding: 6px 12px;/);
    assert.doesNotMatch(r.css, /--wp-ink:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a Nuxt project: its whole app (auto-imports, auto-registered components, the CSS its config names), client-side', { skip: ready(NUXT_TOOLS, 'npm install --prefix test/.nuxt-tools nuxt@4 vue@3'), timeout: 240000 }, async () => {
  const dir = project('vue-nuxt-', {
    'package.json': '{"name":"nx","private":true,"type":"module","dependencies":{"nuxt":"^4.0.0","vue":"^3.5.0"}}',
    'nuxt.config.ts': "export default defineNuxtConfig({ css: ['~/assets/tokens.css'] })\n",
    'app/app.vue': '<template><div><NuxtPage /></div></template>\n',
    'app/assets/tokens.css': ':root { --nx-ink: #1a1a1a; --nx-surface: #ffffff; }\n',
    'app/components/NxIcon.vue': '<template><svg class="nx-icon" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" /></svg></template>\n',
    // computed() and <NxIcon> are never imported: Nuxt's own build gives them, as on the project's pages.
    'app/components/NxChip.vue': `<script setup lang="ts">
const props = withDefaults(defineProps<{ tone?: 'quiet' | 'loud'; label?: string }>(), { tone: 'quiet', label: 'Filter' });
const cls = computed(() => ['nx-chip', \`nx-chip--\${props.tone}\`]);
</script>
<template><button :class="cls" type="button"><NxIcon />{{ label }}</button></template>
<style scoped>
.nx-chip { padding: 4px 8px; color: var(--nx-ink); }
</style>
`,
  }, NUXT_TOOLS);
  try {
    const r = await renderedVue(dir, { paths: { themeCSS: 'app/assets/tokens.css' } }, ['NxChip'], { locate: () => join(dir, 'app/components/NxChip.vue'), chromePath: CHROME, max: 4 });
    assert.equal(r.build, 'Nuxt', r.why);
    assert.match(r.markup.NxChip, /^<button data-v-[a-f0-9]+="" class="nx-chip nx-chip--quiet" type="button"><svg data-v-[a-f0-9]+="" class="nx-icon"/);
    assert.match(r.cases.NxChip.find((c) => c.label === 'tone=loud').markup, /class="nx-chip nx-chip--loud"/);
    assert.match(r.css, /\.nx-chip\[data-v-[a-f0-9]+\] \{ padding: 4px 8px;/);
    assert.doesNotMatch(r.css, /--nx-surface|sourceMappingURL|dse-case/, 'its token CSS, its source maps and the page\'s own style left out');
    assert.deepEqual(r.failed, []);
    assert.deepEqual(readdirSync(dir).sort(), ['.design-system-engine-out', 'app', 'node_modules', 'nuxt.config.ts', 'package.json'], 'its build files in the engine\'s output, not .nuxt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
