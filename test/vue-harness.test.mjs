// Every variant of a component checked, every time, and a Vue design system's components drawn and tried from their
// code (E28): the project's own Vite renders each .vue file in each of its variants (Figma's, else its own props'), for
// the browser accessibility check and for the style guide, its SCSS compiled.
//
// The Vue tests use the build tools a Vue project has installed, laid in a gitignored folder as CI does:
//   npm install --prefix test/.vue-tools vite@6 @vitejs/plugin-vue@5 vue@3 sass@1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { variantsFromCode, startHarness, loadTypeScript } from '../component-harness.mjs';
import { globalStyles } from '../vue-harness.mjs';
import { textComponentApi } from '../component-source.mjs';
import { findChrome } from '../cdp.mjs';

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

test('the browser check tries every variant of a Vue component, rendered by the project\'s own Vite', { skip: READY, timeout: 300000 }, () => {
  const dir = harbor('vue-a11y-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 250000, env: { ...process.env, CHROME_PATH: CHROME } });
  const out = r.stdout + r.stderr;
  assert.match(out, /ℹ️ {2}\[a11y\] target: 4 Vue component\(s\) rendered with the project's own Vite in each variant \(button: 3 from Figma, badge: 3 from Figma, iconButton: 1 from its props, HbChip: 4 from its props\)/, out);
  const d = JSON.parse(r.stdout.slice(r.stdout.indexOf('{\n')));
  assert.ok(d.target.includes('the Vue components, rendered with the project\'s own Vite'), out);
  // The icon button has no name in any variant; the chip has none only when its label is empty: two nameless buttons,
  // one of them a variant no page shows.
  assert.equal(d.issues.filter((i) => i.issue === 'name').length, 2, out);
  assert.equal(d.notRead, undefined, out);
});

test('the style guide draws a Vue component as the project\'s own Vite renders it, its SCSS compiled', { skip: READY, timeout: 300000 }, () => {
  const dir = harbor('vue-sg-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', timeout: 250000, env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /4 of 4 Vue components drawn as the project's own Vite renders them\./);
  const page = readFileSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  // What it renders, its bound classes included (a template read cannot know hb-chip--quiet), from its own build.
  assert.match(page, /"name":"HbChip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton data-v-[a-f0-9]+=\\"\\" class=\\"hb-chip hb-chip--quiet\\" type=\\"button\\" aria-pressed=\\"false\\">Filter\\u003c\/button>","markupFrom":"vue-build"/);
  assert.match(page, /\.hb-chip\[data-v-[a-f0-9]+\] \{\n {2}padding: 4px 8px;\n\}/, 'its scoped SCSS, compiled');
  // Without the packages, its template is read as before, and the summary says why.
  const bare = mkdtempSync(join(tmpdir(), 'vue-sg-bare-'));
  cpSync(HARBOR, bare, { recursive: true });
  const b = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: bare, encoding: 'utf8', timeout: 250000, env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.match(b.stdout, /Vue components drawn from their templates: the project has no vue package installed\./);
});
