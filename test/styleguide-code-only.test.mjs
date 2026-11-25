// The components the code has. Once Figma's components are captured, a component only the code has keeps its
// page, marked Only in the code, and is a task on the Status page with its file (add it to Figma, or remove it from
// the code); styleguide.showCodeOnly: false leaves it off the pages, a task alone. Before
// Figma's data is captured, every component is the code's: shown with its file and the props its code declares, marked
// as compared with nothing in Figma, and drawn from its own source (a Vue template, as a React return is).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vueMarkup } from '../lib/vue-markup.mjs';
import { codeComponents, rootClassOf } from '../lib/component-source.mjs';
import { agreedView } from '../lib/styleguide-data.mjs';
import { budget, tempDir } from './helpers.mjs';
import { readPage } from '../lib/styleguide-files.mjs';

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

test('with no Figma capture the code\'s own list is read: the whole library, and a component that carries no class of its own', () => {
  // A React library that styles itself with CSS modules, styled components or clsx puts no literal class on any file,
  // and keeps an inner corner of its own under a components folder. Read as a captured system would be, it has one
  // component - the one internal file that happens to carry a class - and its page says a design system has nothing.
  const root = tempDir('no-capture-');
  const write = (f, text) => { mkdirSync(join(root, dirname(f)), { recursive: true }); writeFileSync(join(root, f), text); };
  write('src/Button/Button.tsx', "import classes from './Button.module.css';\nexport function Button(props) { return <button className={classes.Button} {...props} />; }\n");
  write('src/Banner/Banner.tsx', "import {clsx} from 'clsx';\nexport const Banner = forwardRef((p, ref) => <div ref={ref} className={clsx(p.tone)} />);\n");
  write('src/internal/components/Caret.tsx', 'export function Caret() { return <span className="Caret" />; }\n');
  write('src/internal/components/Spacer.tsx', 'export function Spacer() { return <span />; }\n');
  write('src/Button/Button.test.tsx', 'export function Nope() { return <i className="nope" />; }\n');

  const named = (cfg) => codeComponents(root, cfg).map((c) => c.name);
  assert.deepEqual(named({}), ['Banner', 'Button', 'Caret', 'Spacer'], 'the whole library, class or no class');

  // A capture names the components, and then the class and the components folder are how a file is paired with one:
  // read exactly as before, so a system with a capture sees no change at all.
  writeFileSync(join(root, 'figma.snapshot.json'), JSON.stringify({ Button: { properties: {} } }));
  const paired = { paths: { compPropsSnapshot: 'figma.snapshot.json' } };
  assert.deepEqual(named(paired), ['Caret'], 'the components folder, and only a file with a class of its own');
  assert.deepEqual(codeComponents(root, paired).map((c) => c.cls), ['Caret']);

  // A capture of its own components only: one that names nothing is no capture.
  writeFileSync(join(root, 'figma.snapshot.json'), JSON.stringify({ _at: '2026-11-18' }));
  assert.deepEqual(named(paired), ['Banner', 'Button', 'Caret', 'Spacer']);
});

test('with Figma\'s components a component only the code has is shown, marked so (off the page with showCodeOnly: false); with no Figma data every one is shown, said so', () => {
  const only = [{ name: 'Chip', file: 'components/Chip.vue', cls: 'chip', props: [{ name: 'label', default: 'Filter' }], markup: '<button class="chip">Filter</button>', from: 'vue' }];
  const none = agreedView({ codeOnly: only });
  assert.deepEqual(none.components.map((c) => [c.name, c.markup, c.markupFrom, c.codeOnly.figma]), [['Chip', '<button class="chip">Filter</button>', 'vue', false]]);
  assert.equal(none.notAgreed.line, 'No Figma data yet: these are the 1 component the code has, compared with nothing in Figma. Capture Figma\'s data (rms-design-system-engine --recipe refresh-figma) to compare them.');
  assert.equal(none.notInFigma, undefined, 'before Figma\'s data, nothing is a task for it');
  const figma = { propsSnap: { badge: { properties: {} } }, codeOnly: only, probes: { badge: '<span class="badge">x</span>' }, classFor: () => 'badge' };
  const withFigma = agreedView({ ...figma, cfg: { styleguide: { showCodeOnly: false } } });
  assert.deepEqual(withFigma.components.map((c) => c.name), ['badge'], 'Figma\'s components only');
  assert.deepEqual([withFigma.codeOnly, withFigma.notInFigma], [0, [{ name: 'Chip', file: 'components/Chip.vue' }]]);
  assert.equal(withFigma.notAgreed.line, 'Left off this page until Figma and the code agree: 1 component the code has and Figma does not. Each one is on the Status page, with who does it and what to do.');
  // Figma's own components are drawn as they were.
  const figmaOnly = agreedView({ ...figma, codeOnly: [] });
  assert.deepEqual(withFigma.components, figmaOnly.components);
  // By default it is shown, marked as compared with nothing.
  const shown = agreedView(figma);
  assert.equal(shown.components.find((c) => c.name === 'Chip').codeOnly.figma, true);
  assert.equal(shown.notInFigma, undefined);
  assert.match(shown.notAgreed.line, /1 component the code has is not in Figma: shown, marked as compared with nothing\.$/);
});

const chipVue = `<script setup lang="ts">\nwithDefaults(defineProps<{ tone?: 'quiet' | 'loud'; label?: string }>(), { tone: 'quiet', label: 'Filter' });\n</script>\n<template><button :class="['hb-chip', \`hb-chip--\${tone}\`]" type="button">{{ label }}</button></template>\n`;

test('the style guide of a Vue system: Figma\'s components with Figma\'s data, the code\'s before it', { timeout: budget(300000) }, () => {
  const run = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  // With Figma's data and styleguide.showCodeOnly: false: its three components; a chip only the code has is a task,
  // with its file.
  const withFigma = tempDir('sg-code-only-');
  cpSync(HARBOR, withFigma, { recursive: true });
  writeFileSync(join(withFigma, 'components', 'HbChip.vue'), chipVue);
  const off = JSON.parse(readFileSync(join(withFigma, 'ds-config.json'), 'utf8')); off.styleguide = { showCodeOnly: false };
  writeFileSync(join(withFigma, 'ds-config.json'), JSON.stringify(off, null, 2));
  const a = run(withFigma);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /\(3 components agreed, 1 in the code and not in Figma, on the Status page · the engine's template\)/);
  assert.match(a.stdout, /1 component the code has and Figma does not\. Each one is on the Status page/);
  const page = readPage(join(withFigma, '.design-system-engine-out', 'styleguide', 'index.html'));
  assert.doesNotMatch(page, /"name":"HbChip","cls"/, 'not one of the page\'s components');
  assert.doesNotMatch(page, /"codeOnly":\{/);
  assert.match(page, /"notInFigma":\[\{"name":"HbChip","file":"components\/HbChip.vue","scope":\{"scope":"shared","reason":"Shared: HbChip is the system's: [^"]*"/, 'a task, with whether it is local or shared');
  // A page for it alone says where it is instead.
  const one = run(withFigma, '--component', 'HbChip');
  assert.match(one.stdout, /HbChip: in the code and not in Figma, so not on the page; a task on the whole system's Status page\./, one.stdout + one.stderr);
  assert.doesNotMatch(one.stdout, /HbChip: not a component of this system/);
  // By default it has its page, marked Only in the code.
  const shown = tempDir('sg-show-code-only-');
  cpSync(HARBOR, shown, { recursive: true });
  writeFileSync(join(shown, 'components', 'HbChip.vue'), chipVue);
  const s = run(shown);
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(s.stdout, /\(3 components agreed, 1 only in the code · the engine's template\)/);
  const shownPage = readPage(join(shown, '.design-system-engine-out', 'styleguide', 'index.html'));
  assert.match(shownPage, /"name":"HbChip","cls":"hb-chip"[^}]*"markup":"\\u003cbutton class=\\"hb-chip\\" type=\\"button\\">Filter\\u003c\/button>","markupFrom":"vue"/);
  assert.match(shownPage, /"codeOnly":\{"file":"components\/HbChip.vue","props":\[\{"name":"tone","default":"quiet","options":\["quiet","loud"\]\},\{"name":"label","default":"Filter"\}\],"figma":true\}/);
  // Before Figma's data: the code's three components, said so.
  const noFigma = tempDir('sg-no-figma-');
  cpSync(HARBOR, noFigma, { recursive: true });
  rmSync(join(noFigma, 'figma'), { recursive: true });
  const cfg = JSON.parse(readFileSync(join(noFigma, 'ds-config.json'), 'utf8')); delete cfg.componentFiles;
  writeFileSync(join(noFigma, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const b = run(noFigma);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(b.stdout, /\(3 only in the code · the engine's template\)\n\s+No Figma data yet: these are the 3 components the code has/);
});

test('in the browser: with Figma\'s data a component only the code has has its page and menu item, and its Status row says what to do', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-code-only-tasks-');
  cpSync(HARBOR, dir, { recursive: true });
  writeFileSync(join(dir, 'components', 'HbChip.vue'), chipVue);
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#status`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `!!document.querySelector('#status .sg-matrix')`);
    // A component only the code has is built, so it is in the menu: the menu lists what the Code card counts as built,
    // one number on both (the owner's, 11 November 2026). Its Status row still says what to do about it.
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#c-HbChip"]')`), true, 'in the menu, as the Code card counts it');
    assert.equal(await run(`!!document.querySelector('#status tr.sg-mx-row.is-link[data-name="HbChip"] .sg-mx-go')`), true, 'its row opens its page');
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#c-button"]')`), true, 'Figma\'s components are');
    // A row of the table: in the code, not in Figma; a tip on its Figma cell says what to do.
    const row = await run(`(() => { const tr = document.querySelector('#status tr.sg-mx-row[data-name="HbChip"]'); if (!tr) return ''; return [...tr.cells].slice(1, 4).map((td) => (td.querySelector('.pg-par-status') || td).textContent).join('|') + '|' + tr.cells[1].textContent; })()`);
    assert.match(row, /^Missing\|Built\|N\/A/);
    assert.match(row, /components\/HbChip\.vue/);
    assert.match(row, /Add HbChip to Figma, remove it from the code, or keep it as a known exception\./);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

// Built from the code alone, the page shows what it knows: no card, column, filter or area with nothing in it. Parity
// and Documentation have nothing to count without Figma, Used in nothing before a product's pages are read, History
// nothing before a commit names the component (the owner's, 19 November 2026).
test('in the browser: built from the code alone, nothing is shown empty', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-code-alone-');
  cpSync(HARBOR, dir, { recursive: true });
  rmSync(join(dir, 'figma'), { recursive: true });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')); delete cfg.componentFiles;
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#status`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `!!document.querySelector('#status .sg-matrix') && !!document.querySelector('#status .sg-health-tile')`);
    // The cards: Code and Accessibility, never a dash over 0 of everything for Parity or Documentation.
    assert.deepEqual(await run(`[...document.querySelectorAll('#status .sg-health-label')].map((p) => p.textContent)`), ['Code', 'Accessibility']);
    // The table: no Figma, Parity or Documentation column, and no filter for them; sorted by a column that shows.
    const shown = await run(`[...document.querySelectorAll('#status .sg-matrix thead th[data-sort]')].filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.textContent.trim()).filter(Boolean)`);
    assert.deepEqual(shown, ['Component', 'Code', 'Accessibility', 'Last checked']);
    assert.deepEqual(await run(`[...document.querySelectorAll('#status .sg-chip-label')].map((s) => s.textContent)`), ['Code', 'Accessibility']);
    assert.equal(await run(`!!document.querySelector('#status .sg-matrix th[aria-sort="descending"][data-sort="Accessibility"]')`), true, 'sorted by Accessibility');
    // A component's page: no Parity, Documentation, Used in or History area, and the Playground points to its props.
    const first = await run(`document.querySelector('.sg-nav a[href^="#c-"]').getAttribute('href')`);
    await run(`location.hash = ${JSON.stringify(first)}`);
    await waitForTrue(send, sessionId, `!!document.querySelector('${first} .pg-areas [data-v]')`);
    const tabs = await run(`[...document.querySelectorAll('${first} .pg-areas [data-v]')].map((b) => b.dataset.v)`);
    for (const gone of ['parity', 'docs', 'used', 'log']) {
      assert.equal(tabs.includes(gone), false, `no ${gone} tab: ${tabs}`);
      assert.equal(await run(`!!document.querySelector('${first} .pg-area[data-area="${gone}"]')`), false, `no ${gone} area`);
    }
    assert.ok(tabs.includes('play') && tabs.includes('api'), tabs.join(' '));
    assert.match(await run(`document.querySelector('${first} .pg-controls').textContent`), /Its props are under Code|Its code declares no props/);
    assert.doesNotMatch(await run(`document.querySelector('${first}').textContent`), /none in Figma/);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('with no Figma data and no component in the code, the style guide says there is nothing to compare, never that they agree', { timeout: budget(300000) }, () => {
  const dir = tempDir('sg-nothing-');
  cpSync(HARBOR, dir, { recursive: true });
  rmSync(join(dir, 'figma'), { recursive: true });
  rmSync(join(dir, 'components'), { recursive: true });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')); delete cfg.componentFiles;
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.match(r.stdout, /No Figma data yet, and no component found in the code: nothing to compare\./, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /Figma and the code agree on everything/);
});

// A Lit, an Angular or a plain Web Component is drawn by the project's own build. When that build cannot run, the
// pages used to show nothing at all for it, where a Vue or a React component falls back to the markup its own source
// holds. The code's grammar had read a class component's template all along (templateOf, templateUrl included) and the
// style guide never asked it for one. Plain Web Components had no test at the control center either, only at the reader.
test('a Web Component whose build cannot run still shows the markup its own source holds, without its shadow styles', { timeout: budget(300000) }, () => {
  const dir = tempDir('sg-wc-');
  mkdirSync(join(dir, 'src', 'components'), { recursive: true });
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme-wc', private: true, type: 'module' }));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { themeCSS: 'src/styles/tokens.css', plugins: [], pluginCSS: [] } }, null, 2));
  writeFileSync(join(dir, 'src', 'styles', 'tokens.css'), ':root { --acme-accent: #2563eb; }\n.acmeTag { padding: 4px 8px; border-radius: 4px; }\n');
  // No node_modules, so the project has no build to draw it with: the case this is about.
  writeFileSync(join(dir, 'src', 'components', 'acme-tag.js'), `/** A small label for a status. */
class AcmeTag extends HTMLElement {
  static get observedAttributes() { return ['tone']; }
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() { this.render(); }
  render() { this.shadowRoot.innerHTML = \`<style>:host { display: inline-block } .acmeTag { outline: 2px solid red }</style><span class="acmeTag" data-tone="\${this.getAttribute('tone') ?? 'quiet'}"><slot></slot></span>\`; }
}
customElements.define('acme-tag', AcmeTag);`);
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // The build says it could not draw them, which is the case the fallback is for.
  assert.match(r.stdout, /not drawn: the project has no Vite/, r.stdout);
  const page = readPage(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'));
  assert.match(page, /acme-tag/, 'the component is on the page');
  const markup = /"markup":"((?:[^"\\]|\\.)*)"/.exec(page)?.[1] ?? '';
  assert.match(markup, /span class=/, `its own markup is shown: ${markup.slice(0, 160)}`);
  assert.doesNotMatch(markup, /style>/, 'the styles of its shadow root are the component\'s, never the page\'s');
  assert.doesNotMatch(markup, /outline: 2px solid red/, 'a rule of the component never reaches the page as markup');
});
